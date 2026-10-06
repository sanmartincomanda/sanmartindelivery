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
