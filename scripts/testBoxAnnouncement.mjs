import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import {
  BOX_ANNOUNCEMENT_ID, BOX_ANNOUNCEMENT_STORAGE_KEY, BOX_HOME_SECTION_ID, boxAnnouncementDay,
  canShowBoxAnnouncement, nextBoxAnnouncementHistory, mergeBoxAnnouncementHistory, getBoxAnnouncementProducts,
} from '../src/services/storeBoxAnnouncement.js';
import { getRetailHomeSections } from '../src/components/storefront/retailHomePromotions.js';

assert.equal(boxAnnouncementDay(Date.parse('2026-11-07T05:59:59.999Z')), '2026-11-06');
assert.equal(boxAnnouncementDay(Date.parse('2026-11-07T06:00:00Z')), '2026-11-07');
let history = {};
for (let day = 1; day <= 10; day++) {
  const now = Date.UTC(2026, 10, day, 12);
  assert.equal(canShowBoxAnnouncement(history, now), true);
  history = nextBoxAnnouncementHistory(history, now);
  assert.equal(Object.keys(history.days).length, day);
  assert.equal(nextBoxAnnouncementHistory(history, now), undefined, 'No repeat on the same day');
}
assert.equal(canShowBoxAnnouncement(history, Date.UTC(2026, 10, 11, 12)), false, 'Ten is the lifetime cap');
assert.deepEqual(mergeBoxAnnouncementHistory(history, history), history);
assert.equal(canShowBoxAnnouncement(history, Date.UTC(2026, 9, 1)), false, 'Clock rollback does not repeat');
assert.deepEqual(mergeBoxAnnouncementHistory({ days: { malformed: true, '2026-11-01': false } }), { count: 0, days: {} });
const box = { code: 'BOX_test', name: 'Corbata por caja', image: '/real-catalog-photo.jpg', active: true,
  inventory: 4, boxSale: { sourceCode: '001', poundsPerBox: 30, pricePerPound: 146 }, price: 4380 };
assert.deepEqual(getBoxAnnouncementProducts([box, { ...box, active: false }, { ...box, inventory: 0 },
  { ...box, image: '' }, { ...box, boxSale: null }]), [box]);
const sections = ['promo-a', 'res-gold', 'res-diaria', 'promo-b', 'promo-c', 'store-home-combos', 'otros'].map(id => ({ id }));
assert.deepEqual(getRetailHomeSections([{ id: BOX_HOME_SECTION_ID }, ...sections], false),
  [{ id: BOX_HOME_SECTION_ID }, ...getRetailHomeSections(sections, false)], 'Boxes do not push existing sections off Home');
