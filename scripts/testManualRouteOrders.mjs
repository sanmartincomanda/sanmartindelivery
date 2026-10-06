import assert from 'node:assert/strict';
import { normalizeManualRouteLocation, prepareManualRouteOrder } from '../src/services/manualRouteOrder.js';
import {
  getRouteSanMartinSlots, getRouteSanMartinSchedule, partitionRouteSanMartinOrders,
  getCarryoverRouteSanMartinOrders,
} from '../src/services/routeSanMartin.js';

const branch = {
  id: 'granada', tenantId: 'sanmartinsr', name: 'Carnes San Martin Granada',
  storeLocation: { lat: 11.9299, lng: -85.956 }, active: true, acceptingOrders: false,
};
const destination = normalizeManualRouteLocation('11.95', '-85.956');
const now = new Date('2026-10-06T15:00:00-06:00');
const input = { branch, destination, subtotal: 1000, itemCount: 1, slotId: '2026-10-07:afternoon', now };
let checks = 0;
const rejects = (override, message) => {
  assert.throws(() => prepareManualRouteOrder({ ...input, ...override }), message);
  checks += 1;
};

for (const [lat, lng] of [['', ''], ['', '-85'], ['11', ''], [' ', '-85'], ['NaN', '-85'], ['91', '-85'], ['11', '-181']]) {
  assert.equal(normalizeManualRouteLocation(lat, lng), null);
  checks += 1;
}
assert.equal(normalizeManualRouteLocation('0', '0').lat, 0);
checks += 1;

rejects({ branch: { ...branch, id: 'nindiri' } }, /Granada/);
rejects({ branch: { ...branch, id: 'masaya' } }, /Granada/);
rejects({ branch: { ...branch, active: false } }, /Granada/);
rejects({ destination: null }, /pin/);
rejects({ destination: { lat: 13, lng: -86 } }, /cobertura/);
rejects({ subtotal: 999.99 }, /minimo/);
rejects({ subtotal: 0 }, /minimo/);
rejects({ subtotal: NaN }, /minimo/);
rejects({ itemCount: 0 }, /catalogo/);
rejects({ slotId: '' }, /franja/);
rejects({ slotId: '2026-10-06:afternoon' }, /franja/);
rejects({ slotId: '2026-10-07:morning' }, /franja/);
rejects({ slotId: '2026-10-12:afternoon' }, /franja/);
rejects({ now: new Date('2026-10-06T22:00:00-06:00') }, /franja/);

const fields = prepareManualRouteOrder(input);
assert.equal(fields.fulfillmentType, 'ruta_san_martin');
assert.equal(fields.deliveryFee, 0);
assert.equal(fields.deliveryFeeBase, 0);
assert.equal(fields.deliveryFeeTax, 0);
assert.equal(fields.deliveryFree, true);
assert.equal(fields.deliveryManualWithoutPin, false);
assert.equal(fields.deliveryFeePending, false);
assert.equal(fields.storeBranchId, 'granada');
assert.equal(fields.storeBranchLocation.lat, branch.storeLocation.lat);
assert.equal(fields.deliveryPromotionType, 'ruta_san_martin');
assert.ok(fields.deliveryDistanceKm > 0 && fields.deliveryDistanceKm < 40);
assert.ok(Object.values(fields).every((value) => value !== undefined));
assert.equal('canal' in fields, false, 'the caller keeps the MANUAL channel');
assert.equal('id' in fields, false, 'only createOrder assigns the RS sequence');
checks += 14;

// Each storefront option must be accepted unchanged by the manual form adapter.
for (const time of ['08:30:00', '14:00:00', '21:59:59', '22:00:00', '23:59:59']) {
  const at = new Date(`2026-10-06T${time}-06:00`);
  for (const slot of getRouteSanMartinSlots(at)) {
    const result = prepareManualRouteOrder({ ...input, slotId: slot.id, now: at });
    const schedule = getRouteSanMartinSchedule(at, result.routeSlotId);
    assert.equal(result.routeSlotId, slot.id);
    assert.equal(result.deliveryPromotionDate, slot.deliveryDate);
    assert.equal(schedule.windowLabel, slot.label);
    assert.equal(schedule.earliestAt, slot.startAt);
    checks += 4;
  }
}

const manualRoute = { ...fields, canal: 'manual', fecha: '2026-10-06', estado: 'Pendiente', scheduledDeliveryDate: '2026-10-07' };
const delivery = { fulfillmentType: 'delivery', canal: 'manual' };
assert.deepEqual(partitionRouteSanMartinOrders([delivery, manualRoute]), { delivery: [delivery], route: [manualRoute] });
assert.deepEqual(getCarryoverRouteSanMartinOrders([manualRoute], '2026-10-08'), [manualRoute]);
assert.deepEqual(getCarryoverRouteSanMartinOrders([{ ...manualRoute, estado: 'Enviado' }], '2026-10-08').length, 1);
assert.deepEqual(getCarryoverRouteSanMartinOrders([{ ...manualRoute, estado: 'Entregado' }], '2026-10-08'), []);
checks += 4;
console.log(`Manual Ruta San Martin: ${checks} assertions passed.`);
