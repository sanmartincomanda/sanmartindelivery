import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import {
  STORE_LAUNCH_KEY, RECENT_SEARCHES_KEY, shouldShowStoreLaunch, rememberStoreLaunch,
  normalizeRecentSearches, readRecentSearches, saveRecentSearches,
} from '../src/components/storefront/retailInteractionState.js';

const dom = new JSDOM('<!doctype html><html><body><div id="test"></div></body></html>', { url: 'https://tienda.sanmartinsr.com/granada', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let reducedMotion = false;
window.matchMedia = () => ({ matches: reducedMotion });
const blockedStorage = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); }, removeItem() { throw Error('blocked'); } };
assert.equal(shouldShowStoreLaunch(window.sessionStorage), true);
rememberStoreLaunch(window.sessionStorage);
assert.equal(shouldShowStoreLaunch(window.sessionStorage), false);
assert.equal(shouldShowStoreLaunch(blockedStorage, true), false);
assert.equal(shouldShowStoreLaunch(blockedStorage), true);
assert.doesNotThrow(() => rememberStoreLaunch(blockedStorage));
assert.deepEqual(normalizeRecentSearches([' Bistec ', 'bistec', 'Pollo', null, 42, '', 'x']), ['Bistec','Pollo']);
assert.equal(normalizeRecentSearches(Array.from({length: 10}, (_, i) => `Item ${i}`)).length, 5);
assert.equal(normalizeRecentSearches(['x'.repeat(200)])[0].length, 64);
assert.deepEqual(normalizeRecentSearches({text:'Pollo'}), []);
assert.deepEqual(readRecentSearches(blockedStorage), []);
assert.deepEqual(saveRecentSearches(blockedStorage, ['Pollo']), ['Pollo']);
window.localStorage.setItem(RECENT_SEARCHES_KEY, 'broken json');
assert.deepEqual(readRecentSearches(window.localStorage), []);
window.localStorage.clear();
window.sessionStorage.clear();

// Bundle JSX for DOM component tests only; production modules retain their imports.
await mkdir('tmp', {recursive:true});
await build({ stdin: {
  contents: `export {default as StoreLaunch} from './src/components/storefront/StoreLaunch.jsx';
    export {default as RetailSearchBox} from './src/components/storefront/RetailSearchBox.jsx';
    export {default as RetailQuickActions} from './src/components/storefront/RetailQuickActions.jsx';
    export {default as RetailProductCard} from './src/components/storefront/RetailProductCard.jsx';`,
  resolveDir: process.cwd(), loader: 'jsx',
}, bundle:true, packages:'external', platform:'node', format:'cjs', loader:{'.css':'empty'}, outfile:'tmp/retail-interactions-tests.cjs' });
const require = createRequire(import.meta.url);
const {StoreLaunch, RetailSearchBox, RetailQuickActions, RetailProductCard} = require('../tmp/retail-interactions-tests.cjs');
const React = await import('react');
const {createRoot} = await import('react-dom/client');
const {act, createElement:h, useEffect, useState, StrictMode} = React;
const node = document.getElementById('test');
let root = createRoot(node);
const render = async (element) => act(async () => root.render(element));
const reset = async () => { await act(async () => root.unmount()); root = createRoot(node); };
const click = async (selector) => { const el = node.querySelector(selector); assert.ok(el, selector); await act(async () => el.click()); };
const focus = async (selector) => act(async () => node.querySelector(selector).focus());
const type = async (value) => act(async () => {
  const input = node.querySelector('input');
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input, value);
  input.dispatchEvent(new window.Event('input', {bubbles:true}));
});

let mounts = 0;
function Child() { useEffect(() => { mounts++; }, []); return h('button',{id:'commerce'},'Commerce mounted'); }
await render(h(StoreLaunch, null, h(Child)));
assert.ok(node.querySelector('.csm-launch'));
assert.ok(node.querySelector('#commerce'), 'Commerce mounts before animation completes');
assert.ok(node.querySelector('#commerce').parentElement.hasAttribute('inert'));
await click('.csm-launch-skip');
assert.equal(node.querySelector('.csm-launch'), null);
assert.equal(node.querySelector('#commerce').parentElement.hasAttribute('inert'), false);
assert.equal(mounts, 1, 'Dismissing welcome does not remount commerce');
await reset();
await render(h(StoreLaunch, null, h(Child)));
assert.equal(node.querySelector('.csm-launch'), null, 'No repeat in same tab session');
await reset();
window.sessionStorage.clear(); reducedMotion = true;
await render(h(StoreLaunch, null, h(Child)));
assert.equal(node.querySelector('.csm-launch'), null, 'Reduced motion skips intro');
await reset(); reducedMotion = false;
await render(h(StoreLaunch, {failed:true}, h(Child)));
assert.equal(node.querySelector('.csm-launch'), null, 'Errors are never hidden');
await reset(); window.sessionStorage.clear();
await render(h(StrictMode,null,h(StoreLaunch, null, h(Child))));
await act(async () => new Promise(resolve => setTimeout(resolve,1250)));
assert.equal(node.querySelector('.csm-launch'), null, 'Auto-exit works in StrictMode');
assert.equal(window.sessionStorage.getItem(STORE_LAUNCH_KEY),'seen');
await reset();

