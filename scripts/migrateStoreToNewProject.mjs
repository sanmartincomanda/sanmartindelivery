import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { get, getDatabase, ref } from 'firebase/database';
import { cert, getApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const SOURCE_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const TARGET_SERVICE_ACCOUNT_PATH =
  process.env.STORE_FIREBASE_ADMIN_PATH ||
  'C:\\Users\\Microsoft Windows 11\\Downloads\\tiendavirtual-2ced1-firebase-adminsdk-fbsvc-cc56cfe448.json';
const TARGET_STORAGE_BUCKET = 'tiendavirtual-2ced1.firebasestorage.app';

const STORE_COLLECTIONS = {
  catalog: 'storeCatalog',
  categories: 'storeCategories',
  coupons: 'storeCoupons',
  promotions: 'storePromotions',
  meta: 'storeMeta',
};

const STORE_META_DOCS = {
  catalog: 'catalog',
};

const STORE_SNAPSHOTS = {
  catalog: 'storefront/catalog.json',
  categories: 'storefront/categories.json',
  coupons: 'storefront/coupons.json',
  promotions: 'storefront/promotions.json',
  meta: 'storefront/meta.json',
};

const BATCH_SIZE = 250;
const FETCH_TIMEOUT_MS = 20000;
const argv = new Set(process.argv.slice(2));
const parityOnly = argv.has('--parity-only');
const skipImages = argv.has('--skip-images');
const cwd = process.cwd();
const backupDir = resolve(cwd, 'sync-backups');

const formatStamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
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

const splitIntoChunks = (items = [], size = BATCH_SIZE) => {
  const source = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, Number(size || BATCH_SIZE));
  const chunks = [];

  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }

  return chunks;
};

const isDataUrlImage = (value = '') =>
  /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());

const isRemoteHttpImage = (value = '') =>
  /^https?:\/\//i.test(String(value || '').trim());

const cleanStorageSegment = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

const createImageHash = (value = '', hashHint = '') => {
  const cleanHint = String(hashHint || '').trim();
  if (cleanHint) {
    return cleanHint;
  }

  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
};

const inferImageExtension = (contentType = '', fallbackValue = '') => {
  const normalizedType = String(contentType || '').trim().toLowerCase();
  if (normalizedType.includes('png')) {
    return 'png';
  }
  if (normalizedType.includes('webp')) {
    return 'webp';
  }
  if (normalizedType.includes('gif')) {
    return 'gif';
  }
  if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) {
    return 'jpg';
  }

  const normalizedFallback = String(fallbackValue || '').trim().toLowerCase();
  if (normalizedFallback.includes('.png')) {
    return 'png';
  }
  if (normalizedFallback.includes('.webp')) {
    return 'webp';
  }
  if (normalizedFallback.includes('.gif')) {
    return 'gif';
  }

  return 'jpg';
};

const decodeDataUrl = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^data:([^;,]+)?;base64,(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    contentType: String(match[1] || 'image/jpeg').trim().toLowerCase(),
    buffer: Buffer.from(match[2], 'base64'),
  };
};

const buildStorageDownloadUrl = (bucketName, filePath) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;

