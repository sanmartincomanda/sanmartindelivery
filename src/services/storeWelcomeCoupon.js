import { get, ref, runTransaction, update } from 'firebase/database';
import { database } from '../firebase';
import { normalizeStoreCoupon } from './storeCoupons';

export const STORE_WELCOME_COUPON_CAMPAIGN_PATH = 'storeCampaigns/welcomeCoupon200';
export const STORE_WELCOME_COUPON_CAMPAIGN_ID = 'welcome_coupon_200_granada_jun2026';
export const STORE_WELCOME_COUPON_LIMIT = 55;
export const STORE_WELCOME_COUPON_AMOUNT = 200;
export const STORE_WELCOME_COUPON_MINIMUM = 700;

const cleanPhoneDigits = (value = '') => String(value || '').replace(/\D/g, '');

const normalizeCodeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const buildWelcomeCouponCode = ({ slotNumber = 0, phone = '', userKey = '' }) => {
  const slotToken = String(Math.max(1, Number(slotNumber || 0))).padStart(2, '0');
  const phoneToken = cleanPhoneDigits(phone).slice(-4) || 'WEB0';
  const userToken = normalizeCodeText(userKey).slice(-3) || 'USR';
  return `TV200-${slotToken}${phoneToken}-${userToken}`;
};

const buildWelcomeCouponPayload = ({ slotNumber = 0, userKey = '', phone = '' }) =>
  normalizeStoreCoupon({
    code: buildWelcomeCouponCode({ slotNumber, phone, userKey }),
    title: 'Cupon bienvenida C$200',
    type: 'amount',
    value: STORE_WELCOME_COUPON_AMOUNT,
    minimum: STORE_WELCOME_COUPON_MINIMUM,
    maxUsesPerUser: 1,
    active: true,
    notes: 'Valido para tu siguiente compra minima de C$700.',
    assignedUserKey: String(userKey || '').trim(),
    campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
    autoApply: true,
    personal: true,
    welcomeCoupon: true,
  });

export const normalizeStoreWelcomeCoupon = (value = {}) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const slotNumber = Math.max(0, Math.trunc(Number(value.slotNumber || value.slot || 0)));
  const coupon = normalizeStoreCoupon(value.coupon || {});

  if (!slotNumber || !coupon.code) {
    return null;
  }

  return {
    campaignId: String(value.campaignId || STORE_WELCOME_COUPON_CAMPAIGN_ID).trim(),
    slotNumber,
    assignedUserKey: String(value.assignedUserKey || coupon.assignedUserKey || '').trim(),
    assignedAt: Math.max(0, Number(value.assignedAt || 0)),
    claimedAt: Math.max(0, Number(value.claimedAt || 0)),
    usedAt: Math.max(0, Number(value.usedAt || 0)),
    lastOrderKey: String(value.lastOrderKey || '').trim(),
    status: String(value.status || (value.claimedAt ? 'claimed' : 'available')).trim() || 'available',
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

  if (Number(usedCount || 0) >= Math.max(1, Number(normalized.coupon?.maxUsesPerUser || 1))) {
    return 'used';
  }

  if (normalized.usedAt > 0 || normalized.status === 'used') {
    return 'used';
  }

  if (normalized.claimedAt > 0 || normalized.status === 'claimed') {
    return 'claimed';
  }

  return 'available';
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
  if (existingWelcomeCoupon) {
    return existingWelcomeCoupon;
  }

  let assignedSlotNumber = 0;
  const now = Date.now();
  const campaignRef = ref(databaseInstance, STORE_WELCOME_COUPON_CAMPAIGN_PATH);

  const transactionResult = await runTransaction(campaignRef, (currentValue) => {
    const currentCampaign = currentValue && typeof currentValue === 'object' ? currentValue : {};
    const assignments =
      currentCampaign.assignments && typeof currentCampaign.assignments === 'object'
        ? { ...currentCampaign.assignments }
        : {};
    const existingAssignment = assignments[cleanUserKey];

    if (existingAssignment) {
      assignedSlotNumber = Math.max(
        0,
        Math.trunc(Number(existingAssignment.slotNumber || existingAssignment.slot || 0))
      );
      return {
        campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
        limit: STORE_WELCOME_COUPON_LIMIT,
        amount: STORE_WELCOME_COUPON_AMOUNT,
        minimumPurchase: STORE_WELCOME_COUPON_MINIMUM,
        active: currentCampaign.active !== false,
        assignedCount: Math.max(assignedSlotNumber, Math.trunc(Number(currentCampaign.assignedCount || 0))),
        createdAt: Number(currentCampaign.createdAt || now),
        updatedAt: now,
        assignments,
      };
    }

    const active = currentCampaign.active !== false;
    const assignedCount = Math.max(0, Math.trunc(Number(currentCampaign.assignedCount || 0)));
    if (!active || assignedCount >= STORE_WELCOME_COUPON_LIMIT) {
      return {
        campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
        limit: STORE_WELCOME_COUPON_LIMIT,
        amount: STORE_WELCOME_COUPON_AMOUNT,
        minimumPurchase: STORE_WELCOME_COUPON_MINIMUM,
        active,
        assignedCount,
        createdAt: Number(currentCampaign.createdAt || now),
        updatedAt: now,
        assignments,
      };
    }

    assignedSlotNumber = assignedCount + 1;
    assignments[cleanUserKey] = {
      slotNumber: assignedSlotNumber,
      assignedAt: now,
      customerName: String(name || '').trim(),
      phoneSuffix: cleanPhoneDigits(phone).slice(-4),
    };

    return {
      campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
      limit: STORE_WELCOME_COUPON_LIMIT,
      amount: STORE_WELCOME_COUPON_AMOUNT,
      minimumPurchase: STORE_WELCOME_COUPON_MINIMUM,
      active,
      assignedCount: assignedSlotNumber,
      createdAt: Number(currentCampaign.createdAt || now),
      updatedAt: now,
      assignments,
    };
  });

  const campaignValue = transactionResult.snapshot.val() || {};
  const assignedEntry = campaignValue.assignments?.[cleanUserKey];
  const slotNumber = Math.max(
    0,
    Math.trunc(Number(assignedEntry?.slotNumber || assignedEntry?.slot || assignedSlotNumber || 0))
  );

  if (!slotNumber) {
    return null;
  }

  const welcomeCoupon = normalizeStoreWelcomeCoupon({
    campaignId: STORE_WELCOME_COUPON_CAMPAIGN_ID,
    slotNumber,
    assignedUserKey: cleanUserKey,
    assignedAt: Number(assignedEntry?.assignedAt || now),
    claimedAt: 0,
    usedAt: 0,
    status: 'available',
    amount: STORE_WELCOME_COUPON_AMOUNT,
    minimumPurchase: STORE_WELCOME_COUPON_MINIMUM,
    coupon: buildWelcomeCouponPayload({
      slotNumber,
      userKey: cleanUserKey,
      phone,
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
