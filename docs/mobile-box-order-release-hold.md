# Mobile box order update: HOLD FOR APPLE APPROVAL

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

1. Verify Apple 1.0.0 (5) is approved in App Store Connect, not merely processing
   or Pending Review. Re-check the highest build/version codes in both stores.
2. Confirm the packages still contain all intended changes; rebuild if code,
   signing material or version requirements changed while waiting.
3. Only then upload the prepared update to the appropriate stores and submit
   the new versions. Preserve Nicaragua-only availability and current settings.
4. Do not interpret this document as an automatic scheduled upload. No background
   monitoring or automatic store publication was configured.

Build/test results and local artifact hashes will be recorded after validation.