const decodeStoragePathFromUrl = (value = '') => {
  const normalized = String(value || '').trim();
  const marker = '/o/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }

  const encodedPath = normalized.slice(markerIndex + marker.length).split('?')[0];
  if (!encodedPath) {
    return '';
  }

  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

const fetchRemoteImage = async (url) => {
  const response = await withTimeout(
    fetch(url, { cache: 'no-store' }),
    FETCH_TIMEOUT_MS,
    'La descarga de la imagen remota tardo demasiado.'
  );

  if (!response.ok) {
    throw new Error(`No se pudo descargar la imagen remota (${response.status}).`);
  }

  return {
    contentType: String(response.headers.get('content-type') || 'image/jpeg').trim().toLowerCase(),
    buffer: Buffer.from(await response.arrayBuffer()),
  };
};

const getSourceDatabase = () => {
  const existingApp = getApps().find((app) => app.name === 'store-source-rtdb');
  const app = existingApp || initializeClientApp(SOURCE_FIREBASE_CONFIG, 'store-source-rtdb');
  return getDatabase(app);
};

const getTargetAdminContext = () => {
  if (!existsSync(TARGET_SERVICE_ACCOUNT_PATH)) {
    throw new Error(`No se encontro el SDK admin en ${TARGET_SERVICE_ACCOUNT_PATH}`);
  }

  const serviceAccount = JSON.parse(readFileSync(TARGET_SERVICE_ACCOUNT_PATH, 'utf8'));
  const existingApp = getApps().find((app) => app.name === 'store-target-admin');
  const app =
    existingApp ||
    initializeAdminApp(
      {
        credential: cert(serviceAccount),
        storageBucket: TARGET_STORAGE_BUCKET,
      },
      'store-target-admin'
    );

  return {
    firestore: getFirestore(app),
    bucket: getStorage(app).bucket(TARGET_STORAGE_BUCKET),
  };
};

const readSourceStoreState = async () => {
  const database = getSourceDatabase();
  const [catalog, catalogMeta, categories, coupons, promotions] = await Promise.all([
    get(ref(database, 'storeCatalog')),
    get(ref(database, 'storeCatalogMeta')),
    get(ref(database, 'storeCategories')),
    get(ref(database, 'storeCoupons')),
    get(ref(database, 'storePromotions')),
  ]);

  return {
    catalog: catalog.val() || {},
    catalogMeta: catalogMeta.val() || {},
    categories: categories.val() || {},
    coupons: coupons.val() || {},
    promotions: promotions.val() || {},
  };
};

const copyImageToTargetBucket = async ({ bucket, root, entityId, image, hashHint = '' }) => {
  const source = String(image || '').trim();
  if (!source) {
    return {
      url: '',
      path: '',
      hash: String(hashHint || '').trim(),
    };
  }

  if (source.includes(TARGET_STORAGE_BUCKET)) {
    return {
      url: source,
      path: decodeStoragePathFromUrl(source),
      hash: String(hashHint || '').trim(),
    };
  }

  const cleanId = cleanStorageSegment(entityId) || 'item';
  const hash = createImageHash(source, hashHint);
  const rawPayload = isDataUrlImage(source)
    ? decodeDataUrl(source)
    : isRemoteHttpImage(source)
      ? await fetchRemoteImage(source)
      : null;

  if (!rawPayload?.buffer?.length) {
    return {
      url: source,
      path: decodeStoragePathFromUrl(source),
      hash,
    };
  }

  const extension = inferImageExtension(rawPayload.contentType, source);
  const filePath = `${String(root || 'store').replace(/\/+$/, '')}/${cleanId}/${hash || Date.now()}.${extension}`;
  const file = bucket.file(filePath);

  await file.save(rawPayload.buffer, {
    resumable: false,
    metadata: {
      contentType: rawPayload.contentType || 'image/jpeg',
      cacheControl: 'public,max-age=3600',
    },
  });

  return {
    url: buildStorageDownloadUrl(bucket.name, filePath),
    path: filePath,
    hash,
  };
};

const migrateCatalogImages = async (bucket, catalogMap = {}) => {
  const nextCatalog = {};
  let copiedCount = 0;

  for (const [productKey, product] of Object.entries(catalogMap || {})) {
    const currentProduct = product && typeof product === 'object' ? { ...product } : {};
    const imageSource =
      String(currentProduct.image || '').trim() ||
      String(currentProduct?.sync?.sicarImageUrl || '').trim() ||
      String(currentProduct?.sync?.sicarImage || '').trim();

    if (!imageSource) {
      nextCatalog[productKey] = currentProduct;
      continue;
    }

    const copiedImage = skipImages
      ? {
        url: imageSource,
        path: String(currentProduct.imageStoragePath || '').trim(),
        hash: String(currentProduct?.sync?.sicarImageHash || '').trim(),
      }
      : await copyImageToTargetBucket({
        bucket,
        root: 'store/catalog',
        entityId: currentProduct.code || productKey,
        image: imageSource,
        hashHint: currentProduct?.sync?.sicarImageHash || '',
      });

    if (!skipImages && copiedImage.path) {
      copiedCount += 1;
    }

    nextCatalog[productKey] = {
      ...currentProduct,
      image: copiedImage.url || imageSource,
      imageStoragePath: copiedImage.path || String(currentProduct.imageStoragePath || '').trim(),
      ...(currentProduct.sync && typeof currentProduct.sync === 'object'
        ? {
          sync: {
            ...currentProduct.sync,
            sicarImage: null,
            sicarImageUrl:
              copiedImage.url ||
              String(currentProduct.sync.sicarImageUrl || currentProduct.image || '').trim(),
            sicarImageHash:
              copiedImage.hash || String(currentProduct.sync.sicarImageHash || '').trim(),
          },
        }
        : {}),
    };
  }

  return {
    map: nextCatalog,
    copiedCount,
  };
};

const migratePromotionImages = async (bucket, promotionsMap = {}) => {
  const nextPromotions = {};
  let copiedCount = 0;

  for (const [promotionKey, promotion] of Object.entries(promotionsMap || {})) {
    const currentPromotion = promotion && typeof promotion === 'object' ? { ...promotion } : {};
    const imageSource = String(currentPromotion.image || '').trim();
    if (!imageSource) {
      nextPromotions[promotionKey] = currentPromotion;
      continue;
    }

    const copiedImage = skipImages
      ? {
        url: imageSource,
        path: String(currentPromotion.imageStoragePath || '').trim(),
      }
      : await copyImageToTargetBucket({
        bucket,
        root: 'store/promotions',
        entityId: currentPromotion.id || promotionKey,
        image: imageSource,
      });

    if (!skipImages && copiedImage.path) {
      copiedCount += 1;
    }

    nextPromotions[promotionKey] = {
      ...currentPromotion,
      image: copiedImage.url || imageSource,
      imageStoragePath: copiedImage.path || String(currentPromotion.imageStoragePath || '').trim(),
    };
  }

  return {
    map: nextPromotions,
    copiedCount,
  };
};

const readTargetCollectionMap = async (firestore, collectionName) => {
  const snapshot = await firestore.collection(collectionName).get();
  const map = {};
  snapshot.forEach((documentSnapshot) => {
    map[documentSnapshot.id] = documentSnapshot.data() || {};
  });
  return map;
};

const writeTargetCollectionMap = async (firestore, collectionName, nextMap = {}, options = {}) => {
  const currentMap = options.currentMap || (await readTargetCollectionMap(firestore, collectionName));
  const currentKeys = new Set(Object.keys(currentMap || {}));
  const nextKeys = new Set(Object.keys(nextMap || {}));
  const batchChunks = splitIntoChunks(Object.entries(nextMap || {}), BATCH_SIZE);

  for (const chunk of batchChunks) {
    const batch = firestore.batch();
    chunk.forEach(([docId, value]) => {
      batch.set(firestore.collection(collectionName).doc(docId), value || {}, { merge: false });
    });
    await batch.commit();
  }

  const keysToDelete = [...currentKeys].filter((key) => !nextKeys.has(key));
  for (const chunk of splitIntoChunks(keysToDelete, BATCH_SIZE)) {
    const batch = firestore.batch();
    chunk.forEach((docId) => {
      batch.delete(firestore.collection(collectionName).doc(docId));
    });
    await batch.commit();
  }

  return {
    writtenCount: Object.keys(nextMap || {}).length,
    deletedCount: keysToDelete.length,
  };
};

const publishSnapshots = async (bucket, payload) => {
  const uploads = [
    [STORE_SNAPSHOTS.catalog, payload.catalog],
    [STORE_SNAPSHOTS.categories, payload.categories],
    [STORE_SNAPSHOTS.coupons, payload.coupons],
    [STORE_SNAPSHOTS.promotions, payload.promotions],
    [STORE_SNAPSHOTS.meta, payload.catalogMeta],
  ];

  for (const [filePath, value] of uploads) {
    await bucket.file(filePath).save(JSON.stringify(value ?? {}, null, 0), {
      resumable: false,
      contentType: 'application/json; charset=utf-8',
      metadata: {
        cacheControl: 'public,max-age=60',
      },
    });
  }
};

const diffKeys = (sourceMap = {}, targetMap = {}) => {
  const sourceKeys = new Set(Object.keys(sourceMap || {}));
  const targetKeys = new Set(Object.keys(targetMap || {}));

  return {
    missingInTarget: [...sourceKeys].filter((key) => !targetKeys.has(key)),
    extraInTarget: [...targetKeys].filter((key) => !sourceKeys.has(key)),
  };
};

async function main() {
  mkdirSync(backupDir, { recursive: true });
  const stamp = formatStamp();
  const sourceState = await readSourceStoreState();

  writeFileSync(
    resolve(backupDir, `store-migration-source-${stamp}.json`),
    JSON.stringify(sourceState, null, 2),
    'utf8'
  );

  const { firestore, bucket } = getTargetAdminContext();

  const migratedCatalog = await migrateCatalogImages(bucket, sourceState.catalog);
  const migratedPromotions = await migratePromotionImages(bucket, sourceState.promotions);
  const nextState = {
    catalog: migratedCatalog.map,
    catalogMeta: {
      ...sourceState.catalogMeta,
      updatedAt: Number(sourceState.catalogMeta?.updatedAt || Date.now()),
      updatedAtIso: String(sourceState.catalogMeta?.updatedAtIso || new Date().toISOString()),
      migratedAt: new Date().toISOString(),
    },
    categories: sourceState.categories,
    coupons: sourceState.coupons,
    promotions: migratedPromotions.map,
  };

  if (!parityOnly) {
    const writeResults = {
      catalog: await writeTargetCollectionMap(firestore, STORE_COLLECTIONS.catalog, nextState.catalog),
      categories: await writeTargetCollectionMap(firestore, STORE_COLLECTIONS.categories, nextState.categories),
      coupons: await writeTargetCollectionMap(firestore, STORE_COLLECTIONS.coupons, nextState.coupons),
      promotions: await writeTargetCollectionMap(firestore, STORE_COLLECTIONS.promotions, nextState.promotions),
    };

    await firestore
      .collection(STORE_COLLECTIONS.meta)
      .doc(STORE_META_DOCS.catalog)
      .set(nextState.catalogMeta, { merge: false });
    await publishSnapshots(bucket, nextState);

    writeFileSync(
      resolve(backupDir, `store-migration-write-results-${stamp}.json`),
      JSON.stringify(writeResults, null, 2),
      'utf8'
    );
  }

  const [targetCatalog, targetCategories, targetCoupons, targetPromotions, targetCatalogMetaSnapshot] =
    await Promise.all([
      readTargetCollectionMap(firestore, STORE_COLLECTIONS.catalog),
      readTargetCollectionMap(firestore, STORE_COLLECTIONS.categories),
      readTargetCollectionMap(firestore, STORE_COLLECTIONS.coupons),
      readTargetCollectionMap(firestore, STORE_COLLECTIONS.promotions),
      firestore.collection(STORE_COLLECTIONS.meta).doc(STORE_META_DOCS.catalog).get(),
    ]);

  const parityReport = {
    generatedAt: new Date().toISOString(),
    parityOnly,
    skipImages,
    sourceCounts: {
      catalog: Object.keys(nextState.catalog || {}).length,
      categories: Object.keys(nextState.categories || {}).length,
      coupons: Object.keys(nextState.coupons || {}).length,
      promotions: Object.keys(nextState.promotions || {}).length,
    },
    targetCounts: {
      catalog: Object.keys(targetCatalog || {}).length,
      categories: Object.keys(targetCategories || {}).length,
      coupons: Object.keys(targetCoupons || {}).length,
      promotions: Object.keys(targetPromotions || {}).length,
    },
    copiedImages: {
      catalog: migratedCatalog.copiedCount,
      promotions: migratedPromotions.copiedCount,
    },
    diffs: {
      catalog: diffKeys(nextState.catalog, targetCatalog),
      categories: diffKeys(nextState.categories, targetCategories),
      coupons: diffKeys(nextState.coupons, targetCoupons),
      promotions: diffKeys(nextState.promotions, targetPromotions),
    },
    catalogMetaPresent: targetCatalogMetaSnapshot.exists,
  };

  const parityPath = resolve(backupDir, `store-migration-parity-${stamp}.json`);
  writeFileSync(parityPath, JSON.stringify(parityReport, null, 2), 'utf8');

  console.log(`Reporte de paridad: ${parityPath}`);
  console.log(`Catalogo fuente/target: ${parityReport.sourceCounts.catalog}/${parityReport.targetCounts.catalog}`);
  console.log(`Categorias fuente/target: ${parityReport.sourceCounts.categories}/${parityReport.targetCounts.categories}`);
  console.log(`Cupones fuente/target: ${parityReport.sourceCounts.coupons}/${parityReport.targetCounts.coupons}`);
  console.log(`Promociones fuente/target: ${parityReport.sourceCounts.promotions}/${parityReport.targetCounts.promotions}`);
  console.log(`Fotos catalogo copiadas: ${parityReport.copiedImages.catalog}`);
  console.log(`Fotos promociones copiadas: ${parityReport.copiedImages.promotions}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fallo la migracion/paridad de tienda hacia tiendavirtual-2ced1:');
    console.error(error);
    process.exit(1);
  });
