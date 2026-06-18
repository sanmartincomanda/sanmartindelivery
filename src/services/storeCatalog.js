import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { LEGACY_STORE_COMBO_CODES, STORE_COMBOS, STORE_PRODUCTS } from '../data/tiendaVirtual';

export const STORE_CATALOG_PATH = 'storeCatalog';

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

const normalizeSubcategoryValue = (subcategory, category) => {
  const cleanSubcategory = String(subcategory || '').trim();
  const rawSubcategory = cleanSubcategory.toLowerCase();

  if (category === 'res' && (!rawSubcategory || rawSubcategory === 'res')) {
    return 'Linea Diaria';
  }

  if (category === 'pollo' && rawSubcategory === 'gallina') {
    return 'Pollo';
  }

  return cleanSubcategory;
};

const normalizeCatalogProduct = (product, fallback = {}) => {
  const rawCategory = product.category ?? fallback.category ?? 'res';
  const rawSubcategory = product.subcategory ?? fallback.subcategory ?? '';
  const category = normalizeCategoryValue(rawCategory, rawSubcategory);

  return {
    code: String(product.code ?? fallback.code ?? '').trim(),
    name: String(product.name ?? fallback.name ?? '').trim(),
    price: Number(product.price ?? fallback.price ?? 0),
    unit: String(product.unit ?? fallback.unit ?? 'lb').trim() || 'lb',
    category,
    subcategory: normalizeSubcategoryValue(rawSubcategory, category),
    active: product.active ?? fallback.active ?? true,
    promo: Boolean(product.promo ?? fallback.promo),
    image: String(product.image ?? fallback.image ?? '').trim(),
    description: String(product.description ?? fallback.description ?? '').trim(),
  };
};

export const mergeCatalogProducts = (remoteCatalog = {}) => {
  const byCode = new Map();

  [...STORE_PRODUCTS, ...STORE_COMBOS].forEach((product) => {
    byCode.set(product.code, normalizeCatalogProduct(product));
  });

  Object.values(remoteCatalog || {}).forEach((remoteProduct) => {
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

export async function saveCatalogProduct(product) {
  const normalized = normalizeCatalogProduct(product);
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
