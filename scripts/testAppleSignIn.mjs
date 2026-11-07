import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseNativeAppleSignIn, signInApple, getAppleAuthErrorMessage } from '../src/services/appleSignIn.js';

function fixture() {
  const calls = [];
  const user = { uid: 'apple-customer', email: 'customer@privaterelay.appleid.com', displayName: '' };
  const result = { credential: { idToken: 'test-token', nonce: 'test-nonce' }, user: { displayName: 'Customer Name' } };
  const deps = {
    runtime: { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: () => true },
    loadNative: async () => ({ signInWithApple: async options => { calls.push(options); return result; } }),
    credentialFromTokens: (idToken, rawNonce) => { calls.push({ idToken, rawNonce }); return 'credential'; },
    signInCredential: async credential => { calls.push(credential); return { user }; },
    saveDisplayName: async (target, name) => { assert.equal(target, user); target.displayName = name; },
  };
  return { deps, calls, user, result };
}
{
  const f = fixture();
  assert.equal(await signInApple(f.deps), f.user);
  assert.deepEqual(f.calls, [{ skipNativeAuth: true }, { idToken: 'test-token', rawNonce: 'test-nonce' }, 'credential']);
  assert.equal(f.user.displayName, 'Customer Name');
  assert.equal(f.user.email, 'customer@privaterelay.appleid.com');
}
for (const platform of ['web', 'android']) {
  const f = fixture();
  f.deps.runtime.getPlatform = () => platform;
  assert.equal(canUseNativeAppleSignIn(f.deps.runtime), false);
  await assert.rejects(signInApple(f.deps), { code: 'auth/native-apple-unavailable' });
  assert.equal(f.calls.length, 0);
}
{
  const f = fixture();
  f.deps.runtime.isPluginAvailable = () => false;
  await assert.rejects(signInApple(f.deps), { code: 'auth/native-apple-unavailable' });
}
for (const field of ['nonce', 'idToken']) {
  const f = fixture();
  delete f.result.credential[field];
  await assert.rejects(signInApple(f.deps), { code: 'auth/missing-apple-credential' });
  assert.equal(f.calls.length, 1, 'Incomplete tokens must never reach Firebase');
}
{
  const f = fixture();
  f.user.displayName = 'Existing name';
  await signInApple(f.deps);
  assert.equal(f.user.displayName, 'Existing name');
}
{
  const f = fixture();
  f.result.user = null;
  await signInApple(f.deps);
  assert.equal(f.user.displayName, '');
}
{
  const f = fixture();
  f.deps.signInCredential = async () => { throw Object.assign(new Error('Rejected'), { code: 'auth/invalid-credential' }); };
  await assert.rejects(signInApple(f.deps), { code: 'auth/invalid-credential' });
  assert.equal(f.user.displayName, '');
}
assert.match(getAppleAuthErrorMessage({ message: 'User cancelled' }), /cancelo/);
assert.match(getAppleAuthErrorMessage({ code: 'auth/network-request-failed' }), /conexion/);
assert.match(getAppleAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' }), /acceso anterior/);
const ui = readFileSync(new URL('../src/components/TiendaVirtualView.jsx', import.meta.url), 'utf8');
assert.match(ui, /onAppleLogin=\{canUseNativeAppleSignIn\(Capacitor\)/);
assert.match(ui, /Autorizo asociar mi nombre, telefono y direccion/);
console.log('Apple auth passed: iOS-only, secure nonce, missing credentials, name persistence, private relay and error handling.');
