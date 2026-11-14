import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createProfilePhotoSaver, getProfilePhoto, validateProfilePhoto, prepareProfilePhoto, PROFILE_PHOTO_MAX_BYTES } from '../src/services/storeProfilePhoto.js';

const photo = 'data:image/jpeg;base64,/9j/2Q==';
assert.equal(validateProfilePhoto(photo), photo);
assert.equal(validateProfilePhoto(''), '');
for (const invalid of [null, {}, 'https://example.com/photo.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', `${photo}bad`, `data:image/jpeg;base64,/9j/${'A'.repeat(26000)}`]) {
  assert.throws(() => validateProfilePhoto(invalid));
  assert.equal(getProfilePhoto({ profilePhoto: invalid }), '');
}
const writes = [];
const saver = createProfilePhotoSaver({ getAuthUser: () => ({uid: 'customer'}), writePhoto: async (...args) => writes.push(args), now: () => 123 });
await assert.rejects(() => saver({key:'someone-else'},photo));
await assert.rejects(() => saver({},photo));
assert.equal(writes.length, 0, 'Never write another account');
await saver({key:'customer',customerDiscount:15,telefono:'test'},photo);
await saver({key:'customer'},'');
assert.deepEqual(writes, [['customer',{profilePhoto:photo,profilePhotoUpdatedAt:123}], ['customer',{profilePhoto:'',profilePhotoUpdatedAt:123}]], 'A photo cannot modify account, discount, address or loyalty data');
await assert.rejects(() => createProfilePhotoSaver({getAuthUser:()=>null,writePhoto:async()=>assert.fail('unauthenticated')})({key:'customer'},photo));
await assert.rejects(() => createProfilePhotoSaver({getAuthUser:()=>({uid:'customer'}),writePhoto:async()=>{throw Error('offline');}})({key:'customer'},photo), /offline/);

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="test" class="store-shell storefront-public-v2 storefront-brand-v3 storefront-retail" data-retail-tab="profile"></div></body></html>', {url:'https://tienda.sanmartinsr.com/granada',pretendToBeVisual:true});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

await mkdir('tmp',{recursive:true});
await build({stdin:{contents:"export {default} from './src/components/storefront/RetailProfile.jsx';",resolveDir:process.cwd(),loader:'jsx'},bundle:true,packages:'external',platform:'node',format:'cjs',loader:{'.css':'empty'},outfile:'tmp/retail-profile-tests.cjs'});
const require = createRequire(import.meta.url);
const Profile = require('../tmp/retail-profile-tests.cjs').default;
const {createElement:h,act,useState} = await import('react');
const {createRoot} = await import('react-dom/client');
const node = document.getElementById('test');
const root = createRoot(node);
const appendStyle = css => { const style=document.createElement('style'); style.textContent=css; document.head.append(style); };
// Match TiendaVirtualView's order: legacy sheets, then isolated account styles.
for (const file of ['storeNativeApp','storefrontPublic','storefrontCustomerApp','storefrontBrand2026','storefrontRefinement2026','storefrontRetail','storefrontEditorial','storefrontInteractions']) appendStyle(await readFile(`src/styles/${file}.css`,'utf8'));
appendStyle(await readFile('src/components/storefront/retailProfile.css','utf8'));
const source = await readFile('src/components/TiendaVirtualView.jsx','utf8');
const inherited = [...source.matchAll(/\.store-checkout-icon\s*\{[^}]*\}/g)].map(match=>match[0]).find(rule=>rule.includes('grid-area: icon'));
assert.match(inherited,/grid-area: icon/,'Reproduce the actual inline rule missed by the old fixture');
appendStyle(inherited);
const control = document.createElement('span'); control.className='store-checkout-icon'; node.append(control);
assert.equal(window.getComputedStyle(control).gridArea,'icon','Legacy icon really occupies a named checkout area');
control.remove();
const calls=[];
const props={currentUser:{key:'customer',nombre:'Maria Fernanda de los Angeles San Martin Rodriguez'},rewardPoints:1580,selectedBranch:{name:'Granada',whatsapp:'50584657949'},onEditProfile:v=>calls.push(v),onOpenRewards:()=>calls.push('gold'),onOpenActivity:()=>calls.push('orders'),onSignOut:()=>calls.push('signout')};
const render = async value => act(async()=>root.render(value));
const click = async selector => { const el=node.querySelector(selector); assert.ok(el,selector); await act(async()=>el.click()); };
const style = selector => window.getComputedStyle(node.querySelector(selector));
await render(h(Profile,props));
for (const native of [false,true]) {
  node.classList.toggle('native-store-app',native);
  assert.equal(style('.csm-account-shortcuts').display,'grid');
  assert.equal(style('.csm-account-shortcuts').gridTemplateColumns,'repeat(2,minmax(0,1fr))');
  assert.equal(style('.csm-account-menu > button').display,'flex');
  assert.equal(style('.csm-account-copy').minWidth,'0');
  assert.equal(style('.csm-account-copy').whiteSpace,'normal');
  assert.equal(style('.csm-account-copy').flexGrow,'1');
  assert.equal(style('[data-account-action="wallet"]').opacity,'1','Disabled wallet must remain readable');
  for (const icon of node.querySelectorAll('.csm-account-icon')) assert.equal(window.getComputedStyle(icon).gridArea,'auto', 'No implicit checkout grid tracks');
  for (const button of node.querySelectorAll('.csm-account-shortcuts > button')) assert.ok(parseFloat(window.getComputedStyle(button).minHeight)>=44);
  assert.equal(node.querySelector('.store-checkout-icon'),null);
}
node.classList.remove('native-store-app');
await click('[data-account-action="wallet"]'); assert.deepEqual(calls,[]);
assert.equal(node.querySelector('[data-account-action="wallet"]').disabled,true);
assert.match(node.querySelector('[data-account-action="wallet"]').textContent,/Próximamente/);
for (const selector of ['[data-account-action="help"]','[data-account-action="addresses"]','[data-account-action="orders"]','.csm-account-gold','.csm-account-menu button','.csm-account-signout']) await click(selector);
assert.deepEqual(calls,['help','addresses','orders','gold','information','signout']);
for (const [name,whatsapp] of [['Granada','50584657949'],['Masaya','50589805608'],['Nindiri','50557457960']]) {
  await render(h(Profile,{...props,selectedBranch:{name,whatsapp}}));
  assert.equal(new URL(node.querySelector('.csm-account-menu a').href).pathname,`/${whatsapp}`);
}
await render(h(Profile,{...props,rewardsEnabled:false,selectedBranch:{},currentUser:null}));
assert.equal(node.querySelector('.csm-account-gold'),null);
assert.equal(node.querySelector('.csm-account-menu a'),null);
assert.equal(node.querySelector('.csm-account-avatar img'),null);
assert.equal(node.querySelector('.csm-account-avatar').getAttribute('aria-label'),'Agregar foto de perfil');

