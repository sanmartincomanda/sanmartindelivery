import crypto from 'node:crypto';
import {
  getFirebaseAdmin,
  jsonResponse,
  verifyFirebaseRequest,
} from './_shared/poket.mjs';
import {
  FIRST_ORDER_REWARD_CAMPAIGN_TYPE,
  campaignAppliesToBranch,
  isIncentiveCampaignActive,
  isIncentiveItemAvailable,
  normalizeFirstOrderRewardSnapshot,
  normalizeIncentiveCampaign,
  normalizeIncentiveItem,
  normalizeIncentiveTier,
  resolveIncentiveTier,
  sanitizeIncentiveId,
} from '../../src/services/storeIncentiveCore.js';

const RESERVATION_TTL_MS = 20 * 60 * 1000;
const ADMIN_ROLES = new Set(['admin', 'service']);
const VALID_ORDER_CHANNEL = 'tienda_virtual';

const normalizeText = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const normalizePhone = (value = '') => String(value || '').replace(/\D/g, '');
const phoneClaimKey = (phone = '') =>
  crypto.createHash('sha256').update(normalizePhone(phone)).digest('hex');
const isCanceledOrFailedOrder = (order = {}) => {
  const status = normalizeText(order?.estado);
  return ['cancel', 'anulad', 'fallid', 'failed'].some((token) => status.includes(token));
};
const isDeliveredOrder = (order = {}) => normalizeText(order?.estado).includes('entregado');
const isValidFirstPurchaseOrder = (order = {}) =>
  String(order?.canal || '').trim() === VALID_ORDER_CHANNEL && !isCanceledOrFailedOrder(order);

const incentiveCorsHeaders = (event = {}) => {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || '').trim();
  const allowedOrigins = new Set([
    'https://tienda.sanmartinsr.com',
    'https://admintv.sanmartinsr.com',
    'https://localhost',
    'capacitor://localhost',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:5174',
    'http://127.0.0.1:5174',
  ]);
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin)
      ? origin
      : 'https://tienda.sanmartinsr.com',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

const findFirstOrderCampaign = (config = {}, requestedCampaignId = '', branchId = '', now = Date.now()) => {
  const requestedId = sanitizeIncentiveId(requestedCampaignId);
  return Object.values(config?.campaigns || {})
    .map((campaign) => normalizeIncentiveCampaign(campaign))
    .find(
      (campaign) =>
        (!requestedId || campaign.id === requestedId) &&
        campaign.type === FIRST_ORDER_REWARD_CAMPAIGN_TYPE &&
        isIncentiveCampaignActive(campaign, now) &&
        campaignAppliesToBranch(campaign, branchId)
    ) || null;
};

const getCampaignTiers = (config = {}, campaignId = '') =>
  Object.values(config?.tiers?.[campaignId] || {}).map((tier, index) =>
    normalizeIncentiveTier({ ...tier, campaignId }, {}, index)
  );

const getCampaignItem = (config = {}, campaignId = '', tierId = '', itemId = '') =>
  normalizeIncentiveItem(
    config?.items?.[campaignId]?.[tierId]?.[itemId] || {},
    { campaignId, tierId, id: itemId }
  );

const getCustomerContext = async (database, uid) => {
  const snapshot = await database.ref(`storeUsers/${uid}`).get();
  const user = snapshot.val() || {};
  const phone = normalizePhone(user.telefono);
  if (!phone) {
    const error = new Error('Completa tu telefono para recibir el regalo de primera compra.');
    error.statusCode = 409;
    error.code = 'PHONE_REQUIRED';
    throw error;
  }
  return {
    uid,
    name: String(user.nombre || '').trim(),
    phone,
    phoneKey: phoneClaimKey(phone),
    phoneSuffix: phone.slice(-4),
  };
};

const flattenOrders = (value = {}) =>
  Object.entries(value || {}).map(([firebaseKey, order]) => ({ firebaseKey, ...(order || {}) }));

const hasPriorValidOrder = async (database, customer, excludeOrderKey = '') => {
  const [userOrdersSnapshot, phoneOrdersSnapshot, historySnapshot] = await Promise.all([
    database.ref('orders').orderByChild('storeUserKey').equalTo(customer.uid).once('value'),
    database.ref('orders').orderByChild('telefono').equalTo(customer.phone).once('value'),
    database.ref('orderHistory').once('value'),
  ]);
  const candidates = [
    ...flattenOrders(userOrdersSnapshot.val()),
    ...flattenOrders(phoneOrdersSnapshot.val()),
  ];

  Object.values(historySnapshot.val() || {}).forEach((dayOrders) => {
    flattenOrders(dayOrders).forEach((order) => {
      if (
        String(order.storeUserKey || '') === customer.uid ||
        normalizePhone(order.telefono) === customer.phone
      ) {
        candidates.push(order);
      }
    });
  });

  return candidates.some(
    (order) => order.firebaseKey !== excludeOrderKey && isValidFirstPurchaseOrder(order)
  );
};

