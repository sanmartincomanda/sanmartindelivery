# Public promotion image sharing

## Scope

The public storefront offers a share button on active campaign sections, the
existing promotion/combo section, and individual promotional product cards.
AdminTV, prices, orders, discounts, authentication and backend data are unchanged.
The caller supplies the branch-resolved catalog, never a separate price list.

PromotionShareButton opens a preview before invoking native Web Share with an
image/png File. It also offers a PNG download when file sharing is unavailable.
One image contains up to four products; pagination preserves every product.
Individual products get a larger hero layout. Photos use contain, not cropping.
The artwork uses the existing logo and Space Grotesk, blue #0044c5, red #ff000c,
branch, current prices/units, original prices for real discounts, expiry and URL.

## Implementation

- `src/components/storefront/promotionShare.js`: pure pagination/expiry/filename
  helpers and on-demand 1080x1350 canvas composition.
- `PromotionShareButton.jsx` / `promotionShare.css`: public trigger and responsive
  preview, loading/error/retry, download and capability-checked file share.
- Uses the existing `useRetailFocusLayers` for Escape, keyboard trapping and
  inert background. Object URLs are revoked on change/unmount. No third-party
  image generator, new dependencies, customer-data uploads or database writes.
- Expired campaigns cannot generate/share. Price/product changes invalidate
  the prepared image. A failed photo stops generation instead of advertising
  a different image or silently omitting an item.

## Verification (2026-10-20)

- `npm run test:promotion-share`: pagination with 11 products, no dropped items,
  deduplication, invalid/missing prices, amounts, expiry boundary, filenames,
  public integration and share-sheet safeguards.
- Build and existing retail-home, store-editorial, store-product-promotions,
  web-release, manual-route tests passed.
- Isolated Chromium: actual campaign with six products exported in two PNGs;
  individual product export; Escape and focus return; preview within viewport
  at 360x800, 390x844, 430x932 and 1280x900.
- Web Share file payload and cancellation tested with a browser stub, not a
  real WhatsApp post. Unsupported-file-share path exposes download.
- Home width also checked at 360/390/430/1280 without horizontal overflow.
  Aborted photo requests disabled export, showed a useful error and recovered
  after retry with the original remote images.
- Real photos allow CORS from https://tienda.sanmartinsr.com but not localhost.
  Browser QA routed that domain's frontend requests to the local preview build.
  Photos remained real remote requests under the authorized origin; no CORS
  response headers, bucket permissions or production files were changed.
- Evidence is local under `output/playwright/promotion-share-*.png` and
  `output/playwright/promocion-*.png`.

## Release limits

Web publication is independent of native releases. This feature does not
require generating or uploading new Android/iOS bundles for the website.
Android/iOS native sharing and downloads need device verification; do not claim
Web Share works in every WebView. Native bundles need their own release.
Downloaded images are snapshots, not live advertisements: changing/ending a
promotion cannot retract an image already shared.
