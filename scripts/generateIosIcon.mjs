import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const source = fileURLToPath(new URL('../assets/app-icon-delivery-gr.png', import.meta.url));
const target = fileURLToPath(new URL('../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', import.meta.url));

// iOS applies its own corner mask; ship a full square without an alpha channel.
await sharp(source).resize(1024, 1024).removeAlpha().png().toFile(target);
console.log('Rendered the approved Delivery GR icon for iOS.');
