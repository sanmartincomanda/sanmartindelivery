# Android 1.2.9 (12)

Date: 2026-10-06. Package: `com.sanmartinsr.app`.
Storefront source: `03c28e9`, plus the version bump in this release.

## Contents

- Current storefront redesign, food banners and promotional presentation.
- Promociones category name and direct Home navigation without clearing cart.
- Existing commerce, authentication, prices, Gold and order logic retained.
- Minimum API 24, target API 36, permissions and required device features unchanged
  from the 1.2.8 artifact. No new SDK or signing key.

## Validation

- Passed: retail-home, store-categories, store-product-promotions, store-editorial,
  first-order-rewards tests; Android web build and Capacitor sync.
- Gradle `assembleRelease`, `bundleRelease`, `lintRelease`: successful.
- Lint: zero errors, 26 warnings in existing SDK/dependency, icon/resource,
  manifest-order and backup guidance. R8 remains unchanged; not silently enabled
  as part of this UI update.
- `apksigner verify`: successful; signer SHA-256 matches the previous release:
  `e40799a92ede3f21900407a5b71e8f6073e2b1afad122eb219e9b1e91ec5e755`.
- `bundletool validate` and manifest inspection: valid bundle, version 12/1.2.9.
- `jarsigner -verify`: jar verified. Reports self-signed/no-timestamp and ZIP
  streaming-order warnings for the Gradle-generated AAB; Play validation remains
  the authoritative upload check.
- All 75 current Android web build files match the AAB assets byte-for-byte.
- Previous browser UI audit: `storefront-home-shortcut-qa.md`.
- No physical Android device/emulator connected; no installation smoke test or
  real purchase/payment performed in this release task.

## Artifacts

Local folder next to this checkout: `../android-release-1.2.9/`.
Artifacts and signing secrets are not committed to Git.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| Carnes-San-Martin-1.2.9.apk | 13756687 | 9CB52D78E82CC872719F5A4088692A44A8F83B588143EECAAB41C3B452301B17 |
| Carnes-San-Martin-1.2.9.aab | 13426862 | 172C6B0272D0BAADA85A675B8B2ECD5398F05F580848047E8E868A7F477125DB |

## Distribution

Play Console accepted the uploaded AAB, with no blocking errors and one optional
R8/deobfuscation warning. Its device comparison shows zero devices losing support.

Production release 12 (1.2.9) was submitted on 2026-10-06 for full rollout, keeping
Nicaragua as the only target country. Publishing overview shows it under
"Cambios en revision", with automated pre-review checks still running.
Managed publishing remains disabled: publication is automatic after approval.
Google approval/public availability is not yet confirmed.

An older pending Alpha 10 (1.2.7) change was saved for later to exclude it from
this submission. It remains unsent; no test-track release was published.

Local proof: `../android-release-1.2.9/Play-Console-1.2.9-en-revision.jpg`.
