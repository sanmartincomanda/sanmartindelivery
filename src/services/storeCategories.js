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
  const label = String(category.label ?? fallback.label ?? '').trim();
  const id = normalizeId(category.id ?? fallback.id ?? label);

  return {
    id,
    label: label || id,
    subcategories: normalizeSubcategories(category.subcategories ?? fallback.subcategories),
    active: category.active ?? fallback.active ?? true,
    sortOrder: Number(category.sortOrder ?? fallback.sortOrder ?? 999),
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

  Object.values(remoteCategories || {}).forEach((category) => {
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
