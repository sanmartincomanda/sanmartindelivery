# Account profile repair - 2026-11-14

## Cause

The previous profile reused StoreCheckoutIcon, whose wrapper inherits
`grid-area: icon` from TiendaVirtualView's inline CSS. The profile grid had no
matching named area, creating implicit tracks and collapsing text into the
24px icon column. Earlier tests substituted raw SVGs and the preview did not
mount that inline CSS. Those checks therefore missed the production defect.

## Layout and actions

- Isolated `csm-account*` styles and line icons, with flex-based menu rows.
- Name and editable avatar at the top; person icon when no usable photo exists.
- Two-column shortcuts: Ayuda, Billetera, Mis direcciones and Mis pedidos.
- Billetera is a native disabled button, marked Proximamente, without an action.
- Miembro Gold shows existing points and opens the existing rewards screen.
- Configuracion opens personal information; WhatsApp uses the selected
  branch's existing contact, or a disabled row if no valid number is configured.
- Existing sign-out, help, address, order and rewards flows remain unchanged.
- Paper background on Profile only; the Home editorial artwork remains intact.
- Photo editor uses a bottom sheet, safe areas, scroll containment and the
  existing shared focus/Escape boundary. Reduced motion is respected.

## Photo persistence

No new endpoint, public bucket, SDK or native permission. The gallery picker
converts a chosen image into a centered JPEG thumbnail (256px, falling back to
192px), at most 18 KiB before base64 encoding (approximately 24 KiB stored).
The original image and metadata are not uploaded. HEIC is accepted only when
the browser can decode it; otherwise the user is asked for JPG.

Only `storeUsers/{authenticatedUid}/profilePhoto` and
`profilePhotoUpdatedAt` are patched. Empty photo means removal. Existing
owner/admin database rules protect access; no rules were deployed. Size/type
limits are client-side, not new server-enforced validation. The normal account
subscription synchronizes the photo. Nothing is copied to the product catalog
or SICAR. Changes do not reset checkout, pricing, points or address state.
Preview is local until Save; failed saves remain retryable. Review mobile
privacy disclosures for optional customer photos before submitting new builds.

## Automated verification

`test:retail-profile` loads the real legacy styles, including the previously
missed inline checkout rule. Its control proves `grid-area: icon` is present;
the new icons remain independent. Both web/native root classes are covered.

Checks cover two-column layout declarations, flexible text, touch target
minimums, long names, all callbacks, disabled wallet, branch WhatsApp, absent
Gold, person fallback, preview, cancellation, failed-save retry, removal,
image decode errors, account-UID matching, patch isolation, compression size
fallback and temporary image cleanup. Tests use JSDOM and a deterministic
canvas adapter, not a real browser, camera or production account.

The profile gate is included in the web, Android and iOS release workflows.
Also run build, web-release, retail-interactions, store-access, retail-home,
store-editorial and manual-route. No production orders or customer writes
are made during these tests.

## Browser verification and release

Browser access became available after the owner authorized publication.
The real browser fixture passed visual checks at 360x800 (long full name),
390x844, 430x932 and 1280x900. No horizontal overflow was observed. Verified
Ayuda, Direcciones, Configuracion, Gold and Mis pedidos destinations and back
navigation. The photo sheet trapped focus, darkened the background, stayed
within the viewport and restored trigger focus after saving. An actual JPG
was compressed with browser canvas to 256px / 23,051 data-URL characters;
save updated the fixture avatar without contacting a customer database.
The visual check also caught inherited disabled opacity and heading styles;
isolated account CSS now follows the legacy sheets and overrides both.

Screenshot: output/playwright/profile-430-after.jpg (ignored local artifact).
Physical iPhone/Android, larger accessibility text, real database persistence
and native gallery checks remain pending. No real orders or customer writes.
The public privacy page now explicitly describes optional private profile
photos. Store declarations must also be checked before review submission.
Rebuild Android 1.2.16 (19) and iOS 1.0.2 (8); never submit the earlier artifacts.
