import assert from 'node:assert/strict';

export function assertBrandingRaster(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: pixel dimensions/channels`);
  let max = 0;
  let total = 0;
  for (let i = 0; i < actual.length; i++) {
    const delta = Math.abs(actual[i] - expected[i]);
    max = Math.max(max, delta);
    total += delta;
  }
  const mean = total / actual.length;
  // ARM/x64 libvips showed max=5, mean=.0301 at antialiased edges in CI.
  assert.ok(max <= 8 && mean <= .1, `${label}: raster mismatch (max=${max}, mean=${mean})`);
}
