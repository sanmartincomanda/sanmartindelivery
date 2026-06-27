import { endAt, equalTo, get, limitToLast, onValue, orderByChild, query, ref, runTransaction, startAt, update } from 'firebase/database';
import { database } from '../firebase';
import { hoyISO } from '../components/Utils';
import { normalizeLocation } from './geo';

export const ORDER_LIMIT_PER_DAY = 125;
export const MANUAL_CHANNEL = 'manual';
export const STORE_CHANNEL = 'tienda_virtual';
export const STORE_ORDER_RETENTION_DAYS = 3;
export const SICAR_QUOTE_QUEUE_PATH = 'sicarQuoteQueue';
export const ORDER_FULFILLMENT_DELIVERY = 'delivery';
export const ORDER_FULFILLMENT_PICKUP = 'pickup';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const roundToHalf = (value) => Math.round(Number(value || 0) * 2) / 2;

const formatAmount = (value) => Number(value || 0).toFixed(2);

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeOrderStatus = (status) => removeTextAccents(status || 'Pendiente');

export const normalizeOrderFulfillmentType = (value = '') => {
  const normalized = removeTextAccents(value || '');

  if (
    normalized.includes('pickup') ||
    normalized.includes('retiro') ||
    normalized.includes('recoger')
  ) {
    return ORDER_FULFILLMENT_PICKUP;
  }

  return ORDER_FULFILLMENT_DELIVERY;
};

export const isPickupOrder = (order = {}) =>
  normalizeOrderFulfillmentType(
    order?.fulfillmentType || order?.fulfillmentLabel || order?.tipoEntrega || ''
  ) === ORDER_FULFILLMENT_PICKUP;

const isFinalStoreStatus = (status) => {
  const normalizedStatus = normalizeOrderStatus(status);
  return (
    normalizedStatus.includes('entregado') ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('anulad')
  );
};

const getFinishedOrderTimestamp = (order = {}) =>
  Number(
    order.timestampFinalizado ||
      order.timestampEntregadoMs ||
      order.timestampCanceladoMs ||
      order.timestampAnuladoMs ||
      order.timestamp ||
      0
  );

export const isExpiredFinalStoreOrder = (order = {}, now = Date.now(), retentionDays = STORE_ORDER_RETENTION_DAYS) => {
  if (order.canal !== STORE_CHANNEL || !isFinalStoreStatus(order.estado)) {
    return false;
  }

  const finishedAt = getFinishedOrderTimestamp(order);
  if (!finishedAt) {
    return false;
  }

  return now - finishedAt >= retentionDays * DAY_IN_MS;
};

export async function cleanupExpiredStoreOrders(retentionDays = STORE_ORDER_RETENTION_DAYS) {
  const snapshot = await get(ref(database, 'orders'));
  const data = snapshot.val() || {};
  const now = Date.now();
  const updates = {};

  Object.entries(data).forEach(([key, order]) => {
    if (isExpiredFinalStoreOrder(order, now, retentionDays)) {
      updates[`orders/${key}`] = null;
    }
  });

  if (Object.keys(updates).length === 0) {
    return 0;
  }

  await update(ref(database), updates);
  return Object.keys(updates).length;
}

const buildTimeLabel = () =>
  new Date().toLocaleTimeString('es-NI', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

export const formatOrderNumber = (value) => String(value || 0).padStart(3, '0');

export const formatWeight = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return '0';
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '');
};

const normalizeStoreItems = (items = []) =>
  items
    .map((item) => {
      const cantidad = roundToHalf(item.cantidad ?? item.quantity ?? 0);
      const precioUnitario = Number(item.precioUnitario ?? item.price ?? 0);
      const subtotal = Number((cantidad * precioUnitario).toFixed(2));

      return {
        codigo: String(item.codigo ?? item.code ?? '').trim(),
        nombre: String(item.nombre ?? item.name ?? '').trim(),
        descripcion: String(item.descripcion ?? item.description ?? '').trim(),
        unidad: String(item.unidad ?? item.unit ?? 'lb').trim() || 'lb',
        cantidad,
        precioUnitario,
        subtotal,
      };
    })
    .filter((item) => item.codigo && item.nombre && item.cantidad > 0 && item.precioUnitario > 0);

