import assert from 'node:assert/strict';
import { createRetailHomeView, retailViewKey } from '../src/components/storefront/retailNavigationState.js';
import { getRetailHomeSections, getRetailHomeSectionProducts, isRetailHomePromotion } from '../src/components/storefront/retailHomePromotions.js';

const products = Array.from({ length: 13 }, (_, index) => ({ code: String(index) }));
const sections = ['promo-a', 'res-gold', 'res-diaria', 'promo-b', 'promo-c', 'store-home-combos', 'otros-productos']
  .map(id => ({ id, products }));
const originalSections = structuredClone(sections);
assert.deepEqual(getRetailHomeSections(sections, false).map(section => section.id), sections.slice(0, 6).map(section => section.id));
assert.equal(getRetailHomeSections(sections, true), sections, 'Admin keeps every section');
assert.deepEqual(getRetailHomeSections([], false), []);
for (const section of sections) {
  assert.deepEqual(getRetailHomeSectionProducts(section, false, 5), isRetailHomePromotion(section) ? products : products.slice(0, 5));
  assert.deepEqual(getRetailHomeSectionProducts(section, true, 5), products.slice(0, 5), 'Admin pagination stays unchanged');
  assert.deepEqual(getRetailHomeSectionProducts({ ...section, products: [] }, false, 5), []);
}
assert.deepEqual(getRetailHomeSectionProducts({ id: 'promo-single', products: products.slice(0, 1) }, false, 5), products.slice(0, 1));
assert.deepEqual(sections, originalSections, 'Presentation must not alter products, prices or order');
console.log('Home promotions: every campaign, combo and product is visible; regular rails and admin pagination are preserved.');

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
