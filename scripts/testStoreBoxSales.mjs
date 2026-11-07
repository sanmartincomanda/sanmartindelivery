import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildBoxCatalogProduct, boxOrderItem, resolveBoxAvailability, validateBoxCart } from '../src/services/storeBoxSales.js';
import { buildStoreCheckoutItems, resolveStoreDiscountBenefit } from '../src/services/storeDiscounts.js';
import { getStoreProductPriceForBranch } from '../src/services/storePricing.js';
const source = { code: 'TEST-CORBATA', name: 'Corbata', unit: 'lb', price: 160, active: true, inventory: 100 };
const form = { name: 'Corbata por caja', poundsPerBox: 30, pricePerPound: 146, image: '/caja.jpg', active: true, branchIds: ['granada', 'nindiri'] };
const product = buildBoxCatalogProduct(form, source, null, 'test');
const cart = count => ({ codigo: product.code, nombre: product.name, cantidad: count, unidad: product.unit,
  precioUnitario: product.price, precioUnitarioOriginal: product.price, subtotal: product.price * count, boxSale: product.boxSale });
assert.equal(product.price, 4380);
assert.equal(product.unit, 'caja');
assert.equal(product.minQuantity, 1);
assert.equal(product.quantityStep, 1);
assert.equal(source.price, 160, 'Loose-cut price unchanged');
assert.equal(product.boxSale.sourceCode, source.code);
assert.notEqual(product.code, source.code, 'Distinct cart identities');
assert.equal(buildBoxCatalogProduct(form, source, product, 'ignored').code, product.code);
assert.notEqual(buildBoxCatalogProduct(form, source, null, 'second').code, product.code);
for (const n of [1, 2, 3, 10]) {
  const orderItem = boxOrderItem(cart(n));
  assert.equal(orderItem.codigo, source.code);
  assert.equal(orderItem.cantidad, n * 30);
  assert.equal(orderItem.precioUnitario, 146);
  assert.equal(orderItem.subtotal, n * 4380);
  assert.equal(orderItem.precioFijo, true);
  assert.equal(orderItem.ventaPorCaja.boxes, n);
  assert.ok(orderItem.descripcion.includes(`${n * 30} lb en total`));
  assert.deepEqual(boxOrderItem(orderItem), orderItem, 'Never convert twice');
}
for (const quantity of [0, -1, 1.5, NaN, Infinity, 10001]) assert.throws(() => boxOrderItem(cart(quantity)));
for (const poundsPerBox of [0, -30, .3, Infinity, 'bad']) assert.throws(() => buildBoxCatalogProduct({...form, poundsPerBox}, source, null, 'test'));
for (const pricePerPound of [0, -146, Infinity, 146.123]) assert.throws(() => buildBoxCatalogProduct({...form, pricePerPound}, source, null, 'test'));
assert.throws(() => buildBoxCatalogProduct({...form, poundsPerBox: .5, pricePerPound: 146.01}, source, null, 'test'), /centavos/);
assert.throws(() => buildBoxCatalogProduct({...form, image: ''}, source, null, 'test'), /foto/);
assert.throws(() => buildBoxCatalogProduct(form, {...source, unit:'unidad'}, null, 'test'));
assert.throws(() => buildBoxCatalogProduct(form, product, null, 'test'));
assert.equal(resolveBoxAvailability(product, source).inventory, 3);
assert.equal(resolveBoxAvailability(product, {...source, inventory:29}).active, false);
assert.equal(resolveBoxAvailability(product, {...source, active:false}).active, false);
assert.equal(resolveBoxAvailability(product, null).active, false);
assert.equal(resolveBoxAvailability({...product, boxSale:{}}, source).active, false);
validateBoxCart([cart(3)], [product,source]);
assert.throws(() => validateBoxCart([cart(4)], [product,source]), /suficientes/);
assert.throws(() => validateBoxCart([cart(3),{codigo:source.code,cantidad:11}], [product,source]), /suficientes/);
assert.throws(() => validateBoxCart([cart(1)], [{...product,active:false},source]), /disponible/);
assert.throws(() => validateBoxCart([cart(1)], [{...product,boxSale:{...product.boxSale,pricePerPound:147}},source]), /Cambió/);
assert.throws(() => boxOrderItem({...cart(1),precioUnitario:1}), /precio/);
for (const branch of ['granada','nindiri']) assert.equal(getStoreProductPriceForBranch({...product,branchSettings:{granada:{price:9}}},branch),4380);
for (const benefit of [{}, {usesPromotionalPrices:true}, resolveStoreDiscountBenefit({items:[cart(2)],couponDiscount:50})]) {
  const item = buildStoreCheckoutItems([cart(2)],benefit)[0];
  assert.equal(boxOrderItem(item).subtotal,8760);
}
assert.deepEqual(boxOrderItem({codigo:'NORMAL',cantidad:1,precioUnitario:150}),{codigo:'NORMAL',cantidad:1,precioUnitario:150});
// Exercise the existing bridge's pure merger without starting its sync service.
const bridge = await readFile(new URL('./sicarQuoteSync.mjs',import.meta.url),'utf8');
const marker = 'const mergeDuplicateQuoteDetailItems = ';
const start = bridge.indexOf(marker) + marker.length;
assert.ok(start >= marker.length);
const end = bridge.indexOf('\n};',start) + 2;
const merge = vm.runInNewContext(`(${bridge.slice(start,end)})`,{
  roundMoney:n=>Number(Number(n||0).toFixed(2)),
  roundQuantity:n=>Number(Number(n||0).toFixed(3)),
  roundRate:n=>Number(Number(n||0).toFixed(6)),
  normalizeCode:n=>String(n??'').trim(),normalizeText:n=>String(n??'').trim(),
  formatStoreQuantityLabel:n=>String(n),
});
const detail = (quantity,price) => ({code:source.code,artId:999,sourceType:'order',quantity,
  importeCompra:quantity*100,importeNorSin:quantity*160,importeNorCon:quantity*160,
  importeSin:quantity*price,importeCon:quantity*price,order:1,impIds:[]});
for (const [boxCount,loosePounds] of [[2,10],[3,1],[1,0]]) {
  const merged = merge([detail(boxCount*30,146),...(loosePounds?[detail(loosePounds,160)]:[])]);
  assert.equal(merged.length,1);
  assert.equal(merged[0].quantity,boxCount*30+loosePounds);
  assert.equal(merged[0].importeCon,boxCount*4380+loosePounds*160);
}
console.log('PASS boxes: 1/2/3 boxes, lb conversion, exact totals, mixed stock, identity, fixed pricing, branches, stale data, malformed input and normal items.');
