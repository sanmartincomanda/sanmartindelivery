import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com';

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    databaseURL: DATABASE_URL,
  });
}

const db = getDatabase();

const cleanText = (value = '') => String(value || '').trim();

const normalizeLocation = (value) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    label: cleanText(value.label),
  };
};

const normalizeDirectoryEntry = (client = {}) => ({
  nombre: cleanText(client.nombre),
  codigo: cleanText(client.codigo),
  direccion: cleanText(client.direccion),
  telefono: cleanText(client.telefono),
  ubicacion: normalizeLocation(client.ubicacion),
  origen: cleanText(client.origen) || 'manual',
  storeUserKey: cleanText(client.storeUserKey),
  createdByRole: cleanText(client.createdByRole),
  updatedAt: Date.now(),
});

async function main() {
  const snapshot = await db.ref('clients').get();
  const clients = snapshot.val() || {};
  const updates = {};

  Object.entries(clients).forEach(([key, client]) => {
    if (!client?.nombre && !client?.codigo) {
      return;
    }

    updates[`clientDirectory/${key}`] = normalizeDirectoryEntry(client);
  });

  if (Object.keys(updates).length === 0) {
    console.log('No hay clientes para sincronizar.');
    return;
  }

  await db.ref().update(updates);
  console.log(`clientDirectory sincronizado: ${Object.keys(updates).length} clientes.`);
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
