# Android 1.2.14 (17): current storefront and native login repair

Prepared and submitted on 2026-11-09, around 12:02 Nicaragua, after enabling
TestFlight 1.0.0 (5) and submitting that build to App Review as requested.

## Scope and provenance

- Base checkout: 9c50efeb027d, matching origin/main and release/ios-app-store
  when fetched before the release. Only the Android version and artifact label
  were changed for this binary; app source includes 8a5d9af and the native-loader
  repair from 7b7fd25. APK/AAB hashes below identify the actual upload.
- Corrected Capacitor Proxy async loading, Google cancellation/retry and error
  recovery; guests do not receive repeated coverage prompts. Android keeps
  Google/email sign-in, not an inoperative Apple button.
- Mixed boxes with 2-5 equal-weight cuts, one price per pound, featured 15 lb
  mixed box, horizontal promotion/box rows and reduced Black November seal.
- No pricing, availability, customer data, order, Gold, SDK or permission changes.
  No Functions, database/storage rules, SICAR or web hosting deployment.
- Package com.sanmartinsr.app, min API 24, target API 36.
- Original upload certificate SHA-1:
  DA:45:01:1C:4E:8A:55:D1:8F:7F:22:66:70:69:DB:2B:FB:CE:4E:93.
- Existing scripts/sicarQuoteSync.mjs changes were excluded and preserved.

## Checks executed

- test:store-access (real Capacitor Proxy regression, cancellation/retry,
  Android transport and guest coverage), test:google-auth.
- test:box-sales, test:box-sales-ui, test:retail-home, test:store-editorial,
  test:manual-route (578 assertions plus route coverage/date checks),
  test:store-product-promotions, test:store-order-source, test:retail-interactions.
- npm run android:sync; Gradle assembleRelease, bundleRelease, lintRelease.
  Build successful in 1m22s; lint zero errors, 26 warnings (existing count).
- apksigner verification passed; jarsigner reports jar verified; bundletool
  validate passed. Manifest explicitly reports 17 / 1.2.14.
- Read config directly from the signed AAB: correct package, bundled assets
  (no remote server URL), both providers retained and skipNativeAuth true.
- Rebuilt dist for WEB afterward and passed test:web-release (four tests).
  This prevents a native-only dist from accidentally replacing all web modules.
- No physical Android device/emulator was connected. Native account consent,
  installation and real purchase were not newly tested by the agent. No real
  orders or customer accounts were used in these regression checks.
- Existing >500 KB chunk, Gradle/SDK deprecation and R8 advisories remain.
  Jarsigner prints the same self-signed/no-timestamp and stream-layout warnings
  documented for previous bundles; Play accepted the uploaded signed bundle.

## Google Play result

- Previous production version 16 / 1.2.13 verified before building.
- Uploaded Carnes-San-Martin-1.2.14.aab and saved production 17 / 1.2.14.
- No release validation errors. Only optional R8/deobfuscation warning.
- Zero supported-device losses compared with 16; estimated fresh download
  14.1 MB and update 651 kB.
- 100% rollout to existing target market. Countries page explicitly showed
  Nicaragua as the only targeted country. No market changes made.
- Managed publishing remains disabled: publication follows approval automatically.
- Set unrelated Alpha 10 / 1.2.7 aside using Save for later before submission.
  Confirmed only one change, production 17, in the review submission.
- Final console showed production 17 under Cambios en revision with quick checks
  still running. Alpha 10 remained under unsent changes. Do not send Alpha just
  because the page still offers Enviar 1 cambio a revision.
- Submission confirmed, not approval/public availability. Current customers
  continue on the previous public version until Google releases this update.
- Evidence: tmp/android-1.2.14-submitted.png.
- Console: https://play.google.com/console/u/1/developers/8423250849699696422/app/4976378919018801367/publishing

## Local artifacts

Folder: ../android-release-1.2.14/

- Carnes-San-Martin-1.2.14.aab: 14,471,462 bytes.
  SHA256: 50E83FF7EBF2ADE607E0A8637B760AAA40EBACE2D1DFBB94C0A48D883BBBE231.
- Carnes-San-Martin-1.2.14.apk: 14,941,768 bytes.
  SHA256: EDD74A427DB5E4C9D3D79D7198BB7DB86E7618DEAAE1F1B2EBDA9EAB6ADF1195.

The APK uses the upload certificate for direct installation. Existing Play-signed
installations should update through Play Store; do not uninstall customer apps
to work around the separate upload/distribution certificate.
