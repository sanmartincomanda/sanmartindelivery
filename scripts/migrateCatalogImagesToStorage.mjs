import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getDatabase, get, ref, update } from 'firebase/database';
import { getDownloadURL, getStorage, ref as storageRef, uploadString } from 'firebase/storage';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const STORE_CATALOG_PATH = 'storeCatalog';
const STORE_CATALOG_META_PATH = 'storeCatalogMeta';
const STORAGE_UPLOAD_TIMEOUT_MS = 20000;
const IMAGE_UPLOAD_CONCURRENCY = 3;
const UPDATE_BATCH_SIZE = 20;
const cwd = process.cwd();

const app = initializeApp(FIREBASE_CONFIG);
const database = getDatabase(app);
const storage = getStorage(app);

const isDataUrlImage = (value = '') =>
  /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());

const cleanCatalogCode = (code) =>
  String(code || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

const inferImageExtension = (dataUrl = '') => {
  const normalized = String(dataUrl || '').trim().toLowerCase();
  if (normalized.startsWith('data:image/png')) {
    return 'png';
  }
  if (normalized.startsWith('data:image/webp')) {
    return 'webp';
  }
  if (normalized.startsWith('data:image/gif')) {
    return 'gif';
  }
  return 'jpg';
};

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolvePromise(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        rejectPromise(error);
      });
  });

const createImageHash = (value = '', hashHint = '') => {
  const cleanHint = String(hashHint || '').trim();
  if (cleanHint) {
    return cleanHint;
  }

  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
};

const formatStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const formatSize = (bytes = 0) => {
  const numeric = Number(bytes || 0);
  if (numeric >= 1024 * 1024) {
    return `${(numeric / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (numeric >= 1024) {
    return `${(numeric / 1024).toFixed(2)} KB`;
  }
  return `${numeric} B`;
};

const byteLengthOfJson = (value) => Buffer.byteLength(JSON.stringify(value || {}), 'utf8');

const mapWithConcurrency = async (items, limit, iterator) => {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, list.length || 1)) },
    async () => {
      while (true) {
        const index = cursor;
        cursor += 1;

        if (index >= list.length) {
          break;
        }

        results[index] = await iterator(list[index], index);
      }
    }
  );

  await Promise.all(workers);
  return results;
};

const uploadCatalogImage = async ({ code, dataUrl, hashHint = '' }) => {
  const cleanCode = cleanCatalogCode(code) || 'sku';
  const imageHash = createImageHash(dataUrl, hashHint);
  const extension = inferImageExtension(dataUrl);
  const imageStoragePath = `store/catalog/${cleanCode}/${imageHash || Date.now()}.${extension}`;
  const imageRef = storageRef(storage, imageStoragePath);

  await withTimeout(
    uploadString(imageRef, dataUrl, 'data_url'),
    STORAGE_UPLOAD_TIMEOUT_MS,
    'La subida de la foto a Firebase Storage tardo demasiado.'
  );

  return {
    image: await withTimeout(
      getDownloadURL(imageRef),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'No se pudo obtener la URL publica de la foto en Firebase Storage.'
    ),
    imageStoragePath,
    imageHash,
  };
};

async function main() {
  const snapshot = await get(ref(database, STORE_CATALOG_PATH));
  const currentCatalog = snapshot.val() || {};
  const currentEntries = Object.entries(currentCatalog);
  const inlineEntries = currentEntries.filter(([, product]) => isDataUrlImage(product?.image));
  const beforeBytes = byteLengthOfJson(currentCatalog);

  console.log(`Catalogo actual: ${currentEntries.length} productos`);
  console.log(`Fotos inline detectadas: ${inlineEntries.length}`);
  console.log(`Tamano actual de storeCatalog: ${formatSize(beforeBytes)}`);

  if (inlineEntries.length === 0) {
    console.log('No hay fotos inline pendientes. No se hicieron cambios.');
    return;
  }

  const backupDir = resolve(cwd, 'sync-backups');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const backupPath = resolve(
    backupDir,
    `store-catalog-before-inline-image-migration-${formatStamp()}.json`
  );
  writeFileSync(backupPath, JSON.stringify(currentCatalog, null, 2), 'utf8');
  console.log(`Backup creado en: ${backupPath}`);

  const uploadResults = await mapWithConcurrency(
    inlineEntries,
    IMAGE_UPLOAD_CONCURRENCY,
    async ([key, product], index) => {
      const productName = String(product?.name || '').trim() || key;
      try {
        const uploaded = await uploadCatalogImage({
          code: product?.code || key,
          dataUrl: String(product?.image || '').trim(),
          hashHint: String(product?.sync?.sicarImageHash || '').trim(),
        });

        console.log(
          `[${index + 1}/${inlineEntries.length}] OK ${key} - ${productName}`
        );

        return {
          success: true,
          key,
          product,
          uploaded,
        };
      } catch (error) {
        console.warn(
          `[${index + 1}/${inlineEntries.length}] ERROR ${key} - ${productName}: ${error.message}`
        );
        return {
          success: false,
          key,
          product,
          error: error.message,
        };
      }
    }
  );

  const successfulResults = uploadResults.filter((result) => result?.success);
  const failedResults = uploadResults.filter((result) => !result?.success);
  let pendingUpdates = {};
  let pendingCount = 0;

  const flushUpdates = async () => {
    if (pendingCount === 0) {
      return;
    }

    await update(ref(database), pendingUpdates);
    pendingUpdates = {};
    pendingCount = 0;
  };

  successfulResults.forEach(({ key, product, uploaded }) => {
    pendingUpdates[`${STORE_CATALOG_PATH}/${key}/image`] = uploaded.image;
    pendingUpdates[`${STORE_CATALOG_PATH}/${key}/imageStoragePath`] = uploaded.imageStoragePath;

    if (product?.sync && typeof product.sync === 'object') {
      pendingUpdates[`${STORE_CATALOG_PATH}/${key}/sync/sicarImageUrl`] =
        uploaded.image;
      pendingUpdates[`${STORE_CATALOG_PATH}/${key}/sync/sicarImageHash`] =
        uploaded.imageHash;

      if (Object.prototype.hasOwnProperty.call(product.sync, 'sicarImage')) {
        pendingUpdates[`${STORE_CATALOG_PATH}/${key}/sync/sicarImage`] = null;
      }
    }

    pendingCount += 1;
  });

  const updateEntries = Object.entries(pendingUpdates);
  for (let index = 0; index < updateEntries.length; index += UPDATE_BATCH_SIZE) {
    const chunk = Object.fromEntries(updateEntries.slice(index, index + UPDATE_BATCH_SIZE));
    await update(ref(database), chunk);
  }

  if (successfulResults.length > 0) {
    await update(ref(database, STORE_CATALOG_META_PATH), {
      updatedAt: Date.now(),
      updatedAtIso: new Date().toISOString(),
      imageMigrationAt: new Date().toISOString(),
      imageMigrationCount: successfulResults.length,
    });
  }

  const afterSnapshot = await get(ref(database, STORE_CATALOG_PATH));
  const afterCatalog = afterSnapshot.val() || {};
  const afterEntries = Object.entries(afterCatalog);
  const remainingInline = afterEntries.filter(([, product]) => isDataUrlImage(product?.image));
  const afterBytes = byteLengthOfJson(afterCatalog);

  console.log('');
  console.log(`Migradas correctamente: ${successfulResults.length}`);
  console.log(`Fallidas: ${failedResults.length}`);
  console.log(`Fotos inline restantes: ${remainingInline.length}`);
  console.log(`Tamano anterior: ${formatSize(beforeBytes)}`);
  console.log(`Tamano actual: ${formatSize(afterBytes)}`);
  console.log(`Reduccion estimada: ${formatSize(Math.max(beforeBytes - afterBytes, 0))}`);

  if (failedResults.length > 0) {
    console.log('');
    console.log('Productos con error:');
    failedResults.slice(0, 25).forEach((result) => {
      console.log(`- ${result.key} | ${result.product?.name || 'Sin nombre'} | ${result.error}`);
    });
  }
}

main().catch((error) => {
  console.error('Fallo la migracion de fotos del catalogo:', error);
  process.exitCode = 1;
});
