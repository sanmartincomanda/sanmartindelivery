import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildBoxCatalogProduct, boxOrderItem, describeBoxContents, linkMixedBoxLines, resolveBoxAvailability, validateBoxCart, validateBoxSale } from '../src/services/storeBoxSales.js';
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
const sources = [source, {...source,code:'TEST-DIEZMILLO',name:'Diezmillo',inventory:35}, {...source,code:'TEST-POSTA',name:'Posta',inventory:50}];
const mixed = buildBoxCatalogProduct({...form,type:'mixed',name:'Caja mixta'},sources,null,'mixed');
const mixedCart = count => ({...cart(count),codigo:mixed.code,nombre:mixed.name,boxSale:mixed.boxSale});
assert.equal(mixed.price,4380);
assert.equal(mixed.boxSale.type,'mixed');
assert.equal(mixed.boxSale.components.length,3);
assert.equal(mixed.boxSale.sourceCode,undefined);
assert.equal(describeBoxContents(mixed.boxSale),'10 lb de Corbata + 10 lb de Diezmillo + 10 lb de Posta');
assert.equal(describeBoxContents(mixed.boxSale,2),'20 lb de Corbata + 20 lb de Diezmillo + 20 lb de Posta');
assert.equal(describeBoxContents(product.boxSale),'');
assert.deepEqual(buildBoxCatalogProduct({...form,type:'mixed',name:'Caja mixta'},sources,mixed).boxSale,mixed.boxSale);
for (const n of [1,2,3,10]) {
  const rows = linkMixedBoxLines([mixedCart(n)].flatMap(boxOrderItem));
  assert.equal(rows.length,3);
  assert.equal(rows.reduce((sum,line)=>sum+line.cantidad,0),30*n);
  assert.equal(rows.reduce((sum,line)=>sum+line.subtotal,0),4380*n);
  for (const [i,row] of rows.entries()) {
    assert.equal(row.codigo,sources[i].code);
    assert.equal(row.nombre,sources[i].name);
    assert.equal(row.cantidad,10*n);
    assert.equal(row.precioUnitario,146);
    assert.equal(row.precioFijo,true);
    assert.equal(row.ventaPorCaja.componentIndex,String(i));
    assert.deepEqual(row.ventaPorCaja.lineKeys,{0:'0',1:'1',2:'2'});
    assert.deepEqual(boxOrderItem(row),row,'Never expand an operational line twice');
  }
  assert.deepEqual(linkMixedBoxLines(rows),rows);
}
const differentGroups = linkMixedBoxLines([cart(1),mixedCart(1),{codigo:'NORMAL',cantidad:1},mixedCart(2)].flatMap(boxOrderItem));
assert.deepEqual(differentGroups[1].ventaPorCaja.lineKeys,{0:'1',1:'2',2:'3'});
assert.deepEqual(differentGroups[5].ventaPorCaja.lineKeys,{0:'5',1:'6',2:'7'});
assert.equal(differentGroups[1].ventaPorCaja.groupId,'1');
assert.equal(differentGroups[5].ventaPorCaja.groupId,'3');
for (const count of [0,-1,1.5,NaN,Infinity,10001]) assert.throws(()=>boxOrderItem(mixedCart(count)));
for (const badSources of [[],sources.slice(0,2),[...sources,source],[source,source,sources[1]],[source,sources[1],null],[source,sources[1],product],[source,sources[1],{...sources[2],unit:'unidad'}]]) {
  assert.throws(()=>buildBoxCatalogProduct({...form,type:'mixed'},badSources,null,'bad'));
}
for (const poundsPerBox of [10,20,31,.5]) assert.throws(()=>buildBoxCatalogProduct({...form,type:'mixed',poundsPerBox},sources,null,'bad'),/tres/);
for (const poundsPerBox of [1.5,15,30,45,99]) {
  const p = buildBoxCatalogProduct({...form,type:'mixed',poundsPerBox},sources,null,'weight');
  const rows = boxOrderItem({...mixedCart(1),boxSale:p.boxSale,precioUnitario:p.price,precioUnitarioOriginal:p.price});
  assert.equal(rows[0].cantidad,poundsPerBox/3);
  assert.equal(rows.reduce((sum,row)=>sum+row.subtotal,0),p.price);
}
assert.throws(()=>validateBoxSale({...mixed.boxSale,components:[null,...mixed.boxSale.components.slice(1)]}),/SICAR/);
assert.throws(()=>validateBoxSale({...mixed.boxSale,type:'other'}));
assert.throws(()=>validateBoxSale({...mixed.boxSale,components:mixed.boxSale.components.map(c=>({...c,name:''}))}));
assert.equal(resolveBoxAvailability(mixed,sources).inventory,3);
assert.equal(resolveBoxAvailability(mixed,new Map(sources.map(p=>[p.code,p]))).inventory,3);
for (const index of [0,1,2]) {
  assert.equal(resolveBoxAvailability(mixed,sources.filter((_,i)=>i!==index)).active,false);
  assert.equal(resolveBoxAvailability(mixed,sources.map((p,i)=>i===index?{...p,active:false}:p)).active,false);
  assert.equal(resolveBoxAvailability(mixed,sources.map((p,i)=>i===index?{...p,inventory:9}:p)).active,false);
}
assert.equal(resolveBoxAvailability(mixed,sources.map(p=>({...p,inventory:null}))).inventory,null);
validateBoxCart([mixedCart(3)],[mixed,...sources]);
validateBoxCart([mixedCart(1),cart(2),{codigo:source.code,cantidad:30}],[mixed,product,...sources]);
assert.throws(()=>validateBoxCart([mixedCart(4)],[mixed,...sources]),/suficientes/);
assert.throws(()=>validateBoxCart([mixedCart(3),{codigo:sources[1].code,cantidad:6}],[mixed,...sources]),/suficientes/);
assert.throws(()=>validateBoxCart([mixedCart(1),cart(3),{codigo:source.code,cantidad:1}],[mixed,product,...sources]),/suficientes/);
assert.throws(()=>validateBoxCart([mixedCart(2),mixedCart(2)],[mixed,...sources]),/suficientes/);
const changedParts = mixed.boxSale.components.map((p,i)=>i===2?{...p,sourceCode:'TEST-NEW'}:p);
assert.throws(()=>validateBoxCart([{...mixedCart(1),boxSale:{...mixed.boxSale,components:changedParts}}],[mixed,...sources]),/Cambió/);
assert.throws(()=>validateBoxCart([{...mixedCart(1),boxSale:product.boxSale}],[mixed,...sources]),/Cambió/);
for (const benefit of [{},{usesPromotionalPrices:true},resolveStoreDiscountBenefit({items:[mixedCart(2)],couponDiscount:50})]) {
  const rows = boxOrderItem(buildStoreCheckoutItems([mixedCart(2)],benefit)[0]);
  assert.equal(rows.reduce((sum,row)=>sum+row.subtotal,0),8760);
}
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
const mixedDetails=boxOrderItem(mixedCart(2)).map((line,i)=>({...detail(line.cantidad,line.precioUnitario),code:line.codigo,artId:999+i}));
const mixedMerged=merge([...mixedDetails,detail(5,160)]);
assert.equal(mixedMerged.length,3);
assert.equal(mixedMerged.find(row=>row.code===source.code).quantity,25);
assert.equal(mixedMerged.reduce((sum,row)=>sum+row.importeCon,0),8760+800);
console.log('PASS single/mixed boxes: equal thirds, 1/2/3 boxes, exact totals, original SKUs, grouped lines, shared stock, fixed pricing, branches, stale data, invalid input and SICAR merging.');
