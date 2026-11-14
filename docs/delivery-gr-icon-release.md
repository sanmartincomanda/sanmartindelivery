# Delivery GR icon and link previews

Owner approved the preview with the smaller red logo, three detached speed
lines, blue background and white Delivery GR lettering on November 14, 2026.
The exact approved raster is assets/app-icon-delivery-gr.png; do not regenerate
it with AI or use the legacy assets/app-icon.svg for this release.

Run npm run branding:generate to export iOS, Android, Google Play listing,
apple-touch and shared-link PNGs. Android adaptive layers keep the entire
mark and lettering inside the 66dp circular safe area. No new permissions,
authentication or business rules are included in this change. The photo-free
profile and updated privacy policy remain included.

Static Open Graph, Twitter and schema image metadata use the versioned URL
/tienda/branding/delivery-gr-v1.png. This works without JavaScript on the root
and branch routes. Existing social-network link caches cannot be forcibly
cleared by this deployment. The Play/App Store link previews themselves are
controlled by their respective stores, not the storefront metadata.

Planned artifacts: Android 1.2.17 (20), iOS 1.0.2 (10). Apple build 9 was
already waiting for review. The owner explicitly authorized replacing it
with the new icon, understanding that resubmission can delay approval.
Only withdraw build 9 after build 10 uploads and processes successfully.
Do not change store privacy attestations, availability or review credentials.

## Export validation

The canonical generator writes assets/delivery-gr-checksums.json alongside the
exports. Tests verify the approved source SHA-256, exact exported-file hashes,
dimensions, opacity, Android safe area and static crawler metadata. Do not
compare a fresh resize with committed PNG pixels in CI: ARM macOS and Windows
resampling can differ slightly. Regenerate all exports and the checksum manifest
together with npm run branding:generate when artwork changes.

## Web publication

- Runtime/artwork commit: 4f4dd75bb2d4950af625d1bca07358ea4a8a3394.
- Netlify deployment: 6af8b339380d0c876c2b6e8c, ready, November 14, 2026.
- Firebase Hosting workflow: 43631057988, success.
- Live release.json points to the runtime/artwork commit.
- Root, /granada, /nindiri and /masaya return the new Open Graph URL without JS.
- Live image matches the local approved export byte-for-byte: SHA-256
  42D227EDF0F5F1A4E0E14B89CCEDB825361E7D50C445B44A4C27124F9EF2D908.
- Browser verified storefront categories, promotions and box sales still render.

## Android artifact

Workflow 43631060568 generated Android 1.2.17 (20) successfully from the runtime
commit. APK and AAB signatures match the previous release. The AAB retains
com.sanmartinsr.app, minSdk 24, targetSdk 36 and the existing permissions.

- APK SHA-256: 28A2F12CFC8462CB90E5037D4E76FA00AAE22BE4EF1A48304C1A527C1C8CE4E9.
- AAB SHA-256: 15670034601816A3129F6EBCCFDAA62259710C24B07BEA204F1AF13554C043FC.
- Local artifacts: tmp/android-delivery-gr-1.2.17-20/.
- Play Console accepted the production bundle with no errors or compatibility
  losses. The existing nonblocking deobfuscation-file warning remains.
- Production release 20 and the new default-listing icon were submitted together
  for review. Full rollout to existing target countries is retained.
- No listing privacy declarations, screenshots or country availability changed.

## Verification scope

Local checks passed: delivery-branding, ios-config, retail-profile, store-access,
google-auth, apple-auth, retail-home, store-editorial, manual-route,
retail-interactions, box-sales, web-release and the production web build.
Android CI release gates also passed. No real orders or customer records were
created for testing. No Firebase rules, Functions or SICAR changes were deployed.
Physical-phone installation/login testing was not performed in this release.

## Apple artifact and submission

Workflow 43631674570 completed successfully in 9m55s. Its source is
02399a3e96f32817d67c2fec303e4854d129d625; the commits after the runtime/artwork
commit only refine cross-platform export verification and do not alter artwork
or application behavior.

- Version/build: 1.0.2 (10).
- App Store build ID: 5281e41e-beb9-41f9-b7a3-5f4df55d5ab0.
- Apple processing: VALID at 2026-11-14T19:31:33Z.
- IPA: tmp/ios-delivery-gr-1.0.2-10/App.ipa, 15,976,452 bytes.
- IPA SHA-256: EF0DC16B1C12AA078A2EA5293FCFDAD6C6644645FB7E09E7FCA54CF5FC6C8C0F.
- Bundled Info.plist verified com.sanmartinsr.app, 1.0.2, build 10 and the exact
  display name Carnes San Martin Delivery GR. The only usage-description key is
  the existing optional location permission; no photo permission is requested.
- After processing succeeded, build 9 was withdrawn with the owner's explicit
  authorization. Build 10 was selected, saved and submitted to App Review.
- App Store Connect confirmed "1 articulo enviado", "Pendiente de revision"
  and the selected build 10. This is submission, not approval or public release.
- Automatic release after approval, existing privacy declarations, screenshots,
  review credentials and availability were retained. Release notes mention the
  new Delivery GR icon and photo-free profile.
- Apple icon preview was visually checked and matches the approved design.

## Evidence and remaining limits

Local screenshots are under tmp/delivery-gr-publication/:
google-play-review.jpg, apple-icon-preview.jpg and storefront-live.jpg.
Google showed "Cambios en revision" with its initial automated checks still
running at verification. Store approval remains external; do not describe the
new versions as publicly available until approved. Existing installed apps need
their store update to display the new launcher icon.

The unrelated scripts/sicarQuoteSync.mjs working-tree edit was preserved and
excluded from these commits and deployments.
