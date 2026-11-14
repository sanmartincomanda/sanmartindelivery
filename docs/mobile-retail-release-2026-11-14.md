# Retail release: Android 1.2.16 (19), iOS 1.0.2 (8)

## HOLD: profile photo removed after these builds

The owner subsequently requested removing profile photos. The source now uses
a non-interactive person icon on web, Android and iOS. See
profile-photo-removal.md for scope, checks and rollout requirements.

The already uploaded iOS 1.0.2 (8) and Android 1.2.16 (19) still contain the
photo editor. DO NOT resubmit those artifacts as the photo-free update.
Check the current store state and use new unused build numbers after the
source is reviewed and publication is authorized. No new store submission
or production deployment was performed for the removal.

The records below describe the previous release, not the removed feature's
current implementation. The owner's reported rejection reason has not been
independently verified against Apple's review message.

## Current status: repaired profile published on 2026-11-14

This section supersedes the historical artifact/release records below.

- Source: 240a08948c7e08f2fd805af08c7483a56c94eac5, pushed to main and
  release/ios-app-store. Unrelated scripts/sicarQuoteSync.mjs remains local.
- Web: Netlify production 6af882ce445aae27ed4f60c4; Firebase workflow
  43612136854 succeeded. release.json on tienda, admintv and Firebase Hosting
  returns 240a089; web entry is index-B8IW4rZn.js. Public Nindiri storefront
  was inspected without signing in or creating orders.
- Browser QA: real account component with legacy styles at 360x800 (long
  name), 390x844, 430x932 and 1280x900; no horizontal overflow. Checked menu
  destinations/back, wallet disabled, photo sheet/focus, real JPEG canvas
  compression and simulated save. Full evidence: retail-profile-repair.md.
- Local gates passed: retail-profile, retail-interactions, store-access,
  retail-home, store-editorial, manual-route (578 assertions), box-sales,
  ios-config, build and web-release. Native CI gates also passed.

### Android: submitted to Google Play

- Workflow 43612136753 succeeded for 1.2.16 (19), rebuilt from 240a089.
- Fixed artifacts: ../android-profile-1.2.16-19/.
- APK SHA256:
  1359A2B89B20B9C1C17D4D28509398405831935B879D4EEEA69B3CAD4B352490.
- AAB SHA256:
  4D9CD38A3792B0D92FA76A7431036EA1F1BBE34DE63482D5FC2BF8EF0A839BE6.
- bundletool and signatures verified; package com.sanmartinsr.app,
  minSdk 24/targetSdk 36 and existing signer unchanged. Embedded assets
  contain isolated account controls and photo persistence. Native auth
  providers remain Google/Apple with skipNativeAuth=true, no remote URL.
- Uploaded to production release 11; rollout 100% of existing target
  countries (Nicaragua), no device compatibility reduction. The only
  validation warning was the absent deobfuscation mapping file.
- Owner explicitly authorized discarding only the unrelated Alpha 1.2.7
  (10) draft. It was removed from pending publication; uploaded artifacts
  remain in Play's library and the existing Alpha release was not changed.
- Sent two changes: production 19 and Data Safety. Play now displays
  "Cambios en revision" with automatic pre-review checks in progress.
  Managed publishing remains disabled. Approval/public availability of 19
  is NOT established by this submission; live production was 18 beforehand.
- Data Safety now includes optional profile photos (functionality/account
  management, no sharing), UID, purchase history, other profile information
  and OAuth. No existing declaration was removed. This was not a complete
  SDK/privacy audit. The inherited encryption answer remains No and needs a
  separate verified transport audit rather than an unsupported assertion.
- Screenshot: output/playwright/google-profile-1.2.16-review.jpg.

### iOS: uploaded, review submission blocked by login

- Workflow 43612139605 succeeded, including signed archive validation and
  upload to App Store Connect: 1.0.2 (8), source 240a089.
- IPA: tmp/ios-profile-1.0.2-8/App.ipa, 12,873,607 bytes.
- SHA256:
  12B48CF56B784622E48B508236D3A7536276F0E9E92CE6F85937CA237B49ADCD.
- Parsed Info.plist confirms build 8, com.sanmartinsr.app, display name
  Carnes San Martin Delivery GR, iOS 15.0 minimum. Verified account/photo
  markers, disabled wallet, native auth providers and no remote server URL.
- Apple browser still displays "No se pudo verificar tu identidad". Owner
  is completing sign-in directly. No password or verification code requested.
- NOT submitted for review yet. After login: verify build 8 processing,
  update the Photos/Videos privacy declaration for the optional private
  avatar (linked to account, app functionality, no advertising/tracking),
  select build 8 rather than 7, update release notes, then submit 1.0.2.
  Obtain confirmation if Apple presents a new binding privacy attestation.
- Physical-device sign-in, native gallery and real database photo saving
  have not been tested. No production orders/customer writes were used.

## Historical artifacts below: do not submit

Authorized by the owner on 2026-11-14, web first and then both app stores.

## HOLD: profile repair required

The customer subsequently reported broken profile text on iPhone. The binaries
listed below contain that defect: DO NOT submit Android 19 or iOS build 7 for
review as-is. They predate the isolated account layout and profile-photo change
documented in retail-profile-repair.md. The earlier claim of aligned controls
was not supported by a full-app visual check; the old fixture missed inherited
checkout icon CSS.

