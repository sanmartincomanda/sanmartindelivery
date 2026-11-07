import { ref, runTransaction } from 'firebase/database';
import { auth, database } from '../firebase.js';
import {
  BOX_ANNOUNCEMENT_ID, BOX_ANNOUNCEMENT_STORAGE_KEY, boxAnnouncementDay,
  canShowBoxAnnouncement, mergeBoxAnnouncementHistory, nextBoxAnnouncementHistory,
} from './storeBoxAnnouncement.js';

let memory = {};
const viewerKey = userKey => userKey ? `user:${userKey}` : 'guest';

export function readBoxAnnouncementExposure() {
  try {
    const value = JSON.parse(window.localStorage.getItem(BOX_ANNOUNCEMENT_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return memory; }
}

function rememberExposure(userKey, record, shown = false, now = Date.now()) {
  const state = readBoxAnnouncementExposure();
  const next = {
    ...state,
    ...(shown ? { deviceDay: boxAnnouncementDay(now) } : {}),
    viewers: { ...state.viewers, [viewerKey(userKey)]: mergeBoxAnnouncementHistory(record) },
  };
  memory = next;
  try { window.localStorage.setItem(BOX_ANNOUNCEMENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* Memory prevents repeat dialogs in restricted browsers. */ }
}

export function getBoxAnnouncementHistory(userKey, knownHistory, state = readBoxAnnouncementExposure()) {
  return mergeBoxAnnouncementHistory(state.viewers?.guest, state.viewers?.[viewerKey(userKey)], knownHistory);
}

export function isBoxAnnouncementDue(userKey, knownHistory, now = Date.now()) {
  const state = readBoxAnnouncementExposure();
  return state.deviceDay !== boxAnnouncementDay(now) &&
    canShowBoxAnnouncement(getBoxAnnouncementHistory(userKey, knownHistory, state), now);
}

export async function syncGuestBoxAnnouncementHistory(userKey, knownHistory) {
  if (!userKey) return;
  const state = readBoxAnnouncementExposure();
  const guest = mergeBoxAnnouncementHistory(state.viewers?.guest);
  const known = mergeBoxAnnouncementHistory(state.viewers?.[viewerKey(userKey)], knownHistory);
  if (!Object.keys(guest.days).some(day => !known.days[day])) return;
  await auth.authStateReady();
  if (auth.currentUser?.uid !== userKey) return;
  const result = await runTransaction(
    ref(database, `storeUsers/${userKey}/announcementViews/${BOX_ANNOUNCEMENT_ID}`),
    current => {
      const merged = mergeBoxAnnouncementHistory(current, guest, known);
      return JSON.stringify(merged) === JSON.stringify(mergeBoxAnnouncementHistory(current)) ? undefined : merged;
    },
    { applyLocally: false },
  );
  rememberExposure(userKey, mergeBoxAnnouncementHistory(result.snapshot.val(), guest, known));
}

export async function claimBoxAnnouncement({ userKey = '', knownHistory, now = Date.now(), isEligible = () => true }) {
  const claim = async () => {
    if (!isEligible() || !isBoxAnnouncementDue(userKey, knownHistory, now)) return false;
    const local = getBoxAnnouncementHistory(userKey, knownHistory);
    if (!userKey) {
      rememberExposure('', nextBoxAnnouncementHistory(local, now), true, now);
      return true;
    }
    await auth.authStateReady();
    if (auth.currentUser?.uid !== userKey || !isEligible()) return false;
    // Only this tiny profile field is transacted; no polling or collection scans.
    const result = await runTransaction(
      ref(database, `storeUsers/${userKey}/announcementViews/${BOX_ANNOUNCEMENT_ID}`),
      current => isEligible() ? nextBoxAnnouncementHistory(mergeBoxAnnouncementHistory(current, local), now) : undefined,
      { applyLocally: false },
    );
    rememberExposure(userKey, mergeBoxAnnouncementHistory(local, result.snapshot.val()), result.committed, now);
    return result.committed && isEligible();
  };
  return typeof navigator !== 'undefined' && navigator.locks?.request
    ? navigator.locks.request(BOX_ANNOUNCEMENT_STORAGE_KEY, claim)
    : claim();
}
