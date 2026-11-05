import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { get, ref, update } from 'firebase/database';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase } from './firebaseScriptAuth.mjs';
import { getStoreProductPriceForBranch } from '../src/services/storePricing.js';

// Explicitly approved catalog changes; dry-run unless --apply is supplied.
const items = [
  { code: '00198', before: 165, after: 151.68, discountPct: 8.07 },
  { code: '00018', before: 199, after: 191.04, discountPct: 4 },
  { code: '00047', before: 254, after: 236.22, discountPct: 7 },
  { code: '00034', before: 367, after: 348.65, discountPct: 5 },
  { code: '00036', before: 332, after: 312.08, discountPct: 6 },
];
const path = 'storeProductPromotions/black_meat_november_2026';
const campaign = {
  id: 'black_meat_november_2026',
  title: 'BLACK MEAT NOVEMBER \u{1F7E1}\u{1F969}\u26AB\uFE0F',
  branchIds: ['granada', 'nindiri'],
  sealImage: '/tienda/promotions/black-meat-november-2026-transparent.png',
  productCodes: items.map(item => item.code),
  productDiscounts: items.map(({code, discountPct}) => ({code, discountPct})),
  discountPct: 0, active: true, deleted: false, sortOrder: 0,
  startsAt: '2026-11-01T06:00:00.000Z', endsAt: '2026-12-01T06:00:00.000Z',
};
try {
  await ensureAuthenticatedFirebaseSession();
  const db = getAuthenticatedFirebaseDatabase();
  const previous = (await get(ref(db, path))).val();
  assert.equal(previous, null, 'Campaign already exists: inspect instead of overwriting.');
  const backup = { campaign: previous, products: {} };
  const updates = { [path]: campaign };
  for (const item of items) {
    const product = (await get(ref(db, `storeCatalog/${item.code}`))).val();
    assert.ok(product?.active && product.image, `Unavailable product ${item.code}`);
    backup.products[item.code] = product;
    const current = getStoreProductPriceForBranch(product, 'granada');
    assert.ok(current === item.before || (item.code === '00198' && current === 158), `Unexpected price ${item.code}: ${current}`);
    assert.equal(Number((item.before * (1 - item.discountPct / 100)).toFixed(2)), item.after);
    console.log(JSON.stringify({ ...item, name: product.name, current }));
  }
  updates['storeCatalog/00198/price'] = 165;
  updates['storeCatalog/00198/sync/overrides/price'] = true;
  for (const branch of ['granada','nindiri']) {
    updates[`storeCatalog/00198/branchSettings/${branch}/price`] = 165;
  }
  const branchPath = 'storeCatalog/00036/branchSettings/nindiri';
  updates[`${branchPath}/active`] = true;
  updates[`${branchPath}/inactiveReason`] = '';
  updates[`${branchPath}/salesWindowDays`] = 0;
  updates[`${branchPath}/lastSalesCheckAt`] = 0;
  updates[`${branchPath}/updatedAt`] = Date.now();
  updates[`${branchPath}/updatedBy`] = 'admin:black-meat-november-approved';
  // Clients compare this revision before downloading catalog changes. Publish
  // the signal atomically with prices so a new discount cannot reuse old prices.
  const catalogUpdatedAt = Date.now();
  updates['storeCatalogMeta/updatedAt'] = catalogUpdatedAt;
  updates['storeCatalogMeta/updatedAtIso'] = new Date(catalogUpdatedAt).toISOString();
  if (!process.argv.includes('--apply')) {
    console.log('DRY RUN: no writes. Campaign and approved changes validated.');
    process.exit(0);
  }
  assert.ok(Date.now() < Date.parse(campaign.endsAt), 'Campaign already expired.');
  const response = await fetch(`https://tienda.sanmartinsr.com${campaign.sealImage}`);
  assert.ok(response.ok && response.headers.get('content-type')?.includes('image'), 'Deploy seal first.');
  const deployed = Buffer.from(await response.arrayBuffer());
  assert.ok(deployed.equals(await readFile(new URL(`../public${campaign.sealImage}`, import.meta.url))), 'Deployed seal mismatch.');
  await mkdir('output/promotion-backups', { recursive: true });
  await writeFile(`output/promotion-backups/black-meat-before-${Date.now()}.json`, JSON.stringify(backup, null, 2));
  // One atomic multi-location write prevents publishing a discount on old prices.
  await update(ref(db), updates);
  const saved = (await get(ref(db, path))).val();
  assert.deepEqual(saved, campaign);
  assert.equal((await get(ref(db, 'storeCatalogMeta/updatedAt'))).val(), catalogUpdatedAt);
  for (const item of items) {
    const product = (await get(ref(db, `storeCatalog/${item.code}`))).val();
    for (const branch of campaign.branchIds) {
      assert.equal(getStoreProductPriceForBranch(product, branch), item.before);
      assert.notEqual(product.branchSettings?.[branch]?.active, false);
    }
  }
  console.log('PUBLISHED: all five regular prices and branch availability verified.');
  process.exit(0);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
