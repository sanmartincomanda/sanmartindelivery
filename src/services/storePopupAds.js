import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { isDataUrlImage, uploadPromotionImage } from './storeMedia';

export const STORE_POPUP_ADS_PATH = 'storePopupAds';
export const STORE_DEFAULT_POPUP_AD_ID = 'la_parrilla_es_la_cancha_jul_2026';

const STORE_DEFAULT_POPUP_ADS = [
  {
    id: STORE_DEFAULT_POPUP_AD_ID,
    title: 'La parrilla es la cancha',
    image: '/tienda/popup-ads/la-parrilla-es-la-cancha-2026-07.jpg',
    active: true,
    sortOrder: 10,
    maxViewsPerUser: 2,
    startsAt: '2026-07-09T00:00:00.000Z',
    endsAt: '2026-07-31T05:59:59.999Z',
  },
];

const normalizePopupAdId = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizePopupAdDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
};

const normalizePopupAdViews = (value, fallback = 2) => {
  const numeric = Math.trunc(Number(value));
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  return Math.max(1, Math.trunc(Number(fallback || 2) || 2));
};

const sortPopupAds = (left, right) =>
  Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
  String(left.title || '').localeCompare(String(right.title || ''), 'es', {
    sensitivity: 'base',
  });

const buildDefaultStorePopupAds = () =>
  STORE_DEFAULT_POPUP_ADS.map((popupAd, index) =>
    normalizeStorePopupAd(
      {
        ...popupAd,
        deleted: false,
      },
      {},
      index
    )
  );

