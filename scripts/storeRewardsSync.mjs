import {
  get,
  onChildAdded,
  onChildChanged,
  orderByChild,
  query,
  ref,
  set,
  startAt,
  update,
} from 'firebase/database';
import {
  applyStoreRewardEarnedPoints,
  calculateEarnedRewardPoints,
  normalizeStoreRewardSettings,
  releaseStoreRewardReservation,
  resolveStoreRewardOrderFinalAmount,
  seedDefaultStoreRewardsProgramIfEmpty,
  settleStoreRewardReservation,
  reverseStoreRewardEarnedPoints,
  STORE_ORDER_REWARD_REDEMPTIONS_PATH,
  STORE_REWARD_SETTINGS_PATH,
} from '../src/services/storeRewards.js';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const STORE_CHANNEL = 'tienda_virtual';
const STORE_ORDERS_PATH = 'orders';
const STORE_REWARD_ACCOUNTS_PATH = 'storeRewardAccounts';
const ORDER_LOOKBACK_DAYS = 60;
const DATE_WATCH_INTERVAL_MS = 60 * 1000;
const HOLD_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const STALE_HOLD_MS = 15 * 60 * 1000;

const normalizeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isCanceledStoreOrder = (order = {}) => {
  const normalized = normalizeText(order?.estado || 'pendiente');
  return normalized.includes('cancel') || normalized.includes('anulad');
};

const isDeliveredStoreOrder = (order = {}) => normalizeText(order?.estado || '').includes('entregado');

const isStoreOrder = (order = {}) =>
  String(order?.canal || '').trim() === STORE_CHANNEL && String(order?.storeUserKey || '').trim();

const formatDateKey = (date = new Date()) => {
  const safeDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWatchStartDate = (daysBack = ORDER_LOOKBACK_DAYS) => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() - Math.max(1, Number(daysBack || ORDER_LOOKBACK_DAYS)));
  return formatDateKey(baseDate);
};

const buildRewardRedemptionRecord = (orderKey, order = {}) => ({
  orderKey,
  orderNumber: Number(order?.id || 0),
  fecha: String(order?.fecha || '').trim(),
  customerId: String(order?.storeUserKey || '').trim(),
  customerName: String(order?.cliente || '').trim(),
  rewardRedemption: order?.rewardRedemption || null,
  updatedAt: Date.now(),
});

