export const STORE_LAUNCH_KEY = 'csm_web_welcome_v1';
export const RECENT_SEARCHES_KEY = 'csm_recent_product_searches_v1';

export function shouldShowStoreLaunch(storage, reducedMotion = false) {
  if (reducedMotion) return false;
  try { return storage?.getItem(STORE_LAUNCH_KEY) !== 'seen'; }
  catch { return true; }
}

export function rememberStoreLaunch(storage) {
  try { storage?.setItem(STORE_LAUNCH_KEY, 'seen'); } catch { /* Private browsing may deny storage. */ }
}

export function normalizeRecentSearches(values) {
  if (!Array.isArray(values)) return [];
  const unique = new Set();
  return values.filter(value => {
    if (typeof value !== 'string') return false;
    const text = value.trim().slice(0, 64);
    const key = text.toLocaleLowerCase('es');
    if (text.length < 2 || unique.has(key)) return false;
    unique.add(key);
    return true;
  }).slice(0, 5).map(value => value.trim().slice(0, 64));
}

export function readRecentSearches(storage) {
  try { return normalizeRecentSearches(JSON.parse(storage?.getItem(RECENT_SEARCHES_KEY) || '[]')); }
  catch { return []; }
}

export function saveRecentSearches(storage, values) {
  const recent = normalizeRecentSearches(values);
  try {
    if (recent.length) storage?.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recent));
    else storage?.removeItem(RECENT_SEARCHES_KEY);
  } catch { /* Search remains usable without persistent storage. */ }
  return recent;
}

export function getBrowserStorage(name) {
  try { return window[name]; } catch { return null; }
}
