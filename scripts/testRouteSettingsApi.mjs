import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';
import { handler } from '../netlify/functions/route-san-martin.mjs';
import { getRouteSanMartinSlots } from '../src/services/routeSanMartin.js';

// The real handler and RTDB transactions, with authentication stubbed ONLY in this emulator test.
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:19000';
process.env.FIREBASE_DATABASE_URL = 'https://demo-route-pause.firebaseio.com';
const app = initializeApp({ projectId: 'demo-route-pause', databaseURL: process.env.FIREBASE_DATABASE_URL });
const db = getDatabase(app), auth = getAuth(app);
auth.verifyIdToken = async (token) => {
  if (!['admin', 'client', 'operator'].includes(token)) throw Object.assign(new Error('Invalid test token'), { code: 'auth/invalid-id-token' });
  return { uid: token };
};
const origin = { lat: 11.9299, lng: -85.956 };
const zone = { id: 'granada', name: 'Granada', type: 'radius', radiusKm: 40, active: true, deliveryDays: [1, 2, 3, 4, 5, 6, 0] };
await db.ref().set({ userRoles: { admin: { role: 'admin' }, client: { role: 'client' }, operator: { role: 'operator' } },
  storeBranches: { granada: { id: 'granada', active: true, acceptingOrders: true, routeSanMartinEnabled: false, storeLocation: origin, name: 'Unchanged branch name' } } });
let checks = 0;
const call = async (token, body, status) => {
  const response = await handler({ httpMethod: 'POST', headers: { origin: 'https://admintv.sanmartinsr.com', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal(response.statusCode, status, response.body); checks++;
  return JSON.parse(response.body);
};
try {
  await call('', { action: 'save' }, 401);
  await call('client', { action: 'save', zones: [zone], expectedRevision: 0 }, 403);
  await call('operator', { action: 'set-enabled', enabled: true, expectedRevision: 0 }, 403);
  const saved = await call('admin', { action: 'save', zones: [zone], expectedRevision: 0, enabled: true }, 200);
  assert.equal(saved.branch.routeSanMartinEnabled, false); checks++;
  assert.equal(saved.branch.name, 'Unchanged branch name'); checks++;
  assert.equal(saved.branch.acceptingOrders, true); checks++;
  await call('admin', { action: 'save', zones: [zone], expectedRevision: 0 }, 409);
  await call('admin', { action: 'save', zones: [{ ...zone, deliveryDays: [] }], expectedRevision: 1 }, 400);
  await call('client', { action: 'authorize', branchId: 'granada' }, 409);
  const active = await call('admin', { action: 'set-enabled', enabled: true, expectedRevision: 1 }, 200);
  const slots = getRouteSanMartinSlots(new Date(), 14, { branch: active.branch, destination: origin });
  const request = { action: 'authorize', branchId: 'granada', location: origin, slotId: slots[0].id,
    eligibleSubtotal: 1000, orderKey: '2026-10-10-RS-0001' };
  const authorized = await call('client', request, 200);
  assert.equal(authorized.authorization.zoneId, 'granada'); checks++;
  assert.equal((await db.ref(`routeSanMartinAuthorizations/${request.orderKey}/uid`).get()).val(), 'client'); checks++;
  await call('client', { ...request, location: { lat: 14, lng: -86 } }, 409);
  await call('client', { ...request, eligibleSubtotal: 999.99 }, 409);
  const blockedWeekday = new Date(`${slots[0].deliveryDate}T12:00:00Z`).getUTCDay();
  await call('admin', { action: 'save', expectedRevision: 2, zones: [{ ...zone, deliveryDays: zone.deliveryDays.filter((day) => day !== blockedWeekday) }] }, 200);
  await call('client', request, 409);
  const paused = await call('admin', { action: 'set-enabled', enabled: false, expectedRevision: 3 }, 200);
  assert.equal(paused.branch.routeSanMartinEnabled, false); checks++;
  await call('client', request, 409);
  await call('admin', null, 400);
  await call('admin', { action: 'save', expectedRevision: 4, zones: [null] }, 400);
  await call('admin', { action: 'save', expectedRevision: 4, zones: [] }, 200);
  await call('admin', { action: 'set-enabled', expectedRevision: 5, enabled: true }, 409);
  assert.equal((await db.ref('storeBranches/granada/routeSanMartinEnabled').get()).val(), false); checks++;
  console.log(`Route settings API (emulator): ${checks} checks passed.`);
} finally {
  await deleteApp(app);
}
