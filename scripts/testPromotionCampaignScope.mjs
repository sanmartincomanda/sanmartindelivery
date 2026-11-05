import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Exercise the production pricing/date code without connecting to Firebase.
const source = readFileSync(new URL('../src/services/storeProductPromotions.js', import.meta.url), 'utf8')
  .replace("import { get, ref, set, update } from 'firebase/database';", '')
  .replace("import { database } from '../firebase';", '')
  .replaceAll("'./storeProductPromotionCore'", JSON.stringify(new URL('../src/services/storeProductPromotionCore.js', import.meta.url).href));
const { normalizeStoreProductPromotion, applyStoreProductPromotionsToCatalog, getStoreProductPromotionStatus } =
  await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const sealImage = '/tienda/promotions/black-meat-november-2026-transparent.png';
const promotion = normalizeStoreProductPromotion({
  id: 'scope_test', title: 'BLACK MEAT NOVEMBER', branchIds: ['granada', 'nindiri'], sealImage,
  startsAt: '2026-11-01T00:00:00-06:00', endsAt: '2026-12-01T00:00:00-06:00',
  productDiscounts: [{code: '00034', discountPct: 5}, {code: '00036', discountPct: 6}, {code: '00047', discountPct: 7}, {code:'00198',discountPct:8.07}, {code:'00018',discountPct:4}],
});
const now = Date.parse('2026-11-15T12:00:00-06:00');
for (const branchId of ['granada', 'nindiri']) {
  const products = applyStoreProductPromotionsToCatalog([
    {code:'00034', price:367, branchId}, {code:'00036', price:332, branchId}, {code:'00047', price:254, branchId},
    {code:'00198',price:165,branchId}, {code:'00018',price:199,branchId},
  ], [promotion], now);
  assert.deepEqual(products.map(p=>p.price), [348.65, 312.08, 236.22,151.68,191.04]);
  assert.deepEqual(products.map(p=>p.originalPrice), [367, 332, 254,165,199]);
  assert.ok(products.every(p=>p.specialPromotion.sealImage === sealImage));
}
for (const branchId of ['masaya', '', 'unknown']) {
  const [product] = applyStoreProductPromotionsToCatalog([{code:'00034', price:367, branchId}], [promotion], now);
  assert.equal(product.price, 367);
  assert.equal(product.specialPromotion, null);
}
assert.equal(getStoreProductPromotionStatus(promotion, Date.parse('2026-11-30T23:59:59-06:00')), 'active');
assert.equal(getStoreProductPromotionStatus(promotion, Date.parse('2026-12-01T00:00:00-06:00')), 'expired');
assert.equal(getStoreProductPromotionStatus(promotion, Date.parse('2026-10-31T23:59:59-06:00')), 'scheduled');
assert.equal(getStoreProductPromotionStatus({...promotion, active:false}, now), 'inactive');
const [expired] = applyStoreProductPromotionsToCatalog([{code:'00034',price:367,branchId:'granada'}], [promotion], Date.parse('2026-12-01T06:00:00Z'));
assert.equal(expired.price,367);
assert.equal(expired.specialPromotion,null);
assert.equal(normalizeStoreProductPromotion({title:'Edited'}, promotion).sealImage, sealImage);
assert.deepEqual(normalizeStoreProductPromotion({title:'Edited'}, promotion).branchIds, ['granada','nindiri']);
assert.equal(normalizeStoreProductPromotion({...promotion,sealImage:'https://untrusted.example/tracker.jpg'}).sealImage,'');
const [legacy] = applyStoreProductPromotionsToCatalog([{code:'X',price:100,branchId:'masaya'}], [{id:'legacy',productCodes:['X'],discountPct:10}],now);
assert.equal(legacy.price,90);
console.log('Campaign scope, exact current-price discounts, local midnight expiry, seal and legacy compatibility passed.');
