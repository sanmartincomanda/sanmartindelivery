import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { get, ref, update } from 'firebase/database';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase } from './firebaseScriptAuth.mjs';
import { getStoreProductPriceForBranch } from '../src/services/storePricing.js';
import { getStoreProductPromotionDiscountPct } from '../src/services/storeProductPromotionCore.js';

// Repair only the invalidation signal omitted by the original publication.
try {
  await ensureAuthenticatedFirebaseSession();
  const db = getAuthenticatedFirebaseDatabase();
  const campaignPath = 'storeProductPromotions/black_meat_november_2026';
  const campaign = (await get(ref(db, campaignPath))).val();
  assert.ok(campaign?.active && !campaign.deleted, 'Expected active campaign');
  const expected = { '00198': [165,151.68], '00018': [199,191.04], '00047': [254,236.22], '00034': [367,348.65], '00036': [332,312.08] };
  const products = {};
  for (const [code, [before, after]] of Object.entries(expected)) {
    const product = (await get(ref(db, `storeCatalog/${code}`))).val();
    products[code] = product;
    for (const branch of ['granada','nindiri']) {
      const price = getStoreProductPriceForBranch(product, branch);
      assert.equal(price, before, `Unexpected regular price ${code}/${branch}`);
      assert.equal(Number((price * (1 - getStoreProductPromotionDiscountPct(campaign, code) / 100)).toFixed(2)), after);
    }
  }
  const previous = (await get(ref(db, 'storeCatalogMeta'))).val() || {};
  const updatedAt = Math.max(Date.now(), Number(previous.updatedAt || 0) + 1);
  const patch = { updatedAt, updatedAtIso: new Date(updatedAt).toISOString() };
  console.log(JSON.stringify({previousRevision: previous.updatedAt, nextRevision: updatedAt, prices: expected}));
  if (!process.argv.includes('--apply')) { console.log('DRY RUN: no writes.'); process.exit(0); }
  await mkdir('output/promotion-backups', {recursive:true});
  await writeFile(`output/promotion-backups/black-meat-cache-before-${updatedAt}.json`, JSON.stringify({meta:previous,campaign,products}, null, 2));
  await update(ref(db, 'storeCatalogMeta'), patch);
  assert.deepEqual((await get(ref(db, 'storeCatalogMeta'))).val(), {...previous,...patch});
  assert.deepEqual((await get(ref(db, campaignPath))).val(), campaign, 'Campaign changed concurrently');
  for (const [code, product] of Object.entries(products)) {
    assert.deepEqual((await get(ref(db, `storeCatalog/${code}`))).val(), product, `Product ${code} changed concurrently`);
  }
  console.log('Catalog invalidation repaired. All five products and the campaign remain unchanged.');
  process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