export const buildStoreOrderText = (items = [], notes = '', summary = {}) => {
  const normalizedItems = normalizeStoreItems(items);
  const totalLabel = String(summary.totalLabel || 'Total aproximado de pedido').trim();
  const subtotalLabel = String(summary.subtotalLabel || 'Subtotal estimado').trim();
  const lines = [];

  normalizedItems.forEach((item) => {
    lines.push(
      `- ${formatWeight(item.cantidad)} ${item.unidad} ${item.nombre} [${item.codigo}] | C$${formatAmount(item.subtotal)}`
    );

    if (item.descripcion) {
      lines.push(`  Descripcion: ${item.descripcion}`);
    }
  });

  const cleanNotes = String(notes || '').trim();
  if (cleanNotes) {
    lines.push('');
    lines.push(`Observaciones: ${cleanNotes}`);
  }

  const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const discount = Number(summary.discount || 0);
  const total = Number(summary.total ?? Math.max(subtotal - discount, 0));

  if (subtotal > 0) {
    lines.push('');
    lines.push(`${subtotalLabel}: C$${formatAmount(subtotal)}`);
    if (discount > 0) {
      const discountLabel = summary.couponCode ? `Cupon ${summary.couponCode}` : 'Descuento cupon';
      lines.push(`${discountLabel}: -C$${formatAmount(discount)}`);
    }
    lines.push(`${totalLabel}: C$${formatAmount(total)}`);
  }

  return lines.join('\n').trim();
};

export const buildStoreKitchenOrderText = (items = [], summary = {}) => {
  const normalizedItems = normalizeStoreItems(items);
  const totalLabel = String(summary.totalLabel || 'Total aproximado de pedido').trim();
  const subtotalLabel = String(summary.subtotalLabel || 'Subtotal estimado').trim();
  const observations = String(summary.observaciones || summary.notes || '').trim();
  const subtotal = Number(
    summary.subtotal ?? normalizedItems.reduce((sum, item) => sum + item.subtotal, 0)
  );
  const total = Number(summary.total ?? subtotal);
  const lines = normalizedItems.map(
    (item) => `- ${formatWeight(item.cantidad)} ${item.unidad} ${item.nombre}`.trim()
  );

  if (subtotal > 0) {
    lines.push('');
    lines.push(`${subtotalLabel}: C$${formatAmount(subtotal)}`);
    lines.push(`${totalLabel}: C$${formatAmount(total)}`);
  }

  if (observations) {
    lines.push('');
    lines.push('Notas del cliente:');
    lines.push(observations);
  }

  return lines.join('\n').trim();
};

const buildOrderKey = (date, number) => `${date}-${formatOrderNumber(number)}`;

const mapOrdersSnapshot = (snapshot) =>
  Object.entries(snapshot.val() || {}).map(([firebaseKey, value]) => ({
    firebaseKey,
    ...value,
  }));

export const sortOrdersByDateAndNumber = (orders = []) =>
  [...orders].sort((left, right) => {
    const dateDiff = String(right.fecha || '').localeCompare(String(left.fecha || ''));
    if (dateDiff !== 0) {
      return dateDiff;
    }

    return Number(right.id || 0) - Number(left.id || 0);
  });

export const subscribeOrdersForDate = (date, onData, onError) =>
  onValue(
    query(ref(database, 'orders'), orderByChild('fecha'), equalTo(String(date || '').trim())),
    (snapshot) => {
      onData(sortOrdersByDateAndNumber(mapOrdersSnapshot(snapshot)));
    },
    onError
  );

export const subscribeOrdersForStoreUser = (userKey, onData, onError, limit = 10) => {
  const cleanUserKey = String(userKey || '').trim();
  const limitNumber = Number(limit || 0);

  if (!cleanUserKey) {
    onData([]);
    return () => {};
  }

  const baseQuery = query(
    ref(database, 'orders'),
    orderByChild('storeUserKey'),
    equalTo(cleanUserKey)
  );

  return onValue(
    limitNumber > 0 ? query(baseQuery, limitToLast(Math.max(1, limitNumber))) : baseQuery,
    (snapshot) => {
      const orders = mapOrdersSnapshot(snapshot).sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0));
      onData(orders);
    },
    onError
  );
};

export const subscribeOrdersForDriverCode = (driverCode, onData, onError) => {
  const cleanDriverCode = String(driverCode || '').trim();

  if (!cleanDriverCode) {
    onData([]);
    return () => {};
  }

  return onValue(
    query(ref(database, 'orders'), orderByChild('repartidorCodigo'), equalTo(cleanDriverCode)),
    (snapshot) => {
      onData(sortOrdersByDateAndNumber(mapOrdersSnapshot(snapshot)));
    },
    onError
  );
};

export async function fetchOrdersByDateRange(dateFrom, dateTo) {
  const startDate = String(dateFrom || '').trim();
  const endDate = String(dateTo || '').trim();

  const snapshot = await get(
    query(
      ref(database, 'orders'),
      orderByChild('fecha'),
      startAt(startDate || ''),
      endAt(endDate || '\uf8ff')
    )
  );

  return sortOrdersByDateAndNumber(mapOrdersSnapshot(snapshot));
}

const createLimitError = () => {
  const error = new Error('Se alcanzo el limite diario de pedidos');
  error.code = 'ORDER_LIMIT_REACHED';
  return error;
};

