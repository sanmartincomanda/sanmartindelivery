import assert from 'node:assert/strict';
import {
  buildStoreActualQuantitiesPatch,
  formatStoreQuantityInputValue,
  getStoreDisplayItems,
  getStoreProductItems,
  getStoreRewardItems,
  parseStoreQuantityInputValue,
} from '../src/services/storeOrderEditor.js';

const order = {
  items: [
    { codigo: '00097', nombre: 'Filete de pollo', cantidad: 8, precioUnitario: 100, unidad: 'lb' },
    { codigo: '00171', nombre: 'Entrega', cantidad: 1, precioUnitario: 50, sourceType: 'delivery' },
    { nombre: 'Producto sin código', cantidad: 1, unidad: 'unidad' },
    { codigo: 'GOLD', nombre: 'Canje', cantidad: 1, sourceType: 'reward' },
  ],
  rewardRedemption: {
    rewardName: 'Miembro Gold',
    items: [{ productCode: 'GOLD', productName: 'Canje', quantity: 1 }],
  },
  descuentoCupon: 50,
  deliveryFee: 50,
  subtotalEstimado: 800,
  total: 800,
};

assert.deepEqual(getStoreDisplayItems(order).map((item) => item.nombre), ['Filete de pollo', 'Producto sin código']);
assert.deepEqual(getStoreProductItems(order).map((item) => item.codigo), ['00097']);
assert.equal(getStoreRewardItems(order)[0].nombre, 'Canje');
assert.equal(getStoreRewardItems({ items: [{ sourceType: 'reward', nombre: 'Regalía adicional', cantidad: 1 }] })[0].nombre, 'Regalía adicional');
assert.equal(parseStoreQuantityInputValue('8,5'), 8.5);
assert.equal(formatStoreQuantityInputValue(1.25), '1.25');
assert.ok(Number.isNaN(parseStoreQuantityInputValue('')));

const patch = buildStoreActualQuantitiesPatch(order, [{ ...getStoreProductItems(order)[0], cantidadReal: 7.5 }]);
assert.equal(patch.items[0].cantidadSolicitada, 8);
assert.equal(patch.items[0].cantidadReal, 7.5);
assert.equal(patch.items[0].subtotal, 750);
assert.equal(patch.subtotalEstimado, 750);
assert.equal(patch.total, 750);
assert.equal(patch.totalAproximado, false);
assert.equal(patch.sicarQuote.requestedBy, 'lista_pedidos');
assert.equal(patch.sicarQuote.customerUpdatePending, true);
assert.equal(order.items[0].cantidadReal, undefined);
assert.match(patch.pedido, /7\.5 lb Filete de pollo/);

console.log('Store order editor: OK');
