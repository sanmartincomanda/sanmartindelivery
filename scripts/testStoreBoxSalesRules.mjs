import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getDatabase, connectDatabaseEmulator, ref, set, update } from 'firebase/database';
import { buildBoxCatalogProduct, boxOrderItem } from '../src/services/storeBoxSales.js';
const namespace = 'demo-box-sales';
const base = 'http://127.0.0.1:19000';
const admin = async (route, body) => {
  const response = await fetch(`${base}/${route}.json?ns=${namespace}`, {
    method:'PUT', headers:{Authorization:'Bearer owner','Content-Type':'application/json'}, body:JSON.stringify(body),
  });
  assert.ok(response.ok, await response.text());
};
await admin('.settings/rules', JSON.parse(await readFile('firebase.database.rules.json','utf8')));
const source = {code:'001',name:'Corbata',unit:'lb',price:160,active:true,inventory:100};
const product = buildBoxCatalogProduct({name:'Corbata por caja',poundsPerBox:30,pricePerPound:146,image:'/caja.jpg',active:true,branchIds:['granada','nindiri']},source,null,'test');
const diezmillo = {code:'00476',name:'DIEZMILLO (E)',unit:'lb',price:180,active:true,inventory:100};
await admin('', {userRoles:{buyer:{role:'client'},manager:{role:'admin'},service:{role:'service',branchId:'granada'},branch:{role:'branch_admin',branchId:'granada'}},storeCatalog:{'001':source,'00476':diezmillo}});
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
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{active:false}));
  await deny(set(ref(buyer,'orders/paused'),order()));
  await allow(update(ref(service,'orders/valid'),{estado:'Enviado'}));
  await allow(set(ref(buyer,'orders/normal'),order({codigo:'001',nombre:'Corbata',cantidad:1,precioUnitario:160,unidad:'lb'})));
  await allow(update(ref(manager,'storeCatalog/BOX_test'),{active:true}));
  await allow(update(ref(manager,'storeCatalog/001'),{active:false}));
  await deny(set(ref(buyer,'orders/source-paused'),order()));
  console.log(`PASS: ${count} emulator checks. No production data modified.`);
} finally { for(const app of apps) await deleteApp(app); }
