import assert from 'node:assert/strict';

export const WEB_RELEASE_FEATURES = Object.freeze({
  'retail-storefront': ['storefront-retail', 'retail-product-photo', 'retail-checkout-screen'],
  'food-editorial': ['Hoy se come bien.', 'retail-food-story', 'retail-promo-seal'],
  'home-navigation': ['retail-home-button'],
  'manual-route-orders': ['manual-route-date', 'manual-route-slot'],
  'martin-si-dashboard': ['martin_si', 'getMartinDashboard', 'martin-workspace'],
  'whaticket-client-link': ['resolveWhaticketClient', 'whaticket-link-panel'],
});

export function verifyWebRelease(html, javascript) {
  const entry = html.match(/<script\b[^>]*\bsrc="(\/assets\/[^"/]+\.js)"/)?.[1];
  assert.ok(entry, 'Expected a web build with an absolute /assets/ entry, not an Android bundle.');
  for (const [feature, markers] of Object.entries(WEB_RELEASE_FEATURES)) {
    for (const marker of markers) {
      assert.ok(javascript.includes(marker), `Incomplete web release: ${feature} (${marker}).`);
    }
  }
  return { entry, features: Object.keys(WEB_RELEASE_FEATURES) };
}
