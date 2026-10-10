import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

// Scoped operational pause. Preserve the live rules, including changes not in this checkout.
const require = createRequire(import.meta.url);
const cli = process.env.FIREBASE_TOOLS_LIB || path.join(process.env.APPDATA, 'npm/node_modules/firebase-tools/lib');
const account = require(path.join(cli, 'auth.js')).getProjectDefaultAccount(process.cwd());
assert.ok(account, 'Sign in to Firebase CLI first.');
await require(path.join(cli, 'requireAuth.js')).requireAuth({
  project: 'comanda-digital-ac1ec', user: account.user, tokens: account.tokens, nonInteractive: true,
});
const db = new (require(path.join(cli, 'apiv2.js')).Client)({
  urlPrefix: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com', auth: true,
});
const local = JSON.parse(await readFile('firebase.database.rules.json', 'utf8'));
const original = (await db.get('/.settings/rules.json')).body;
const branch = (await db.get('/storeBranches/granada.json')).body;
assert.equal(branch?.id, 'granada');
const next = structuredClone(original);
const guards = [['orders', '$orderId'], ['orderCounters', '$date']];
const pauseOnly = "data.exists() || (newData.child('fulfillmentType').val() != 'ruta_san_martin' && newData.child('deliveryPromotionType').val() != 'ruta_san_martin' && !newData.child('routeSlotId').exists()) || root.child('storeBranches').child('granada').child('routeSanMartinEnabled').val() == true";
for (const [node, key] of guards) {
  const desired = local.rules[node][key]['.validate'];
  assert.ok(desired?.includes('routeSanMartinEnabled'));
  const existing = next.rules[node][key]['.validate'];
  assert.ok(existing === undefined || existing === desired || (node === 'orders' && existing === pauseOnly), `Unexpected validation at ${node}/${key}; review before changing.`);
  next.rules[node][key]['.validate'] = desired;
}
if (next.rules.routeSanMartinAuthorizations) assert.deepEqual(next.rules.routeSanMartinAuthorizations, local.rules.routeSanMartinAuthorizations);
next.rules.routeSanMartinAuthorizations = local.rules.routeSanMartinAuthorizations;
const output = path.join('tmp', 'route-pause', String(Date.now()));
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'rules-before.json'), JSON.stringify(original, null, 2));
await writeFile(path.join(output, 'branch-before.json'), JSON.stringify(branch, null, 2));
await writeFile(path.join(output, 'rules-paused.json'), JSON.stringify(next, null, 2));
if (!process.argv.includes('--apply')) {
  console.log(`Prepared ${output}/rules-paused.json. No production changes. Test this file before --apply.`);
} else {
  assert.deepEqual((await db.get('/.settings/rules.json')).body, original, 'Rules changed concurrently; retry after review.');
  await db.put('/.settings/rules.json', next);
  await db.patch('/storeBranches/granada.json', { routeSanMartinEnabled: false });
  assert.deepEqual((await db.get('/.settings/rules.json')).body, next);
  const after = (await db.get('/storeBranches/granada.json')).body;
  assert.deepEqual(after, { ...branch, routeSanMartinEnabled: false });
  console.log(`Ruta paused. Only the Granada flag and two creation guards changed. Backups: ${output}`);
}
