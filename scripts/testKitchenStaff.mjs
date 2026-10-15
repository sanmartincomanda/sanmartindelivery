import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, ref, set, update } from 'firebase/database';
import { createKitchenStaffService, createInitialKitchenStaff, getKitchenStaffMembers, getOrderPreparerName, validateKitchenStaffMember } from '../src/services/kitchenStaff.js';

// Never points at a production database; a local emulator must be running.
const namespace = 'demo-kitchen-staff';
const owner = async (method, path, body) => {
  const response = await fetch(`http://127.0.0.1:19000/${path}.json?ns=${namespace}`, {
    method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert.ok(response.ok, JSON.stringify(value));
  return value;
};
await owner('PUT', '.settings/rules', JSON.parse(await readFile(process.argv[2] || 'firebase.database.rules.json', 'utf8')));
const roles = {
  admin: { role: 'admin' }, admin2: { role: 'admin' }, kitchen: { role: 'kitchen' },
  operator: { role: 'operator' }, manager: { role: 'branch_admin', branchId: 'granada' },
  client: { role: 'client' }, driver: { role: 'driver', driverCode: 'E1' },
};
const order = { id: 1, fecha: '2026-10-15', storeBranchId: 'granada', estado: 'Pendiente', cliente: 'QA LOCAL', total: 100 };
await owner('PUT', '', { userRoles: roles, orders: { test: order, stale: order }, rutaOrders: { legacy: order }, storeBranches: { granada: { routeSanMartinEnabled: false } } });
const apps = [];
const dbs = Object.fromEntries(Object.keys(roles).map((uid) => {
  const app = initializeApp({ projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com` }, `staff-${uid}`);
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 19000, { mockUserToken: { sub: uid, user_id: uid } });
  return [uid, db];
}));
let passed = 0;
const test = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
const denied = (run) => assert.rejects(run, /permission.denied/i);
const svc = createKitchenStaffService(dbs.admin);
const kitchen = createKitchenStaffService(dbs.kitchen);
try {
  await test('Legacy names are available only before initialization', () => {
    assert.equal(getKitchenStaffMembers(null).length, 10);
    assert.deepEqual(getKitchenStaffMembers({ schemaVersion: 1 }), []);
    assert.equal(getOrderPreparerName({ cocinero: 'Noel Hernandez' }), 'CHIMI');
  });
  await test('Seed existing team once; repeated initialization is a no-op', async () => {
    await svc.initialize('admin');
    const before = await owner('GET', 'kitchenStaff');
    await svc.initialize('admin2');
    assert.deepEqual(await owner('GET', 'kitchenStaff'), before);
    assert.equal(getKitchenStaffMembers(before).length, 10);
  });
  for (const role of ['kitchen', 'operator', 'manager']) {
    await test(`${role} may read but cannot edit the directory`, async () => {
      assert.ok((await get(ref(dbs[role], 'kitchenStaff'))).exists());
      await denied(update(ref(dbs[role], 'kitchenStaff/members/julio-amador'), { name: 'Intruder' }));
    });
  }
  for (const role of ['client', 'driver']) {
    await test(`${role} cannot read or write personnel`, async () => {
      await denied(get(ref(dbs[role], 'kitchenStaff')));
      await denied(set(ref(dbs[role], 'kitchenStaff'), createInitialKitchenStaff()));
    });
  }
  let added;
  await test('Add, trim and assign a stable ID', async () => {
    added = await svc.save({ name: '  Ana   Pérez ', alias: ' Ana P. ', active: true });
    assert.equal(added.name, 'Ana Pérez'); assert.equal(added.alias, 'Ana P.'); assert.equal(added.revision, 1);
  });
  await test('Reject blank, oversized and duplicate names/aliases', async () => {
    for (const fields of [{ name: ' ' }, { name: 'a'.repeat(81) }, { name: 'New', alias: 'a'.repeat(41) }, { name: 'ana perez', alias: 'other' }, { name: 'other', alias: 'ana p.' }]) {
      await assert.rejects(svc.save(fields));
    }
    assert.equal(getKitchenStaffMembers(await owner('GET', 'kitchenStaff')).length, 11);
  });
  await test('Server validates field types and rejects invalid extra fields', async () => {
    for (const patch of [{ name: '   ' }, { active: 'yes' }, { revision: 0 }, { sortOrder: -1 }, { password: 'not-allowed' }, { alias: 'x'.repeat(41) }]) {
      await denied(update(ref(dbs.admin, `kitchenStaff/members/${added.id}`), patch));
    }
    await denied(set(ref(dbs.admin, 'kitchenStaff/schemaVersion'), 2));
  });
  let assignment;
  await test('Kitchen stores a historical name/alias snapshot on Delivery and legacy Ruta', async () => {
    assignment = await kitchen.assignment(added.id);
    for (const path of ['orders/test', 'rutaOrders/legacy']) await update(ref(dbs.kitchen, path), { ...assignment, estado: 'En preparación' });
    assert.equal((await owner('GET', 'orders/test')).cocinero, 'Ana Pérez');
  });
  await test('Rename and deactivate without touching assigned orders', async () => {
    const before = await owner('GET', 'orders/test');
    added = await svc.save({ ...added, name: 'Ana Pérez Ruiz', alias: 'Anita', active: false, expectedRevision: added.revision });
    assert.deepEqual(await owner('GET', 'orders/test'), before);
    assert.equal(getOrderPreparerName(before), 'Ana P.');
    await assert.rejects(kitchen.assignment(added.id), /no está activo/);
    await denied(update(ref(dbs.kitchen, 'orders/stale'), { ...assignment, estado: 'En preparación' }));
    // Retirement must not block finishing the orders that already have this preparer.
    await update(ref(dbs.kitchen, 'orders/test'), { estado: 'Preparado' });
    await update(ref(dbs.kitchen, 'rutaOrders/legacy'), { estado: 'Preparado' });
  });
  await test('Reactivation keeps the same stable ID', async () => {
    const id = added.id;
    added = await svc.save({ ...added, active: true, expectedRevision: added.revision });
    assert.equal(added.id, id);
    assert.equal((await kitchen.assignment(id)).cocineroAlias, 'Anita');
    await update(ref(dbs.kitchen, 'orders/stale'), { ...await kitchen.assignment(id), estado: 'En preparación' });
  });
  await test('A deleted or cancelled order cannot be recreated by an open picker', async () => {
    await denied(update(ref(dbs.kitchen, 'orders/deleted'), { ...assignment, estado: 'En preparación' }));
    await owner('PUT', 'orders/cancelled', { ...order, estado: 'Cancelado' });
    await denied(update(ref(dbs.kitchen, 'orders/cancelled'), { ...await kitchen.assignment(added.id), estado: 'En preparación' }));
  });
  await test('A stale editor cannot overwrite another edit', async () => {
    const other = createKitchenStaffService(dbs.admin2);
    const stale = { ...added, expectedRevision: added.revision };
    added = await svc.save({ ...stale, alias: 'Ana cocina' });
    await assert.rejects(other.save({ ...stale, name: 'Stale overwrite' }), /modificada/);
    assert.equal((await owner('GET', `kitchenStaff/members/${added.id}`)).alias, 'Ana cocina');
  });
  await test('Concurrent duplicate creates commit only one person', async () => {
    const other = createKitchenStaffService(dbs.admin2);
    const results = await Promise.allSettled([svc.save({ name: 'Concurrente', alias: 'QA' }), other.save({ name: 'Concurrente', alias: 'QA' })]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  });
  await test('All inactive stays empty in Kitchen; initialization never restores retired staff', async () => {
    for (const member of getKitchenStaffMembers(await owner('GET', 'kitchenStaff'))) {
      if (member.active) await svc.save({ ...member, active: false, expectedRevision: member.revision });
    }
    await svc.initialize();
    assert.equal(getKitchenStaffMembers(await owner('GET', 'kitchenStaff')).filter((member) => member.active).length, 0);
    await assert.rejects(kitchen.assignment('julio-amador'), /no está activo/);
  });
  await test('Legacy displays and unrelated business settings remain intact', async () => {
    assert.equal(getOrderPreparerName({ cocinero: 'Julio Amador' }), 'Julio');
    assert.equal(getOrderPreparerName({ cocinero: 'New person' }), 'New person');
    assert.equal((await owner('GET', 'storeBranches/granada')).routeSanMartinEnabled, false);
    assert.equal((await owner('GET', 'orders/test')).total, 100);
    assert.throws(() => validateKitchenStaffMember({ name: 'New', alias: 'QA' }, [{ id: 'old', name: 'Old', alias: 'QA', active: false }]));
  });
  console.log(`Kitchen staff: ${passed} checks passed.`);
} finally {
  await Promise.all(apps.map(deleteApp));
}
