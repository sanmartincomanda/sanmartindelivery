import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import {
  normalizeStoreCategoryId,
  normalizeStoreSubcategory,
  STORE_SUBCATEGORY_CANONICALS,
} from '../src/data/storeSubcategoryRules.js';

assert.equal(normalizeStoreCategoryId('CONGELADOS', 'Mariscos'), 'mariscos');
assert.equal(normalizeStoreCategoryId('congelados', 'Derivado pollo'), 'congelados');
assert.equal(normalizeStoreCategoryId('mariscos', 'Mariscos'), 'mariscos');
assert.equal(normalizeStoreSubcategory('Derivado pollo', 'congelados'), 'Otros Congelados');
assert.equal(normalizeStoreSubcategory('Mariscos', 'mariscos'), 'Mariscos');
assert.deepEqual(STORE_SUBCATEGORY_CANONICALS.congelados, ['Otros Congelados']);
assert.deepEqual(STORE_SUBCATEGORY_CANONICALS.mariscos, ['Mariscos']);

console.log('Store category structure checks passed.');

// Exercise the real stylesheet: catalog/search previously hid the main rail.
const retailStyles = readFileSync(new URL('../src/styles/storefrontRetail.css', import.meta.url), 'utf8');
for (const tab of ['home', 'catalog', 'search']) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="store-shell storefront-brand-v3 storefront-retail" data-retail-tab="${tab}">
      <div class="store-page"><main><section class="store-filters-panel">
        <nav class="store-tabs store-category-gallery" aria-label="Categorias del catalogo">
          <button class="store-chip store-category-card" data-category="todos">Todos</button>
          <button class="store-chip store-category-card" data-category="res">Res</button>
          <button class="store-chip store-category-card active" data-category="pollo" aria-pressed="true">Pollo</button>
          <button class="store-chip store-category-card" data-category="promociones">Promociones</button>
        </nav>
        <nav class="store-subtabs" aria-label="Subcategorias">
          <button class="store-chip active">Todos</button>
          <button class="store-chip">Derivado pollo</button>
        </nav>
      </section></main></div>
    </div>
  </body></html>`);
  try {
    const { document, getComputedStyle } = dom.window;
    const style = document.createElement('style');
    style.textContent = retailStyles;
    document.head.appendChild(style);
    const gallery = document.querySelector('.store-category-gallery');
    const galleryStyle = getComputedStyle(gallery);
    assert.equal(galleryStyle.display, 'flex', `${tab}: main categories must remain visible`);
    assert.equal(galleryStyle.overflowX, 'auto', `${tab}: categories must scroll horizontally`);
    assert.equal(galleryStyle.scrollSnapType, 'x proximity');
    for (const button of gallery.querySelectorAll('button')) {
      const buttonStyle = getComputedStyle(button);
      assert.notEqual(buttonStyle.display, 'none', `${tab}: every category remains available`);
      assert.ok(parseFloat(buttonStyle.minHeight) >= 44, `${tab}: category touch target`);
    }
    const subtabs = document.querySelector('.store-subtabs');
    assert.equal(getComputedStyle(subtabs).display, 'flex', `${tab}: keep subcategories below the main rail`);
    assert.ok(parseFloat(getComputedStyle(subtabs.querySelector('button')).minHeight) >= 44);
  } finally {
    dom.window.close();
  }
}
console.log('Category navigation: main rail visible in home, catalog and search; horizontal scrolling and touch targets preserved.');
