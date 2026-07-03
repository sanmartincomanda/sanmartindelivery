import { get, onValue, orderByChild, query, ref, startAt, update } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';
import {
  buildStoreRewardRedemptionTextLines,
  normalizeStoreRewardRedemption,
} from '../src/services/storeRewards.js';

const STORE_CHANNEL = 'tienda_virtual';
const STORE_ORDERS_PATH = 'orders';
const CLIENTS_PATH = 'clients';
const STORE_USERS_PATH = 'storeUsers';
const QUOTE_QUEUE_PATH = 'sicarQuoteQueue';
const LINKED_QUOTES_PATH = 'sicarLinkedQuotes';
const LINKED_QUOTES_REFRESH_MS = 5000;
const DEFAULT_CLIENT_ID = 1;
const DEFAULT_USER_ID = 1;
const DEFAULT_VENDOR_ID = 7;
const DEFAULT_CURRENCY_ID = 1;
const DEFAULT_CURRENCY_ABBR = 'NIO';
const DEFAULT_CURRENCY_EXCHANGE = 1;
const DEFAULT_ZERO_TAX_IMP_ID = 4;
const STORE_CUSTOMER_COMMENT = 'Cliente tienda virtual';

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantity = (value) => Number(Number(value || 0).toFixed(3));
const roundRate = (value) => Number(Number(value || 0).toFixed(6));
const truncateMoney = (value) => Math.trunc(Number(value || 0) * 100) / 100;
const formatMoney = (value) => roundMoney(value).toFixed(2);
const formatQuantity = (value) => roundQuantity(value).toFixed(3);
const formatRate = (value) => roundRate(value).toFixed(6);
const normalizeText = (value = '') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const normalizeCode = (value = '') => String(value ?? '').trim();
const normalizeEmail = (value = '') => String(value ?? '').trim().toLowerCase();
const normalizePhone = (value = '') => String(value ?? '').replace(/[^\d+]/g, '').trim();
const normalizePaymentMethodLabel = (value = '') => {
  const normalized = removeTextAccents(value || '');

  if (normalized.includes('efectivo')) {
    return 'EFECTIVO';
  }

  if (normalized.includes('pos') || normalized.includes('tarjeta')) {
    return 'POS / TARJETA';
  }

  if (normalized.includes('link')) {
    return 'LINK DE PAGO';
  }

  if (normalized.includes('transfer')) {
    return 'TRANSFERENCIA';
  }

  return String(value || '').trim().toUpperCase() || 'METODO DE PAGO';
};
const toComparableValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

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

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeOrderStatus = (status) => removeTextAccents(status || 'pendiente');

const isFinalStoreStatus = (status) => {
  const normalizedStatus = normalizeOrderStatus(status);
  return (
    normalizedStatus.includes('entregado') ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('anulad')
  );
};

const formatDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLinkedQuoteSeedStartDate = (daysBack = 90) => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() - Math.max(1, Number(daysBack || 90)));
  return formatDateKey(baseDate);
};

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

const DELIVERY_SERVICE_CODES_BY_BRACKET = {
  under2km: '00171',
  under35km: '00172',
  under4km: '00247',
  under6km: '00248',
  above6km: '00249',
};
const DELIVERY_SERVICE_CODES = new Set(
  Object.values(DELIVERY_SERVICE_CODES_BY_BRACKET).map((code) => normalizeCode(code)).filter(Boolean)
);
const isDeliveryServiceCode = (value = '') => DELIVERY_SERVICE_CODES.has(normalizeCode(value));

const resolveDeliveryServiceBracketKey = (order = {}) => {
  const explicitKey = String(order?.deliveryFeeBracket || '').trim();
  if (explicitKey && DELIVERY_SERVICE_CODES_BY_BRACKET[explicitKey]) {
    return explicitKey;
  }

  const distanceKm = Number(order?.deliveryDistanceKm || 0);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return '';
  }

  if (distanceKm < 2) return 'under2km';
  if (distanceKm < 3.5) return 'under35km';
  if (distanceKm < 4) return 'under4km';
  if (distanceKm < 6) return 'under6km';
  return 'above6km';
};

const buildDeliveryServiceOrderItem = (order = {}) => {
  const deliveryFee = roundMoney(order?.deliveryFee || 0);
  if (deliveryFee <= 0) {
    return null;
  }

  const bracketKey = resolveDeliveryServiceBracketKey(order);
  const code = DELIVERY_SERVICE_CODES_BY_BRACKET[bracketKey] || '';
  if (!code) {
    throw new Error('No se pudo determinar el SKU de servicio a domicilio para este pedido.');
  }

  return {
    code,
    name: 'SERVICIO A DOMICILIO',
    description: 'Servicio a domicilio',
    unit: 'unidad',
    quantity: 1,
    unitPrice: deliveryFee,
    subtotal: deliveryFee,
    isDelivery: true,
    deliveryFeeBracket: bracketKey,
  };
};

const normalizeRewardOrderItems = (rewardRedemption = {}) => {
  const normalizedRewardRedemption = normalizeStoreRewardRedemption(rewardRedemption);
  if (!normalizedRewardRedemption) {
    return [];
  }

  return (Array.isArray(normalizedRewardRedemption.items) ? normalizedRewardRedemption.items : [])
    .map((item) => ({
      code: String(item?.productCode || '').trim(),
      name: String(item?.productName || item?.choiceLabel || '').trim(),
      description: '',
      unit: 'unidad',
      quantity: roundQuantity(item?.quantity || 0),
      unitPrice: 0,
      subtotal: 0,
      rewardId: String(normalizedRewardRedemption.rewardId || '').trim(),
      rewardName: String(normalizedRewardRedemption.rewardName || '').trim(),
      isReward: true,
    }))
    .filter((item) => item.code && item.quantity > 0);
};

const calculateOrderCouponDiscount = (order = {}, baseTotal = 0) => {
  const safeBaseTotal = roundMoney(baseTotal);
  if (safeBaseTotal <= 0) {
    return 0;
  }

  const coupon = order?.cupon || {};
  const couponType = String(coupon?.type || '').trim().toLowerCase();
  const couponValue = roundMoney(coupon?.value || 0);
  const explicitDiscount = roundMoney(order?.descuentoCupon || 0);

  if (couponType === 'percent') {
    const percent = Math.min(Math.max(Number(couponValue || 0), 0), 100);
    return roundMoney((safeBaseTotal * percent) / 100);
  }

  if (explicitDiscount > 0) {
    return roundMoney(Math.min(explicitDiscount, safeBaseTotal));
  }

  if (couponType === 'amount' && couponValue > 0) {
    return roundMoney(Math.min(couponValue, safeBaseTotal));
  }

  return 0;
};

