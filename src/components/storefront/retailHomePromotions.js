import { BOX_HOME_SECTION_ID } from '../../services/storeBoxAnnouncement.js';

export function isRetailHomePromotion(section) {
  return section.id.startsWith('promo-') || section.id === 'store-home-combos';
}

export function getRetailHomeSections(sections, isDashboard) {
  if (isDashboard) return sections;
  let regularIndex = 0;
  return sections.filter(section => {
    if (section.id === BOX_HOME_SECTION_ID) return true;
    return regularIndex++ < 4 || isRetailHomePromotion(section);
  });
}

export function getRetailHomeSectionProducts(section, isDashboard, visibleCount) {
  if (!isDashboard && isRetailHomePromotion(section)) return section.products;
  return section.products.slice(0, visibleCount);
}
