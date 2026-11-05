# Black Meat November 2026

Campaign: `storeProductPromotions/black_meat_november_2026`.
Branches: Granada and Nindiri. Ends exclusively at 2026-12-01 00:00 Nicaragua.

| SKU | Regular C$ / lb | Promotional C$ / lb | Discount |
| --- | ---: | ---: | ---: |
| 00198 | 165.00 | 151.68 | 8.07% |
| 00018 | 199.00 | 191.04 | 4% |
| 00047 | 254.00 | 236.22 | 7% |
| 00034 | 367.00 | 348.65 | 5% |
| 00036 | 332.00 | 312.08 | 6% |

Owner confirmed Posta Trasera 00018, the regular price correction for 00198,
and availability of Filet Mignon Gold 00036 in Nindiri.
Price override protects the approved 00198 price from SICAR synchronization.
Product photos remain unchanged; the seal is a local image overlay.

## Transparent seal update

The approved white-background JPEG is retained for old caches. The campaign now
uses `public/tienda/promotions/black-meat-november-2026-transparent.png` with a
real alpha channel, checked at the outer corners. Generated using the built-in
image editor, transparent background enabled, from the original JPEG.

Edit prompt: "Remove ONLY the external white background, producing a genuine
transparent alpha PNG cutout. Preserve the exact existing black and metallic
gold badge, gold lettering BLACK MEAT and NOVEMBER, typography, tilted angle,
proportions, highlights, black interior, and gold border; do not redesign or
reword anything. Retain the entire badge without clipping any edge. Keep the
same wide composition, trim outer transparent padding closely to the badge.
No checkerboard baked into the image, no replacement background, no added
shadows, no new text. This will be used as a small overlay on meat product photos."

`node scripts/updateBlackMeatSeal.mjs` is read-only by default; `--apply` verifies
the deployed PNG byte-for-byte, saves a local backup and conditionally updates
only the campaign's `sealImage` field. No price or availability changes.

Optional campaign fields: `branchIds` (empty = all branches for legacy data),
`sealImage` (validated local /tienda/promotions image path).
Existing admin edits preserve both fields. No database rules, orders, SICAR
bridge or payment changes are deployed.

Run `node scripts/publishBlackMeatNovember.mjs` for a read-only dry run.
After deploying web assets, `--apply` saves an ignored local backup and makes
one atomic multi-location update. It refuses to overwrite an existing campaign.

QA: `node scripts/testPromotionCampaignScope.mjs`, existing promotion tests,
web-release, retail-home, store-editorial, manual-route and production build.
Browser visual QA unavailable while local browser access is disabled.
Previously installed native bundles require an app update to support custom
seals and branch scoping; web publication does not update their bundled code.
