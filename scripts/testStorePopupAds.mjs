import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { getStorePopupTargetProduct, isStorePopupTargetAvailable } from '../src/services/storePopupTarget.js';

const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const box = { code: 'BOX_TEST', name: 'Hueso por caja', price: 350, active: true, inventory: 2 };
const ad = { id: 'hueso', title: 'Caja Hueso corriente', image: '/hueso.webp', ctaLabel: 'Ir a comprar', targetProductCode: box.code };
assert.equal(getStorePopupTargetProduct(ad, [box]), box);
for (const products of [[], [{ ...box, active: false }], [{ ...box, inventory: 0 }], [{ ...box, code: '00069' }]]) {
  assert.equal(getStorePopupTargetProduct(ad, products), null);
  assert.equal(isStorePopupTargetAvailable(ad, products), false);
}
assert.equal(isStorePopupTargetAvailable({ targetCategory: 'venta_por_cajas' }, []), true);
assert.equal(isStorePopupTargetAvailable(ad, [{ ...box, inventory: null }]), true);

const service = (await read('src/services/storePopupAds.js')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
let saved;
const context = { database: {}, ref: (_, path) => path, get: async () => ({ val: () => ({}) }),
  set: async (_, value) => { saved = value; }, update: async () => {}, isDataUrlImage: () => false };
const api = vm.runInNewContext(`${service}; ({ normalizeStorePopupAd, mergeStorePopupAds, saveStorePopupAd });`, context);
assert.equal(api.normalizeStorePopupAd({ targetProductCode: ' BOX_TEST ' }).targetProductCode, box.code);
assert.equal(api.normalizeStorePopupAd({ title: 'Edited' }, ad).targetProductCode, box.code, 'Editing does not discard the destination');
assert.equal(api.normalizeStorePopupAd({ targetProductCode: '' }, ad).targetProductCode, '', 'Explicitly switching to category clears the product');
assert.equal(api.mergeStorePopupAds({ ad })[0].targetProductCode, box.code);
await api.saveStorePopupAd(ad);
assert.equal(saved.targetProductCode, box.code);
assert.equal(saved.ctaLabel, 'Ir a comprar');
await assert.rejects(api.saveStorePopupAd({ ...ad, targetProductCode: '' }), /producto o una categoria/);

const view = await read('src/components/TiendaVirtualView.jsx');
const handler = view.slice(view.indexOf('  const openPopupAdTarget = () => {'), view.indexOf('  const openCustomerOrders ='));
function click(popup, products) {
  const calls = [];
  const spies = Object.fromEntries(['setPopupAdOpen', 'setOpenedPopupAdId', 'openProduct', 'setQuantityNotice',
    'setQuery', 'setActiveCategory', 'setActiveSubcategory', 'setMobileNavSection'].map(key => [key, value => calls.push([key, value])]));
  vm.runInNewContext(`${handler}; openPopupAdTarget();`, { ...spies, openedPopupAd: popup, activeProducts: products, getStorePopupTargetProduct });
  return calls;
}
assert.ok(click(ad, [box]).some(([name, value]) => name === 'openProduct' && value === box), 'Uses the existing product detail flow, not a loose-cut SKU');
assert.ok(!click(ad, []).some(([name]) => name === 'openProduct'), 'Re-check unavailable targets at click time');
assert.ok(click({ targetCategory: 'promociones', targetSubcategory: 'Combos' }, []).some(([name, value]) => name === 'setActiveSubcategory' && value === 'Combos'));
assert.match(view, /catalogLoading \|\| popupAdsLoading/);
assert.match(view, /enabled: !storeAdsBlocked && !popupAdCandidate && !popupAdOpen/);
assert.ok(view.indexOf('const popupAdCandidate =') < view.indexOf('const boxAnnouncementPending ='));
assert.match(view, /finally \{\s*if \(!cancelled\) setPopupAdsLoading\(false\)/);
assert.match(await read('src/components/ConfiguracionView.jsx'), /targetProductCode: ctaLabel \? targetProductCode : ''/);

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost', pretendToBeVisual: true });
for (const name of ['window', 'document', 'MutationObserver', 'HTMLElement']) globalThis[name] = dom.window[name];
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.getClientRects = function () { return [{}]; };
await mkdir('tmp', { recursive: true });
await build({ stdin: { contents: `export {default as Popup} from './src/components/storefront/StorePopupAdModal.jsx'; export {useRetailFocusLayers} from './src/components/storefront/useRetailNavigation.js';`, resolveDir: process.cwd() },
  outfile: 'tmp/popup-ad-tests.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], loader: { '.css': 'empty' } });
const { Popup, useRetailFocusLayers } = createRequire(import.meta.url)('../tmp/popup-ad-tests.cjs');
const { createElement: h, act, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('app'));
let bought = 0;
function Harness() {
  useRetailFocusLayers(true);
  const [open, setOpen] = useState(false);
  return h('div', null, h('button', { id: 'opener', onClick: () => setOpen(true) }, 'Open'),
    open && h(Popup, { popupAd: ad, onClose: () => setOpen(false), onAction: () => { bought++; setOpen(false); } }));
}
await act(async () => root.render(h(Harness)));
await act(async () => document.getElementById('opener').click());
assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-label'), ad.title);
assert.equal(document.querySelector('.store-promo-image').getAttribute('src'), ad.image);
assert.equal(document.activeElement.getAttribute('aria-label'), 'Cerrar anuncio');
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
assert.equal(document.activeElement.className, 'store-promo-cta');
await act(async () => document.querySelector('.store-promo-cta').click());
assert.equal(bought, 1);
assert.equal(document.querySelector('[role=dialog]'), null);
await act(async () => document.getElementById('opener').click());
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
assert.equal(document.querySelector('[role=dialog]'), null);
await act(async () => document.getElementById('opener').click());
await act(async () => document.querySelector('.store-promo-backdrop').click());
assert.equal(document.querySelector('[role=dialog]'), null);
await act(async () => root.unmount()); dom.window.close();
console.log('PASS popup ads: persisted product target, edit/clear, availability, category compatibility, campaign priority, CTA, close, keyboard and focus. No production writes.');
