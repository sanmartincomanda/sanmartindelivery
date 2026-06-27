import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com';

const applyChanges = process.argv.includes('--apply');

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    databaseURL: DATABASE_URL,
  });
}

const auth = getAuth();
const db = getDatabase();

const chunk = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const isStoreClientRecord = (client = {}, storeUserKeys = new Set()) => {
  const storeUserKey = String(client.storeUserKey || '').trim();
  const code = String(client.codigo || '').trim().toUpperCase();

  return (
    client.origen === 'tienda_virtual' ||
    (storeUserKey && storeUserKeys.has(storeUserKey)) ||
    code.startsWith('TV-')
  );
};

async function deleteAuthUsers(uids) {
  const results = {
    success: 0,
    errors: [],
  };

  for (const uidBatch of chunk(uids, 1000)) {
    const result = await auth.deleteUsers(uidBatch);
    results.success += result.successCount;
    results.errors.push(...result.errors);
  }

  return results;
}

async function main() {
  const [storeUsersSnapshot, userRolesSnapshot, clientsSnapshot] = await Promise.all([
    db.ref('storeUsers').get(),
    db.ref('userRoles').get(),
    db.ref('clients').get(),
  ]);

  const storeUsers = storeUsersSnapshot.val() || {};
  const userRoles = userRolesSnapshot.val() || {};
  const clients = clientsSnapshot.val() || {};

  const storeUserKeys = new Set(Object.keys(storeUsers));
  const clientRoleUids = Object.entries(userRoles)
    .filter(([, role]) => role?.role === 'client')
    .map(([uid]) => uid);
  const clientIds = Object.entries(clients)
    .filter(([, client]) => isStoreClientRecord(client, storeUserKeys))
    .map(([clientId]) => clientId);
  const authUids = Array.from(new Set([...storeUserKeys, ...clientRoleUids]));

  console.log('Limpieza de clientes tienda virtual');
  console.log(`Modo: ${applyChanges ? 'APLICAR' : 'SOLO REPORTE'}`);
  console.log(`storeUsers a borrar: ${storeUserKeys.size}`);
  console.log(`roles client a borrar: ${clientRoleUids.length}`);
  console.log(`clientes tienda_virtual a borrar: ${clientIds.length}`);
  console.log(`Auth users candidatos a borrar: ${authUids.length}`);

  if (!applyChanges) {
    console.log('Ejecuta con --apply para borrar.');
    return;
  }

  const updates = {};
  for (const userKey of storeUserKeys) {
    updates[`storeUsers/${userKey}`] = null;
  }
  for (const uid of clientRoleUids) {
    updates[`userRoles/${uid}`] = null;
  }
  for (const clientId of clientIds) {
    updates[`clients/${clientId}`] = null;
  }

  if (Object.keys(updates).length > 0) {
    await db.ref().update(updates);
  }

  const authResults = authUids.length > 0 ? await deleteAuthUsers(authUids) : { success: 0, errors: [] };

  console.log('Limpieza aplicada.');
  console.log(`Auth users borrados: ${authResults.success}`);
  if (authResults.errors.length > 0) {
    console.log(`Auth users no borrados/no encontrados: ${authResults.errors.length}`);
    authResults.errors.slice(0, 10).forEach((item) => {
      console.log(`- ${item.index}: ${item.error?.code || item.error?.message || 'error'}`);
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.goOffline();
    process.exit(process.exitCode || 0);
  });
