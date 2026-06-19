import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { LEGACY_STORE_COMBO_CODES, STORE_COMBOS, STORE_PRODUCTS } from '../data/tiendaVirtual';
import { normalizeStoreSubcategory } from '../data/storeSubcategoryRules';
import { isDataUrlImage, uploadCatalogImage } from './storeMedia';

export const STORE_CATALOG_PATH = 'storeCatalog';
export const STORE_CATALOG_META_PATH = 'storeCatalogMeta';
export const SICAR_SYNC_SOURCE = 'sicar';
export const SICAR_CATALOG_SYNC_BATCH_SIZE = 25;

const roundPrice = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantityRule = (value) => Number(Number(value || 0).toFixed(3));

export const isUnitMeasure = (unit = '') => String(unit || '').trim().toLowerCase() === 'unidad';

export const getDefaultProductMinQuantity = (unit = 'lb') => (isUnitMeasure(unit) ? 1 : 0.5);

export const getDefaultProductQuantityStep = (unit = 'lb') => (isUnitMeasure(unit) ? 1 : 0.5);

const normalizePositiveQuantityRule = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return roundQuantityRule(numeric);
  }

  return roundQuantityRule(fallback);
};

export const getProductMinQuantity = (product = {}) =>
  normalizePositiveQuantityRule(
    product?.minQuantity,
    getDefaultProductMinQuantity(product?.unit)
  );

export const getProductQuantityStep = (product = {}) =>
  normalizePositiveQuantityRule(
    product?.quantityStep,
    getDefaultProductQuantityStep(product?.unit)
  );

export const hasCustomProductQuantityRules = (product = {}) =>
  roundQuantityRule(getProductMinQuantity(product)) !== roundQuantityRule(getDefaultProductMinQuantity(product?.unit)) ||
  roundQuantityRule(getProductQuantityStep(product)) !== roundQuantityRule(getDefaultProductQuantityStep(product?.unit));

const normalizeCategoryValue = (category, subcategory) => {
  const rawCategory = String(category || '').trim().toLowerCase();
  const rawSubcategory = String(subcategory || '').trim().toLowerCase();

  if (rawCategory === 'carniceria') {
    if (rawSubcategory.includes('gallina') || rawSubcategory.includes('pollo')) {
      return 'pollo';
    }

    return 'res';
  }

  return rawCategory || 'res';
};

const normalizeSubcategoryValue = (subcategory, category) =>
  normalizeStoreSubcategory(subcategory, category);

const normalizeSyncOverrides = (overrides = {}, fallback = {}) => ({
  name: Boolean(overrides?.name ?? fallback?.name),
  price: Boolean(overrides?.price ?? fallback?.price),
  image: Boolean(overrides?.image ?? fallback?.image),
});

const normalizeSyncMetadata = (sync = {}, fallback = {}) => {
  const source = sync || {};
  const backup = fallback || {};
  const cleanSource = String(source.source ?? backup.source ?? '').trim().toLowerCase();

  if (!cleanSource) {
    return null;
  }

  return {
    source: cleanSource,
    managedAt: String(source.managedAt ?? backup.managedAt ?? '').trim(),
    syncedAt: String(source.syncedAt ?? backup.syncedAt ?? '').trim(),
    sicarArtId: Number(source.sicarArtId ?? backup.sicarArtId ?? 0) || 0,
    sicarDepartment: String(source.sicarDepartment ?? backup.sicarDepartment ?? '').trim(),
    sicarCategory: String(source.sicarCategory ?? backup.sicarCategory ?? '').trim(),
    sicarName: String(source.sicarName ?? backup.sicarName ?? '').trim(),
    sicarPrice: roundPrice(source.sicarPrice ?? backup.sicarPrice ?? 0),
    sicarImageUrl: String(source.sicarImageUrl ?? source.sicarImage ?? backup.sicarImageUrl ?? backup.sicarImage ?? '').trim(),
    sicarImageHash: String(source.sicarImageHash ?? backup.sicarImageHash ?? '').trim(),
    quantitySold90d: Number(source.quantitySold90d ?? backup.quantitySold90d ?? 0),
    amountSold90d: roundPrice(source.amountSold90d ?? backup.amountSold90d ?? 0),
    tickets90d: Number(source.tickets90d ?? backup.tickets90d ?? 0),
    departmentRank: Number(source.departmentRank ?? backup.departmentRank ?? 0),
    cumulativeDepartmentPct: Number(source.cumulativeDepartmentPct ?? backup.cumulativeDepartmentPct ?? 0),
    overallDepartmentSharePct: Number(source.overallDepartmentSharePct ?? backup.overallDepartmentSharePct ?? 0),
    overrides: normalizeSyncOverrides(source.overrides, backup.overrides),
  };
};

