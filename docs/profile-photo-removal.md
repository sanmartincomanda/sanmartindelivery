# Remove customer profile photos

## Scope

Removed at the owner's request after a reported Apple rejection. The exact
review message has not been inspected; this change does not establish the
cause of rejection or guarantee approval.

- RetailProfile now always renders a decorative person icon, including for
  customers with a previously stored photo or an OAuth provider photo.
- Removed the camera badge, interactive avatar, gallery input, photo sheet,
  preview/compression logic, local photo state and dedicated Firebase writer.
- The shared storefront component supplies web, Android and iOS. No new
  permissions or SDK changes. Authentication and account editing are intact.
- Preserved help, Gold, disabled wallet, addresses, orders, WhatsApp and logout.
- No production database writes, deletions, rules or SICAR changes.

## Existing photos and disclosures

This is a feature removal, not a deletion of existing customer records.
Previously stored thumbnails may remain in private storeUsers records and
old installed app versions can retain their original behavior. No migration
or automatic deletion is run. The privacy page distinguishes legacy photos
and directs deletion requests to support or the account-deletion flow.

Do not blindly remove Photos/Videos from store disclosures: first check the
versions still distributed, previously collected data and any other image
collection. Store privacy declarations have not been changed by this work.

## Verification

- test:retail-profile: real legacy CSS with web/native classes, menu actions,
  disabled wallet, branch contact, new/legacy/provider-photo accounts, no
  gallery or image rendering, no photo persistence wiring and no native
  camera/photo permissions. No production account involved.
- test:retail-interactions, test:store-access, test:google-auth,
  test:apple-auth, test:retail-home, test:store-editorial, test:manual-route
  (578 assertions) and test:ios-config passed.
- Isolated Chromium fixture, external HTTP requests blocked: 360x800,
  390x844, 430x932 and 1280x900 have no horizontal overflow, no customer
  photo/file picker and a disabled wallet. Directions opens its existing
  screen and returns correctly. Also checked a long full name at 360px.
  Screenshots: output/playwright/profile-no-photo-390.png and
  output/playwright/profile-no-photo-360-long-name.png.
- Web build and test:web-release passed. Android/iOS web assets compiled
  separately into tmp/profile-no-photo-android and tmp/profile-no-photo-ios.
  Inspected all three outputs: person icon retained, no photo editor,
  gallery labels or photo persistence markers. These are asset builds, NOT
  new signed APK/AAB/IPA files. Existing large-chunk warnings remain.
- git diff --check passed; the unrelated sicarQuoteSync.mjs file retains
  its pre-existing SHA256 and was not changed.
- Physical-device and App Store review testing have not been performed.

## Release status

The owner authorized generating a replacement Apple build and updating the
public privacy policy. iOS 1.0.2 (9) is uploaded and Apple processing is VALID.
Upload is not submission to App Review. No review submission, tester assignment
or store privacy attestation was made in this release. Do not overwrite
independent laptop changes when transferring the work.

### Verified publication: 2026-11-14

- Source f16a074f1dceb3842a45c8b05b6c5af600cc2e0b, pushed to main and
  release/ios-app-store. No Android artifact was generated or uploaded.
- Netlify production 6af8a0d62eac5b14ddd968fb is ready. Firebase Hosting
  workflow 43623822066 succeeded. release.json on tienda.sanmartinsr.com,
  admintv.sanmartinsr.com and tiendavirtual-2ced1.web.app confirms f16a074
  and web entry /assets/index-kY-45cVH.js (not a native bundle).
- https://tienda.sanmartinsr.com/privacidad is live, dated November 14, 2026.
  It explains the person icon, no current profile-photo upload/permissions,
  legacy stored photos and deletion requests. Checked the rendered policy
  at 390x844 and 1280x900 without overflow or customer writes; screenshot
  output/playwright/privacy-no-photo-live-390.png.
- iOS workflow 43623738484 succeeded, including unused-build-number check,
  regression tests, signing, archive verification, upload and read-only
  Apple processing verification. Archive validation/upload reported no errors.
- Apple build ID 966de6cc-2646-4bb2-a264-2f56d7af9b76, app 6832058425,
  version 1.0.2 (9), processing VALID at 2026-11-14T18:05:56Z.
- Signed IPA: tmp/ios-profile-no-photo-1.0.2-9/App.ipa, 12,871,443 bytes.
  SHA256: 0CEA0448CB97926DB3C00C376935EC253BB70634E07CE3A504DFDAD2F172C628.
  GitHub artifact: Carnes-San-Martin-iOS-1.0.2-9 (14125596143).
- Independently inspected the IPA: com.sanmartinsr.app, display name
  Carnes San Martin Delivery GR, iOS 15.0 minimum, person icon retained,
  no photo-editor/persistence markers or camera/photo-library permission keys.
  Native Google/Apple providers and skipNativeAuth=true remain unchanged;
  no remote server URL. All 19 privacy manifests match build 8 byte-for-byte.
- New build-check unit tests and existing TestFlight helper tests passed.
  Native CI also checked authentication, mixed boxes/order, home/navigation,
  profile, announcements and category navigation. No physical-device sign-in
  test or App Review approval is claimed.

Next: inspect Apple's actual rejection, test build 9 on a physical device,
select build 9 instead of 8 for version 1.0.2, and address every review finding
before resubmission. The website privacy page is updated; App Store Connect's
data-category declarations remain unchanged pending their separate review.

Previously uploaded iOS 1.0.2 (8) and Android 1.2.16 (19) contain photos.
They cannot become photo-free by editing this source or App Store metadata.
Before the next release, reconcile origin/main, run release gates, then
build new signed artifacts using unused build numbers verified in the stores.
Rebuild for web separately after any native asset build; do not deploy the
native dist to web hosting. Read Apple's actual rejection and respond to
all findings before requesting review.
