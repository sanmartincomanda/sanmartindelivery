import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadNativeAuthentication } from '../src/services/nativeAuthentication.js';
import { signInGoogle } from '../src/services/googleSignIn.js';
import { signInApple } from '../src/services/appleSignIn.js';

// Use the actual installed Capacitor/Firebase plugin Proxy, not a plain mock.
// Only the device's native transport is isolated; no network or accounts are used.
const calls = [];
let failure;
globalThis.webkit = { messageHandlers: { bridge: {} } };
globalThis.Capacitor = {
  PluginHeaders: [{ name: 'FirebaseAuthentication', methods: ['signInWithGoogle', 'signInWithApple'].map(name => ({ name, rtype: 'promise' })) }],
  nativePromise: async (plugin, method, options) => {
    calls.push({ plugin, method, options });
    if (failure) throw failure;
    return { credential: { idToken: 'test-id-token', nonce: 'test-nonce' } };
  },
};
const { Capacitor } = await import('@capacitor/core');
const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
assert.equal(typeof FirebaseAuthentication.then, 'function', 'Real plugin must reproduce thenable behavior');

// Reproduce the old loader: its outer promise stays pending, and the Proxy's
// phantom then() rejects separately without ever reaching a sign-in method.
const unhandled = [];
const onUnhandled = error => unhandled.push(error);
process.on('unhandledRejection', onUnhandled);
let unsafeSettled = false;
const unsafe = (async () => FirebaseAuthentication)();
unsafe.then(() => { unsafeSettled = true; }, () => { unsafeSettled = true; });
await new Promise(resolve => setTimeout(resolve, 30));
process.off('unhandledRejection', onUnhandled);
assert.equal(unsafeSettled, false);
assert.equal(unhandled.length, 1);
assert.match(unhandled[0].message, /FirebaseAuthentication\.then\(\).*not implemented/);
assert.equal(calls.length, 0, 'The broken loader never reaches Google or Apple');

const deadline = promise => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Native loader did not settle')), 500);
  })]).finally(() => clearTimeout(timer));
};
const native = await deadline(loadNativeAuthentication());
assert.equal(native.then, undefined);
assert.equal(Object.getPrototypeOf(native), Object.prototype);
const user = { uid: 'test-customer' };
const deps = {
  runtime: Capacitor,
  loadNative: loadNativeAuthentication,
  signInPopup: () => { throw new Error('Native sign-in must not use a WebView popup'); },
  credentialFromTokens: (...tokens) => tokens,
  signInCredential: async () => ({ user }),
  saveDisplayName: async () => {},
};
assert.equal(await deadline(signInApple(deps)), user);
assert.equal(await deadline(signInGoogle(deps)), user);
failure = new Error('Sign in canceled.');
await assert.rejects(deadline(signInApple(deps)), /canceled/);
await assert.rejects(deadline(signInGoogle(deps)), /canceled/);
failure = undefined;
assert.equal(await deadline(signInGoogle(deps)), user);
delete globalThis.webkit;
globalThis.androidBridge = {};
assert.equal(await deadline(signInGoogle(deps)), user);
assert.deepEqual(calls.at(-1).options, { skipNativeAuth: true, useCredentialManager: true });
const importError = new Error('Chunk load failed');
await assert.rejects(deadline(loadNativeAuthentication(async () => { throw importError; })), error => error === importError);
const roles = readFileSync(new URL('../src/services/authRoles.js', import.meta.url), 'utf8');
assert.equal((roles.match(/loadNative: loadNativeAuthentication/g) || []).length, 3, 'Both login paths and Apple revocation use the safe loader');
assert.ok(!roles.includes("(await import('@capacitor-firebase/authentication')).FirebaseAuthentication"));
console.log('Real Capacitor Proxy: reproduced old unresolved then(), safe loader reaches Apple/Google, cancel/retry and Android transport passed.');