export const getStorePopupAdKey = (id) => normalizePopupAdId(id).replace(/[.#$/[\]]/g, '_');

export const normalizeStorePopupAd = (popupAd = {}, fallback = {}, index = 0) => {
  const source = popupAd || {};
  const backup = fallback || {};
  const title = String(source.title ?? backup.title ?? '').trim();
  const id = normalizePopupAdId(source.id ?? backup.id ?? title);

  return {
    id,
    title: title || id,
    image: String(source.image ?? backup.image ?? '').trim(),
    imageStoragePath: String(source.imageStoragePath ?? backup.imageStoragePath ?? '').trim(),
    active: source.active ?? backup.active ?? true,
    deleted: source.deleted ?? backup.deleted ?? false,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? (index + 1) * 10),
    startsAt: normalizePopupAdDate(source.startsAt ?? backup.startsAt),
    endsAt: normalizePopupAdDate(source.endsAt ?? backup.endsAt),
    maxViewsPerUser: normalizePopupAdViews(
      source.maxViewsPerUser ?? backup.maxViewsPerUser,
      STORE_DEFAULT_POPUP_ADS[index]?.maxViewsPerUser || 2
    ),
  };
};

export const mergeStorePopupAds = (remotePopupAds = {}, options = {}) => {
  const remoteEntries = Object.values(remotePopupAds || {}).filter(Boolean);
  const includeDefaults = options.includeDefaults === true;

  if (remoteEntries.length === 0) {
    return includeDefaults ? buildDefaultStorePopupAds().sort(sortPopupAds) : [];
  }

  return remoteEntries
    .map((popupAd, index) => normalizeStorePopupAd(popupAd, {}, index))
    .filter((popupAd) => popupAd.id && popupAd.deleted !== true)
    .sort(sortPopupAds);
};

export const getStorePopupAdStatus = (popupAd, now = Date.now()) => {
  const normalized = normalizeStorePopupAd(popupAd);
  const currentTime = Number(now || Date.now());
  const startsAt = normalized.startsAt ? new Date(normalized.startsAt).getTime() : 0;
  const endsAt = normalized.endsAt ? new Date(normalized.endsAt).getTime() : 0;

  if (!normalized.id || !normalized.image || normalized.active === false || normalized.deleted === true) {
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

export const isStorePopupAdVisible = (popupAd, now = Date.now()) =>
  getStorePopupAdStatus(popupAd, now) === 'active';

const buildPopupAdsUpsertMap = (popupAds = []) =>
  popupAds.reduce((accumulator, popupAd) => {
    const normalized = normalizeStorePopupAd(popupAd);
    if (!normalized.id) {
      return accumulator;
    }

    accumulator[getStorePopupAdKey(normalized.id)] = normalized;
    return accumulator;
  }, {});

const deactivateOtherPopupAds = async (activeId, remotePopupAds = {}) => {
  const popupAds = mergeStorePopupAds(remotePopupAds, { includeDefaults: false });
  const updates = {};

  popupAds.forEach((popupAd) => {
    if (popupAd.id && popupAd.id !== activeId && popupAd.active !== false) {
      updates[`${getStorePopupAdKey(popupAd.id)}/active`] = false;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(database, STORE_POPUP_ADS_PATH), updates);
  }
};

export async function saveStorePopupAd(popupAd, existingPopupAd = null) {
  const normalized = {
    ...normalizeStorePopupAd(popupAd, existingPopupAd || {}),
    deleted: false,
  };

  if (!normalized.id || !normalized.title || !normalized.image) {
    throw new Error('El anuncio popup necesita titulo e imagen.');
  }

  let nextPopupAd = normalized;
  if (isDataUrlImage(normalized.image)) {
    const uploadedImage = await uploadPromotionImage({
      id: `popup_${normalized.id}`,
      image: normalized.image,
    });

    nextPopupAd = {
      ...normalized,
      image: uploadedImage.url,
      imageStoragePath: uploadedImage.path || '',
      deleted: false,
    };
  }

  if (nextPopupAd.active !== false) {
    const snapshot = await get(ref(database, STORE_POPUP_ADS_PATH));
    await deactivateOtherPopupAds(nextPopupAd.id, snapshot.val() || {});
  }

  await set(ref(database, `${STORE_POPUP_ADS_PATH}/${getStorePopupAdKey(nextPopupAd.id)}`), nextPopupAd);
  return nextPopupAd;
}

export async function updateStorePopupAd(id, patch = {}) {
  const popupAdKey = getStorePopupAdKey(id);
  if (!popupAdKey) {
    throw new Error('Anuncio popup invalido.');
  }

  const normalizedPatch = { ...patch };
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'startsAt')) {
    normalizedPatch.startsAt = normalizePopupAdDate(normalizedPatch.startsAt);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'endsAt')) {
    normalizedPatch.endsAt = normalizePopupAdDate(normalizedPatch.endsAt);
  }
  if (Object.prototype.hasOwnProperty.call(normalizedPatch, 'maxViewsPerUser')) {
    normalizedPatch.maxViewsPerUser = normalizePopupAdViews(normalizedPatch.maxViewsPerUser);
  }

  if (normalizedPatch.active === true) {
    const snapshot = await get(ref(database, STORE_POPUP_ADS_PATH));
    await deactivateOtherPopupAds(normalizePopupAdId(id), snapshot.val() || {});
  }

  await update(ref(database, `${STORE_POPUP_ADS_PATH}/${popupAdKey}`), normalizedPatch);
}

export async function deleteStorePopupAd(id) {
  const popupAdKey = getStorePopupAdKey(id);
  if (!popupAdKey) {
    throw new Error('Anuncio popup invalido.');
  }

  await set(ref(database, `${STORE_POPUP_ADS_PATH}/${popupAdKey}`), {
    id: normalizePopupAdId(id),
    deleted: true,
    active: false,
  });
}

export async function seedDefaultStorePopupAdsIfEmpty() {
  const snapshot = await get(ref(database, STORE_POPUP_ADS_PATH));
  if (snapshot.exists()) {
    return false;
  }

  await set(ref(database, STORE_POPUP_ADS_PATH), buildPopupAdsUpsertMap(buildDefaultStorePopupAds()));
  return true;
}

export async function cleanupExpiredStorePopupAds() {
  const snapshot = await get(ref(database, STORE_POPUP_ADS_PATH));
  const popupAds = mergeStorePopupAds(snapshot.val(), { includeDefaults: false });
  const expiredPopupAds = popupAds.filter((popupAd) => getStorePopupAdStatus(popupAd) === 'expired');

  if (expiredPopupAds.length === 0) {
    return 0;
  }

  const updates = {};
  expiredPopupAds.forEach((popupAd) => {
    updates[getStorePopupAdKey(popupAd.id)] = {
      id: normalizePopupAdId(popupAd.id),
      deleted: true,
      active: false,
    };
  });

  await update(ref(database, STORE_POPUP_ADS_PATH), updates);
  return expiredPopupAds.length;
}
