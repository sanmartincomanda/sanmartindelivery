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
