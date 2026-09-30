import assert from 'node:assert/strict';
import {
  buildRouteSanMartinDispatchUpdates,
  formatRouteSanMartinOrderNumber,
  getRouteSanMartinDispatchDate,
  getRouteSanMartinQuote,
  getRouteSanMartinSchedule,
  getRouteSanMartinShortfall,
  getRouteSanMartinSlots,
  getSendableRouteSanMartinOrders,
  isRouteSanMartinOrder,
  partitionRouteSanMartinOrders,
  ROUTE_SAN_MARTIN_MINIMUM_CORDOBAS,
  ROUTE_SAN_MARTIN_COUNTER_PATH,
  ROUTE_SAN_MARTIN_NOTICE_MS,
} from '../src/services/routeSanMartin.js';

const branch = { id: 'granada', active: true, storeLocation: { lat: 11.9299, lng: -85.956 } };
const destination = (lat) => ({ lat, lng: -85.956 });

assert.equal(getRouteSanMartinQuote({ branch, destination: destination(12.28) }).available, true);
assert.equal(getRouteSanMartinQuote({ branch, destination: destination(12.31) }).available, false);
assert.equal(getRouteSanMartinQuote({ branch, destination: null }).available, false);
assert.equal(getRouteSanMartinQuote({ branch: { ...branch, active: false }, destination: destination(12) }).available, false);
assert.equal(getRouteSanMartinQuote({ branch: { ...branch, id: 'nindiri' }, destination: destination(12) }).available, false);
assert.equal(getRouteSanMartinQuote({ branch: { ...branch, routeSanMartinRadiusKm: 80 }, destination: destination(12.31) }).available, false);
assert.equal(getRouteSanMartinQuote({ branch, destination: destination(12) }).totalFee, 0);
assert.equal(ROUTE_SAN_MARTIN_MINIMUM_CORDOBAS, 1000);
assert.equal(getRouteSanMartinShortfall(0), 1000);
assert.equal(getRouteSanMartinShortfall(999.99), 0.01);
assert.equal(getRouteSanMartinShortfall(1000), 0);
assert.equal(getRouteSanMartinShortfall(1200 - 250), 50);
assert.equal(ROUTE_SAN_MARTIN_COUNTER_PATH, 'orderCounters/rutaSanMartin');
assert.equal(formatRouteSanMartinOrderNumber(1), 'RS-0001');
assert.equal(formatRouteSanMartinOrderNumber(2), 'RS-0002');
assert.equal(formatRouteSanMartinOrderNumber(9999), 'RS-9999');
assert.equal(formatRouteSanMartinOrderNumber(10000), 'RS-10000');
assert.throws(() => formatRouteSanMartinOrderNumber(0), /secuencia/);
assert.deepEqual(
  getSendableRouteSanMartinOrders([
    { firebaseKey: 'ready-route', fulfillmentType: 'ruta_san_martin', estado: 'Preparado' },
    { firebaseKey: 'pending-route', fulfillmentType: 'ruta_san_martin', estado: 'Pendiente' },
    { firebaseKey: 'sent-route', fulfillmentType: 'ruta_san_martin', estado: 'Enviado' },
    { firebaseKey: 'ready-delivery', fulfillmentType: 'delivery', estado: 'Preparado' },
  ]).map((order) => order.firebaseKey),
  ['ready-route']
);
const dispatchUpdates = buildRouteSanMartinDispatchUpdates(
  [{ firebaseKey: 'selected-route', estado: 'Preparado' }],
  { name: 'Ruta San Martin', code: 'E-RUTA' },
  'Ruta San Martin',
  Date.parse('2026-09-30T10:00:00-06:00')
);
assert.equal(dispatchUpdates['selected-route/estado'], 'Enviado');
assert.equal(dispatchUpdates['selected-route/repartidorCodigo'], 'E-RUTA');
assert.equal(dispatchUpdates['selected-route/timestampEnviado'], '10:00');
assert.equal(Object.keys(dispatchUpdates).length, 7);
assert.equal(Object.keys(dispatchUpdates).some((path) => path.startsWith('pending-route/')), false);

const orderedAt = new Date('2026-09-30T23:45:00-06:00');
const scheduled = getRouteSanMartinSchedule(orderedAt);
assert.equal(scheduled.deliveryDate, '2026-10-01');
assert.equal(scheduled.earliestAt - orderedAt.getTime(), ROUTE_SAN_MARTIN_NOTICE_MS);
const availableSlots = getRouteSanMartinSlots(orderedAt);
assert.equal(availableSlots[0].deliveryDate, '2026-10-02');
assert.equal(availableSlots[0].label, '9:00 a.m. - 12:00 p.m.');
assert.equal(getRouteSanMartinSchedule(orderedAt, availableSlots[0].id)?.windowEndAt, availableSlots[0].endAt);
assert.equal(getRouteSanMartinSchedule(orderedAt, '2026-10-01:morning'), null);
const morningOrder = new Date('2026-09-30T08:30:00-06:00');
assert.equal(getRouteSanMartinSlots(morningOrder)[0].id, '2026-10-01:morning');
const middayOrder = new Date('2026-09-30T11:00:00-06:00');
assert.equal(getRouteSanMartinSlots(middayOrder)[0].id, '2026-10-01:afternoon');
const afternoonOrder = new Date('2026-09-30T14:00:00-06:00');
assert.equal(getRouteSanMartinSlots(afternoonOrder)[0].id, '2026-10-02:morning');
assert.equal(getRouteSanMartinDispatchDate({ fulfillmentType: 'ruta_san_martin', scheduledDeliveryDate: scheduled.deliveryDate }), '2026-10-01');
assert.equal(getRouteSanMartinDispatchDate({ fecha: '2026-09-30' }), '2026-09-30');
assert.equal(isRouteSanMartinOrder({ fulfillmentType: 'delivery' }), false);
assert.equal(isRouteSanMartinOrder({ fulfillmentLabel: 'Ruta San Martín' }), true);
assert.equal(isRouteSanMartinOrder({ deliveryPromotionType: 'ruta_san_martin' }), true);
assert.equal(isRouteSanMartinOrder({ routeSlotId: '2026-10-01:morning', scheduledDeliveryDate: '2026-10-01' }), true);
assert.equal(isRouteSanMartinOrder({ fulfillmentLabel: 'Ruta manual' }), false);
const separatedOrders = partitionRouteSanMartinOrders([
  { firebaseKey: 'delivery', fulfillmentType: 'delivery' },
  { firebaseKey: 'pickup', fulfillmentType: 'pickup' },
  { firebaseKey: 'route', fulfillmentType: 'ruta_san_martin' },
  { firebaseKey: 'legacy-route', fulfillmentLabel: 'Ruta San Martín' },
]);
assert.deepEqual(separatedOrders.delivery.map((order) => order.firebaseKey), ['delivery', 'pickup']);
assert.deepEqual(separatedOrders.route.map((order) => order.firebaseKey), ['route', 'legacy-route']);

console.log('Ruta San Martin: cobertura, costo y fecha verificados.');