const releaseReservationInState = (state, reservation, status, now) => {
  if (!reservation || !['reserved', 'ordered'].includes(String(reservation.status || ''))) {
    return false;
  }
  const campaignId = sanitizeIncentiveId(reservation.campaignId);
  const tierId = sanitizeIncentiveId(reservation.tierId);
  const itemId = sanitizeIncentiveId(reservation.itemId);
  const item = state?.config?.items?.[campaignId]?.[tierId]?.[itemId];
  if (item) {
    item.stockAvailable = Math.max(0, Number(item.stockAvailable || 0)) + 1;
    if (String(reservation.status || '') === 'reserved') {
      item.stockReserved = Math.max(0, Number(item.stockReserved || 0) - 1);
    }
    item.updatedAt = now;
  }
  reservation.status = status;
  reservation.updatedAt = now;
  reservation.releasedAt = now;
  if (state?.claims?.users?.[reservation.customerId]?.reservationId === reservation.id) {
    delete state.claims.users[reservation.customerId];
  }
  if (state?.claims?.phones?.[reservation.phoneKey]?.reservationId === reservation.id) {
    delete state.claims.phones[reservation.phoneKey];
  }
  return true;
};

const getReservationOrder = async (database, reservation = {}) => {
  const orderKey = String(reservation.orderKey || '').trim();
  if (!orderKey) {
    return null;
  }
  const currentSnapshot = await database.ref(`orders/${orderKey}`).get();
  if (currentSnapshot.exists()) {
    return { firebaseKey: orderKey, ...currentSnapshot.val() };
  }
  const date = String(reservation.orderDate || orderKey.slice(0, 10)).trim();
  const archivedSnapshot = await database.ref(`orderHistory/${date}/${orderKey}`).get();
  return archivedSnapshot.exists()
    ? { firebaseKey: orderKey, ...archivedSnapshot.val() }
    : null;
};

const getRole = async (database, uid) => {
  const snapshot = await database.ref(`userRoles/${uid}/role`).get();
  return String(snapshot.val() || '').trim().toLowerCase();
};

const handleEligibility = async (database, customer, payload) => {
  const now = Date.now();
  const branchId = String(payload.branchId || '').trim().toLowerCase();
  const [configSnapshot, userClaimSnapshot, phoneClaimSnapshot, priorOrder] = await Promise.all([
    database.ref('storeIncentives/config').get(),
    database.ref(`storeIncentives/claims/users/${customer.uid}`).get(),
    database.ref(`storeIncentives/claims/phones/${customer.phoneKey}`).get(),
    hasPriorValidOrder(database, customer),
  ]);
  const campaign = findFirstOrderCampaign(configSnapshot.val(), payload.campaignId, branchId, now);
  const claim = userClaimSnapshot.val() || phoneClaimSnapshot.val();
  const claimStatus = String(claim?.status || '').trim().toLowerCase();
  const activeReservation =
    claimStatus === 'reserved' && Number(claim?.expiresAt || 0) > now;

  if (!campaign) {
    return { eligible: false, reason: 'campaign_inactive' };
  }
  if (priorOrder || ['used', 'ordered', 'delivered'].includes(claimStatus)) {
    return { eligible: false, reason: 'prior_order', campaignId: campaign.id };
  }
  return {
    eligible: true,
    reason: activeReservation ? 'reserved' : 'available',
    campaignId: campaign.id,
    reservationId: activeReservation ? String(claim.reservationId || '') : '',
  };
};

