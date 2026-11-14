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
public privacy policy. Preparing iOS 1.0.2 (9); the upload workflow checks
that this build number is unused, verifies the signed archive has no photo
editor/permissions and waits for Apple processing. Upload is not submission
to App Review. Production/upload results will be recorded below once verified.
Do not overwrite independent laptop changes when transferring the work.

Previously uploaded iOS 1.0.2 (8) and Android 1.2.16 (19) contain photos.
They cannot become photo-free by editing this source or App Store metadata.
Before the next release, reconcile origin/main, run release gates, then
build new signed artifacts using unused build numbers verified in the stores.
Rebuild for web separately after any native asset build; do not deploy the
native dist to web hosting. Read Apple's actual rejection and respond to
all findings before requesting review.
