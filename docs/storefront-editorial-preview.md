# Storefront editorial design and QA

Status: visually approved by the user on 2026-10-06 for GitHub and production.

## Scope

- Warm canvas, blue/celeste butcher line art and subtle red brand rings.
- Compact meal-inspiration banner before categories; a burger story after the
  first product group. Real catalog photos, prices and business rules stay intact.
- Existing Res category navigation and existing product search for "tortas".
- No API, authentication, checkout, inventory or order changes.
- Corrected the public "Todos" subcategory filter: it must remain selected rather
  than immediately forcing the first subcategory and trapping history back.
  Dashboard default filtering remains unchanged.

## QA inventory (before signoff)

| Claim / control | Check and evidence |
| --- | --- |
| Pattern is visible, without obscuring food/text | Home at 360, 390, 430, 820 and 1440 px; viewport screenshots |
| First products appear early | First home viewport, measure first photo against bottom navigation |
| Banner opens real products | Cuts -> Res -> product -> add -> cart -> return |
| Burger banner uses real search | Banner -> "tortas" results -> back, cart quantity preserved |
| Search and categories remain compact | Search, clear, category, return home |
| No advertising in checkout screens | Open cart and proceed to authentication without placing an order |
| No missing-image layout jump | Block editorial image requests; accessible CTA still works |
| Small viewport / large text does not overflow | 360 px and increased text, inspect clipping and horizontal overflow |
| Subtle motion and accessible controls | Keyboard focus, accessible names, reduced-motion emulation |
| No extra service dependencies | Local assets only; build web/native; inspect diff scope |

Exploratory cases: image failure; history/back after search with an existing cart;
branch catalog change; smaller screen. No real purchase or production mutation.

## Results

- Chromium: 360x800, 390x844, 430x932, 820x1180, 1440x1000; no horizontal
  document overflow. The first product photograph is fully visible at each size.
  On the smallest screen a short scroll is needed to reach the add buttons.
- WebKit engine: home at 390x844, catalog, images and illustrated background.
  This is engine emulation, not a physical iPhone/Android device certification.
- Cuts banner -> Res -> product -> add -> cart -> delivery -> address/login
  requirement -> back -> home. Quantity and displayed total retained.
- Final navigation regression: banner -> Res -> one Back -> Home and category
  Pollo -> one Back -> Home passed. In the tested catalog, Res/Todos shows 105
  products, Linea Gold shows 21, and returning to Todos restores 105. WebKit
  also passed the single-Back return from the cuts banner.
- Burger banner -> existing "tortas" search -> back. Cart retained.
  Search keeps its existing name/category matching behavior.
- Manual search and category selection exercised, with no banners in search,
  category results or checkout. Local Nindiri and Masaya catalogs also checked.
- Blocked editorial image requests: fallback artwork, stable banner dimensions
  and functioning category button. No third-party image service is used at runtime.
- Keyboard Tab/Enter, focus outline and reduced-motion preference checked.
- Banner text at 150% on 360 px exposed a long-word overflow. Added wrapping;
  both banners now expand without horizontal text/document overflow.
- No JavaScript page errors captured in the main Chromium interaction flow.
- Web and Android web builds passed. Existing web chunks above 500 kB still
  produce the pre-existing Vite size warning; no new dependencies were added.
- Existing category structure, per-product promotions and first-order-reward
  regression scripts all passed before publication.
- Photos: 154,966 bytes total, WebP. Burger image loads lazily. Attribution and
  source-license URLs: `public/tienda/editorial/SOURCES.md`.

Screenshots are in `output/playwright/brand-preview/` (local, ignored by Git).
Selected approved screenshots are retained in `docs/screenshots/editorial-2026/`.

No real customer order was submitted. Authenticated payment/order/Gold flows
were not re-executed for this visual release; they are unchanged from the prior
retail audit in `docs/storefront-retail-qa.md`.

## Follow-up: specific destinations and Play download

Requested on 2026-10-06: a compact Google Play badge under the header actions;
cuts -> Linea Gold; burgers -> actual beef patties across their existing Res
subcategories; a third Parrillada banner immediately before the Linea Gold group
and linked to Linea Parrillera. If Gold is absent from the capped home groups,
the grill banner follows the last displayed group instead of disappearing.

