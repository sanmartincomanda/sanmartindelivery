import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { STORE_PROMOTIONS } from '../data/tiendaVirtual';
import { isDataUrlImage, uploadPromotionImage } from './storeMedia';

export const STORE_PROMOTIONS_PATH = 'storePromotions';

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

const buildDefaultStorePromotions = () =>
  STORE_PROMOTIONS.map((promotion, index) =>
    normalizeStorePromotion(
      {
        ...promotion,
        active: true,
        sortOrder: (index + 1) * 10,
      },
      {},
      index
    )
  );

const sortPromotions = (left, right) =>
  Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
  String(left.title || '').localeCompare(String(right.title || ''));

export const getStorePromotionKey = (id) => normalizePromotionId(id).replace(/[.#$/[\]]/g, '_');

export const normalizeStorePromotion = (promotion = {}, fallback = {}, index = 0) => {
  const source = promotion || {};
  const backup = fallback || {};
  const title = String(source.title ?? backup.title ?? '').trim();
  const id = normalizePromotionId(source.id ?? backup.id ?? title);

  return {
    id,
    title: title || id,
    image: String(source.image ?? backup.image ?? '').trim(),
    imageStoragePath: String(source.imageStoragePath ?? backup.imageStoragePath ?? '').trim(),
    active: source.active ?? backup.active ?? true,
    deleted: source.deleted ?? backup.deleted ?? false,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? (index + 1) * 10),
    startsAt: normalizePromotionDate(source.startsAt ?? backup.startsAt),
    endsAt: normalizePromotionDate(source.endsAt ?? backup.endsAt),
  };
};

export const mergeStorePromotions = (remotePromotions = {}, options = {}) => {
  const remoteEntries = Object.values(remotePromotions || {}).filter(Boolean);
  const includeDefaults = options.includeDefaults !== false;

  if (remoteEntries.length === 0) {
    return includeDefaults ? buildDefaultStorePromotions().sort(sortPromotions) : [];
  }

  return remoteEntries
    .map((promotion, index) => normalizeStorePromotion(promotion, {}, index))
    .filter((promotion) => promotion.id && promotion.deleted !== true)
    .sort(sortPromotions);
};

export const getStorePromotionStatus = (promotion, now = Date.now()) => {
  const normalized = normalizeStorePromotion(promotion);
  const currentTime = Number(now || Date.now());
  const startsAt = normalized.startsAt ? new Date(normalized.startsAt).getTime() : 0;
  const endsAt = normalized.endsAt ? new Date(normalized.endsAt).getTime() : 0;

  if (!normalized.id || normalized.active === false || normalized.deleted === true) {
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

export const isStorePromotionVisible = (promotion, now = Date.now()) =>
  getStorePromotionStatus(promotion, now) === 'active' &&
  Boolean(String(promotion?.image || '').trim());

export async function saveStorePromotion(promotion, existingPromotion = null) {
  const normalized = {
    ...normalizeStorePromotion(promotion, existingPromotion || {}),
    deleted: false,
  };

  if (!normalized.id || !normalized.title || !normalized.image) {
    throw new Error('La historia necesita titulo e imagen.');
  }

  let nextPromotion = normalized;
  if (isDataUrlImage(normalized.image)) {
    const uploadedImage = await uploadPromotionImage({
      id: normalized.id,
      image: normalized.image,
    });

    nextPromotion = {
      ...normalized,
      image: uploadedImage.url,
      imageStoragePath: uploadedImage.path || '',
      deleted: false,
    };
  }

  await set(ref(database, `${STORE_PROMOTIONS_PATH}/${getStorePromotionKey(nextPromotion.id)}`), nextPromotion);
  return nextPromotion;
}

export async function updateStorePromotion(id, patch = {}) {
  const promotionKey = getStorePromotionKey(id);
  if (!promotionKey) {
    throw new Error('Historia invalida.');
  }

  const normalizedPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'startsAt')) {
    normalizedPatch.startsAt = normalizePromotionDate(normalizedPatch.startsAt);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'endsAt')) {
    normalizedPatch.endsAt = normalizePromotionDate(normalizedPatch.endsAt);
  }

  await update(ref(database, `${STORE_PROMOTIONS_PATH}/${promotionKey}`), normalizedPatch);
}

export async function deleteStorePromotion(id) {
  const promotionKey = getStorePromotionKey(id);
  if (!promotionKey) {
    throw new Error('Historia invalida.');
  }

  await set(ref(database, `${STORE_PROMOTIONS_PATH}/${promotionKey}`), {
    id: normalizePromotionId(id),
    deleted: true,
    active: false,
  });
}

export async function seedDefaultStorePromotionsIfEmpty() {
  const snapshot = await get(ref(database, STORE_PROMOTIONS_PATH));
  if (snapshot.exists()) {
    return false;
  }

  const updates = {};
  buildDefaultStorePromotions().forEach((promotion) => {
    updates[getStorePromotionKey(promotion.id)] = promotion;
  });

  await set(ref(database, STORE_PROMOTIONS_PATH), updates);
  return true;
}

export async function cleanupExpiredStorePromotions() {
  const snapshot = await get(ref(database, STORE_PROMOTIONS_PATH));
  const promotions = mergeStorePromotions(snapshot.val(), { includeDefaults: false });
  const expiredPromotions = promotions.filter((promotion) => getStorePromotionStatus(promotion) === 'expired');

  if (expiredPromotions.length === 0) {
    return 0;
  }

  const updates = {};
  expiredPromotions.forEach((promotion) => {
    updates[getStorePromotionKey(promotion.id)] = {
      id: normalizePromotionId(promotion.id),
      deleted: true,
      active: false,
    };
  });

  await update(ref(database, STORE_PROMOTIONS_PATH), updates);
  return expiredPromotions.length;
}
