import assert from 'node:assert/strict';
import { createRetailHomeView, retailViewKey } from '../src/components/storefront/retailNavigationState.js';
import { getRetailHomeSections, getRetailHomeSectionProducts, getRetailHomeSectionTitle, isRetailHomePromotion, isRetailHomeCarousel } from '../src/components/storefront/retailHomePromotions.js';
import { BOX_HOME_SECTION_ID } from '../src/services/storeBoxAnnouncement.js';
import { readFileSync } from 'node:fs';

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
const boxes={id:BOX_HOME_SECTION_ID,title:'Venta por caja',products};
const black={id:'promo-black_meat_november_2026',title:'BLACK MEAT NOVEMBER',products};
assert.equal(getRetailHomeSectionTitle(black), 'Black Meat November');
assert.equal(getRetailHomeSectionTitle({...black,title:'Campaña nueva'}), 'Campaña nueva', 'Admin titles remain configurable');
assert.equal(getRetailHomeSectionTitle({...black,title:'Black November especial'}), 'Black November especial', 'Do not erase meaningful campaign qualifiers');
assert.equal(getRetailHomeSectionTitle({...black,title:'BLACK MEAT NOVEMBER 🟡🥩⚫️'}), 'Black Meat November');
assert.equal(getRetailHomeSectionTitle(boxes), boxes.title);
const withFeatured=[boxes,...sections.slice(0,3),black,...sections.slice(3)];
const originalFeatured=structuredClone(withFeatured);
assert.deepEqual(getRetailHomeSections(withFeatured,false).slice(0,2),[black,boxes]);
assert.equal(getRetailHomeSections(withFeatured,true),withFeatured,'Do not reorder admin');
assert.deepEqual(withFeatured,originalFeatured,'Sorting never mutates campaign data');
for(const section of [black,boxes]) {
  assert.equal(isRetailHomeCarousel(section),true);
  assert.equal(getRetailHomeSectionProducts(section,false,5),products,'All products stay reachable by horizontal scrolling');
  assert.deepEqual(getRetailHomeSectionProducts(section,true,5),products.slice(0,5));
}
assert.equal(isRetailHomeCarousel({id:'promo-renamed',title:'Black November'}),true);
assert.equal(isRetailHomeCarousel({id:'promo-other',title:'Otra promocion'}),false);
assert.equal(getRetailHomeSections([boxes,...sections],false)[0],boxes);
assert.equal(getRetailHomeSections([...sections,black],false)[0],black);
const homeSource=readFileSync(new URL('../src/components/TiendaVirtualView.jsx',import.meta.url),'utf8');
assert.match(homeSource,/isHorizontalSection \? <RetailProductRail/);
const afterProductSections = homeSource.indexOf('className="retail-catalog-all"');
const bottomEditorial = homeSource.lastIndexOf("mobileNavSection === 'home' && <>", afterProductSections);
assert.ok(bottomEditorial > homeSource.indexOf('visibleHomeSections.map('), 'Food ads follow the product sections');
const editorialSource = homeSource.slice(bottomEditorial, afterProductSections);
assert.match(editorialSource, /RetailFoodStory onBrowse=/, 'Hoy se come bien stays below products');
assert.match(editorialSource, /RetailFoodStory variant="burgers"/, 'Hamburgers stay below products');
assert.equal(homeSource.match(/RetailFoodStory variant="burgers"/g)?.length, 1, 'Do not duplicate the hamburger ad');
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
