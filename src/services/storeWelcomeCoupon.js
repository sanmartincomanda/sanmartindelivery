import { get, onValue, ref, runTransaction, set, update } from 'firebase/database';
import { database } from '../firebase.js';
import { isStoreCouponExpired, normalizeStoreCoupon } from './storeCoupons.js';

export const STORE_WELCOME_COUPON_CAMPAIGN_PATH = 'storeCampaigns/welcomeCoupon200';
export const STORE_WELCOME_COUPON_CAMPAIGN_ID = 'welcome_coupon_200_granada_jun2026';
export const STORE_WELCOME_COUPON_LIMIT = 55;
export const STORE_WELCOME_COUPON_AMOUNT = 200;
export const STORE_WELCOME_COUPON_MINIMUM = 700;
export const STORE_WELCOME_COUPON_VALID_DAYS = 10;
const STORE_WELCOME_COUPON_VALID_MS = STORE_WELCOME_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000;

const cleanPhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');

const normalizeCodeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const normalizeInteger = (value, fallback = 0, minimum = 0) => {
  const numeric = Math.trunc(Number(value));
  if (Number.isFinite(numeric)) {
    return Math.max(minimum, numeric);
  }

  return Math.max(minimum, Math.trunc(Number(fallback) || 0));
};

const normalizeMoney = (value, fallback = 0) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Number(numeric.toFixed(2)));
  }

  return Math.max(0, Number(Number(fallback || 0).toFixed(2)));
};

const resolveWelcomeCouponExpiresAt = (assignedAt = 0) => {
  const baseAssignedAt = Math.max(0, Number(assignedAt || 0));
  if (baseAssignedAt <= 0) {
    return 0;
  }

  return baseAssignedAt + STORE_WELCOME_COUPON_VALID_MS;
};

export const buildDefaultStoreWelcomeCouponCampaign = (overrides = {}) => ({
  campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
  limit: STORE_WELCOME_COUPON_LIMIT,
  amount: STORE_WELCOME_COUPON_AMOUNT,
  minimumPurchase: STORE_WELCOME_COUPON_MINIMUM,
  active: true,
  assignedCount: 0,
  createdAt: 0,
  updatedAt: 0,
  assignments: {},
  ...(overrides || {}),
});

export const normalizeStoreWelcomeCouponCampaign = (value = {}, fallback = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const backup = fallback && typeof fallback === 'object' ? fallback : {};
  const defaults = buildDefaultStoreWelcomeCouponCampaign();
  const rawAssignments =
    source.assignments && typeof source.assignments === 'object'
      ? source.assignments
      : backup.assignments && typeof backup.assignments === 'object'
        ? backup.assignments
        : defaults.assignments;
  const assignments = Object.entries(rawAssignments || {}).reduce((accumulator, [userKey, assignment]) => {
    const cleanUserKey = String(userKey || '').trim();
    if (!cleanUserKey) {
      return accumulator;
    }

    accumulator[cleanUserKey] = {
      slotNumber: normalizeInteger(assignment?.slotNumber ?? assignment?.slot, 0, 0),
      assignedAt: Math.max(0, Number(assignment?.assignedAt || 0)),
      customerName: String(assignment?.customerName || '').trim(),
      phoneSuffix: String(assignment?.phoneSuffix || '').trim(),
    };
    return accumulator;
  }, {});
  const fallbackAssignedCount = Object.values(assignments).reduce(
    (maxValue, assignment) => Math.max(maxValue, normalizeInteger(assignment.slotNumber, 0, 0)),
    0
  );

  return {
    campaignId:
      String(source.campaignId || backup.campaignId || defaults.campaignId).trim() ||
      STORE_WELCOME_COUPON_CAMPAIGN_ID,
    limit: normalizeInteger(source.limit, backup.limit ?? defaults.limit, 1),
    amount: normalizeMoney(source.amount, backup.amount ?? defaults.amount),
    minimumPurchase: normalizeMoney(
      source.minimumPurchase,
      backup.minimumPurchase ?? defaults.minimumPurchase
    ),
    active: source.active !== undefined ? source.active !== false : backup.active !== false,
    assignedCount: normalizeInteger(
      source.assignedCount,
      backup.assignedCount ?? fallbackAssignedCount,
      0
    ),
    createdAt: Math.max(0, Number(source.createdAt ?? backup.createdAt ?? defaults.createdAt ?? 0)),
    updatedAt: Math.max(0, Number(source.updatedAt ?? backup.updatedAt ?? defaults.updatedAt ?? 0)),
    assignments,
  };
};

