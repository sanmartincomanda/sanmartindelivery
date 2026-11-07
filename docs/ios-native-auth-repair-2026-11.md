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

## Primary references

- Google redirect handling: https://developers.google.com/identity/sign-in/ios/sign-in
- Upstream unresolved-promise report: https://github.com/capawesome-team/capacitor-firebase/issues/1040
- Upstream proposed guard fixes (not merged when inspected): https://github.com/capawesome-team/capacitor-firebase/pull/1041
- Apple nonce and Firebase validation: https://firebase.google.com/docs/auth/ios/apple
