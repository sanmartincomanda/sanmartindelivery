import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Verify the approved exported bytes, not a platform-dependent libvips re-render.
export function assertBrandingArtifact(relativePath) {
  const root = new URL('../../', import.meta.url);
  const hashes = JSON.parse(readFileSync(new URL('assets/delivery-gr-checksums.json', root), 'utf8'));
  const expected = hashes[relativePath];
  assert.match(expected || '', /^[a-f0-9]{64}$/, `Missing branding export: ${relativePath}`);
  const actual = createHash('sha256').update(readFileSync(new URL(relativePath, root))).digest('hex');
  assert.equal(actual, expected, `Approved branding bytes changed: ${relativePath}`);
}
