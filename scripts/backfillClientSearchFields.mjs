import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, ref, update } from 'firebase/database';
import { buildClientRecordForWrite } from '../src/services/clientModel.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const CLIENTS_PATH = 'clients';
const UPDATE_BATCH_SIZE = 300;

const getFirebaseDatabase = () => {
  const existingApp = getApps().find((entry) => entry.name === 'client-search-backfill');
  const app = existingApp || initializeApp(FIREBASE_CONFIG, 'client-search-backfill');
  return getDatabase(app);
};

const splitIntoBatches = (entries, size = UPDATE_BATCH_SIZE) => {
  const batches = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
};

const toComparable = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const formatStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

async function main() {
  const database = getFirebaseDatabase();
  const snapshot = await get(ref(database, CLIENTS_PATH));
  const clients = snapshot.val() || {};
  const backupDir = resolve(process.cwd(), 'sync-backups');
  const timestamp = Date.now();

  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = resolve(backupDir, `clients-before-search-backfill-${formatStamp()}.json`);
  writeFileSync(backupPath, JSON.stringify(clients, null, 2), 'utf8');

  const updates = {};
  let changedClients = 0;
  let scannedClients = 0;

  Object.entries(clients).forEach(([firebaseKey, value]) => {
    scannedClients += 1;
    const currentRecord = value && typeof value === 'object' ? value : {};
    const nextRecord = buildClientRecordForWrite(currentRecord, {
      touchUpdatedAt: false,
      fallbackUpdatedAt:
        currentRecord.updatedAt ?? currentRecord.createdAt ?? currentRecord.timestamp ?? timestamp,
    });

    const patch = Object.entries(nextRecord).reduce((accumulator, [field, nextValue]) => {
      if (toComparable(currentRecord[field]) !== toComparable(nextValue)) {
        accumulator[field] = nextValue;
      }
      return accumulator;
    }, {});

    if (!Object.keys(patch).length) {
      return;
    }

    Object.entries(patch).forEach(([field, nextValue]) => {
      updates[`${CLIENTS_PATH}/${firebaseKey}/${field}`] = nextValue;
    });

    changedClients += 1;
  });

  const updateEntries = Object.entries(updates);
  const batches = splitIntoBatches(updateEntries);

  for (const batch of batches) {
    await update(ref(database), Object.fromEntries(batch));
  }

  console.log(`Backup clientes: ${backupPath}`);
  console.log(`Clientes escaneados: ${scannedClients}`);
  console.log(`Clientes con patch: ${changedClients}`);
  console.log(`Campos actualizados: ${updateEntries.length}`);
  console.log(`Lotes aplicados: ${batches.length}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('No se pudo completar el backfill de clientes:', error);
    process.exit(1);
  });