let searchValue = ''; let focusValue = false;
function SearchHarness({enhanced=true}) {
  const [value,setValue] = useState('');
  return h(RetailSearchBox,{value,enhanced,onChange: v => {searchValue=v;setValue(v);},onFocusChange:v=>{focusValue=v;}});
}
await render(h(SearchHarness));
await focus('input'); await type('Bistec');
assert.equal(searchValue,'Bistec','Search remains immediate');
assert.deepEqual(readRecentSearches(window.localStorage), [], 'Do not save partial typing');
await act(async () => node.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
assert.deepEqual(readRecentSearches(window.localStorage), ['Bistec']);
assert.equal(focusValue,false);
await click('.retail-search-clear');
assert.equal(searchValue,''); assert.equal(document.activeElement, node.querySelector('input'));
assert.ok(node.querySelector('.retail-recent-searches'));
await click('.retail-recent-searches > button');
assert.equal(searchValue,'Bistec');
await click('.retail-search-clear');
await click('.retail-recent-searches > div button');
assert.deepEqual(readRecentSearches(window.localStorage), []);
assert.equal(node.querySelector('.retail-recent-searches'), null);
await act(async () => node.querySelector('input').dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
assert.equal(focusValue,false);
await reset();
saveRecentSearches(window.localStorage,['Bistec']);
await render(h(SearchHarness,{enhanced:false})); await focus('input');
assert.equal(node.querySelector('.retail-recent-searches'),null,'Admin does not expose retail recents');
await reset();

const calls = [];
await render(h(RetailQuickActions,{hasOffers:true,goldEnabled:true,onOffers:()=>calls.push('offers'),onOrders:()=>calls.push('orders'),onGold:()=>calls.push('gold')}));
for (const id of ['offers','orders','gold']) await click(`.retail-quick-${id}`);
assert.deepEqual(calls,['offers','orders','gold']);
await render(h(RetailQuickActions,{hasOffers:false,goldEnabled:false}));
assert.equal(node.querySelectorAll('button').length,1,'No unavailable promotions or disabled Gold shortcut');
await reset();

let quantity = 0; let opened = 0;
function CardHarness() {
  const [q,setQ] = useState(0);
  return h(RetailProductCard,{
    product:{code:'T',name:'Bistec',unit:'lb',price:151.68,originalPrice:165,specialPromotion:{title:'BLACK MEAT NOVEMBER',sealImage:'/tienda/promotions/black-meat-november-2026-transparent.png'}},
    quantity:q,minimum:1,step:.5,discounted:true,image:'/photo.jpg',fallback:()=>{},money:String,formatQuantity:String,
    onOpen:()=>opened++, onQuantityChange:v=>{quantity=v;setQ(v);},
  });
}
await render(h(CardHarness));
await click('.retail-product-link'); assert.equal(opened,1);
await focus('.retail-card-add');
await click('.retail-card-add'); assert.equal(quantity,1);
assert.equal(document.activeElement,node.querySelector('.retail-card-stepper button:last-child'),'Keyboard focus survives adding');
assert.ok(node.querySelector('.is-in-cart'));
await click('.retail-card-stepper button:last-child'); assert.equal(quantity,1.5);
await click('.retail-card-stepper button:first-child'); assert.equal(quantity,1);
await focus('.retail-card-stepper button:first-child');
await click('.retail-card-stepper button:first-child'); assert.equal(quantity,0);
assert.equal(document.activeElement,node.querySelector('.retail-card-add'),'Keyboard focus survives removing');
assert.ok(node.querySelector('.retail-card-add'));
assert.equal(node.querySelector('.is-in-cart'),null);
assert.equal(node.querySelector('.retail-campaign-seal img').getAttribute('src'),'/tienda/promotions/black-meat-november-2026-transparent.png');
await act(async () => node.querySelector('.retail-campaign-seal img').dispatchEvent(new window.Event('error')));
assert.ok(node.querySelector('.retail-promo-seal'), 'Broken campaign images fall back safely');
await act(async () => root.unmount());
dom.window.close();
console.log('PASS: launch/skip/session/reduced motion/failure/StrictMode; search/recents/clear/privacy/admin; shortcut callbacks; card add/increment/remove and promo fallback. No network or orders.');
