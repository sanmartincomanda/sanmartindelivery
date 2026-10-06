# Promociones and direct Home navigation

Date: 2026-10-06. Presentation/navigation only; no catalog writes or order changes.

## Scope

- Rename visible COMBOS category, group and action to Promociones. Keep the
  existing category ID, promotion eligibility, combo contents and product prices.
- Small Home action in the header and next to Back in product, checkout,
  authentication, profile/address/map and Gold screens; also in branch/gift sheets.
- Return to the top of Home in one action, close navigation layers, reset search
  and category filters. Keep cart, saved addresses, delivery, payment and benefits.
- Disable Home while an existing async submission/auth/reward action is busy.
- Preserve normal Back, browser history and local map/address Back semantics.

## QA inventory

1. Category label in home strip/category page/catalog/group; same products/prices.
2. Home from filtered catalog, search, product, populated cart, delivery, address
   and login/register; existing cart quantities and subtotal retained.
3. Nested map, branch selector and optional sheets; no invisible inert overlay
   traps. Normal Back and browser Back/Forward after Home remain usable.
4. Home already selected/scrolled down, double activation, empty cart and deep
   navigation; return to scroll zero without document reload or leaving branch.
5. Header/back button fit, keyboard focus and 44px targets at 360/390/430/820/1440;
   reduced motion. Chromium and WebKit navigation checks.
6. Unit tests for home snapshots; category/promotion regression and web/native
   web builds. No production order or payment submission.

Authenticated views without test credentials must be described separately from
real account testing. Publication is only confirmed after successful deployment.

## Results

- Chromium, live catalog in local app: Promociones opens the existing 11-product
  category, including the three CASERO packs. Product IDs, quantities and prices
  are unchanged. The Combos subcategory still describes the actual packs.
- Added one BISTEC POSTA DE PIERNA VP (1 lb, C$164.68 after the existing discount).
  Product -> Home, cart -> delivery -> address -> Home, login/register -> manual
  map -> Home all retained that item and subtotal. No account or order created.
- Search "pollo" showed 23 products. Home cleared the query and filters. Removing
  the test item, reopening the empty cart and using Home also passed.
- Normal product/category Back, browser Back/Forward, nested map Back, branch
  selector Home, Home from a scrolled catalog, repeated Home clicks and returning
  from a deep product screen passed. Explicit Home returns to scroll zero.
- Actual WebKit browser engine at 390x844: category -> add -> product -> Home ->
  cart -> delivery -> Home; login -> Home; category -> Back passed. The item stayed
  in the cart. No page errors captured in either browser engine.
- Local component fixtures (not signed-in production tests): profile information,
  saved addresses, Gold, gift selector, opening hours and order success each expose
  a working Home button. Gold's busy state disables it until the action finishes.
- Keyboard Tab focused Home with a visible 3px outline; Enter returned to Home.
  Reduced-motion navigation passed. New Home touch targets are at least 44px high.
- Header checks at 360, 390, 430, 700, 820 and 1440px: no horizontal document
  overflow, Home/Google Play do not overlap, full Promociones label is readable.
  Checkout header checks at 360/430/820/1440: Back, Home, title and step count fit.
- Visual captures reviewed for mobile Home, product, checkout, tablet Home, Gold
  and WebKit Home. Fixed an inherited checkout span width that overlapped the Home
  button, the truncated category label and a 700px header overlap before signoff.
- Automated checks passed: `test:retail-home`, `test:store-categories`,
  `test:store-product-promotions`, `test:store-editorial`, `test:first-order-rewards`.
- `npm run build` and `npm run build:android:web` passed. Web retains its existing
  Vite warning for chunks over 500kB. No new dependencies or backend endpoints.

Local screenshot evidence is in `output/playwright/home-shortcut-*.png` (ignored
QA artifacts, not deployed). The fixture HTML is also ignored and not deployed.

## Limits

No real checkout confirmation, payment, customer data edits or reward redemption
was performed. Authenticated views used component fixtures; address persistence
and real Gold transactions were not re-tested. Browser engine emulation is not a
physical-device test. The Android web build is not a newly signed Play Store AAB.
