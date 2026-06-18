import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { LEGACY_STORE_COMBO_CODES, STORE_COMBOS, STORE_PRODUCTS } from '../data/tiendaVirtual';
import { normalizeStoreSubcategory } from '../data/storeSubcategoryRules';

export const STORE_CATALOG_PATH = 'storeCatalog';
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
    sicarImage: String(source.sicarImage ?? backup.sicarImage ?? '').trim(),
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

  return Array.from(byCode.values()).sort((left, right) =>
    String(left.name || '').localeCompare(String(right.name || ''))
  );
};

export const getCatalogProductKey = (code) => String(code || '').trim().replace(/[.#$/[\]]/g, '_');

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
    overrides: {
      name: String(normalized.name || '').trim() !== String(sync.sicarName || '').trim(),
      price: roundPrice(normalized.price) !== roundPrice(sync.sicarPrice),
      image: String(normalized.image || '').trim() !== String(sync.sicarImage || '').trim(),
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
  const normalized = buildEditableProductPayload(product, resolvedExisting || {});
  if (!normalized.code || !normalized.name || !normalized.price) {
    throw new Error('Producto incompleto');
  }

  await set(ref(database, `${STORE_CATALOG_PATH}/${getCatalogProductKey(normalized.code)}`), normalized);
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
    sync: {
      source: SICAR_SYNC_SOURCE,
      managedAt: previousSync?.managedAt || new Date().toISOString(),
      syncedAt: new Date().toISOString(),
      sicarArtId: Number(importedProduct?.sicar?.artId || previousSync?.sicarArtId || 0),
      sicarDepartment: String(importedProduct?.sicar?.department || previousSync?.sicarDepartment || '').trim(),
      sicarCategory: String(importedProduct?.sicar?.category || previousSync?.sicarCategory || '').trim(),
      sicarName: importedName,
      sicarPrice: importedPrice,
      sicarImage: importedImage,
      sicarImageHash: String(importedProduct?.sicar?.imageHash || '').trim(),
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

  catalog.forEach((product) => {
    const code = String(product?.code || '').trim();
    if (!code) {
      return;
    }

    const existing = currentMap[getCatalogProductKey(code)] || {};
    updates[getCatalogProductKey(code)] = buildSicarManagedProduct(product, existing);
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

  return {
    appliedCount: total,
    appliedProducts: entries.map(([, product]) => product),
  };
}
