import assert from 'node:assert/strict';
import { getStoreProductPriceForBranch } from '../src/services/storePricing.js';

const product = {
  price: 185,
  branchSettings: {
    granada: { active: true },
    nindiri: { active: true, inventory: 12, price: 196 },
    masaya: { price: 190 },
  },
};

assert.equal(getStoreProductPriceForBranch(product, 'granada'), 185);
assert.equal(getStoreProductPriceForBranch(product, 'nindiri'), 185);
assert.equal(getStoreProductPriceForBranch(product, 'masaya'), 190);
assert.equal(getStoreProductPriceForBranch({
  ...product,
  branchSettings: { ...product.branchSettings, granada: { price: 181 } },
}, 'nindiri'), 181);
assert.equal(product.branchSettings.nindiri.inventory, 12);

console.log('Precios compartidos Granada/Nindirí verificados.');
