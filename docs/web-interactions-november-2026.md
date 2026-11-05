# Web interaction refinement - November 2026

## Reference and scope

Reviewed contact sheets extracted from the two customer-supplied recordings:
the Doncito branded entrance, profile menu, settings, favorites and order tabs.
Adapted the short branded entrance and direct navigation, not its dark theme,
marketplace features or business rules. Existing San Martin food artwork,
editorial ads, Black Meat November seal and corporate colors are preserved.

Web publication only. No native APK/AAB, Play Console release, database writes,
new Firebase listeners, backend changes or changes to checkout/order pricing.

## Changes

- Public web entry: 1.15-second logo reveal with existing butcher vector pattern.
  Skip control, once per tab session, skipped for reduced motion. Commerce mounts
  in parallel; animation does not delay data requests or remount the store.
  Error screens bypass the introduction and expose a retry action.
- Home: direct access to the existing promotion sections, order history and Gold.
  Unavailable offers and disabled Gold shortcuts are omitted.
- Search: native search keyboard, clear button and last five submitted searches.
  Recent searches stay on this device, can be erased and tolerate denied storage.
  Live search still delegates to the existing filtering logic.
- Products: subtle in-cart outline and short quantity feedback. Keyboard focus
  survives transitions between Add and quantity controls. Existing weight rules,
  price calculation and cart update functions are reused unchanged.
- Profile: compact branded identity area, edit action, Gold balance and orderly
  existing menu entries. No fictitious account stats or new service calls.

## Verification performed

`npm run test:retail-interactions` mounts actual JSX in jsdom and checks:

1. Welcome, child mounting before exit, inert state, skip and no commerce remount.
2. Same-session repeat suppression, reduced motion, failure state and timed exit
   under React StrictMode.
3. Missing/denied/corrupt storage, deduplication, query lengths and five-item cap.
4. Immediate search, submit persistence, clear/refocus, recent selection, delete,
   Escape dismissal and no retail history panel in the admin search.
5. Quick-action callbacks and visibility when offers/Gold are unavailable.
6. Product opening, add, increment, decrement, removal, keyboard focus restoration
   and custom promotion seal fallback when its image fails.

Also passed existing tests: web-release, retail-home, store-editorial,
manual-route (including 578 manual-order assertions), Google auth,
promotion-share, and the November campaign's prices, branches and expiry.
Production Vite build and git diff whitespace check pass.

The initial JS entry grew from about 2.29 to 3.05 kB gzip; the storefront JS from
about 138.72 to 139.85 kB gzip. No animation library or video is loaded.
jsdom is a development-only testing dependency, not shipped to browsers.

## Limitations / follow-up

Browser access remained disabled in Work settings despite user authorization.
No real browser screenshots, mobile viewport/keyboard measurements, live visual
sign-off, logged-in profile walk-through or end-to-end checkout were performed.
jsdom tests verify DOM behavior, not layout or animation smoothness.
No production orders were created. Native Android is intentionally unchanged.
Existing Vite large-chunk warnings remain. npm reported dependency audit findings
during development dependency installation; broad dependency remediation was not
included in this visual change.
