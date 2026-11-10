# Hueso corriente box popup

## Campaign

- Requested artwork: Hueso corriente, 40 lb, C$350. Existing catalog price and
  box contents are not changed.
- Product: BOX_7f2a4f25-28c4-4095-90bc-d5920faa263b, not the loose SKU 00069.
- Campaign ID: hueso_corriente_caja_nov_2026. CTA: Ir a comprar.
- Updated frequency: ten lifetime impressions, maximum one per calendar day
  in America/Managua. No expiration was requested. Limits, dates, image and destination
  remain editable in AdminTV's popup manager.
- Only appears where the selected product is active and available in the
  branch-resolved catalog. Active custom ads precede the generic box notice.
- Artwork compressed from 2,817,651 to 291,882 bytes as WebP, retaining
  1122 x 1402 dimensions without cropping.

## Implementation

Optional storePopupAds/{id}/targetProductCode opens the existing product
detail. Existing category/subcategory destinations remain compatible and
serve as a fallback in older embedded clients. Editing an ad preserves its
product destination. No new endpoints, rules or purchase logic.

The popup uses an accessible dialog, existing focus trap/Escape handling,
44px close control, 48px CTA, safe-area insets and bounded image height.
The complete artwork remains visible; reduced-motion is respected.

## Verification

- test:popup-ads: normalization, persistence, exact product matching,
  availability, legacy navigation, product navigation, modal controls,
  keyboard/focus and campaign priority checks.
- Passed build, test:web-release, test:retail-home, test:store-editorial,
  test:manual-route, test:box-sales, test:box-sales-ui,
  test:box-announcement and test:store-access.
- Browser fixture at 390 x 844, 360 x 640 and 844 x 390: complete artwork,
  visible CTA, close and Escape. No real purchase was made.
- Production activation uses scripts/publishHuesoBoxPopup.mjs. Dry run by
  default; --apply uploads the optimized image and creates only this campaign.
  It checks actual price/weight and refuses to overwrite an existing campaign.

## Release scope

Web-only static deployment; preserve all existing Netlify function digests.
No Firebase rules/functions, SICAR changes, app-store uploads or customer
orders. Mobile store submissions remain on hold pending Apple approval.

## Published verification, 2026-11-10

- Source: 12eeafb6c423708205d74ff601f18b42cba1f71f, pushed to main and
  release/ios-app-store. Netlify deploy: 6af35229f7ee51d955e86d86.
- Both tienda.sanmartinsr.com/release.json and
  admintv.sanmartinsr.com/release.json match the source revision.
- All four production function digests were retained without re-uploading.
- Created the campaign after the web release. Browser checks in Granada and
  Nindiri show the actual artwork, close button and Ir a comprar. The CTA opens
  HUESO CORRIENTE (E) por caja, C$350, 40 lb at C$8.75/lb, with the existing
  quantity selector and cart action. No order or cart item was submitted.
- Returning to home did not stack the generic box announcement. Mobile live
  artwork/CTA verified at 390 x 844; local small-screen/orientation checks above.
- AdminTV > Marketing > Anuncios popup lists one active ad. Opening Edit
  preserves targetProductCode and Ir a comprar; no extra save was made for QA.
- Screenshots retained under ignored tmp/: popup-hueso-live-mobile.png.
- Existing customer welcome-coupon precedence and impression limits remain.

## Daily frequency update

- Added optional oncePerDay and dailyLimitStartedAt to campaign configuration;
  both are preserved by AdminTV edits. Hueso uses maxViewsPerUser=10.
- Existing numeric local counters remain intact. Daily metadata is stored in
  __daily within the same local key. Existing impressions count toward ten;
  counters without dates are suppressed on the rollout day, not reset.
- Signed-in impressions additionally use an atomic transaction at
  storeUsers/{uid}/popupAdViews/{campaignId}, containing count and lastDay.
  The existing owner-scoped profile access rule covers this field. No rules,
  endpoints or backend functions were changed. No collection scans/polling.
- Guest impressions transfer on login. Account transactions prevent repeated
  impressions across devices. Anonymous users are limited per browser;
  clearing browser storage removes anonymous history.
- Active daily campaigns also suppress the generic box-launch popup, rather
  than replacing a suppressed ad with another interruption.
- test:popup-ads now also simulates ten distinct days, midnight in Managua,
  same-day re-entry, old counters, login/logout, two tabs, two devices,
  transaction aborts and unchanged legacy campaigns. No customer records were
  modified for these tests.
- Installed embedded Android/iOS builds need the next binary update to adopt
  daily frequency logic. This web publication does not lift the store-upload
  hold pending Apple approval.
