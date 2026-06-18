import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { STORE_PRODUCTS } from '../data/tiendaVirtual';

export const STORE_CATALOG_PATH = 'storeCatalog';

const normalizeCatalogProduct = (product) => ({
  code: String(product.code || '').trim(),
  name: String(product.name || '').trim(),
  price: Number(product.price || 0),
  unit: String(product.unit || 'lb').trim() || 'lb',
  category: String(product.category || 'carniceria').trim() || 'carniceria',
  subcategory: String(product.subcategory || '').trim(),
  active: product.active !== false,
  image: String(product.image || '').trim(),
  description: String(product.description || '').trim(),
});

export const mergeCatalogProducts = (remoteCatalog = {}) => {
  const remoteProducts = Object.values(remoteCatalog || {}).map(normalizeCatalogProduct);
  const byCode = new Map();

  STORE_PRODUCTS.forEach((product) => {
    byCode.set(product.code, normalizeCatalogProduct(product));
  });

  remoteProducts.forEach((product) => {
    if (product.code) {
      byCode.set(product.code, {
        ...(byCode.get(product.code) || {}),
        ...product,
      });
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

  await update(ref(database, `${STORE_CATALOG_PATH}/${productKey}`), patch);
}

export async function seedDefaultCatalogIfEmpty() {
  const snapshot = await get(ref(database, STORE_CATALOG_PATH));
  if (snapshot.exists()) {
    return false;
  }

  const updates = {};
  STORE_PRODUCTS.forEach((product) => {
    updates[getCatalogProductKey(product.code)] = normalizeCatalogProduct(product);
  });

  await set(ref(database, STORE_CATALOG_PATH), updates);
  return true;
}
