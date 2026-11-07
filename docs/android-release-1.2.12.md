# Android 1.2.12 (15): mixed boxes and current storefront

Prepared and submitted to Google Play production on 2026-11-07 (Managua).

## Scope

- Storefront source: commit 43bdc17d842e28450e2aea406afb1668039a8fab.
- Bundles all current storefront changes, including single and mixed boxes,
  equal weights across three cuts, one price per pound, original SICAR item
  expansion, shared availability, optimized box images, box announcements,
  persistent category navigation, promotion sharing and launch interactions.
- Retains existing Google sign-in, account, checkout, order attribution and Gold
  behavior. No new permissions, database rules, Functions or SICAR deployment.
- Android package com.sanmartinsr.app, minimum API 24, target API 36.
- Preserves the original upload key (SHA-1
  DA:45:01:1C:4E:8A:55:D1:8F:7F:22:66:70:69:DB:2B:FB:CE:4E:93).
- Existing local edits to scripts/sicarQuoteSync.mjs are excluded and unchanged.
- iOS release remains pending and is not part of this publication.

## Verification

Passed automated checks:

- test:box-sales, test:box-sales-ui, test:box-images, test:box-announcement.
- test:box-sales-rules: 240 local Database Emulator checks.
- test:store-reward-reservations: 20 local Database Emulator scenarios.
- test:retail-interactions, test:google-auth, test:store-order-source,
  test:order-traceability, test:store-product-promotions.
- test:retail-home, test:store-editorial, test:manual-route,
  test:store-reward-status, test:promotion-share, test:store-categories.
- npm run android:sync and Gradle assembleRelease, bundleRelease, lintRelease.
- Android lint: zero errors and 26 warnings, same count as 1.2.11.
- APK signature verified by apksigner; AAB validated by bundletool and signature
  verified by jarsigner. Jarsigner also prints self-signed/no-timestamp and ZIP
  stream-layout warnings; Google Play accepted the signed bundle.
- AAB manifest version verified as 15 / 1.2.12; packaged storefront includes
  mixed-box component metadata and the box catalog flow.
- Rebuilt dist for web afterward and passed test:web-release (4 tests). Native
  dist was not deployed to hosting.

The first reward-reservations invocation lacked its local emulator and failed
with ECONNREFUSED. The complete suite then passed under emulators:exec using a
demo project, without production data writes.

No Android device/emulator was connected. A physical-device installation,
native Google login and end-to-end purchase were not executed. Component and
rules tests used fixtures/emulators; no real customer orders were created.
Existing large-JavaScript-chunk and R8 optimization warnings remain.

## Google Play submission

- Verified highest uploaded code was 14 / 1.2.11 before preparing this release.
- Uploaded Carnes-San-Martin-1.2.12.aab, production release 7.
- Google Play validation: no errors, one optional deobfuscation/R8 warning.
- No supported-device losses compared with version 14.
- Play estimates a 14.1 MB new download and a 1.99 MB update.
- Rollout: 100% of the targeted production audience. Only Nicaragua targeted.
- Managed publishing remains disabled: automatic publication after approval.
- Submitted ONLY production 15 / 1.2.12. Old Alpha 10 / 1.2.7 remains unsent.
- Observed under "Cambios en revision", with initial quick checks running.
  Submission is confirmed; approval/public availability is NOT confirmed.
- Local screenshot: tmp/android-1.2.12-submitted.jpg.
- Console: https://play.google.com/console/u/1/developers/8423250849699696422/app/4976378919018801367/publishing

## Artifacts

Local folder: ../android-release-1.2.12/

- Carnes-San-Martin-1.2.12.apk: 14,938,424 bytes.
  SHA-256: 7B40F72A8325EE6D53CA43EDD812757941890BFD23426868F5E8F98ED5564740
- Carnes-San-Martin-1.2.12.aab: 14,468,139 bytes.
  SHA-256: 2C87D40D50EB518B4AD266AE1AD197C59317872753C9A5032A43E32DE1D2ACD1

The APK is upload-key signed for direct installation. Existing Play-signed
installations should update through Google Play, not replace their app using
this APK. Do not uninstall a customer's app to work around signing differences.