Rebuild Android before uploading (verify Play's current version code first).
iOS build 7 was already uploaded, so use a new build number for its replacement.
The corrected source is local only. Browser access is unavailable; no new
store submission, production deployment or device QA was performed for this fix.
Review the privacy disclosures for optional profile photos before mobile release.

## Source and scope

- Web source: d9d39a5055f20b05b32d81eeaba9327e55b73c71.
- Mobile source: 67a6c56abc76d4a1c47ef9f60ca23d5fd767e4df.
- Larger category icons and two-line labels; compact neutral shortcuts;
  featured promotions; organized Profile with aligned controls.
- "Hoy se come bien" and hamburger ads are BELOW the product groups. Their
  existing Gold/category search targets remain unchanged.
- No new dependencies, permissions, SDKs, APIs, commercial rules or data
  collection. Preserve existing authentication, pricing, rewards, checkout,
  box ordering and mixed boxes. No production purchases created during QA.
- Retain package com.sanmartinsr.app, Apple name Carnes San Martin Delivery GR,
  corporate-blue icon, existing signing credentials and Nicaragua availability.
- The unrelated local scripts/sicarQuoteSync.mjs change was not committed.

## Web verification

- Netlify production deploy: 6af867366e4181ff3d6b4e53.
- Firebase Hosting workflow: 43601705360, success.
- tienda.sanmartinsr.com, admintv.sanmartinsr.com and
  tiendavirtual-2ced1.web.app release.json all return d9d39a5055f2.
- Production HTML points to index-Dpma8aTL.js. TiendaVirtualView-Ch9as6Lb.js
  contains the refined profile and product-first editorial order.
- Detailed prior responsive/browser audit: retail-home-profile-refinement.md.
- Post-deploy visual inspection requires the browser connection to be enabled.

## Native builds

- Android workflow: 43601894069, success for 1.2.16 (19).
- iOS workflow: 43601896652, success for 1.0.2 (7), upload=true.
  Apple validated and accepted the upload at 2026-11-14T13:59:22Z.
- Both workflows now run Home, Profile/interaction, category and editorial
  regression tests before compiling the native packages.
- Do not reuse Android 1.2.15 (18) or iOS 1.0.1 (6): they lack this redesign.
- Store review submission and public availability are NOT established merely
  by a successful build/upload. Verify the separate store states.

### Android artifacts verified locally

Directory: ../android-release-1.2.16-2026-11-14/.

- Carnes-San-Martin-1.2.16.aab: 14,473,158 bytes, SHA256
  86FB9B37F8272251516A58BBC001562AF68706F6DA5DD9D35530BCE7DFAC68F1.
- Carnes-San-Martin-1.2.16.apk: 14,943,492 bytes, SHA256
  69A1E774F2658C2D8E4E129325C779642A1A5BD45542AAD6C0D097CDF0856E93.
- bundletool validate succeeded. AAB manifest and APK badging show 19/1.2.16,
  package com.sanmartinsr.app, minSdk 24 and targetSdk 36.
- apksigner verify succeeded; signer SHA256 remains
  e40799a92ede3f21900407a5b71e8f6073e2b1afad122eb219e9b1e91ec5e755.
- Eight JavaScript assets match byte-for-byte between APK and AAB.
- Verified embedded assets (no remote server URL), both authentication
  providers, skipNativeAuth=true, refined profile, promotion title and
  hamburger ad placed after product sections.
- Google Play upload/review is pending access to the browser. Do not submit
  the unrelated Alpha 10 (1.2.7) draft or change Nicaragua availability.

### iOS artifact verified and uploaded

- Local IPA: tmp/ios-app-store-1.0.2-7/App.ipa (gitignored), 12,870,503 bytes.
- SHA256: CBA72DDBED268BDB0E67BF4C85F4240DBD5201AD74F82E5E67422121D92B6C0C.
- Parsed binary Info.plist: version 1.0.2, build 7, bundle com.sanmartinsr.app,
  display name Carnes San Martin Delivery GR, minimum iOS 15.0.
- Verified embedded profile redesign, product-first ads, native auth plugin,
  google.com/apple.com providers and skipNativeAuth=true; no remote server URL.
- CI verified codesign, matching Firebase project and Google callback, then
  altool reported no errors validating and no errors uploading the archive.
- Apple delivery UUID: 52d4a7fa-4206-4914-87cf-983f14ed7a5e.
- App Store Connect build processing, version selection and review submission
  have not been observed: browser access is unavailable in this chat.
- Neither new mobile version is claimed publicly available. The completed
  upload does not automatically submit the app for review.

## Release notes

Renovamos el inicio para que encuentres las promociones y las ventas por caja
mas facilmente. Categorias mas visibles, accesos compactos y un perfil mejor
organizado para consultar tus pedidos, direcciones y beneficios Miembro Gold.

## Validation

Passed locally: build, web-release, retail-home, retail-interactions,
store-categories, store-editorial, manual-route, ios-config, google-auth,
apple-auth, store-access, box-sales, box-sales-ui, popup-ads,
store-product-promotions, store-order-source and promotion-share.

The pre-existing web chunk-size warning remains. Physical-device sign-in,
purchase and post-install checks have not been performed for these binaries.
