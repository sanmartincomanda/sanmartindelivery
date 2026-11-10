import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'http://localhost' });
globalThis.window = dom.window;
let queue = Promise.resolve();
const locked = fn => { const result = queue.then(fn); queue = result.catch(() => {}); return result; };
Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: (_, fn) => locked(fn) } }, configurable: true });
globalThis.popupTestAuth = { authStateReady: async () => {}, currentUser: { uid: 'buyer' } };
let remote = null, writes = 0, calls = 0;
globalThis.popupTestTransaction = async (path, updater) => {
  assert.equal(path, 'storeUsers/buyer/popupAdViews/hueso');
  calls++;
  const next = updater(remote);
  if (next !== undefined) { remote = next; writes++; }
  return { committed: next !== undefined, snapshot: { val: () => remote } };
};
await mkdir('tmp', { recursive: true });
await build({ entryPoints: ['src/services/storePopupExposure.js'], outfile: 'tmp/popup-exposure-tests.cjs',
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'mock-firebase', setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]firebase\.js$/ }, () => ({ contents: 'export const database={}; export const auth=globalThis.popupTestAuth;' }));
    b.onResolve({ filter: /^firebase\/database$/ }, () => ({ path: 'database', namespace: 'fake' }));
    b.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({ contents: 'export const ref=(_,p)=>p;export const runTransaction=(...a)=>globalThis.popupTestTransaction(...a);' }));
  } }] });
const api = createRequire(import.meta.url)('../tmp/popup-exposure-tests.cjs');
const { canShowStorePopupAd: due, nextStorePopupAdExposure: next, claimStorePopupAd: claim,
  syncStorePopupAdExposure: sync, readStorePopupAdViewCounts: read, STORE_POPUP_AD_VIEW_COUNT_KEY: key } = api;
const ad = { id: 'hueso', oncePerDay: true, maxViewsPerUser: 10, dailyLimitStartedAt: '2026-11-10T17:00:00Z' };
const day = n => Date.UTC(2026, 10, n, 12);
let state = {};
for (let n = 10; n < 20; n++) {
  assert.equal(due(state, 'guest', ad, day(n)), true);
  state = next(state, 'guest', ad, day(n));
  assert.equal(state.guest.hueso, n - 9);
  assert.equal(due(state, 'guest', ad, day(n) + 3600000), false, 'Same-day re-entry suppressed');
  assert.equal(due(state, 'user:buyer', ad, day(n)), false, 'Signing in does not repeat');
}
assert.equal(due(state, 'guest', ad, day(20)), false, 'Stop at ten');
assert.equal(due(state, 'guest', ad, day(9)), false, 'Clock rollback suppressed');
state = next({}, 'guest', ad, Date.parse('2026-11-11T05:59:59Z'));
assert.equal(due(state, 'guest', ad, Date.parse('2026-11-11T06:00:00Z')), true, 'Next Managua calendar day, not rolling 24 hours');
state = { guest: { hueso: 2, other: 4 }, 'user:buyer': { hueso: 1 } };
assert.equal(due(state, 'guest', ad, day(10)), false, 'Legacy views are not repeated on rollout day');
state = next(state, 'user:buyer', ad, day(11));
assert.equal(state['user:buyer'].hueso, 3, 'Existing impressions are retained');
assert.equal(state.guest.other, 4, 'Other campaigns are untouched');
for (let n = 12; n < 19; n++) state = next(state, 'user:buyer', ad, day(n));
assert.equal(due(state, 'guest', ad, day(19)), false, 'Logout does not reset this browser cap');
assert.equal(due({ guest: { hueso: 2 } }, 'guest', { ...ad, oncePerDay: false }, day(10)), true, 'Legacy non-daily campaign unchanged');
window.localStorage.setItem(key, '{}');
assert.deepEqual((await Promise.all([claim({ viewerKey: 'guest', ad, now: day(10) }), claim({ viewerKey: 'guest', ad, now: day(10) })])).map(Boolean), [true, false], 'Concurrent tabs share lock');
assert.equal(calls, 0, 'Guests never write to Firebase');
await sync({ viewerKey: 'user:buyer', ad });
assert.equal(remote.count, 1, 'Guest view follows login');
await sync({ viewerKey: 'user:buyer', ad });
assert.equal(writes, 1, 'No repeated guest-sync write');
window.localStorage.setItem(key, '{}');
assert.equal(await claim({ viewerKey: 'user:buyer', ad, now: day(10) }), null, 'Second device suppressed by account transaction');
assert.equal(writes, 1);
assert.ok(await claim({ viewerKey: 'user:buyer', ad, now: day(11) }));
assert.equal(remote.count, 2);
assert.equal(await claim({ viewerKey: 'user:buyer', ad, now: day(11) }), null);
const before = calls;
assert.equal(await claim({ viewerKey: 'user:buyer', ad, now: day(12), isEligible: () => false }), null);
assert.equal(calls, before, 'Do not record while a different screen is active');
globalThis.popupTestAuth.currentUser = null;
assert.equal(await claim({ viewerKey: 'user:buyer', ad, now: day(12) }), null, 'Auth identity mismatch cannot write');
assert.equal(calls, before);
window.localStorage.setItem(key, '{invalid');
assert.equal(typeof read(), 'object', 'Corrupt storage cannot crash the shop');
const view = await readFile('src/components/TiendaVirtualView.jsx', 'utf8');
assert.match(view, /!dailyPopupCampaignActive && boxSalesProducts.length/);
assert.match(view, /claimStorePopupAd\(/);
assert.match(view, /window.addEventListener\('storage', refresh\)/);
const rules = JSON.parse(await readFile('firebase.database.rules.json', 'utf8'));
assert.ok(rules.rules.storeUsers.$uid['.write'].includes('auth.uid == $uid'));
assert.equal(rules.rules.storeUsers.$uid.$other, undefined, 'Existing owner-scoped profile rule covers the new exposure field');
dom.window.close();
console.log('PASS: ten impressions, Managua midnight, prior views, guest/login/logout, two tabs/devices, narrow account transaction, unrelated ads, no production writes.');
