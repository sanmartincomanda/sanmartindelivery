import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, get, runTransaction, set, update } from 'firebase/database';
import { BOX_ANNOUNCEMENT_ID, nextBoxAnnouncementHistory } from '../src/services/storeBoxAnnouncement.js';
const namespace = 'demo-box-announcement';
const admin = async (route, body) => {
  const response = await fetch(`http://127.0.0.1:19000/${route}.json?ns=${namespace}`, {
    method: 'PUT', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.ok(response.ok, await response.text());
};
await admin('.settings/rules', JSON.parse(await readFile('firebase.database.rules.json', 'utf8')));
await admin('', { storeUsers: { buyer: { nombre: 'Fixture', customerDiscount: { percent: 5 } } } });
const apps = [];
function connection(name, uid) {
  const app = initializeApp({ projectId: namespace, databaseURL: `https://${namespace}.firebaseio.com` }, name);
  apps.push(app); const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 19000, { mockUserToken: { sub: uid, user_id: uid } }); return db;
}
const first = connection('first-device', 'buyer'), second = connection('second-device', 'buyer'), other = connection('other', 'stranger');
const path = `storeUsers/buyer/announcementViews/${BOX_ANNOUNCEMENT_ID}`;
const claim = (db, day) => runTransaction(ref(db, path), value => nextBoxAnnouncementHistory(value, Date.UTC(2026, 10, day, 12)), { applyLocally: false });
try {
  const results = await Promise.all([claim(first, 1), claim(second, 1)]);
  assert.equal(results.filter(result => result.committed).length, 1, 'Only one device claims the day');
  for (let day = 2; day <= 10; day++) assert.equal((await claim(first, day)).committed, true);
  assert.equal((await claim(second, 11)).committed, false);
  await assert.rejects(claim(other, 12), /permission_denied|PERMISSION_DENIED/i);
  await assert.rejects(set(ref(first, path + '/days/malformed'), true), /permission_denied|PERMISSION_DENIED/i);
  await assert.rejects(set(ref(first, path + '/count'), 11), /permission_denied|PERMISSION_DENIED/i);
  await assert.rejects(set(ref(first, path + '/unexpected'), true), /permission_denied|PERMISSION_DENIED/i);
  await assert.rejects(update(ref(first, 'storeUsers/buyer'), { customerDiscount: { percent: 90 } }), /permission_denied|PERMISSION_DENIED/i);
  const profile = (await get(ref(first, 'storeUsers/buyer'))).val();
  assert.equal(profile.nombre, 'Fixture'); assert.equal(profile.customerDiscount.percent, 5);
  assert.equal(Object.keys(profile.announcementViews[BOX_ANNOUNCEMENT_ID].days).length, 10);
  console.log('PASS emulator: own-profile transaction, cross-device contention, 10-day cap, other-account denial; profile and discounts unchanged.');
} finally { for (const app of apps) await deleteApp(app); }
