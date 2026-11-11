import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const name = 'Carnes San Martin Delivery GR';
assert.ok(name.length <= 30, 'The App Store name must fit its 30-character limit');
assert.equal(JSON.parse(read('capacitor.config.json')).appName, name);
assert.match(read('ios/App/App/Info.plist'), new RegExp(`<key>CFBundleDisplayName</key>\\s*<string>${name}</string>`));
const iconSet = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/';
const manifest = JSON.parse(read(`${iconSet}Contents.json`));
const icon = manifest.images.find(image => image.platform === 'ios' && image.size === '1024x1024');
assert.ok(icon, 'Include the App Store icon in the native asset catalog');
const iconPath = fileURLToPath(new URL(`../${iconSet}${icon.filename}`, import.meta.url));
const metadata = await sharp(iconPath).metadata();
assert.equal(metadata.format, 'png');
assert.equal(metadata.width, 1024);
assert.equal(metadata.height, 1024);
assert.equal(metadata.hasAlpha, false, 'App Store artwork must be opaque');
const { data, info } = await sharp(iconPath).raw().toBuffer({ resolveWithObject: true });
for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023], [512, 50]]) {
  const start = (y * info.width + x) * info.channels;
  assert.deepEqual([...data.subarray(start, start + 3)], [0, 68, 197], 'Use exact corporate blue #0044C5, without white corners');
}
const expected = await sharp(fileURLToPath(new URL('../assets/app-icon.svg', import.meta.url)))
  .resize(1024, 1024).removeAlpha().raw().toBuffer();
assert.ok(data.equals(expected), 'The committed icon must match its editable vector source');
console.log('iOS branding: exact name, corporate blue, 1024px opaque PNG and vector parity passed.');
