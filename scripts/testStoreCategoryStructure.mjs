import assert from 'node:assert/strict';
import {
  normalizeStoreCategoryId,
  normalizeStoreSubcategory,
  STORE_SUBCATEGORY_CANONICALS,
} from '../src/data/storeSubcategoryRules.js';

assert.equal(normalizeStoreCategoryId('CONGELADOS', 'Mariscos'), 'mariscos');
assert.equal(normalizeStoreCategoryId('congelados', 'Derivado pollo'), 'congelados');
assert.equal(normalizeStoreCategoryId('mariscos', 'Mariscos'), 'mariscos');
assert.equal(normalizeStoreSubcategory('Derivado pollo', 'congelados'), 'Otros Congelados');
assert.equal(normalizeStoreSubcategory('Mariscos', 'mariscos'), 'Mariscos');
assert.deepEqual(STORE_SUBCATEGORY_CANONICALS.congelados, ['Otros Congelados']);
assert.deepEqual(STORE_SUBCATEGORY_CANONICALS.mariscos, ['Mariscos']);

console.log('Store category structure checks passed.');
