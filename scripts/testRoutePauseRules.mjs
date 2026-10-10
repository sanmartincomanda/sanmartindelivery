import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, set, update } from 'firebase/database';

// Emulator only: no real orders, accounts, counters or notifications are touched.
const base = 'http://127.0.0.1:19000';
const namespace = 'demo-route-pause';
const admin = async (method, route, body) => {
  const response = await fetch(`${base}/${route}.json?ns=${namespace}`, {
    method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  return result;
};
const rules = JSON.parse(await readFile(process.argv[2] || 'firebase.database.rules.json', 'utf8'));
await admin('PUT', '.settings/rules', rules);
const roles = {
  buyer: { role: 'client' }, kitchen: { role: 'kitchen' },
  driver: { role: 'driver', driverCode: 'E-RUTA' },
  operator: { role: 'operator' }, manager: { role: 'branch_admin', branchId: 'granada' },
};
await admin('PUT', '', {
  userRoles: roles, storeBranches: { granada: { routeSanMartinEnabled: false } },
  orderCounters: { rutaSanMartin: 31 },
  orders: { existing: { fulfillmentType: 'ruta_san_martin', canal: 'tienda_virtual',
    storeBranchId: 'granada', storeUserKey: 'buyer', estado: 'Pendiente', repartidorCodigo: 'E-RUTA' } },
});
const apps = [];
const databases = Object.fromEntries(Object.keys(roles).map((uid) => {
  const app = initializeApp({ projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com` }, uid);
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 19000, { mockUserToken: { sub: uid, user_id: uid } });
  return [uid, db];
}));
let checks = 0;
const allow = async (label, operation) => { await operation; checks++; console.log(`PASS ${label}`); };
const deny = async (label, operation) => {
  await assert.rejects(operation, /permission_denied|PERMISSION_DENIED/i);
  checks++; console.log(`PASS ${label}`);
};
const order = { canal: 'tienda_virtual', storeUserKey: 'buyer', storeBranchId: 'granada', estado: 'Pendiente' };
try {
  await allow('Delivery still accepted', set(ref(databases.buyer, 'orders/delivery'), { ...order, fulfillmentType: 'delivery' }));
  await allow('Pickup still accepted', set(ref(databases.buyer, 'orders/pickup'), { ...order, fulfillmentType: 'pickup' }));
  for (const uid of ['buyer', 'operator', 'manager']) {
    await deny(`${uid} cannot create Ruta`, set(ref(databases[uid], `orders/blocked-${uid}`), { ...order, fulfillmentType: 'ruta_san_martin' }));
    await deny(`${uid} cannot consume RS sequence`, set(ref(databases[uid], 'orderCounters/rutaSanMartin'), 32));
  }
  await deny('Legacy promotion marker blocked', set(ref(databases.buyer, 'orders/legacy'), { ...order, deliveryPromotionType: 'ruta_san_martin' }));
  await deny('Legacy label blocked', set(ref(databases.buyer, 'orders/legacy-label'), { ...order, fulfillmentLabel: 'Ruta San Martin' }));
  await deny('Accented legacy label blocked', set(ref(databases.buyer, 'orders/legacy-label-accent'), { ...order, fulfillmentLabel: 'Ruta San Martín' }));
  await deny('Schedule marker blocked', set(ref(databases.buyer, 'orders/legacy-slot'), { ...order, routeSlotId: '2026-10-11:afternoon' }));
  await allow('Daily Delivery counter unaffected', set(ref(databases.buyer, 'orderCounters/2026-10-10'), 1));
  await allow('Kitchen can prepare existing Ruta', update(ref(databases.kitchen, 'orders/existing'), { estado: 'Preparado' }));
  await allow('Operator can dispatch existing Ruta', update(ref(databases.operator, 'orders/existing'), { estado: 'Enviado' }));
  await allow('Driver can deliver existing Ruta', update(ref(databases.driver, 'orders/existing'), { estado: 'Entregado' }));
  await allow('Client can cancel own existing Ruta', update(ref(databases.buyer, 'orders/existing'), { estado: 'Cancelado' }));
  assert.equal(await admin('GET', 'orderCounters/rutaSanMartin'), 31); checks++;
  await deny('Client cannot reactivate service', set(ref(databases.buyer, 'storeBranches/granada/routeSanMartinEnabled'), true));
  await admin('DELETE', 'storeBranches/granada/routeSanMartinEnabled');
  await deny('Missing flag fails closed', set(ref(databases.buyer, 'orders/missing-flag'), { ...order, fulfillmentType: 'ruta_san_martin' }));
  await admin('PUT', 'storeBranches/granada/routeSanMartinEnabled', true);
  await admin('PUT', 'storeBranches/granada/routeSanMartin/revision', 7);
  await deny('Old clients cannot bypass zone validation when enabled', set(ref(databases.buyer, 'orders/no-proof'), { ...order, fulfillmentType: 'ruta_san_martin' }));
  const proof = { uid: 'buyer', revision: 7, expiresAt: Date.now() + 60000, location: { lat: 11.93, lng: -85.95 },
    slotId: '2026-10-11:afternoon', deliveryDate: '2026-10-11', earliestAt: 1791745200000, windowEndAt: 1791759600000,
    zoneId: 'granada', eligibleSubtotal: 1000 };
  const authorized = { ...order, fulfillmentType: 'ruta_san_martin', ubicacion: proof.location,
    routeSlotId: proof.slotId, scheduledDeliveryDate: proof.deliveryDate, scheduledEarliestAt: proof.earliestAt,
    scheduledWindowEndAt: proof.windowEndAt, routeZoneId: proof.zoneId, routeConfigRevision: proof.revision,
    subtotalEstimado: 1050, descuentoCupon: 50 };
  await deny('Client cannot forge authorization', set(ref(databases.buyer, 'routeSanMartinAuthorizations/forged'), proof));
  await admin('PUT', 'routeSanMartinAuthorizations/reactivated', proof);
  await allow('Server-authorized Ruta accepted', set(ref(databases.buyer, 'orders/reactivated'), authorized));
  for (const [key, patch] of Object.entries({ coords: { ubicacion: { lat: 12.5, lng: -85 } },
    slot: { routeSlotId: '2026-10-12:morning' }, minimum: { subtotalEstimado: 500 }, revision: { routeConfigRevision: 6 } })) {
    await admin('PUT', `routeSanMartinAuthorizations/${key}`, proof);
    await deny(`Tampered ${key} blocked`, set(ref(databases.buyer, `orders/${key}`), { ...authorized, ...patch }));
  }
  await admin('PUT', 'routeSanMartinAuthorizations/expired', { ...proof, expiresAt: Date.now() - 1000 });
  await deny('Expired proof blocked', set(ref(databases.buyer, 'orders/expired'), authorized));
  await admin('PUT', 'routeSanMartinAuthorizations/other-user', { ...proof, uid: 'someone-else' });
  await deny('Proof is bound to requesting account', set(ref(databases.buyer, 'orders/other-user'), authorized));
  await admin('PUT', 'routeSanMartinAuthorizations/stale', proof);
  await admin('PUT', 'storeBranches/granada/routeSanMartin/revision', 8);
  await deny('Coverage changed during checkout blocks stale proof', set(ref(databases.buyer, 'orders/stale'), authorized));
  await allow('Reactivation preserves sequence continuation', set(ref(databases.buyer, 'orderCounters/rutaSanMartin'), 32));
  console.log(`Route pause rules: ${checks} checks passed.`);
} finally {
  await Promise.all(apps.map(deleteApp));
}