export const isStoreWelcomeCouponCampaignOpen = (campaign = {}) => {
  const normalized = normalizeStoreWelcomeCouponCampaign(campaign, buildDefaultStoreWelcomeCouponCampaign());
  const assignedCount = Math.max(0, Math.trunc(Number(normalized.assignedCount || 0)));
  const limit = Math.max(1, Math.trunc(Number(normalized.limit || STORE_WELCOME_COUPON_LIMIT)));
  return normalized.active !== false && assignedCount < limit;
};

export const subscribeStoreWelcomeCouponCampaign = (
  onData,
  onError,
  databaseInstance = database
) =>
  onValue(
    ref(databaseInstance, STORE_WELCOME_COUPON_CAMPAIGN_PATH),
    (snapshot) => {
      onData(
        normalizeStoreWelcomeCouponCampaign(
          snapshot.val() || {},
          buildDefaultStoreWelcomeCouponCampaign()
        )
      );
    },
    onError
  );

export async function saveStoreWelcomeCouponCampaign(campaign = {}, databaseInstance = database) {
  const now = Date.now();
  const normalized = normalizeStoreWelcomeCouponCampaign(
    {
      ...campaign,
      updatedAt: now,
    },
    buildDefaultStoreWelcomeCouponCampaign({
      createdAt: now,
      updatedAt: now,
    })
  );

  const persistedCampaign = {
    ...normalized,
    createdAt: Number(normalized.createdAt || now),
    updatedAt: now,
  };

  await set(ref(databaseInstance, STORE_WELCOME_COUPON_CAMPAIGN_PATH), persistedCampaign);
  return persistedCampaign;
}

const buildWelcomeCouponCode = ({ slotNumber = 0, phone = '', userKey = '' }) => {
  const slotToken = String(Math.max(1, Number(slotNumber || 0))).padStart(2, '0');
  const phoneToken = cleanPhoneDigits(phone).slice(-4) || 'WEB0';
  const userToken = normalizeCodeText(userKey).slice(-3) || 'USR';
  return `TV200-${slotToken}${phoneToken}-${userToken}`;
};

const buildWelcomeCouponPayload = ({
  slotNumber = 0,
  userKey = '',
  phone = '',
  amount = STORE_WELCOME_COUPON_AMOUNT,
  minimumPurchase = STORE_WELCOME_COUPON_MINIMUM,
  campaignId = STORE_WELCOME_COUPON_CAMPAIGN_ID,
  assignedAt = 0,
} = {}) =>
  normalizeStoreCoupon({
    code: buildWelcomeCouponCode({ slotNumber, phone, userKey }),
    title: 'Cupon bienvenida C$200',
    type: 'amount',
    value: amount,
    minimum: minimumPurchase,
    maxUsesPerUser: 1,
    active: true,
    notes: 'Valido para tu siguiente compra minima de C$700.',
    assignedUserKey: String(userKey || '').trim(),
    campaignId,
    autoApply: true,
    personal: true,
    welcomeCoupon: true,
    createdAt: Math.max(0, Number(assignedAt || 0)),
    createdAtIso: Number(assignedAt || 0) > 0 ? new Date(Number(assignedAt || 0)).toISOString() : '',
    expiresAt: resolveWelcomeCouponExpiresAt(assignedAt),
    expiresAtIso:
      resolveWelcomeCouponExpiresAt(assignedAt) > 0
        ? new Date(resolveWelcomeCouponExpiresAt(assignedAt)).toISOString()
        : '',
  });

