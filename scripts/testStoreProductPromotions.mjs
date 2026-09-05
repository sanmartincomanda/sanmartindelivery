import assert from 'node:assert/strict';
import {
  getStoreProductPromotionDiscountPct,
  getStoreProductPromotionDiscountRange,
  normalizeStoreProductDiscountAssignments,
} from '../src/services/storeProductPromotionCore.js';

const legacyPromotion = {
  discountPct: 15,
  productCodes: ['RES-001', 'RES-002'],
};

assert.deepEqual(
  normalizeStoreProductDiscountAssignments(
    legacyPromotion.productDiscounts,
    legacyPromotion.productCodes,
    legacyPromotion.discountPct
  ),
  [
    { code: 'RES-001', discountPct: 15 },
    { code: 'RES-002', discountPct: 15 },
  ]
);
assert.equal(getStoreProductPromotionDiscountPct(legacyPromotion, 'RES-002'), 15);

const mixedPromotion = {
  discountPct: 10,
  productCodes: ['RES-001', 'POLLO-001', 'CERDO-001'],
  productDiscounts: [
    { code: 'RES-001', discountPct: 8 },
    { code: 'POLLO-001', discountPct: 12.5 },
    { code: 'CERDO-001', discountPct: 20 },
  ],
};

assert.equal(getStoreProductPromotionDiscountPct(mixedPromotion, 'RES-001'), 8);
assert.equal(getStoreProductPromotionDiscountPct(mixedPromotion, 'POLLO-001'), 12.5);
assert.equal(getStoreProductPromotionDiscountPct(mixedPromotion, 'CERDO-001'), 20);
assert.equal(getStoreProductPromotionDiscountPct(mixedPromotion, 'OTRO-001'), 0);
assert.deepEqual(getStoreProductPromotionDiscountRange(mixedPromotion), {
  minimum: 8,
  maximum: 20,
  varies: true,
});

assert.deepEqual(
  normalizeStoreProductDiscountAssignments(
    {
      'RES.ESPECIAL': 25,
      'POLLO/OFERTA': { discountPct: 30 },
    },
    [],
    0
  ),
  [
    { code: 'RES.ESPECIAL', discountPct: 25 },
    { code: 'POLLO/OFERTA', discountPct: 30 },
  ]
);

console.log('Promociones por producto: compatibilidad, porcentajes y rangos correctos.');