const handleReserve = async (database, customer, payload) => {
  const now = Date.now();
  const eligibleSubtotal = Math.max(0, Number(Number(payload.eligibleSubtotal || 0).toFixed(2)));
  const branchId = String(payload.branchId || '').trim().toLowerCase();
  const requestedCampaignId = sanitizeIncentiveId(payload.campaignId);
  const requestedTierId = sanitizeIncentiveId(payload.tierId);
  const requestedItemId = sanitizeIncentiveId(payload.itemId);
  if (!branchId || !requestedCampaignId || !requestedTierId || !requestedItemId) {
    const error = new Error('Seleccion de regalo incompleta.');
    error.statusCode = 400;
    error.code = 'INVALID_SELECTION';
    throw error;
  }
  if (await hasPriorValidOrder(database, customer)) {
    const error = new Error('Este beneficio aplica solamente a la primera compra.');
    error.statusCode = 409;
    error.code = 'PRIOR_ORDER';
    throw error;
  }

  const configSnapshot = await database.ref('storeIncentives/config').get();
  if (!findFirstOrderCampaign(configSnapshot.val(), requestedCampaignId, branchId, now)) {
    const error = new Error('La campana de bienvenida no esta disponible.');
    error.statusCode = 409;
    error.code = 'CAMPAIGN_UNAVAILABLE';
    throw error;
  }

  const reservationId = `fir_${now}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  let rejection = 'No pudimos reservar este regalo.';
  const result = await database.ref('storeIncentives').transaction((currentValue) => {
    // Realtime Database starts a transaction from its local cache. Returning a
    // value here forces the server round-trip before applying validations.
    if (currentValue === null) {
      return {};
    }
    const state = currentValue || {};
    state.config ||= {};
    state.reservations ||= {};
    state.claims ||= {};
    state.claims.users ||= {};
    state.claims.phones ||= {};

    Object.values(state.reservations).forEach((reservation) => {
      if (
        reservation?.status === 'reserved' &&
        Number(reservation.expiresAt || 0) <= now
      ) {
        releaseReservationInState(state, reservation, 'expired', now);
      }
    });

    const existingClaim = state.claims.users[customer.uid] || state.claims.phones[customer.phoneKey];
    if (existingClaim?.reservationId) {
      const existingReservation = state.reservations[existingClaim.reservationId];
      const existingStatus = String(existingReservation?.status || existingClaim.status || '');
      if (existingStatus === 'reserved' && Number(existingReservation?.expiresAt || 0) <= now) {
        releaseReservationInState(state, existingReservation, 'expired', now);
      } else if (existingStatus === 'reserved' && existingReservation?.customerId === customer.uid) {
        releaseReservationInState(state, existingReservation, 'replaced', now);
      } else {
        rejection = 'Este beneficio ya fue reservado o utilizado.';
        return;
      }
    }

    const campaign = findFirstOrderCampaign(state.config, requestedCampaignId, branchId, now);
    if (!campaign) {
      rejection = 'La campana de bienvenida no esta disponible.';
      return;
    }
    const tier = resolveIncentiveTier(getCampaignTiers(state.config, campaign.id), eligibleSubtotal);
    if (!tier || tier.id !== requestedTierId) {
      rejection = 'El total del carrito ya no corresponde a este regalo.';
      return;
    }
    const item = getCampaignItem(state.config, campaign.id, tier.id, requestedItemId);
    if (!isIncentiveItemAvailable(item, { branchId, now })) {
      rejection = 'Este regalo acaba de agotarse o ya no esta disponible.';
      return;
    }

    const storedItem = state.config.items[campaign.id][tier.id][item.id];
    storedItem.stockAvailable = Math.max(0, Number(storedItem.stockAvailable || 0) - 1);
    storedItem.stockReserved = Math.max(0, Number(storedItem.stockReserved || 0)) + 1;
    storedItem.updatedAt = now;

    const reservation = {
      id: reservationId,
      status: 'reserved',
      campaignId: campaign.id,
      campaignName: campaign.name,
      tierId: tier.id,
      tierName: tier.internalName,
      itemId: item.id,
      itemName: item.name,
      sku: item.sku,
      image: item.image,
      unitCost: item.unitCost,
      eligibleSubtotal,
      branchId,
      customerId: customer.uid,
      customerName: customer.name,
      phoneKey: customer.phoneKey,
      phoneSuffix: customer.phoneSuffix,
      reservedAt: now,
      updatedAt: now,
      expiresAt: now + RESERVATION_TTL_MS,
    };
    state.reservations[reservationId] = reservation;
    const claim = {
      reservationId,
      status: 'reserved',
      campaignId: campaign.id,
      customerId: customer.uid,
      phoneKey: customer.phoneKey,
      reservedAt: now,
      expiresAt: reservation.expiresAt,
    };
    state.claims.users[customer.uid] = claim;
    state.claims.phones[customer.phoneKey] = claim;
    return state;
  }, undefined, false);

  if (!result.committed) {
    const error = new Error(rejection);
    error.statusCode = 409;
    error.code = rejection.includes('agotar') || rejection.includes('disponible')
      ? 'REWARD_UNAVAILABLE'
      : 'REWARD_RESERVATION_REJECTED';
    throw error;
  }
  const reservation = result.snapshot.val()?.reservations?.[reservationId];
  return {
    reservationId,
    rewardSnapshot: normalizeFirstOrderRewardSnapshot(reservation),
  };
};

const handleConfirm = async (database, customer, payload) => {
  const reservationId = String(payload.reservationId || '').trim();
  const orderKey = String(payload.orderKey || '').trim();
  if (!reservationId || !orderKey) {
    const error = new Error('Falta la reserva o el pedido.');
    error.statusCode = 400;
    throw error;
  }
  const orderSnapshot = await database.ref(`orders/${orderKey}`).get();
  const order = orderSnapshot.val();
  if (!order || String(order.storeUserKey || '') !== customer.uid) {
    const error = new Error('No encontramos el pedido asociado a la regalia.');
    error.statusCode = 404;
    throw error;
  }
  const orderReward = normalizeFirstOrderRewardSnapshot(order.firstOrderReward);
  if (!orderReward || orderReward.reservationId !== reservationId) {
    const error = new Error('La regalia del pedido no coincide con la reserva.');
    error.statusCode = 409;
    throw error;
  }

  const reservationPreview = await database
    .ref(`storeIncentives/reservations/${reservationId}`)
    .get();
  if (!reservationPreview.exists()) {
    const error = new Error('La reserva ya no esta disponible.');
    error.statusCode = 409;
    throw error;
  }

  const now = Date.now();
  let rejection = 'La reserva ya no esta disponible.';
  const result = await database.ref('storeIncentives').transaction((stateValue) => {
    if (stateValue === null) {
      return {};
    }
    const state = stateValue || {};
    const reservation = state?.reservations?.[reservationId];
    if (!reservation || reservation.customerId !== customer.uid) {
      rejection = 'La reserva no pertenece a este cliente.';
      return;
    }
    if (reservation.status === 'ordered' && reservation.orderKey === orderKey) {
      return state;
    }
    if (reservation.status !== 'reserved') {
      return;
    }
    if (
      reservation.campaignId !== orderReward.campaignId ||
      reservation.tierId !== orderReward.tierId ||
      reservation.itemId !== orderReward.itemId ||
      reservation.sku !== orderReward.sku
    ) {
      rejection = 'El regalo reservado no coincide con el pedido.';
      return;
    }

    reservation.status = 'ordered';
    reservation.orderKey = orderKey;
    reservation.orderNumber = String(order.orderNumber || '').trim();
    reservation.orderDate = String(order.fecha || '').trim();
    reservation.orderedAt = now;
    reservation.updatedAt = now;
    const item = state?.config?.items?.[reservation.campaignId]?.[reservation.tierId]?.[reservation.itemId];
    if (item) {
      item.stockReserved = Math.max(0, Number(item.stockReserved || 0) - 1);
      item.updatedAt = now;
    }
    const claimPatch = {
      reservationId,
      status: 'used',
      campaignId: reservation.campaignId,
      customerId: customer.uid,
      phoneKey: customer.phoneKey,
      orderKey,
      usedAt: now,
    };
    state.claims.users[customer.uid] = claimPatch;
    state.claims.phones[customer.phoneKey] = claimPatch;
    return state;
  }, undefined, false);

  if (!result.committed) {
    const error = new Error(rejection);
    error.statusCode = 409;
    throw error;
  }

  await database.ref(`storeUsers/${customer.uid}`).update({
    first_order_reward_used: true,
    reward_campaign_id: orderReward.campaignId,
    reward_tier_id: orderReward.tierId,
    reward_item_id: orderReward.itemId,
    reward_order_id: orderKey,
    reward_redeemed_at: now,
  });
  return { confirmed: true, reservationId, orderKey };
};

const releaseReservation = async (database, reservationId, status = 'cancelled') => {
  const reservationPreview = await database
    .ref(`storeIncentives/reservations/${reservationId}`)
    .get();
  if (!reservationPreview.exists()) {
    return null;
  }
  const now = Date.now();
  let releasedReservation = null;
  const result = await database.ref('storeIncentives').transaction((stateValue) => {
    if (stateValue === null) {
      return {};
    }
    const state = stateValue || {};
    const reservation = state?.reservations?.[reservationId];
    if (!reservation) {
      return state;
    }
    releasedReservation = { ...reservation };
    releaseReservationInState(state, reservation, status, now);
    return state;
  }, undefined, false);
  return result.committed ? releasedReservation : null;
};

const clearCustomerRewardFlag = async (database, reservation = {}) => {
  if (!reservation?.customerId) {
    return;
  }
  const userRef = database.ref(`storeUsers/${reservation.customerId}`);
  const snapshot = await userRef.get();
  if (String(snapshot.val()?.reward_order_id || '') !== String(reservation.orderKey || '')) {
    return;
  }
  await userRef.update({
    first_order_reward_used: null,
    reward_campaign_id: null,
    reward_tier_id: null,
    reward_item_id: null,
    reward_order_id: null,
    reward_redeemed_at: null,
  });
};

const handleRelease = async (database, customer, decodedToken, payload) => {
  const reservationId = String(payload.reservationId || '').trim();
  if (!reservationId) {
    const error = new Error('Reserva invalida.');
    error.statusCode = 400;
    throw error;
  }
  const reservationSnapshot = await database.ref(`storeIncentives/reservations/${reservationId}`).get();
  const reservation = reservationSnapshot.val();
  if (!reservation) {
    return { released: true, alreadyReleased: true };
  }
  const role = await getRole(database, decodedToken.uid);
  const isAdmin = ADMIN_ROLES.has(role);
  if (!isAdmin && reservation.customerId !== customer.uid) {
    const error = new Error('Esta reserva no pertenece a tu cuenta.');
    error.statusCode = 403;
    throw error;
  }
  if (reservation.status === 'ordered') {
    const order = await getReservationOrder(database, reservation);
    if (!isAdmin && !isCanceledOrFailedOrder(order)) {
      const error = new Error('Solo se puede liberar una regalia de un pedido cancelado.');
      error.statusCode = 409;
      throw error;
    }
  }
  const released = await releaseReservation(database, reservationId, 'cancelled');
  await clearCustomerRewardFlag(database, released || reservation);
  return { released: true, reservationId };
};

const handleReconcile = async (database, uid) => {
  const role = await getRole(database, uid);
  if (!ADMIN_ROLES.has(role)) {
    const error = new Error('Permiso administrativo requerido.');
    error.statusCode = 403;
    throw error;
  }
  const snapshot = await database.ref('storeIncentives/reservations').get();
  const reservations = Object.values(snapshot.val() || {});
  let cancelled = 0;
  let delivered = 0;
  let expired = 0;

  for (const reservation of reservations) {
    if (
      reservation?.status === 'reserved' &&
      Number(reservation.expiresAt || 0) <= Date.now()
    ) {
      await releaseReservation(database, reservation.id, 'expired');
      expired += 1;
      continue;
    }
    if (reservation?.status !== 'ordered' || !reservation?.orderKey) {
      continue;
    }
    const order = await getReservationOrder(database, reservation);
    if (isCanceledOrFailedOrder(order)) {
      const released = await releaseReservation(database, reservation.id, 'cancelled');
      await clearCustomerRewardFlag(database, released || reservation);
      cancelled += 1;
      continue;
    }
    if (isDeliveredOrder(order)) {
      const now = Date.now();
      await database.ref().update({
        [`storeIncentives/reservations/${reservation.id}/status`]: 'delivered',
        [`storeIncentives/reservations/${reservation.id}/deliveredAt`]: now,
        [`storeIncentives/reservations/${reservation.id}/updatedAt`]: now,
        [`storeIncentives/claims/users/${reservation.customerId}/status`]: 'delivered',
        [`storeIncentives/claims/phones/${reservation.phoneKey}/status`]: 'delivered',
      });
      delivered += 1;
    }
  }
  return { reconciled: true, cancelled, delivered, expired };
};

export const handler = async (event) => {
  const headers = incentiveCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Metodo no permitido' }, headers);
  }

  try {
    const decodedToken = await verifyFirebaseRequest(event);
    const payload = JSON.parse(event.body || '{}');
    const action = String(payload.action || '').trim().toLowerCase();
    const { database } = getFirebaseAdmin();

    let result;
    if (action === 'reconcile') {
      result = await handleReconcile(database, decodedToken.uid);
    } else {
      const customer = await getCustomerContext(database, decodedToken.uid);
      if (action === 'eligibility') {
        result = await handleEligibility(database, customer, payload);
      } else if (action === 'reserve') {
        result = await handleReserve(database, customer, payload);
      } else if (action === 'confirm') {
        result = await handleConfirm(database, customer, payload);
      } else if (action === 'release') {
        result = await handleRelease(database, customer, decodedToken, payload);
      } else {
        return jsonResponse(400, { error: 'Accion invalida' }, headers);
      }
    }
    return jsonResponse(200, result, headers);
  } catch (error) {
    console.error('Error procesando regalo de primera compra:', error?.message || error);
    return jsonResponse(
      Number(error?.statusCode || 500),
      {
        error: error?.statusCode && error.statusCode < 500
          ? error.message
          : 'No pudimos procesar el regalo de primera compra.',
        code: error?.code || 'FIRST_ORDER_REWARD_ERROR',
      },
      headers
    );
  }
};
