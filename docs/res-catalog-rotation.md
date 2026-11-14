# Res / Todos product rotation

Public storefront only: display three products from Linea Diaria, three from
Linea Parrillera, three from Linea Gold, three from Linea Practica, then three
from each remaining subcategory in its existing menu order. Repeat until all
filtered products are displayed. Empty/exhausted groups are skipped and short
groups contribute their remaining products without padding or duplication.

The rotation preserves each line's existing product order and object references.
It runs before the 24-product pagination. It does not change searches, individual
line filters, the home page, admin, boxes, stock, prices or promotions. Existing
subcategory normalization handles aliases and accents; new lines are included.
The shared storefront implementation covers web, Android and iOS source builds.

Validation on November 14, 2026:
- test:retail-home (includes test:retail-catalog-order), store-categories,
  store-editorial, web-release and npm run build passed.
- The rotation tests cover 30 uneven catalogs, aliases, input immutability,
  deterministic ordering, exhausted lines and pagination continuity.
- Local browser with Granada catalog: first four blocks matched the first three
  items in each individual line. Loading 24, 48, 72, 96 and 106 products kept the
  original prefix and reached all 106 without duplicate entries.
- Screenshot: tmp/res-catalog-order.jpg.
- No real orders, customer data or campaign settings were changed for QA.

The owner authorized GitHub and web publication on November 14, 2026, retaining
the Todos subcategory button. The briefly requested removal was cancelled before
any edit. This release does not replace or resubmit the mobile builds currently
under store review; those builds do not yet include this rotation.

Pre-publication checks also passed test:manual-route, including 578 assertions.
Final deployment verification will be recorded after the release is live.
