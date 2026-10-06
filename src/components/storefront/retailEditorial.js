import { normalizeSubcategoryKey } from '../../data/storeSubcategoryRules.js';

export const GOOGLE_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sanmartinsr.app&pli=1';
export const RETAIL_EDITORIAL_TARGETS = {
  cuts: { targetCategory: 'res', targetSubcategory: 'Linea Gold' },
  grill: { targetCategory: 'res', targetSubcategory: 'Linea Parrillera' },
};

export const isRetailBurgerSearch = (query) =>
  ['hamburguesa', 'hamburguesas'].includes(normalizeSubcategoryKey(query));

// Patties live in multiple Res subcategories; a subcategory-name match includes
// unrelated cuts. Identify the actual products, without changing their catalog data.
export const isRetailBurgerProduct = (product = {}) =>
  normalizeSubcategoryKey(product.category) === 'res' &&
  /\b(tortas?|hamburguesas?)\b/.test(normalizeSubcategoryKey(product.name));

export const isRetailGoldSection = (section = {}) =>
  normalizeSubcategoryKey(section.targetCategory || section.category) === 'res' &&
  normalizeSubcategoryKey(section.targetSubcategory || section.subcategory) === 'linea gold';
