import { ref, runTransaction, set } from 'firebase/database';
import { database } from '../firebase';
import { hoyISO } from '../components/Utils';

export const ORDER_LIMIT_PER_DAY = 125;
export const MANUAL_CHANNEL = 'manual';
export const STORE_CHANNEL = 'tienda_virtual';

const roundToHalf = (value) => Math.round(Number(value || 0) * 2) / 2;

const formatAmount = (value) => Number(value || 0).toFixed(2);

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
        unidad: String(item.unidad ?? item.unit ?? 'lb').trim() || 'lb',
        cantidad,
        precioUnitario,
        subtotal,
      };
    })
    .filter((item) => item.codigo && item.nombre && item.cantidad > 0 && item.precioUnitario > 0);

export const buildStoreOrderText = (items = [], notes = '') => {
  const normalizedItems = normalizeStoreItems(items);
  const lines = normalizedItems.map(
    (item) =>
      `- ${formatWeight(item.cantidad)} ${item.unidad} ${item.nombre} [${item.codigo}] | C$${formatAmount(item.subtotal)}`
  );

  const cleanNotes = String(notes || '').trim();
  if (cleanNotes) {
    lines.push('');
    lines.push(`Observaciones: ${cleanNotes}`);
  }

  const total = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
  if (total > 0) {
    lines.push('');
    lines.push(`Total estimado: C$${formatAmount(total)}`);
  }

  return lines.join('\n').trim();
};

const buildOrderKey = (date, number) => `${date}-${formatOrderNumber(number)}`;

const createLimitError = () => {
  const error = new Error('Se alcanzo el limite diario de pedidos');
  error.code = 'ORDER_LIMIT_REACHED';
  return error;
};

export async function createOrder(payload, options = {}) {
  const channel = options.channel || MANUAL_CHANNEL;
  const fecha = payload.fecha || hoyISO();
  const counterRef = ref(database, `orderCounters/${fecha}`);

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
  const total =
    normalizedItems.length > 0
      ? Number(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2))
      : Number(payload.total || 0) || null;

  const pedidoTexto =
    String(payload.pedido || '').trim() || buildStoreOrderText(normalizedItems, payload.observaciones);

  const orderRecord = {
    cliente: String(payload.cliente || '').trim() || 'Cliente sin nombre',
    clienteCodigo:
      String(payload.clienteCodigo || '').trim() || (channel === STORE_CHANNEL ? 'TIENDA VIRTUAL' : '-'),
    clienteFirebaseKey: String(payload.clienteFirebaseKey || '').trim(),
    storeUserKey: String(payload.storeUserKey || '').trim(),
    direccion: String(payload.direccion || '').trim() || '-',
    telefono: String(payload.telefono || '').trim(),
    referencia: String(payload.referencia || '').trim(),
    pedido: pedidoTexto,
    observaciones: String(payload.observaciones || '').trim(),
    items: normalizedItems,
    total,
    estado: 'Pendiente',
    metodoPago: String(payload.metodoPago || 'Efectivo').trim() || 'Efectivo',
    fecha,
    id,
    canal: channel,
    canalLabel: channel === STORE_CHANNEL ? 'Tienda Virtual' : 'Ingreso Manual',
    timestampIngreso: buildTimeLabel(),
    justAdded: true,
    timestamp: Date.now(),
  };

  const orderKey = buildOrderKey(fecha, id);
  await set(ref(database, `orders/${orderKey}`), orderRecord);

  return {
    firebaseKey: orderKey,
    ...orderRecord,
  };
}
