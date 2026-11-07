// A box is a storefront presentation, never a new SICAR article.
export const BOX_CATEGORY_ID = 'venta_por_cajas';
export const isBoxProduct = (product) => Boolean(product?.boxSale);
export const isMixedBox = (box) => box?.type === 'mixed';
const money = (n) => Number(Number(n).toFixed(2));
const positive = (n, max) => Number.isFinite(Number(n)) && Number(n) > 0 && Number(n) <= max;
const sourceIdentity = (source = {}) => {
  const sourceCode = String(source?.sourceCode || '').trim();
  if (!sourceCode || sourceCode.startsWith('BOX_')) throw new Error('Seleccioná un artículo original de SICAR.');
  return { sourceCode, sourceKey: sourceCode.replace(/[.#$/[\]]/g, '_') };
};

export function validateBoxSale(box) {
  if (!box || (box.type && !['single', 'mixed'].includes(box.type))) {
    throw new Error('Seleccioná un artículo original de SICAR.');
  }
  if (!positive(box.poundsPerBox, 10000) || Number(box.poundsPerBox) * 2 % 1 !== 0) {
    throw new Error('Las libras por caja deben ser positivas, en incrementos de 0.5 lb.');
  }
  if (!positive(box.pricePerPound, 100000) || money(box.pricePerPound) !== Number(box.pricePerPound)) {
    throw new Error('Ingresá un precio por libra válido, con hasta dos decimales.');
  }
  if (Math.abs(money(box.poundsPerBox * box.pricePerPound) - box.poundsPerBox * box.pricePerPound) > 0.000001) {
    throw new Error('El precio total por caja debe resultar en centavos exactos.');
  }
  const weightAndPrice = { poundsPerBox: Number(box.poundsPerBox), pricePerPound: Number(box.pricePerPound) };
  if (isMixedBox(box)) {
    if (!Array.isArray(box.components) || box.components.length !== 3) throw new Error('Seleccioná exactamente tres cortes para la caja mixta.');
    const components = box.components.map(component => ({ ...sourceIdentity(component), name: String(component?.name || '').trim() }));
    if (new Set(components.map(component => component.sourceCode)).size !== 3) throw new Error('Los tres cortes deben ser distintos.');
    if (weightAndPrice.poundsPerBox * 2 % 3 !== 0) throw new Error('El peso debe repartirse entre tres en incrementos de 0.5 lb por corte (por ejemplo: 15, 30 o 45 lb).');
    if (components.some(component => !component.name)) throw new Error('Cada corte debe tener un nombre.');
    return { type: 'mixed', ...weightAndPrice, components };
  }
  return { ...sourceIdentity(box), ...weightAndPrice };
}

export const getBoxComponents = box => isMixedBox(box) ? box.components : [box];

export function describeBoxContents(box, boxes = 1) {
  if (!isMixedBox(box)) return '';
  return box.components.map(component => `${Number(boxes) * box.poundsPerBox / 3} lb de ${component.name}`).join(' + ');
}

export function buildBoxCatalogProduct(form, source, existing = null, id = '') {
  const selected = isMixedBox(form) ? source : [source];
  if (!Array.isArray(selected) || selected.some(product => !product || isBoxProduct(product) || String(product.unit).toLowerCase() !== 'lb')) {
    throw new Error('El artículo original debe venderse por libra.');
  }
  const boxSale = validateBoxSale(isMixedBox(form)
    ? { ...form, components: selected.map(product => ({ sourceCode: product.code, name: product.name })) }
    : { ...form, sourceCode: source.code });
  const name = String(form.name || '').trim();
  const image = String(form.image || '').trim();
  if (!name || !image) throw new Error('Ingresá un nombre y una foto para esta presentación.');
  if (!Array.isArray(form.branchIds) || !form.branchIds.length) throw new Error('Seleccioná al menos una sucursal.');
  const code = existing?.code || `BOX_${id}`;
  if (!/^BOX_[a-zA-Z0-9_-]+$/.test(code)) throw new Error('Identificador de presentación inválido.');
  return {
    code, name, image, imageStoragePath: existing?.imageStoragePath || '',
    boxSale, price: money(boxSale.poundsPerBox * boxSale.pricePerPound),
    unit: 'caja', minQuantity: 1, quantityStep: 1, active: form.active === true,
    category: BOX_CATEGORY_ID, categoryLabel: 'Venta por cajas', subcategory: '',
    description: String(form.description || '').trim(),
    branchSettings: Object.fromEntries(['granada', 'nindiri', 'masaya'].map(branchId =>
      [branchId, { active: form.branchIds.includes(branchId) }])),
  };
}

export function resolveBoxAvailability(product, source) {
  if (!isBoxProduct(product)) return product;
  let box;
  try { box = validateBoxSale(product.boxSale); } catch { return { ...product, active: false }; }
  const sources = getBoxComponents(box).map(component => source instanceof Map ? source.get(component.sourceCode)
    : Array.isArray(source) ? source.find(p => p.code === component.sourceCode) : source?.code === component.sourceCode ? source : null);
  const available = sources.every(p => p && p.active !== false && p.unit === 'lb');
  const weightPerSource = box.poundsPerBox / sources.length;
  const stocks = sources.filter(p => p?.inventory != null).map(p => Math.floor(Number(p.inventory) / weightPerSource));
  const stock = stocks.length ? Math.min(...stocks) : null;
  return { ...product, active: product.active !== false && Boolean(available) && (stock === null || stock > 0), inventory: stock };
}

export function boxOrderItem(item, groupId = 0) {
  if (!item?.boxSale) return item;
  const box = validateBoxSale(item.boxSale);
  const boxes = Number(item.cantidad);
  if (!Number.isSafeInteger(boxes) || boxes < 1 || boxes > 10000) {
    throw new Error('La cantidad debe ser un número entero de cajas.');
  }
  const boxPrice = money(box.poundsPerBox * box.pricePerPound);
  if (Number(item.precioUnitario) !== boxPrice || Number(item.precioUnitarioOriginal ?? boxPrice) !== boxPrice) {
    throw new Error('Cambió el precio de la caja. Revisá el carrito antes de confirmar.');
  }
  const pounds = boxes * box.poundsPerBox;
  const { boxSale, ...rest } = item;
  if (isMixedBox(box)) {
    return box.components.map((component, index) => ({
      ...rest, codigo: component.sourceCode, nombre: component.name, unidad: 'lb', cantidad: pounds / 3,
      precioUnitario: box.pricePerPound, precioUnitarioOriginal: box.pricePerPound, precioFijo: true,
      subtotal: money(pounds / 3 * box.pricePerPound),
      descripcion: `${item.nombre}: ${boxes} ${boxes === 1 ? 'caja mixta' : 'cajas mixtas'} de ${box.poundsPerBox} lb; ${box.poundsPerBox / 3} lb de este corte por caja. ${item.descripcion || ''}`.trim(),
      ventaPorCaja: { type: 'mixed', catalogCode: item.codigo, boxName: String(item.nombre || ''),
        ...sourceIdentity(component), poundsPerBox: box.poundsPerBox, poundsPerComponent: box.poundsPerBox / 3,
        pricePerPound: box.pricePerPound, boxes, componentIndex: String(index), groupId: String(groupId) },
    }));
  }
  return {
    ...rest, codigo: box.sourceCode, unidad: 'lb', cantidad: pounds,
    precioUnitario: box.pricePerPound, precioUnitarioOriginal: box.pricePerPound,
    precioFijo: true, subtotal: money(boxes * boxPrice),
    descripcion: `${boxes} ${boxes === 1 ? 'caja' : 'cajas'} de ${box.poundsPerBox} lb (${pounds} lb en total). ${item.descripcion || ''}`.trim(),
    ventaPorCaja: { catalogCode: item.codigo, ...box, boxes },
  };
}

// Bind the three operational lines after filtering so rules can reject partial boxes.
export function linkMixedBoxLines(items) {
  const groups = new Map();
  items.forEach((item, index) => {
    const box = item.ventaPorCaja;
    if (!isMixedBox(box)) return;
    const key = `${box.catalogCode}:${box.groupId}`;
    if (!groups.has(key)) groups.set(key, {});
    groups.get(key)[box.componentIndex] = String(index);
  });
  return items.map(item => isMixedBox(item.ventaPorCaja)
    ? { ...item, ventaPorCaja: { ...item.ventaPorCaja, lineKeys: groups.get(`${item.ventaPorCaja.catalogCode}:${item.ventaPorCaja.groupId}`) } }
    : item);
}

export function validateBoxCart(items, catalog) {
  for (const item of items) {
    if (!item.boxSale) continue;
    const product = catalog.find(p => p.code === item.codigo);
    if (!product?.boxSale || !resolveBoxAvailability(product, catalog).active) {
      throw new Error('Una presentación por caja ya no está disponible. Revisá el carrito.');
    }
    const current = validateBoxSale(product.boxSale);
    const requested = validateBoxSale(item.boxSale);
    if (isMixedBox(current) !== isMixedBox(requested) || current.poundsPerBox !== requested.poundsPerBox ||
        current.pricePerPound !== requested.pricePerPound ||
        getBoxComponents(current).map(p => p.sourceCode).join('|') !== getBoxComponents(requested).map(p => p.sourceCode).join('|')) {
      throw new Error('Cambió la presentación por caja. Revisá el carrito.');
    }
    boxOrderItem(item);
  }
  // Boxes and loose cuts share the same underlying stock.
  const boxCodes = new Set(items.filter(i => i.boxSale).flatMap(i => getBoxComponents(validateBoxSale(i.boxSale)).map(p => p.sourceCode)));
  for (const code of boxCodes) {
    const source = catalog.find(p => p.code === code);
    const pounds = items.reduce((sum, i) => {
      if (!i.boxSale) return sum + (i.codigo === code ? Number(i.cantidad) : 0);
      const components = getBoxComponents(i.boxSale);
      return sum + (components.some(p => p.sourceCode === code) ? Number(i.cantidad) * i.boxSale.poundsPerBox / components.length : 0);
    }, 0);
    if (source?.inventory != null && pounds > Number(source.inventory)) {
      throw new Error('No hay suficientes libras disponibles para estas cajas y cortes.');
    }
  }
}
