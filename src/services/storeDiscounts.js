const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

export const STORE_DISCOUNT_SOURCE = Object.freeze({
  NONE: 'none',
  PROMOTION: 'promotion',
  COUPON: 'coupon',
  CUSTOMER: 'customer',
});

export const normalizeStoreCustomerDiscount = (value = {}) => {
  const percent = Math.min(Math.max(roundMoney(value?.percent || 0), 0), 100);

  return {
    active: value?.active === true && percent > 0,
    percent,
    label: String(value?.label || 'Descuento especial').trim() || 'Descuento especial',
    updatedAt: Math.max(0, Number(value?.updatedAt || 0)),
    updatedBy: String(value?.updatedBy || '').trim(),
  };
};

export const getStoreCartOriginalSubtotal = (items = []) =>
  roundMoney(
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) =>
        sum +
        Number(item?.cantidad || 0) *
          Number(item?.precioUnitarioOriginal ?? item?.precioUnitario ?? 0),
      0
    )
  );

export const getStoreCartPromotionSubtotal = (items = []) =>
  roundMoney(
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) => sum + Number(item?.subtotal || 0),
      0
    )
  );

export const resolveStoreDiscountBenefit = ({
  items = [],
  coupon = null,
  couponDiscount = 0,
  customerDiscount = null,
} = {}) => {
  const originalSubtotal = getStoreCartOriginalSubtotal(items);
  const promotionSubtotal = getStoreCartPromotionSubtotal(items);
  const promotionSavings = roundMoney(Math.max(originalSubtotal - promotionSubtotal, 0));
  const normalizedCustomerDiscount = normalizeStoreCustomerDiscount(customerDiscount);
  const customerSavings = normalizedCustomerDiscount.active
    ? roundMoney((originalSubtotal * normalizedCustomerDiscount.percent) / 100)
    : 0;
  const safeCouponDiscount = roundMoney(
    Math.min(Math.max(Number(couponDiscount || 0), 0), originalSubtotal)
  );
  const candidates = [
    {
      source: STORE_DISCOUNT_SOURCE.CUSTOMER,
      amount: customerSavings,
      percent: normalizedCustomerDiscount.percent,
      label: normalizedCustomerDiscount.label,
      priority: 3,
    },
    {
      source: STORE_DISCOUNT_SOURCE.PROMOTION,
      amount: promotionSavings,
      percent: 0,
      label: 'Promocion de tienda',
      priority: 2,
    },
    {
      source: STORE_DISCOUNT_SOURCE.COUPON,
      amount: safeCouponDiscount,
      percent: String(coupon?.type || '').toLowerCase() === 'percent'
        ? Math.min(Math.max(Number(coupon?.value || 0), 0), 100)
        : 0,
      label: String(coupon?.title || coupon?.code || 'Cupon').trim() || 'Cupon',
      priority: 1,
    },
  ].filter((candidate) => candidate.amount > 0);

  candidates.sort(
    (left, right) =>
      right.amount - left.amount ||
      right.priority - left.priority
  );

  const winner = candidates[0] || {
    source: STORE_DISCOUNT_SOURCE.NONE,
    amount: 0,
    percent: 0,
    label: '',
  };
  const usesPromotionalPrices = winner.source === STORE_DISCOUNT_SOURCE.PROMOTION;
  const checkoutSubtotal = usesPromotionalPrices ? promotionSubtotal : originalSubtotal;
  const orderLevelDiscount = usesPromotionalPrices ? 0 : winner.amount;

  return {
    ...winner,
    originalSubtotal,
    promotionSubtotal,
    promotionSavings,
    customerSavings,
    couponSavings: safeCouponDiscount,
    checkoutSubtotal,
    orderLevelDiscount,
    finalSubtotal: roundMoney(Math.max(checkoutSubtotal - orderLevelDiscount, 0)),
    usesPromotionalPrices,
  };
};

export const buildStoreCheckoutItems = (items = [], benefit = {}) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  if (benefit?.usesPromotionalPrices === true) {
    return normalizedItems;
  }

  return normalizedItems.map((item) => {
    const originalUnitPrice = roundMoney(
      item?.precioUnitarioOriginal ?? item?.precioUnitario ?? 0
    );

    return {
      ...item,
      precioUnitario: originalUnitPrice,
      precioFijo: false,
      promocionEspecial: null,
      subtotal: roundMoney(Number(item?.cantidad || 0) * originalUnitPrice),
    };
  });
};

export const buildStoreDiscountSnapshot = (benefit = {}) => ({
  source: String(benefit?.source || STORE_DISCOUNT_SOURCE.NONE),
  label: String(benefit?.label || '').trim(),
  type: Number(benefit?.percent || 0) > 0 ? 'percent' : 'amount',
  percent: Math.max(0, Number(benefit?.percent || 0)),
  amount: Math.max(0, roundMoney(benefit?.orderLevelDiscount || 0)),
  savings: Math.max(0, roundMoney(benefit?.amount || 0)),
});