const deriveQuotedProductSubtotal = (quote = {}, order = {}) => {
  const explicitProductSubtotal = roundMoney(quote?.productSubtotal || 0);
  if (explicitProductSubtotal > 0) {
    return explicitProductSubtotal;
  }

  return roundMoney(
    Math.max(
      roundMoney(quote?.sicarTotal ?? quote?.total ?? 0) - roundMoney(order?.deliveryFee || 0),
      0
    )
  );
};

const buildOrderText = (items = [], notes = '', summary = {}) => {
  const normalizedItems = normalizeOrderItems(items);
  const subtotal = roundMoney(
    summary.subtotal ?? normalizedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const total = roundMoney(summary.total ?? subtotal);
  const discount = roundMoney(summary.discount || 0);
  const totalLabel = String(summary.totalLabel || 'Total aproximado de pedido').trim();
  const subtotalLabel = String(summary.subtotalLabel || 'Subtotal estimado').trim();
  const deliveryFee = roundMoney(summary.deliveryFee || 0);
  const deliveryDistanceKm = Number(summary.deliveryDistanceKm || 0);
  const paymentMethodLabel = normalizePaymentMethodLabel(summary.paymentMethod || summary.metodoPago);
  const lines = [];
  const rewardLines = buildStoreRewardRedemptionTextLines(summary.rewardRedemption);
  const cleanNotes = normalizeText(notes || summary.notes || '');

  if (discount > 0) {
    lines.push(`ALERTA APLICA CUPON C$${formatMoney(discount)}`);
    lines.push('');
  }

  lines.push(
    ...normalizedItems.map(
      (item) => `- ${formatStoreQuantityLabel(item.quantity, item.unit)} ${item.unit} ${item.name}`.trim()
    )
  );

  if (rewardLines.length > 0) {
    lines.push('');
    lines.push(...rewardLines);
  }

  if (subtotal > 0) {
    lines.push('');
    lines.push(`${subtotalLabel}: C$${formatMoney(subtotal)}`);
    if (deliveryFee > 0) {
      const deliveryLabel =
        deliveryDistanceKm > 0
          ? `Servicio a domicilio (${formatWeightLabel(deliveryDistanceKm)} km)`
          : 'Servicio a domicilio';
      lines.push(`${deliveryLabel}: C$${formatMoney(deliveryFee)}`);
    }
    if (discount > 0) {
      lines.push(`Cupon aplicado: -C$${formatMoney(discount)}`);
      lines.push(`Metodo de pago: ${paymentMethodLabel}`);
    }
    lines.push(`${totalLabel}: C$${formatMoney(total)}`);
  }

  if (cleanNotes) {
    lines.push('');
    lines.push('Notas del cliente:');
    lines.push(cleanNotes);
  }

  return lines.join('\n').trim();
};

const buildCustomerQuoteMessage = (order = {}, quote = {}) => {
  const orderNumber = String(order?.id || '').padStart(3, '0');
  const customerDiscount = roundMoney(
    quote?.customerDiscount ?? quote?.discount ?? order?.descuentoCupon ?? 0
  );
  const customerTotal = roundMoney(
    quote?.customerTotal ?? Math.max(roundMoney(quote?.total || 0) - customerDiscount, 0)
  );
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
  if (customerDiscount > 0) {
    lines.push(`Cupon aplicado: -C$${formatMoney(customerDiscount)}`);
  }
  lines.push(`Total actualizado: C$${formatMoney(customerTotal)}`);

  if (order?.observaciones) {
    lines.push(`Observaciones: ${String(order.observaciones).trim()}`);
  }

  return lines.filter(Boolean).join('\n').trim();
};

const buildQuoteFingerprint = (quote = {}) =>
  JSON.stringify({
    cotId: Number(quote?.cotId || 0),
    subtotal: roundMoney(quote?.subtotal || 0),
    discount: roundMoney(quote?.discount || 0),
    total: roundMoney(quote?.total || 0),
    customerTotal: roundMoney(quote?.customerTotal || 0),
    items: (Array.isArray(quote?.items) ? quote.items : []).map((item) => ({
      code: String(item?.code || '').trim(),
      quantity: roundQuantity(item?.quantity || 0),
      unit: String(item?.storeUnit || item?.unit || '').trim().toLowerCase(),
      price: roundMoney(item?.price || 0),
      total: roundMoney(item?.total || 0),
    })),
  });

export function createSicarQuoteSyncManager({ runMysqlQuery, sqlEscape }) {
  const database = getAuthenticatedFirebaseDatabase();
  const state = {
    listening: false,
    processing: false,
    refreshingLinkedQuotes: false,
    pendingCount: 0,
    syncedCount: 0,
    watchedQuotesCount: 0,
    lastRunAt: '',
    lastLinkedRefreshAt: '',
    lastAutoApplyAt: '',
    lastSuccessAt: '',
    lastError: '',
    lastProcessedOrderKey: '',
    lastQuoteId: 0,
  };

  const runningOrderPromises = new Map();
  let queueListenerStarted = false;
  let queueUnsubscribe = null;
  let processRequested = false;
  let linkedQuotesRefreshTimer = null;
  let linkedQuotesRefreshing = false;

  const updateOrderQuoteStatus = async (orderKey, patch = {}) => {
    if (!orderKey || !patch || typeof patch !== 'object') {
      return;
    }

    await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}/sicarQuote`), patch);
  };

  const syncLinkedQuoteWatch = async (orderKey, order = {}, quote = {}, options = {}) => {
    if (!orderKey || !quote?.cotId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const fingerprint = buildQuoteFingerprint(quote);
    const watchRef = ref(database, `${LINKED_QUOTES_PATH}/${orderKey}`);
    const existingSnapshot = await get(watchRef);
    const existingWatch = existingSnapshot.val() || {};
    const hasObservedFingerprint = Boolean(String(existingWatch?.lastObservedFingerprint || '').trim());
    const patch = {
      cotId: Number(quote.cotId || 0),
      appOrderNumber: Number(order.id || 0),
      orderDate: String(quote.orderDate || order.fecha || '').trim(),
      customerName: String(order.cliente || '').trim(),
      orderStatus: String(order.estado || 'Pendiente').trim(),
      subtotal: deriveQuotedProductSubtotal(quote, order),
      discount: roundMoney(quote.discount || 0),
      total: roundMoney(quote.total || 0),
      customerTotal: roundMoney(quote.customerTotal || 0),
      grossTotal: roundMoney(quote.sicarTotal || quote.total || 0),
      autoApply: true,
      updatedAt: nowIso,
    };

    if (options.applyToFirebase === true) {
      patch.lastObservedFingerprint = fingerprint;
      patch.lastObservedAt = nowIso;
      patch.lastAppliedFingerprint = fingerprint;
      patch.lastAppliedAt = nowIso;
    } else if (!hasObservedFingerprint) {
      patch.lastObservedFingerprint = fingerprint;
      patch.lastObservedAt = nowIso;

      if (order?.totalAproximado === false) {
        patch.lastAppliedFingerprint = fingerprint;
        patch.lastAppliedAt = nowIso;
      }
    }

    await update(watchRef, patch);
  };

  const seedLinkedQuoteWatchesFromOrders = async () => {
    const snapshot = await get(
      query(
        ref(database, STORE_ORDERS_PATH),
        orderByChild('fecha'),
        startAt(getLinkedQuoteSeedStartDate())
      )
    );
    const orders = snapshot.val() || {};
    const updates = {};
    const nowIso = new Date().toISOString();

    Object.entries(orders).forEach(([orderKey, order]) => {
      const cotId = Number(order?.sicarQuote?.cotId || 0);
      if (String(order?.canal || '').trim() !== STORE_CHANNEL || cotId <= 0) {
        return;
      }

      if (isFinalStoreStatus(order?.estado)) {
        updates[`${LINKED_QUOTES_PATH}/${orderKey}`] = null;
        return;
      }

      updates[`${LINKED_QUOTES_PATH}/${orderKey}/cotId`] = cotId;
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/appOrderNumber`] = Number(order?.id || 0);
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/orderDate`] = String(order?.fecha || '').trim();
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/customerName`] = String(order?.cliente || '').trim();
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/orderStatus`] = String(order?.estado || 'Pendiente').trim();
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/autoApply`] = true;
      updates[`${LINKED_QUOTES_PATH}/${orderKey}/updatedAt`] = nowIso;
    });

    if (Object.keys(updates).length > 0) {
      await update(ref(database), updates);
    }
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

  const getFirebaseClientRecord = async (clientKey = '') => {
    const cleanKey = normalizeCode(clientKey);
    if (!cleanKey) {
      return null;
    }

    const snapshot = await get(ref(database, `${CLIENTS_PATH}/${cleanKey}`));
    const value = snapshot.val();
    return value ? { firebaseKey: cleanKey, ...value } : null;
  };

  const getStoreUserRecord = async (storeUserKey = '') => {
    const cleanKey = normalizeCode(storeUserKey);
    if (!cleanKey) {
      return null;
    }

    const snapshot = await get(ref(database, `${STORE_USERS_PATH}/${cleanKey}`));
    const value = snapshot.val();
    return value ? { firebaseKey: cleanKey, ...value } : null;
  };

  const buildStoreUserFullAddress = (storeUser = {}) => {
    const baseAddress = normalizeText(storeUser?.direccion);
    const reference = normalizeText(storeUser?.referencia);
    return reference ? `${baseAddress} | Ref: ${reference}` : baseAddress;
  };

  const parseSicarCustomerRow = (line = '') => {
    const parts = String(line || '').split('\t');
    return {
      cliId: Number(parts[0] || 0),
      clave: normalizeCode(parts[1]),
      name: normalizeText(parts[2]),
      address: normalizeText(parts[3]),
      phone: normalizeText(parts[4]),
      mobile: normalizeText(parts[5]),
      email: normalizeEmail(parts[6]),
      rfc: normalizeText(parts[7]),
      status: Number(parts[8] || 0),
    };
  };

  const getSicarCustomerById = async (cliId) => {
    const cleanCliId = Number(cliId || 0);
    if (cleanCliId <= 0) {
      return null;
    }

    const rows = await runMysqlQuery(`
      SELECT
        cli_id,
        COALESCE(clave, ''),
        COALESCE(nombre, ''),
        COALESCE(domicilio, ''),
        COALESCE(telefono, ''),
        COALESCE(celular, ''),
        COALESCE(mail, ''),
        COALESCE(rfc, ''),
        COALESCE(status, 0)
      FROM cliente
      WHERE cli_id = ${cleanCliId}
      LIMIT 1;
    `);

    return rows.length > 0 ? parseSicarCustomerRow(rows[0]) : null;
  };

  const getSicarCustomerByClave = async (clave = '') => {
    const cleanClave = normalizeCode(clave);
    if (!cleanClave) {
      return null;
    }

    const rows = await runMysqlQuery(`
      SELECT
        cli_id,
        COALESCE(clave, ''),
        COALESCE(nombre, ''),
        COALESCE(domicilio, ''),
        COALESCE(telefono, ''),
        COALESCE(celular, ''),
        COALESCE(mail, ''),
        COALESCE(rfc, ''),
        COALESCE(status, 0)
      FROM cliente
      WHERE clave = ${escapeSqlText(cleanClave, sqlEscape)}
      LIMIT 1;
    `);

    return rows.length > 0 ? parseSicarCustomerRow(rows[0]) : null;
  };

  const getActiveSicarCustomerByPhone = async (phone = '') => {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return null;
    }

    const rows = await runMysqlQuery(`
      SELECT
        cli_id,
        COALESCE(clave, ''),
        COALESCE(nombre, ''),
        COALESCE(domicilio, ''),
        COALESCE(telefono, ''),
        COALESCE(celular, ''),
        COALESCE(mail, ''),
        COALESCE(rfc, ''),
        COALESCE(status, 0)
      FROM cliente
      WHERE status = 1
        AND (
          REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(telefono, ''), ' ', ''), '-', ''), '(', ''), ')', '') = ${escapeSqlText(cleanPhone, sqlEscape)}
          OR REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(celular, ''), ' ', ''), '-', ''), '(', ''), ')', '') = ${escapeSqlText(cleanPhone, sqlEscape)}
        )
      ORDER BY cli_id ASC
      LIMIT 1;
    `);

    return rows.length > 0 ? parseSicarCustomerRow(rows[0]) : null;
  };

  const buildDesiredSicarCustomer = (order = {}, firebaseClient = null, storeUser = null) => {
    const orderAddress = normalizeText(order?.direccion);
    const profileAddress = buildStoreUserFullAddress(storeUser) || normalizeText(firebaseClient?.direccion);
    const preferredAddress = profileAddress || orderAddress || '-';

    return {
      firebaseClientKey: normalizeCode(order?.clienteFirebaseKey),
      storeUserKey: normalizeCode(order?.storeUserKey),
      code: normalizeCode(order?.clienteCodigo || storeUser?.codigo || firebaseClient?.codigo),
      name: normalizeText(order?.cliente || storeUser?.nombre || firebaseClient?.nombre),
      address: preferredAddress,
      phone: normalizePhone(order?.telefono || storeUser?.telefono || firebaseClient?.telefono || firebaseClient?.celular),
      email: normalizeEmail(storeUser?.mail || storeUser?.email || firebaseClient?.mail || firebaseClient?.email),
      linkedCliId:
        Number(storeUser?.sicarCliId || 0) ||
        Number(firebaseClient?.sicarCliId || 0) ||
        Number(order?.sicarQuote?.cliId || 0),
      shouldOverwriteAddress: normalizeText(order?.deliveryMode) !== 'otra',
    };
  };

  const createSicarCustomer = async (customer = {}) => {
    let rows = [];

    try {
      rows = await runMysqlQuery(`
        START TRANSACTION;
        INSERT INTO cliente (
          nombre,
          domicilio,
          noExt,
          noInt,
          localidad,
          ciudad,
          estado,
          pais,
          codigoPostal,
          colonia,
          rfc,
          curp,
          telefono,
          celular,
          mail,
          comentario,
          status,
          limite,
          precio,
          diasCredito,
          retener,
          desglosarIEPS,
          notificar,
          clave
        ) VALUES (
          ${escapeSqlText(customer.name || 'Cliente tienda virtual', sqlEscape)},
          ${escapeSqlText(customer.address || '-', sqlEscape)},
          '',
          '',
          '',
          '',
          '',
          'NICARAGUA',
          '',
          '',
          '',
          '',
          ${escapeSqlText(customer.phone || '', sqlEscape)},
          ${escapeSqlText(customer.phone || '', sqlEscape)},
          ${escapeSqlText(customer.email || '', sqlEscape)},
          ${escapeSqlText(STORE_CUSTOMER_COMMENT, sqlEscape)},
          1,
          0,
          1,
          0,
          0,
          0,
          1,
          ${customer.code ? escapeSqlText(customer.code, sqlEscape) : 'NULL'}
        );
        SELECT LAST_INSERT_ID();
        COMMIT;
      `);
    } catch (error) {
      const errorMessage = String(error?.message || error || '').trim();
      const isDuplicateCode =
        customer.code &&
        errorMessage.toLowerCase().includes('duplicate entry') &&
        errorMessage.toLowerCase().includes('clave_unique');

      if (!isDuplicateCode) {
        throw error;
      }

      const existing = await getSicarCustomerByClave(customer.code);
      if (existing?.cliId) {
        return {
          ...existing,
          created: false,
          matchedBy: 'duplicate-code',
        };
      }

      throw error;
    }

    const insertedId = Number(rows[rows.length - 1] || 0);
    if (insertedId <= 0) {
      throw new Error('No se pudo crear el cliente en SICAR antes de generar la cotizacion.');
    }

    const inserted = await getSicarCustomerById(insertedId);
    if (!inserted?.cliId) {
      throw new Error('SICAR no devolvio el cliente creado para la cotizacion.');
    }

    return {
      ...inserted,
      created: true,
      matchedBy: 'created',
    };
  };

  const updateSicarCustomer = async (existingCustomer = {}, desiredCustomer = {}) => {
    const nextAddress =
      desiredCustomer.shouldOverwriteAddress || !normalizeText(existingCustomer?.address)
        ? desiredCustomer.address || existingCustomer?.address || '-'
        : existingCustomer?.address || '-';

    const desiredPatch = {
      nombre: desiredCustomer.name || existingCustomer?.name || 'Cliente tienda virtual',
      domicilio: nextAddress,
      telefono: desiredCustomer.phone || existingCustomer?.phone || '',
      celular: desiredCustomer.phone || existingCustomer?.mobile || '',
      mail: desiredCustomer.email || existingCustomer?.email || '',
      comentario: STORE_CUSTOMER_COMMENT,
      status: 1,
      notificar: 1,
      clave: desiredCustomer.code || existingCustomer?.clave || '',
    };

    const comparableExisting = {
      nombre: normalizeText(existingCustomer?.name),
      domicilio: normalizeText(existingCustomer?.address),
      telefono: normalizeText(existingCustomer?.phone),
      celular: normalizeText(existingCustomer?.mobile),
      mail: normalizeEmail(existingCustomer?.email),
      comentario: STORE_CUSTOMER_COMMENT,
      status: Number(existingCustomer?.status || 0),
      notificar: 1,
      clave: normalizeCode(existingCustomer?.clave),
    };

    const changedFields = Object.entries(desiredPatch).filter(([field, value]) => {
      if (field === 'clave' && !value) {
        return false;
      }
      return toComparableValue(comparableExisting[field]) !== toComparableValue(value);
    });

    if (changedFields.length === 0) {
      return {
        ...existingCustomer,
        created: false,
        matchedBy: 'existing',
      };
    }

    const assignments = changedFields
      .map(([field, value]) =>
        `${field} = ${typeof value === 'number' ? Number(value) : escapeSqlText(value, sqlEscape)}`
      )
      .join(', ');

    await runMysqlQuery(`
      UPDATE cliente
      SET ${assignments}
      WHERE cli_id = ${Number(existingCustomer.cliId || 0)}
      LIMIT 1;
    `);

    const refreshed = await getSicarCustomerById(existingCustomer.cliId);
    return {
      ...(refreshed || existingCustomer),
      created: false,
      matchedBy: 'existing',
    };
  };

  const syncCustomerLinksToFirebase = async (orderKey, order = {}, sicarCustomer = {}) => {
    if (!orderKey || !sicarCustomer?.cliId) {
      return;
    }

    const nowIso = new Date().toISOString();
    const rootUpdates = {
      [`${STORE_ORDERS_PATH}/${orderKey}/sicarQuote/cliId`]: Number(sicarCustomer.cliId || 0),
      [`${STORE_ORDERS_PATH}/${orderKey}/sicarQuote/clientCode`]: normalizeCode(sicarCustomer.clave),
      [`${STORE_ORDERS_PATH}/${orderKey}/sicarQuote/clientName`]: normalizeText(sicarCustomer.name),
      [`${STORE_ORDERS_PATH}/${orderKey}/sicarQuote/customerLinkedAt`]: nowIso,
    };

    if (order?.storeUserKey) {
      rootUpdates[`${STORE_USERS_PATH}/${order.storeUserKey}/sicarCliId`] = Number(sicarCustomer.cliId || 0);
      rootUpdates[`${STORE_USERS_PATH}/${order.storeUserKey}/sicarClave`] = normalizeCode(sicarCustomer.clave);
      rootUpdates[`${STORE_USERS_PATH}/${order.storeUserKey}/sicarStatus`] = Number(sicarCustomer.status || 1);
      rootUpdates[`${STORE_USERS_PATH}/${order.storeUserKey}/sicarLastSyncedAt`] = nowIso;
    }

    if (order?.clienteFirebaseKey) {
      rootUpdates[`${CLIENTS_PATH}/${order.clienteFirebaseKey}/sicarCliId`] = Number(sicarCustomer.cliId || 0);
      rootUpdates[`${CLIENTS_PATH}/${order.clienteFirebaseKey}/sicarClave`] = normalizeCode(sicarCustomer.clave);
      rootUpdates[`${CLIENTS_PATH}/${order.clienteFirebaseKey}/sicarStatus`] = Number(sicarCustomer.status || 1);
      rootUpdates[`${CLIENTS_PATH}/${order.clienteFirebaseKey}/sicarLastSyncedAt`] = nowIso;
    }

    await update(ref(database), rootUpdates);
  };

  const ensureSicarCustomerForOrder = async (orderKey, order = {}) => {
    const [firebaseClient, storeUser] = await Promise.all([
      getFirebaseClientRecord(order?.clienteFirebaseKey),
      getStoreUserRecord(order?.storeUserKey),
    ]);

    const desiredCustomer = buildDesiredSicarCustomer(order, firebaseClient, storeUser);
    if (!desiredCustomer.name) {
      throw new Error('Falta el nombre del cliente para crear la cotizacion SICAR.');
    }

    let existingCustomer = null;

    if (desiredCustomer.linkedCliId > 0) {
      existingCustomer = await getSicarCustomerById(desiredCustomer.linkedCliId);
    }

    if (!existingCustomer && desiredCustomer.code) {
      if (/^\d+$/.test(desiredCustomer.code)) {
        existingCustomer = await getSicarCustomerById(desiredCustomer.code);
      }

      if (!existingCustomer) {
        existingCustomer = await getSicarCustomerByClave(desiredCustomer.code);
      }
    }

    if (!existingCustomer && desiredCustomer.phone) {
      existingCustomer = await getActiveSicarCustomerByPhone(desiredCustomer.phone);
    }

    const sicarCustomer = existingCustomer
      ? await updateSicarCustomer(existingCustomer, desiredCustomer)
      : await createSicarCustomer(desiredCustomer);

    await syncCustomerLinksToFirebase(orderKey, order, sicarCustomer);
    return sicarCustomer;
  };

  const getQuoteByOrderReference = async (order = {}) => {
    const explicitQuoteId = Number(order?.sicarQuote?.cotId || 0);
    if (explicitQuoteId > 0) {
      const rows = await runMysqlQuery(`
        SELECT cot_id, fecha, subtotal, descuento, total
        FROM cotizacion
        WHERE cot_id = ${explicitQuoteId}
        LIMIT 1;
      `);

      if (rows.length > 0) {
        const [cotId, fecha, subtotal, descuento, total] = rows[0].split('\t');
        return {
          cotId: Number(cotId || 0),
          fecha: String(fecha || '').trim(),
          subtotal: roundMoney(subtotal),
          discount: roundMoney(descuento),
          total: roundMoney(total),
        };
      }
    }

    return null;
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
        ROUND(a.preCompraProm, 6),
        ROUND(a.precio1, 6),
        ROUND(a.precio1 * (1 + COALESCE(tax.taxRatePct, 0) / 100), 6),
        COALESCE(tax.taxRatePct, 0),
        COALESCE(tax.impIds, ''),
        COALESCE(d.nombre, ''),
        COALESCE(c.nombre, ''),
        COALESCE(a.caracteristicas, '')
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
        purchaseAveragePrice: roundRate(parts[5]),
        basePrice: roundRate(parts[6]),
        priceWithTax: roundRate(parts[7]),
        taxRatePct: roundRate(parts[8]),
        impIds: parseImpIds(parts[9]),
        department: String(parts[10] || '').trim(),
        category: String(parts[11] || '').trim(),
        characteristics: String(parts[12] || '').trim(),
      });
    });

    return map;
  };

  const buildQuoteDraft = async (order = {}) => {
    const orderItems = normalizeOrderItems(order.items);
    const deliveryItem = buildDeliveryServiceOrderItem(order);
    const rewardItems = normalizeRewardOrderItems(order.rewardRedemption);
    const sourceItems = [...orderItems, ...(deliveryItem ? [deliveryItem] : []), ...rewardItems];
    const articleMap = await getSicarArticlesByCodes(sourceItems.map((item) => item.code));
    const missingCodes = [];
    const detailItems = [];

    sourceItems.forEach((item, index) => {
      const article = articleMap.get(item.code);
      if (!article) {
        if (item.isDelivery === true) {
          throw new Error(`No existe en SICAR el articulo ${item.code} para servicio a domicilio.`);
        }
        missingCodes.push(item.code);
        return;
      }

      const quantity = roundQuantity(item.quantity);
      const taxRatePct = roundRate(article.taxRatePct || 0);
      const hasTransferredTax = taxRatePct > 0;
      const isReward = item.isReward === true;
      const isDelivery = item.isDelivery === true;
      const deliveryUnitTotal =
        isDelivery && quantity > 0 ? roundMoney(Number(item.subtotal || 0) / quantity) : 0;
      const sourceBasePrice =
        isDelivery && deliveryUnitTotal > 0
          ? roundMoney(hasTransferredTax ? deliveryUnitTotal / (1 + taxRatePct / 100) : deliveryUnitTotal)
          : roundRate(article.basePrice);
      const sourceGrossPrice =
        isDelivery && deliveryUnitTotal > 0
          ? roundMoney(deliveryUnitTotal)
          : roundMoney(hasTransferredTax ? article.basePrice * (1 + taxRatePct / 100) : article.basePrice);
      const priceNorSin = roundMoney(sourceBasePrice);
      const priceSin = truncateMoney(sourceBasePrice);
      const priceNorCon = roundMoney(sourceGrossPrice);
      const priceCon = priceNorCon;
      const purchaseBase = roundRate(article.purchaseAveragePrice || article.purchasePrice || 0);
      const purchasePrice = roundMoney(
        hasTransferredTax ? purchaseBase * (1 + taxRatePct / 100) : purchaseBase
      );
      const importeCompra = roundMoney(purchasePrice * quantity);
      const importeNorSin = roundMoney(priceNorSin * quantity);
      const importeNorCon = roundMoney(priceNorCon * quantity);
      const initialImporteSin = isReward ? 0 : roundMoney(priceSin * quantity);
      const initialImporteCon = isReward ? 0 : roundMoney(priceCon * quantity);
      const initialPriceSin = quantity > 0 ? roundMoney(initialImporteSin / quantity) : 0;
      const initialPriceCon = quantity > 0 ? roundMoney(initialImporteCon / quantity) : 0;
      const initialDiscountTotal = isReward ? roundMoney(importeNorCon) : 0;
      const initialDiscountPercent =
        isReward && importeNorCon > 0 ? roundRate((initialDiscountTotal / importeNorCon) * 100) : 0;
      const diferencia = roundMoney(initialImporteCon - importeCompra);
      const utilidad = initialImporteCon > 0 ? roundRate((diferencia / initialImporteCon) * 100) : 0;
      const taxImpIds = (Array.isArray(article.impIds) ? article.impIds : []).filter((impId) => Number(impId) === 1);

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
        characteristics: article.characteristics || '',
        purchasePrice,
        priceNorSin,
        priceNorCon,
        priceSin: initialPriceSin,
        priceCon: initialPriceCon,
        importeCompra,
        importeNorSin,
        importeNorCon,
        importeSin: initialImporteSin,
        importeCon: initialImporteCon,
        diferencia,
        utilidad,
        taxRatePct,
        impIds: taxImpIds,
        department: article.department,
        category: article.category,
        sourceType: isReward ? 'reward' : isDelivery ? 'delivery' : 'order',
        rewardName: isReward ? String(item.rewardName || '').trim() : '',
        discountPercent: initialDiscountPercent,
        discountTotal: initialDiscountTotal,
        couponDiscountCon: 0,
      });
    });

    if (detailItems.length === 0) {
      throw new Error('No se pudo crear la cotizacion porque ningun SKU del pedido existe en SICAR.');
    }

    const eligibleCouponItems = detailItems.filter((item) => item.sourceType === 'order');
    const couponBaseTotal = roundMoney(
      eligibleCouponItems.reduce((sum, item) => sum + roundMoney(item.importeCon), 0)
    );
    const couponDiscount = calculateOrderCouponDiscount(order, couponBaseTotal);

    const subtotal = roundMoney(detailItems.reduce((sum, item) => sum + item.importeSin, 0));
    const grossTotal = roundMoney(detailItems.reduce((sum, item) => sum + item.importeCon, 0));
    const customerTotal = roundMoney(Math.max(grossTotal - couponDiscount, 0));
    const taxableSubtotal = roundMoney(
      detailItems.reduce((sum, item) => sum + (item.impIds.length > 0 ? item.importeSin : 0), 0)
    );
    const transferredTaxTotal = roundMoney(
      detailItems.reduce((sum, item) => sum + (item.impIds.length > 0 ? item.importeCon - item.importeSin : 0), 0)
    );
    const taxRows = [
      {
        impId: DEFAULT_ZERO_TAX_IMP_ID,
        taxTotal: 0,
        taxableSubtotal: 0,
        tras: 0,
      },
      {
        impId: 1,
        taxTotal: transferredTaxTotal,
        taxableSubtotal,
        tras: 1,
      },
    ];

    return {
      orderDate: String(order.fecha || '').trim(),
      subtotal,
      total: grossTotal,
      sicarTotal: grossTotal,
      discount: couponDiscount,
      customerDiscount: couponDiscount,
      customerTotal,
      detailItems,
      taxRows,
      missingCodes,
    };
  };

  const insertQuoteDraft = async (order = {}, draft = {}, sicarCustomer = null) => {
    const header = '';
    const footer = '';
    const targetCliId = Number(sicarCustomer?.cliId || DEFAULT_CLIENT_ID || 1);

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
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        NULL,
        ${formatMoney(item.diferencia)},
        ${formatRate(item.utilidad)},
        ${formatRate(item.discountPercent || 0)},
        ${formatMoney(item.discountTotal || 0)},
        ${escapeSqlText(item.characteristics || '', sqlEscape)},
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
          .filter((impId) => Number(impId || 0) === 1)
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
        0.00,
        ${formatMoney(draft.sicarTotal || draft.total)},
        NULL,
        NULL,
        NULL,
        ${escapeSqlText(DEFAULT_CURRENCY_ABBR, sqlEscape)},
        ${formatRate(DEFAULT_CURRENCY_EXCHANGE)},
        0.0000,
        1,
        1,
        0,
        0,
        0,
        1,
        1,
        1,
        1,
        0,
        0,
        0,
        1,
        NULL,
        NULL,
        NULL,
        NULL,
        ${DEFAULT_USER_ID},
        ${targetCliId},
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

  const assignCustomerToQuote = async (quoteId, sicarCustomer = {}) => {
    const cleanQuoteId = Number(quoteId || 0);
    const cleanCliId = Number(sicarCustomer?.cliId || 0);
    if (cleanQuoteId <= 0 || cleanCliId <= 0) {
      return;
    }

    await runMysqlQuery(`
      UPDATE cotizacion
      SET cli_id = ${cleanCliId}
      WHERE cot_id = ${cleanQuoteId}
        AND cli_id <> ${cleanCliId};
    `);
  };

  const getQuoteSnapshot = async (quoteReference = {}) => {
    const quoteId = Number(quoteReference?.cotId || 0);
    if (quoteId <= 0) {
      throw new Error('No existe una cotizacion SICAR enlazada para este pedido.');
    }

    const headerRows = await runMysqlQuery(`
      SELECT cot_id, fecha, subtotal, descuento, total
      FROM cotizacion
      WHERE cot_id = ${quoteId}
      LIMIT 1;
    `);

    if (headerRows.length === 0) {
      throw new Error('La cotizacion SICAR enlazada ya no existe.');
    }

    const [cotId, fecha, subtotal, descuento, total] = headerRows[0].split('\t');
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

    const headerDiscount = roundMoney(descuento);
    const headerTotal = roundMoney(total);

    return {
      cotId: Number(cotId || 0),
      orderDate: String(fecha || '').trim(),
      subtotal: roundMoney(headerTotal + headerDiscount),
      netSubtotal: roundMoney(subtotal),
      discount: headerDiscount,
      total: headerTotal,
      items,
    };
  };

  const buildFirebaseOrderPatchFromQuote = (order = {}, quote = {}, missingCodes = [], sicarCustomer = null) => {
    const existingItemsByCode = new Map(
      normalizeOrderItems(order.items).map((item) => [item.code, item])
    );
    const grossTotal = roundMoney(quote?.sicarTotal || quote?.total || 0);
    const customerDiscount = roundMoney(
      quote?.customerDiscount ?? quote?.discount ?? calculateOrderCouponDiscount(order, grossTotal)
    );
    const customerTotal = roundMoney(
      quote?.customerTotal ?? Math.max(grossTotal - customerDiscount, 0)
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
    const productSubtotal = deriveQuotedProductSubtotal({ ...quote, sicarTotal: grossTotal }, order);

    return {
      items,
      pedido: buildOrderText(items, order.observaciones, {
        subtotal: productSubtotal,
        total: customerTotal,
        discount: customerDiscount,
        deliveryFee: order.deliveryFee,
        deliveryDistanceKm: order.deliveryDistanceKm,
        metodoPago: order.metodoPago,
        totalLabel: 'Total actualizado de pedido',
        subtotalLabel: 'Subtotal actualizado',
        rewardRedemption: order.rewardRedemption,
      }),
      subtotalEstimado: productSubtotal,
      descuentoCupon: customerDiscount,
      total: customerTotal,
      totalAproximado: false,
      totalActualizadoPorSicar: true,
      totalActualizadoAt: new Date().toISOString(),
      sicarQuote: {
        status: missingCodes.length > 0 ? 'partial' : 'linked',
        cotId: quote.cotId,
        appOrderNumber: Number(order.id || 0),
        orderDate: quote.orderDate,
        cliId: Number(sicarCustomer?.cliId || order?.sicarQuote?.cliId || 0),
        clientCode: normalizeCode(sicarCustomer?.clave || order?.sicarQuote?.clientCode || ''),
        clientName: normalizeText(sicarCustomer?.name || order?.cliente || ''),
        subtotal: productSubtotal,
        discount: customerDiscount,
        total: grossTotal,
        grossTotal,
        customerTotal,
        missingCodes,
        lastSyncedAt: new Date().toISOString(),
        lastAppliedAt: new Date().toISOString(),
      },
    };
  };

  const syncOrderQuoteInternal = async (orderKey, options = {}) => {
    await ensureAuthenticatedFirebaseSession();

    const applyToFirebase = options.applyToFirebase === true;
    const order = await getOrderByKey(orderKey);

    if (!order) {
      throw new Error('No se encontro el pedido en Firebase.');
    }

    if (String(order.canal || '').trim() !== STORE_CHANNEL) {
      throw new Error('Solo los pedidos de tienda virtual pueden sincronizar cotizaciones SICAR.');
    }

    const sicarCustomer = await ensureSicarCustomerForOrder(orderKey, order);
    let quoteReference = await getQuoteByOrderReference(order);
    let missingCodes = [];
    let createdQuote = false;

    if (!quoteReference) {
      const draft = await buildQuoteDraft(order);
      const created = await insertQuoteDraft(order, draft, sicarCustomer);
      createdQuote = true;
      missingCodes = Array.isArray(created.missingCodes) ? created.missingCodes : [];
      quoteReference = { cotId: created.cotId };
    } else {
      missingCodes = Array.isArray(order?.sicarQuote?.missingCodes) ? order.sicarQuote.missingCodes : [];
      await assignCustomerToQuote(quoteReference.cotId, sicarCustomer);
    }

    if (!quoteReference?.cotId) {
      throw new Error('No se pudo localizar la cotizacion SICAR para este pedido.');
    }

    const quote = await getQuoteSnapshot(quoteReference);
    const customerDiscount = calculateOrderCouponDiscount(order, roundMoney(quote.total || 0));
    const customerQuote = {
      ...quote,
      discount: customerDiscount,
      customerDiscount,
      customerTotal: roundMoney(Math.max(roundMoney(quote.total || 0) - customerDiscount, 0)),
      sicarTotal: roundMoney(quote.total || 0),
      productSubtotal: deriveQuotedProductSubtotal({ ...quote, sicarTotal: roundMoney(quote.total || 0) }, order),
    };
    const quoteStatus = missingCodes.length > 0 ? 'partial' : 'synced';
    const quoteMetaPatch = {
      status: quoteStatus,
      cotId: customerQuote.cotId,
      appOrderNumber: Number(order.id || 0),
      orderDate: customerQuote.orderDate,
      cliId: Number(sicarCustomer?.cliId || 0),
      clientCode: normalizeCode(sicarCustomer?.clave),
      clientName: normalizeText(sicarCustomer?.name || order?.cliente),
      subtotal: roundMoney(customerQuote.productSubtotal || 0),
      discount: roundMoney(customerQuote.discount || 0),
      total: roundMoney(customerQuote.total || 0),
      grossTotal: roundMoney(customerQuote.sicarTotal || customerQuote.total || 0),
      customerTotal: roundMoney(customerQuote.customerTotal || 0),
      missingCodes,
      syncedAt: new Date().toISOString(),
      lastSyncedAt: new Date().toISOString(),
    };

    if (applyToFirebase) {
      const orderPatch = buildFirebaseOrderPatchFromQuote(order, customerQuote, missingCodes, sicarCustomer);
      await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}`), orderPatch);
      await syncLinkedQuoteWatch(orderKey, order, customerQuote, { applyToFirebase: true });
    } else {
      await updateOrderQuoteStatus(orderKey, quoteMetaPatch);
      await syncLinkedQuoteWatch(orderKey, order, customerQuote, { applyToFirebase: false });
    }

    await clearQueueEntry(orderKey);

    return {
      orderKey,
      appOrderNumber: Number(order.id || 0),
      createdQuote,
      quote: customerQuote,
      missingCodes,
      sicarCustomer,
      whatsappMessage: buildCustomerQuoteMessage(order, customerQuote),
      customerPhone: String(order.telefono || '').trim(),
      customerName: String(order.cliente || '').trim(),
    };
  };

  const refreshLinkedQuotes = async () => {
    await ensureAuthenticatedFirebaseSession();

    if (linkedQuotesRefreshing) {
      return;
    }

    linkedQuotesRefreshing = true;
    state.refreshingLinkedQuotes = true;
    state.lastLinkedRefreshAt = new Date().toISOString();

    try {
      const snapshot = await get(ref(database, LINKED_QUOTES_PATH));
      const linkedQuotes = snapshot.val() || {};
      const entries = Object.entries(linkedQuotes).sort(
        (left, right) => Number(left[1]?.appOrderNumber || 0) - Number(right[1]?.appOrderNumber || 0)
      );

      state.watchedQuotesCount = entries.length;

      for (const [orderKey, watchEntry] of entries) {
        try {
          const order = await getOrderByKey(orderKey);

          if (!order || String(order.canal || '').trim() !== STORE_CHANNEL || isFinalStoreStatus(order.estado)) {
            await update(ref(database), {
              [`${LINKED_QUOTES_PATH}/${orderKey}`]: null,
            });
            continue;
          }

          const cotId = Number(watchEntry?.cotId || order?.sicarQuote?.cotId || 0);
          if (cotId <= 0) {
            await update(ref(database), {
              [`${LINKED_QUOTES_PATH}/${orderKey}`]: null,
            });
            continue;
          }

          const quoteSnapshot = await getQuoteSnapshot({ cotId });
          const customerDiscount = calculateOrderCouponDiscount(order, roundMoney(quoteSnapshot.total || 0));
          const quote = {
            ...quoteSnapshot,
            discount: customerDiscount,
            customerDiscount,
            customerTotal: roundMoney(
              Math.max(roundMoney(quoteSnapshot.total || 0) - customerDiscount, 0)
            ),
            sicarTotal: roundMoney(quoteSnapshot.total || 0),
            productSubtotal: deriveQuotedProductSubtotal(
              { ...quoteSnapshot, sicarTotal: roundMoney(quoteSnapshot.total || 0) },
              order
            ),
          };
          const fingerprint = buildQuoteFingerprint(quote);
          const knownFingerprint = String(watchEntry?.lastObservedFingerprint || '').trim();

          if (!knownFingerprint) {
            await syncLinkedQuoteWatch(orderKey, order, quote, {
              applyToFirebase: order?.totalAproximado === false,
            });
            continue;
          }

          if (knownFingerprint === fingerprint) {
            continue;
          }

          const missingCodes = Array.isArray(order?.sicarQuote?.missingCodes)
            ? order.sicarQuote.missingCodes
            : [];
          const orderPatch = buildFirebaseOrderPatchFromQuote(order, quote, missingCodes);
          await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}`), orderPatch);
          await syncLinkedQuoteWatch(orderKey, order, quote, { applyToFirebase: true });

          const nowIso = new Date().toISOString();
          state.lastAutoApplyAt = nowIso;
          state.lastSuccessAt = nowIso;
          state.lastProcessedOrderKey = orderKey;
          state.lastQuoteId = Number(quote.cotId || 0);
        } catch (error) {
          state.lastError = String(
            error?.message || error || `No se pudo refrescar la cotizacion SICAR del pedido ${orderKey}.`
          );
        }
      }
    } catch (error) {
      state.lastError = String(error?.message || error || 'No se pudieron refrescar las cotizaciones enlazadas.');
    } finally {
      linkedQuotesRefreshing = false;
      state.refreshingLinkedQuotes = false;
    }
  };

  const scheduleLinkedQuotesRefresh = (delayMs = LINKED_QUOTES_REFRESH_MS) => {
    if (linkedQuotesRefreshTimer) {
      clearTimeout(linkedQuotesRefreshTimer);
    }

    linkedQuotesRefreshTimer = setTimeout(() => {
      refreshLinkedQuotes()
        .catch(() => {})
        .finally(() => {
          scheduleLinkedQuotesRefresh(LINKED_QUOTES_REFRESH_MS);
        });
    }, Math.max(1000, Number(delayMs || LINKED_QUOTES_REFRESH_MS)));
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
          const result = await syncOrderQuote(orderKey, { applyToFirebase: true });
          await update(ref(database, `${STORE_ORDERS_PATH}/${orderKey}/sicarQuote`), {
            status: result.missingCodes.length > 0 ? 'partial' : 'synced',
            cotId: result.quote.cotId,
            appOrderNumber: Number(result.appOrderNumber || 0),
            orderDate: result.quote.orderDate,
            subtotal: result.quote.productSubtotal || result.quote.subtotal,
            discount: result.quote.discount,
            total: result.quote.total,
            grossTotal: result.quote.sicarTotal || result.quote.total,
            customerTotal: result.quote.customerTotal || 0,
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

    ensureAuthenticatedFirebaseSession()
      .then(() => {
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
        seedLinkedQuoteWatchesFromOrders().catch((error) => {
          state.lastError = String(error?.message || error || 'No se pudieron preparar las cotizaciones enlazadas.');
        });
        scheduleLinkedQuotesRefresh(1500);
      })
      .catch((error) => {
        state.lastError = String(
          error?.message || error || 'No se pudo autenticar el integrador SICAR contra Firebase.'
        );
      });
  };

  const stopAutoSync = () => {
    if (typeof queueUnsubscribe === 'function') {
      queueUnsubscribe();
    }
    queueUnsubscribe = null;
    queueListenerStarted = false;
    state.listening = false;
    if (linkedQuotesRefreshTimer) {
      clearTimeout(linkedQuotesRefreshTimer);
      linkedQuotesRefreshTimer = null;
    }
    linkedQuotesRefreshing = false;
    state.refreshingLinkedQuotes = false;
  };

  return {
    state,
    initAutoSync,
    stopAutoSync,
    syncOrderQuote,
  };
}
