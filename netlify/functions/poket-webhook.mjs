import {
  buildWebhookAuthentication,
  getFirebaseAdmin,
  isSafeFirebaseKey,
  jsonResponse,
  roundCurrency,
  secureEqual,
} from './_shared/poket.mjs';

const readBasicCredentials = (event) => {
  const authorization = String(
    event?.headers?.authorization || event?.headers?.Authorization || ''
  ).trim();
  const match = authorization.match(/^Basic\s+(.+)$/i);
  if (!match) return { username: '', password: '' };
  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator < 0
      ? { username: decoded, password: '' }
      : { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return { username: '', password: '' };
  }
};

const isAuthorizedWebhook = (event) => {
  const expected = buildWebhookAuthentication();
  if (!expected.username || !expected.password) return false;
  const received = readBasicCredentials(event);
  return secureEqual(received.username, expected.username) && secureEqual(received.password, expected.password);
};

const normalizeEventType = (value) => String(value || '').trim().toLowerCase();

const normalizeProviderStatus = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, '');

const isSuccessfulProviderStatus = (value) =>
  ['authorized', 'resolved', 'paid', 'success', 'successful'].includes(
    normalizeProviderStatus(value)
  );

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Metodo no permitido' });
  }
  if (!isAuthorizedWebhook(event)) {
    return jsonResponse(401, { error: 'Webhook no autorizado' }, { 'WWW-Authenticate': 'Basic realm="Poket"' });
  }

  try {
    const payload = JSON.parse(event.body || '{}');
    const externalLinkId = String(payload.external_link_id || '').trim();
    if (!isSafeFirebaseKey(externalLinkId)) {
      return jsonResponse(202, { received: true });
    }

    const { database } = getFirebaseAdmin();
    const mappingSnapshot = await database.ref(`poketExternalLinks/${externalLinkId}`).get();
    const mapping = mappingSnapshot.val();
    const orderKey = String(mapping?.orderKey || '').trim();
    if (!isSafeFirebaseKey(orderKey)) {
      console.warn('Webhook Poket sin pedido relacionado:', externalLinkId);
      return jsonResponse(202, { received: true });
    }

    const orderSnapshot = await database.ref(`orders/${orderKey}`).get();
    const order = orderSnapshot.val();
    if (!order) {
      return jsonResponse(202, { received: true });
    }

    const eventType = normalizeEventType(payload.event_type);
    const providerStatus = String(payload.status || '').trim();
    const receivedAmount = roundCurrency(payload.amount);
    const expectedAmount = roundCurrency(order.total);
    const receivedCurrency = String(payload.currency || '').trim().toUpperCase();
    const nowIso = new Date().toISOString();
    const basePatch = {
      lastEventType: payload.event_type || '',
      tryId: String(payload.try_id || ''),
      providerStatus,
      updatedAt: nowIso,
    };

    if (eventType.includes('startpayment')) {
      await database.ref(`orders/${orderKey}/poketPayment`).update({
        ...basePatch,
        status: 'InProgress',
      });
      return jsonResponse(200, { received: true });
    }

    if (!eventType.includes('finishpayment')) {
      await database.ref(`orders/${orderKey}/poketPayment`).update(basePatch);
      return jsonResponse(200, { received: true });
    }

    const amountMatches = receivedAmount > 0 && receivedAmount === expectedAmount;
    const currencyMatches = receivedCurrency === 'NIO';
    const alreadyConfirmed =
      order?.poketPayment?.paid === true ||
      normalizeProviderStatus(order?.poketPayment?.status) === 'authorized';
    const providerResolvedPayment = isSuccessfulProviderStatus(providerStatus);
    const authorized = alreadyConfirmed || (providerResolvedPayment && amountMatches && currencyMatches);
    const paymentPatch = {
      ...basePatch,
      status: authorized
        ? 'Authorized'
        : providerResolvedPayment
          ? 'AmountMismatch'
          : 'Failed',
      paid: authorized,
      paidAt: authorized ? (order?.poketPayment?.paidAt || nowIso) : null,
      receivedAmount,
      expectedAmount,
      receivedCurrency,
      reference: String(payload.reference || ''),
      authorizationCode: String(payload.authorization_code || ''),
      cardLast4: String(payload.card || '').replace(/\D/g, '').slice(-4),
      cardBrand: String(payload.card_brand || ''),
      errorCode: String(payload.error_code || ''),
      errorReason: String(payload.error_reason || ''),
    };

    const updates = {
      [`orders/${orderKey}/poketPayment`]: {
        ...(order.poketPayment || {}),
        ...paymentPatch,
      },
      [`poketExternalLinks/${externalLinkId}/lastStatus`]: paymentPatch.status,
      [`poketExternalLinks/${externalLinkId}/updatedAt`]: nowIso,
    };
    await database.ref().update(updates);
    return jsonResponse(200, { received: true });
  } catch (error) {
    console.error('Error procesando webhook Poket:', error?.message || error);
    return jsonResponse(500, { error: 'No se pudo procesar el evento' });
  }
};
