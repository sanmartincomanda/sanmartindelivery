import assert from 'node:assert/strict';
import {
  buildOrderTraceSummary,
  buildOrderTraceTimeline,
  filterOrderTraceHistory,
  getOrderTraceStatusKey,
} from '../src/services/orderTraceability.js';

const orders = [
  {
    firebaseKey: '2026-09-05-1',
    id: 1,
    fecha: '2026-09-05',
    canal: 'tienda_virtual',
    estado: 'Entregado',
    cliente: 'Cliente Uno',
    cocinero: 'Carnicero Uno',
    repartidor: 'Driver Uno',
    timestampIngreso: '08:00',
    timestampPreparacion: '08:05',
    timestampPreparado: '08:20',
    timestampEnviado: '08:25',
    timestampEntregado: '08:45',
    storeBranchId: 'granada',
  },
  {
    firebaseKey: '2026-09-04-2',
    id: 2,
    fecha: '2026-09-04',
    canal: 'manual',
    estado: 'Cancelado',
    cliente: 'Cliente Dos',
    canceladoPor: 'Administracion',
    timestampCancelado: '10:30',
    storeBranchId: 'nindiri',
  },
  {
    firebaseKey: 'legacy-store-order',
    id: 3,
    fecha: '2026-09-03',
    canalLabel: 'Tienda Virtual',
    estado: 'Pendiente',
    cliente: 'Cliente Legacy',
  },
];

assert.equal(getOrderTraceStatusKey(orders[0]), 'delivered');
assert.equal(getOrderTraceStatusKey(orders[1]), 'canceled');

const summary = buildOrderTraceSummary(orders);
assert.deepEqual(summary, { total: 3, store: 2, manual: 1, delivered: 1 });

assert.equal(filterOrderTraceHistory(orders, { search: 'carnicero uno' }).length, 1);
assert.equal(filterOrderTraceHistory(orders, { search: 'driver uno' }).length, 1);
assert.equal(filterOrderTraceHistory(orders, { channel: 'manual' }).length, 1);
assert.equal(filterOrderTraceHistory(orders, { channel: 'store' }).length, 2);
assert.equal(filterOrderTraceHistory(orders, { branchId: 'granada' }).length, 2);
assert.equal(filterOrderTraceHistory(orders, { dateFrom: '2026-09-05' }).length, 1);

const deliveredTrace = buildOrderTraceTimeline(orders[0]);
assert.equal(deliveredTrace.length, 5);
assert.equal(deliveredTrace.find((event) => event.id === 'preparing').actor, 'Carnicero Uno');
assert.equal(deliveredTrace.find((event) => event.id === 'delivered').actor, 'Driver Uno');

const canceledTrace = buildOrderTraceTimeline(orders[1]);
assert.equal(canceledTrace.at(-1).id, 'canceled');
assert.equal(canceledTrace.at(-1).actor, 'Administracion');

console.log('Historial de reportes: filtros, responsables y trazabilidad correctos.');
