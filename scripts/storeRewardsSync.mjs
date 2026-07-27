import {
  get,
  onChildAdded,
  onChildChanged,
  orderByKey,
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
  getOrderHistoryRetentionStartDate,
  ORDER_HISTORY_CLOUD_PATH,
  ORDER_HISTORY_RETENTION_DAYS,
} from '../src/services/orderArchive.js';
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
const HISTORY_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

export function createStoreRewardsSyncManager({ onArchivedOrderUpdated } = {}) {
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
    reconcilingHistory: false,
    lastHistoryReconcileAt: '',
    lastHistoryCandidateCount: 0,
    lastHistoryRepairedCount: 0,
    lastHistoryRepairs: [],
  };

  let unsubscribeAdded = null;
  let unsubscribeChanged = null;
  let dateTimer = null;
  let holdCleanupTimer = null;
  let historyReconcileTimer = null;
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

  const syncOrderRewards = async (orderKey, order = {}, sourcePath = STORE_ORDERS_PATH) => {
    await ensureAuthenticatedFirebaseSession();

    if (!isStoreOrder(order) || !orderKey) {
      return;
    }

    const settings = await loadRewardSettings();
    const cleanUserKey = String(order.storeUserKey || '').trim();
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const rootUpdates = {};
    const archivedOrderPatch = {};
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
          rootUpdates[`${sourcePath}/${orderKey}/rewardRedemption`] = {
            ...(order.rewardRedemption || {}),
            status: 'refunded',
            refundedAt: nowIso,
            refundedPoints: Number(refundResult.refundedPoints || 0),
          };
          archivedOrderPatch.rewardRedemption = rootUpdates[`${sourcePath}/${orderKey}/rewardRedemption`];
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
          rootUpdates[`${sourcePath}/${orderKey}/rewardRedemption`] = {
            ...(order.rewardRedemption || {}),
            status: 'redeemed',
            settledAt: nowIso,
            redeemedPoints: Number(settleResult.redeemedPoints || order.rewardRedemption.pointsRedeemed || 0),
          };
          archivedOrderPatch.rewardRedemption = rootUpdates[`${sourcePath}/${orderKey}/rewardRedemption`];
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
            note: 'Puntos acreditados por pedido entregado con total final actualizado.',
            databaseInstance: database,
          });

          if (earnedResult.applied || earnedResult.reason === 'already_applied') {
            const creditedPoints = Number(earnedResult.points || earnedPoints);
            rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`] = {
              ...(order.rewardPoints || {}),
              status: 'awarded',
              awarded: true,
              reversed: false,
              points: creditedPoints,
              basedOnTotal: Number(finalAmount || 0),
              transactionKey: earnedResult.transactionKey,
              awardedAt: nowIso,
              updatedAt: nowIso,
            };
            archivedOrderPatch.rewardPoints = rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`];
            rewardPointsUpdated = true;
            state.lastEarnedAt = nowIso;
          }
        } else {
          rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`] = {
            ...(order.rewardPoints || {}),
            status: 'not_eligible',
            awarded: false,
            reversed: false,
            points: 0,
            basedOnTotal: Number(finalAmount || 0),
            updatedAt: nowIso,
          };
          archivedOrderPatch.rewardPoints = rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`];
          rewardPointsUpdated = true;
        }
      } else if (
        settings.enabled !== true &&
        order.rewardPoints?.awarded !== true &&
        String(order.rewardPoints?.status || '').trim().toLowerCase() === 'pending'
      ) {
        rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`] = {
          ...(order.rewardPoints || {}),
          status: 'program_disabled',
          awarded: false,
          reversed: false,
          points: 0,
          basedOnTotal: Number(finalAmount || 0),
          updatedAt: nowIso,
        };
        archivedOrderPatch.rewardPoints = rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`];
        rewardPointsUpdated = true;
      }
    } else if (isCanceledStoreOrder(order) && order.rewardPoints?.awarded === true && order.rewardPoints?.reversed !== true) {
      const reverseResult = await reverseStoreRewardEarnedPoints({
        userKey: cleanUserKey,
        orderKey,
        note: 'Puntos revertidos por pedido cancelado.',
        databaseInstance: database,
      });

      if (reverseResult.reversed) {
        rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`] = {
          ...(order.rewardPoints || {}),
          status: 'reversed',
          reversed: true,
          reversedAt: nowIso,
          reversedPoints: Number(reverseResult.points || 0),
          updatedAt: nowIso,
        };
        archivedOrderPatch.rewardPoints = rootUpdates[`${sourcePath}/${orderKey}/rewardPoints`];
        rewardPointsUpdated = true;
      }
    }

    if (Object.keys(rootUpdates).length > 0) {
      await update(ref(database), rootUpdates);
      if (sourcePath !== STORE_ORDERS_PATH && Object.keys(archivedOrderPatch).length > 0) {
        await Promise.resolve(
          onArchivedOrderUpdated?.({
            orderKey,
            orderDate: order?.fecha,
            patch: archivedOrderPatch,
          })
        ).catch(() => {});
      }
    }

    if (rewardRecordUpdated || rewardPointsUpdated) {
      state.lastSyncAt = nowIso;
      state.lastProcessedOrderKey = orderKey;
      state.processedCount += 1;
      state.lastError = '';
    }

    return {
      updated: rewardRecordUpdated || rewardPointsUpdated,
      points: Number(archivedOrderPatch.rewardPoints?.points || 0),
      status: String(archivedOrderPatch.rewardPoints?.status || ''),
    };
  };

  const shouldReconcileArchivedOrder = (order = {}) => {
    if (!isStoreOrder(order)) {
      return false;
    }

    const redemptionStatus = String(order?.rewardRedemption?.status || '').trim().toLowerCase();
    if (
      order?.rewardRedemption?.reservationId &&
      !['redeemed', 'refunded'].includes(redemptionStatus) &&
      (isDeliveredStoreOrder(order) || isCanceledStoreOrder(order))
    ) {
      return true;
    }

    if (isDeliveredStoreOrder(order) && !isCanceledStoreOrder(order)) {
      const rewardStatus = String(order?.rewardPoints?.status || '').trim().toLowerCase();
      const hasPendingRewardIntent =
        rewardStatus === 'pending' || Number(order?.rewardPoints?.estimatedPoints || 0) > 0;
      return (
        hasPendingRewardIntent &&
        order.totalAproximado === false &&
        resolveStoreRewardOrderFinalAmount(order) > 0 &&
        order.rewardPoints?.awarded !== true
      );
    }

    if (isCanceledStoreOrder(order) && order.rewardPoints?.awarded === true) {
      return order.rewardPoints?.reversed !== true;
    }

    return false;
  };

  const reconcileArchivedRewards = async () => {
    if (state.reconcilingHistory) {
      return {
        ok: true,
        skipped: true,
        candidateCount: state.lastHistoryCandidateCount,
        repairedCount: state.lastHistoryRepairedCount,
      };
    }

    await ensureAuthenticatedFirebaseSession();
    state.reconcilingHistory = true;

    try {
      const startDate = getOrderHistoryRetentionStartDate(new Date(), ORDER_HISTORY_RETENTION_DAYS);
      const snapshot = await get(
        query(ref(database, ORDER_HISTORY_CLOUD_PATH), orderByKey(), startAt(startDate))
      );
      const candidates = [];

      Object.entries(snapshot.val() || {}).forEach(([dateKey, orders]) => {
        Object.entries(orders || {}).forEach(([orderKey, order]) => {
          if (shouldReconcileArchivedOrder(order)) {
            candidates.push({ dateKey, orderKey, order });
          }
        });
      });

      const repairs = [];
      for (const candidate of candidates) {
        const result = await syncOrderRewards(
          candidate.orderKey,
          candidate.order,
          `${ORDER_HISTORY_CLOUD_PATH}/${candidate.dateKey}`
        );
        if (result?.updated) {
          repairs.push({
            orderKey: candidate.orderKey,
            orderNumber: Number(candidate.order?.id || 0),
            customerName: String(candidate.order?.cliente || '').trim(),
            points: Number(result.points || 0),
            status: result.status,
          });
        }
      }

      state.lastHistoryReconcileAt = new Date().toISOString();
      state.lastHistoryCandidateCount = candidates.length;
      state.lastHistoryRepairedCount = repairs.length;
      state.lastHistoryRepairs = repairs.slice(-25);
      state.lastError = '';

      return {
        ok: true,
        startDate,
        candidateCount: candidates.length,
        repairedCount: repairs.length,
        candidates: candidates.slice(0, 50).map(({ orderKey, order }) => ({
          orderKey,
          orderNumber: Number(order?.id || 0),
          customerName: String(order?.cliente || '').trim(),
          status: String(order?.estado || '').trim(),
          rewardStatus: String(order?.rewardPoints?.status || '').trim(),
          rewardAwarded: order?.rewardPoints?.awarded === true,
          rewardReversed: order?.rewardPoints?.reversed === true,
          redemptionStatus: String(order?.rewardRedemption?.status || '').trim(),
        })),
        repairs,
      };
    } catch (error) {
      handleSyncError(error);
      throw error;
    } finally {
      state.reconcilingHistory = false;
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

  const scheduleHistoryReconcile = () => {
    if (!state.listening) {
      return;
    }

    if (historyReconcileTimer) {
      clearTimeout(historyReconcileTimer);
    }

    historyReconcileTimer = setTimeout(() => {
      reconcileArchivedRewards()
        .catch(handleSyncError)
        .finally(scheduleHistoryReconcile);
    }, HISTORY_RECONCILE_INTERVAL_MS);
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
    await reconcileArchivedRewards();
    scheduleHistoryReconcile();
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

    if (historyReconcileTimer) {
      clearTimeout(historyReconcileTimer);
      historyReconcileTimer = null;
    }
  };

  return {
    state,
    initAutoSync,
    reconcileArchivedRewards,
    stopAutoSync,
  };
}