let failSave=true; let prepared=0; const saves=[];
function Harness() {
  const [profilePhoto,setPhoto] = useState('');
  return h(Profile,{...props,currentUser:{...props.currentUser,profilePhoto},preparePhoto:async()=>{prepared++;return photo;},onSavePhoto:async value=>{if(failSave)throw Error('offline');saves.push(value);setPhoto(value);}});
}
await render(h(Harness));
await click('.csm-account-avatar');
assert.equal(node.querySelector('[role="dialog"]').getAttribute('aria-modal'),'true');
assert.equal(node.querySelector('.csm-account-photo-save').disabled,true);
assert.equal(document.body.style.overflow,'hidden');
const pick = async files => {
  const input=node.querySelector('input[type="file"]');
  Object.defineProperty(input,'files',{value:files,configurable:true});
  await act(async()=>input.dispatchEvent(new window.Event('change',{bubbles:true})));
};
await pick([]); assert.equal(prepared,0,'Cancel has no side effects');
await pick([new window.File(['test'],'photo.jpg',{type:'image/jpeg'})]);
assert.equal(prepared,1); assert.equal(saves.length,0,'Selection is preview only');
assert.equal(node.querySelector('.csm-account-photo-save').disabled,false);
await click('.csm-account-photo-save');
assert.ok(node.querySelector('[role="alert"]'),'Network failure stays visible and retryable');
assert.equal(node.querySelector('.csm-account-avatar img'),null,'Failed save does not claim persistence');
failSave=false; await click('.csm-account-photo-save');
assert.deepEqual(saves,[photo]); assert.equal(node.querySelector('[role="dialog"]'),null);
assert.equal(document.body.style.overflow,'');
assert.equal(node.querySelector('.csm-account-avatar img').src,photo);
await act(async()=>node.querySelector('.csm-account-avatar img').dispatchEvent(new window.Event('error')));
assert.equal(node.querySelector('.csm-account-avatar img'),null,'A broken image falls back to the person icon');
await click('.csm-account-avatar'); await click('.csm-account-photo-remove');
assert.equal(saves.length,1,'Removal also requires save');
await click('.csm-account-photo-save'); assert.deepEqual(saves,[photo,'']);
await act(async()=>root.unmount());

// Exercise the actual compressor using a deterministic canvas adapter (not a real browser).
const originalCreate = document.createElement.bind(document);
let released=0; const crops=[]; let edge=0; let mode='normal';
globalThis.URL.createObjectURL=()=> 'blob:local-test'; globalThis.URL.revokeObjectURL=()=>released++;
globalThis.Image=class { naturalWidth=1200;naturalHeight=800; set src(value){if(value)queueMicrotask(()=>mode==='bad'?this.onerror?.():this.onload?.());} };
document.createElement = name => name==='canvas' ? {set width(v){edge=v;},get width(){return edge;},height:0,getContext:()=>({fillRect(){},drawImage(...args){crops.push(args.slice(1));}}),toDataURL:()=>mode==='large'&&edge>192?`data:image/jpeg;base64,/9j/${'A'.repeat(PROFILE_PHOTO_MAX_BYTES*2)}`:photo} : originalCreate(name);
await assert.rejects(()=>prepareProfilePhoto({type:'image/svg+xml',size:100}));
await assert.rejects(()=>prepareProfilePhoto({type:'image/jpeg',size:13*1024*1024}));
assert.equal(await prepareProfilePhoto({type:'image/jpeg',size:1000}),photo);
assert.deepEqual(crops[0],[200,0,800,800,0,0,256,256],'Centered square thumbnail');
mode='large'; assert.equal(await prepareProfilePhoto({type:'image/png',size:1000}),photo);
assert.ok(crops.some(args=>args.at(-1)===192),'Reduce dimensions when byte limit is exceeded');
mode='bad'; await assert.rejects(()=>prepareProfilePhoto({type:'image/heic',size:1000}),/JPG/);
assert.equal(released,3,'Release blob URLs on success and failure');
dom.window.close();
console.log('PASS profile: real legacy CSS regression, native/web style isolation, actions, disabled wallet, branch WhatsApp, avatar preview/save/retry/remove, compression and account isolation. No real uploads or orders.');
