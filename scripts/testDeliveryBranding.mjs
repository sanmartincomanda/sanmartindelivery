import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { JSDOM } from 'jsdom';
import { iconSource, densities, shareIcon } from './generateDeliveryBranding.mjs';
import { assertBrandingArtifact } from './lib/assertBrandingArtifact.mjs';

const path = value => fileURLToPath(new URL(`../${value}`, import.meta.url));
const read = value => readFileSync(path(value), 'utf8');
assert.equal(createHash('sha256').update(readFileSync(iconSource)).digest('hex'),
  'c28b3514239952ac07b717e4a0a577e3306a7ddb0d3e8e18c4648ab63006587c', 'Use the approved separated-line artwork unchanged');

async function verifyPng(file, size) {
  const meta = await sharp(path(file)).metadata();
  assert.equal(meta.format, 'png', file);
  assert.equal(meta.width, size, file);
  assert.equal(meta.height, size, file);
  assert.equal(meta.hasAlpha, false, file);
  assertBrandingArtifact(file);
}

for (const [file, size] of [
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
  [`public/${shareIcon}`, 1024], ['public/tienda/branding/delivery-gr-touch-v1.png', 180],
  ['assets/google-play-icon.png', 512],
]) await verifyPng(file, size);
assert.ok(readFileSync(path('assets/google-play-icon.png')).length < 1024 * 1024, 'Play listing icon must be under 1MB');
assert.ok(readFileSync(path(`public/${shareIcon}`)).length < 1024 * 1024, 'Keep sharing artwork compact');

for (const [density, scale] of Object.entries(densities)) {
  const base = `android/app/src/main/res/mipmap-${density}/`;
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await verifyPng(base + name, Math.round(48 * scale));
  }
  const size = Math.round(108 * scale);
  await verifyPng(base + 'ic_launcher_foreground.png', size);
  await verifyPng(base + 'ic_launcher_background.png', size);
  const { data, info } = await sharp(path(base + 'ic_launcher_foreground.png')).raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * info.channels;
    const [r, g, b] = data.subarray(offset, offset + 3);
    const markOrText = r > 190 && ((g < 110 && b < 150) || (g > 190 && b > 190));
    if (markOrText) assert.ok(Math.hypot(x - size / 2, y - size / 2) <= 33 * scale + 1,
      `Do not clip logo or Delivery GR in Android's circular safe area: ${density}`);
  }
}
for (const name of ['ic_launcher', 'ic_launcher_round']) {
  const xml = read(`android/app/src/main/res/mipmap-anydpi-v26/${name}.xml`);
  assert.match(xml, /@color\/ic_launcher_background/);
  assert.match(xml, /@mipmap\/ic_launcher_foreground/);
  assert.doesNotMatch(xml, /inset/, 'Padding already exists in the generated foreground');
}
const { document } = new JSDOM(read('index.html')).window;
const url = `https://tienda.sanmartinsr.com/${shareIcon}`;
for (const selector of ['[itemprop="image"]', '[property="og:image"]', '[property="og:image:url"]',
  '[property="og:image:secure_url"]', '[name="twitter:image"]']) {
  assert.equal(document.querySelector(selector)?.content, url, `Crawler metadata: ${selector}`);
}
for (const dimension of ['width', 'height']) assert.equal(document.querySelector(`[property="og:image:${dimension}"]`).content, '1024');
assert.equal(document.querySelector('[property="og:image:type"]').content, 'image/png');
assert.match(document.querySelector('[property="og:image:alt"]').content, /Delivery GR/);
assert.equal(document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), '/tienda/branding/delivery-gr-touch-v1.png');
console.log('Delivery GR: approved master, iOS/Play/web parity, all Android densities, circular safe area and crawler metadata passed.');
