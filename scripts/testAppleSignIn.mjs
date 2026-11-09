import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canUseAppleSignIn, canUseNativeAppleSignIn, signInApple, revokeAppleForDeletion, getAppleAuthErrorMessage } from '../src/services/appleSignIn.js';

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
  assert.equal(canUseAppleSignIn(f.deps.runtime), true);
  assert.deepEqual(f.calls, [{ skipNativeAuth: true }, { idToken: 'test-token', rawNonce: 'test-nonce' }, 'credential']);
  assert.equal(f.user.displayName, 'Customer Name');
  assert.equal(f.user.email, 'customer@privaterelay.appleid.com');
}
for (const platform of ['web', 'android']) {
  const f = fixture();
  f.deps.runtime.getPlatform = () => platform;
  assert.equal(canUseNativeAppleSignIn(f.deps.runtime), false);
  assert.equal(canUseAppleSignIn(f.deps.runtime), false, 'Unsupported native runtimes must not use a browser popup');
  await assert.rejects(signInApple(f.deps), { code: 'auth/native-apple-unavailable' });
  assert.equal(f.calls.length, 0);
}
{
  const f = fixture();
  f.deps.runtime = { isNativePlatform: () => false, isPluginAvailable: () => { throw Error('Web must not inspect plugins'); } };
  f.deps.signInPopup = async () => { f.calls.push('popup'); return { user: f.user }; };
  assert.equal(canUseAppleSignIn(f.deps.runtime), true);
  const pending = signInApple(f.deps);
  assert.deepEqual(f.calls, ['popup'], 'Open within the original click, without awaiting another loader');
  assert.equal(await pending, f.user);
  assert.deepEqual(f.calls, ['popup'], 'No native or extra credential exchange on the web');
}
for (const code of ['auth/popup-blocked', 'auth/popup-closed-by-user', 'auth/cancelled-popup-request',
  'auth/unauthorized-domain', 'auth/account-exists-with-different-credential']) {
  const f = fixture();
  f.deps.runtime.isNativePlatform = () => false;
  f.deps.signInPopup = async () => { throw Object.assign(new Error(code), { code }); };
  await assert.rejects(signInApple(f.deps), { code });
  assert.equal(f.calls.length, 0, 'A web error must not start native sign-in');
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
assert.match(getAppleAuthErrorMessage({ code: 'auth/popup-blocked' }), /ventanas emergentes/);
assert.match(getAppleAuthErrorMessage({ code: 'auth/popup-closed-by-user' }), /cancelo/);
assert.match(getAppleAuthErrorMessage({ code: 'auth/unauthorized-domain' }), /configuracion/);
const ui = readFileSync(new URL('../src/components/TiendaVirtualView.jsx', import.meta.url), 'utf8');
assert.match(ui, /onAppleLogin=\{canUseAppleSignIn\(Capacitor\)/);
assert.match(ui, /Autorizo asociar mi nombre, telefono y direccion/);
assert.match(ui, /<svg className="store-apple-mark"/, 'Apple mark renders without a platform-specific private-use font glyph');
const roles = readFileSync(new URL('../src/services/authRoles.js', import.meta.url), 'utf8');
assert.ok(roles.includes("const appleProvider = new OAuthProvider('apple.com')"));
assert.ok(roles.includes("appleProvider.addScope('email')"));
assert.ok(roles.includes("appleProvider.addScope('name')"));
assert.ok(roles.includes('signInPopup: () => signInWithPopup(auth, appleProvider)'));
assert.ok(roles.includes('reauthenticateWithPopup(currentUser, appleProvider)'));
console.log('Apple auth passed: web popup/click gesture/errors, native iOS nonce, missing credentials, name persistence and private relay.');

function deletionFixture() {
  const f = fixture();
  f.result.credential.authorizationCode = 'single-use-code';
  f.user.providerData = [{ providerId: 'apple.com' }];
  f.user.getIdToken = async force => { assert.equal(force, true); return 'firebase-session-token'; };
  const deps = {
    ...f.deps, user: f.user, apiKey: 'public-firebase-key',
    reauthenticate: async (user, credential) => { assert.equal(user, f.user); assert.equal(credential, 'credential'); f.calls.push('reauthenticated'); },
    fetchImpl: async (url, options) => { f.calls.push({ url, options }); return { ok: true }; },
  };
  return { ...f, deps };
}
{
  const f = deletionFixture();
  assert.equal(await revokeAppleForDeletion(f.deps), true);
  assert.equal(f.calls[2], 'reauthenticated');
  const request = f.calls[3];
  assert.match(request.url, /^https:\/\/identitytoolkit.googleapis.com\/v2\/accounts:revokeToken\?key=/);
  assert.deepEqual(JSON.parse(request.options.body), { providerId: 'apple.com', tokenType: 'CODE', token: 'single-use-code', idToken: 'firebase-session-token' });
}
{
  const f = deletionFixture();
  f.deps.reauthenticate = async () => { throw Object.assign(new Error('Wrong user'), { code: 'auth/user-mismatch' }); };
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/user-mismatch' });
  assert.equal(f.calls.length, 2, 'Never revoke another customer account');
}
{
  const f = deletionFixture();
  delete f.result.credential.authorizationCode;
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/missing-apple-credential' });
}
{
  const f = deletionFixture();
  f.deps.fetchImpl = async () => ({ ok: false });
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/apple-revocation-failed' });
}
for (const platform of ['web', 'android']) {
  const f = deletionFixture();
  f.deps.runtime.getPlatform = () => platform;
  assert.equal(await revokeAppleForDeletion(f.deps), false);
  assert.equal(f.calls.length, 0);
}
{
  const f = deletionFixture();
  f.user.providerData = [{ providerId: 'google.com' }];
  assert.equal(await revokeAppleForDeletion(f.deps), false);
  assert.equal(f.calls.length, 0);
}
console.log('Apple revocation passed: fresh consent, same-user reauthentication, success, failure and platform isolation.');

function webDeletionFixture() {
  const f = deletionFixture();
  f.deps.runtime.isNativePlatform = () => false;
  f.deps.reauthenticatePopup = async user => { f.calls.push('web-reauth'); return { user }; };
  f.deps.credentialFromResult = result => { assert.equal(result.user, f.user); return { accessToken: 'fresh-apple-access-token' }; };
  f.deps.revokeAccessToken = async token => { f.calls.push(['web-revoke', token]); };
  return f;
}
{
  const f = webDeletionFixture();
  assert.equal(await revokeAppleForDeletion(f.deps), true);
  assert.deepEqual(f.calls, ['web-reauth', ['web-revoke', 'fresh-apple-access-token']]);
}
{
  const f = webDeletionFixture();
  f.deps.reauthenticatePopup = async () => ({ user: { uid: 'other-user' } });
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/user-mismatch' });
  assert.deepEqual(f.calls, []);
}
{
  const f = webDeletionFixture();
  f.deps.credentialFromResult = () => null;
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/missing-apple-credential' });
  assert.deepEqual(f.calls, ['web-reauth']);
}
for (const code of ['auth/popup-closed-by-user', 'auth/user-mismatch']) {
  const f = webDeletionFixture();
  f.deps.reauthenticatePopup = async () => { throw Object.assign(new Error(code), { code }); };
  await assert.rejects(revokeAppleForDeletion(f.deps), { code });
  assert.deepEqual(f.calls, []);
}
{
  const f = webDeletionFixture();
  f.deps.revokeAccessToken = async () => { throw Object.assign(new Error('revoke failed'), { code: 'auth/network-request-failed' }); };
  await assert.rejects(revokeAppleForDeletion(f.deps), { code: 'auth/network-request-failed' });
}
{
  const f = webDeletionFixture();
  f.user.providerData = [{ providerId: 'google.com' }];
  assert.equal(await revokeAppleForDeletion(f.deps), false);
  assert.deepEqual(f.calls, []);
}
console.log('Web Apple revocation passed: fresh popup, same account, missing token, cancellation and network errors.');
