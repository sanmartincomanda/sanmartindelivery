import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { get, ref, set } from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase, getAuthenticatedFirebaseStorage } from './firebaseScriptAuth.mjs';

const id = 'hueso_corriente_caja_nov_2026';
const code = 'BOX_7f2a4f25-28c4-4095-90bc-d5920faa263b';
const imageFile = process.argv[process.argv.indexOf('--image') + 1];
async function main() {
  assert(process.argv.includes('--image') && imageFile, 'Use --image <optimized.webp> [--apply]');
  const imageBytes = await readFile(imageFile);
  assert(imageBytes.subarray(8, 12).toString() === 'WEBP', 'Expected optimized WebP');
  await ensureAuthenticatedFirebaseSession();
  const database = getAuthenticatedFirebaseDatabase();
  const product = (await get(ref(database, `storeCatalog/${code}`))).val();
  assert(product?.active && product.unit === 'caja', 'Box must still be active');
  assert.equal(product.boxSale.sourceCode, '00069');
  assert.equal(product.boxSale.poundsPerBox, 40);
  assert.equal(product.boxSale.pricePerPound, 8.75);
  assert.equal(product.price, 350, 'Artwork price differs from current catalog; do not publish');
  const before = (await get(ref(database, 'storePopupAds'))).val() || {};
  assert(!before[id], 'Campaign already exists; edit through AdminTV instead of overwriting');
  assert(!Object.values(before).some(ad => ad.active === true && !ad.deleted), 'Another campaign became active; review before publishing');
  const campaign = { id, title: 'Caja Hueso corriente - 40 lb por C$350', active: true, deleted: false,
    sortOrder: 1, maxViewsPerUser: 2, startsAt: '', endsAt: '', ctaLabel: 'Ir a comprar',
    targetProductCode: code, targetCategory: 'venta_por_cajas', targetSubcategory: '' };
  console.log(JSON.stringify({ apply: process.argv.includes('--apply'), campaign, imageBytes: imageBytes.length }));
  if (!process.argv.includes('--apply')) return;
  await mkdir('tmp', { recursive: true });
  await writeFile(`tmp/${id}-before.json`, JSON.stringify(before, null, 2));
  const digest = createHash('sha256').update(imageBytes).digest('hex').slice(0, 24);
  const imageStoragePath = `store/promotions/popup_${id}/${digest}.webp`;
  const imageRef = storageRef(getAuthenticatedFirebaseStorage(), imageStoragePath);
  await uploadBytes(imageRef, imageBytes, { contentType: 'image/webp', cacheControl: 'public,max-age=31536000,immutable' });
  const image = await getDownloadURL(imageRef);
  await set(ref(database, `storePopupAds/${id}`), { ...campaign, image, imageStoragePath });
  const saved = (await get(ref(database, `storePopupAds/${id}`))).val();
  assert.equal(saved.targetProductCode, code);
  assert.equal(saved.ctaLabel, 'Ir a comprar');
  console.log(JSON.stringify({ published: true, id, targetProductCode: code, image }));
}
main().then(() => process.exit(0)).catch(error => { console.error(error.message); process.exit(1); });