const storeSource = await readFile('src/components/TiendaVirtualView.jsx', 'utf8');
assert.match(storeSource, /return \[\.\.\.\(boxSection \? \[boxSection\] : \[\]\), \.\.\.productPromotionSections/);
assert.ok(storeSource.includes('if (boxCodes.has(productCode) ||'), 'Box products must not be duplicated in regular rails');
assert.ok(storeSource.includes('targetCategory: BOX_CATEGORY_ID'));

const dom = new JSDOM('<div id="app"></div>', { url: 'http://localhost', pretendToBeVisual: true });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
dom.window.HTMLElement.prototype.getClientRects = function () { return this.isConnected ? [{}] : []; };
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.boxTestAuth = { authStateReady: async () => {}, currentUser: { uid: 'buyer' } };
let remote = {}, writes = 0;
globalThis.boxTestTransaction = async (path, updater) => {
  assert.equal(path, 'storeUsers/buyer/announcementViews/' + BOX_ANNOUNCEMENT_ID);
  const next = updater(remote);
  if (next) { remote = next; writes++; }
  return { committed: Boolean(next), snapshot: { val: () => remote } };
};
await mkdir('tmp', { recursive: true });
await build({
  stdin: { contents: `export { default as Popup } from './src/components/storefront/RetailBoxSalesAnnouncement.jsx';
    export { default as useAnnouncement } from './src/components/storefront/useBoxSalesAnnouncement.js';
    export { useRetailFocusLayers } from './src/components/storefront/useRetailNavigation.js';
    export * from './src/services/storeBoxAnnouncementExposure.js';`, resolveDir: process.cwd(), loader: 'jsx' },
  outfile: 'tmp/box-announcement-tests.cjs', bundle: true, platform: 'node', format: 'cjs',
  packages: 'external', loader: { '.css': 'empty' },
  plugins: [{ name: 'no-live-firebase', setup(build) {
    build.onLoad({ filter: /[\\/]src[\\/]firebase\.js$/ }, () => ({
      contents: 'export const database={}; export const auth=globalThis.boxTestAuth;', loader: 'js',
    }));
    build.onResolve({ filter: /^firebase\/database$/ }, () => ({ path: 'database', namespace: 'fake' }));
    build.onLoad({ filter: /.*/, namespace: 'fake' }, () => ({
      contents: 'export const ref=(_,path)=>path;export const runTransaction=(...args)=>globalThis.boxTestTransaction(...args);', loader: 'js',
    }));
  } }],
});
const require = createRequire(import.meta.url);
const { Popup, useAnnouncement, claimBoxAnnouncement, isBoxAnnouncementDue, syncGuestBoxAnnouncementHistory, useRetailFocusLayers } = require('../tmp/box-announcement-tests.cjs');
const first = Date.UTC(2026, 10, 1, 12), second = Date.UTC(2026, 10, 2, 12);
assert.equal(await claimBoxAnnouncement({ now: first }), true);
assert.equal(await claimBoxAnnouncement({ now: first }), false, 'Guest refresh suppressed');
assert.equal(await claimBoxAnnouncement({ userKey: 'buyer', now: first }), false, 'Login does not repeat guest impression');
await syncGuestBoxAnnouncementHistory('buyer');
assert.equal(remote.days['2026-11-01'], true, 'Login transfers guest history without showing the ad again');
await syncGuestBoxAnnouncementHistory('buyer');
assert.equal(writes, 1, 'Guest history is not repeatedly synced');
assert.equal(await claimBoxAnnouncement({ userKey: 'buyer', now: second }), true);
assert.equal(Object.keys(remote.days).length, 2, 'Guest history follows sign-in');
window.localStorage.clear();
assert.equal(await claimBoxAnnouncement({ userKey: 'buyer', now: second }), false, 'Another device is suppressed by account transaction');
assert.equal(writes, 2, 'Same-day reentry does not write to Firebase again');
remote = history; window.localStorage.clear();
assert.equal(await claimBoxAnnouncement({ userKey: 'buyer', now: Date.UTC(2026, 10, 11, 12) }), false);
assert.equal(writes, 2, 'The eleventh entry does not add a remote write');
window.localStorage.setItem(BOX_ANNOUNCEMENT_STORAGE_KEY, '{bad json');
assert.equal(typeof isBoxAnnouncementDue('', {}, first), 'boolean', 'Corrupt local storage must not break the app');
window.localStorage.clear();
const { act, createElement: h, StrictMode, useState } = await import('react');
const { createRoot } = await import('react-dom/client');
const root = createRoot(document.getElementById('app'));
let clicked = 0, closed = 0;
await act(async () => root.render(h(Popup, { products: [box], onAction: () => clicked++, onClose: () => closed++ })));
assert.equal(document.querySelector('[role=dialog]').getAttribute('aria-modal'), 'true');
assert.match(document.querySelector('h2').textContent, /Ventas por caja/);
assert.equal(document.querySelector('.retail-box-preview-photo img').getAttribute('src'), box.image);
assert.match(document.querySelector('.retail-box-previews').textContent, /Corbata por caja.*30 lb por caja/);
await act(async () => document.querySelector('.retail-box-announcement-cta').click()); assert.equal(clicked, 1); assert.equal(closed, 0);
await act(async () => document.querySelector('[aria-label="Cerrar anuncio de cajas"]').click()); assert.equal(closed, 1);
await act(async () => document.querySelector('.retail-box-announcement-backdrop').click()); assert.equal(closed, 2);
await act(async () => root.render(h(Popup, { products: [] }))); assert.equal(document.querySelector('[role=dialog]'), null);
function FocusHarness() {
  useRetailFocusLayers(true);
  const [open, setOpen] = useState(false);
  return h('div', null, h('button', { id: 'opener', onClick: () => setOpen(true) }, 'Open'),
    open && h(Popup, { products: [box], onClose: () => setOpen(false), onAction: () => setOpen(false) }));
}
await act(async () => root.render(h(FocusHarness)));
document.getElementById('opener').focus();
await act(async () => document.getElementById('opener').click());
assert.equal(document.activeElement.getAttribute('aria-label'), 'Cerrar anuncio de cajas');
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
assert.ok(document.activeElement.classList.contains('retail-box-announcement-cta'), 'Focus wraps within the sheet');
await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
assert.equal(document.querySelector('[role=dialog]'), null);
assert.equal(document.activeElement.id, 'opener', 'Focus returns after closing');

let shown = 0, claims = 0, finish;
const claim = () => { claims++; return new Promise(resolve => { finish = resolve; }); };
function Harness({ enabled, user }) {
  const pending = useAnnouncement({ enabled, user, onShow: () => shown++, claim, delayMs: 1 });
  return h('output', null, pending ? 'pending' : 'idle');
}
const render = (enabled, user) => act(async () => root.render(h(StrictMode, null, h(Harness, { enabled, user }))));
await render(false, { key: 'buyer' });
await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
assert.equal(claims, 0, 'No popup while checkout, search, another overlay or admin blocks it');
await render(true, { key: 'buyer' });
await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
assert.equal(claims, 1, 'StrictMode does not double count');
// Existing profile subscription may acknowledge our own transaction before its promise resolves.
await render(true, { key: 'buyer', announcementViews: { [BOX_ANNOUNCEMENT_ID]: nextBoxAnnouncementHistory({}, Date.now()) } });
await act(async () => finish(true));
assert.equal(shown, 1, 'The account update must not cancel the successfully claimed dialog');
await render(true, { key: 'buyer' });
await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
assert.equal(claims, 1, 'Do not retry during the same visit');
await render(true, { key: 'buyer-two' });
await act(async () => new Promise(resolve => setTimeout(resolve, 15)));
assert.equal(claims, 2);
await render(false, { key: 'buyer-two' });
await act(async () => finish(true));
assert.equal(shown, 1, 'An in-flight response cannot interrupt checkout or a changed screen');
await act(async () => root.unmount()); dom.window.close();
console.log('PASS: ten distinct Managua days; guest/sign-in/device persistence; live previews; Home order; CTA/close; StrictMode and profile-update race. No production requests.');
