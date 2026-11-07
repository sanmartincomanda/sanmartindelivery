import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { enableIosGoogleProvider } from './prepareIos.mjs';
import { nativeAuthPatchFiles, patchNativeAuth } from './ios/patchNativeAuth.mjs';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const google = read('ios/App/App/GoogleService-Info.plist');
const info = read('ios/App/App/Info.plist');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const reverseClient = google.match(/<key>REVERSED_CLIENT_ID<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
assert.ok(reverseClient, 'Google native configuration must include an OAuth client');
assert.ok(info.includes(reverseClient), 'Google callback URL must match the native client');
assert.match(google, /<key>BUNDLE_ID<\/key>\s*<string>com\.sanmartinsr\.app<\/string>/);
assert.match(google, /<key>PROJECT_ID<\/key>\s*<string>comanda-digital-ac1ec<\/string>/);
assert.match(project, /GoogleService-Info\.plist in Resources/);
assert.ok(!info.includes('<string>armv7</string>'));
assert.match(read('ios/App/App/App.entitlements'), /com\.apple\.developer\.applesignin/);
assert.equal((project.match(/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;/g) || []).length, 2);
assert.ok(JSON.parse(read('capacitor.config.json')).plugins.FirebaseAuthentication.providers.includes('apple.com'));
const source = read('node_modules/@capacitor-firebase/authentication/Package.swift');
const patched = enableIosGoogleProvider(source);
assert.match(patched, /\.product\(name: "GoogleSignIn"/);
assert.match(patched, /swiftSettings: \[\.define\("RGCFA_INCLUDE_GOOGLE"\)\]/);
assert.equal(enableIosGoogleProvider(patched), patched);
assert.throws(() => enableIosGoogleProvider('unknown manifest'), /manifest changed/);
assert.match(read('ios/App/App/AppDelegate.swift'), /GIDSignIn\.sharedInstance\.handle\(url\)/);
const native = {};
for (const file of nativeAuthPatchFiles) {
  const source = read(`node_modules/@capacitor-firebase/authentication/ios/Plugin/${file}`);
  native[file] = patchNativeAuth(file, source);
  assert.equal(patchNativeAuth(file, native[file]), native[file], `${file}: patch must be repeatable`);
  assert.throws(() => patchNativeAuth(file, 'unknown SDK source'), /source changed/);
}
assert.throws(() => patchNativeAuth('unexpected.swift', ''), /Unexpected/);
const plugin = native['FirebaseAuthenticationPlugin.swift'];
for (const provider of ['Apple', 'Google']) {
  for (const action of ['signIn', 'link']) {
    const method = `${action}With${provider}`;
    const body = plugin.slice(plugin.indexOf(`@objc func ${method}(`)).split('\n    @objc')[0];
    assert.match(body, /DispatchQueue\.main\.async/);
    assert.match(body, /guard let implementation/);
    assert.ok(!body.includes(`implementation?.${method}`));
  }
}
const apple = native['Handlers/AppleAuthProviderHandler.swift'];
assert.match(apple, /dispatchPrecondition\(condition: \.onQueue\(\.main\)\)/);
assert.match(apple, /self\.authorizationController = authorizationController/);
assert.match(apple, /presentationWindow = window/);
assert.ok(!apple.includes('webView?.window)!'));
assert.ok(!apple.includes('appleIDToken.debugDescription'));
assert.ok(!apple.includes('guard let isLink = self.isLink'), 'The action is now non-optional');
assert.match(apple, /fail\("Apple did not return an identity token/);
assert.match(apple, /fail\("Apple authorization no longer has a valid nonce/);
assert.match(apple, /request\.nonce = sha256\(nonce\)/);
const googleHandler = native['Handlers/GoogleAuthProviderHandler.swift'];
assert.match(googleHandler, /Google configuration has no CLIENT_ID/);
assert.match(googleHandler, /Google has no active presentation window/);
assert.match(googleHandler, /Google did not return an identity token/);
assert.match(googleHandler, /#else\s+fail\(isLink, "Google SDK is not included/);
assert.ok(!googleHandler.includes('serverClientID: clientId'), 'An iOS OAuth client is not a server client');
console.log('iOS configuration: callbacks, providers, main-thread UI, credential guards and repeatable native patches passed.');