export async function createOrder(payload, options = {}) {
  const channel = options.channel || MANUAL_CHANNEL;
  const fecha = payload.fecha || hoyISO();
  const counterRef = ref(database, `orderCounters/${fecha}`);
  const createdAt = Date.now();
  const fulfillmentType = normalizeOrderFulfillmentType(payload.fulfillmentType || payload.tipoEntrega);
  const pickupOrder = fulfillmentType === ORDER_FULFILLMENT_PICKUP;

  const transactionResult = await runTransaction(counterRef, (currentValue) => {
    const lastNumber = Number(currentValue || 0);
    if (lastNumber >= ORDER_LIMIT_PER_DAY) {
      return;
    }

    return lastNumber + 1;
  });

  if (!transactionResult.committed) {
    throw createLimitError();
  }

  const id = Number(transactionResult.snapshot.val());
  if (!id || id > ORDER_LIMIT_PER_DAY) {
    throw createLimitError();
  }

  const normalizedItems = normalizeStoreItems(payload.items || []);
  const subtotal =
    normalizedItems.length > 0
      ? Number(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2))
      : Number(payload.total || 0) || null;
  const couponDiscount = Math.max(
    0,
    Math.min(Number(payload.descuentoCupon || 0), Number(subtotal || 0))
  );
  const total =
    normalizedItems.length > 0
      ? Number(Math.max(Number(subtotal || 0) - couponDiscount, 0).toFixed(2))
      : Number(payload.total || 0) || null;
  const coupon = payload.cupon && payload.cupon.code
    ? {
        code: String(payload.cupon.code || '').trim().toUpperCase(),
        title: String(payload.cupon.title || '').trim(),
        type: String(payload.cupon.type || '').trim(),
        value: Number(payload.cupon.value || 0),
        maxUsesPerUser: Math.max(0, Math.trunc(Number(payload.cupon.maxUsesPerUser || 0))),
      }
    : null;

  const rawPedidoTexto = String(payload.pedido || '').trim();
  const generatedKitchenPedidoTexto = buildStoreKitchenOrderText(normalizedItems, {
    couponCode: coupon?.code,
    total,
    observaciones: payload.observaciones,
  });
  const pedidoTexto =
    channel === STORE_CHANNEL
      ? generatedKitchenPedidoTexto || rawPedidoTexto
      : rawPedidoTexto || generatedKitchenPedidoTexto;

  const orderRecord = {
    cliente: String(payload.cliente || '').trim() || 'Cliente sin nombre',
    clienteCodigo:
      String(payload.clienteCodigo || '').trim() || (channel === STORE_CHANNEL ? 'TIENDA VIRTUAL' : '-'),
    clienteFirebaseKey: String(payload.clienteFirebaseKey || '').trim(),
    storeUserKey: String(payload.storeUserKey || '').trim(),
    direccion: pickupOrder ? 'Pickup en tienda' : String(payload.direccion || '').trim() || '-',
    telefono: String(payload.telefono || '').trim(),
    referencia: pickupOrder ? '' : String(payload.referencia || '').trim(),
    ubicacion: pickupOrder ? null : normalizeLocation(payload.ubicacion || payload.location),
    pedido: pedidoTexto,
    observaciones: String(payload.observaciones || '').trim(),
    items: normalizedItems,
    subtotalEstimado: subtotal,
    descuentoCupon: couponDiscount,
    cupon: coupon,
    total,
    totalAproximado: channel === STORE_CHANNEL,
    estado: 'Pendiente',
    metodoPago: String(payload.metodoPago || 'Efectivo').trim() || 'Efectivo',
    cambioPara: String(payload.cambioPara || '').trim(),
    fecha,
    id,
    canal: channel,
    canalLabel: channel === STORE_CHANNEL ? 'Tienda Virtual' : 'Ingreso Manual',
    deliveryMode: pickupOrder ? 'pickup' : String(payload.deliveryMode || 'perfil').trim() || 'perfil',
    fulfillmentType,
    fulfillmentLabel: pickupOrder ? 'Pickup' : 'Delivery',
    timestampIngreso: buildTimeLabel(),
    timestampIngresoMs: createdAt,
    justAdded: true,
    timestamp: createdAt,
  };

  if (channel === STORE_CHANNEL) {
    orderRecord.sicarQuote = {
      status: 'pending',
      appOrderNumber: id,
      orderDate: fecha,
      orderNumber: id,
      queuedAt: new Date(createdAt).toISOString(),
    };
  }

  const orderKey = buildOrderKey(fecha, id);
  const updates = {
    [`orders/${orderKey}`]: orderRecord,
  };

  if (channel === STORE_CHANNEL) {
    updates[`${SICAR_QUOTE_QUEUE_PATH}/${orderKey}`] = {
      orderKey,
      fecha,
      id,
      canal: STORE_CHANNEL,
      status: 'pending',
      requestedAt: createdAt,
      requestedAtIso: new Date(createdAt).toISOString(),
      attempts: 0,
      appOrderNumber: id,
    };
  }

  await update(ref(database), updates);

  return {
    firebaseKey: orderKey,
    ...orderRecord,
  };
}
