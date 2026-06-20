export const STORE_CATALOG_CACHE_KEY = 'sanmartin_store_catalog_cache_v1';
export const STORE_CATALOG_CACHE_VERSION = 2;
export const STORE_CATEGORIES_CACHE_KEY = 'sanmartin_store_categories_cache_v1';
export const STORE_CATEGORIES_CACHE_VERSION = 1;
export const STORE_COUPONS_CACHE_KEY = 'sanmartin_store_coupons_cache_v1';
export const STORE_COUPONS_CACHE_VERSION = 1;

export const readStoreJsonCache = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (error) {
    console.error(`No se pudo leer cache local de ${key}:`, error);
    return null;
  }
};

export const writeStoreJsonCache = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`No se pudo guardar cache local de ${key}:`, error);
  }
};

export const unwrapStoreCache = (cachedValue, version) => {
  if (!cachedValue || typeof cachedValue !== 'object') {
    return {
      data: null,
      updatedAt: 0,
    };
  }

  if (
    Number(cachedValue.version || 0) === Number(version || 0) &&
    Object.prototype.hasOwnProperty.call(cachedValue, 'data')
  ) {
    return {
      data: cachedValue.data,
      updatedAt: Number(cachedValue.updatedAt || 0),
    };
  }

  return {
    data: cachedValue,
    updatedAt: 0,
  };
};

export const writeStoreVersionedCache = (key, version, data, updatedAt = Date.now()) =>
  writeStoreJsonCache(key, {
    version,
    updatedAt: Number(updatedAt || Date.now()),
    data,
  });
