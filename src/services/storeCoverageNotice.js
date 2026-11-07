const STORAGE_KEY = 'csm:cart-coverage-notices:v1';

export function cartCoverageNoticeKey({ userKey, authUid, branchId, location, reason, fulfillmentType, previousQuantity, nextQuantity, ready }) {
  if (!ready || !userKey || userKey !== authUid || !branchId ||
      fulfillmentType !== 'delivery' || reason !== 'out_of_coverage' ||
      !(Number(nextQuantity) > Math.max(0, Number(previousQuantity) || 0)) ||
      !Number.isFinite(location?.lat) || !Number.isFinite(location?.lng)) return '';
  return [userKey, branchId, location.lat.toFixed(5), location.lng.toFixed(5)].join(':');
}

export function createCoverageNoticeGate(getStorage = () => globalThis.sessionStorage) {
  const seen = new Set();
  return key => {
    if (!key || seen.has(key)) return false;
    let storage;
    try {
      storage = getStorage();
      const saved = JSON.parse(storage?.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) saved.slice(-40).forEach(value => seen.add(value));
    } catch { /* Private browsing may disable storage; keep the in-memory gate. */ }
    if (seen.has(key)) return false;
    seen.add(key);
    try { storage?.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-40))); } catch { /* No blocking storage dependency. */ }
    return true;
  };
}
