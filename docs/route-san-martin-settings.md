# Ruta San Martin: coverage and delivery days

## Operations

AdminTV > Tienda virtual > Ruta San Martin.

- The service remains **disabled** for this release. Saving zones never enables it.
- Enable/disable the entire service separately from each zone's active checkbox.
- Radius zones use the Granada store coordinates as their center (0.1-200 km,
  straight-line distance). Polygon zones accept 3-60 vertices, drawn/dragged on
  the map or entered as coordinates. Crossing edges are rejected.
- Each zone has its own delivery weekdays. Overlapping zones combine their days.
- Up to 20 zones can be saved. The existing 40 km/all-days coverage is presented
  as an editable initial draft when there is no versioned configuration.
- "Probar una direccion" uses the draft, without activating Ruta or creating
  orders. It shows matching zones and the next available delivery windows.
- The minimum remains C$1,000 after discounts, with free delivery. Windows remain
  09:00-12:00 and 13:00-17:00, America/Managua. Before 22:00, the following day's
  afternoon is eligible when that zone has service that day. Other windows need
  24 hours. The chooser covers the next 14 days, allowing weekly service.
- Existing orders retain their schedule and can be prepared, dispatched,
  delivered or canceled even while Ruta is disabled. Delivery/pickup and the
  global RS sequence are preserved.

## Data and API

`storeBranches/granada/routeSanMartinEnabled`: explicit boolean, fail closed.

`storeBranches/granada/routeSanMartin`:

```text
schemaVersion: 1
revision: integer
updatedAt: epoch milliseconds
updatedBy: Firebase uid
zones/{zoneId}:
  id, name, type (radius | polygon), active, deliveryDays (0=Sunday...6=Saturday)
  radiusKm (radius only)
  vertices: [{lat, lng}, ...] (polygon only)
```

`POST /.netlify/functions/route-san-martin` uses the existing Firebase ID token
and existing Netlify Firebase Admin credentials. No new cloud polling service,
scheduled function, Google Maps key, or Martin IA service is installed.

- `save`: admin only; accepts zones and expectedRevision. Preserves service state.
- `set-enabled`: admin only; accepts enabled and expectedRevision. Activation
  needs at least one valid active zone. Pausing remains possible with a draft.
- `authorize`: client/operator/kitchen/admin or Granada branch admin; validates
  the live service, branch, coordinates, delivery day/window and minimum before
  a new Ruta order is written. Returns a proof tied to uid, order key, config
  revision, location, window and eligible subtotal. Expires after five minutes.

Proofs are stored at `routeSanMartinAuthorizations/{orderKey}` and are not
readable/writable by browser clients. New orders include `routeZoneId`,
`routeZoneName` and `routeConfigRevision` for traceability. RTDB rules compare
the order against its proof and reject stale/tampered requests atomically.
Existing order updates do not need a new proof.

Configuration updates are transactions with revision checks. A second admin's
changes cannot silently overwrite a dirty draft. The general branch editor no
longer overwrites Ruta configuration when saving unrelated branch fields.

## Deployment safeguards

`scripts/pauseRouteSanMartin.mjs` reads and backs up the LIVE rules and branch,
then patches only the order-creation guard, RS counter guard, private proof node
and Granada pause flag. Run without arguments to prepare a candidate; test it in
the emulator before `--apply`. It preserves unrelated live rules, including the
Whaticket rules that differ from the checkout. Never deploy the whole rules file
or retired Martin IA functions as a substitute.

The public domains use Netlify; GitHub Actions also deploys Firebase Hosting.
Ship the new Netlify endpoint with the web bundle. Verify the actual domains and
`/release.json` after publishing, keeping the service disabled throughout.

Previously installed Android APKs contain older UI code. The server pause blocks
their new Ruta orders, but their screen may still offer the old option. A new
Android bundle must include this code before re-enabling Ruta for those clients.
This web release does not claim to publish an update to Google Play.

The admin map lazy-loads Leaflet 1.9.4 with visible OpenStreetMap attribution,
normal browser referrer, no bulk download or offline prefetch. If map tiles fail,
coordinate editing and coverage validation still work. References:
[Leaflet](https://leafletjs.com/reference.html) and
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).

## Verification (2026-10-10)

- `test:route-zones`: 61 checks for geometry, boundaries, invalid polygons,
  inactive/missing configuration, weekdays, overlap, cutoff, server validation.
- `test:route-rules`: 31 rule checks and 26 handler checks in the real RTDB
  emulator, including the production rule candidate and Netlify
  handler. Auth is stubbed only inside the handler test. Tests cover forbidden
  configuration access, stale revisions, save-without-activation, empty zones,
  invalid coordinates/days/minimum, proof tampering/expiry/account binding,
  continued Delivery/pickup and existing Ruta order transitions.
- `test:manual-route`: 578 manual-order assertions plus Ruta scheduling, RS
  numbering, carryover and dispatch checks.
- `test:retail-home`, `test:store-editorial`, `test:web-release`, web build.
- Real browser, isolated editor: radius change, weekday selection, save while
  disabled, new polygon, invalid empty polygon, four coordinate vertices, save,
  overlap coverage preview and 390x844 layout without horizontal overflow.
- An initial browser-control failure was isolated to an old native dialog. A
  fresh local browser session completed activation confirmation, cancellation,
  deactivation, keyboard focus trapping, Escape, and saving without activation.
  The editor now uses an accessible in-page confirmation instead of native
  confirm. An injected save error retained the draft; confirmed reload restored
  the saved configuration. 1024px tablet and 1280px desktop were also inspected.
- Netlify preview: version marker, CORS preflight and invalid-token rejection
  passed. Production: both custom domains serve the new release, the endpoint
  responds, Granada remains active/accepting regular orders, Ruta is false,
  and the public catalog/cart load. Firebase Hosting workflow succeeded.
- Production AdminTV reaches its login screen in this browser. The authenticated
  editor was tested in an isolated fixture; no production activation, real
  customer order, or live coverage edit was used for QA.

Pending: publish/test an Android build before resuming Ruta on old APKs.
