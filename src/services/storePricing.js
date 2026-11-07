export const NINDIRI_SHARED_PRICE_BRANCH_ID = 'nindiri';

export const getStoreProductPriceForBranch = (product = {}, branchId = 'granada') => {
  if (product.boxSale) return Number(product.price || 0);
  const cleanBranchId = String(branchId || 'granada').trim().toLowerCase() || 'granada';
  const priceBranchId = cleanBranchId === NINDIRI_SHARED_PRICE_BRANCH_ID ? 'granada' : cleanBranchId;
  const branchPrice = Number(product?.branchSettings?.[priceBranchId]?.price || 0);
  return branchPrice > 0 ? branchPrice : Number(product?.price || 0);
};
