import assert from 'node:assert/strict';
import { access, readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const photo = 'data:image/jpeg;base64,/9j/2Q==';
const profileSource = await readFile('src/components/storefront/RetailProfile.jsx','utf8');
const usersSource = await readFile('src/services/storeUsers.js','utf8');
const storeSource = await readFile('src/components/TiendaVirtualView.jsx','utf8');
const profileCss = await readFile('src/components/storefront/retailProfile.css','utf8');
for (const source of [profileSource, usersSource, storeSource]) {
  assert.doesNotMatch(source,/storeProfilePhoto|saveStoreProfilePhoto|handleProfilePhotoSave|onSavePhoto|prepareProfilePhoto/,'No profile upload or persistence path remains');
}
assert.doesNotMatch(profileSource,/profilePhoto|photoURL|type="file"|createObjectURL/,'Do not read legacy photos or open a gallery');
assert.doesNotMatch(profileCss,/csm-account-photo|csm-account-camera|account-sheet-enter/,'Remove unused photo editor styles');
await assert.rejects(access('src/services/storeProfilePhoto.js'),{code:'ENOENT'});
const iosPlist = await readFile('ios/App/App/Info.plist','utf8');
const androidManifest = await readFile('android/app/src/main/AndroidManifest.xml','utf8');
assert.doesNotMatch(iosPlist,/NS(?:Camera|PhotoLibrary(?:Add)?)UsageDescription/,'No camera or photo-library permission is introduced');
assert.doesNotMatch(androidManifest,/android\.permission\.(?:CAMERA|READ_MEDIA_IMAGES|READ_MEDIA_VISUAL_USER_SELECTED|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE)/);
const privacy = await readFile('src/components/PrivacyPolicyView.jsx','utf8');
assert.match(privacy,/<h2>Perfil sin fotografia<\/h2>/);
assert.match(privacy,/no permite elegir ni subir fotos/);
assert.match(privacy,/No solicita acceso a la camara ni a la galeria/);
assert.match(privacy,/Fotos de versiones anteriores/);
assert.match(privacy,/puede permanecer\s+asociada a tu cuenta/,'Do not claim that existing photos were deleted');
assert.match(privacy,/mailto:\$\{STORE_SUPPORT_EMAIL\}/);
assert.match(privacy,/href=\{STORE_ACCOUNT_DELETION_URL\}/);
assert.doesNotMatch(privacy,/Puedes elegir una imagen de tu galeria|Puedes cambiarla o\s+quitarla desde Perfil/);

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
const {createElement:h,act} = await import('react');
const {createRoot} = await import('react-dom/client');
const node = document.getElementById('test');
const root = createRoot(node);
const appendStyle = css => { const style=document.createElement('style'); style.textContent=css; document.head.append(style); };
// Match TiendaVirtualView's order: legacy sheets, then isolated account styles.
for (const file of ['storeNativeApp','storefrontPublic','storefrontCustomerApp','storefrontBrand2026','storefrontRefinement2026','storefrontRetail','storefrontEditorial','storefrontInteractions']) appendStyle(await readFile(`src/styles/${file}.css`,'utf8'));
appendStyle(profileCss);
const inherited = [...storeSource.matchAll(/\.store-checkout-icon\s*\{[^}]*\}/g)].map(match=>match[0]).find(rule=>rule.includes('grid-area: icon'));
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

// Existing accounts and provider photos must not re-enable the removed feature.
const previousCalls = [...calls];
const guardedUser = {...props.currentUser};
for (const key of ['profilePhoto','photoURL']) Object.defineProperty(guardedUser,key,{get(){assert.fail(`Profile must not read ${key}`);}});
const legacyUsers = [
  null, props.currentUser,
  Object.freeze({...props.currentUser,profilePhoto:photo,profilePhotoUpdatedAt:123}),
  Object.freeze({...props.currentUser,profilePhoto:'invalid',photoURL:'https://example.com/avatar.jpg'}),
  guardedUser,
];
for (const native of [false,true]) {
  node.classList.toggle('native-store-app',native);
  for (const currentUser of legacyUsers) {
    await render(h(Profile,{...props,currentUser,onSavePhoto:()=>assert.fail('No photo writes'),preparePhoto:()=>assert.fail('No gallery processing')}));
    const avatar = node.querySelector('.csm-account-avatar');
    assert.equal(avatar.tagName,'SPAN','Person icon is decorative, not an upload button');
    assert.equal(avatar.getAttribute('aria-hidden'),'true');
    assert.equal(avatar.tabIndex,-1);
    assert.ok(avatar.querySelector('svg circle'),'Keep the person icon');
    assert.equal(node.querySelector('img'),null,'Never load stored or provider photos');
    assert.equal(node.querySelector('input[type="file"]'),null);
    await click('.csm-account-avatar');
    assert.equal(node.querySelector('[role="dialog"]'),null,'Tapping the icon cannot open the old sheet');
    assert.equal(document.body.style.overflow,'');
    assert.equal(node.querySelector('.csm-account-name h1').textContent,currentUser?.nombre || 'Mi cuenta');
    assert.equal(node.querySelectorAll('.csm-account-shortcuts > button').length,4);
    assert.equal(node.querySelector('[data-account-action="wallet"]').disabled,true);
    assert.deepEqual(calls,previousCalls);
  }
}
await act(async()=>root.unmount());
dom.window.close();
console.log('PASS profile: legacy CSS regression, native/web styles, menu actions, disabled wallet, branch WhatsApp, person icon for new/legacy accounts, no gallery/photo rendering or persistence, unchanged native permissions. No real uploads or orders.');
