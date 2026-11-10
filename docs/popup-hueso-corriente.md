# Hueso corriente box popup

## Campaign

- Requested artwork: Hueso corriente, 40 lb, C$350. Existing catalog price and
  box contents are not changed.
- Product: BOX_7f2a4f25-28c4-4095-90bc-d5920faa263b, not the loose SKU 00069.
- Campaign ID: hueso_corriente_caja_nov_2026. CTA: Ir a comprar.
- Uses the existing popup limit: two impressions per viewer, one popup per
  visit. No expiration was requested. Limits, dates, image and destination
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
