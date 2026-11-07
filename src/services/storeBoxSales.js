// A box is a storefront presentation, never a new SICAR article.
export const BOX_CATEGORY_ID = 'venta_por_cajas';
export const isBoxProduct = (product) => Boolean(product?.boxSale);
const money = (n) => Number(Number(n).toFixed(2));
const positive = (n, max) => Number.isFinite(Number(n)) && Number(n) > 0 && Number(n) <= max;

export function validateBoxSale(box) {
  if (!box || !String(box.sourceCode || '').trim() || String(box.sourceCode).startsWith('BOX_')) {
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
  return {
    sourceCode: String(box.sourceCode).trim(),
    sourceKey: String(box.sourceCode).trim().replace(/[.#$/[\]]/g, '_'),
    poundsPerBox: Number(box.poundsPerBox),
    pricePerPound: Number(box.pricePerPound),
  };
}

export function buildBoxCatalogProduct(form, source, existing = null, id = '') {
  if (!source || isBoxProduct(source) || String(source.unit).toLowerCase() !== 'lb') {
    throw new Error('El artículo original debe venderse por libra.');
  }
  const boxSale = validateBoxSale({ ...form, sourceCode: source.code });
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
  const available = source && source.active !== false && source.unit === 'lb';
  const stock = source?.inventory == null ? null : Math.floor(Number(source.inventory) / box.poundsPerBox);
  return { ...product, active: product.active !== false && Boolean(available) && (stock === null || stock > 0), inventory: stock };
}

export function boxOrderItem(item) {
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
  return {
    ...rest, codigo: box.sourceCode, unidad: 'lb', cantidad: pounds,
    precioUnitario: box.pricePerPound, precioUnitarioOriginal: box.pricePerPound,
    precioFijo: true, subtotal: money(boxes * boxPrice),
    descripcion: `${boxes} ${boxes === 1 ? 'caja' : 'cajas'} de ${box.poundsPerBox} lb (${pounds} lb en total). ${item.descripcion || ''}`.trim(),
    ventaPorCaja: { catalogCode: item.codigo, ...box, boxes },
  };
}

export function validateBoxCart(items, catalog) {
  for (const item of items) {
    if (!item.boxSale) continue;
    const product = catalog.find(p => p.code === item.codigo);
    const source = catalog.find(p => p.code === product?.boxSale?.sourceCode);
    if (!product?.boxSale || !resolveBoxAvailability(product, source).active) {
      throw new Error('Una presentación por caja ya no está disponible. Revisá el carrito.');
    }
    for (const key of ['sourceCode', 'poundsPerBox', 'pricePerPound']) {
      if (product.boxSale[key] !== item.boxSale[key]) throw new Error('Cambió la presentación por caja. Revisá el carrito.');
    }
    boxOrderItem(item);
  }
  // Boxes and loose cuts share the same underlying stock.
  const boxCodes = new Set(items.filter(i => i.boxSale).map(i => i.boxSale.sourceCode));
  for (const code of boxCodes) {
    const source = catalog.find(p => p.code === code);
    const pounds = items.reduce((sum, i) => sum + (i.boxSale?.sourceCode === code
      ? Number(i.cantidad) * i.boxSale.poundsPerBox : i.codigo === code ? Number(i.cantidad) : 0), 0);
    if (source?.inventory != null && pounds > Number(source.inventory)) {
      throw new Error('No hay suficientes libras disponibles para estas cajas y cortes.');
    }
  }
}
