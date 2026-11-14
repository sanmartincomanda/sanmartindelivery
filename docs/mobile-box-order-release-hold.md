# Mobile box order update: HOLD FOR APPLE APPROVAL

## Current status (2026-11-13): original hold satisfied

Apple 1.0.0 (5) was approved on 2026-11-11. The subsequent 1.0.1 (6)
branding/box-order/popup update is now publicly available in Nicaragua,
verified through Apple's public lookup on 2026-11-13. Do not treat the
historical hold below as an active restriction or upload the old artifacts.
Android 1.2.15 (18) was rebuilt from current source e64ceff in run 43532109488;
and submitted to Google Play production review on 2026-11-13. Nicaragua-only,
100% rollout after approval; the unrelated Alpha draft remains unsent. See
docs/android-release-1.2.15.md for hashes, checks and submission evidence.

Owner instruction on 2026-11-09: prepare Android and iPhone updates, but do not
upload either update until the currently submitted App Store version is approved.

## Store status checked before preparation

- Apple: 1.0.0, build 5, Pending Review. Keep this submission unchanged.
- Google Play: production 1.2.14 (17), active. The unrelated Alpha 10 draft
  remains unsent; do not send it with this update.
- No new upload, TestFlight distribution, review submission or publication is
  authorized while Apple 1.0.0 (5) remains unapproved. Do not withdraw build 5.

## Prepared versions

- Android: 1.2.15 (18), package com.sanmartinsr.app.
- iPhone/iPad: 1.0.1 (6), bundle com.sanmartinsr.app. This is the next version
  after the initial 1.0.0 release, not a replacement of its pending build.
- App source includes d81d285: AdminTV-configured boxDisplayOrder is retained
  by catalog normalization and branch resolution, then applied to Home, the
  box category and the announcement. Unranked boxes go last; ties are stable.
- No new backend, commercial rules, native SDKs, permissions or privacy data.
- The iOS signing workflow must be dispatched directly with upload=false:

```text
gh workflow run ios-appstore.yml --ref release/ios-app-store -f build_number=6 -f upload=false
```

Do not use ios-build.yml release=true: that wrapper requests an Apple upload.
GitHub build artifacts are not TestFlight/App Store uploads. Do not run the
TestFlight distribution workflow during this hold (its current input targets
the existing 1.0.0 train).

## Resume checklist

The web popup change dated 2026-11-10 adds direct product destinations. The
prepared binaries below predate that change; rebuild before a future store
upload if this behavior is to be included. The web-only release does not lift
the Apple-approval hold.

1. Verify Apple 1.0.0 (5) is approved in App Store Connect, not merely processing
   or Pending Review. Re-check the highest build/version codes in both stores.
2. Confirm the packages still contain all intended changes; rebuild if code,
   signing material or version requirements changed while waiting.
3. Only then upload the prepared update to the appropriate stores and submit
   the new versions. Preserve Nicaragua-only availability and current settings.
4. Do not interpret this document as an automatic scheduled upload. No background
   monitoring or automatic store publication was configured.

## Build and verification results

- Source commit: 65a909ecb323398a478952b480bcaf07159c1515, saved on
  release/ios-app-store. No main/web publication was performed for this work.
- Passed test:box-sales, test:box-sales-ui, test:box-announcement,
  test:store-access, test:google-auth, test:apple-auth, test:ios-config,
  test:retail-home, test:store-editorial, test:manual-route (578 assertions plus
  route checks), test:store-product-promotions, test:store-order-source and
  test:retail-interactions. These use fixtures, not production purchases.
- Android sync, assembleRelease, bundleRelease and lintRelease passed.
  Lint: zero errors, 26 existing warnings. APK signature and AAB signature /
  bundletool validation passed. Both manifests identify 18 / 1.2.15, min API 24,
  target 36, with the original upload certificate. Existing self-signed,
  no-timestamp and JAR stream-layout warnings remain as in the previous release.
- Verified the compiled storefront SHA256 in both APK and AAB matches the synced
  source assets. Inspected the AAB for boxDisplayOrder, original app ID, embedded
  assets, skipNativeAuth and existing authentication providers.
- Signed iOS archive/export/configuration passed on macOS in GitHub run
  42714347479 (4m47s). The Upload to App Store Connect step explicitly finished
  SKIPPED because upload=false. No new TestFlight assignment was run.
- Inspected downloaded IPA: com.sanmartinsr.app, 1.0.1 (6), boxDisplayOrder and
  legacy 15 lb priority present, both native auth providers/callbacks retained,
  embedded storefront assets, signing resources present. Compared with build 5:
  all 19 privacy manifest files and location usage permissions are unchanged.
- No physical device was connected; actual installation and account sign-in on
  these new binaries have not been retested on a physical iPhone/Android.
- Rebuilt local dist for WEB afterward and passed all four test:web-release
  checks, so a native-only bundle is not left in the web deployment directory.
- Kept scripts/sicarQuoteSync.mjs unchanged and excluded from commits/build scope.

## Artifacts retained locally

- ../android-release-1.2.15/Carnes-San-Martin-1.2.15.aab, 14,471,593 bytes.
  SHA256: B880DE585493A52FF6524726FE34DE6146CC8138C1CF02984EEAA1501BB57BF9.
- ../android-release-1.2.15/Carnes-San-Martin-1.2.15.apk, 14,941,868 bytes.
  SHA256: 32124ADDC20D4080779B1C42F96C7E237EE44A15ED1BD0F5C3EC39720E876F2C.
- ../ios-release-1.0.1/App.ipa, 12,860,587 bytes.
  SHA256: 8DB3EA6E510EA07BB281CAE0D28171CD8BDA09BF6AA085373E55817A3FF5F878.
- Each local folder includes a reminder not to upload before Apple approval.
  APK is upload-key signed: existing Play installations should update through
  Play, not be uninstalled to bypass the signing-certificate difference.
- Build evidence: https://github.com/sanmartincomanda/sanmartindelivery/actions/runs/42714347479