const normalizeWelcomeCouponStatus = (value = '') => {
  const cleanStatus = String(value || '').trim().toLowerCase();

  if (cleanStatus === 'reserved' || cleanStatus === 'used' || cleanStatus === 'claimed' || cleanStatus === 'expired') {
    return cleanStatus;
  }

  return 'available';
};

export const isStoreWelcomeCouponCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase()
    .startsWith('TV200-');

export const isStoreWelcomeCouponCoupon = (value = {}) => {
  const coupon = value && typeof value === 'object' ? value : {};
  return (
    coupon.welcomeCoupon === true ||
    String(coupon.campaignId || '').trim() === STORE_WELCOME_COUPON_CAMPAIGN_ID ||
    isStoreWelcomeCouponCode(coupon.code)
  );
};

export const normalizeStoreWelcomeCoupon = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const slotNumber = Math.max(0, Math.trunc(Number(value.slotNumber || value.slot || 0)));
  const assignedAt = Math.max(0, Number(value.assignedAt || value.coupon?.createdAt || 0));
  const expiresAt = Math.max(
    0,
    Number(value.expiresAt || value.coupon?.expiresAt || resolveWelcomeCouponExpiresAt(assignedAt))
  );
  const coupon = normalizeStoreCoupon(value.coupon || {}, {
    createdAt: assignedAt,
    createdAtIso: assignedAt > 0 ? new Date(assignedAt).toISOString() : '',
    expiresAt,
    expiresAtIso: expiresAt > 0 ? new Date(expiresAt).toISOString() : '',
  });

  if (!slotNumber || !coupon.code) {
    return null;
  }

  return {
    campaignId: String(value.campaignId || STORE_WELCOME_COUPON_CAMPAIGN_ID).trim(),
    slotNumber,
    assignedUserKey: String(value.assignedUserKey || coupon.assignedUserKey || '').trim(),
    assignedAt,
    expiresAt,
    expiresAtIso: String(
      value.expiresAtIso || coupon.expiresAtIso || (expiresAt > 0 ? new Date(expiresAt).toISOString() : '')
    ).trim(),
    claimedAt: Math.max(0, Number(value.claimedAt || 0)),
    reservedAt: Math.max(0, Number(value.reservedAt || 0)),
    usedAt: Math.max(0, Number(value.usedAt || 0)),
    lastOrderKey: String(value.lastOrderKey || '').trim(),
    status: normalizeWelcomeCouponStatus(value.status || (value.claimedAt ? 'claimed' : 'available')),
    amount: Math.max(0, Number(value.amount || coupon.value || STORE_WELCOME_COUPON_AMOUNT)),
    minimumPurchase: Math.max(0, Number(value.minimumPurchase || coupon.minimum || STORE_WELCOME_COUPON_MINIMUM)),
    coupon,
  };
};

export const getStoreWelcomeCouponEffectiveStatus = (welcomeCoupon = null, usedCount = 0) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return 'none';
  }

  if (
    normalized.status === 'expired' ||
    isStoreCouponExpired(normalized.coupon) ||
    (normalized.expiresAt > 0 && Date.now() > normalized.expiresAt)
  ) {
    return 'expired';
  }

  if (Number(usedCount || 0) >= Math.max(1, Number(normalized.coupon?.maxUsesPerUser || 1))) {
    return 'used';
  }

  if (normalized.usedAt > 0 || normalized.status === 'used' || normalized.status === 'reserved') {
    return 'used';
  }

  if (normalized.claimedAt > 0 || normalized.status === 'claimed') {
    return 'claimed';
  }

  return 'available';
};

