import {
  acquireOrderLock,
  corsHeaders,
  extractExternalLinkId,
  getFirebaseAdmin,
  getPoketConfig,
  isPoketPaymentMethod,
  isSafeFirebaseKey,
  jsonResponse,
  poketRequest,
  roundCurrency,
  verifyFirebaseRequest,
} from './_shared/poket.mjs';

const TERMINAL_LINK_STATUSES = new Set([
  'authorized',
  'resolved',
  'cancelled',
  'canceled',
  'expired',
  'failed',
  'amountmismatch',
]);
const CANCELED_ORDER_STATUSES = ['cancel', 'anulad'];

const normalizeStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const isCanceledOrder = (order) =>
  CANCELED_ORDER_STATUSES.some((status) => normalizeStatus(order?.estado).includes(status));

const buildOrderCallbackUrl = (configuredUrl, order = {}) => {
  const callbackUrl = new URL(configuredUrl);
  const branchId = String(order.storeBranchId || '').trim().toLowerCase();
  if (/^[a-z0-9-]{1,40}$/.test(branchId)) {
    callbackUrl.pathname = `/${branchId}`;
  }
  callbackUrl.searchParams.set('poket', 'return');
  return callbackUrl.toString();
};

const isLinkStillValid = (payment = {}) => {
  const expiresAt = Date.parse(String(payment.expiresAt || ''));
  const status = normalizeStatus(payment.status).replace(/[^a-z]/g, '');
  return (
    Boolean(payment.paylinkId && payment.permanentLink) &&
    (!expiresAt || expiresAt > Date.now() + 30_000) &&
    !TERMINAL_LINK_STATUSES.has(status)
  );
};

const cancelExistingLink = async (payment, merchantId) => {
  if (!payment?.paylinkId || normalizeStatus(payment.status) === 'authorized') {
    return;
  }
  await poketRequest(
    `/api/v1/merchants/${encodeURIComponent(merchantId)}/paylinks/${encodeURIComponent(payment.paylinkId)}`,
    { method: 'DELETE' }
  ).catch(() => {});
};

const reconcileExistingLink = async (database, orderKey, order, config) => {
  const payment = order?.poketPayment || {};
  if (!payment.paylinkId) {
    return payment;
  }

  try {
    const providerPayment = await poketRequest(
      `/api/v1/merchants/${encodeURIComponent(config.merchantId)}/paylinks/${encodeURIComponent(payment.paylinkId)}`
    );
    const providerStatus = String(providerPayment?.status || payment.status || '').trim();
    const paymentCount = Number(providerPayment?.payment_count || 0);
    const patch = {
      providerStatus,
      status: paymentCount > 0 || normalizeStatus(providerStatus) === 'resolved'
        ? 'Authorized'
        : providerStatus || payment.status,
      reconciledAt: new Date().toISOString(),
    };
    if (patch.status === 'Authorized') {
      patch.paid = true;
      patch.paidAt = payment.paidAt || new Date().toISOString();
    }
    await database.ref(`orders/${orderKey}/poketPayment`).update(patch);
    return { ...payment, ...patch };
  } catch {
    return payment;
  }
};