QA inventory: verify all three destinations and Back; patties exclude cubos,
fajitas, bread, chicken and fish; changing search clears the burger intent;
cart survives navigation; badge URL opens the correct package in a new tab;
badge hidden in the native app; order of banners/Gold; 360/390/430/820/1440 widths;
keyboard access; web/native builds and existing catalog/promotion regressions.
No image caption is reintroduced. Existing products and catalog categories are
not edited. Final validation results are below.

## Follow-up: Preciazos promotion identity

Own red/blue "Preciazos en Carnes San Martin, si" seal on discounted catalog
photos and product detail. Real campaign titles and previous prices remain;
regular products are never labeled as offers. No competitor logos or new raster
assets, dependencies, price calculations, campaign dates or eligibility rules.

QA inventory: verify every discounted card has a readable seal and red current
price, normal cards do not; details and search share the same identity; open,
add, adjust and remove a promotional product without changing the price engine;
inspect photo coverage, clipping and touch controls at all target widths; reduced
motion, keyboard focus, failed images, and large text. No real order submission.

## Follow-up validation results (2026-10-06)

- Used the Playwright Interactive skill with persistent Chromium and WebKit
  sessions. No image-generation skill: the seal is code-native and the third
  banner uses a licensed stock photograph with source recorded in SOURCES.md.
- Chromium and WebKit: cuts -> Linea Gold (21 products), burgers -> six actual
  beef patties, grill -> Linea Parrillera (13 products), each followed by Back.
  Counts describe the live catalog at test time, not hardcoded limits.
- The third banner directly precedes Res / Linea Gold. No public photo captions
  were reintroduced. Changing the burger search to "pollo" shows the normal
  23-product results; hamburger filtering does not apply to the dashboard.
- Header Google Play link opened the correct public package in a new tab using
  Enter. It has a 3px visible keyboard focus ring. With the native-platform flag
  emulated, both download areas disappear, then return when the flag is restored.
  This is a guard check, not physical Android device certification.
- All five displayed promotional home cards have the seal and previous price;
  normal cards do not. A mixed "bistec" search has five results, one discounted,
  and exactly one seal. Promotional details have the larger seal; regular product
  details have no seal. Add/quantity controls remain separate from the stamp.
- Purchase path without submission: add a C$60 hamburger item, navigate home and
  grill and back, add the discounted C$164.68 cut in its detail screen. The cart
  shows C$239.00 before the existing C$14.32 promotion, subtotal C$224.68.
  Increase and decrease the cut quantity, continue to delivery and address, go
  back twice: the C$224.68 subtotal and both items remain. Removing the cut leaves
  C$60; removing the last item returns the empty cart/normal shop behavior.
- Screenshots reviewed at 360x800, 390x844, 430x932, 820x1180, 1440x1000.
  No horizontal document overflow. The first promotional photos and prices fit
  above the bottom navigation; 360px needs a short scroll to reach Add buttons.
  Fixed a pre-existing tablet grid placement conflict discovered during this
  pass: brand/actions now precede location and Play badge. Also checked 700px and
  1180px header bounds, with no header/search intersection.
- Blocked editorial photo requests: the patterned fallback retains banner
  dimensions, copy and working navigation. At 150% product/banner text on 360px,
  text wraps without horizontal overflow. Reduced-motion animations/transitions
  are effectively disabled. No JavaScript page errors in the main Chromium flow.
- Local Granada, Nindiri and Masaya: three banners, download link and consistent
  offer/regular-product distinction. Real orders, customer accounts, payments,
  promotion data and prices were not written or altered.
- Passed `test:store-editorial`, `test:store-product-promotions`,
  `test:store-categories`, `test:first-order-rewards`, `build`, and
  `build:android:web`. No dependencies added. Existing >500kB Vite chunk warnings
  remain; the seal makes no network requests, and the new 93,084-byte WebP loads
  lazily. An Android web build is not a new APK/AAB or Play Console release.
- Evidence: `docs/screenshots/editorial-2026/preciazos-home-*.png`,
  `preciazos-detail-390.png` and `parrillada-390.png`.

Limits: no physical-device QA or real purchase; authenticated checkout, points
and order fulfillment are unchanged and were not re-certified. Windows WebKit
renders the existing variable font lighter than Chromium; this release does not
change the font assets. Publication must be confirmed separately after CI.