export const buildStoreWelcomeCouponReservationState = ({
  welcomeCoupon,
  orderKey = '',
  reservedAt = Date.now(),
} = {}) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return null;
  }

  return normalizeStoreWelcomeCoupon({
    ...normalized,
    reservedAt: Math.max(0, Number(reservedAt || Date.now())),
    usedAt: 0,
    lastOrderKey: String(orderKey || '').trim(),
    status: 'reserved',
  });
};

export const buildStoreWelcomeCouponUsedState = ({
  welcomeCoupon,
  orderKey = '',
  usedAt = Date.now(),
} = {}) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return null;
  }

  return normalizeStoreWelcomeCoupon({
    ...normalized,
    reservedAt: Math.max(0, Number(normalized.reservedAt || usedAt || Date.now())),
    usedAt: Math.max(0, Number(usedAt || Date.now())),
    lastOrderKey: String(orderKey || normalized.lastOrderKey || '').trim(),
    status: 'used',
  });
};

export const buildStoreWelcomeCouponReleasedState = ({
  welcomeCoupon,
  releasedAt = Date.now(),
} = {}) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return null;
  }

  return normalizeStoreWelcomeCoupon({
    ...normalized,
    reservedAt: 0,
    usedAt: 0,
    lastOrderKey: '',
    status: normalized.claimedAt > 0 ? 'claimed' : 'available',
    updatedAt: Math.max(0, Number(releasedAt || Date.now())),
  });
};

