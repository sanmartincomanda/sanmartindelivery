import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './testStoreLoginFlow.mjs';
import { initializeRuntimeAuth } from '../src/services/firebaseAuthRuntime.js';
import { createStoreLoginRunner, withAuthDeadline, canTryLegacyStoreLogin, getStoreLoginErrorMessage } from '../src/services/storeLoginAttempt.js';
import { cartCoverageNoticeKey, createCoverageNoticeGate } from '../src/services/storeCoverageNotice.js';

for (const platform of ['ios', 'android', 'web']) {
  const calls = [];
  const sdk = {
    indexedDBLocalPersistence: 'indexed-db', browserLocalPersistence: 'local-storage',
    initializeAuth: (app, options) => { calls.push(options); return app; },
    getAuth: app => { calls.push('browser'); return app; },
  };
  const app = {};
  assert.equal(initializeRuntimeAuth(app, { isNativePlatform: () => platform !== 'web' }, sdk), app);
  assert.deepEqual(calls, platform === 'web' ? ['browser'] : [{ persistence: ['indexed-db', 'local-storage'] }]);
}

assert.equal(await withAuthDeadline(Promise.resolve('ready'), 20), 'ready');
await assert.rejects(withAuthDeadline(new Promise(() => {}), 5), { code: 'auth/request-timeout' });
const run = createStoreLoginRunner();
let resolveProvider;
let profileWrites = 0;
const pending = run(async checkActive => {
  await new Promise(resolve => { resolveProvider = resolve; });
  checkActive();
  profileWrites++;
}, { timeoutMs: 10 });
await assert.rejects(run(() => { throw new Error('Must not run'); }), { code: 'auth/operation-pending' });
await assert.rejects(pending, { code: 'auth/request-timeout' });
await assert.rejects(run(() => 'second account'), { code: 'auth/operation-pending' });
resolveProvider();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(profileWrites, 0, 'A late timed-out provider must not change the customer profile');
assert.equal(await run(() => 'retry'), 'retry');
await assert.rejects(run(() => { throw new Error('Provider cancelled'); }), /Provider cancelled/);
assert.equal(await run(() => 'after cancellation'), 'after cancellation');
let synchronous = false;
const synchronousAttempt = run(() => { synchronous = true; return true; });
assert.ok(synchronous, 'Preserve browser user gesture for Google popup');
await synchronousAttempt;
for (const code of ['auth/network-request-failed', 'auth/request-timeout', 'auth/too-many-requests', 'auth/user-disabled']) {
  assert.equal(canTryLegacyStoreLogin({ code }), false);
}
assert.ok(canTryLegacyStoreLogin({ code: 'auth/invalid-credential' }));
assert.match(getStoreLoginErrorMessage({ code: 'auth/network-request-failed' }), /conexion/);
assert.match(getStoreLoginErrorMessage({ code: 'auth/request-timeout' }), /tardo/);

const eligible = { userKey: 'customer-a', authUid: 'customer-a', branchId: 'granada', location: { lat: 12.1, lng: -86.2 }, reason: 'out_of_coverage', fulfillmentType: 'delivery', previousQuantity: 0, nextQuantity: 1, ready: true };
const key = cartCoverageNoticeKey(eligible);
assert.ok(key);
for (const patch of [{ userKey: null, authUid: null }, { authUid: null }, { authUid: 'other-account' }, { nextQuantity: 0 }, { previousQuantity: 2, nextQuantity: 1 }, { previousQuantity: 1 }, { reason: 'available' }, { fulfillmentType: 'pickup' }, { fulfillmentType: 'ruta_san_martin' }, { ready: false }, { location: null }]) {
  assert.equal(cartCoverageNoticeKey({ ...eligible, ...patch }), '');
}
const values = new Map();
const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
const gate = createCoverageNoticeGate(() => storage);
assert.equal(gate(''), false);
assert.equal(gate(key), true);
assert.equal(gate(key), false);
assert.equal(createCoverageNoticeGate(() => storage)(key), false, 'No repeat after reload');
assert.equal(gate(cartCoverageNoticeKey({ ...eligible, branchId: 'nindiri' })), true);
assert.equal(gate(cartCoverageNoticeKey({ ...eligible, location: { lat: 12.2, lng: -86.3 } })), true);
const privateGate = createCoverageNoticeGate(() => { throw new Error('Storage blocked'); });
assert.equal(privateGate(key), true);
assert.equal(privateGate(key), false);
const ui = readFileSync(new URL('../src/components/TiendaVirtualView.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(ui, /branchLocationRequestedRef|authRegistrationCoverageQuote/);
assert.match(ui, /cartCoverageNoticeKey\([\s\S]*?previousQuantity: cart\[code\], nextQuantity/);
assert.match(ui, /open mode="coverage"/);
console.log('Store access: native auth initialization, deadlines, late results, retry, guest coverage, cart increases and notice deduplication passed.');
