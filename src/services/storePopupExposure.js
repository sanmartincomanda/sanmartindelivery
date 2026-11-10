import { boxAnnouncementDay } from './storeBoxAnnouncement.js';
import { ref, runTransaction } from 'firebase/database';
import { auth, database } from '../firebase.js';

export const STORE_POPUP_AD_VIEW_COUNT_KEY = 'sanmartin_store_popup_ad_view_counts_v1';
let memory = {};
const synced = new Set();
const count = value => Math.max(0, Math.trunc(Number(value) || 0));

export function readStorePopupAdViewCounts() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORE_POPUP_AD_VIEW_COUNT_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : memory;
  } catch { return memory; }
}

function remember(state) {
  memory = state;
  try { window.localStorage.setItem(STORE_POPUP_AD_VIEW_COUNT_KEY, JSON.stringify(state)); }
  catch { /* Keep the visit usable when storage is unavailable. */ }
}

function withAccountHistory(state, viewerKey, ad, history) {
  const local = state?.__daily?.[ad.id] || {};
  return { ...state, __daily: { ...state?.__daily, [ad.id]: {
    count: Math.max(getStorePopupAdViewCount(state, viewerKey, ad), count(history?.count)),
    lastDay: [local.lastDay, history?.lastDay].filter(Boolean).sort().at(-1) || '',
  } } };
}

export async function syncStorePopupAdExposure({ viewerKey, ad }) {
  const uid = viewerKey.startsWith('user:') ? viewerKey.slice(5) : '';
  if (!uid || !ad.oncePerDay) return;
  const local = readStorePopupAdViewCounts();
  const record = local.__daily?.[ad.id];
  if (!record?.count || !record.lastDay) return;
  const key = `${viewerKey}:${ad.id}:${record.count}:${record.lastDay}`;
  if (synced.has(key)) return;
  synced.add(key);
  try {
    await auth.authStateReady();
    if (auth.currentUser?.uid !== uid) { synced.delete(key); return; }
    const result = await runTransaction(ref(database, `storeUsers/${uid}/popupAdViews/${ad.id}`), current => {
      const merged = withAccountHistory(local, viewerKey, ad, current).__daily[ad.id];
      return current?.count === merged.count && current?.lastDay === merged.lastDay ? undefined : merged;
    }, { applyLocally: false });
    remember(withAccountHistory(readStorePopupAdViewCounts(), viewerKey, ad, result.snapshot.val()));
  } catch (error) { synced.delete(key); throw error; }
}

export function getStorePopupAdViewCount(state, viewerKey, ad) {
  const own = count(state?.[viewerKey]?.[ad.id]);
  return ad.oncePerDay ? Math.max(own, count(state?.guest?.[ad.id]), count(state?.__daily?.[ad.id]?.count)) : own;
}

export function canShowStorePopupAd(state, viewerKey, ad, now = Date.now()) {
  if (!ad?.id) return false;
  const views = getStorePopupAdViewCount(state, viewerKey, ad);
  if (views >= Math.max(1, count(ad.maxViewsPerUser) || 2)) return false;
  if (!ad.oncePerDay) return true;
  const lastDay = state?.__daily?.[ad.id]?.lastDay;
  const today = boxAnnouncementDay(now);
  if (lastDay && lastDay >= today) return false;
  // Old counters have no timestamp. Do not repeat an already-seen ad on rollout day.
  const started = Date.parse(ad.dailyLimitStartedAt || '');
  return !(views > 0 && !lastDay && Number.isFinite(started) && boxAnnouncementDay(started) >= today);
}

export function nextStorePopupAdExposure(state, viewerKey, ad, now = Date.now()) {
  if (!canShowStorePopupAd(state, viewerKey, ad, now)) return null;
  const views = getStorePopupAdViewCount(state, viewerKey, ad) + 1;
  return {
    ...state,
    [viewerKey]: { ...state?.[viewerKey], [ad.id]: views },
    ...(ad.oncePerDay ? { __daily: { ...state?.__daily,
      [ad.id]: { count: views, lastDay: boxAnnouncementDay(now) },
    } } : {}),
  };
}

export async function claimStorePopupAd({ viewerKey, ad, now = Date.now(), isEligible = () => true }) {
  const claim = async () => {
    if (!isEligible()) return null;
    const next = nextStorePopupAdExposure(readStorePopupAdViewCounts(), viewerKey, ad, now);
    if (!next) return null;
    const uid = viewerKey.startsWith('user:') ? viewerKey.slice(5) : '';
    if (uid && ad.oncePerDay) {
      await auth.authStateReady();
      if (auth.currentUser?.uid !== uid || !isEligible()) return null;
      const local = readStorePopupAdViewCounts();
      // One small per-account transaction, never an account/catalog scan or polling.
      const result = await runTransaction(ref(database, `storeUsers/${uid}/popupAdViews/${ad.id}`), current => {
        if (!isEligible()) return undefined;
        return nextStorePopupAdExposure(withAccountHistory(local, viewerKey, ad, current), viewerKey, ad, now)?.__daily[ad.id];
      }, { applyLocally: false });
      const saved = withAccountHistory(readStorePopupAdViewCounts(), viewerKey, ad, result.snapshot.val());
      saved[viewerKey] = { ...saved[viewerKey], [ad.id]: saved.__daily[ad.id].count };
      remember(saved);
      return result.committed && isEligible() ? saved : null;
    }
    remember(next);
    return next;
  };
  // Re-read inside the lock so two tabs cannot consume two impressions at once.
  return typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request(STORE_POPUP_AD_VIEW_COUNT_KEY, claim) : claim();
}
