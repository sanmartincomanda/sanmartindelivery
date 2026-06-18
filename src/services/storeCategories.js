import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { STORE_CATEGORIES } from '../data/tiendaVirtual';

export const STORE_CATEGORIES_PATH = 'storeCategories';

const normalizeId = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeSubcategories = (value) => {
  const source = Array.isArray(value) ? value : String(value || '').split(/\n|,/);
  return Array.from(new Set(source.map((item) => String(item || '').trim()).filter(Boolean)));
};

export const normalizeStoreCategory = (category = {}, fallback = {}) => {
  const source = category || {};
  const backup = fallback || {};
  const label = String(source.label ?? backup.label ?? '').trim();
  const id = normalizeId(source.id ?? backup.id ?? label);

  return {
    id,
    label: label || id,
    subcategories: normalizeSubcategories(source.subcategories ?? backup.subcategories),
    active: source.active ?? backup.active ?? true,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? 999),
  };
};

export const getStoreCategoryKey = (id) => normalizeId(id).replace(/[.#$/[\]]/g, '_');

export const mergeStoreCategories = (remoteCategories = {}) => {
  const byId = new Map();

  STORE_CATEGORIES.filter((category) => category.id !== 'todos').forEach((category, index) => {
    const normalized = normalizeStoreCategory({
      ...category,
      active: true,
      sortOrder: index * 10,
    });
    byId.set(normalized.id, normalized);
  });

  Object.values(remoteCategories || {}).filter(Boolean).forEach((category) => {
    const normalized = normalizeStoreCategory(category, byId.get(normalizeId(category?.id || category?.label)));
    if (normalized.id) {
      byId.set(normalized.id, normalized);
    }
  });

  return Array.from(byId.values()).sort(
    (left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      String(left.label || '').localeCompare(String(right.label || ''))
  );
};

export async function saveStoreCategory(category) {
  const normalized = normalizeStoreCategory(category);
  if (!normalized.id || !normalized.label) {
    throw new Error('Categoria incompleta');
  }

  await set(ref(database, `${STORE_CATEGORIES_PATH}/${getStoreCategoryKey(normalized.id)}`), normalized);
  return normalized;
}

export async function updateStoreCategory(id, patch) {
  const categoryKey = getStoreCategoryKey(id);
  if (!categoryKey) {
    throw new Error('Categoria invalida');
  }

  await update(ref(database, `${STORE_CATEGORIES_PATH}/${categoryKey}`), patch);
}

export async function seedDefaultStoreCategoriesIfEmpty() {
  const snapshot = await get(ref(database, STORE_CATEGORIES_PATH));
  if (snapshot.exists()) {
    return false;
  }

  const updates = {};
  mergeStoreCategories().forEach((category) => {
    updates[getStoreCategoryKey(category.id)] = category;
  });

  await set(ref(database, STORE_CATEGORIES_PATH), updates);
  return true;
}

export const buildStoreCategoriesFromCatalogProducts = (products = []) => {
  const byId = new Map();

  products.forEach((product, index) => {
    const categoryId = normalizeId(product?.category);
    if (!categoryId) {
      return;
    }

    const categoryLabel = String(product?.categoryLabel || product?.category || '').trim() || categoryId;
    const subcategory = String(product?.subcategory || '').trim();
    const current = byId.get(categoryId) || {
      id: categoryId,
      label: categoryLabel,
      subcategories: [],
      active: true,
      sortOrder: (index + 1) * 10,
    };

    if (subcategory && !current.subcategories.includes(subcategory)) {
      current.subcategories.push(subcategory);
    }

    if (!current.label && categoryLabel) {
      current.label = categoryLabel;
    }

    byId.set(categoryId, current);
  });

  return Array.from(byId.values()).sort(
    (left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      String(left.label || '').localeCompare(String(right.label || ''))
  );
};

export async function syncStoreCategoriesFromCatalogProducts(products = []) {
  const importedCategories = buildStoreCategoriesFromCatalogProducts(products);
  if (importedCategories.length === 0) {
    return 0;
  }

  const snapshot = await get(ref(database, STORE_CATEGORIES_PATH));
  const currentCategories = mergeStoreCategories(snapshot.val());
  const currentById = new Map(currentCategories.map((category) => [category.id, category]));
  const updates = {};

  importedCategories.forEach((category, index) => {
    const existing = currentById.get(category.id);
    const normalized = normalizeStoreCategory(
      {
        ...existing,
        ...category,
        active: existing?.active ?? true,
        sortOrder: existing?.sortOrder ?? (index + 1) * 10,
        subcategories: Array.from(
          new Set([...(existing?.subcategories || []), ...(category.subcategories || [])])
        ),
      },
      existing
    );

    updates[getStoreCategoryKey(normalized.id)] = normalized;
  });

  await update(ref(database, STORE_CATEGORIES_PATH), updates);
  return importedCategories.length;
}