export function createStoreRewardsSyncManager() {
  const database = getAuthenticatedFirebaseDatabase();
  const state = {
    listening: false,
    currentStartDate: '',
    processedCount: 0,
    lastProcessedOrderKey: '',
    lastEarnedAt: '',
    lastRedeemedAt: '',
    lastRefundAt: '',
    lastError: '',
    lastSyncAt: '',
    lastHoldCleanupAt: '',
    lastReleasedHolds: 0,
  };

  let unsubscribeAdded = null;
  let unsubscribeChanged = null;
  let dateTimer = null;
  let holdCleanupTimer = null;
  const runningOrders = new Map();

  const handleSyncError = (error) => {
    state.lastError = String(error?.message || error || 'No se pudo sincronizar Club San Martin.');
  };

  const clearListeners = () => {
    if (typeof unsubscribeAdded === 'function') {
      unsubscribeAdded();
      unsubscribeAdded = null;
    }

    if (typeof unsubscribeChanged === 'function') {
      unsubscribeChanged();
      unsubscribeChanged = null;
    }
  };

  const loadRewardSettings = async () => {
    const snapshot = await get(ref(database, STORE_REWARD_SETTINGS_PATH));
    return normalizeStoreRewardSettings(snapshot.val());
  };

  const syncOrderRewards = async (orderKey, order = {}) => {
    await ensureAuthenticatedFirebaseSession();

    if (!isStoreOrder(order) || !orderKey) {
      return;
    }

    const settings = await loadRewardSettings();
    const cleanUserKey = String(order.storeUserKey || '').trim();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const rootUpdates = {};
    let rewardRecordUpdated = false;
    let rewardPointsUpdated = false;

    if (order.rewardRedemption?.reservationId) {
      const reservationId = String(order.rewardRedemption.reservationId || '').trim();

      if (isCanceledStoreOrder(order) && order.rewardRedemption.status !== 'refunded') {
        const refundResult = await releaseStoreRewardReservation({
          userKey: cleanUserKey,
          reservationId,
          orderKey,
          note: 'Puntos devueltos porque el pedido fue cancelado.',
          databaseInstance: database,
        });

        if (refundResult.restored) {
          rootUpdates[`${STORE_ORDERS_PATH}/${orderKey}/rewardRedemption`] = {
            ...(order.rewardRedemption || {}),
            status: 'refunded',
            refundedAt: nowIso,
            refundedPoints: Number(refundResult.refundedPoints || 0),
          };
          rootUpdates[`${STORE_ORDER_REWARD_REDEMPTIONS_PATH}/${orderKey}`] = {
            ...buildRewardRedemptionRecord(orderKey, order),
            rewardRedemption: {
              ...(order.rewardRedemption || {}),
              status: 'refunded',
              refundedAt: nowIso,
              refundedPoints: Number(refundResult.refundedPoints || 0),
            },
          };
          rewardRecordUpdated = true;
          state.lastRefundAt = nowIso;
        }
      } else if (isDeliveredStoreOrder(order) && order.rewardRedemption.status !== 'redeemed') {
        const settleResult = await settleStoreRewardReservation({
          userKey: cleanUserKey,
          reservationId,
          orderKey,
          note: 'Premio confirmado en pedido entregado.',
          databaseInstance: database,
        });

        if (settleResult.settled) {
          rootUpdates[`${STORE_ORDERS_PATH}/${orderKey}/rewardRedemption`] = {
            ...(order.rewardRedemption || {}),
            status: 'redeemed',
            settledAt: nowIso,
            redeemedPoints: Number(settleResult.redeemedPoints || order.rewardRedemption.pointsRedeemed || 0),
          };
          rootUpdates[`${STORE_ORDER_REWARD_REDEMPTIONS_PATH}/${orderKey}`] = {
            ...buildRewardRedemptionRecord(orderKey, order),
            rewardRedemption: {
              ...(order.rewardRedemption || {}),
              status: 'redeemed',
              settledAt: nowIso,
              redeemedPoints: Number(settleResult.redeemedPoints || order.rewardRedemption.pointsRedeemed || 0),
            },
          };
          rewardRecordUpdated = true;
          state.lastRedeemedAt = nowIso;
        }
      }
    }

    if (isDeliveredStoreOrder(order) && !isCanceledStoreOrder(order)) {
      const finalAmount = resolveStoreRewardOrderFinalAmount(order);
      const shouldCredit =
        settings.enabled === true &&
        Number(finalAmount || 0) > 0 &&
        order.totalAproximado === false &&
        order.rewardPoints?.awarded !== true;

      if (shouldCredit) {
        const earnedPoints = calculateEarnedRewardPoints(finalAmount, settings);
        if (earnedPoints > 0) {
          const earnedResult = await applyStoreRewardEarnedPoints({
            userKey: cleanUserKey,
            orderKey,
            points: earnedPoints,
            note: 'Puntos acreditados por pedido entregado con total final de SICAR.',
            databaseInstance: database,
          });

          if (earnedResult.applied) {
            rootUpdates[`${STORE_ORDERS_PATH}/${orderKey}/rewardPoints`] = {
              ...(order.rewardPoints || {}),
              status: 'awarded',
              awarded: true,
              reversed: false,
              points: earnedPoints,
              basedOnTotal: Number(finalAmount || 0),
              transactionKey: earnedResult.transactionKey,
              awardedAt: nowIso,
              updatedAt: nowIso,
            };
            rewardPointsUpdated = true;
            state.lastEarnedAt = nowIso;
          }
        } else {
          rootUpdates[`${STORE_ORDERS_PATH}/${orderKey}/rewardPoints`] = {
            ...(order.rewardPoints || {}),
            status: 'not_eligible',
            awarded: false,
            reversed: false,
            points: 0,
            basedOnTotal: Number(finalAmount || 0),
            updatedAt: nowIso,
          };
          rewardPointsUpdated = true;
        }
      }
    } else if (isCanceledStoreOrder(order) && order.rewardPoints?.awarded === true && order.rewardPoints?.reversed !== true) {
      const reverseResult = await reverseStoreRewardEarnedPoints({
        userKey: cleanUserKey,
        orderKey,
        note: 'Puntos revertidos por pedido cancelado.',
        databaseInstance: database,
      });

      if (reverseResult.reversed) {
        rootUpdates[`${STORE_ORDERS_PATH}/${orderKey}/rewardPoints`] = {
          ...(order.rewardPoints || {}),
          status: 'reversed',
          reversed: true,
          reversedAt: nowIso,
          reversedPoints: Number(reverseResult.points || 0),
          updatedAt: nowIso,
        };
        rewardPointsUpdated = true;
      }
    }

    if (Object.keys(rootUpdates).length > 0) {
      await update(ref(database), rootUpdates);
    }

    if (rewardRecordUpdated || rewardPointsUpdated) {
      state.lastSyncAt = nowIso;
      state.lastProcessedOrderKey = orderKey;
      state.processedCount += 1;
      state.lastError = '';
    }
  };

  const queueOrderSync = (snapshot) => {
    const orderKey = String(snapshot?.key || '').trim();
    const order = snapshot?.val() || {};

    if (!orderKey || !isStoreOrder(order)) {
      return;
    }

    if (runningOrders.has(orderKey)) {
      return;
    }

    const syncPromise = syncOrderRewards(orderKey, order)
      .catch(handleSyncError)
      .finally(() => {
        runningOrders.delete(orderKey);
      });

    runningOrders.set(orderKey, syncPromise);
  };

  const cleanupOrphanedReservations = async () => {
    await ensureAuthenticatedFirebaseSession();

    const [ordersSnapshot, accountsSnapshot] = await Promise.all([
      get(
        query(
          ref(database, STORE_ORDERS_PATH),
          orderByChild('fecha'),
          startAt(state.currentStartDate || getWatchStartDate())
        )
      ),
      get(ref(database, STORE_REWARD_ACCOUNTS_PATH)),
    ]);

    const activeReservationIds = new Set();
    Object.values(ordersSnapshot.val() || {}).forEach((order) => {
      if (!isStoreOrder(order)) {
        return;
      }

      const reservationId = String(order?.rewardRedemption?.reservationId || '').trim();
      if (reservationId) {
        activeReservationIds.add(reservationId);
      }
    });

    const now = Date.now();
    let releasedCount = 0;

    for (const [userKey, account] of Object.entries(accountsSnapshot.val() || {})) {
      const holds = account?.holds && typeof account.holds === 'object' ? account.holds : {};

      for (const [reservationId, hold] of Object.entries(holds)) {
        const requestedAt = Number(hold?.requestedAt || 0);
        if (!requestedAt || now - requestedAt < STALE_HOLD_MS) {
          continue;
        }

        if (activeReservationIds.has(reservationId)) {
          continue;
        }

        const releaseResult = await releaseStoreRewardReservation({
          userKey,
          reservationId,
          note: 'Reserva huérfana liberada automaticamente por el integrador.',
          databaseInstance: database,
        });

        if (releaseResult.restored) {
          releasedCount += 1;
        }
      }
    }

    state.lastHoldCleanupAt = new Date(now).toISOString();
    state.lastReleasedHolds = releasedCount;
  };

  const subscribeOrders = () => {
    const nextStartDate = getWatchStartDate();
    if (state.currentStartDate === nextStartDate && unsubscribeAdded && unsubscribeChanged) {
      return;
    }

    clearListeners();
    state.currentStartDate = nextStartDate;

    const recentOrdersQuery = query(
      ref(database, STORE_ORDERS_PATH),
      orderByChild('fecha'),
      startAt(nextStartDate)
    );

    unsubscribeAdded = onChildAdded(recentOrdersQuery, queueOrderSync, handleSyncError);
    unsubscribeChanged = onChildChanged(recentOrdersQuery, queueOrderSync, handleSyncError);
  };

  const scheduleDateWatcher = () => {
    if (!state.listening) {
      return;
    }

    if (dateTimer) {
      clearTimeout(dateTimer);
    }

    dateTimer = setTimeout(() => {
      subscribeOrders();
      scheduleDateWatcher();
    }, DATE_WATCH_INTERVAL_MS);
  };

  const scheduleHoldCleanup = () => {
    if (!state.listening) {
      return;
    }

    if (holdCleanupTimer) {
      clearTimeout(holdCleanupTimer);
    }

    holdCleanupTimer = setTimeout(() => {
      cleanupOrphanedReservations()
        .catch(handleSyncError)
        .finally(() => {
          scheduleHoldCleanup();
        });
    }, HOLD_CLEANUP_INTERVAL_MS);
  };

  const initAutoSync = async () => {
    if (state.listening) {
      return;
    }

    await ensureAuthenticatedFirebaseSession();
    await seedDefaultStoreRewardsProgramIfEmpty({ databaseInstance: database });
    state.listening = true;
    subscribeOrders();
    scheduleDateWatcher();
    cleanupOrphanedReservations().catch(handleSyncError).finally(() => {
      scheduleHoldCleanup();
    });
  };

  const stopAutoSync = () => {
    state.listening = false;
    clearListeners();

    if (dateTimer) {
      clearTimeout(dateTimer);
      dateTimer = null;
    }

    if (holdCleanupTimer) {
      clearTimeout(holdCleanupTimer);
      holdCleanupTimer = null;
    }
  };

  return {
    state,
    initAutoSync,
    stopAutoSync,
  };
}
