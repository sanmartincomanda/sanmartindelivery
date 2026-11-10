import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { get, ref, update } from 'firebase/database';
import { ensureAuthenticatedFirebaseSession, getAuthenticatedFirebaseDatabase } from './firebaseScriptAuth.mjs';
await ensureAuthenticatedFirebaseSession();
const campaign = ref(getAuthenticatedFirebaseDatabase(), 'storePopupAds/hueso_corriente_caja_nov_2026');
try {
  const before = (await get(campaign)).val();
  assert.equal(before?.targetProductCode, 'BOX_7f2a4f25-28c4-4095-90bc-d5920faa263b');
  assert.equal(before.active, true);
  const patch = { maxViewsPerUser: 10, oncePerDay: true, dailyLimitStartedAt: before.dailyLimitStartedAt || new Date().toISOString() };
  console.log(JSON.stringify({ apply: process.argv.includes('--apply'), patch }));
  if (process.argv.includes('--apply')) {
    await mkdir('tmp', { recursive: true });
    await writeFile(`tmp/hueso-frequency-before-${Date.now()}.json`, JSON.stringify(before, null, 2));
    await update(campaign, patch);
    const after = (await get(campaign)).val();
    assert.deepEqual(after, { ...before, ...patch }, 'Only frequency fields may change');
    console.log('Verified: maximum 10, once per Managua day; image, target and campaign preserved.');
  }
  process.exit(0);
} catch (error) { console.error(error.message); process.exit(1); }
