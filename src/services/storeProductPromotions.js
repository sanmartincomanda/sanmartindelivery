import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';

export const STORE_PRODUCT_PROMOTIONS_PATH = 'storeProductPromotions';

const normalizePromotionId = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizePromotionDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
};

const normalizePromotionCodes = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,;]+/);

  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const sortProductPromotions = (left, right) =>
  Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
  Number(right.discountPct || 0) - Number(left.discountPct || 0) ||
  String(left.title || '').localeCompare(String(right.title || ''), 'es', {
    sensitivity: 'base',
  });

export const getStoreProductPromotionKey = (id) =>
  normalizePromotionId(id).replace(/[.#$/[\]]/g, '_');

export const normalizeStoreProductPromotion = (promotion = {}, fallback = {}, index = 0) => {
  const source = promotion || {};
  const backup = fallback || {};
  const title = String(source.title ?? backup.title ?? '').trim();
  const id = normalizePromotionId(source.id ?? backup.id ?? title);
  const productCodes = normalizePromotionCodes(source.productCodes ?? backup.productCodes);
  const discountPct = Math.min(100, Math.max(0, Number(source.discountPct ?? backup.discountPct ?? 0) || 0));

  return {
    id,
    title: title || id,
    productCodes,
    discountPct: roundMoney(discountPct),
    active: source.active ?? backup.active ?? true,
    deleted: source.deleted ?? backup.deleted ?? false,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? (index + 1) * 10),
    startsAt: normalizePromotionDate(source.startsAt ?? backup.startsAt),
    endsAt: normalizePromotionDate(source.endsAt ?? backup.endsAt),
  };
};

export const mergeStoreProductPromotions = (remotePromotions = {}) =>
  Object.values(remotePromotions || {})
    .filter(Boolean)
    .map((promotion, index) => normalizeStoreProductPromotion(promotion, {}, index))
    .filter((promotion) => promotion.id && promotion.deleted !== true)
    .sort(sortProductPromotions);

export const getStoreProductPromotionStatus = (promotion, now = Date.now()) => {
  const normalized = normalizeStoreProductPromotion(promotion);
  const currentTime = Number(now || Date.now());
  const startsAt = normalized.startsAt ? new Date(normalized.startsAt).getTime() : 0;
  const endsAt = normalized.endsAt ? new Date(normalized.endsAt).getTime() : 0;

  if (
    !normalized.id ||
    normalized.active === false ||
    normalized.deleted === true ||
    normalized.discountPct <= 0 ||
    normalized.productCodes.length === 0
  ) {
    return 'inactive';
  }

  if (startsAt && currentTime < startsAt) {
    return 'scheduled';
  }

  if (endsAt && currentTime >= endsAt) {
    return 'expired';
  }

  return 'active';
};

export const isStoreProductPromotionActive = (promotion, now = Date.now()) =>
  getStoreProductPromotionStatus(promotion, now) === 'active';

export const resolveStoreProductPromotionForCode = (code = '', promotions = [], now = Date.now()) => {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) {
    return null;
  }

  const matches = (Array.isArray(promotions) ? promotions : [])
    .map((promotion, index) => normalizeStoreProductPromotion(promotion, {}, index))
    .filter(
      (promotion) =>
        isStoreProductPromotionActive(promotion, now) &&
        promotion.productCodes.includes(cleanCode)
    )
    .sort((left, right) => {
      if (Number(right.discountPct || 0) !== Number(left.discountPct || 0)) {
        return Number(right.discountPct || 0) - Number(left.discountPct || 0);
      }

      return sortProductPromotions(left, right);
    });

  return matches[0] || null;
};

export const applyStoreProductPromotionsToCatalog = (catalog = [], promotions = [], now = Date.now()) =>
  (Array.isArray(catalog) ? catalog : []).map((product) => {
    const promotion = resolveStoreProductPromotionForCode(product?.code, promotions, now);
    const basePrice = roundMoney(product?.price || 0);

    if (!promotion || basePrice <= 0) {
      return {
        ...product,
        originalPrice: basePrice,
        specialPromotion: null,
        hasSpecialPromotion: false,
      };
    }

    const discountedPrice = roundMoney(basePrice * (1 - Number(promotion.discountPct || 0) / 100));

    return {
      ...product,
      originalPrice: basePrice,
      price: discountedPrice,
      specialPromotion: {
        id: promotion.id,
        title: promotion.title,
        discountPct: Number(promotion.discountPct || 0),
        startsAt: promotion.startsAt,
        endsAt: promotion.endsAt,
        sortOrder: Number(promotion.sortOrder || 0),
      },
      hasSpecialPromotion: discountedPrice < basePrice,
    };
  });

export async function saveStoreProductPromotion(promotion, existingPromotion = null) {
  const normalized = {
    ...normalizeStoreProductPromotion(promotion, existingPromotion || {}),
    deleted: false,
  };

  if (!normalized.id || !normalized.title) {
    throw new Error('La promocion necesita titulo.');
  }

  if (normalized.discountPct <= 0) {
    throw new Error('Define un porcentaje de descuento mayor a 0.');
  }

  if (normalized.productCodes.length === 0) {
    throw new Error('Selecciona al menos un articulo para la promocion.');
  }

  await set(
    ref(database, `${STORE_PRODUCT_PROMOTIONS_PATH}/${getStoreProductPromotionKey(normalized.id)}`),
    normalized
  );

  return normalized;
}

export async function updateStoreProductPromotion(id, patch = {}) {
  const promotionKey = getStoreProductPromotionKey(id);
  if (!promotionKey) {
    throw new Error('Promocion invalida.');
  }

  const normalizedPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'startsAt')) {
    normalizedPatch.startsAt = normalizePromotionDate(normalizedPatch.startsAt);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'endsAt')) {
    normalizedPatch.endsAt = normalizePromotionDate(normalizedPatch.endsAt);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'productCodes')) {
    normalizedPatch.productCodes = normalizePromotionCodes(normalizedPatch.productCodes);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'discountPct')) {
    normalizedPatch.discountPct = roundMoney(
      Math.min(100, Math.max(0, Number(normalizedPatch.discountPct || 0) || 0))
    );
  }

  await update(ref(database, `${STORE_PRODUCT_PROMOTIONS_PATH}/${promotionKey}`), normalizedPatch);
}

export async function deleteStoreProductPromotion(id) {
  const promotionKey = getStoreProductPromotionKey(id);
  if (!promotionKey) {
    throw new Error('Promocion invalida.');
  }

  await set(ref(database, `${STORE_PRODUCT_PROMOTIONS_PATH}/${promotionKey}`), {
    id: normalizePromotionId(id),
    deleted: true,
    active: false,
  });
}

export async function cleanupExpiredStoreProductPromotions() {
  const snapshot = await get(ref(database, STORE_PRODUCT_PROMOTIONS_PATH));
  const promotions = mergeStoreProductPromotions(snapshot.val());
  const expiredPromotions = promotions.filter(
    (promotion) => getStoreProductPromotionStatus(promotion) === 'expired'
  );

  if (expiredPromotions.length === 0) {
    return 0;
  }

  const updates = {};
  expiredPromotions.forEach((promotion) => {
    updates[getStoreProductPromotionKey(promotion.id)] = {
      id: normalizePromotionId(promotion.id),
      deleted: true,
      active: false,
    };
  });

  await update(ref(database, STORE_PRODUCT_PROMOTIONS_PATH), updates);
  return expiredPromotions.length;
}
