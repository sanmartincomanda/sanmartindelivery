# Native sign-in repair (2026-11-07)

## Scope and release hold

The owner reports Google and Apple sign-in remaining in processing in TestFlight.
Apple's authorization sheet does not appear on their iPhone. The public 1.0.0
submission was withdrawn with permission; do not resubmit until a physical-device
test confirms successful provider consent, profile completion and a retry.

This repairs the shared native loader and hardens the iOS presentation layer.
Web popup behavior, existing customer accounts, prices, orders and backend rules
are unchanged. Android uses the corrected loader when a new binary is built;
publishing source or the website does not update an installed native binary.
The current source also
includes the already-published 2-5-cut mixed boxes and single-row Home sections.

## Findings and changes

- CONFIRMED COMMON ROOT CAUSE: `authRoles.js` returned the raw Capacitor plugin
  Proxy from an async loader. Capacitor 8.4.2 synthesizes a callable `then` property;
  JavaScript Promise assimilation calls it, producing `FirebaseAuthentication.then()
  is not implemented` while the outer loader never settles. Neither Apple nor
  Google reaches native code. `testNativeAuthLoading.mjs` reproduces this using the
  actual installed Capacitor/plugin Proxy (only device transport is stubbed), then
  proves a plain-method facade reaches both providers, cancels and retries. All
  three loaders, including Apple revocation, now use that safe facade.
- Inspected the actual signed build 3 IPA from run `42412985970`, not just local
  generated files. Its bundled Capacitor config includes `google.com`, `apple.com`
  and `skipNativeAuth: true`. Missing provider configuration is not the cause in
  that archive. Local generated config had been stale and is not release evidence.
- Capacitor invokes plugin methods on its serial `bridge` queue. Authentication
  8.0.0 starts Apple's ASAuthorizationController directly on that queue. Google's
  singleton/configuration and controller access also occur before its main-queue
  dispatch. Both sign-in/link entry points now dispatch the entire flow to main.
- Apple retains its validated presentation window and authorization controller
  through Face ID/consent. Invalid credentials/nonce/token now reject instead of
  silently returning or crashing. The cryptographic nonce and Firebase verification
  remain mandatory; no fallback that bypasses identity checks was added.
- Google AppDelegate now forwards OAuth callback URLs to GIDSignIn before the
  existing Capacitor deep-link handler. The iOS OAuth client is no longer passed
  as a server OAuth client: this app uses ID-token exchange, not server-code login.
- Missing native implementation, provider, Google SDK, client ID, presentation
  window or returned token produces an explicit failure. Cancellation continues
  through the existing error mapping and single-attempt guard. No automatic
  account linking or production-account creation is used to test these paths.
- SDK changes live in repeatable, anchor-checked `scripts/ios/patchNativeAuth.mjs`,
  applied by `prepareIos.mjs` after every `cap sync ios`. They do not depend on an
  uncommitted local node_modules edit. Upstream changes stop the build for review.

The loader defect is reproduced and fixed. Successful account consent and profile
completion still require the owner's physical-device test; presenting a dialog or
receiving a simulator authorization error is not a completed login.

## Verification

- Local passing: `test:ios-config`, `test:google-auth`, `test:apple-auth`,
  `test:store-access`, `test:box-sales`, `test:retail-home`, `test:store-editorial`.
- Added `StoreNativeAuthTests` with a fresh login screen, Google native consent,
  cancellation/retry and Apple response without waiting for the JS timeout.
  The simulator has no Apple ID; a returned system error does not prove consent.
- Baseline run `42422213250`, source `cb06528`: Apple reproduced the disabled form
  and endless processing with no native sheet. Evidence in
  `tmp/ios-auth-baseline-42422213250`. Google was not invoked because its accessible
  label includes the decorative G; the test selector was corrected.
- Run `42422517588` caught an obsolete optional guard in the Swift compatibility
  patch. Fixed and covered in `test:ios-config`. Subsequent runs `42422928915` and
  `42423164418` were canceled when superseded by the confirmed shared-loader fix.
- No real order, customer credential or reward record is used by these tests.

## Verified candidate and upload

- Source `7b7fd25f02101aaba6cfdeb6946f757ebd9a1dac` passed native iPhone 17 Pro
  run `42423423517`: two XCTest cases, zero failures. Google presented the
  accounts.google.com system consent alert, cancellation restored the form, and
  a second tap reopened it. Apple's native controller was reached and returned
  AuthorizationError 1000 on the unsigned simulator without an Apple account;
  the form recovered immediately instead of remaining in processing. This is
  NOT evidence of completed Apple consent. Debug-only native logs confirm both
  entry points execute on main; they contain no customer credentials.
- Screenshots and logs: `tmp/ios-auth-fixed-42423423517/`. The old Apple hang is
  preserved separately in the baseline evidence. Images were visually reviewed.
- Signed release run `42423444946` succeeded. Apple validated and accepted
  **1.0.0 (4)** at 17:11 Nicaragua on 2026-11-07. Build ID:
  `110ea2fe-9cb8-4d07-9928-8cfe900a6c74`.
- IPA: `tmp/ios-app-store-1.0.0-4/App.ipa`; SHA256:
  `9C03B99E6981F600156E0D4E09C657B0BF5C8E5A5E9A486CF6CDD7CBA63B9BD9`.
- All 19 bundled privacy manifests are byte-identical to signed build 3. No new
  SDK, scope, backend permission or privacy declaration was introduced.
- The signed executable and its embedded provisioning profile both contain the
  `com.apple.developer.applesignin` entitlement with `Default`.
- Also passed box-sales UI and manual Ruta regression tests (578 assertions).
- Web production build and its four release gates pass; web login keeps its
  existing popup route. This verification is not a new web hosting deployment.
- App Review remains withdrawn. Successful Google/Apple account login, profile
  completion and Apple reauthentication/revocation still require a physical
  device. Do not submit the old build 3 or represent the simulator response as a
  successful customer login.

## Primary references

- Google redirect handling: https://developers.google.com/identity/sign-in/ios/sign-in
- Upstream unresolved-promise report: https://github.com/capawesome-team/capacitor-firebase/issues/1040
- Upstream proposed guard fixes (not merged when inspected): https://github.com/capawesome-team/capacitor-firebase/pull/1041
- Apple nonce and Firebase validation: https://firebase.google.com/docs/auth/ios/apple
