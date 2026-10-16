import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { captureStoreOrderSource, getStoreOrderSourceLabel } from '../src/services/storeOrderSource.js';
import { getOrderTraceChannelLabel, filterOrderTraceHistory } from '../src/services/orderTraceability.js';
import { buildOriginalOrderRecord, buildArchivedOrderRecord } from '../src/services/orderArchive.js';

const runtime = (native, platform) => ({
  isNativePlatform: () => native,
  getPlatform: () => platform,
});
for (const [native, platform, expected] of [
  [true, 'android', 'android_app'],
  [true, 'ios', 'ios_app'],
  [false, 'web', 'web'],
  [false, 'android', 'web'], // Android browser or installed PWA is not the native app.
  [true, 'other', 'unknown'],
]) {
  assert.deepEqual(captureStoreOrderSource('tienda_virtual', runtime(native, platform)), { storeOrderSource: expected });
  assert.deepEqual(captureStoreOrderSource('manual', runtime(native, platform)), {});
}
assert.deepEqual(captureStoreOrderSource('tienda_virtual'), { storeOrderSource: 'web' });
const order = { canal: 'tienda_virtual', canalLabel: 'Tienda Virtual', storeOrderSource: 'android_app', fecha: '2026-10-16', total: 1000 };
assert.equal(getStoreOrderSourceLabel(order), 'APP Android');
assert.equal(getStoreOrderSourceLabel({ storeOrderSource: 'ios_app' }), 'APP iOS');
assert.equal(getStoreOrderSourceLabel({ storeOrderSource: 'web' }), 'WEB');
for (const source of [undefined, '', 'android', 'unknown', 'toString']) {
  assert.equal(getStoreOrderSourceLabel({ storeOrderSource: source }), 'Origen no registrado');
}
assert.equal(getOrderTraceChannelLabel({ canal: 'manual', storeOrderSource: 'android_app' }), 'Ingreso manual');
assert.equal(getOrderTraceChannelLabel(order), 'Tienda Virtual · APP Android');
assert.equal(getOrderTraceChannelLabel({ canal: 'tienda_virtual' }), 'Tienda Virtual · Origen no registrado');
const original = buildOriginalOrderRecord('test-order', order, 1000);
assert.equal(original.storeOrderSource, 'android_app');
assert.equal(buildArchivedOrderRecord('test-order', order).storeOrderSource, 'android_app');
assert.equal(getStoreOrderSourceLabel({ originalOrder: original }), 'APP Android');
assert.equal(getStoreOrderSourceLabel({ storeOrderSource: 'web', originalOrder: original }), 'APP Android');
assert.equal(filterOrderTraceHistory([order], { search: 'APP Android' }).length, 1);
assert.equal(filterOrderTraceHistory([order], { search: 'WEB' }).length, 0);

// Guard the real creation boundary: callers cannot set attribution via payload.
const source = readFileSync(new URL('../src/services/orders.js', import.meta.url), 'utf8');
assert.match(source, /\.\.\.captureStoreOrderSource\(channel\)/);
assert.doesNotMatch(source, /payload\.storeOrderSource/);
assert.ok(source.indexOf('...captureStoreOrderSource(channel)') < source.indexOf('const updates = {', source.indexOf('export async function createOrder')));
console.log('Store order source: runtime, manual orders, legacy orders, original snapshot, archive and search passed.');
