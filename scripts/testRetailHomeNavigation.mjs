import assert from 'node:assert/strict';
import { createRetailHomeView, retailViewKey } from '../src/components/storefront/retailNavigationState.js';

const snapshot = {
  tab: 'search', category: 'res', subcategory: 'Linea Gold', search: 'bistec',
  product: '00393', productQuantity: 2, checkout: true, checkoutStep: 'payment',
  profile: true, profileView: 'addresses', rewards: true, auth: true, authMode: 'register',
  orders: true, order: 'order-id', goldView: 'transactions', hours: true, branch: true,
  success: true, gift: true, welcome: true, popup: true,
};
const original = structuredClone(snapshot);
const home = createRetailHomeView(snapshot);
assert.deepEqual(snapshot, original, 'Home must not mutate the existing view');
assert.equal(home.tab, 'home');
assert.equal(home.category, 'todos');
assert.equal(home.subcategory, 'todas');
assert.equal(home.search, '');
assert.equal(home.product, '');
assert.equal(home.order, '');
assert.equal(home.checkoutStep, 'cart');
for (const field of ['checkout', 'profile', 'rewards', 'auth', 'orders', 'hours', 'branch', 'success', 'gift', 'welcome', 'popup']) {
  assert.equal(home[field], false, `${field} must close`);
}
for (const field of ['authMode', 'profileView', 'goldView', 'productQuantity']) assert.equal(home[field], snapshot[field]);
assert.deepEqual(createRetailHomeView(home), home, 'Repeated Home clicks are idempotent');
assert.equal(retailViewKey(snapshot), retailViewKey({ ...snapshot, search: 'pollo', productQuantity: 3 }));
assert.notEqual(retailViewKey(snapshot), retailViewKey(home));
for (const field of ['cart', 'address', 'fulfillmentType', 'payment', 'coupon', 'selectedReward']) assert.equal(field in home, false);
console.log('Retail Home: closes all view layers, clears filters, preserves view-only state and history identity.');
