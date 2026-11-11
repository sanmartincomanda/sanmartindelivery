import { normalizeSubcategoryKey } from '../../data/storeSubcategoryRules.js';

export const GOOGLE_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.sanmartinsr.app&pli=1';
export const APP_STORE_URL = 'https://apps.apple.com/ni/app/id6832058425';

export function getHeaderAppDownload({ userAgent = '', platform = '', maxTouchPoints = 0 } = {}) {
  // iPad desktop mode identifies as a Mac, but still has a touch screen.
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);
  return appleMobile
    ? { url: APP_STORE_URL, badge: 'app-store-badge.svg', store: 'App Store', width: 120, height: 40 }
    : { url: GOOGLE_PLAY_STORE_URL, badge: 'google-play-badge.png', store: 'Google Play', width: 646, height: 250 };
}

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
