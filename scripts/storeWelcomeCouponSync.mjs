import {
  get,
  onChildAdded,
  onChildChanged,
  orderByChild,
  query,
  ref,
  startAt,
  update,
} from 'firebase/database';
import {
  buildStoreWelcomeCouponReleasedState,
  buildStoreWelcomeCouponReservationState,
  buildStoreWelcomeCouponUsedState,
  isStoreWelcomeCouponCoupon,
  normalizeStoreWelcomeCoupon,
} from '../src/services/storeWelcomeCoupon.js';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const STORE_CHANNEL = 'tienda_virtual';
const STORE_ORDERS_PATH = 'orders';
const STORE_USERS_PATH = 'storeUsers';
const ORDER_LOOKBACK_DAYS = 90;
const DATE_WATCH_INTERVAL_MS = 60 * 1000;

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

const buildSyncStamp = (status, order = {}, orderKey = '') => ({
  status,
  orderKey,
  orderNumber: Number(order?.id || 0),
  updatedAt: new Date().toISOString(),
});

export function createStoreWelcomeCouponSyncManager() {
  const database = getAuthenticatedFirebaseDatabase();
  const state = {
    listening: false,
    currentStartDate: '',
    processedCount: 0,
    lastProcessedOrderKey: '',
    lastReservedAt: '',
    lastUsedAt: '',
    lastReleasedAt: '',
    lastError: '',
    lastSyncAt: '',
  };

  let unsubscribeAdded = null;
  let unsubscribeChanged = null;
  let dateTimer = null;
  const runningOrders = new Map();

  const handleSyncError = (error) => {
    state.lastError = String(error?.message || error || 'No se pudo sincronizar el cupon de bienvenida.');
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

  const syncOrderCoupon = async (orderKey, order = {}) => {
    await ensureAuthenticatedFirebaseSession();

    if (!orderKey || !isStoreOrder(order) || !isStoreWelcomeCouponCoupon(order?.cupon || {})) {
      return;
    }

    const userKey = String(order?.storeUserKey || '').trim();
    if (!userKey) {
      return;
    }

    const userSnapshot = await get(ref(database, `${STORE_USERS_PATH}/${userKey}`));
    const currentWelcomeCoupon = normalizeStoreWelcomeCoupon(userSnapshot.val()?.welcomeCoupon);
    if (!currentWelcomeCoupon) {
      return;
    }

    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const currentLastOrderKey = String(currentWelcomeCoupon.lastOrderKey || '').trim();
    const shouldHandleThisOrder =
      currentLastOrderKey === orderKey ||
      (!currentLastOrderKey && String(currentWelcomeCoupon.coupon?.code || '').trim() === String(order?.cupon?.code || '').trim());

    if (!shouldHandleThisOrder && currentWelcomeCoupon.usedAt > 0) {
      return;
    }

    let nextWelcomeCoupon = null;
    let syncStatus = '';

    if (isCanceledStoreOrder(order)) {
      if (currentLastOrderKey !== orderKey && currentWelcomeCoupon.usedAt <= 0 && currentWelcomeCoupon.status !== 'reserved') {
        return;
      }

      nextWelcomeCoupon = buildStoreWelcomeCouponReleasedState({
        welcomeCoupon: currentWelcomeCoupon,
        releasedAt: now,
      });
      syncStatus = 'released';
      state.lastReleasedAt = nowIso;
    } else if (isDeliveredStoreOrder(order)) {
      nextWelcomeCoupon = buildStoreWelcomeCouponUsedState({
        welcomeCoupon: currentWelcomeCoupon,
        orderKey,
        usedAt: now,
      });
      syncStatus = 'used';
      state.lastUsedAt = nowIso;
    } else if (currentWelcomeCoupon.usedAt <= 0) {
      nextWelcomeCoupon = buildStoreWelcomeCouponReservationState({
        welcomeCoupon: currentWelcomeCoupon,
        orderKey,
        reservedAt: now,
      });
      syncStatus = 'reserved';
      state.lastReservedAt = nowIso;
    }

    if (!nextWelcomeCoupon) {
      return;
    }

    const samePayload = JSON.stringify(nextWelcomeCoupon) === JSON.stringify(currentWelcomeCoupon);
    const currentSyncStatus = String(order?.welcomeCouponSync?.status || '').trim();
    if (samePayload && currentSyncStatus === syncStatus) {
      return;
    }

    await update(ref(database), {
      [`${STORE_USERS_PATH}/${userKey}/welcomeCoupon`]: nextWelcomeCoupon,
      [`${STORE_ORDERS_PATH}/${orderKey}/welcomeCouponSync`]: buildSyncStamp(syncStatus, order, orderKey),
    });

    state.processedCount += 1;
    state.lastProcessedOrderKey = orderKey;
    state.lastSyncAt = nowIso;
    state.lastError = '';
  };

  const queueOrderSync = (snapshot) => {
    const orderKey = String(snapshot?.key || '').trim();
    const order = snapshot?.val() || {};

    if (!orderKey || !isStoreOrder(order) || !isStoreWelcomeCouponCoupon(order?.cupon || {})) {
      return;
    }

    if (runningOrders.has(orderKey)) {
      return;
    }

    const syncPromise = syncOrderCoupon(orderKey, order)
      .catch(handleSyncError)
      .finally(() => {
        runningOrders.delete(orderKey);
      });

    runningOrders.set(orderKey, syncPromise);
  };

  const attachListeners = () => {
    clearListeners();

    const ordersQuery = query(
      ref(database, STORE_ORDERS_PATH),
      orderByChild('fecha'),
      startAt(state.currentStartDate || getWatchStartDate())
    );

    unsubscribeAdded = onChildAdded(ordersQuery, queueOrderSync, handleSyncError);
    unsubscribeChanged = onChildChanged(ordersQuery, queueOrderSync, handleSyncError);
    state.listening = true;
  };

  const refreshWatchWindow = () => {
    const nextStartDate = getWatchStartDate();
    if (nextStartDate === state.currentStartDate) {
      return;
    }

    state.currentStartDate = nextStartDate;
    attachListeners();
  };

  const syncRecentOrders = async () => {
    await ensureAuthenticatedFirebaseSession();

    const startDate = getWatchStartDate();
    state.currentStartDate = startDate;

    const snapshot = await get(
      query(ref(database, STORE_ORDERS_PATH), orderByChild('fecha'), startAt(startDate))
    );

    const entries = Object.entries(snapshot.val() || {});
    for (const [orderKey, order] of entries) {
      if (!isStoreOrder(order) || !isStoreWelcomeCouponCoupon(order?.cupon || {})) {
        continue;
      }

      await syncOrderCoupon(orderKey, order);
    }
  };

  const initAutoSync = async () => {
    await ensureAuthenticatedFirebaseSession();
    state.currentStartDate = getWatchStartDate();
    await syncRecentOrders();
    attachListeners();

    if (dateTimer) {
      clearInterval(dateTimer);
    }

    dateTimer = setInterval(() => {
      try {
        refreshWatchWindow();
      } catch (error) {
        handleSyncError(error);
      }
    }, DATE_WATCH_INTERVAL_MS);
  };

  const stop = () => {
    clearListeners();
    if (dateTimer) {
      clearInterval(dateTimer);
      dateTimer = null;
    }
    state.listening = false;
  };

  return {
    state,
    initAutoSync,
    stop,
    syncRecentOrders,
  };
}
