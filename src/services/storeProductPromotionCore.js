const clampDiscountPct = (value) =>
  Number(Math.min(100, Math.max(0, Number(value || 0) || 0)).toFixed(2));

export const normalizeStoreProductPromotionCodes = (value) => {
  const source = Array.isArray(value)
    ? value
    : String(value || '')
        .split(/[\n,;]+/);

  return Array.from(
    new Set(
      source
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

export const normalizeStoreProductDiscountAssignments = (
  value,
  productCodes = [],
  fallbackDiscountPct = 0
) => {
  const rawAssignments = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([code, assignment]) =>
          assignment && typeof assignment === 'object'
            ? { ...assignment, code: assignment.code || assignment.productCode || code }
            : { code, discountPct: assignment }
        )
      : [];
  const assignmentByCode = new Map();

  rawAssignments.forEach((assignment) => {
    const code = String(assignment?.code ?? assignment?.productCode ?? '').trim();
    if (!code) {
      return;
    }

    assignmentByCode.set(code, {
      code,
      discountPct: clampDiscountPct(
        assignment?.discountPct ?? assignment?.percentage ?? assignment?.value ?? 0
      ),
    });
  });

  const orderedCodes = normalizeStoreProductPromotionCodes([
    ...normalizeStoreProductPromotionCodes(productCodes),
    ...assignmentByCode.keys(),
  ]);
  const fallback = clampDiscountPct(fallbackDiscountPct);

  return orderedCodes.map((code) =>
    assignmentByCode.get(code) || {
      code,
      discountPct: fallback,
    }
  );
};

export const getStoreProductPromotionDiscountPct = (promotion = {}, code = '') => {
  const cleanCode = String(code || '').trim();
  if (!cleanCode) {
    return 0;
  }

  const assignment = normalizeStoreProductDiscountAssignments(
    promotion.productDiscounts,
    promotion.productCodes,
    promotion.discountPct
  ).find((entry) => entry.code === cleanCode);

  return assignment?.discountPct || 0;
};

export const getStoreProductPromotionDiscountRange = (promotion = {}) => {
  const assignments = normalizeStoreProductDiscountAssignments(
    promotion.productDiscounts,
    promotion.productCodes,
    promotion.discountPct
  );
  const values = assignments
    .map((assignment) => clampDiscountPct(assignment.discountPct))
    .filter((discountPct) => discountPct > 0);

  if (values.length === 0) {
    return {
      minimum: 0,
      maximum: 0,
      varies: false,
    };
  }

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);

  return {
    minimum,
    maximum,
    varies: minimum !== maximum,
  };
};
