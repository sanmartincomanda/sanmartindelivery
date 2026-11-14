import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

export const iconSource = fileURLToPath(new URL('../assets/app-icon-delivery-gr.png', import.meta.url));
export const shareIcon = 'tienda/branding/delivery-gr-v1.png';
export const background = '#0044C5';
export const densities = { ldpi: .75, mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
export const iconPng = size => sharp(iconSource).resize(size, size).removeAlpha().png({ compressionLevel: 9 }).toBuffer();

export async function adaptivePng(size) {
  // Keep all lettering inside Android's 66dp circular safe area on a 108dp layer.
  const artSize = Math.round(size * .75);
  const inset = Math.floor((size - artSize) / 2);
  // Extend the existing blue edge so the extra mask margin has no visible frame.
  return sharp(await iconPng(artSize))
    .extend({ top: inset, left: inset, bottom: size - artSize - inset,
      right: size - artSize - inset, extendWith: 'copy' })
    .removeAlpha().png({ compressionLevel: 9 }).toBuffer();
}

async function generate() {
  const root = new URL('../', import.meta.url);
  const write = async (path, data) => {
    const target = new URL(path, root);
    await mkdir(new URL('./', target), { recursive: true });
    await sharp(data).png({ compressionLevel: 9 }).toFile(fileURLToPath(target));
  };
  await write('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', await iconPng(1024));
  await write(`public/${shareIcon}`, await iconPng(1024));
  await write('public/tienda/branding/delivery-gr-touch-v1.png', await iconPng(180));
  await write('assets/google-play-icon.png', await iconPng(512));
  for (const [density, scale] of Object.entries(densities)) {
    const path = `android/app/src/main/res/mipmap-${density}/`;
    const launcher = await iconPng(Math.round(48 * scale));
    await write(`${path}ic_launcher.png`, launcher);
    await write(`${path}ic_launcher_round.png`, launcher);
    await write(`${path}ic_launcher_foreground.png`, await adaptivePng(Math.round(108 * scale)));
    await write(`${path}ic_launcher_background.png`, await sharp({ create: {
      width: Math.round(108 * scale), height: Math.round(108 * scale), channels: 3, background,
    } }).png().toBuffer());
  }
  console.log('Approved Delivery GR artwork exported for iOS, Android, Play listing and web sharing.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generate();
