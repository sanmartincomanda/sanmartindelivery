export function isRetailHomePromotion(section) {
  return section.id.startsWith('promo-') || section.id === 'store-home-combos';
}

export function getRetailHomeSections(sections, isDashboard) {
  if (isDashboard) return sections;
  return sections.filter((section, index) => index < 4 || isRetailHomePromotion(section));
}

export function getRetailHomeSectionProducts(section, isDashboard, visibleCount) {
  if (!isDashboard && isRetailHomePromotion(section)) return section.products;
  return section.products.slice(0, visibleCount);
}
