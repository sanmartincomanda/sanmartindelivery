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

Box total validation allows only a sub-microcordoba floating-point difference
between the rounded currency total and pounds x price per pound. An exact
comparison previously rejected valid decimal prices as PERMISSION_DENIED.
The emulator verifies decimal create/edit/checkout cases, rejects totals even
one cent off, and still denies catalog writes by clients and non-admin staff.

This does not redesign existing non-box checkout pricing authorization.
Before enabling boxes in production, deploy the reviewed database rules along
with the web release. No live records, rules, orders or price changes are made
by the tests. Native Android/iOS require their normal separate update.

## Mixed boxes (2026-11-07)

In AdminTV choose "Mixta - 3 cortes", select three distinct original lb
articles, the total box weight, one shared price per pound, a name and a photo.
The preview shows equal shares immediately. 30 lb means 10 + 10 + 10 lb;
two boxes mean 20 lb of each article. New presentations remain inactive until
explicitly enabled. Existing single-cut presentations are unchanged.

Mixed boxSale records have type=mixed, poundsPerBox, pricePerPound and
components[0..2] with sourceCode, sourceKey and name. Top-level sourceCode/key
are omitted. Total weight must be a multiple of 1.5 lb so each third is an
exact 0.5 lb increment compatible with the existing order normalizer.
No uneven remainder or silent rounding is allowed. The whole box must also
yield exact cents. The original three SKUs and loose prices are not modified.

Source availability and stock use all three articles in the selected branch.
Cart stock validation aggregates mixed boxes, single-cut boxes and loose cuts.
The product card, product detail and cart show the composition.

Checkout expands a mixed cart line into three original-SKU lb lines with
the same fixed price per pound. ventaPorCaja also stores type, boxName,
poundsPerComponent, componentIndex, groupId and lineKeys. The links bind the
three rows after normalization/filtering. Rules verify all three siblings,
their count, SKU, weights, common price, branch and shared group. A partial
box or cross-linked group is rejected. Existing operational updates remain
allowed as before; no change to kitchen adjustments or original-order history.

scripts/mixedBoxRuleExpressions.mjs is the readable source of these rule
expressions. The rules test asserts that firebase.database.rules.json matches
the exports before testing against the local emulator. Write permissions are
not widened, and no new endpoint, Function, listener or inventory job is added.
This does not change existing non-box order authorization or reserve stock.

Publish the reviewed database validations with the web build when approved.
An older native bundle that only understands single-cut boxes cannot sell the
new mixed format; update Android/iOS separately before advertising it there.

## Automated checks

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

Mixed-box QA on 2026-11-07:
- Pure pricing/stock tests and DOM create/edit/cart/normalization tests pass.
- The local RTDB emulator passes 240 checks, including incomplete triples,
  duplicate components, wrong price/weight, stale config, shared sibling
  tampering, branch/source availability and previous single-cut behavior.
- Build, web-release, retail-home, store-editorial, manual-route, box-images,
  box-announcement, retail-interactions, order-traceability and
  store-product-promotions pass.
- An isolated browser fixture uses the real Admin, product card and Checkout
  components with fake data and no live Firebase module. Mobile widths 360,
  390 and 430 and desktop 1280 were checked. Three selects, equal weight
  updates (30/45 lb), local save/edit, card quantity and cart contents were
  exercised. No horizontal overflow in the fixture or browser errors.
- Evidence: ignored tmp/mixed-box-admin-mobile.jpg. Native Android, actual
  phones and a live SICAR quotation were not exercised. These tests changed no
  production orders, catalog records or rules.

Release authorized on 2026-11-07 for GitHub, AdminTV and the public web store.
The live pre-release rules match the previous published revision. The only
planned rule changes are storeCatalog/$productId/.validate, its boxSale child
validation and orders/$orderId/items/$itemId/.validate. A local backup is kept
at tmp/mixed-box-rules-before-publish-2026-11-07.json. No catalog presentation
is created or activated by this release; administrators configure them.
Native app builds and the unrelated local SICAR sync changes are excluded.

## Box photo optimization

New inline photos for BOX_ catalog records are optimized at upload, before
hashing and storing. Normal articles, SICAR imports and promotion artwork are
unchanged. Maximum long edge is 1200 px, with no crop or enlargement; WebP
quality starts at 86 and can fall to 80 when above the 300 KiB target. The
target is not a hard cap that sacrifices quality. An already-smaller original
is retained. Browsers without WebP encoding use JPEG for opaque images or PNG
to preserve transparency. Decode/encode failures leave the form intact.

URLs use a fresh content hash (not the previous image's hash) and immutable
public cache headers. Changing a photo creates a new URL. Do not overwrite
these objects in place. Existing original objects are not deleted.

For existing box photos, `npm run catalog:optimize-box-images -- prepare`
downloads originals and builds a manifest plus WebP files under ignored tmp/.
This is read-only remotely. Review the images before running
`npm run catalog:optimize-box-images -- apply <manifest.json>`.
Apply verifies file hashes, uploads new objects, checks their downloaded bytes,
and replaces only image/imageStoragePath using Firebase ETag conditional writes.
Concurrent photo changes are skipped; concurrent commercial edits are preserved
or cause a safe conflict. The local originals, before-apply records and applied
manifest provide rollback references. Update only image fields if rolling back;
never restore an old full catalog record over current prices or inventory.
Catalog metadata is refreshed after successful changes. No rules or orders change.

    npm run test:box-images

Tests include real WebP encoding/alpha/EXIF orientation and mocked browser
canvas/storage paths, quality floor, fallback, invalid photos, unchanged normal
uploads, content-addressed cache URLs and safe migration record replacement.

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
