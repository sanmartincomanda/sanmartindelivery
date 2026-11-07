# Venta por cajas

AdminTV: Tienda virtual > Venta por cajas. Also available in Catalogo maestro.
The public category is "Venta por cajas". Regular loose-cut listings remain unchanged.

## Data and pricing

- Each presentation is an independent storeCatalog/BOX_UUID record. This is a
  storefront/cart identity, NOT a new SICAR SKU.
- boxSale stores sourceCode (original SICAR code), sourceKey (catalog key),
  poundsPerBox and pricePerPound. The existing price field holds the whole-box
  price; unit=caja, minQuantity=1, quantityStep=1.
- Name, photo, optional description, enabled flag and branch availability are
  editable. Photos use the existing catalog image uploader with the BOX_UUID
  key, never the original article's storage path.
- Presentations start inactive. Granada and Nindiri are preselected; Masaya is
  optional. Box pricing is the same across enabled branches and is not
  overwritten by the original SKU's SICAR price sync.
- Whole boxes only. Weight is in 0.5 lb increments (compatible with the existing
  order normalizer). Price accepts two decimals and must yield exact cents per box.
- Existing order-level coupon/customer-discount policy remains; item-level
  promotion percentages are not stacked on the configured box price.

## Checkout and operations

Before allocating an order number, checkout reloads the active catalog and
verifies source availability, branch, current presentation and price.
Stock checks aggregate boxes plus loose-cut units of the same source SKU.
This is a stock check, not an inventory reservation; the existing store does not
atomically reserve SICAR stock.

At order creation, boxes are converted to pounds using the original SICAR SKU:
2 boxes x 30 lb x C$146/lb = 60 lb, C$8,760, precioFijo=true.
Orders retain ventaPorCaja {catalogCode, sourceCode, sourceKey, poundsPerBox,
pricePerPound, boxes}; description and kitchen text include the box count.
The existing immutable original-order archive preserves this snapshot.
No new endpoints, SICAR products or background sync jobs are introduced.

The existing SICAR bridge merges repeated source SKUs into a quotation line,
adding quantities and amounts. Mixed boxes/loose cuts can therefore show a
weighted unit price in SICAR. The original order retains the separate purchased
presentations. This change does not modify the locally edited SICAR bridge.

## Security and rollout

firebase.database.rules.json adds validations for boxed catalog records and
new box-order lines: canonical SKU, weight, count, fixed price and enabled
branches. It rejects unconverted BOX_ SKUs. Existing operational updates are
not blocked by later campaign/catalog changes. Administrative catalog write
permissions remain unchanged.

This does not redesign existing non-box checkout pricing authorization.
Before enabling boxes in production, deploy the reviewed database rules along
with the web release. No live records, rules, orders or price changes are made
by the tests. Native Android/iOS require their normal separate update.

## Checks

    npm run test:box-sales
    npm run test:box-sales-ui
    firebase emulators:exec --only database --project demo-box-sales --config firebase.box-sales-test.json "npm run test:box-sales-rules"

The first suite covers 1/2/3 boxes, totals, invalid weights/prices/counts,
mixed-source stock, stale price/configuration and normal article compatibility.
The DOM suite uses a mocked Firebase module and checks the admin form,
store card, branch resolution and real order/kitchen text generators.
The rules suite uses a local demo namespace, tests canonical writes and
tampering, and verifies updates to previously placed orders after deactivation.
Browser/phone and real SICAR quotation acceptance remain separate rollout QA;
no synthetic production orders should be created.

## Launch announcement and Home

- Home places "Venta por caja" before promotion sections, without duplicating
  the boxes in the general catalog rail or hiding previously visible sections.
- "Disponible ahora: Ventas por caja" previews up to three active, available
  box presentations from the selected branch, using their existing photos.
  Closing is optional; "Ir a comprar" opens the existing box category.
- The announcement appears only on an idle public Home, not over checkout,
  authentication, search, another dialog, or while offline. No boxes means no ad.
- Maximum 10 distinct calendar days in America/Managua, at most once per day.
  Account history is a transaction on
  storeUsers/UID/announcementViews/box_sales_launch_v1, with count and days.
  The existing profile subscription carries this field; no extra live listener
  or full-database scan is introduced. The transaction arbitrates devices.
- Guests use localStorage; clearing browser data or switching browsers cannot
  preserve an anonymous identity. Guest dates merge on sign-in without showing
  the ad again, including when the ten-day cap is reached. A device-day guard prevents immediate repeats after login or a
  branch change. If storage is restricted, memory protects the current visit.
- Rules grant only the owner access to this non-commercial profile subfield
  and validate its shape. Existing discounts, order permissions and commercial
  data are untouched. Publish these rules before the web release.
- Browser history does not replay a dismissed box announcement. Accessibility
  uses the existing focus-layer manager, a labeled dialog, close button and
  reduced-motion support; the CTA remains in a scrollable, safe-area sheet.

    npm run test:box-announcement
    firebase emulators:exec --only database --project demo-box-announcement --config firebase.box-sales-test.json "npm run test:box-announcement-rules"
