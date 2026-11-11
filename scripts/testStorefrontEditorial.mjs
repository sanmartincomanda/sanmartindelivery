import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { APP_STORE_URL, getHeaderAppDownload, GOOGLE_PLAY_STORE_URL, RETAIL_EDITORIAL_TARGETS, isRetailBurgerProduct, isRetailBurgerSearch, isRetailGoldSection } from '../src/components/storefront/retailEditorial.js';

assert.equal(new URL(GOOGLE_PLAY_STORE_URL).searchParams.get('id'), 'com.sanmartinsr.app');
assert.equal(new URL(GOOGLE_PLAY_STORE_URL).origin, 'https://play.google.com');
assert.equal(APP_STORE_URL, 'https://apps.apple.com/ni/app/id6832058425');
for (const device of [
  { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) CriOS/131.0 Mobile/15E148 Safari/604.1' },
  { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15' },
  { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 },
]) {
  assert.equal(getHeaderAppDownload(device).url, APP_STORE_URL);
  assert.equal(getHeaderAppDownload(device).badge, 'app-store-badge.svg');
}
for (const device of [undefined, {}, { userAgent: 'Mozilla/5.0 (Linux; Android 15)' },
  { platform: 'MacIntel', maxTouchPoints: 0 }, { platform: 'Win32', maxTouchPoints: 10 }]) {
  assert.equal(getHeaderAppDownload(device).url, GOOGLE_PLAY_STORE_URL);
}
const storefront = readFileSync(new URL('../src/components/TiendaVirtualView.jsx', import.meta.url), 'utf8');
assert.match(storefront, /<a\s+className="store-app-download-link store-app-download-link--apple"\s+href=\{APP_STORE_URL\}\s+target="_blank"\s+rel="noopener noreferrer"/);
assert.ok(!storefront.includes('store-app-download-link--upcoming'));
assert.ok(!storefront.includes('PRÓXIMAMENTE'));
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
console.log('Storefront editorial: both store URLs, active Apple link, iPhone/iPad/Android badge selection, Gold/Parrillera targets and exact burger matching passed.');