export const handler = async (event) => {
  const headers = corsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Metodo no permitido' }, headers);
  }

  let releaseLock = null;
  try {
    const decodedToken = await verifyFirebaseRequest(event);
    const payload = JSON.parse(event.body || '{}');
    const orderKey = String(payload.orderKey || '').trim();
    if (!isSafeFirebaseKey(orderKey)) {
      return jsonResponse(400, { error: 'Pedido invalido' }, headers);
    }

    const { database } = getFirebaseAdmin();
    const orderRef = database.ref(`orders/${orderKey}`);
    const orderSnapshot = await orderRef.get();
    const order = orderSnapshot.val();
    if (!order) {
      return jsonResponse(404, { error: 'Pedido no encontrado' }, headers);
    }
    if (String(order.storeUserKey || '') !== String(decodedToken.uid || '')) {
      return jsonResponse(403, { error: 'Este pedido no pertenece a tu cuenta' }, headers);
    }
    if (String(order.canal || '') !== 'tienda_virtual' || !isPoketPaymentMethod(order.metodoPago)) {
      return jsonResponse(400, { error: 'El pedido no usa Link de pago' }, headers);
    }

    if (String(payload.action || '').trim().toLowerCase() === 'status') {
      const config = getPoketConfig();
      const payment = await reconcileExistingLink(database, orderKey, order, config);
      return jsonResponse(200, {
        status: payment.status || 'Pending',
        paid: payment.paid === true || normalizeStatus(payment.status) === 'authorized',
      }, headers);
    }

    if (isCanceledOrder(order)) {
      return jsonResponse(409, { error: 'El pedido esta cancelado' }, headers);
    }
    if (order.totalAproximado !== false) {
      return jsonResponse(409, {
        error: 'El enlace se activara cuando actualicemos los pesos reales de tu pedido.',
        code: 'ORDER_TOTAL_PENDING',
      }, headers);
    }

    const amount = roundCurrency(order.total);
    if (!(amount > 0)) {
      return jsonResponse(400, { error: 'El total actualizado del pedido no es valido' }, headers);
    }

    releaseLock = await acquireOrderLock(database, orderKey);
    const freshSnapshot = await orderRef.get();
    const freshOrder = freshSnapshot.val() || order;
    const config = getPoketConfig();
    const existingPayment = await reconcileExistingLink(database, orderKey, freshOrder, config);

    if (normalizeStatus(existingPayment.status) === 'authorized' || existingPayment.paid === true) {
      return jsonResponse(200, { status: 'Authorized', paid: true }, headers);
    }

    if (
      roundCurrency(existingPayment.amount) === amount &&
      isLinkStillValid(existingPayment)
    ) {
      return jsonResponse(200, {
        status: existingPayment.status || 'Created',
        permanentLink: existingPayment.permanentLink,
        expiresAt: existingPayment.expiresAt,
      }, headers);
    }

    await cancelExistingLink(existingPayment, config.merchantId);

    const expiresAt = new Date(Date.now() + config.ttlMinutes * 60_000).toISOString();
    const orderLabel = String(freshOrder.orderNumber || freshOrder.id || orderKey).trim();
    const branchLabel = String(
      freshOrder.storeBranchShortName || freshOrder.storeBranchName || 'San Martin'
    ).trim();
    const providerPayment = await poketRequest(
      `/api/v1/merchants/${encodeURIComponent(config.merchantId)}/paylinks`,
      {
        method: 'POST',
        body: {
          amount,
          currency: 'NIO',
          description: `Pedido ${orderLabel} - ${branchLabel}`.slice(0, 180),
          expiration_date: expiresAt,
          type: 'SingleUse',
          max_usages: 1,
          terminal_id: config.terminalId,
          callback_url: buildOrderCallbackUrl(config.callbackUrl, freshOrder),
          callback_time: 5,
        },
      }
    );

    const paylinkId = String(providerPayment?.id || '').trim();
    const permanentLink = String(providerPayment?.permanent_link || '').trim();
    const externalLinkId = extractExternalLinkId(permanentLink);
    if (!isSafeFirebaseKey(paylinkId) || !isSafeFirebaseKey(externalLinkId) || !permanentLink) {
      throw new Error('Poket no devolvio un enlace de pago valido');
    }

    const nowIso = new Date().toISOString();
    const paymentRecord = {
      provider: 'Poket',
      paylinkId,
      externalLinkId,
      permanentLink,
      amount,
      currency: 'NIO',
      status: String(providerPayment?.status || 'Created'),
      paid: false,
      expiresAt,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await database.ref().update({
      [`orders/${orderKey}/poketPayment`]: paymentRecord,
      [`poketPaylinks/${paylinkId}`]: { orderKey, externalLinkId, amount, createdAt: nowIso },
      [`poketExternalLinks/${externalLinkId}`]: { orderKey, paylinkId, amount, createdAt: nowIso },
    });

    return jsonResponse(200, {
      status: paymentRecord.status,
      permanentLink,
      expiresAt,
    }, headers);
  } catch (error) {
    console.error('Error preparando Paylink Poket:', error?.message || error);
    return jsonResponse(
      Number(error?.statusCode || 500),
      { error: error?.statusCode && error.statusCode < 500 ? error.message : 'No pudimos preparar el enlace de pago. Intenta nuevamente.' },
      headers
    );
  } finally {
    await releaseLock?.().catch(() => {});
  }
};
