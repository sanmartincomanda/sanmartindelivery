import { get, ref, update } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const STORE_USERS_PATH = 'storeUsers';
const STORE_WELCOME_COUPON_CAMPAIGN_PATH = 'storeCampaigns/welcomeCoupon200';
const STORE_WELCOME_COUPON_CAMPAIGN_ID = 'welcome_coupon_200_granada_jun2026';
const applyChanges = process.argv.includes('--apply');

const normalizeInteger = (value, fallback = 0, minimum = 0) => {
  const numeric = Math.trunc(Number(value));
  if (Number.isFinite(numeric)) {
    return Math.max(minimum, numeric);
  }

  return Math.max(minimum, Math.trunc(Number(fallback) || 0));
};

const normalizeStoreWelcomeCouponCampaign = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const rawAssignments =
    source.assignments && typeof source.assignments === 'object' ? source.assignments : {};
  const assignments = Object.entries(rawAssignments || {}).reduce((accumulator, [userKey, assignment]) => {
    const cleanUserKey = String(userKey || '').trim();
    if (!cleanUserKey) {
      return accumulator;
    }

    accumulator[cleanUserKey] = {
      slotNumber: normalizeInteger(assignment?.slotNumber ?? assignment?.slot, 0, 0),
      assignedAt: Math.max(0, Number(assignment?.assignedAt || 0)),
    };
    return accumulator;
  }, {});

  return {
    campaignId: String(source.campaignId || STORE_WELCOME_COUPON_CAMPAIGN_ID).trim(),
    active: source.active !== false,
    assignedCount: normalizeInteger(source.assignedCount, 0, 0),
    limit: normalizeInteger(source.limit, 0, 0),
    assignments,
  };
};

const normalizeStoreWelcomeCoupon = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const slotNumber = Math.max(0, Math.trunc(Number(value.slotNumber || value.slot || 0)));
  const assignedAt = Math.max(0, Number(value.assignedAt || 0));
  const couponCode = String(value?.coupon?.code || '').trim();
  const assignedUserKey = String(value.assignedUserKey || value?.coupon?.assignedUserKey || '').trim();

  if (!slotNumber || !couponCode) {
    return null;
  }

  return {
    slotNumber,
    assignedAt,
    assignedUserKey,
    status: String(value.status || '').trim(),
    coupon: {
      code: couponCode,
    },
  };
};

const formatDateTime = (value = 0) => {
  const timestamp = Number(value || 0);
  if (timestamp <= 0) {
    return '-';
  }

  return new Date(timestamp).toLocaleString('es-NI', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const isInvalidWelcomeCoupon = ({ userKey, welcomeCoupon, assignments }) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return false;
  }

  const assignment = assignments?.[userKey] || null;
  if (!assignment?.slotNumber) {
    return true;
  }

  return (
    Number(normalized.slotNumber || 0) !== Number(assignment.slotNumber || 0) ||
    Number(normalized.assignedAt || 0) !== Number(assignment.assignedAt || 0) ||
    String(normalized.assignedUserKey || '').trim() !== String(userKey || '').trim()
  );
};

async function main() {
  await ensureAuthenticatedFirebaseSession();
  const database = getAuthenticatedFirebaseDatabase();

  const [campaignSnapshot, usersSnapshot] = await Promise.all([
    get(ref(database, STORE_WELCOME_COUPON_CAMPAIGN_PATH)),
    get(ref(database, STORE_USERS_PATH)),
  ]);

  const campaign = normalizeStoreWelcomeCouponCampaign(campaignSnapshot.val() || {});
  const storeUsers = usersSnapshot.val() || {};
  const invalidUsers = Object.entries(storeUsers)
    .map(([userKey, user]) => ({ userKey, user, welcomeCoupon: normalizeStoreWelcomeCoupon(user?.welcomeCoupon) }))
    .filter(({ userKey, welcomeCoupon }) =>
      isInvalidWelcomeCoupon({
        userKey,
        welcomeCoupon,
        assignments: campaign.assignments,
      })
    );

  console.log(`Campana ${campaign.campaignId || '-'} | activa=${campaign.active !== false} | asignados=${campaign.assignedCount}/${campaign.limit}`);
  console.log(`Cupones invalidos detectados: ${invalidUsers.length}`);

  invalidUsers.forEach(({ userKey, user, welcomeCoupon }) => {
    console.log(
      [
        `${String(user?.nombre || 'Cliente').trim()} [${userKey}]`,
        `telefono=${String(user?.telefono || '').trim() || '-'}`,
        `codigo=${String(welcomeCoupon?.coupon?.code || '').trim() || '-'}`,
        `slot=${Number(welcomeCoupon?.slotNumber || 0)}`,
        `asignado=${formatDateTime(welcomeCoupon?.assignedAt)}`,
        `estado=${String(welcomeCoupon?.status || '').trim() || '-'}`,
      ].join(' | ')
    );
  });

  if (!applyChanges) {
    console.log('Modo reporte. Ejecuta con --apply para limpiar los cupones invalidos.');
    return;
  }

  for (const { userKey } of invalidUsers) {
    await update(ref(database, `${STORE_USERS_PATH}/${userKey}`), {
      welcomeCoupon: null,
    });
  }

  console.log(`Cupones limpiados: ${invalidUsers.length}`);
}

main().catch((error) => {
  console.error('Fallo la limpieza de cupones invalidos:', error);
  process.exitCode = 1;
});
