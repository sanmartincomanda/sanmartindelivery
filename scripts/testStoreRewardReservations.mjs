import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { connectDatabaseEmulator, getDatabase, get, goOffline, goOnline, ref, set, update } from 'firebase/database';
import {
  reserveStoreRewardPoints, releaseStoreRewardReservation, settleStoreRewardReservation,
  linkRewardReservationToOrder, getStoreRewardTransactionKey,
  reverseStoreRewardEarnedPoints,
} from '../src/services/storeRewards.js';
import { createStoreRewardsSyncManager } from './storeRewardsSync.mjs';
import { auditStoreRewardReservations } from './storeRewardReservationAudit.mjs';

// Fixed loopback + demo namespace: these tests cannot target production.
const namespace = 'demo-gold-reservation-safety';
const base = `http://127.0.0.1:19000`;
const admin = async (method, path, body) => {
  const response = await fetch(`${base}/${path}.json?ns=${namespace}`, {
    method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.json();
};
const rules = JSON.parse(await readFile('firebase.database.rules.json', 'utf8'));
await admin('PUT', '.settings/rules', rules);
await admin('PUT', '', {
  userRoles: { integrator: { role: 'admin' } },
  storeRewardSettings: { enabled: true, amountPerPoint: 15, pointsPerAmount: 1 },
});
const apps = [];
const connect = (name) => {
  const app = initializeApp({ projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com` }, name);
  apps.push(app);
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 19000, { mockUserToken: { sub: 'integrator', user_id: 'integrator' } });
  return db;
};
const database = connect('gold-test-one');
const secondDatabase = connect('gold-test-two');
const manager = createStoreRewardsSyncManager({ databaseInstance: database, authenticate: async () => {} });
const value = async (path) => (await get(ref(database, path))).val();
const balance = async (userKey) => (await value(`storeRewardAccounts/${userKey}`))?.pointsBalance;
const options = (userKey, reservationId, orderKey = '', db = database) => ({ userKey, reservationId, orderKey, databaseInstance: db });
const reward = { id: 'tbone', name: '1 T-Bone 18 oz gratis', pointsRequired: 1500, minPurchaseAmount: 0,
  active: true, available: true, items: [{ productCode: '00052', quantity: 1 }] };
const requestedAt = Date.parse('2026-10-14T16:00:00Z');
const auditNow = Date.parse('2026-10-15T12:10:00Z');
let checks = 0;
const test = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
const seed = async (uid, rid, extra = {}) => {
  await set(ref(database, `storeRewardAccounts/${uid}`), {
    customerId: uid, pointsBalance: 80, lifetimePointsEarned: 1580, lifetimePointsRedeemed: 0,
    pendingReservationId: rid,
    holds: { [rid]: { rewardId: 'tbone', rewardName: reward.name, points: 1500, requestedAt, ...extra } },
  });
  await set(ref(database, `storeRewardTransactions/${uid}/${getStoreRewardTransactionKey(rid)}`), {
    customerId: uid, type: 'redeemed', status: 'reserved', signedPoints: -1500, points: 1500,
    rewardId: reward.id, rewardName: reward.name, createdAt: requestedAt,
  });
};
const order = (uid, rid, extra = {}) => ({
  canal: 'tienda_virtual', storeUserKey: uid, cliente: 'Cliente de prueba', fecha: '2026-10-14', id: 21,
  estado: 'Enviado', total: 1190.4, totalAproximado: false,
  rewardPoints: { status: 'awarded', awarded: true, points: 79 },
  rewardRedemption: { reservationId: rid, rewardId: reward.id, rewardName: reward.name, pointsRedeemed: 1500, status: 'reserved' },
  ...extra,
});
try {
  await test('actual reserve, send, archive, repeated audit keeps 80 points', async () => {
    await set(ref(database, 'storeRewardAccounts/lifecycle'), { customerId: 'lifecycle', pointsBalance: 1501 });
    const reserved = await reserveStoreRewardPoints({ userKey: 'lifecycle', reward, cartAmount: 1190.4, databaseInstance: database });
    assert.equal(await balance('lifecycle'), 1);
    const key = '2026-10-14-GR-test';
    const current = order('lifecycle', reserved.reservationId, {
      rewardRedemption: reserved.rewardSnapshot,
      rewardPoints: { status: 'pending', estimatedPoints: 79 },
    });
    await set(ref(database, `orders/${key}`), current);
    await manager.syncOrderRewards(key, current);
    assert.equal(await balance('lifecycle'), 80);
    const account = await value('storeRewardAccounts/lifecycle');
    assert.equal(account.holds[reserved.reservationId].orderKey, key);
    assert.equal(account.pendingReservationId, '');
    await update(ref(database), {
      [`orderHistory/2026-10-14/${key}`]: await value(`orders/${key}`), [`orders/${key}`]: null,
    });
    const now = Date.now() + 86400000;
    await auditStoreRewardReservations({ databaseInstance: database, now });
    await auditStoreRewardReservations({ databaseInstance: database, now });
    assert.equal(await balance('lifecycle'), 80);
    assert.equal(await value(`storeRewardTransactions/lifecycle/reverse_${reserved.reservationId}`), null);
  });
  await test('legacy sent order only in history is linked, never refunded', async () => {
    await seed('legacy', 'legacy-hold');
    await set(ref(database, 'orderHistory/2026-10-14/legacy-order'), order('legacy', 'legacy-hold'));
    const result = await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(result.released, 0);
    assert.equal(await balance('legacy'), 80);
    assert.equal((await value('storeRewardAccounts/legacy/holds/legacy-hold')).orderKey, 'legacy-order');
    assert.equal((await value('storeRewardTransactions/legacy/legacy-hold')).orderKey, 'legacy-order');
  });
  await test('deleted current order is protected by immutable original', async () => {
    await seed('original', 'original-hold');
    // Owner fixture bypasses snapshot validation; the application never rewrites originals.
    await admin('PUT', 'orderOriginals/2026-10-14/original-order', order('original', 'original-hold'));
    await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(await balance('original'), 80);
    assert.equal((await value('storeRewardAccounts/original/holds/original-hold')).orderKey, 'original-order');
  });
  await test('checkout across midnight is found on the following day', async () => {
    await seed('midnight', 'midnight-hold', { requestedAt: Date.parse('2026-10-15T05:59:59Z') });
    await set(ref(database, 'orderHistory/2026-10-15/midnight-order'), order('midnight', 'midnight-hold', { fecha: '2026-10-15' }));
    await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(await balance('midnight'), 80);
    assert.equal((await value('storeRewardAccounts/midnight/holds/midnight-hold')).orderKey, 'midnight-order');
  });
  for (const stage of ['ledger', 'unlock']) {
    await test(`partial ${stage} failure is repaired with point reads and no balance change`, async () => {
      const uid = `partial-${stage}`;
      await seed(uid, 'partial-hold');
      const denied = structuredClone(rules);
      if (stage === 'ledger') {
        denied.rules.storeRewardTransactions = { '.read': 'auth != null', '.write': false };
      } else {
        denied.rules.storeRewardAccounts.$uid['.validate'] = "newData.child('pendingReservationId').val() == data.child('pendingReservationId').val()";
      }
      await admin('PUT', '.settings/rules', denied);
      await assert.rejects(linkRewardReservationToOrder(options(uid, 'partial-hold', 'partial-order')), /permission_denied|PERMISSION_DENIED/i);
      assert.equal((await value(`storeRewardAccounts/${uid}/holds/partial-hold`)).orderKey, 'partial-order');
      assert.equal((await value(`storeRewardAccounts/${uid}`)).pendingReservationId, 'partial-hold');
      const recoveryRules = structuredClone(rules);
      recoveryRules.rules.orders = { '.read': false, '.write': false };
      recoveryRules.rules.orderHistory = { '.read': false, '.write': false };
      recoveryRules.rules.orderOriginals = { '.read': false, '.write': false };
      await admin('PUT', '.settings/rules', recoveryRules);
      const recoveryDb = connect(`gold-partial-${stage}`);
      await auditStoreRewardReservations({ databaseInstance: recoveryDb, now: auditNow });
      assert.equal(await balance(uid), 80);
      assert.equal((await value(`storeRewardAccounts/${uid}`)).pendingReservationId, '');
      assert.equal((await value(`storeRewardTransactions/${uid}/partial-hold`)).orderKey, 'partial-order');
      await admin('PUT', '.settings/rules', rules);
    });
  }
  await test('unknown/missing/old dates fail closed, pending review without credit', async () => {
    await seed('unknown', 'unknown-hold');
    await seed('old', 'old-hold', { requestedAt: Date.parse('2026-01-01T12:00:00Z') });
    await seed('missing-date', 'missing-date-hold', { requestedAt: 0 });
    const result = await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(result.reviewCount, 3);
    assert.equal(result.released, 0);
    for (const uid of ['unknown', 'old', 'missing-date']) assert.equal(await balance(uid), 80);
  });
  await test('already linked order remains protected beyond history retention', async () => {
    await seed('retained-link', 'retained-hold', { orderKey: 'very-old-order', requestedAt: 1 });
    await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(await balance('retained-link'), 80);
    assert.equal((await releaseStoreRewardReservation(options('retained-link', 'retained-hold'))).reason, 'order_mismatch');
  });
  await test('confirmed cancellation refunds once and records order association', async () => {
    await seed('canceled', 'cancel-hold');
    const key = 'cancel-order';
    const current = order('canceled', 'cancel-hold', { estado: 'Cancelado', rewardPoints: {} });
    await set(ref(database, `orders/${key}`), current);
    await manager.syncOrderRewards(key, current);
    await manager.syncOrderRewards(key, current); // Simulate stale event after restart.
    assert.equal(await balance('canceled'), 1580);
    assert.equal((await value(`orders/${key}/rewardRedemption`)).status, 'refunded');
    assert.equal((await value('storeRewardTransactions/canceled/reverse_cancel-hold')).orderKey, key);
  });
  await test('delivered redemption settles exactly once, no new balance debit', async () => {
    await seed('delivered', 'delivered-hold');
    const key = 'delivered-order';
    const current = order('delivered', 'delivered-hold', { estado: 'Entregado' });
    await set(ref(database, `orders/${key}`), current);
    await manager.syncOrderRewards(key, current);
    await manager.syncOrderRewards(key, current);
    assert.equal(await balance('delivered'), 80);
    assert.equal((await value('storeRewardAccounts/delivered')).lifetimePointsRedeemed, 1500);
    assert.equal((await value(`orders/${key}/rewardRedemption`)).status, 'redeemed');
    assert.equal((await releaseStoreRewardReservation(options('delivered', 'delivered-hold', key))).reason, 'already_settled');
  });
  await test('failed ledger write retries from receipt without a second refund', async () => {
    await seed('repair', 'repair-hold', { orderKey: 'repair-order' });
    const result = await releaseStoreRewardReservation(options('repair', 'repair-hold', 'repair-order'));
    assert.equal(result.restored, true);
    await admin('DELETE', 'storeRewardTransactions/repair/reverse_repair-hold');
    await admin('PATCH', 'storeRewardTransactions/repair/repair-hold', { status: 'linked' });
    const retry = await releaseStoreRewardReservation(options('repair', 'repair-hold', 'repair-order'));
    assert.equal(retry.reason, 'already_released');
    assert.equal(await balance('repair'), 1580);
    assert.equal((await value('storeRewardTransactions/repair/repair-hold')).status, 'reversed');
    assert.equal((await value('storeRewardTransactions/repair/reverse_repair-hold')).points, 1500);
  });
  await test('two simultaneous refunds produce one credit and one ledger record', async () => {
    await seed('double', 'double-hold', { orderKey: 'double-order' });
    const results = await Promise.all([
      releaseStoreRewardReservation(options('double', 'double-hold', 'double-order')),
      releaseStoreRewardReservation(options('double', 'double-hold', 'double-order', secondDatabase)),
    ]);
    assert.equal(results.filter((entry) => entry.restored).length, 1);
    assert.equal(await balance('double'), 1580);
    assert.equal(Object.values(await value('storeRewardTransactions/double')).filter((entry) => entry.type === 'reversed').length, 1);
  });
  await test('settlement versus refund transaction retries cannot fabricate ledger credit', async () => {
    for (let index = 0; index < 5; index++) {
      const uid = `race-${index}`;
      await seed(uid, 'race-hold', { orderKey: 'race-order' });
      const [settled, refunded] = await Promise.all([
        settleStoreRewardReservation(options(uid, 'race-hold', 'race-order')),
        releaseStoreRewardReservation(options(uid, 'race-hold', 'race-order', secondDatabase)),
      ]);
      assert.notEqual(settled.settled, refunded.restored);
      assert.equal(await balance(uid), refunded.restored ? 1580 : 80);
      const reversal = await value(`storeRewardTransactions/${uid}/reverse_race-hold`);
      assert.equal(Boolean(reversal), refunded.restored);
    }
  });
  await test('linking cannot resurrect a concurrently released hold', async () => {
    await seed('link-race', 'link-race-hold');
    await Promise.all([
      linkRewardReservationToOrder(options('link-race', 'link-race-hold', 'link-order')),
      releaseStoreRewardReservation(options('link-race', 'link-race-hold', '', secondDatabase)),
    ]);
    const account = await value('storeRewardAccounts/link-race');
    assert.equal(Boolean(account.holds?.['link-race-hold']), account.pointsBalance === 80);
  });
  await test('manual correction stays untouched; no attempt to debit missing hold', async () => {
    await set(ref(database, 'storeRewardAccounts/manual-corrected'), { customerId: 'manual-corrected', pointsBalance: 80, lifetimePointsEarned: 1580 });
    await set(ref(database, 'orderHistory/2026-10-14/manual-order'), order('manual-corrected', 'missing-hold'));
    await set(ref(database, 'storeRewardTransactions/manual-corrected/adjust-manual'), { type: 'adjusted', signedPoints: -1500 });
    const before = await value('storeRewardAccounts/manual-corrected');
    await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    await manager.syncOrderRewards('manual-order', order('manual-corrected', 'missing-hold'), 'orderHistory/2026-10-14');
    assert.deepEqual(await value('storeRewardAccounts/manual-corrected'), before);
    assert.deepEqual(await value('storeRewardTransactions/manual-corrected'), { 'adjust-manual': { type: 'adjusted', signedPoints: -1500 } });
  });
  await test('two orders sharing a reservation are flagged, never silently linked', async () => {
    await seed('conflicting-orders', 'conflicting-hold');
    await set(ref(database, 'orderHistory/2026-10-14/conflict-a'), order('conflicting-orders', 'conflicting-hold'));
    await set(ref(database, 'orderHistory/2026-10-14/conflict-b'), order('conflicting-orders', 'conflicting-hold'));
    const result = await auditStoreRewardReservations({ databaseInstance: database, now: auditNow });
    assert.equal(result.review.find((entry) => entry.userKey === 'conflicting-orders')?.reason, 'order_conflict');
    const account = await value('storeRewardAccounts/conflicting-orders');
    assert.equal(account.pointsBalance, 80);
    assert.equal(account.pendingReservationId, 'conflicting-hold');
    assert.equal(account.holds['conflicting-hold'].orderKey, undefined);
  });
  await test('conflicting ledger binding preserves the hold and pending checkout lock', async () => {
    await seed('conflicting-ledger', 'ledger-hold');
    await update(ref(database, 'storeRewardTransactions/conflicting-ledger/ledger-hold'), { orderKey: 'order-a' });
    const before = await value('storeRewardAccounts/conflicting-ledger');
    const result = await linkRewardReservationToOrder(options('conflicting-ledger', 'ledger-hold', 'order-b'));
    assert.deepEqual(result, { linked: false, reason: 'order_mismatch' });
    assert.deepEqual(await value('storeRewardAccounts/conflicting-ledger'), before);
    assert.equal((await value('storeRewardTransactions/conflicting-ledger/ledger-hold')).orderKey, 'order-a');
    await update(ref(database, 'storeRewardTransactions/conflicting-ledger/ledger-hold'), { orderKey: null });
  });
  await test('forced offline earned-points reversal retry cannot overwrite the true movement', async () => {
    await set(ref(database, 'storeRewardAccounts/earned-retry'), {
      customerId: 'earned-retry', pointsBalance: 80, lifetimePointsEarned: 1580,
      earnedOrderPoints: { 'earned-order': { points: 79, awardedAt: requestedAt } },
    });
    await get(ref(secondDatabase, 'storeRewardAccounts/earned-retry'));
    goOffline(secondDatabase);
    const staleAttempt = reverseStoreRewardEarnedPoints({
      userKey: 'earned-retry', orderKey: 'earned-order', note: 'Stale retry', databaseInstance: secondDatabase,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const first = await reverseStoreRewardEarnedPoints({
      userKey: 'earned-retry', orderKey: 'earned-order', note: 'Confirmed cancellation', databaseInstance: database,
    });
    assert.equal(first.reversed, true);
    const ledger = await value('storeRewardTransactions/earned-retry/reversed_earned-order');
    goOnline(secondDatabase);
    const retried = await staleAttempt;
    assert.equal(retried.reversed, false);
    assert.equal(await balance('earned-retry'), 1);
    assert.deepEqual(await value('storeRewardTransactions/earned-retry/reversed_earned-order'), ledger);
  });
  await test('unavailable history fails closed, never releases points', async () => {
    const denied = structuredClone(rules);
    denied.rules.orderHistory['.read'] = false;
    denied.rules.orderOriginals['.read'] = false;
    await admin('PUT', '.settings/rules', denied);
    const before = await balance('unknown');
    const isolatedDatabase = connect('gold-no-history');
    await assert.rejects(auditStoreRewardReservations({ databaseInstance: isolatedDatabase, now: auditNow }), /permission_denied|Permission denied|PERMISSION_DENIED/i);
    assert.equal(await balance('unknown'), before);
    await admin('PUT', '.settings/rules', rules);
  });
  await test('unresolved reviews reuse cache instead of scanning history every ten minutes', async () => {
    const reviewCache = new Map();
    const first = await auditStoreRewardReservations({ databaseInstance: database, now: auditNow, reviewCache });
    assert.ok(first.reviewCount >= 3);
    const denied = structuredClone(rules);
    denied.rules.orderHistory['.read'] = false;
    denied.rules.orderOriginals['.read'] = false;
    await admin('PUT', '.settings/rules', denied);
    const isolatedDatabase = connect('gold-cached-review');
    const second = await auditStoreRewardReservations({ databaseInstance: isolatedDatabase, now: auditNow + 600000, reviewCache });
    assert.equal(second.reviewCount, first.reviewCount);
    assert.equal(second.released, 0);
    await admin('PUT', '.settings/rules', rules);
  });
  console.log(`Gold reservation safety: ${checks} scenarios passed (emulator only).`);
} finally {
  for (const app of apps) await deleteApp(app);
}
