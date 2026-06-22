import { getApps, initializeApp } from 'firebase/app';
import { get, getDatabase, onValue, ref, update } from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const STORE_CHANNEL = 'tienda_virtual';
const STORE_ORDERS_PATH = 'orders';
const QUOTE_QUEUE_PATH = 'sicarQuoteQueue';
const QUOTE_SERIE = 'APP';
const DEFAULT_CLIENT_ID = 1;
const DEFAULT_USER_ID = 1;
const DEFAULT_VENDOR_ID = 7;
const DEFAULT_CURRENCY_ID = 1;
const DEFAULT_CURRENCY_ABBR = 'NIO';
const DEFAULT_CURRENCY_EXCHANGE = 1;
const DEFAULT_ZERO_TAX_IMP_ID = 4;

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantity = (value) => Number(Number(value || 0).toFixed(3));
const roundRate = (value) => Number(Number(value || 0).toFixed(6));
const formatMoney = (value) => roundMoney(value).toFixed(2);
const formatQuantity = (value) => roundQuantity(value).toFixed(3);
const formatRate = (value) => roundRate(value).toFixed(6);

const formatWeightLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0';
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '');
};

const normalizeStoreUnitLabel = (value = '') => {
  const unit = String(value || '').trim().toUpperCase();
  if (unit.includes('LB')) {
    return 'lb';
  }
  return 'unidad';
};

const formatStoreQuantityLabel = (quantity, unit) =>
  String(unit || '').trim().toLowerCase() === 'unidad'
    ? String(Number(quantity || 0))
    : formatWeightLabel(quantity);

const escapeSqlText = (value, sqlEscape) => `'${sqlEscape(String(value || ''))}'`;

const parseImpIds = (value = '') =>
  String(value || '')
    .split(',')
    .map((entry) => Number(String(entry || '').trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

const normalizeOrderItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      code: String(item?.codigo ?? item?.code ?? '').trim(),
      name: String(item?.nombre ?? item?.name ?? '').trim(),
      description: String(item?.descripcion ?? item?.description ?? '').trim(),
      unit: String(item?.unidad ?? item?.unit ?? 'lb').trim() || 'lb',
      quantity: roundQuantity(item?.cantidad ?? item?.quantity ?? 0),
      unitPrice: roundMoney(item?.precioUnitario ?? item?.price ?? 0),
      subtotal: roundMoney(item?.subtotal ?? 0),
    }))
    .filter((item) => item.code && item.quantity > 0);

