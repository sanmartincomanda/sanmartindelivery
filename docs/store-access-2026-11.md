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

## Release record (2026-11-07)

- Source: `494ced71d150a1407b9e2d00f58d9b42ffcf1ebb`, pushed to main and
  release/ios-app-store. Unrelated local SICAR bridge changes were not committed.
- Web: Netlify production deploy `6aef8fe2fe3bce3e1bf6fea7`. The actual
  `https://tienda.sanmartinsr.com/release.json` reports that revision.
- Browser QA: real review-account password login succeeded, invalid credentials
  restored the form, guest additions produced no notice, and an alternate
  delivery address in Managua remained blocked in checkout. Returning home did
  not prompt; adding a product prompted once. Another addition and reload did not
  repeat it. Selecting Nindiri with the Granada review address correctly suggested
  Granada on the next addition. Temporary cart cleared and review account logged
  out. No order created and no saved address changed.
- Production guest add/remove also passed. Retail home, editorial, manual Ruta,
  Google/Apple auth, store access, box sales, box-sales UI, order source, web build
  and web-release gates passed. Existing large-chunk build warnings remain.
- Android: signed APK/AAB built by run `42412989102`. Version 16 (1.2.13) uploaded
  to production release 8 and sent for review. Google completed preliminary
  checks and shows the production update under "Cambios en revision". Old Alpha
  10 (1.2.7) was excluded from this submission.
  AAB SHA256: `285380C2FC52F8B545FFC42F703B31AD4A262F9CDFC1D11B779F6D06220E2E3E`.
  APK SHA256: `E15DE79BB25BA2A3E6D9F097B63BA6B30AE8861D69D84DA8E901D0B7660914FA`.
- iOS: signed build 1.0.0 (3), uploaded successfully by run `42412985970`, processed
  by Apple and assigned to the existing private internal TestFlight group (1 tester).
  Build ID: `3fee5558-48f6-46fa-9210-2e5008f10fe4`. Test instructions saved.
  The owner retracted the App Review submission request; no public Apple review
  was submitted. Successful native Google/Apple consent awaits device confirmation.
- Native UI regression run `42412545565`: iPhone passed invalid-password recovery,
  guest browsing, product detail and adding to the cart without a coverage notice.
  iPad failed before submitting: XCTest considered the submit button hittable,
  although its center (y=980) was covered by the keyboard accessory bar (y=973).
  The form remained unchanged, not stuck processing. Test revision `0b46aab`
  explicitly dismisses the iPad keyboard and checks the typed email before submit.
  Repeat run `42414719874` compiled the app and revised XCTest successfully, but
  its startup step exceeded 12 minutes after the fresh simulator spent 8:28 on
  system migration/boot. The shopping tests were skipped, so the iPad correction
  has NOT been validated by a passing native run. No app code changed in this
  test-only revision, so TestFlight build 3 remains the current corrected binary.
  Do not claim successful native provider consent or a complete iPad pass until
  the owner/device test or a new native run supplies that evidence.
- Secondary Firebase Hosting CI run `42413229068` failed with missing
  `serviceusage.services.get` permission on project tiendavirtual-2ced1. This was
  already failing on the previous main commit. No permissions were broadened.
  The custom storefront/admin domains are served by the verified Netlify deploy;
  do not confuse this secondary hosting failure with a failed public web release.
