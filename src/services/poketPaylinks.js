import { auth } from '../firebase';

const POKET_FUNCTION_ORIGIN = String(
  import.meta.env.VITE_POKET_API_ORIGIN || 'https://tienda.sanmartinsr.com'
).replace(/\/$/, '');

const normalizeText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const isPoketPaymentOrder = (order = {}) =>
  normalizeText(order.metodoPago).includes('link');

export const isPoketPaymentConfirmed = (order = {}) =>
  order?.poketPayment?.paid === true || normalizeText(order?.poketPayment?.status) === 'authorized';

export const canCreatePoketPaylink = (order = {}) =>
  isPoketPaymentOrder(order) &&
  order.totalAproximado === false &&
  Number(order.total || 0) > 0 &&
  !['cancelado', 'anulado', 'entregado'].some((status) => normalizeText(order.estado).includes(status));

const validatePoketUrl = (value) => {
  const url = new URL(String(value || ''));
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || (hostname !== 'pagoconpoket.com' && !hostname.endsWith('.pagoconpoket.com'))) {
    throw new Error('Poket devolvio un enlace no valido');
  }
  return url.toString();
};

export async function preparePoketPaylink(order) {
  const orderKey = String(order?.firebaseKey || '').trim();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesion para pagar tu pedido.');
  }
  if (!orderKey) {
    throw new Error('No encontramos el identificador del pedido.');
  }

  const idToken = await user.getIdToken();
  const response = await fetch(`${POKET_FUNCTION_ORIGIN}/.netlify/functions/poket-paylink`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ orderKey }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'No pudimos preparar el enlace de pago.');
    error.code = data?.code || `POKET_HTTP_${response.status}`;
    throw error;
  }
  if (data.paid === true || normalizeText(data.status) === 'authorized') {
    return { paid: true, status: 'Authorized' };
  }

  return {
    ...data,
    permanentLink: validatePoketUrl(data.permanentLink),
  };
}

export const openPoketPaylink = (permanentLink) => {
  window.location.assign(validatePoketUrl(permanentLink));
};

