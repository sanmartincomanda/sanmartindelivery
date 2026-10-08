# Production publishing

- This repository serves tienda, admintv, cocina, driver and crm. Publishing a
  web bundle replaces all host-based entry points, not just the module edited.
- Integrate the latest `origin/main` before preparing any production release.
  Never deploy a stale checkout or restore an entire older build to change one
  module. Preserve unrelated work and reconcile concurrent changes explicitly.
- Web production must retain the retail storefront/editorial, manual Ruta
  scheduling and Martin SI dashboard. Run `npm run build`, `test:web-release`,
  `test:martin-flow`, `test:retail-home`, `test:store-editorial`, `test:manual-route`.
- Never publish `dist` after an Android/iOS build without rebuilding for web.
- Netlify site `768476b6-7b09-4013-9116-88cefb31a8dc` currently serves the custom
  storefront domain and the internal subdomains. Firebase Hosting project
  `tiendavirtual-2ced1` is also deployed by GitHub Actions. Verify the actual
  custom domain, not only a successful Firebase workflow.
- Check `/release.json`, then visually test storefront and affected admin pages
  after publishing. Do not create real orders or change business data for QA.
- A hosting repair does not authorize deploying database/storage rules,
  Functions, the SICAR bridge or activating the Whaticket agent.
- Martin SI backend source is maintained separately on
  `feat/whaticket-order-agent`; this repository contains its existing frontend
  integrations. Do not remove those deployed Functions or change their settings.
