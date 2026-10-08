# Storefront recovery - 2026-10-08

## Cause

The custom domain returned Netlify's production deployment
`6ac7a1b3c685deaf766d14d9`, published at 2026-10-08T13:59:18Z with title
`Martin SI: mapa visual verificado, solo lectura`. Its entry was
`index-DW3sXDDF.js` and storefront `TiendaVirtualView-Ds36PJF4.js`.
The deployed screen showed COMBOS and the old catalog, without the approved
retail editorial/navigation. A new browser tab reproduced it, so this was not
just a client cache issue. Firebase's default host was also republished.

The Martin SI working copy was based on aa1a479, before the retail redesign,
editorial, promotions navigation and manual Ruta commits. Both workspaces
publish to the same web hosts. Main still retained all approved retail work.

## Recovery scope

User explicitly approved preserving BOTH versions' features. Main remains the
base. Port the existing Martin SI dashboard and Whaticket client-link frontend
unchanged, plus its menu/entry and live client-directory subscription.
Keep the latest retail, editorial, promotions, and manual Ruta code intact.
Do not deploy Functions, rules or SICAR scripts. Do not write business data.
The shared backend refactors in the other checkout are not required by the
ported UI and remain untouched there; its deployed backend remains running.

The new web build gate rejects missing retail, editorial, home, manual Ruta,
Martin SI or Whaticket UI markers and rejects native relative-asset entrypoints.
It emits a static `/release.json` for identifying the build, not a new backend
API. This artifact check supplements, not replaces, browser QA.
Branch HTML and release metadata are non-cacheable on both hosting providers.
Publication warnings were added to both working copies. An old checkout without
the new guard can still overwrite hosting if those instructions are ignored.

## Verification

- Unit/model checks: release gate, Martin flow state, retail navigation,
  editorial destinations and hamburger matching.
- Manual Ruta: 136 assertions and shared coverage/schedule tests.
- Web production build and combined release markers.
- Local browser: home editorial and categories, Gold banner destination,
  add 2.5 lb, cart subtotal C$495, and progressive delivery screen with
  Delivery/Pickup/Ruta. No checkout was submitted.
- Category structure, per-product promotions and first-order reward tests pass.
- Production screenshot and deployment evidence are kept in ignored `output/`;
  final custom-domain verification must follow publication.
- No real order, customer registration, payment, WhatsApp message or agent
  activation is part of this repair.

Pre-existing Vite chunk-size warnings are not addressed in this hotfix.
