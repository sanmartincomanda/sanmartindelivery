import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInGoogle, getGoogleAuthErrorMessage } from '../src/services/googleSignIn.js';

function fixture({ native = true, platform = 'android', available = true, errors = [], result = { credential: { idToken: 'test-token' } } } = {}) {
  const calls = [];
  const user = { uid: 'test-only' };
  const deps = {
    runtime: { isNativePlatform: () => native, getPlatform: () => platform, isPluginAvailable: () => available },
    loadNative: async () => {
      calls.push('load');
      return { signInWithGoogle: async options => {
        calls.push(options);
        if (errors.length) throw errors.shift();
        return result;
      } };
    },
    signInPopup: async () => { calls.push('popup'); return { user }; },
    credentialFromTokens: (id, access) => { calls.push(['tokens', id, access]); return 'credential'; },
    signInCredential: async credential => { calls.push(credential); return { user }; },
  };
  return { deps, calls, user };
}

for (const platform of ['web', 'android']) {
  const f = fixture({ native: false, platform });
  assert.equal(await signInGoogle(f.deps), f.user);
  assert.deepEqual(f.calls, ['popup']);
}
{
  const f = fixture();
  assert.equal(await signInGoogle(f.deps), f.user);
  assert.deepEqual(f.calls, ['load', { skipNativeAuth: true, useCredentialManager: true }, ['tokens', 'test-token', null], 'credential']);
}
{
  const f = fixture({ platform: 'ios', result: { credential: { idToken: 'id', accessToken: 'access' } } });
  await signInGoogle(f.deps);
  assert.deepEqual(f.calls[1], { skipNativeAuth: true });
  assert.deepEqual(f.calls[2], ['tokens', 'id', 'access']);
}
for (const message of ['No credentials available', 'NoCredentialException', 'Credential manager is not supported']) {
  const f = fixture({ errors: [new Error(message)] });
  assert.equal(await signInGoogle(f.deps), f.user);
  assert.deepEqual(f.calls[2], { skipNativeAuth: true, useCredentialManager: false });
  assert.equal(f.calls.includes('popup'), false);
}
for (const message of ['User canceled', '12501', 'DEVELOPER_ERROR', 'configuration error', 'network failure', 'other error']) {
  const error = new Error(message);
  const f = fixture({ errors: [error] });
  await assert.rejects(signInGoogle(f.deps), candidate => candidate === error);
  assert.equal(f.calls.length, 2);
}
{
  const f = fixture({ platform: 'ios', errors: [new Error('No credentials available')] });
  await assert.rejects(signInGoogle(f.deps));
  assert.equal(f.calls.length, 2);
}
{
  const error = new Error('fallback failed');
  const f = fixture({ errors: [new Error('No credentials available'), error] });
  await assert.rejects(signInGoogle(f.deps), candidate => candidate === error);
  assert.equal(f.calls.length, 3);
}
{
  const f = fixture({ available: false });
  await assert.rejects(signInGoogle(f.deps), { code: 'auth/native-google-unavailable' });
  assert.deepEqual(f.calls, []);
}
for (const result of [undefined, {}, { credential: {} }, { credential: { accessToken: 'access-only' } }]) {
  const f = fixture({ result: result === undefined ? null : result });
  await assert.rejects(signInGoogle(f.deps), { code: 'auth/missing-google-id-token' });
  assert.equal(f.calls.length, 2);
}
{
  const f = fixture();
  f.deps.signInCredential = async () => { throw new Error('Firebase rejected token'); };
  await assert.rejects(signInGoogle(f.deps), /Firebase rejected/);
  assert.equal(f.calls.filter(call => typeof call === 'object' && !Array.isArray(call)).length, 1);
}
assert.match(getGoogleAuthErrorMessage({ code: 'auth/native-google-unavailable' }), /Actualiza la app/);
assert.match(getGoogleAuthErrorMessage({ code: 'auth/popup-blocked' }), /ventanas emergentes/);
assert.match(getGoogleAuthErrorMessage({ message: 'User canceled' }), /cancelo/);
assert.match(getGoogleAuthErrorMessage({ code: 'auth/network-request-failed' }), /conexion/);
assert.match(getGoogleAuthErrorMessage({ code: 'auth/account-exists-with-different-credential' }), /conservar tu cuenta/);

const gradle = readFileSync(new URL('../android/variables.gradle', import.meta.url), 'utf8');
assert.match(gradle, /rgcfaIncludeGoogle\s*=\s*true/);
assert.match(gradle, /androidxCredentialsVersion\s*=\s*'1\.3\.0'/);
assert.match(gradle, /androidxCredentialsPlayServicesAuthVersion\s*=\s*'1\.3\.0'/);
const config = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
assert.equal(config.plugins.FirebaseAuthentication.skipNativeAuth, true);
assert.ok(config.plugins.FirebaseAuthentication.providers.includes('google.com'));
const google = JSON.parse(readFileSync(new URL('../android/app/google-services.json', import.meta.url), 'utf8'));
assert.equal(google.project_info.project_id, 'comanda-digital-ac1ec');
const client = google.client.find(c => c.client_info.android_client_info.package_name === config.appId);
assert.ok(client?.oauth_client.some(c => c.client_type === 3), 'Native build needs a web OAuth client');
assert.ok(client?.oauth_client.some(c => c.client_type === 1), 'Native package needs an Android OAuth client');
console.log('Google auth: web/native routing, token exchange, restricted fallback, cancellation, errors and build config passed.');