const buildOrderText = (items = [], notes = '', summary = {}) => {
  const normalizedItems = normalizeOrderItems(items);
  const subtotal = roundMoney(
    summary.subtotal ?? normalizedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const discount = roundMoney(summary.discount || 0);
  const total = roundMoney(summary.total ?? Math.max(subtotal - discount, 0));
  const totalLabel = String(summary.totalLabel || 'Total aproximado de pedido').trim();
  const subtotalLabel = String(summary.subtotalLabel || 'Subtotal estimado').trim();
  const lines = [];

  normalizedItems.forEach((item) => {
    lines.push(
      `- ${formatStoreQuantityLabel(item.quantity, item.unit)} ${item.unit} ${item.name} [${item.code}] | C$${formatMoney(item.subtotal)}`
    );

    if (item.description) {
      lines.push(`  Descripcion: ${item.description}`);
    }
  });

  const cleanNotes = String(notes || '').trim();
  if (cleanNotes) {
    lines.push('');
    lines.push(`Observaciones: ${cleanNotes}`);
  }

  if (subtotal > 0) {
    lines.push('');
    lines.push(`${subtotalLabel}: C$${formatMoney(subtotal)}`);
    if (discount > 0) {
      lines.push(`Descuento: -C$${formatMoney(discount)}`);
    }
    lines.push(`${totalLabel}: C$${formatMoney(total)}`);
  }

  return lines.join('\n').trim();
};

const buildCustomerQuoteMessage = (order = {}, quote = {}) => {
  const orderNumber = String(order?.id || '').padStart(3, '0');
  const lines = [
    `Hola ${String(order?.cliente || 'cliente').trim()}.`,
    `Tu pedido #${orderNumber} en Carnes San Martin Granada fue actualizado.`,
    '',
    'Detalle actualizado:',
  ];

  (Array.isArray(quote.items) ? quote.items : []).forEach((item) => {
    lines.push(
      `- ${formatStoreQuantityLabel(item.quantity, item.storeUnit)} ${item.storeUnit} ${item.name} [${item.code}] | C$${formatMoney(item.total)}`
    );
  });

  lines.push('');
  lines.push(`Total actualizado: C$${formatMoney(quote.total)}`);

  if (order?.observaciones) {
    lines.push(`Observaciones: ${String(order.observaciones).trim()}`);
  }

  return lines.filter(Boolean).join('\n').trim();
};

const getFirebaseDatabase = () => {
  const existingApp = getApps().find((app) => app.name === 'sicar-quote-sync');
  const app =
    existingApp ||
    initializeApp(FIREBASE_CONFIG, 'sicar-quote-sync');
  return getDatabase(app);
};

export function createSicarQuoteSyncManager({ runMysqlQuery, sqlEscape }) {
  const database = getFirebaseDatabase();
  const state = {
    listening: false,
    processing: false,
    pendingCount: 0,
    syncedCount: 0,
    lastRunAt: '',
    lastSuccessAt: '',
    lastError: '',
    lastProcessedOrderKey: '',
    lastQuoteId: 0,
  };

  const runningOrderPromises = new Map();
  let queueListenerStarted = false;
  let queueUnsubscribe = null;
  let processRequested = false;

  const updateOrderQuoteStatus = async (orderKey, patch = {}) => {
    if (!orderKey || !patch || typeof patch !== 'object') {
      return;
    }

    await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}/sicarQuote`), patch);
  };

  const markQueueAsError = async (orderKey, queueEntry = {}, error) => {
    const now = Date.now();
    const errorMessage = String(error?.message || error || 'No se pudo sincronizar la cotizacion con SICAR.').trim();
    await update(ref(database), {
      [`${QUOTE_QUEUE_PATH}/${orderKey}`]: {
        ...queueEntry,
        status: 'error',
        attempts: Number(queueEntry?.attempts || 0) + 1,
        lastAttemptAt: now,
        lastAttemptAtIso: new Date(now).toISOString(),
        error: errorMessage,
      },
      [`${STORE_ORDERS_PATH}/${orderKey}/sicarQuote`]: {
        status: 'error',
        error: errorMessage,
        lastAttemptAt: new Date(now).toISOString(),
      },
    });
  };

  const clearQueueEntry = async (orderKey) => {
    await update(ref(database), {
      [`${QUOTE_QUEUE_PATH}/${orderKey}`]: null,
    });
  };

  const getOrderByKey = async (orderKey) => {
    const snapshot = await get(ref(database, `${STORE_ORDERS_PATH}/${orderKey}`));
    const value = snapshot.val();
    return value ? { firebaseKey: orderKey, ...value } : null;
  };

  const getQuoteByOrderReference = async (order = {}) => {
    const explicitQuoteId = Number(order?.sicarQuote?.cotId || 0);
    if (explicitQuoteId > 0) {
      const rows = await runMysqlQuery(`
        SELECT cot_id, fecha, folioMovil, serieMovil, subtotal, descuento, total
        FROM cotizacion
        WHERE cot_id = ${explicitQuoteId}
        LIMIT 1;
      `);

      if (rows.length > 0) {
        const [cotId, fecha, folioMovil, serieMovil, subtotal, descuento, total] = rows[0].split('\t');
        return {
          cotId: Number(cotId || 0),
          fecha: String(fecha || '').trim(),
          folioMovil: Number(folioMovil || 0),
          serieMovil: String(serieMovil || '').trim(),
          subtotal: roundMoney(subtotal),
          discount: roundMoney(descuento),
          total: roundMoney(total),
        };
      }
    }

    const orderDate = String(order?.fecha || '').trim();
    const orderNumber = Number(order?.id || 0);
    if (!orderDate || orderNumber <= 0) {
      return null;
    }

    const rows = await runMysqlQuery(`
      SELECT cot_id, fecha, folioMovil, serieMovil, subtotal, descuento, total
      FROM cotizacion
      WHERE fecha = ${escapeSqlText(orderDate, sqlEscape)}
        AND folioMovil = ${orderNumber}
        AND serieMovil = ${escapeSqlText(QUOTE_SERIE, sqlEscape)}
      ORDER BY cot_id DESC
      LIMIT 1;
    `);

    if (rows.length === 0) {
      return null;
    }

    const [cotId, fecha, folioMovil, serieMovil, subtotal, descuento, total] = rows[0].split('\t');
    return {
      cotId: Number(cotId || 0),
      fecha: String(fecha || '').trim(),
      folioMovil: Number(folioMovil || 0),
      serieMovil: String(serieMovil || '').trim(),
      subtotal: roundMoney(subtotal),
      discount: roundMoney(descuento),
      total: roundMoney(total),
    };
  };

  const getSicarArticlesByCodes = async (codes = []) => {
    const uniqueCodes = Array.from(
      new Set(
        (Array.isArray(codes) ? codes : [])
          .map((code) => String(code || '').trim())
          .filter(Boolean)
      )
    );

    if (uniqueCodes.length === 0) {
      return new Map();
    }

    const codeList = uniqueCodes.map((code) => escapeSqlText(code, sqlEscape)).join(', ');
    const rows = await runMysqlQuery(`
      SELECT
        a.art_id,
        a.clave,
        a.descripcion,
        UPPER(TRIM(COALESCE(u.nombre, 'PZA'))),
        ROUND(a.precioCompra, 6),
        ROUND(a.precio1, 6),
        ROUND(a.precio1 * (1 + COALESCE(tax.taxRatePct, 0) / 100), 6),
        COALESCE(tax.taxRatePct, 0),
        COALESCE(tax.impIds, ''),
        COALESCE(d.nombre, ''),
        COALESCE(c.nombre, '')
      FROM articulo a
      LEFT JOIN unidad u ON u.uni_id = a.unidadVenta
      LEFT JOIN categoria c ON c.cat_id = a.cat_id
      LEFT JOIN departamento d ON d.dep_id = c.dep_id
      LEFT JOIN (
        SELECT
          ai.art_id,
          ROUND(
            SUM(
              CASE
                WHEN COALESCE(imp.status, 1) = 1
                  AND COALESCE(imp.tras, 0) = 1
                  AND UPPER(COALESCE(imp.tipoFactor, 'Tasa')) = 'TASA'
                THEN COALESCE(imp.impuesto, 0)
                ELSE 0
              END
            ),
            6
          ) AS taxRatePct,
          GROUP_CONCAT(
            DISTINCT CASE WHEN COALESCE(imp.status, 1) = 1 THEN imp.imp_id ELSE NULL END
            ORDER BY imp.imp_id
            SEPARATOR ','
          ) AS impIds
        FROM articuloimpuesto ai
        INNER JOIN impuesto imp ON imp.imp_id = ai.imp_id
        GROUP BY ai.art_id
      ) tax ON tax.art_id = a.art_id
      WHERE a.status = 1
        AND a.clave IN (${codeList})
      ORDER BY a.clave ASC;
    `);

    const map = new Map();
    rows.forEach((row) => {
      const parts = row.split('\t');
      map.set(String(parts[1] || '').trim(), {
        artId: Number(parts[0] || 0),
        code: String(parts[1] || '').trim(),
        description: String(parts[2] || '').trim(),
        unit: String(parts[3] || '').trim() || 'PZA',
        purchasePrice: roundRate(parts[4]),
        basePrice: roundRate(parts[5]),
        priceWithTax: roundRate(parts[6]),
        taxRatePct: roundRate(parts[7]),
        impIds: parseImpIds(parts[8]),
        department: String(parts[9] || '').trim(),
        category: String(parts[10] || '').trim(),
      });
    });

    return map;
  };

  const buildQuoteDraft = async (order = {}) => {
    const orderItems = normalizeOrderItems(order.items);
    const articleMap = await getSicarArticlesByCodes(orderItems.map((item) => item.code));
    const missingCodes = [];
    const detailItems = [];

    orderItems.forEach((item, index) => {
      const article = articleMap.get(item.code);
      if (!article) {
        missingCodes.push(item.code);
        return;
      }

      const quantity = roundQuantity(item.quantity);
      const priceSin = roundMoney(article.basePrice);
      const priceCon = roundMoney(article.priceWithTax || article.basePrice);
      const priceNorSin = priceSin;
      const priceNorCon = priceCon;
      const purchasePrice = roundMoney(article.purchasePrice);
      const importeCompra = roundMoney(purchasePrice * quantity);
      const importeSin = roundMoney(priceSin * quantity);
      const importeCon = roundMoney(priceCon * quantity);
      const diferencia = roundMoney(importeCon - importeCompra);
      const utilidad = importeCon > 0 ? roundRate((diferencia / importeCon) * 100) : 0;

      detailItems.push({
        order: index,
        artId: article.artId,
        code: article.code,
        description: article.description,
        storeName: item.name || article.description,
        storeDescription: item.description,
        quantity,
        storeUnit: normalizeStoreUnitLabel(item.unit),
        unit: article.unit || (normalizeStoreUnitLabel(item.unit) === 'unidad' ? 'PZA' : 'LB'),
        purchasePrice,
        priceNorSin,
        priceNorCon,
        priceSin,
        priceCon,
        importeCompra,
        importeNorSin: importeSin,
        importeNorCon: importeCon,
        importeSin,
        importeCon,
        monPriceNorSin: priceNorSin,
        monPriceNorCon: priceNorCon,
        monPriceSin: priceSin,
        monPriceCon: priceCon,
        monImporteNorSin: importeSin,
        monImporteNorCon: importeCon,
        monImporteSin: importeSin,
        monImporteCon: importeCon,
        diferencia,
        utilidad,
        taxRatePct: article.taxRatePct,
        impIds: article.impIds,
        department: article.department,
        category: article.category,
      });
    });

    if (detailItems.length === 0) {
      throw new Error('No se pudo crear la cotizacion porque ningun SKU del pedido existe en SICAR.');
    }

    const subtotal = roundMoney(detailItems.reduce((sum, item) => sum + item.importeSin, 0));
    const total = roundMoney(detailItems.reduce((sum, item) => sum + item.importeCon, 0));
    const totalWeight = roundRate(
      detailItems.reduce(
        (sum, item) => sum + (String(item.unit || '').toUpperCase().includes('LB') ? item.quantity : 0),
        0
      )
    );
    const taxesByImp = new Map();

    detailItems.forEach((item) => {
      if (!Array.isArray(item.impIds) || item.impIds.length === 0) {
        return;
      }

      item.impIds.forEach((impId) => {
        if (Number(impId || 0) <= 0) {
          return;
        }

        if (Number(impId) !== 1) {
          return;
        }

        const current = taxesByImp.get(impId) || {
          impId: Number(impId),
          taxTotal: 0,
          taxableSubtotal: 0,
          tras: 1,
        };

        current.taxTotal = roundMoney(current.taxTotal + (item.importeCon - item.importeSin));
        current.taxableSubtotal = roundMoney(current.taxableSubtotal + item.importeSin);
        taxesByImp.set(impId, current);
      });
    });

    const taxRows = [
      {
        impId: DEFAULT_ZERO_TAX_IMP_ID,
        taxTotal: 0,
        taxableSubtotal: 0,
        tras: 0,
      },
      ...Array.from(taxesByImp.values()),
    ];

    return {
      orderDate: String(order.fecha || '').trim(),
      orderNumber: Number(order.id || 0),
      subtotal,
      total,
      totalWeight,
      discount: 0,
      detailItems,
      taxRows,
      missingCodes,
    };
  };

  const insertQuoteDraft = async (order = {}, draft = {}) => {
    const header = [
      `Pedido app #${String(order?.id || '').padStart(3, '0')}`,
      `Cliente: ${String(order?.cliente || '').trim() || 'Cliente tienda virtual'}`,
      order?.telefono ? `Telefono: ${String(order.telefono).trim()}` : '',
      order?.direccion ? `Direccion: ${String(order.direccion).trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const footer = order?.observaciones
      ? `Observaciones: ${String(order.observaciones).trim()}`
      : '';

    const detailValues = draft.detailItems.map((item) => `
      (
        @cotId,
        ${item.artId},
        ${escapeSqlText(item.code, sqlEscape)},
        ${escapeSqlText(item.description, sqlEscape)},
        ${formatQuantity(item.quantity)},
        ${escapeSqlText(item.unit, sqlEscape)},
        ${formatMoney(item.purchasePrice)},
        ${formatMoney(item.priceNorSin)},
        ${formatMoney(item.priceNorCon)},
        ${formatMoney(item.priceSin)},
        ${formatMoney(item.priceCon)},
        ${formatMoney(item.importeCompra)},
        ${formatMoney(item.importeNorSin)},
        ${formatMoney(item.importeNorCon)},
        ${formatMoney(item.importeSin)},
        ${formatMoney(item.importeCon)},
        ${formatMoney(item.monPriceNorSin)},
        ${formatMoney(item.monPriceNorCon)},
        ${formatMoney(item.monPriceSin)},
        ${formatMoney(item.monPriceCon)},
        ${formatMoney(item.monImporteNorSin)},
        ${formatMoney(item.monImporteNorCon)},
        ${formatMoney(item.monImporteSin)},
        ${formatMoney(item.monImporteCon)},
        ${formatMoney(item.diferencia)},
        ${formatRate(item.utilidad)},
        0.00,
        0.00,
        NULL,
        ${item.order}
      )
    `);

    const quoteTaxValues = draft.taxRows.map((item, index) => `
      (
        @cotId,
        ${Number(item.impId || 0)},
        ${formatMoney(item.taxTotal)},
        NULL,
        ${formatMoney(item.taxableSubtotal)},
        NULL,
        ${Number(item.tras || 0)},
        ${index}
      )
    `);

    const detailTaxValues = draft.detailItems
      .flatMap((item) =>
        (Array.isArray(item.impIds) ? item.impIds : [])
          .filter((impId) => Number(impId || 0) > 0)
          .map((impId) => `(@cotId, ${item.artId}, ${Number(impId)})`)
      );

    const rows = await runMysqlQuery(`
      START TRANSACTION;
      INSERT INTO cotizacion (
        fecha,
        header,
        footer,
        subtotal,
        descuento,
        total,
        monSubtotal,
        monDescuento,
        monTotal,
        monAbr,
        monTipoCambio,
        peso,
        status,
        img,
        caracteristicas,
        desglosado,
        mosDescuento,
        mosPeso,
        impuestos,
        mosFirma,
        leyendaImpuestos,
        mosParidad,
        bloqueada,
        mosDetallePaq,
        mosClaveArt,
        folioMovil,
        serieMovil,
        totalSipa,
        mosPreAntDesc,
        usu_id,
        cli_id,
        mon_id,
        vnd_id
      ) VALUES (
        ${escapeSqlText(draft.orderDate, sqlEscape)},
        ${escapeSqlText(header, sqlEscape)},
        ${escapeSqlText(footer, sqlEscape)},
        ${formatMoney(draft.subtotal)},
        ${formatMoney(draft.discount)},
        ${formatMoney(draft.total)},
        ${formatMoney(draft.subtotal)},
        ${formatMoney(draft.discount)},
        ${formatMoney(draft.total)},
        ${escapeSqlText(DEFAULT_CURRENCY_ABBR, sqlEscape)},
        ${formatRate(DEFAULT_CURRENCY_EXCHANGE)},
        ${formatRate(draft.totalWeight)},
        1,
        1,
        0,
        0,
        0,
        0,
        1,
        1,
        1,
        0,
        0,
        0,
        1,
        ${Number(draft.orderNumber || 0)},
        ${escapeSqlText(QUOTE_SERIE, sqlEscape)},
        NULL,
        0,
        ${DEFAULT_USER_ID},
        ${DEFAULT_CLIENT_ID},
        ${DEFAULT_CURRENCY_ID},
        ${DEFAULT_VENDOR_ID}
      );
      SET @cotId = LAST_INSERT_ID();
      INSERT INTO detallecot (
        cot_id,
        art_id,
        clave,
        descripcion,
        cantidad,
        unidad,
        precioCompra,
        precioNorSin,
        precioNorCon,
        precioSin,
        precioCon,
        importeCompra,
        importeNorSin,
        importeNorCon,
        importeSin,
        importeCon,
        monPrecioNorSin,
        monPrecioNorCon,
        monPrecioSin,
        monPrecioCon,
        monImporteNorSin,
        monImporteNorCon,
        monImporteSin,
        monImporteCon,
        diferencia,
        utilidad,
        descPorcentaje,
        descTotal,
        caracteristicas,
        orden
      ) VALUES ${detailValues.join(',')};
      INSERT INTO cotizacionimp (
        cot_id,
        imp_id,
        total,
        monTotal,
        subtotal,
        monSubtotal,
        tras,
        orden
      ) VALUES ${quoteTaxValues.join(',')};
      ${detailTaxValues.length > 0 ? `INSERT INTO detallecotimpuesto (cot_id, art_id, imp_id) VALUES ${detailTaxValues.join(',')};` : ''}
      SELECT @cotId;
      COMMIT;
    `);

    const insertedRow = rows[rows.length - 1];
    const cotId = Number(insertedRow || 0);
    if (!cotId) {
      throw new Error('SICAR no devolvio el numero de cotizacion creada.');
    }

    return {
      cotId,
      missingCodes: draft.missingCodes || [],
    };
  };

  const getQuoteSnapshot = async (quoteReference = {}) => {
    const quoteId = Number(quoteReference?.cotId || 0);
    if (quoteId <= 0) {
      throw new Error('No existe una cotizacion SICAR enlazada para este pedido.');
    }

    const headerRows = await runMysqlQuery(`
      SELECT cot_id, fecha, subtotal, descuento, total, folioMovil, serieMovil
      FROM cotizacion
      WHERE cot_id = ${quoteId}
      LIMIT 1;
    `);

    if (headerRows.length === 0) {
      throw new Error('La cotizacion SICAR enlazada ya no existe.');
    }

    const [cotId, fecha, subtotal, descuento, total, folioMovil, serieMovil] = headerRows[0].split('\t');
    const detailRows = await runMysqlQuery(`
      SELECT
        dc.art_id,
        dc.clave,
        dc.descripcion,
        dc.cantidad,
        dc.unidad,
        dc.precioSin,
        dc.precioCon,
        dc.importeSin,
        dc.importeCon,
        COALESCE(tax.impIds, '')
      FROM detallecot dc
      LEFT JOIN (
        SELECT
          cot_id,
          art_id,
          GROUP_CONCAT(imp_id ORDER BY imp_id SEPARATOR ',') AS impIds
        FROM detallecotimpuesto
        WHERE cot_id = ${quoteId}
        GROUP BY cot_id, art_id
      ) tax ON tax.cot_id = dc.cot_id AND tax.art_id = dc.art_id
      WHERE dc.cot_id = ${quoteId}
      ORDER BY dc.orden ASC;
    `);

    const items = detailRows.map((row) => {
      const parts = row.split('\t');
      return {
        artId: Number(parts[0] || 0),
        code: String(parts[1] || '').trim(),
        name: String(parts[2] || '').trim(),
        description: String(parts[2] || '').trim(),
        quantity: roundQuantity(parts[3]),
        unit: String(parts[4] || '').trim() || 'PZA',
        storeUnit: normalizeStoreUnitLabel(parts[4]),
        priceWithoutTax: roundMoney(parts[5]),
        price: roundMoney(parts[6]),
        subtotalWithoutTax: roundMoney(parts[7]),
        total: roundMoney(parts[8]),
        impIds: parseImpIds(parts[9]),
      };
    });

    return {
      cotId: Number(cotId || 0),
      orderDate: String(fecha || '').trim(),
      orderNumber: Number(folioMovil || 0),
      serieMovil: String(serieMovil || '').trim(),
      subtotal: roundMoney(subtotal),
      discount: roundMoney(descuento),
      total: roundMoney(total),
      items,
    };
  };

  const buildFirebaseOrderPatchFromQuote = (order = {}, quote = {}, missingCodes = []) => {
    const existingItemsByCode = new Map(
      normalizeOrderItems(order.items).map((item) => [item.code, item])
    );

    const items = (Array.isArray(quote.items) ? quote.items : []).map((item) => {
      const existingItem = existingItemsByCode.get(item.code) || null;
      const safeDescription =
        existingItem?.description && existingItem.description !== item.name
          ? existingItem.description
          : '';

      return {
        codigo: item.code,
        nombre: item.name,
        descripcion: safeDescription,
        unidad: item.storeUnit,
        cantidad: item.quantity,
        precioUnitario: item.price,
        subtotal: item.total,
      };
    });

    return {
      items,
      pedido: buildOrderText(items, order.observaciones, {
        subtotal: quote.subtotal,
        total: quote.total,
        discount: quote.discount,
        totalLabel: 'Total actualizado de pedido',
        subtotalLabel: 'Subtotal actualizado',
      }),
      subtotalEstimado: quote.subtotal,
      total: quote.total,
      totalAproximado: false,
      totalActualizadoPorSicar: true,
      totalActualizadoAt: new Date().toISOString(),
      sicarQuote: {
        status: missingCodes.length > 0 ? 'partial' : 'linked',
        cotId: quote.cotId,
        folioMovil: quote.orderNumber,
        serieMovil: quote.serieMovil || QUOTE_SERIE,
        orderDate: quote.orderDate,
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: quote.total,
        missingCodes,
        lastSyncedAt: new Date().toISOString(),
        lastAppliedAt: new Date().toISOString(),
      },
    };
  };

  const syncOrderQuoteInternal = async (orderKey, options = {}) => {
    const applyToFirebase = options.applyToFirebase === true;
    const order = await getOrderByKey(orderKey);

    if (!order) {
      throw new Error('No se encontro el pedido en Firebase.');
    }

    if (String(order.canal || '').trim() !== STORE_CHANNEL) {
      throw new Error('Solo los pedidos de tienda virtual pueden sincronizar cotizaciones SICAR.');
    }

    let quoteReference = await getQuoteByOrderReference(order);
    let missingCodes = [];
    let createdQuote = false;

    if (!quoteReference) {
      const draft = await buildQuoteDraft(order);
      const created = await insertQuoteDraft(order, draft);
      createdQuote = true;
      missingCodes = Array.isArray(created.missingCodes) ? created.missingCodes : [];
      quoteReference = await getQuoteByOrderReference({
        ...order,
        sicarQuote: {
          ...(order.sicarQuote || {}),
          cotId: created.cotId,
        },
      });
    } else {
      missingCodes = Array.isArray(order?.sicarQuote?.missingCodes) ? order.sicarQuote.missingCodes : [];
    }

    if (!quoteReference?.cotId) {
      throw new Error('No se pudo localizar la cotizacion SICAR para este pedido.');
    }

    const quote = await getQuoteSnapshot(quoteReference);
    const quoteStatus = missingCodes.length > 0 ? 'partial' : 'synced';
    const quoteMetaPatch = {
      status: quoteStatus,
      cotId: quote.cotId,
      folioMovil: quote.orderNumber,
      serieMovil: quote.serieMovil || QUOTE_SERIE,
      orderDate: quote.orderDate,
      subtotal: quote.subtotal,
      discount: quote.discount,
      total: quote.total,
      missingCodes,
      syncedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };

    if (applyToFirebase) {
      const orderPatch = buildFirebaseOrderPatchFromQuote(order, quote, missingCodes);
      await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}`), orderPatch);
    } else {
      await updateOrderQuoteStatus(orderKey, quoteMetaPatch);
    }

    await clearQueueEntry(orderKey);

    return {
      orderKey,
      createdQuote,
      quote,
      missingCodes,
      whatsappMessage: buildCustomerQuoteMessage(order, quote),
      customerPhone: String(order.telefono || '').trim(),
      customerName: String(order.cliente || '').trim(),
    };
  };

  const syncOrderQuote = async (orderKey, options = {}) => {
    const cleanOrderKey = String(orderKey || '').trim();
    if (!cleanOrderKey) {
      throw new Error('Falta el identificador del pedido.');
    }

    if (runningOrderPromises.has(cleanOrderKey)) {
      return runningOrderPromises.get(cleanOrderKey);
    }

    const promise = Promise.resolve()
      .then(() => syncOrderQuoteInternal(cleanOrderKey, options))
      .finally(() => {
        runningOrderPromises.delete(cleanOrderKey);
      });

    runningOrderPromises.set(cleanOrderKey, promise);
    return promise;
  };

  const processQueue = async () => {
    if (state.processing) {
      processRequested = true;
      return;
    }

    state.processing = true;
    state.lastRunAt = new Date().toISOString();
    state.lastError = '';

    try {
      const snapshot = await get(ref(database, QUOTE_QUEUE_PATH));
      const queueData = snapshot.val() || {};
      const queueEntries = Object.entries(queueData)
        .filter(([, value]) => String(value?.status || '').trim().toLowerCase() === 'pending')
        .sort((left, right) => Number(left[1]?.requestedAt || 0) - Number(right[1]?.requestedAt || 0));

      state.pendingCount = queueEntries.length;

      for (const [orderKey, entry] of queueEntries) {
        try {
          const result = await syncOrderQuote(orderKey, { applyToFirebase: false });
          await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}/sicarQuote`), {
            status: result.missingCodes.length > 0 ? 'partial' : 'synced',
            cotId: result.quote.cotId,
            folioMovil: result.quote.orderNumber,
            serieMovil: result.quote.serieMovil || QUOTE_SERIE,
            orderDate: result.quote.orderDate,
            subtotal: result.quote.subtotal,
            discount: result.quote.discount,
            total: result.quote.total,
            missingCodes: result.missingCodes,
            syncedAt: new Date().toISOString(),
            createdQuote: result.createdQuote,
          });
          await clearQueueEntry(orderKey);
          state.syncedCount += 1;
          state.lastProcessedOrderKey = orderKey;
          state.lastQuoteId = Number(result.quote.cotId || 0);
          state.lastSuccessAt = new Date().toISOString();
        } catch (error) {
          await markQueueAsError(orderKey, entry, error);
          state.lastError = String(error?.message || error || 'Fallo desconocido en cola SICAR.');
        }
      }

      state.pendingCount = 0;
    } catch (error) {
      state.lastError = String(error?.message || error || 'No se pudo procesar la cola SICAR.');
    } finally {
      state.processing = false;
      if (processRequested) {
        processRequested = false;
        setTimeout(() => {
          processQueue().catch(() => {});
        }, 50);
      }
    }
  };

  const initAutoSync = () => {
    if (queueListenerStarted) {
      return;
    }

    queueListenerStarted = true;
    queueUnsubscribe = onValue(
      ref(database, QUOTE_QUEUE_PATH),
      (snapshot) => {
        const queueData = snapshot.val() || {};
        state.pendingCount = Object.values(queueData).filter(
          (entry) => String(entry?.status || '').trim().toLowerCase() === 'pending'
        ).length;
        processQueue().catch(() => {});
      },
      (error) => {
        state.lastError = String(error?.message || error || 'No se pudo escuchar la cola SICAR.');
      }
    );
    state.listening = true;
  };

  const stopAutoSync = () => {
    if (typeof queueUnsubscribe === 'function') {
      queueUnsubscribe();
    }
    queueUnsubscribe = null;
    queueListenerStarted = false;
    state.listening = false;
  };

  return {
    state,
    initAutoSync,
    stopAutoSync,
    syncOrderQuote,
  };
}
