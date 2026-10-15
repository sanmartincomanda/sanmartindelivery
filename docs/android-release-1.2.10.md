# Android 1.2.10 (13)

Date: 2026-10-15. Package: `com.sanmartinsr.app`.
Storefront source: `b18dd5d`, plus this release's Android version bump.

## Contents

- Current storefront, including every active promotion and combo on Home in
  responsive rows instead of truncated horizontal promotional rails.
- Includes the current Gold reservation safeguards and configurable Ruta client.
  This release does not reactivate Ruta or change its live configuration.
- Existing checkout, prices, payment integrations and customer authentication.
- Same upload signing key, minimum API 24, target API 36, permissions and device
  features as 1.2.9. No new SDK. R8 remains unchanged.

## Verification

- Passed: retail-home, store-editorial, store-product-promotions,
  store-categories, first-order-rewards, store-reward-status and manual-route
  (578 assertions plus coverage, pricing and delivery-date checks).
- Gold reservation safety: 20 emulator scenarios passed. Ruta rules: 31 checks;
  Ruta settings API: 26 checks. Tests use loopback/demo namespaces only.
- Android production web build, Capacitor sync, Gradle assembleRelease,
  bundleRelease and lintRelease successful. Lint: 0 errors, 26 existing warnings.
- APK signature verified; upload certificate SHA-256 unchanged:
  `e40799a92ede3f21900407a5b71e8f6073e2b1afad122eb219e9b1e91ec5e755`.
- Bundletool validation successful. Manifest confirms version 13/1.2.10;
  SDK, permissions and feature declarations match the previous bundle.
- Jarsigner: jar verified, with existing self-signed/no-timestamp and ZIP
  streaming-order warnings. Play upload validation remains authoritative.
- All 75 Android web assets match the AAB byte-for-byte. Both compiled JS and CSS
  include the complete promotional grid.
- Browser QA of the compiled native entry at 390x844: 7 promoted products and
  3 combos across 4 and 2 rows; no horizontal overflow. Guest entry, adding the
  last promotion, cart discount/subtotal, returning and removal passed.
- No Android device or emulator connected: no device installation, native Google
  sign-in, GPS, payment or real-order test was performed.

## Artifacts

Local folder: `../android-release-1.2.10/`. Binaries and signing secrets are not
committed to Git.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Carnes-San-Martin-1.2.10.aab | 13428783 | E87B3DC77C202DB49AC3E280C153CE5F5AFAA33A9CA4F413F0C315F9DD79A63E |
| Carnes-San-Martin-1.2.10.apk | 13758639 | 8E5BC646139E5301F2306D8E0E2FAD3432465FC1F310328B975D4406CF9181CF |

## Distribution

Play Console accepted the bundle with no blocking errors and one optional
R8/deobfuscation warning. Its comparison reports zero devices losing support.

Production version 13 (1.2.10) was submitted for full rollout on 2026-10-15.
The existing country targeting was left unchanged (Nicaragua). Publishing
overview confirms this version under "Cambios en revision", with automated
pre-review checks still running. Managed publishing remains disabled, so the
release is configured to publish automatically after approval.

An unrelated pending Alpha 10 (1.2.7) change was excluded from this submission;
it remains unsent. No test-track release was submitted.

Google approval and public availability of 1.2.10 are not yet confirmed.
Proof: `../android-release-1.2.10/Play-Console-1.2.10-en-revision.jpg`.
