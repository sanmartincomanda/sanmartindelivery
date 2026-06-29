const CLIENT_LIST_CACHE_KEY = 'sanmartin_clients_cache_v1';
export const CLIENT_LIST_CACHE_MAX_AGE_MS = 10 * 60 * 1000;

const createEmptyClientCache = () => ({
  updatedAt: 0,
  items: [],
});

export const readClientListCache = () => {
  if (typeof window === 'undefined') {
    return createEmptyClientCache();
  }

  try {
    const rawValue = window.localStorage.getItem(CLIENT_LIST_CACHE_KEY);
    if (!rawValue) {
      return createEmptyClientCache();
    }

    const parsedValue = JSON.parse(rawValue);
    return {
      updatedAt: Number(parsedValue?.updatedAt || 0),
      items: Array.isArray(parsedValue?.items) ? parsedValue.items : [],
    };
  } catch (error) {
    console.warn('No se pudo leer el cache local de clientes:', error);
    return createEmptyClientCache();
  }
};

export const writeClientListCache = (items = [], updatedAt = Date.now()) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      CLIENT_LIST_CACHE_KEY,
      JSON.stringify({
        updatedAt: Number(updatedAt || Date.now()),
        items: Array.isArray(items) ? items : [],
      })
    );
  } catch (error) {
    console.warn('No se pudo guardar el cache local de clientes:', error);
  }
};

export const hasClientListCacheData = (cacheEntry) =>
  Array.isArray(cacheEntry?.items) && cacheEntry.items.length > 0;

export const isClientListCacheFresh = (
  cacheEntry,
  maxAgeMs = CLIENT_LIST_CACHE_MAX_AGE_MS,
  now = Date.now()
) => {
  const updatedAt = Number(cacheEntry?.updatedAt || 0);
  const ageLimit = Number(maxAgeMs || 0);

  if (!updatedAt || ageLimit <= 0) {
    return false;
  }

  return now - updatedAt <= ageLimit;
};

export const clearClientListCache = () => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(CLIENT_LIST_CACHE_KEY);
  } catch (error) {
    console.warn('No se pudo limpiar el cache local de clientes:', error);
  }
};
