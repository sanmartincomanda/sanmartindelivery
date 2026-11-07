import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

// Exercise the real storeUsers orchestration with isolated auth/database edges.
// No account, coupon, order or network request is created by this test.
const modules = {
  'firebase/database': `
    export const ref = (_db, path) => path;
    export const query = (path, ...filters) => ({path, filters});
    export const equalTo = value => value;
    export const orderByChild = value => value;
    export const get = key => globalThis.fixture.read(key);
    export const update = (...args) => globalThis.fixture.write(...args);
    export const set = update;
    export const push = () => ({key: 'unused'});`,
  '../firebase': 'export const database = {};',
  './authRoles': `
    export const normalizeAuthEmail = value => String(value || '').trim().toLowerCase();
    export const buildStoreCustomerEmail = phone => phone + '@legacy.invalid';
    export const getCurrentAuthUser = () => globalThis.fixture.authUser;
    export const signInStoreCustomer = () => globalThis.fixture.signIn('password');
    export const signInStoreCustomerWithGoogle = () => globalThis.fixture.signIn('google');
    export const signInStoreCustomerWithApple = () => globalThis.fixture.signIn('apple');
    export const touchLastLogin = () => globalThis.fixture.extras;
    export const upsertOwnClientRole = () => globalThis.fixture.role();
    export const createStoreCustomerAuth = () => { throw Error('Unexpected account creation'); };
    export const sendStoreCustomerPasswordReset = () => { throw Error('Unexpected password reset'); };`,
  './geo': 'export const hasLocation = () => true; export const normalizeLocation = v => v;',
  './customerBirthday': 'export const normalizeBirthdayValue = v => v;',
  './clientDirectory': 'export const setClientDirectoryEntry = () => { throw Error("Unexpected client write"); };',
  './storeWelcomeCoupon': 'export const ensureStoreWelcomeCouponForUser = () => globalThis.fixture.extras;',
  './storeAddresses': 'export const normalizeStoreAddresses = () => []; export const serializeStoreAddresses = v => v; export const getDefaultStoreAddress = () => null;',
};
const output = await build({
  entryPoints: [fileURLToPath(new URL('../src/services/storeUsers.js', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'cjs',
  plugins: [{ name: 'isolated-store-login', setup(builder) {
    builder.onResolve({filter: /.*/}, args => modules[args.path] ? {path: args.path, namespace: 'mock'} : undefined);
    builder.onLoad({filter: /.*/, namespace: 'mock'}, args => ({contents: modules[args.path], loader: 'js'}));
  }}],
});
const authUser = {uid: 'qa-customer', email: 'qa@example.invalid', displayName: 'QA'};
const profile = {nombre: 'QA', telefono: '00000000', email: authUser.email, passwordHash: 'private', welcomeCoupon: {code: 'EXISTING'}};
const snapshot = value => ({exists: () => Boolean(value), val: () => value});
const error = code => Object.assign(new Error(code), {code});

function setup(overrides = {}) {
  let finishExtras;
  const reads = [], providers = [];
  const fixture = {
    authUser,
    extras: new Promise(resolve => { finishExtras = resolve; }),
    read: async key => { reads.push(key); return snapshot(typeof key === 'string' && key.endsWith(authUser.uid) ? profile : null); },
    write: () => fixture.extras,
    role: async () => {},
    signIn: async provider => { providers.push(provider); return authUser; },
    ...overrides,
  };
  const module = {exports: {}};
  runInNewContext(output.outputFiles[0].text, {module, exports: module.exports, fixture, console, setTimeout, clearTimeout});
  return {api: module.exports, fixture, reads, providers, finishExtras};
}

for (const provider of ['password', 'google', 'apple']) {
  const test = setup();
  let timer;
  try {
    const method = provider === 'password' ? 'loginStoreUserWithEmail' : provider === 'google' ? 'loginStoreUserWithGoogle' : 'loginStoreUserWithApple';
    const result = await Promise.race([
      test.api[method]({email: authUser.email, password: 'synthetic-password'}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Optional writes blocked login')), 1000); }),
    ]);
    assert.equal(result.key, authUser.uid);
    assert.equal(result.nombre, profile.nombre);
    assert.equal(result.passwordHash, undefined);
    assert.equal(result.welcomeCoupon.code, 'EXISTING');
    assert.deepEqual(test.providers, [provider]);
  } finally { clearTimeout(timer); test.finishExtras(null); }
}

const network = setup({signIn: async () => { throw error('auth/network-request-failed'); }});
await assert.rejects(network.api.loginStoreUserWithEmail({email: authUser.email, password: 'x'}), {code: 'auth/network-request-failed'});
assert.equal(network.reads.length, 0, 'Network failures must not scan the legacy directory');
network.finishExtras(null);

const invalid = setup({signIn: async () => { throw error('auth/invalid-credential'); }, read: async () => { throw error('PERMISSION_DENIED'); }});
await assert.rejects(invalid.api.loginStoreUserWithEmail({email: authUser.email, password: 'x'}), {code: 'auth/invalid-credential'});
invalid.finishExtras(null);

for (const method of ['loginStoreUserWithGoogle', 'loginStoreUserWithApple']) {
  const missing = setup({read: async () => snapshot(null)});
  await assert.rejects(missing.api[method](), e => e.code === 'PROFILE_REQUIRED' && e.authUser.uid === authUser.uid);
  missing.finishExtras(null);
}
console.log('Login flows: password/Google/Apple profiles resolve despite pending extras; network, invalid credentials and incomplete profiles handled.');