const buildCatalogProductShape = (source = {}, fallback = {}) => {
  const rawCategory = source.category ?? fallback.category ?? 'res';
  const rawSubcategory = source.subcategory ?? fallback.subcategory ?? '';
  const category = normalizeCategoryValue(rawCategory, rawSubcategory);
  const sync = normalizeSyncMetadata(source.sync, fallback.sync);
  const unit = String(source.unit ?? fallback.unit ?? 'lb').trim() || 'lb';
  const minQuantity = normalizePositiveQuantityRule(
    source.minQuantity ?? fallback.minQuantity,
    getDefaultProductMinQuantity(unit)
  );
  const quantityStep = normalizePositiveQuantityRule(
    source.quantityStep ?? fallback.quantityStep,
    getDefaultProductQuantityStep(unit)
  );

  return {
    code: String(source.code ?? fallback.code ?? '').trim(),
    name: String(source.name ?? fallback.name ?? '').trim(),
    price: roundPrice(source.price ?? fallback.price ?? 0),
    unit,
    category,
    subcategory: normalizeSubcategoryValue(rawSubcategory, category),
    minQuantity,
    quantityStep,
    active: source.active ?? fallback.active ?? true,
    promo: Boolean(source.promo ?? fallback.promo),
    image: String(source.image ?? fallback.image ?? '').trim(),
    imageStoragePath: String(source.imageStoragePath ?? fallback.imageStoragePath ?? '').trim(),
    description: String(source.description ?? fallback.description ?? '').trim(),
    ...(String(source.categoryLabel ?? fallback.categoryLabel ?? '').trim()
      ? { categoryLabel: String(source.categoryLabel ?? fallback.categoryLabel ?? '').trim() }
      : {}),
    ...(sync ? { sync } : {}),
  };
};

export const normalizeCatalogProduct = (product = {}, fallback = {}) =>
  buildCatalogProductShape(product || {}, fallback || {});

export const isSicarManagedProduct = (product = {}) =>
  String(product?.sync?.source || '').trim().toLowerCase() === SICAR_SYNC_SOURCE;

const getCatalogProductSoldQuantity = (product = {}) =>
  Number(product?.sync?.quantitySold90d || 0);

const getCatalogProductSortName = (product = {}) =>
  String(product?.name || '')
    .trim()
    .toLocaleLowerCase('es-NI');

export const compareCatalogProducts = (left = {}, right = {}) => {
  const soldDifference = getCatalogProductSoldQuantity(right) - getCatalogProductSoldQuantity(left);
  if (soldDifference !== 0) {
    return soldDifference;
  }

  const priceDifference = roundPrice(right?.price || 0) - roundPrice(left?.price || 0);
  if (priceDifference !== 0) {
    return priceDifference;
  }

  const nameDifference = getCatalogProductSortName(left).localeCompare(getCatalogProductSortName(right), 'es-NI', {
    sensitivity: 'base',
    numeric: true,
  });
  if (nameDifference !== 0) {
    return nameDifference;
  }

  return String(left?.code || '').localeCompare(String(right?.code || ''), 'es-NI', {
    sensitivity: 'base',
    numeric: true,
  });
};

