import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';

export const STORE_COUPONS_PATH = 'storeCoupons';

const sanitizeCouponCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const normalizeCouponTimestamp = (value, fallback = 0) => {
  const numeric = Number(value ?? fallback ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0;
};

export const normalizeCouponCode = sanitizeCouponCode;

export const getStoreCouponKey = (code) =>
  sanitizeCouponCode(code).replace(/[.#$/[\]]/g, '_');

export const normalizeCouponUsageLimit = (value) => {
  const numeric = Math.trunc(Number(value || 0));
  return Number.isFinite(numeric) ? Math.max(numeric, 0) : 0;
};

export const normalizeStoreCoupon = (coupon = {}, fallback = {}) => {
  const source = coupon || {};
  const backup = fallback || {};
  const code = sanitizeCouponCode(source.code ?? backup.code);
  const type = source.type === 'amount' || backup.type === 'amount' ? 'amount' : 'percent';
  const createdAt = normalizeCouponTimestamp(source.createdAt, backup.createdAt);
  const expiresAt = normalizeCouponTimestamp(source.expiresAt, backup.expiresAt);

  return {
    code,
    title: String(source.title ?? backup.title ?? '').trim(),
    type,
    value: Number(source.value ?? backup.value ?? 0),
    minimum: Number(source.minimum ?? backup.minimum ?? 0),
    maxUsesPerUser: normalizeCouponUsageLimit(source.maxUsesPerUser ?? backup.maxUsesPerUser ?? 0),
    active: source.active ?? backup.active ?? true,
    notes: String(source.notes ?? backup.notes ?? '').trim(),
    assignedUserKey: String(source.assignedUserKey ?? backup.assignedUserKey ?? '').trim(),
    campaignId: String(source.campaignId ?? backup.campaignId ?? '').trim(),
    autoApply: source.autoApply ?? backup.autoApply ?? false,
    personal: source.personal ?? backup.personal ?? false,
    welcomeCoupon: source.welcomeCoupon ?? backup.welcomeCoupon ?? false,
    createdAt,
    createdAtIso: String(source.createdAtIso ?? backup.createdAtIso ?? '').trim(),
    expiresAt,
    expiresAtIso: String(source.expiresAtIso ?? backup.expiresAtIso ?? '').trim(),
  };
};

export const isStoreCouponExpired = (coupon = {}, now = Date.now()) => {
  const normalized = normalizeStoreCoupon(coupon);
  const expiresAt = normalizeCouponTimestamp(normalized.expiresAt, 0);
  if (!normalized.code || expiresAt <= 0) {
    return false;
  }

  return Number(now || Date.now()) > expiresAt;
};

export const mergeStoreCoupons = (remoteCoupons = {}) =>
  Object.values(remoteCoupons || {})
    .filter(Boolean)
    .map((coupon) => normalizeStoreCoupon(coupon))
    .filter((coupon) => coupon.code)
    .sort((left, right) => String(left.code || '').localeCompare(String(right.code || '')));

export const calculateCouponDiscount = (coupon, subtotal) => {
  const normalized = normalizeStoreCoupon(coupon);
  const amount = Number(subtotal || 0);

  if (!normalized.code || normalized.active === false || isStoreCouponExpired(normalized) || amount <= 0) {
    return 0;
  }

  if (normalized.minimum > 0 && amount < normalized.minimum) {
    return 0;
  }

  if (normalized.type === 'amount') {
    return Number(Math.min(normalized.value, amount).toFixed(2));
  }

  const percent = Math.min(Math.max(Number(normalized.value || 0), 0), 100);
  return Number(((amount * percent) / 100).toFixed(2));
};

export async function saveStoreCoupon(coupon) {
  const normalized = normalizeStoreCoupon(coupon);
  if (!normalized.code || !normalized.value) {
    throw new Error('Cupon incompleto');
  }

  await set(ref(database, `${STORE_COUPONS_PATH}/${getStoreCouponKey(normalized.code)}`), normalized);
  return normalized;
}

export async function updateStoreCoupon(code, patch) {
  const couponKey = getStoreCouponKey(code);
  if (!couponKey) {
    throw new Error('Cupon invalido');
  }

  await update(ref(database, `${STORE_COUPONS_PATH}/${couponKey}`), {
    code: sanitizeCouponCode(code),
    ...patch,
  });
}

export async function getStoreCouponsOnce() {
  const snapshot = await get(ref(database, STORE_COUPONS_PATH));
  return mergeStoreCoupons(snapshot.val());
}
