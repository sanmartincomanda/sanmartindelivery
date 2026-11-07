// Keep RTDB's repeated 2-5 component validations readable and testable.
const and = parts => `(${parts.join(' && ')})`;
const child = (node, path) => `${node}.child('${path}')`;
const val = (node, path) => `${child(node, path)}.val()`;
const indices = [0, 1, 2, 3, 4];
const componentCount = node => `(${child(node, '4')}.exists() ? 5 : ${child(node, '3')}.exists() ? 4 : ${child(node, '2')}.exists() ? 3 : 2)`;
const contiguousComponents = node => and([
  `${node}.hasChildren(['0','1'])`,
  `(!${child(node, '3')}.exists() || ${child(node, '2')}.exists())`,
  `(!${child(node, '4')}.exists() || ${child(node, '3')}.exists())`,
]);
const exactCents = amount => `((${amount} * 100 % 1) < 0.00001 || (${amount} * 100 % 1) > 0.99999)`;
const source = component => `root.child('storeCatalog').child(${val(component, 'sourceKey')})`;
const originalSource = component => and([
  `${child(component, 'sourceCode')}.isString()`, `${val(component, 'sourceCode')} != ''`,
  `!${val(component, 'sourceCode')}.matches(/^BOX_.*/)`, `${child(component, 'sourceKey')}.isString()`,
  `${val(source(component), 'code')} == ${val(component, 'sourceCode')}`,
  `${val(source(component), 'unit')} == 'lb'`, `!${child(source(component), 'boxSale')}.exists()`,
]);
const p = 'newData';
const b = child(p, 'boxSale');
const parts = indices.map(i => child(b, `components/${i}`));
const count = componentCount(child(b, 'components'));
const totalDifference = `${val(p, 'price')} - ${val(b, 'poundsPerBox')} * ${val(b, 'pricePerPound')}`;
export const catalogBoxValidation = `!${b}.exists() || ${and([
  `${val(p, 'code')} == $productId`, `${val(p, 'code')}.matches(/^BOX_.+/)`, `${val(p, 'unit')} == 'caja'`,
  `${val(p, 'minQuantity')} == 1`, `${val(p, 'quantityStep')} == 1`,
  `${child(b, 'poundsPerBox')}.isNumber()`, `${val(b, 'poundsPerBox')} >= 0.5`, `${val(b, 'poundsPerBox')} <= 10000`, `${val(b, 'poundsPerBox')} % 0.5 == 0`,
  `${child(b, 'pricePerPound')}.isNumber()`, `${val(b, 'pricePerPound')} > 0`, `${val(b, 'pricePerPound')} <= 100000`,
  `${child(p, 'price')}.isNumber()`, `${val(p, 'price')} > 0`, `(${totalDifference}) > -0.000001`, `(${totalDifference}) < 0.000001`,
  `(${and([`(!${child(b, 'type')}.exists() || ${val(b, 'type')} == 'single')`, `!${child(b, 'components')}.exists()`, originalSource(b)])} || ${and([
    `${val(b, 'type')} == 'mixed'`, `!${child(b, 'sourceCode')}.exists()`, `!${child(b, 'sourceKey')}.exists()`,
    contiguousComponents(child(b, 'components')), `${val(b, 'poundsPerBox')} * 2 % ${count} == 0`,
    exactCents(val(b, 'pricePerPound')), exactCents(`(${val(b, 'poundsPerBox')} / ${count} * ${val(b, 'pricePerPound')})`),
    ...parts.map(part => `(!${part}.exists() || ${originalSource(part)})`),
    ...parts.flatMap((part, i) => parts.slice(i + 1).map(other =>
      `(!${part}.exists() || !${other}.exists() || ${val(part, 'sourceCode')} != ${val(other, 'sourceCode')})`)),
  ])})`,
])}`;
export const catalogComponentRules = {
  '.validate': `newData.parent().child('type').val() == 'mixed' && ${contiguousComponents('newData')}`,
  '$component': { '.validate': "$component.matches(/^[0-4]$/) && newData.hasChildren(['sourceCode','sourceKey','name']) && newData.child('name').isString() && newData.child('name').val() != ''" },
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
const orderCount = componentCount(child(box, 'components'));
const keys = child(v, 'lineKeys');
const mixedOrder = and([
  `${val(box, 'type')} == 'mixed'`, `${val(v, 'type')} == 'mixed'`,
  `${child(v, 'componentIndex')}.isString()`, `${val(v, 'componentIndex')}.matches(/^[0-4]$/)`, `${component}.exists()`,
  `${child(v, 'groupId')}.isString()`, available(source(component)),
  `${val(v, 'sourceCode')} == ${val(component, 'sourceCode')}`, `${val(p, 'codigo')} == ${val(component, 'sourceCode')}`,
  `${val(v, 'poundsPerComponent')} == ${val(box, 'poundsPerBox')} / ${orderCount}`,
  `${val(p, 'cantidad')} == ${val(v, 'boxes')} * ${val(box, 'poundsPerBox')} / ${orderCount}`,
  `${keys}.hasChildren(['0','1'])`, `${keys}.child(${val(v, 'componentIndex')}).val() == $itemId`,
  ...indices.map(i => {
    const peer = `newData.parent().child(${val(keys, String(i))}).child('ventaPorCaja')`;
    return `(${child(box, `components/${i}`)}.exists() ? ${and([
      `${child(keys, String(i))}.isString()`, `${val(keys, String(i))}.matches(/^[0-9]+$/)`,
      `${val(peer, 'type')} == 'mixed'`, `${val(peer, 'componentIndex')} == '${i}'`,
      ...['catalogCode','boxes','groupId'].map(field => `${val(peer, field)} == ${val(v, field)}`),
      ...indices.map(j => `${val(peer, `lineKeys/${j}`)} == ${val(keys, String(j))}`),
    ])} : !${child(keys, String(i))}.exists())`;
  }),
]);
export const orderBoxValidation = `data.exists() || ${and([
  `(!newData.child('codigo').isString() || !newData.child('codigo').val().matches(/^BOX_.*/))`,
  `!newData.child('boxSale').exists()`,
  `(!${v}.exists() || ${and([...commonOrder, `(${singleOrder} || ${mixedOrder})`])})`,
])}`;

export const orderBoxLineKeyRules = {
  '$component': { '.validate': "data.parent().parent().parent().exists() || ($component.matches(/^[0-4]$/) && newData.isString() && newData.val().matches(/^[0-9]+$/))" },
};
