# Delivery GR icon and link previews

Owner approved the preview with the smaller red logo, three detached speed
lines, blue background and white Delivery GR lettering on November 14, 2026.
The exact approved raster is assets/app-icon-delivery-gr.png; do not regenerate
it with AI or use the legacy assets/app-icon.svg for this release.

Run npm run branding:generate to export iOS, Android, Google Play listing,
apple-touch and shared-link PNGs. Android adaptive layers keep the entire
mark and lettering inside the 66dp circular safe area. No new permissions,
authentication or business rules are included in this change. The photo-free
profile and updated privacy policy remain included.

Static Open Graph, Twitter and schema image metadata use the versioned URL
/tienda/branding/delivery-gr-v1.png. This works without JavaScript on the root
and branch routes. Existing social-network link caches cannot be forcibly
cleared by this deployment. The Play/App Store link previews themselves are
controlled by their respective stores, not the storefront metadata.

Planned artifacts: Android 1.2.17 (20), iOS 1.0.2 (10). Apple build 9 was
already waiting for review. The owner explicitly authorized replacing it
with the new icon, understanding that resubmission can delay approval.
Only withdraw build 9 after build 10 uploads and processes successfully.
Do not change store privacy attestations, availability or review credentials.

Verification and final publication results will be recorded after release.
