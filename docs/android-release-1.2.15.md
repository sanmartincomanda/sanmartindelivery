# Android 1.2.15 (18): rebuilt, pending Play Console upload

Prepared on 2026-11-13 at the owner's request to update both stores.
This document does not claim Play upload, review submission or publication.

## Current state

- Source e64ceff1ede29923b56b3a9030c48165232e3545 matched origin/main.
- Signed build succeeded in 2m11s in GitHub run 43532109488:
  https://github.com/sanmartincomanda/sanmartindelivery/actions/runs/43532109488
- Play Console could not be inspected or changed because browser access was
  disabled for this chat. The owner was asked to enable it. Recheck the highest
  version code before upload, preserve Nicaragua-only distribution, and leave
  the unrelated Alpha draft unsent. Last verified public code was 17.
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

## Files to upload

Use the NEW files, not the older held 1.2.15 build from November 9:

- ../android-release-1.2.15-2026-11-13/Carnes-San-Martin-1.2.15.aab
  14,472,892 bytes; SHA256
  0EB7BB95957EA694DD6D7DE6F452D0D98688491E7736DE896DDBADC41CA2D922
- ../android-release-1.2.15-2026-11-13/Carnes-San-Martin-1.2.15.apk
  14,943,196 bytes; SHA256
  1656CCF24ACCE2D1F1ADC07258A490F7CFB9731AAB7F3B27CE007C018CBD674A

Upload AAB to production. The direct-install APK has the upload-key signature;
existing Play-signed customers must update through Play, not uninstall their
app to bypass certificate differences.

## Suggested release notes

Mejoramos el orden de las cajas en el inicio y las categorias. Los anuncios
ahora abren directamente el producto y se muestran con menor frecuencia.
Conservamos las mejoras de acceso, cajas mixtas y navegacion de la tienda.
