import { initializeApp } from 'firebase/app';
import { get, getDatabase, ref, update } from 'firebase/database';

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

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeStatus = (status) => removeTextAccents(status || 'pendiente');

const isFinalStatus = (status) => {
  const normalizedStatus = normalizeStatus(status);
  return (
    normalizedStatus.includes('entregado') ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('anulad')
  );
};

const roundToHalf = (value) => Math.round(Number(value || 0) * 2) / 2;

const formatAmount = (value) => Number(value || 0).toFixed(2);

const formatWeight = (value) => {
  const numeric = Number(value || 0);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return '0';
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '');
};

const normalizeItems = (items = []) =>
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

const buildKitchenText = (order = {}) => {
  const items = normalizeItems(order.items || []);
  if (items.length === 0) {
    return String(order.pedido || '').trim();
  }

  const subtotal = Number(
    order.subtotalEstimado ?? items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const total = Number(order.total ?? subtotal);
  const lines = items.map((item) => `- ${formatWeight(item.cantidad)} ${item.unidad} ${item.nombre}`);

  if (subtotal > 0) {
    lines.push('');
    lines.push(`Subtotal estimado: C$${formatAmount(subtotal)}`);
    lines.push(`Total aproximado de pedido: C$${formatAmount(total)}`);
  }

  return lines.join('\n').trim();
};

const hasLegacyKitchenFormat = (pedido = '') =>
  /\[[^\]]+\]/.test(String(pedido || '')) ||
  /\bDescripcion:/i.test(String(pedido || '')) ||
  /\|\s*C\$\s*/i.test(String(pedido || ''));

const orderKeyArg = process.argv.find((arg) => arg.startsWith('--order='));
const onlyOneOrderKey = orderKeyArg ? orderKeyArg.slice('--order='.length).trim() : '';
const includeFinalOrders = process.argv.includes('--all');

const app = initializeApp(FIREBASE_CONFIG, 'normalize-store-kitchen-orders');
const database = getDatabase(app);

const snapshot = await get(ref(database, 'orders'));
const orders = snapshot.val() || {};
const updates = {};
const changed = [];

for (const [orderKey, order] of Object.entries(orders)) {
  if (onlyOneOrderKey && orderKey !== onlyOneOrderKey) {
    continue;
  }

  if (String(order?.canal || '').trim() !== STORE_CHANNEL) {
    continue;
  }

  if (!includeFinalOrders && isFinalStatus(order?.estado)) {
    continue;
  }

  const nextPedido = buildKitchenText(order);
  const currentPedido = String(order?.pedido || '').trim();

  if (!nextPedido || currentPedido === nextPedido) {
    continue;
  }

  if (!onlyOneOrderKey && !hasLegacyKitchenFormat(currentPedido)) {
    continue;
  }

  updates[`orders/${orderKey}/pedido`] = nextPedido;
  changed.push({
    orderKey,
    estado: order?.estado || 'Pendiente',
    before: currentPedido,
    after: nextPedido,
  });
}

if (Object.keys(updates).length === 0) {
  console.log('No hubo pedidos por normalizar.');
  process.exit(0);
}

await update(ref(database), updates);

console.log(`Pedidos normalizados: ${changed.length}`);
for (const item of changed) {
  console.log(`- ${item.orderKey} [${item.estado}]`);
}
