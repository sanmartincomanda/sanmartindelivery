# Store access and coverage correction

## Scope

- Web, Android 1.2.13 (16), and iOS 1.0.0 (3).
- No database rules, Functions, orders, prices, rewards or delivery eligibility changes.
- Allow account completion outside delivery coverage (pickup is still available).
  Delivery remains validated in checkout before an order can be placed.

## Causes and changes

- The storefront requested location on mount and opened a nearby-store prompt even
  for guests. Registration and the header also surfaced coverage notices. The
  prompt now originates only from an authenticated cart increase, using the active
  delivery address and existing delivery quote. It is suppressed for pickup,
  guests, unavailable location/settings and quantity decreases.
- Dismissal is remembered for the account/store/address in sessionStorage, with
  an in-memory fallback. Reloading and browsing do not repeat the same notice.
- Native Firebase JS Auth previously used browser defaults, which initialize an
  OAuth iframe resolver unnecessarily in Capacitor. Native Google/Apple already
  provide credentials through the native SDK. Native auth now uses initializeAuth
  with IndexedDB/local persistence, without the browser popup resolver. Web keeps
  getAuth and its popup support. Existing sessions are preserved.
- Last-login writes and welcome-coupon provisioning no longer block successful
  profile login. Critical reads and auth attempts have deadlines. The UI distinguishes
  connection/timeout errors from invalid passwords. A single-flight guard prevents
  overlapping attempts and ignores late application-level profile results.

## Verification

`npm run test:store-access` covers runtime initialization, session deduplication,
guest/cart conditions, timeout/retry/late results and real storeUsers orchestration
with isolated auth/database edges for password, Google and Apple. It performs no
production writes. Existing Google/Apple bridge tests must also pass.

The native iPhone/iPad shopping test now submits synthetic invalid credentials to
exercise real Firebase Auth initialization and checks that a rejection restores the
form, then browses and adds a product as a guest without a coverage prompt. It does
not create an account or an order. Successful Google/Apple consent still requires
validation on a physical device; simulation does not prove provider consent.

Native watchdogs cannot cancel a provider SDK request. If one never settles, the
UI explains how to close/reopen the app instead of starting a competing login.

## Release record

Pending native CI and production verification. Never submit the previous iOS build
2 as the fix. Rebuild web assets after native builds before hosting deployment.
