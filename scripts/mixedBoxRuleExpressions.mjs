// Keep RTDB's repeated three-component validations readable and testable.
const and = parts => `(${parts.join(' && ')})`;
const child = (node, path) => `${node}.child('${path}')`;
const val = (node, path) => `${child(node, path)}.val()`;
const source = component => `root.child('storeCatalog').child(${val(component, 'sourceKey')})`;
const originalSource = component => and([
  `${child(component, 'sourceCode')}.isString()`, `${val(component, 'sourceCode')} != ''`,
  `!${val(component, 'sourceCode')}.matches(/^BOX_.*/)`, `${child(component, 'sourceKey')}.isString()`,
  `${val(source(component), 'code')} == ${val(component, 'sourceCode')}`,
  `${val(source(component), 'unit')} == 'lb'`, `!${child(source(component), 'boxSale')}.exists()`,
]);
const p = 'newData';
const b = child(p, 'boxSale');
const parts = [0, 1, 2].map(i => child(b, `components/${i}`));
const totalDifference = `${val(p, 'price')} - ${val(b, 'poundsPerBox')} * ${val(b, 'pricePerPound')}`;
export const catalogBoxValidation = `!${b}.exists() || ${and([
  `${val(p, 'code')} == $productId`, `${val(p, 'code')}.matches(/^BOX_.+/)`, `${val(p, 'unit')} == 'caja'`,
  `${val(p, 'minQuantity')} == 1`, `${val(p, 'quantityStep')} == 1`,
  `${child(b, 'poundsPerBox')}.isNumber()`, `${val(b, 'poundsPerBox')} >= 0.5`, `${val(b, 'poundsPerBox')} <= 10000`, `${val(b, 'poundsPerBox')} % 0.5 == 0`,
  `${child(b, 'pricePerPound')}.isNumber()`, `${val(b, 'pricePerPound')} > 0`, `${val(b, 'pricePerPound')} <= 100000`,
  `${child(p, 'price')}.isNumber()`, `${val(p, 'price')} > 0`, `(${totalDifference}) > -0.000001`, `(${totalDifference}) < 0.000001`,
  `(${and([`(!${child(b, 'type')}.exists() || ${val(b, 'type')} == 'single')`, `!${child(b, 'components')}.exists()`, originalSource(b)])} || ${and([
    `${val(b, 'type')} == 'mixed'`, `!${child(b, 'sourceCode')}.exists()`, `!${child(b, 'sourceKey')}.exists()`,
    `${child(b, 'components')}.hasChildren(['0','1','2'])`, `${val(b, 'poundsPerBox')} * 2 % 3 == 0`,
    ...parts.map(originalSource),
    `${val(parts[0], 'sourceCode')} != ${val(parts[1], 'sourceCode')}`,
    `${val(parts[0], 'sourceCode')} != ${val(parts[2], 'sourceCode')}`,
    `${val(parts[1], 'sourceCode')} != ${val(parts[2], 'sourceCode')}`,
  ])})`,
])}`;
export const catalogComponentRules = {
  '.validate': "newData.parent().child('type').val() == 'mixed' && newData.hasChildren(['0','1','2'])",
  '$component': { '.validate': "($component == '0' || $component == '1' || $component == '2') && newData.hasChildren(['sourceCode','sourceKey','name']) && newData.child('name').isString() && newData.child('name').val() != ''" },
};

const v = child(p, 'ventaPorCaja');
const catalog = `root.child('storeCatalog').child(${val(v, 'catalogCode')})`;
const box = child(catalog, 'boxSale');
const branch = "newData.parent().parent().child('storeBranchId').val()";
const available = node => and([`${val(node, 'active')} == true`, `${node}.child('branchSettings').child(${branch}).child('active').val() != false`]);
const commonOrder = [
  `${v}.hasChildren(['catalogCode','sourceCode','poundsPerBox','pricePerPound','boxes'])`,
  `${child(v, 'catalogCode')}.isString()`, available(catalog),
  `${child(v, 'boxes')}.isNumber()`, `${val(v, 'boxes')} >= 1`, `${val(v, 'boxes')} <= 10000`, `${val(v, 'boxes')} % 1 == 0`,
  `${val(v, 'poundsPerBox')} == ${val(box, 'poundsPerBox')}`, `${val(v, 'pricePerPound')} == ${val(box, 'pricePerPound')}`,
  `${val(p, 'unidad')} == 'lb'`, `${val(p, 'precioUnitario')} == ${val(box, 'pricePerPound')}`, `${val(p, 'precioFijo')} == true`,
];
const singleOrder = and([
  `${val(box, 'type')} != 'mixed'`, `${val(v, 'type')} != 'mixed'`, available(source(box)),
  `${val(v, 'sourceCode')} == ${val(box, 'sourceCode')}`, `${val(p, 'codigo')} == ${val(box, 'sourceCode')}`,
  `${val(p, 'cantidad')} == ${val(v, 'boxes')} * ${val(box, 'poundsPerBox')}`,
]);
const component = `${box}.child('components').child(${val(v, 'componentIndex')})`;
const keys = child(v, 'lineKeys');
const mixedOrder = and([
  `${val(box, 'type')} == 'mixed'`, `${val(v, 'type')} == 'mixed'`,
  `${child(v, 'componentIndex')}.isString()`, `${val(v, 'componentIndex')}.matches(/^[012]$/)`,
  `${child(v, 'groupId')}.isString()`, available(source(component)),
  `${val(v, 'sourceCode')} == ${val(component, 'sourceCode')}`, `${val(p, 'codigo')} == ${val(component, 'sourceCode')}`,
  `${val(v, 'poundsPerComponent')} == ${val(box, 'poundsPerBox')} / 3`,
  `${val(p, 'cantidad')} == ${val(v, 'boxes')} * ${val(box, 'poundsPerBox')} / 3`,
  `${keys}.hasChildren(['0','1','2'])`, `${keys}.child(${val(v, 'componentIndex')}).val() == $itemId`,
  ...[0, 1, 2].map(i => {
    const peer = `newData.parent().child(${val(keys, String(i))}).child('ventaPorCaja')`;
    return and([
      `${child(keys, String(i))}.isString()`, `${val(keys, String(i))}.matches(/^[0-9]+$/)`,
      `${val(peer, 'type')} == 'mixed'`, `${val(peer, 'componentIndex')} == '${i}'`,
      ...['catalogCode','boxes','groupId'].map(field => `${val(peer, field)} == ${val(v, field)}`),
      ...[0, 1, 2].map(j => `${val(peer, `lineKeys/${j}`)} == ${val(keys, String(j))}`),
    ]);
  }),
]);
export const orderBoxValidation = `data.exists() || ${and([
  `(!newData.child('codigo').isString() || !newData.child('codigo').val().matches(/^BOX_.*/))`,
  `!newData.child('boxSale').exists()`,
  `(!${v}.exists() || ${and([...commonOrder, `(${singleOrder} || ${mixedOrder})`])})`,
])}`;
