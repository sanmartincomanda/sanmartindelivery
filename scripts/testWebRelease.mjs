import test from 'node:test';
import assert from 'node:assert/strict';
import { WEB_RELEASE_FEATURES, RETIRED_MARTIN_MARKERS, verifyWebRelease } from './lib/webRelease.mjs';

const html = '<script type="module" crossorigin src="/assets/index-current.js"></script>';
const source = Object.values(WEB_RELEASE_FEATURES).flat().join('\n');
test('web release preserves retail, manual Ruta and commercial Whaticket integration', () => {
  assert.deepEqual(verifyWebRelease(html, source).features, Object.keys(WEB_RELEASE_FEATURES));
});
test('a release cannot restore the retired cloud Martin module', () => {
  for (const marker of RETIRED_MARTIN_MARKERS) {
    assert.throws(() => verifyWebRelease(html, `${source}\n${marker}`), /Retired cloud Martin integration/);
  }
});
test('an old storefront or partial release cannot pass the build gate', () => {
  assert.throws(() => verifyWebRelease(html, 'old storefront'), /Incomplete web release/);
  for (const markers of Object.values(WEB_RELEASE_FEATURES)) {
    assert.throws(() => verifyWebRelease(html, source.replace(markers[0], '')), /Incomplete web release/);
  }
});
test('an Android build cannot be deployed as the web release', () => {
  assert.throws(() => verifyWebRelease(html.replace('/assets/', './assets/'), source), /Expected a web build/);
});
