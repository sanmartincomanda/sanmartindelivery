# Android 1.2.11 (14): Google sign-in

Prepared locally on 2026-10-16. Android submission to Play Console is pending.
Publishing the web frontend does not update installed Android applications.

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
- Firebase currently registers only the locally verified upload certificate
  (SHA-1 DA:45:01:1C:4E:8A:55:D1:8F:7F:22:66:70:69:DB:2B:FB:CE:4E:93).
  The Play app-signing certificate must still be compared. Do not assume the
  upload certificate equals the Play distribution certificate.

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

Before submission, compare the Play app-signing SHA-1 with Firebase, register
the actual Play certificate if missing, and test Google sign-in on a real
Play-installed Android device. Verify versionCode 14 is unused in Play Console.
No certificate, provider setting or Android app release was changed in
production during preparation. Web publication is independent of those gates.

Reference: [plugin Google setup](https://github.com/capawesome-team/capacitor-firebase/blob/main/packages/authentication/docs/setup-google.md).
