# Android 1.2.11 (14): Google sign-in

Prepared locally on 2026-10-16. Submitted to Google Play production on 2026-10-17.
Publishing the web frontend does not update installed Android applications.

## Publication

- Play accepted versionCode 14 / 1.2.11, production release 6, with no errors.
- Only warning: optional R8/ProGuard deobfuscation file, no release blocker.
- No loss of supported devices compared with production 13 / 1.2.10.
- Rollout 100%, Nicaragua only; managed publishing remains disabled (automatic
  publication after approval). Version is submitted, NOT yet confirmed live.
- Play shows production 14 under Changes in review, initially running quick
  checks. The old Alpha 10 / 1.2.7 change was excluded and remains unsent.
- Evidence: output/playwright/android-1.2.11-submitted.png (local, not tracked).

## Findings

- Live Firebase project comanda-digital-ac1ec has Google enabled and
  tienda.sanmartinsr.com authorized. Its OAuth web client matches the Android
  google-services.json web client.
- The production web button opens Google's official sign-in screen. No real
  account sign-in or customer creation was completed during QA.
- Android was missing the explicit rgcfaIncludeGoogle build setting. However,
  inspection of the 1.2.10 APK found GoogleSignInClient, CredentialManager and
  GetGoogleIdOption supplied transitively. Missing libraries alone are NOT
  established as the cause of the reported failure.
- Credential Manager previously had no alternate account-selection flow. The
  plugin defaulted to prerelease Credentials 1.2.0-rc01.
- Before the 2026-10-17 publication audit, Firebase registered only the upload certificate
  (SHA-1 DA:45:01:1C:4E:8A:55:D1:8F:7F:22:66:70:69:DB:2B:FB:CE:4E:93).
  Play Console confirmed three different distribution SHA-1 certificates:
  50:A5:8E:02:83:DB:D2:F3:E1:82:F3:5A:E2:1A:25:7E:1E:57:48:F8 (current),
  E6:B5:AF:DE:03:64:2F:C7:EB:EC:E7:03:E6:1A:54:54:E9:67:BC:F2 and
  63:8E:C6:1F:8A:A3:C9:45:91:6D:3E:64:62:BD:F9:05:B5:E5:BD:47.
  None were registered. This is a confirmed OAuth configuration defect for
  Play-signed installations, separate from the Credential Manager fallback.

## Changes

- Explicit Google runtime dependencies and stable Credentials 1.3.0.
- Native Google login exchanges the ID token into the existing Firebase JS
  session. Android retries once with the plugin's alternate account picker
  only for no-credential/unsupported-manager errors.
- No fallback for cancellation, network failure or OAuth configuration errors.
  Never open Google OAuth inside the Android WebView.
- Web retains Firebase popup sign-in. Clear customer-facing error messages
  replace Firebase administrator instructions.
- No changes to account IDs, passwords, profiles, rewards, orders or DB rules.
- Includes the previously published WEB/APP order attribution.
- Registered the three Play distribution SHA-1 certificates and corresponding
  SHA-256 certificates in the existing Firebase Android app on 2026-10-17.
  Preserved the upload key and all existing certificates. No key rotation.
- Downloaded the generated google-services.json: three new Android OAuth
  clients, unchanged web client and project. Regression test now checks all
  distribution and upload certificate entries.

## Verification

- test:google-auth: web vs native routing, token exchange, fallback success
  and failure, cancellation, iOS behavior, missing plugin/token, Firebase token
  rejection, messages and Android packaging configuration.
- test:store-order-source, test:order-traceability, test:retail-home,
  test:store-editorial, test:manual-route and test:web-release passed.
- Web and Android frontend builds, Capacitor sync, assembleRelease,
  bundleRelease and lintRelease passed. Lint: 0 errors, 26 existing warnings.
- APK signature verified with the original upload key. Bundletool validated
  the AAB; package version confirmed as 14 / 1.2.11.
- Rebuilt web dist after copying the Android assets. Never deploy native dist.
- No Android device/emulator connected. End-to-end native Google sign-in
  remains unverified. Do not describe this build as a confirmed complete fix.

## Artifacts and remaining release gates

Local folder: ../android-release-1.2.11/

- APK SHA-256: ECDA6AF2D13E9BBFABFB195FBB706AF5B4BC40C82B84AED9E8E0AC64B9217175
- AAB SHA-256: D5090EB3020D7E0CAA7FF0BCF0BB3D0BDBC223C83B9ABD539DCEAE1963DF836A

The Play certificate comparison and registration were completed on 2026-10-17.
Google generated OAuth Android clients for all three certificates; the live
Firebase API confirms eight SHA entries including the original upload pair.
Google-auth tests and Gradle assembleRelease/bundleRelease/lintRelease passed
again after refreshing the config. APK/AAB hashes remain identical because
the generated Android resources use the unchanged web client ID.
Real Play-installed Android Google login still needs device verification.
Web publication is independent of the Android release.

Reference: [plugin Google setup](https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-google.md).