export async function ensureStoreWelcomeCouponForUser({
  userKey,
  phone,
  name = '',
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  if (!cleanUserKey) {
    return null;
  }

  const userRef = ref(databaseInstance, `storeUsers/${cleanUserKey}`);
  const userSnapshot = await get(userRef);
  const existingWelcomeCoupon = normalizeStoreWelcomeCoupon(userSnapshot.val()?.welcomeCoupon);
  const now = Date.now();
  const campaignRef = ref(databaseInstance, STORE_WELCOME_COUPON_CAMPAIGN_PATH);
  const campaignSnapshot = await get(campaignRef);
  const currentCampaign = normalizeStoreWelcomeCouponCampaign(
    campaignSnapshot.val() || {},
    buildDefaultStoreWelcomeCouponCampaign({
      createdAt: now,
      updatedAt: now,
    })
  );
  const existingAssignment = currentCampaign.assignments?.[cleanUserKey] || null;
  const hasExistingAssignment = Boolean(existingAssignment?.slotNumber);

  if (existingWelcomeCoupon) {
    if (hasExistingAssignment) {
      return existingWelcomeCoupon;
    }

    await update(userRef, {
      welcomeCoupon: null,
    }).catch(() => {});
    return null;
  }

  if (hasExistingAssignment) {
    const welcomeCoupon = normalizeStoreWelcomeCoupon({
      campaignId: currentCampaign.campaignId,
      slotNumber: existingAssignment.slotNumber,
      assignedUserKey: cleanUserKey,
      assignedAt: Number(existingAssignment.assignedAt || now),
      claimedAt: 0,
      usedAt: 0,
      status: 'available',
      amount: currentCampaign.amount,
      minimumPurchase: currentCampaign.minimumPurchase,
      coupon: buildWelcomeCouponPayload({
        slotNumber: existingAssignment.slotNumber,
        userKey: cleanUserKey,
        phone,
        amount: currentCampaign.amount,
        minimumPurchase: currentCampaign.minimumPurchase,
        campaignId: currentCampaign.campaignId,
        assignedAt: Number(existingAssignment.assignedAt || now),
      }),
    });

    await update(userRef, {
      welcomeCoupon,
    });

    return welcomeCoupon;
  }

  if (!isStoreWelcomeCouponCampaignOpen(currentCampaign)) {
    return null;
  }

  let assignedSlotNumber = 0;
  let transactionResult = null;
  try {
    transactionResult = await runTransaction(campaignRef, (currentValue) => {
      const liveCampaign = normalizeStoreWelcomeCouponCampaign(
        currentValue || {},
        buildDefaultStoreWelcomeCouponCampaign({
          createdAt: now,
          updatedAt: now,
        })
      );
      const assignments = { ...(liveCampaign.assignments || {}) };
      const active = liveCampaign.active !== false;
      const assignedCount = Math.max(0, Math.trunc(Number(liveCampaign.assignedCount || 0)));
      const limit = Math.max(1, Math.trunc(Number(liveCampaign.limit || STORE_WELCOME_COUPON_LIMIT)));

      if (!active || assignedCount >= limit) {
        return liveCampaign;
      }

      assignedSlotNumber = assignedCount + 1;
      assignments[cleanUserKey] = {
        slotNumber: assignedSlotNumber,
        assignedAt: now,
        customerName: String(name || '').trim(),
        phoneSuffix: cleanPhoneDigits(phone).slice(-4),
      };

      return {
        campaignId: liveCampaign.campaignId || STORE_WELCOME_COUPON_CAMPAIGN_ID,
        limit,
        amount: liveCampaign.amount,
        minimumPurchase: liveCampaign.minimumPurchase,
        active,
        assignedCount: assignedSlotNumber,
        createdAt: Number(liveCampaign.createdAt || now),
        updatedAt: now,
        assignments,
      };
    });
  } catch (error) {
    console.warn('No se pudo asignar el cupon de bienvenida.', error);
    return null;
  }

  if (!transactionResult?.committed) {
    return null;
  }

  const campaignValue = normalizeStoreWelcomeCouponCampaign(
    transactionResult.snapshot.val() || {},
    buildDefaultStoreWelcomeCouponCampaign({
      createdAt: now,
      updatedAt: now,
    })
  );
  const assignedEntry = campaignValue.assignments?.[cleanUserKey];
  const slotNumber = Math.max(
    0,
    Math.trunc(Number(assignedEntry?.slotNumber || assignedEntry?.slot || assignedSlotNumber || 0))
  );

  if (!slotNumber) {
    return null;
  }

  const welcomeCoupon = normalizeStoreWelcomeCoupon({
    campaignId: campaignValue.campaignId || STORE_WELCOME_COUPON_CAMPAIGN_ID,
    slotNumber,
    assignedUserKey: cleanUserKey,
    assignedAt: Number(assignedEntry?.assignedAt || now),
    expiresAt: resolveWelcomeCouponExpiresAt(Number(assignedEntry?.assignedAt || now)),
    claimedAt: 0,
    usedAt: 0,
    status: 'available',
    amount: campaignValue.amount,
    minimumPurchase: campaignValue.minimumPurchase,
    coupon: buildWelcomeCouponPayload({
      slotNumber,
      userKey: cleanUserKey,
      phone,
      amount: campaignValue.amount,
      minimumPurchase: campaignValue.minimumPurchase,
      campaignId: campaignValue.campaignId,
      assignedAt: Number(assignedEntry?.assignedAt || now),
    }),
  });

  await update(userRef, {
    welcomeCoupon,
  });

  return welcomeCoupon;
}

export async function claimStoreWelcomeCoupon({
  userKey,
  welcomeCoupon,
  databaseInstance = database,
}) {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  const cleanUserKey = String(userKey || normalized?.assignedUserKey || '').trim();

  if (!cleanUserKey || !normalized) {
    throw new Error('Cupon de bienvenida invalido.');
  }

  if (getStoreWelcomeCouponEffectiveStatus(normalized) === 'expired') {
    throw new Error('Tu cupon de bienvenida ya vencio.');
  }

  const claimedAt = Date.now();
  const nextCoupon = normalizeStoreWelcomeCoupon({
    ...normalized,
    assignedUserKey: cleanUserKey,
    claimedAt,
    status: 'claimed',
  });

  await update(ref(databaseInstance, `storeUsers/${cleanUserKey}`), {
    welcomeCoupon: nextCoupon,
  });

  return nextCoupon;
}
