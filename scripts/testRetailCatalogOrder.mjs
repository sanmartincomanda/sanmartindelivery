import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderRetailCategoryProducts } from '../src/components/storefront/retailCatalogOrder.js';

const scope = { category: 'res', subcategory: 'todas' };
const line = (subcategory, prefix, count) => Array.from({ length: count }, (_, index) =>
  Object.freeze({ code: `${prefix}${index + 1}`, category: 'res', subcategory, price: 100 + index }));
const daily = line('Linea Diaria', 'D', 8);
const grill = line('Linea Parrillera', 'P', 7);
const gold = line('Linea Gold', 'G', 6);
const practical = line('Linea Practica y Tortas Hamburguesa', 'L', 4);
const special = line('Productos Especiales', 'E', 2);
const ground = line('Molida Granel', 'M', 5);
const custom = line('Nueva linea', 'N', 4);
const input = Object.freeze([...custom, ...gold, ...ground, ...daily, ...special, ...practical, ...grill]);
const options = { ...scope, subcategoryOrder: ['Linea Gold', 'Productos Especiales', 'Molida Granel', 'Linea Diaria'] };
const codes = (items) => items.map((item) => item.code);
const result = orderRetailCategoryProducts(input, options);
assert.deepEqual(codes(result), [
  'D1', 'D2', 'D3', 'P1', 'P2', 'P3', 'G1', 'G2', 'G3', 'L1', 'L2', 'L3', 'E1', 'E2', 'M1', 'M2', 'M3', 'N1', 'N2', 'N3',
  'D4', 'D5', 'D6', 'P4', 'P5', 'P6', 'G4', 'G5', 'G6', 'L4', 'M4', 'M5', 'N4',
  'D7', 'D8', 'P7',
]);
assert.equal(result.length, input.length);
assert.equal(new Set(result).size, input.length, 'Each original product appears exactly once');
for (const item of input) assert.ok(result.includes(item), 'Retain original price, stock and promotion objects');
assert.deepEqual(orderRetailCategoryProducts(input, options), result, 'Order is deterministic');
assert.deepEqual(orderRetailCategoryProducts(Object.freeze(result), options), result, 'Order is idempotent');
for (const items of [daily, grill, gold, practical, special, ground, custom]) {
  assert.deepEqual(result.filter((item) => item.subcategory === items[0].subcategory), items, 'Keep within-line order');
}
assert.deepEqual([...result.slice(0, 24), ...result.slice(24, 48)], result, 'Load more extends the same rotation');
assert.deepEqual(orderRetailCategoryProducts([], scope), []);
assert.deepEqual(orderRetailCategoryProducts(gold, scope), gold, 'Single-line catalog keeps all products');

const aliases = [
  ...line('Productos Gold', 'G', 2),
  ...line('L\u00ednea Diaria', 'D', 2),
  ...line('Linea Practica', 'L', 2),
  ...line('  L\u00ednea   Parrillera  ', 'P', 2),
  ...line('Tortas Hamburguesa', 'T', 2),
  ...line('', 'U', 1),
];
assert.deepEqual(codes(orderRetailCategoryProducts(aliases, { ...scope, subcategoryOrder: ['Linea Practica', 'Tortas Hamburguesa'] })),
  ['D1', 'D2', 'U1', 'P1', 'P2', 'G1', 'G2', 'L1', 'L2', 'T1', 'T2'], 'Normalize aliases without duplicate queues');
for (const override of [
  { category: 'todos' }, { category: 'pollo' }, { category: 'promociones' },
  { category: 'venta-por-cajas' }, { subcategory: 'Linea Gold' },
  { query: 'bistec' }, { isDashboard: true },
]) {
  assert.equal(orderRetailCategoryProducts(input, { ...scope, ...override }), input, 'Other catalog views remain untouched');
}
assert.deepEqual(orderRetailCategoryProducts(input, { ...options, query: '  ' }), result);

// Cover uneven inventories and page boundaries with many deterministic catalogs.
for (let seed = 0; seed < 30; seed++) {
  const groups = ['Linea Diaria', 'Linea Parrillera', 'Linea Gold', 'Linea Practica', 'Molida Granel', 'Otra linea']
    .map((name, index) => line(name, `${index}-`, (seed * (index + 3) + index) % 17));
  const products = groups.flat().reverse();
  const ordered = orderRetailCategoryProducts(products, { ...scope, subcategoryOrder: ['Molida Granel', 'Otra linea'] });
  const expected = [];
  for (let offset = 0; offset < 17; offset += 3) {
    for (const group of groups) expected.push(...[...group].reverse().slice(offset, offset + 3));
  }
  assert.deepEqual(ordered, expected);
  assert.equal(new Set(ordered).size, products.length);
}

const source = readFileSync(new URL('../src/components/TiendaVirtualView.jsx', import.meta.url), 'utf8');
assert.match(source, /return orderRetailCategoryProducts\(matchingProducts,\s*\{\s*category: activeCategory,/);
assert.match(source, /subcategoryOrder: orderedSubcategoryOptions/);
assert.match(source, /isDashboard, orderedSubcategoryOptions\]\)/);
assert.ok(source.indexOf('return orderBoxProductsForDisplay(matchingProducts)') < source.indexOf('return orderRetailCategoryProducts(matchingProducts'), 'Box ordering remains separate');
console.log('Res / Todos: three-product rotations, all lines, aliases, uneven inventories, stable pagination and unchanged admin/search/other categories passed.');
