import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { storeFirestore, storeStorage } from '../firebaseStore.js';

export const STORE_DATA_MODE_LEGACY = 'legacy';
export const STORE_DATA_MODE_HYBRID = 'hybrid';
export const STORE_DATA_MODE_NEW = 'new';
export const STORE_DATA_MODE_STORAGE_KEY = 'sanmartin_store_data_mode';

export const STORE_PROJECT_COLLECTIONS = {
  catalog: 'storeCatalog',
  categories: 'storeCategories',
  coupons: 'storeCoupons',
  promotions: 'storePromotions',
  meta: 'storeMeta',
};

export const STORE_PROJECT_META_DOCS = {
  catalog: 'catalog',
};

export const STORE_PUBLIC_SNAPSHOT_ROOT = 'storefront';
export const STORE_PUBLIC_SNAPSHOT_NAMES = {
  catalog: 'catalog',
  catalogMeta: 'meta',
  categories: 'categories',
  coupons: 'coupons',
  promotions: 'promotions',
};

const FIRESTORE_BATCH_LIMIT = 250;
const STORAGE_UPLOAD_TIMEOUT_MS = 20000;

const STORE_DATA_MODES = new Set([
  STORE_DATA_MODE_LEGACY,
  STORE_DATA_MODE_HYBRID,
  STORE_DATA_MODE_NEW,
]);

const getImportMetaEnvMode = () => {
  try {
    return String(import.meta?.env?.VITE_STORE_DATA_MODE || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const getWindowModeOverride = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  const globalOverride = String(window.__SANMARTIN_STORE_DATA_MODE__ || '').trim().toLowerCase();
  if (globalOverride) {
    return globalOverride;
  }

  try {
    return String(window.localStorage.getItem(STORE_DATA_MODE_STORAGE_KEY) || '')
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
};

export const normalizeStoreDataMode = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return STORE_DATA_MODES.has(normalized) ? normalized : STORE_DATA_MODE_HYBRID;
};

export const getStoreDataMode = () =>
  normalizeStoreDataMode(getWindowModeOverride() || getImportMetaEnvMode() || STORE_DATA_MODE_HYBRID);

export const shouldUseLegacyStoreData = (mode = getStoreDataMode()) =>
  normalizeStoreDataMode(mode) === STORE_DATA_MODE_LEGACY;

export const shouldAllowLegacyStoreFallback = (mode = getStoreDataMode()) =>
  normalizeStoreDataMode(mode) === STORE_DATA_MODE_HYBRID;

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

const splitIntoChunks = (entries = [], size = FIRESTORE_BATCH_LIMIT) => {
  const chunkSize = Math.max(1, Number(size || FIRESTORE_BATCH_LIMIT));
  const chunks = [];

  for (let index = 0; index < entries.length; index += chunkSize) {
    chunks.push(entries.slice(index, index + chunkSize));
  }

  return chunks;
};

const sanitizeDocId = (value) => String(value || '').trim().replace(/[.#$/[\]]/g, '_');

export const getStoreProjectDocRef = (collectionName, docId) =>
  doc(storeFirestore, String(collectionName || '').trim(), sanitizeDocId(docId));

export const getStoreProjectCollectionRef = (collectionName) =>
  collection(storeFirestore, String(collectionName || '').trim());

export async function readStoreProjectCollectionMap(collectionName) {
  const snapshot = await getDocs(getStoreProjectCollectionRef(collectionName));
  const map = {};

  snapshot.forEach((documentSnapshot) => {
    map[documentSnapshot.id] = documentSnapshot.data() || {};
  });

  return map;
}

export async function readStoreProjectDoc(collectionName, docId) {
  const snapshot = await getDoc(getStoreProjectDocRef(collectionName, docId));
  return snapshot.exists() ? snapshot.data() || null : null;
}

export async function writeStoreProjectDoc(collectionName, docId, data, options = {}) {
  const documentRef = getStoreProjectDocRef(collectionName, docId);
  await setDoc(documentRef, data || {}, { merge: options.merge === true });
  return sanitizeDocId(docId);
}

export async function updateStoreProjectDoc(collectionName, docId, patch = {}) {
  await updateDoc(getStoreProjectDocRef(collectionName, docId), patch || {});
  return sanitizeDocId(docId);
}

export async function deleteStoreProjectDoc(collectionName, docId) {
  await deleteDoc(getStoreProjectDocRef(collectionName, docId));
  return sanitizeDocId(docId);
}

export async function writeStoreProjectCollectionMap(collectionName, map = {}, options = {}) {
  const entries = Object.entries(map || {}).filter(([key]) => sanitizeDocId(key));
  const mergeWrites = options.merge !== false;
  const deleteMissingKeys = Array.isArray(options.deleteMissingKeys)
    ? options.deleteMissingKeys.filter(Boolean)
    : [];

  for (const chunkEntries of splitIntoChunks(entries, options.batchSize || FIRESTORE_BATCH_LIMIT)) {
    const batch = writeBatch(storeFirestore);
    chunkEntries.forEach(([docId, value]) => {
      batch.set(getStoreProjectDocRef(collectionName, docId), value || {}, { merge: mergeWrites });
    });
    await batch.commit();
  }

  for (const chunkKeys of splitIntoChunks(deleteMissingKeys, options.batchSize || FIRESTORE_BATCH_LIMIT)) {
    const batch = writeBatch(storeFirestore);
    chunkKeys.forEach((docId) => {
      batch.delete(getStoreProjectDocRef(collectionName, docId));
    });
    await batch.commit();
  }

  return entries.length;
}

export const getStoreSnapshotPath = (snapshotName) =>
  `${STORE_PUBLIC_SNAPSHOT_ROOT}/${String(snapshotName || '').trim()}.json`;

export const getStoreSnapshotRef = (snapshotName) =>
  storageRef(storeStorage, getStoreSnapshotPath(snapshotName));

export async function publishStoreSnapshot(snapshotName, payload, options = {}) {
  const body = JSON.stringify(payload ?? {}, null, options.pretty === true ? 2 : 0);

  await withTimeout(
    uploadString(
      getStoreSnapshotRef(snapshotName),
      body,
      'raw',
      {
        contentType: 'application/json; charset=utf-8',
        cacheControl: String(options.cacheControl || 'public,max-age=60'),
      }
    ),
    STORAGE_UPLOAD_TIMEOUT_MS,
    `La publicacion del snapshot ${snapshotName} tardo demasiado.`
  );

  return getStoreSnapshotPath(snapshotName);
}

export async function fetchStoreSnapshot(snapshotName) {
  try {
    const url = await withTimeout(
      getDownloadURL(getStoreSnapshotRef(snapshotName)),
      STORAGE_UPLOAD_TIMEOUT_MS,
      `No se pudo resolver la URL publica del snapshot ${snapshotName}.`
    );
    const response = await withTimeout(
      fetch(url, { cache: 'no-store' }),
      STORAGE_UPLOAD_TIMEOUT_MS,
      `La descarga del snapshot ${snapshotName} tardo demasiado.`
    );

    if (!response.ok) {
      throw new Error(`Snapshot ${snapshotName} respondio con ${response.status}.`);
    }

    return await response.json();
  } catch (error) {
    console.warn(`No se pudo cargar el snapshot publico ${snapshotName}.`, error);
    return null;
  }
}
