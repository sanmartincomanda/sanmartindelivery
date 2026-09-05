import assert from 'node:assert/strict';
import { buildAdminSalesReport, getReportDateRange } from '../src/services/adminReports.js';

const range = getReportDateRange(7, '2026-09-04');
const orders = [
  {
    firebaseKey: 'store-delivered',
    fecha: '2026-09-04',
    canal: 'tienda_virtual',
    estado: 'Entregado',
    total: 500,
    storeBranchId: 'granada',
    repartidor: 'Driver Uno',
    fulfillmentType: 'delivery',
    timestampIngresoMs: 1_000_000,
    timestampEntregadoMs: 2_800_000,
  },
  {
    firebaseKey: 'manual-high-total',
    fecha: '2026-09-04',
    canal: 'manual',
    estado: 'Entregado',
    total: 9_999,
    storeBranchId: 'granada',
    repartidor: 'Driver Manual',
  },
  {
    firebaseKey: 'store-canceled',
    fecha: '2026-09-04',
    canal: 'tienda_virtual',
    estado: 'Cancelado',
    total: 800,
    storeBranchId: 'granada',
  },
  {
    firebaseKey: 'store-previous',
    fecha: range.previousDateTo,
    canal: 'tienda_virtual',
    estado: 'Entregado',
    total: 250,
    storeBranchId: 'granada',
  },
];

const report = buildAdminSalesReport(orders, { ...range, branchId: 'all' });

assert.equal(report.current.totalOrders, 3, 'todos los canales cuentan en el volumen diario');
assert.equal(report.current.manualOrders, 1, 'el reporte identifica pedidos manuales');
assert.equal(report.current.sales, 500, 'manuales y cancelados no aumentan las ventas');
assert.equal(report.current.averageTicket, 500, 'el ticket usa solo ventas online validas');
assert.equal(report.drivers.length, 1, 'drivers manuales no entran en rendimiento');
assert.equal(report.drivers[0].name, 'Driver Uno');
assert.equal(report.drivers[0].averageMinutes, 30);
assert.equal(report.trends.sales, 100, 'compara ventas online contra el periodo anterior');
assert.equal(report.daily.at(-1).totalOrders, 3);
assert.equal(report.daily.at(-1).manualOrders, 1);

console.log('Reportes AdminTV: ventas online y conteo manual separados correctamente.');
