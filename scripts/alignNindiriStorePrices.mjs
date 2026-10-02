import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { get, ref, update } from 'firebase/database';
import { getStoreProductPriceForBranch } from '../src/services/storePricing.js';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const apply = process.argv.includes('--apply');
await ensureAuthenticatedFirebaseSession();
const database = getAuthenticatedFirebaseDatabase();
const catalogRef = ref(database, 'storeCatalog');
const catalog = (await get(catalogRef)).val() || {};
const overrides = Object.entries(catalog)
  .filter(([, product]) => product?.code && Number(product?.branchSettings?.nindiri?.price || 0) > 0)
  .map(([key, product]) => ({
    key,
    code: product.code,
    name: product.name,
    oldPrice: Number(product.branchSettings.nindiri.price),
    sharedPrice: getStoreProductPriceForBranch(product, 'granada'),
  }));
const differentCount = overrides.filter(({ oldPrice, sharedPrice }) => oldPrice !== sharedPrice).length;
console.log(JSON.stringify({ apply, overrides: overrides.length, differentCount, preview: overrides.filter(({ oldPrice, sharedPrice }) => oldPrice !== sharedPrice).slice(0, 10) }, null, 2));

if (apply && overrides.length > 0) {
  const backupDir = resolve('sync-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = resolve(backupDir, `nindiri-price-overrides-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(backupPath, JSON.stringify(overrides, null, 2));
  const updatedAt = Date.now();
  await update(ref(database), {
    ...Object.fromEntries(overrides.map(({ key }) => [`storeCatalog/${key}/branchSettings/nindiri/price`, null])),
    'storeCatalogMeta/updatedAt': updatedAt,
    'storeCatalogMeta/updatedAtIso': new Date(updatedAt).toISOString(),
  });
  const updatedCatalog = (await get(catalogRef)).val() || {};
  const remaining = Object.values(updatedCatalog).filter((product) => product?.code && Number(product?.branchSettings?.nindiri?.price || 0) > 0).length;
  const differentAfter = Object.values(updatedCatalog).filter((product) => product?.code &&
    getStoreProductPriceForBranch(product, 'granada') !== getStoreProductPriceForBranch(product, 'nindiri')).length;
  console.log(JSON.stringify({ backupPath, removed: overrides.length, remaining, differentAfter }));
  if (remaining > 0 || differentAfter > 0) process.exitCode = 1;
}

process.exit(process.exitCode || 0);
