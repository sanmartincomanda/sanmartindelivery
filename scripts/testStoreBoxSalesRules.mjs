import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, set, update } from 'firebase/database';
import { buildBoxCatalogProduct, boxOrderItem, linkMixedBoxLines } from '../src/services/storeBoxSales.js';
import { catalogBoxValidation, catalogComponentRules, orderBoxValidation, orderBoxLineKeyRules } from './mixedBoxRuleExpressions.mjs';
const namespace = 'demo-box-sales';
const base = 'http://127.0.0.1:19000';
const admin = async (route, body) => {
  const response = await fetch(`${base}/${route}.json?ns=${namespace}`, {
    method:'PUT', headers:{Authorization:'Bearer owner','Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  assert.ok(response.ok, await response.text());
};
const rules=JSON.parse(await readFile('firebase.database.rules.json','utf8'));
assert.equal(rules.rules.storeCatalog.$productId['.validate'],catalogBoxValidation);
assert.deepEqual(rules.rules.storeCatalog.$productId.boxSale.components,catalogComponentRules);
assert.equal(rules.rules.orders.$orderId.items.$itemId['.validate'],orderBoxValidation);
assert.deepEqual(rules.rules.orders.$orderId.items.$itemId.ventaPorCaja.lineKeys,orderBoxLineKeyRules);
await admin('.settings/rules',rules);
const source = {code:'001',name:'Corbata',unit:'lb',price:160,active:true,inventory:100};
const product = buildBoxCatalogProduct({name:'Corbata por caja',poundsPerBox:30,pricePerPound:146,image:'/caja.jpg',active:true,branchIds:['granada','nindiri']},source,null,'test');
const diezmillo = {code:'00476',name:'DIEZMILLO (E)',unit:'lb',price:180,active:true,inventory:100};
const posta = {code:'002',name:'Posta',unit:'lb',price:170,active:true,inventory:100};
const lomo = {...source,code:'003',name:'Lomo'};
const puyazo = {...source,code:'004',name:'Puyazo'};
const allSources=[source,diezmillo,posta,lomo,puyazo];
await admin('', {userRoles:{buyer:{role:'client'},manager:{role:'admin'},service:{role:'service',branchId:'granada'},branch:{role:'branch_admin',branchId:'granada'}},storeCatalog:Object.fromEntries(allSources.map(s=>[s.code,s]))});
const apps=[];
const db = uid => {
  const app = initializeApp({projectId:namespace,databaseURL:`https://${namespace}.firebaseio.com`},uid); apps.push(app);
  const value=getDatabase(app); connectDatabaseEmulator(value,'127.0.0.1',19000,{mockUserToken:{sub:uid,user_id:uid}}); return value;
};
const buyer=db('buyer'), manager=db('manager'), service=db('service'), branch=db('branch');
let count=0;
const allow=async p=>{await p;count++;};
const deny=async p=>{await assert.rejects(p,/permission_denied|PERMISSION_DENIED/i);count++;};
const item=boxOrderItem({codigo:product.code,nombre:product.name,cantidad:2,precioUnitario:4380,boxSale:product.boxSale});
const order=(line=item,branch='granada')=>({canal:'tienda_virtual',storeUserKey:'buyer',storeBranchId:branch,estado:'Pendiente',items:[line]});
try {
  await allow(set(ref(manager,'storeCatalog/BOX_test'),product));
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{boxDisplayOrder:1}));
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{boxDisplayOrder:0}));
  await deny(update(ref(buyer,'storeCatalog/BOX_test'),{boxDisplayOrder:1}));
  await deny(update(ref(branch,'storeCatalog/BOX_test'),{boxDisplayOrder:1}));
  await deny(update(ref(service,'storeCatalog/BOX_test'),{boxDisplayOrder:1}));
  await deny(set(ref(buyer,'storeCatalog/BOX_other'),{...product,code:'BOX_other'}));
  await deny(set(ref(manager,'storeCatalog/BOX_bad'),{...product,code:'BOX_bad',price:1}));
  // Decimal pound prices must not fail because IEEE-754 multiplication has dust.
  for (const [index, [poundsPerBox, pricePerPound]] of [[30,140.01],[20,140.04],[25,140.02],[35,140.16],[40,140.08],[50,140.11],[30.5,140.02],[16,133.3],[30,146]].entries()) {
    const boxed = buildBoxCatalogProduct({name:'Diezmillo por caja',poundsPerBox,pricePerPound,image:'/caja.jpg',active:true,branchIds:['granada','nindiri']},diezmillo,null,`decimal-${index}`);
    const path = `storeCatalog/${boxed.code}`;
    await allow(set(ref(manager,path),boxed));
    await allow(update(ref(manager,path),{name:'Diezmillo editado'}));
    for (const delta of [-0.01,0.01,-1,1]) {
      await deny(update(ref(manager,path),{price:Number((boxed.price+delta).toFixed(2))}));
    }
    await deny(update(ref(manager,path),{price:'not-a-number'}));
    await deny(update(ref(manager,path),{price:null}));
    await deny(update(ref(buyer,path),{price:boxed.price}));
    await deny(set(ref(branch,path),boxed));
    await deny(set(ref(service,path),boxed));
    for (const boxes of [1,2,3]) {
      const line = boxOrderItem({codigo:boxed.code,nombre:boxed.name,cantidad:boxes,precioUnitario:boxed.price,boxSale:boxed.boxSale});
      await allow(set(ref(buyer,`orders/decimal-${index}-${boxes}`),order(line)));
      await deny(set(ref(buyer,`orders/decimal-bad-${index}-${boxes}`),order({...line,precioUnitario:1})));
    }
  }
  await allow(set(ref(buyer,'orders/valid'),order()));
  await allow(set(ref(buyer,'orders/nindiri'),order(item,'nindiri')));
  await deny(set(ref(buyer,'orders/masaya'),order(item,'masaya')));
  for(const [key,patch] of Object.entries({price:{precioUnitario:1},weight:{cantidad:2},sku:{codigo:'002'},units:{unidad:'caja'},lock:{precioFijo:false},
    count:{ventaPorCaja:{...item.ventaPorCaja,boxes:1.5}},missing:{ventaPorCaja:{catalogCode:product.code}}})) {
    await deny(set(ref(buyer,`orders/bad-${key}`),order({...item,...patch})));
  }
  await deny(set(ref(buyer,'orders/raw-box'),order({...item,codigo:product.code,ventaPorCaja:null})));
  const mixed=buildBoxCatalogProduct({name:'Mixta familiar',type:'mixed',poundsPerBox:30,pricePerPound:146,image:'/mixed.jpg',active:true,branchIds:['granada','nindiri']},[source,diezmillo,posta],null,'mixed');
  const mixedCart=boxes=>({codigo:mixed.code,nombre:mixed.name,cantidad:boxes,precioUnitario:mixed.price,boxSale:mixed.boxSale});
  const mixedOrder=(boxes=1,branchId='granada')=>({...order(undefined,branchId),items:linkMixedBoxLines([mixedCart(boxes)].flatMap(boxOrderItem))});
  await allow(set(ref(manager,`storeCatalog/${mixed.code}`),mixed));
  await allow(update(ref(manager,`storeCatalog/${mixed.code}`),{name:'Mixta editada'}));
  await deny(set(ref(buyer,'storeCatalog/BOX_mixed-other'),{...mixed,code:'BOX_mixed-other'}));
  await deny(set(ref(branch,`storeCatalog/${mixed.code}`),mixed));
  for (const [label,components] of Object.entries({
    missing:mixed.boxSale.components.slice(0,1),
    fourth:[...mixed.boxSale.components,{...mixed.boxSale.components[0],sourceCode:'other'}],
    duplicate:[mixed.boxSale.components[0],mixed.boxSale.components[0],mixed.boxSale.components[2]],
    absent:mixed.boxSale.components.map((c,i)=>i===2?{...c,sourceKey:'absent'}:c),
    wrongSku:mixed.boxSale.components.map((c,i)=>i===1?{...c,sourceCode:'wrong'}:c),
    unnamed:mixed.boxSale.components.map((c,i)=>i===0?{...c,name:''}:c),
    nested:mixed.boxSale.components.map((c,i)=>i===0?{...c,sourceKey:product.code,sourceCode:product.code}:c),
  })) {
    await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{'boxSale/components':components}));
  }
  await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{price:2920,'boxSale/poundsPerBox':20}));
  await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{price:1}));
  await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{'boxSale/type':'invalid'}));
  await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{'boxSale/sourceCode':'001'}));
  await deny(update(ref(manager,`storeCatalog/${mixed.code}/boxSale/components`),{'0':null}));
  await deny(update(ref(manager,`storeCatalog/${mixed.code}`),{'boxSale/components':null}));
  for (const boxes of [1,2,3]) {
    for (const branchId of ['granada','nindiri']) await allow(set(ref(buyer,`orders/mixed-${boxes}-${branchId}`),mixedOrder(boxes,branchId)));
  }
  await deny(set(ref(buyer,'orders/mixed-masaya'),mixedOrder(1,'masaya')));
  for (const [label,change] of Object.entries({
    incomplete:o=>{o.items.pop();},
    onlyOne:o=>{o.items=o.items.slice(0,1);},
    price:o=>{o.items[0].precioUnitario=1;},
    weight:o=>{o.items[1].cantidad=9;},
    sku:o=>{o.items[2].codigo='001';},
    duplicate:o=>{o.items[2]=structuredClone(o.items[1]);},
    raw:o=>{o.items=[mixedCart(1)];},
    units:o=>{o.items[0].unidad='caja';},
    lock:o=>{o.items[0].precioFijo=false;},
    fraction:o=>{o.items.forEach(i=>{i.cantidad=15;i.ventaPorCaja.boxes=1.5;});},
    zero:o=>{o.items.forEach(i=>{i.cantidad=0;i.ventaPorCaja.boxes=0;});},
    noLinks:o=>{delete o.items[0].ventaPorCaja.lineKeys;},
    wrongLinks:o=>{o.items[0].ventaPorCaja.lineKeys['2']='99';},
    noGroup:o=>{delete o.items[0].ventaPorCaja.groupId;},
    wrongGroup:o=>{o.items[1].ventaPorCaja.groupId='other';},
    wrongIndex:o=>{o.items[0].ventaPorCaja.componentIndex='3';},
    priceMetadata:o=>{o.items[0].ventaPorCaja.pricePerPound=1;},
    weightMetadata:o=>{o.items[1].ventaPorCaja.poundsPerComponent=9;},
    wrongType:o=>{o.items[0].ventaPorCaja.type='single';},
    noMetadata:o=>{delete o.items[0].ventaPorCaja;},
  })) {
    const payload=structuredClone(mixedOrder());change(payload);
    await deny(set(ref(buyer,`orders/mixed-bad-${label}`),payload));
  }
  const multi={...order(),items:linkMixedBoxLines([mixedCart(1),{codigo:source.code,nombre:source.name,cantidad:2,unidad:'lb',precioUnitario:160},mixedCart(2),item].flatMap(boxOrderItem))};
  await allow(set(ref(buyer,'orders/mixed-multiple-groups'),multi));
  const overlapping=structuredClone(multi);
  overlapping.items[4].ventaPorCaja.lineKeys={'0':'4','1':'1','2':'2'};
  await deny(set(ref(buyer,'orders/mixed-overlap'),overlapping));
  for(const sku of ['001','00476','002']) {
    await allow(update(ref(manager,`storeCatalog/${sku}`),{active:false}));
    await deny(set(ref(buyer,`orders/mixed-inactive-${sku}`),mixedOrder()));
    await allow(update(ref(manager,`storeCatalog/${sku}`),{active:true,'branchSettings/granada/active':false}));
    await deny(set(ref(buyer,`orders/mixed-branch-${sku}`),mixedOrder()));
    await allow(update(ref(manager,`storeCatalog/${sku}`),{'branchSettings/granada/active':true}));
  }
  await allow(update(ref(manager,`storeCatalog/${mixed.code}`),{price:4410,'boxSale/pricePerPound':147}));
  await deny(set(ref(buyer,'orders/mixed-stale-price'),mixedOrder()));
  await allow(update(ref(manager,`storeCatalog/${mixed.code}`),{price:4380,'boxSale/pricePerPound':146,active:false}));
  await deny(set(ref(buyer,'orders/mixed-paused'),mixedOrder()));
  await allow(update(ref(service,'orders/mixed-1-granada'),{estado:'Enviado','items/0/cantidad':10.5}));
  for(const count of [2,3,4,5]) {
    const selected=allSources.slice(0,count);
    const boxed=buildBoxCatalogProduct({name:`Mixta ${count}`,type:'mixed',poundsPerBox:30,pricePerPound:146,image:'/mixed.jpg',active:true,branchIds:['granada','nindiri']},selected,null,`mixed-${count}`);
    const path=`storeCatalog/${boxed.code}`;
    const payload=(boxes=1)=>({...order(),items:linkMixedBoxLines([{codigo:boxed.code,nombre:boxed.name,cantidad:boxes,precioUnitario:boxed.price,boxSale:boxed.boxSale}].flatMap(boxOrderItem))});
    await allow(set(ref(manager,path),boxed));
    for(const boxes of [1,2,3]) await allow(set(ref(buyer,`orders/count-${count}-${boxes}`),payload(boxes)));
    for(const [label,change] of Object.entries({
      missingLast:o=>{o.items.pop();},
      weightLast:o=>{o.items.at(-1).cantidad+=0.5;},
      priceLast:o=>{o.items.at(-1).precioUnitario=1;},
      lastSku:o=>{o.items.at(-1).codigo=source.code;},
      badIndex:o=>{o.items.at(-1).ventaPorCaja.componentIndex='5';},
      extraLink:o=>{o.items.forEach(line=>{line.ventaPorCaja.lineKeys[String(count)]='99';});},
      mismatch:o=>{o.items.at(-1).ventaPorCaja.boxes=2;},
      group:o=>{o.items.at(-1).ventaPorCaja.groupId='other';},
    })) {
      const invalid=payload();change(invalid);
      await deny(set(ref(buyer,`orders/count-${count}-bad-${label}`),invalid));
    }
    for(const i of selected.keys()) {
      await allow(update(ref(manager,`storeCatalog/${selected[i].code}`),{active:false}));
      await deny(set(ref(buyer,`orders/count-${count}-inactive-${i}`),payload()));
      await allow(update(ref(manager,`storeCatalog/${selected[i].code}`),{active:true,'branchSettings/granada/active':false}));
      await deny(set(ref(buyer,`orders/count-${count}-branch-${i}`),payload()));
      await allow(update(ref(manager,`storeCatalog/${selected[i].code}`),{'branchSettings/granada/active':true}));
    }
    const parts=boxed.boxSale.components;
    await deny(update(ref(manager,path),{'boxSale/components':{...parts,[count-1]:parts[0]}}));
    await deny(update(ref(manager,path),{'boxSale/components':{...parts,1:null}}));
    await deny(update(ref(manager,path),{'boxSale/components':{...parts,5:parts[0]}}));
    await deny(update(ref(manager,path),{'boxSale/components':{...parts,extra:parts[0]}}));
    // Equal shares cannot introduce half-cent rounding differences at checkout.
    if(count===2 || count===4) await deny(update(ref(manager,path),{'boxSale/poundsPerBox':count/2,'boxSale/pricePerPound':146.01,price:count/2*146.01}));
    const resized=buildBoxCatalogProduct({...boxed,...boxed.boxSale,type:'mixed',branchIds:['granada','nindiri']},allSources.slice(0,count===5?2:count+1),boxed);
    await allow(set(ref(manager,path),resized));
    await deny(set(ref(buyer,`orders/count-${count}-stale-size`),payload()));
    await allow(update(ref(service,`orders/count-${count}-1`),{estado:'Enviado'}));
  }
  const untouched=JSON.parse(await readFile('firebase.database.rules.json','utf8'));
  assert.equal(untouched.rules.orders.$orderId['.write'],rules.rules.orders.$orderId['.write']);
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{active:false}));
  await deny(set(ref(buyer,'orders/paused'),order()));
  await allow(update(ref(service,'orders/valid'),{estado:'Enviado'}));
  await allow(set(ref(buyer,'orders/normal'),order({codigo:'001',nombre:'Corbata',cantidad:1,precioUnitario:160,unidad:'lb'})));
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{active:true}));
  await allow(update(ref(manager,'storeCatalog/001'),{active:false}));
  await deny(set(ref(buyer,'orders/source-paused'),order()));
  console.log(`PASS: ${count} emulator checks. No production data modified.`);
} finally { for(const app of apps) await deleteApp(app); }
