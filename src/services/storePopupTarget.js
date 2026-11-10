export const getStorePopupTargetProduct = (popupAd, products = []) => {
  const code = String(popupAd?.targetProductCode || '').trim();
  if (!code) return null;
  // Use the branch-resolved catalog; never bypass availability with a raw record.
  return products.find(product => String(product.code) === code && product.active !== false &&
    (product.inventory == null || Number(product.inventory) > 0)) || null;
};

export const isStorePopupTargetAvailable = (popupAd, products) =>
  !String(popupAd?.targetProductCode || '').trim() || Boolean(getStorePopupTargetProduct(popupAd, products));
