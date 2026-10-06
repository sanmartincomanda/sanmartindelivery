import assert from 'node:assert/strict';
import { GOOGLE_PLAY_STORE_URL, RETAIL_EDITORIAL_TARGETS, isRetailBurgerProduct, isRetailBurgerSearch, isRetailGoldSection } from '../src/components/storefront/retailEditorial.js';

assert.equal(new URL(GOOGLE_PLAY_STORE_URL).searchParams.get('id'), 'com.sanmartinsr.app');
assert.equal(new URL(GOOGLE_PLAY_STORE_URL).origin, 'https://play.google.com');
assert.deepEqual(RETAIL_EDITORIAL_TARGETS.cuts, { targetCategory: 'res', targetSubcategory: 'Linea Gold' });
assert.deepEqual(RETAIL_EDITORIAL_TARGETS.grill, { targetCategory: 'res', targetSubcategory: 'Linea Parrillera' });
assert.ok(isRetailGoldSection({ category: 'res', subcategory: 'linea gold' }));
assert.ok(isRetailGoldSection({ targetCategory: 'res', targetSubcategory: 'Línea Gold' }));
assert.equal(isRetailGoldSection({ category: 'res', subcategory: 'Linea Diaria' }), false);
assert.equal(isRetailGoldSection({ category: 'cerdo', subcategory: 'Linea Gold' }), false);

for (const name of ['TORTA CASERA (2U-2.66OZ) (G)', 'TORTAS DE CARNE SABOR CHIMICHURRI (G)', 'TORTA CARNE SABOR BACON CHEDDAR', 'TORTA CASERA SN/ADIT 1UND (G)', 'Hamburguesas de res']) {
  for (const subcategory of ['Linea Practica y Tortas Hamburguesa', 'Tortas de Carne', 'Otros']) {
    assert.ok(isRetailBurgerProduct({ name, category: 'res', subcategory }), name);
  }
}
for (const name of ['CUBOS DE RES GF (E)', 'FAJITAS DE RES (E)', 'MOLIDA GF 75/25', 'CARNE PARA BIRRIA']) {
  assert.equal(isRetailBurgerProduct({ name, category: 'res', subcategory: 'Linea Practica y Tortas Hamburguesa' }), false, name);
}
for (const product of [
  { category: 'abarroteria', name: 'PAN HAMBURGUESA BIMBO 4PZ (G)' },
  { category: 'pollo', name: 'TORTAS DE POLLO (G)' },
  { category: 'mariscos', name: 'TORTAS DE PESCADO (G)' },
  {},
]) assert.equal(isRetailBurgerProduct(product), false);
for (const query of ['Hamburguesas', 'HAMBURGUESA', '  hamburguesas  ']) assert.ok(isRetailBurgerSearch(query));
for (const query of ['', 'pollo', 'tortas', 'carne para hamburguesas']) assert.equal(isRetailBurgerSearch(query), false);
console.log('Storefront editorial: Play URL, Gold/Parrillera targets, section placement and exact burger matching passed.');
