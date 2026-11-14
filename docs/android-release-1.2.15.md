# Android 1.2.15 (18): submitted to production review

Prepared on 2026-11-13 at the owner's request to update both stores.
Uploaded and submitted on 2026-11-13, approximately 21:45 America/Managua.
Google approval and public availability are not yet confirmed.

## Current state

- Source e64ceff1ede29923b56b3a9030c48165232e3545 matched origin/main.
- Signed build succeeded in 2m11s in GitHub run 43532109488:
  https://github.com/sanmartincomanda/sanmartindelivery/actions/runs/43532109488
- After the owner enabled browser access, Play Console confirmed production
  17 (1.2.14), with Nicaragua as its only targeted country. The rebuilt AAB
  was accepted as 18 (1.2.15), replacing 17 with a 100% production rollout.
- Exactly one change was submitted. Play displayed "1 cambio enviado a
  revision" and listed Production 18 (1.2.15) under "Cambios en revision".
  Automated preliminary checks were still running at the last observation;
  do not interpret submission as approval or immediate public availability.
- Managed publishing remains disabled: publication is automatic after approval.
  The unrelated closed Alpha 10 (1.2.7) was explicitly saved for later before
  submission and remains in the unsent section. Do not submit that draft.
- iOS does not need a duplicate build: Apple public lookup already returns
  1.0.1, Carnes San Martin Delivery GR, released 2026-11-12T14:48:22Z.
  Its signed build 6 contains the latest native features. The only later app
  source change is web download buttons, hidden in native platforms.
- No web/backend deployment, new SDKs/permissions, customer writes, real
  orders or changes to SICAR. The unrelated sicarQuoteSync.mjs is untouched.

## Included changes relative to Android 1.2.14

- AdminTV-configured ordering for boxes in Home, category and announcement.
- Product-target popup navigation, including Caja Hueso corriente.
- Campaign impressions capped at ten, at most once per Managua calendar day.
- Existing mixed boxes with 2-5 equal cuts, native authentication repairs,
  guest coverage behavior, product pricing and purchase flow are retained.

## Verification

- Passed store-access, google-auth, apple-auth, ios-config, box-sales,
  box-sales-ui, box-announcement, popup-ads, retail-home, store-editorial,
  manual-route (578 assertions plus route checks), store-product-promotions,
  store-order-source and retail-interactions. These tests use fixtures and do
  not create production purchases or establish physical-device sign-in.
- CI rebuilt and synchronized the Android assets, assembled signed APK/AAB
  and verified both signatures. Local apksigner and jarsigner checks passed.
- Bundletool 1.18.3 validate passed. AAB manifest and APK badging both show
  com.sanmartinsr.app, versionCode 18, versionName 1.2.15, min 24, target 36.
- Upload signer SHA-1: DA:45:01:1C:4E:8A:55:D1:8F:7F:22:66:70:69:DB:2B:FB:CE:4E:93.
- Eight compiled JavaScript assets match between APK and AAB. Verified native
  bundled assets, no remote server URL, both configured auth providers and
  skipNativeAuth true. Verified boxDisplayOrder, targetProductCode and
  oncePerDay in both the Android package and the approved iOS build 6.
- Existing JAR self-signed/no-timestamp/stream-layout warnings remain; no
  signature verification failure. R8 remains disabled as in previous builds.
- No physical Android device was connected. This run did not include a new
  device installation, account consent or Gradle lint; the previous lint
  baseline was zero errors and 26 warnings.
- Compilation ran on CI; local dist was not replaced with native web assets.
- Play release validation: zero errors, one non-blocking deobfuscation/R8
  warning. No devices lost compatibility: phone 12,622, tablet 6,839, TV 7,
  wearable 0, car 30, Chromebook 77 and Android XR 2. Minimum API 24 and
  target API 36 are unchanged. Displayed download size: 14.1 MB.
- Rechecked the uploaded file's SHA256 immediately before upload. Fetched
  origin/main; dc4d82d differed from build source only in release documentation.

## Submission evidence

- Production release: tracks/4697538253228337307/releases/10/review.
- Publishing status:
  https://play.google.com/console/u/1/developers/8423250849699696422/app/4976378919018801367/publishing
- Local screenshot:
  ../android-release-1.2.15-2026-11-13/play-console-1.2.15-review.jpg
- No physical-device purchase/sign-in was performed during submission. No
  changes were made to app code, web hosting, backend, pricing or customer data.

## Uploaded artifact and direct-install package

Use the NEW files, not the older held 1.2.15 build from November 9:

- ../android-release-1.2.15-2026-11-13/Carnes-San-Martin-1.2.15.aab
  14,472,892 bytes; SHA256
  0EB7BB95957EA694DD6D7DE6F452D0D98688491E7736DE896DDBADC41CA2D922
- ../android-release-1.2.15-2026-11-13/Carnes-San-Martin-1.2.15.apk
  14,943,196 bytes; SHA256
  1656CCF24ACCE2D1F1ADC07258A490F7CFB9731AAB7F3B27CE007C018CBD674A

The AAB was uploaded to production. The direct-install APK has the upload-key signature;
existing Play-signed customers must update through Play, not uninstall their
app to bypass certificate differences.

## Submitted release notes (es-419)

Mejoramos el orden de las cajas en el inicio y las categorias. Los anuncios
ahora abren directamente el producto y se muestran con menor frecuencia.
Conservamos las mejoras de acceso, cajas mixtas y navegacion de la tienda.
