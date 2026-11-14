import { normalizeStoreSubcategory, normalizeSubcategoryKey } from '../../data/storeSubcategoryRules.js';

const RES_ROTATION_PRIORITY = [
  'Linea Diaria',
  'Linea Parrillera',
  'Linea Gold',
  'Linea Practica y Tortas Hamburguesa',
];
const RES_ROTATION_SIZE = 3;
const resLineKey = (value) => normalizeSubcategoryKey(normalizeStoreSubcategory(value, 'res'));

export function orderRetailCategoryProducts(products, {
  category,
  subcategory,
  query = '',
  isDashboard = false,
  subcategoryOrder = [],
} = {}) {
  if (isDashboard || category !== 'res' || subcategory !== 'todas' || query.trim()) {
    return products;
  }

  const groups = new Map();
  for (const label of [...RES_ROTATION_PRIORITY, ...subcategoryOrder]) {
    const key = resLineKey(label);
    if (!groups.has(key)) groups.set(key, []);
  }
  for (const product of products) {
    const key = resLineKey(product.subcategory);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(product);
  }

  // Rotate the complete filtered list before pagination, preserving each line's order.
  let remainingGroups = [...groups.values()].filter((group) => group.length);
  const ordered = [];
  for (let offset = 0; remainingGroups.length; offset += RES_ROTATION_SIZE) {
    for (const group of remainingGroups) {
      ordered.push(...group.slice(offset, offset + RES_ROTATION_SIZE));
    }
    remainingGroups = remainingGroups.filter((group) => group.length > offset + RES_ROTATION_SIZE);
  }
  return ordered;
}