export const mergeCatalogProducts = (remoteCatalog = {}) => {
  const byCode = new Map();

  [...STORE_PRODUCTS, ...STORE_COMBOS].forEach((product) => {
    byCode.set(product.code, normalizeCatalogProduct(product));
  });

  Object.values(remoteCatalog || {}).filter(Boolean).forEach((remoteProduct) => {
    const code = String(remoteProduct?.code || '').trim();
    if (LEGACY_STORE_COMBO_CODES.includes(code)) {
      return;
    }

    if (code) {
      byCode.set(code, normalizeCatalogProduct(remoteProduct, byCode.get(code)));
    }
  });

  return Array.from(byCode.values()).sort(compareCatalogProducts);
};

export const getCatalogProductKey = (code) => String(code || '').trim().replace(/[.#$/[\]]/g, '_');

const buildCatalogMetaPayload = () => ({
  updatedAt: Date.now(),
  updatedAtIso: new Date().toISOString(),
});

async function touchCatalogMeta() {
  await update(ref(database, STORE_CATALOG_META_PATH), buildCatalogMetaPayload());
}

async function resolveCatalogImagePayload(product = {}, fallback = {}) {
  const rawImage = String(product.image ?? fallback.image ?? '').trim();
  const existingPath = String(product.imageStoragePath ?? fallback.imageStoragePath ?? '').trim();
  const existingHash = String(
    product?.sync?.sicarImageHash ??
      fallback?.sync?.sicarImageHash ??
      product.imageHash ??
      fallback.imageHash ??
      ''
  ).trim();

  if (!rawImage) {
    return {
      image: '',
      imageStoragePath: existingPath,
      imageHash: existingHash,
    };
  }

  if (!isDataUrlImage(rawImage)) {
    return {
      image: rawImage,
      imageStoragePath: existingPath,
      imageHash: existingHash,
    };
  }

  const uploadedImage = await uploadCatalogImage({
    code: product.code ?? fallback.code,
    image: rawImage,
    hashHint: existingHash,
  });

  return {
    image: uploadedImage.url,
    imageStoragePath: uploadedImage.path,
    imageHash: uploadedImage.hash || existingHash,
  };
}

export async function getCurrentCatalogMap() {
  const snapshot = await get(ref(database, STORE_CATALOG_PATH));
  return snapshot.val() || {};
}

const buildEditableProductPayload = (product = {}, existingProduct = {}) => {
  const normalized = normalizeCatalogProduct(product, existingProduct);
  if (!isSicarManagedProduct(existingProduct)) {
    return normalized;
  }

  const sync = normalizeSyncMetadata(existingProduct.sync, existingProduct.sync) || {
    source: SICAR_SYNC_SOURCE,
    overrides: { name: false, price: false, image: false },
  };

  const nextSync = {
    ...sync,
    sicarImage: null,
    overrides: {
      name: String(normalized.name || '').trim() !== String(sync.sicarName || '').trim(),
      price: roundPrice(normalized.price) !== roundPrice(sync.sicarPrice),
      image: String(normalized.image || '').trim() !== String(sync.sicarImageUrl || '').trim(),
    },
  };

  return {
    ...normalized,
    sync: nextSync,
  };
};

export async function saveCatalogProduct(product, existingProduct = null) {
  const resolvedExisting =
    existingProduct ||
    (product?.code
      ? normalizeCatalogProduct((await get(ref(database, `${STORE_CATALOG_PATH}/${getCatalogProductKey(product.code)}`))).val() || {})
      : null);
  const imagePayload = await resolveCatalogImagePayload(product, resolvedExisting || {});
  const normalized = buildEditableProductPayload(
    {
      ...product,
      image: imagePayload.image,
      imageStoragePath: imagePayload.imageStoragePath,
    },
    resolvedExisting || {}
  );
  if (!normalized.code || !normalized.name || !normalized.price) {
    throw new Error('Producto incompleto');
  }

  await set(ref(database, `${STORE_CATALOG_PATH}/${getCatalogProductKey(normalized.code)}`), normalized);
  await touchCatalogMeta();
  return normalized;
}

export async function updateCatalogProduct(code, patch) {
  const productKey = getCatalogProductKey(code);
  if (!productKey) {
    throw new Error('Codigo invalido');
  }

  await update(ref(database, `${STORE_CATALOG_PATH}/${productKey}`), {
    code: String(code || '').trim(),
    ...patch,
  });
  await touchCatalogMeta();
}

export async function seedDefaultCatalogIfEmpty() {
  const snapshot = await get(ref(database, STORE_CATALOG_PATH));
  if (snapshot.exists()) {
    return false;
  }

  const updates = {};
  [...STORE_PRODUCTS, ...STORE_COMBOS].forEach((product) => {
    updates[getCatalogProductKey(product.code)] = normalizeCatalogProduct(product);
  });

  await set(ref(database, STORE_CATALOG_PATH), updates);
  await touchCatalogMeta();
  return true;
}

const buildSicarManagedProduct = (importedProduct = {}, existingProduct = {}) => {
  const existing = normalizeCatalogProduct(existingProduct);
  const imported = normalizeCatalogProduct(importedProduct, existing);
  const previousSync = normalizeSyncMetadata(existing.sync, existing.sync);
  const hasExistingRecord = Boolean(existing.code);
  const importedImage = String(importedProduct.image || '').trim();
  const importedPrice = roundPrice(importedProduct.price || 0);
  const importedName = String(importedProduct.name || '').trim();
  const finalPrice = importedPrice > 0 ? importedPrice : roundPrice(existing.price || importedPrice);
  const finalProduct = hasExistingRecord
    ? {
        ...existing,
        price: finalPrice,
      }
    : {
        ...imported,
        price: finalPrice,
        active: imported.active !== false,
        promo: Boolean(imported.promo),
      };

  return {
    ...finalProduct,
    imageStoragePath: String(importedProduct?.imageStoragePath || existing.imageStoragePath || '').trim(),
    sync: {
      source: SICAR_SYNC_SOURCE,
      managedAt: previousSync?.managedAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      sicarArtId: Number(importedProduct?.sicar?.artId || previousSync?.sicarArtId || 0),
      sicarDepartment: String(importedProduct?.sicar?.department || previousSync?.sicarDepartment || '').trim(),
      sicarCategory: String(importedProduct?.sicar?.category || previousSync?.sicarCategory || '').trim(),
      sicarName: importedName,
      sicarPrice: importedPrice,
      sicarImage: null,
      sicarImageUrl: importedImage || String(previousSync?.sicarImageUrl || '').trim(),
      sicarImageHash: String(importedProduct?.sicar?.imageHash || previousSync?.sicarImageHash || '').trim(),
      quantitySold90d: Number(importedProduct?.sicar?.quantitySold90d || 0),
      amountSold90d: roundPrice(importedProduct?.sicar?.amountSold90d || 0),
      tickets90d: Number(importedProduct?.sicar?.tickets90d || 0),
      departmentRank: Number(importedProduct?.sicar?.departmentRank || 0),
      cumulativeDepartmentPct: Number(importedProduct?.sicar?.cumulativeDepartmentPct || 0),
      overallDepartmentSharePct: Number(importedProduct?.sicar?.overallDepartmentSharePct || 0),
      overrides: {
        name: hasExistingRecord ? true : Boolean(previousSync?.overrides?.name),
        price: false,
        image: hasExistingRecord ? true : Boolean(previousSync?.overrides?.image),
      },
    },
  };
};

const buildSicarPriceManagedProduct = (priceProduct = {}, existingProduct = {}) => {
  const existing = normalizeCatalogProduct(existingProduct);
  if (!existing.code) {
    return null;
  }

  const previousSync = normalizeSyncMetadata(existing.sync, existing.sync);
  const importedPrice = roundPrice(priceProduct.price || 0);
  const finalPrice = importedPrice > 0 ? importedPrice : roundPrice(existing.price || 0);

  return {
    ...existing,
    price: finalPrice,
    sync: {
      source: SICAR_SYNC_SOURCE,
      managedAt: previousSync?.managedAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      sicarArtId: Number(priceProduct?.sicar?.artId || previousSync?.sicarArtId || 0),
      sicarDepartment: String(priceProduct?.sicar?.department || previousSync?.sicarDepartment || '').trim(),
      sicarCategory: String(priceProduct?.sicar?.category || previousSync?.sicarCategory || '').trim(),
      sicarName: String(priceProduct?.name || previousSync?.sicarName || '').trim(),
      sicarPrice: finalPrice,
      sicarImage: null,
      sicarImageUrl: String(previousSync?.sicarImageUrl || '').trim(),
      sicarImageHash: String(previousSync?.sicarImageHash || '').trim(),
      quantitySold90d: Number(previousSync?.quantitySold90d || 0),
      amountSold90d: roundPrice(previousSync?.amountSold90d || 0),
      tickets90d: Number(previousSync?.tickets90d || 0),
      departmentRank: Number(previousSync?.departmentRank || 0),
      cumulativeDepartmentPct: Number(previousSync?.cumulativeDepartmentPct || 0),
      overallDepartmentSharePct: Number(previousSync?.overallDepartmentSharePct || 0),
      overrides: {
        name: true,
        price: false,
        image: true,
      },
    },
  };
};

export async function applySicarCatalogProducts(importedProducts = []) {
  return applySicarCatalogProductsWithOptions(importedProducts);
}

export async function applySicarCatalogProductsWithOptions(importedProducts = [], options = {}) {
  const catalog = Array.isArray(importedProducts) ? importedProducts : [];
  if (catalog.length === 0) {
    return { appliedCount: 0 };
  }

  const currentMap = options.currentMap || (await getCurrentCatalogMap());
  const batchSize = Math.max(1, Number(options.batchSize || SICAR_CATALOG_SYNC_BATCH_SIZE));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const updates = {};

  for (const product of catalog) {
    const code = String(product?.code || '').trim();
    if (!code) {
      continue;
    }

    const existing = currentMap[getCatalogProductKey(code)] || {};
    const imagePayload = await resolveCatalogImagePayload(product, existing);
    updates[getCatalogProductKey(code)] = buildSicarManagedProduct(
      {
        ...product,
        image: imagePayload.image,
        imageStoragePath: imagePayload.imageStoragePath,
        sicar: {
          ...(product?.sicar || {}),
          imageHash: imagePayload.imageHash || product?.sicar?.imageHash || '',
        },
      },
      existing
    );
  }

  const entries = Object.entries(updates);
  const total = entries.length;

  for (let index = 0; index < entries.length; index += batchSize) {
    const chunkEntries = entries.slice(index, index + batchSize);
    const chunkUpdates = Object.fromEntries(chunkEntries);
    await update(ref(database, STORE_CATALOG_PATH), chunkUpdates);

    if (onProgress) {
      onProgress({
        processed: Math.min(index + chunkEntries.length, total),
        total,
        batch: Math.floor(index / batchSize) + 1,
        batches: Math.ceil(total / batchSize),
      });
    }

    if (index + chunkEntries.length < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  await touchCatalogMeta();

  return {
    appliedCount: total,
    appliedProducts: entries.map(([, product]) => product),
  };
}

export async function applySicarPriceUpdatesWithOptions(priceProducts = [], options = {}) {
  const catalog = Array.isArray(priceProducts) ? priceProducts : [];
  if (catalog.length === 0) {
    return { appliedCount: 0, appliedProducts: [], missingCodes: [] };
  }

  const currentMap = options.currentMap || (await getCurrentCatalogMap());
  const batchSize = Math.max(1, Number(options.batchSize || SICAR_CATALOG_SYNC_BATCH_SIZE));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const updates = {};
  const missingCodes = [];

  catalog.forEach((product) => {
    const code = String(product?.code || '').trim();
    if (!code) {
      return;
    }

    const existing = currentMap[getCatalogProductKey(code)] || {};
    if (!existing?.code) {
      missingCodes.push(code);
      return;
    }

    const nextProduct = buildSicarPriceManagedProduct(product, existing);
    if (nextProduct) {
      updates[getCatalogProductKey(code)] = nextProduct;
    }
  });

  const entries = Object.entries(updates);
  const total = entries.length;

  for (let index = 0; index < entries.length; index += batchSize) {
    const chunkEntries = entries.slice(index, index + batchSize);
    const chunkUpdates = Object.fromEntries(chunkEntries);
    await update(ref(database, STORE_CATALOG_PATH), chunkUpdates);

    if (onProgress) {
      onProgress({
        processed: Math.min(index + chunkEntries.length, total),
        total,
        batch: Math.floor(index / batchSize) + 1,
        batches: Math.ceil(total / batchSize),
      });
    }

    if (index + chunkEntries.length < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  if (entries.length > 0) {
    await touchCatalogMeta();
  }

  return {
    appliedCount: total,
    appliedProducts: entries.map(([, product]) => product),
    missingCodes,
  };
}

export async function migrateCatalogImagesToStorage(options = {}) {
  const currentMap = options.currentMap || (await getCurrentCatalogMap());
  const batchSize = Math.max(1, Number(options.batchSize || SICAR_CATALOG_SYNC_BATCH_SIZE));
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
  const updates = {};
  let migratedCount = 0;
  let cleanedMetadataCount = 0;

  for (const [productKey, productValue] of Object.entries(currentMap || {})) {
    const currentProduct = normalizeCatalogProduct(productValue || {});
    const sync = normalizeSyncMetadata(productValue?.sync, productValue?.sync);
    const legacySyncImage = String(sync?.sicarImageUrl || '').trim();
    const legacyTopImage = String(currentProduct.image || '').trim();
    const needsImageUpload = isDataUrlImage(legacyTopImage) || isDataUrlImage(legacySyncImage);
    const needsMetadataCleanup = Boolean(productValue?.sync && 'sicarImage' in productValue.sync);

    if (!needsImageUpload && !needsMetadataCleanup) {
      continue;
    }

    let nextImage = legacyTopImage;
    let nextImageStoragePath = String(currentProduct.imageStoragePath || '').trim();
    let nextImageHash = String(sync?.sicarImageHash || '').trim();

    if (needsImageUpload) {
      const imageSource = isDataUrlImage(legacyTopImage) ? legacyTopImage : legacySyncImage;
      const uploadedImage = await uploadCatalogImage({
        code: currentProduct.code || productValue?.code || productKey,
        image: imageSource,
        hashHint: nextImageHash,
      });

      nextImage = uploadedImage.url || nextImage;
      nextImageStoragePath = uploadedImage.path || nextImageStoragePath;
      nextImageHash = uploadedImage.hash || nextImageHash;
      migratedCount += 1;
    }

    const nextSync = sync
      ? {
          ...sync,
          sicarImage: null,
          sicarImageUrl: nextImage || String(sync.sicarImageUrl || '').trim(),
          sicarImageHash: nextImageHash,
        }
      : null;

    updates[productKey] = {
      ...productValue,
      image: nextImage,
      imageStoragePath: nextImageStoragePath,
      ...(nextSync ? { sync: nextSync } : {}),
    };

    if (needsMetadataCleanup) {
      cleanedMetadataCount += 1;
    }
  }

  const entries = Object.entries(updates);
  const total = entries.length;

  for (let index = 0; index < entries.length; index += batchSize) {
    const chunkEntries = entries.slice(index, index + batchSize);
    const chunkUpdates = Object.fromEntries(chunkEntries);
    await update(ref(database, STORE_CATALOG_PATH), chunkUpdates);

    if (onProgress) {
      onProgress({
        processed: Math.min(index + chunkEntries.length, total),
        total,
        batch: Math.floor(index / batchSize) + 1,
        batches: Math.ceil(total / batchSize),
      });
    }
  }

  if (entries.length > 0) {
    await touchCatalogMeta();
  }

  return {
    migratedCount,
    cleanedMetadataCount,
    scannedCount: Object.keys(currentMap || {}).length,
    updatedCount: total,
  };
}
