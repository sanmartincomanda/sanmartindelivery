import { BOX_HOME_SECTION_ID } from '../../services/storeBoxAnnouncement.js';

export function isRetailHomePromotion(section) {
  return section.id.startsWith('promo-') || section.id === 'store-home-combos';
}

export function isBlackNovemberSection(section) {
  return section.id.startsWith('promo-') && (
    section.id.startsWith('promo-black_meat_november') ||
    /^black\s+(?:meat\s+)?november\b/i.test(String(section.title || '').trim())
  );
}

export const isRetailHomeCarousel = section =>
  isBlackNovemberSection(section) || section.id === BOX_HOME_SECTION_ID;

export function getRetailHomeSectionTitle(section) {
  const text = String(section.title || '').replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '').trim();
  return /^black\s+(?:meat\s+)?november$/i.test(text) && isBlackNovemberSection(section)
    ? 'Black Meat November' : section.title;
}

export function getRetailHomeSections(sections, isDashboard) {
  if (isDashboard) return sections;
  let regularIndex = 0;
  const visible = sections.filter(section => {
    if (section.id === BOX_HOME_SECTION_ID) return true;
    return regularIndex++ < 4 || isRetailHomePromotion(section);
  });
  return [
    ...visible.filter(isBlackNovemberSection),
    ...visible.filter(section => section.id === BOX_HOME_SECTION_ID),
    ...visible.filter(section => !isRetailHomeCarousel(section)),
  ];
}

export function getRetailHomeSectionProducts(section, isDashboard, visibleCount) {
  if (!isDashboard && (isRetailHomePromotion(section) || isRetailHomeCarousel(section))) return section.products;
  return section.products.slice(0, visibleCount);
}
