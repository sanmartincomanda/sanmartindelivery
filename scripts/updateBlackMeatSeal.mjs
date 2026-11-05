import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { get, onValue, ref, runTransaction } from 'firebase/database';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase } from './firebaseScriptAuth.mjs';

// Asset-only migration. Deploy the PNG before applying; never rewrite the campaign.
const campaignPath = 'storeProductPromotions/black_meat_november_2026';
const oldImage = '/tienda/promotions/black-meat-november-2026.jpg';
const newImage = '/tienda/promotions/black-meat-november-2026-transparent.png';
try {
  await ensureAuthenticatedFirebaseSession();
  const db = getAuthenticatedFirebaseDatabase();
  const before = (await get(ref(db, campaignPath))).val();
  assert.ok(before?.id === 'black_meat_november_2026', 'Expected campaign not found');
  assert.ok([oldImage, newImage].includes(before.sealImage), 'Seal changed concurrently; inspect first');
  if (!process.argv.includes('--apply')) {
    console.log(JSON.stringify({ campaign: before.id, current: before.sealImage, next: newImage, write: false }));
    process.exit(0);
  }
  const response = await fetch(`https://tienda.sanmartinsr.com${newImage}`);
  assert.ok(response.ok && response.headers.get('content-type')?.includes('image/png'), 'PNG must be deployed first');
  assert.ok(Buffer.from(await response.arrayBuffer()).equals(await readFile(new URL(`../public${newImage}`, import.meta.url))), 'Deployed PNG does not match');
  await mkdir('output/promotion-backups', { recursive: true });
  await writeFile(`output/promotion-backups/black-meat-seal-before-${Date.now()}.json`, JSON.stringify(before, null, 2));
  if (before.sealImage !== newImage) {
    const sealRef = ref(db, `${campaignPath}/sealImage`);
    let unsubscribe;
    try {
      // Keep the scalar cached: a transaction can otherwise first receive null
      // even after get(parent), causing a safe conditional update to abort.
      await new Promise((resolve, reject) => {
        unsubscribe = onValue(sealRef, () => resolve(), reject);
      });
      const result = await runTransaction(sealRef, current =>
        current === oldImage ? newImage : undefined, { applyLocally: false });
      assert.ok(result.committed, 'Seal changed concurrently: no overwrite performed');
    } finally {
      unsubscribe?.();
    }
  }
  const after = (await get(ref(db, campaignPath))).val();
  assert.equal(after.sealImage, newImage);
  assert.deepEqual({ ...after, sealImage: oldImage }, { ...before, sealImage: oldImage }, 'Other campaign data changed concurrently; inspect');
  console.log('Verified: transparent seal published; prices, products, branches, status and dates unchanged.');
  process.exit(0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
