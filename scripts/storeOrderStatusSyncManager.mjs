import { getApps, initializeApp } from 'firebase/app';
import {
  equalTo,
  get,
  getDatabase,
  onChildAdded,
  onChildChanged,
  orderByChild,
  query,
  ref,
  update,
} from 'firebase/database';
import {
  buildStoreOrderStatusRecord,
  isExpiredFinalStoreOrder,
  STORE_CHANNEL,
  STORE_ORDER_RETENTION_DAYS,
  STORE_ORDER_STATUS_PATH,
} from '../src/services/orders.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const DATE_CHECK_INTERVAL_MS = 60 * 1000;
const PRUNE_INTERVAL_MS = 15 * 60 * 1000;

const getFirebaseDatabase = () => {
  const existingApp = getApps().find((entry) => entry.name === 'store-order-status-sync');
  const app = existingApp || initializeApp(FIREBASE_CONFIG, 'store-order-status-sync');
  return getDatabase(app);
};

const formatDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const shouldSyncPublicStoreOrder = (order = {}) =>
  String(order?.canal || '').trim() === STORE_CHANNEL && String(order?.storeUserKey || '').trim();

export function createStoreOrderStatusSyncManager() {
  const database = getFirebaseDatabase();
  const state = {
    listening: false,
    currentDate: '',
    lastSyncAt: '',
    lastSyncOrderKey: '',
    lastPruneAt: '',
    lastPruneCount: 0,
    lastError: '',
  };

  let dateTimer = null;
  let pruneTimer = null;
  let unsubscribeAdded = null;
  let unsubscribeChanged = null;

  const clearOrderListeners = () => {
    if (typeof unsubscribeAdded === 'function') {
      unsubscribeAdded();
      unsubscribeAdded = null;
    }

    if (typeof unsubscribeChanged === 'function') {
      unsubscribeChanged();
      unsubscribeChanged = null;
    }
  };

  const syncOrderSnapshot = async (snapshot) => {
    const orderKey = String(snapshot?.key || '').trim();
    const order = snapshot?.val() || {};

    if (!orderKey || !shouldSyncPublicStoreOrder(order)) {
      return;
    }

    const statusRecord = buildStoreOrderStatusRecord(orderKey, {
      ...order,
      firebaseKey: orderKey,
    });

    if (!statusRecord) {
      return;
    }

    await update(ref(database), {
      [`${STORE_ORDER_STATUS_PATH}/${statusRecord.storeUserKey}/${orderKey}`]: statusRecord,
    });

    state.lastSyncAt = new Date().toISOString();
    state.lastSyncOrderKey = orderKey;
    state.lastError = '';
  };

  const handleSyncError = (error) => {
    state.lastError = String(error?.message || error || 'No se pudo sincronizar el estado publico.');
  };

  const subscribeForToday = () => {
    const nextDate = formatDateKey(new Date());
    if (state.currentDate === nextDate && unsubscribeAdded && unsubscribeChanged) {
      return;
    }

    clearOrderListeners();
    state.currentDate = nextDate;

    const todayOrdersQuery = query(
      ref(database, 'orders'),
      orderByChild('fecha'),
      equalTo(nextDate)
    );

    unsubscribeAdded = onChildAdded(todayOrdersQuery, (snapshot) => {
      syncOrderSnapshot(snapshot).catch(handleSyncError);
    }, handleSyncError);

    unsubscribeChanged = onChildChanged(todayOrdersQuery, (snapshot) => {
      syncOrderSnapshot(snapshot).catch(handleSyncError);
    }, handleSyncError);
  };

  const scheduleDateWatcher = () => {
    if (!state.listening) {
      return;
    }

    if (dateTimer) {
      clearTimeout(dateTimer);
    }

    dateTimer = setTimeout(() => {
      subscribeForToday();
      scheduleDateWatcher();
    }, DATE_CHECK_INTERVAL_MS);
  };

  const pruneExpiredStatuses = async () => {
    const snapshot = await get(ref(database, STORE_ORDER_STATUS_PATH));
    const data = snapshot.val() || {};
    const updates = {};
    let removedCount = 0;

    Object.entries(data).forEach(([storeUserKey, orders]) => {
      Object.entries(orders || {}).forEach(([orderKey, order]) => {
        if (isExpiredFinalStoreOrder({ ...order, canal: STORE_CHANNEL }, Date.now(), STORE_ORDER_RETENTION_DAYS)) {
          updates[`${STORE_ORDER_STATUS_PATH}/${storeUserKey}/${orderKey}`] = null;
          removedCount += 1;
        }
      });
    });

    if (removedCount > 0) {
      await update(ref(database), updates);
    }

    state.lastPruneAt = new Date().toISOString();
    state.lastPruneCount = removedCount;
    state.lastError = '';
  };

  const schedulePrune = () => {
    if (!state.listening) {
      return;
    }

    if (pruneTimer) {
      clearTimeout(pruneTimer);
    }

    pruneTimer = setTimeout(() => {
      pruneExpiredStatuses()
        .catch(handleSyncError)
        .finally(() => {
          schedulePrune();
        });
    }, PRUNE_INTERVAL_MS);
  };

  const initAutoSync = () => {
    if (state.listening) {
      return;
    }

    state.listening = true;
    subscribeForToday();
    scheduleDateWatcher();
    pruneExpiredStatuses().catch(handleSyncError).finally(() => {
      schedulePrune();
    });
  };

  const stopAutoSync = () => {
    state.listening = false;
    clearOrderListeners();

    if (dateTimer) {
      clearTimeout(dateTimer);
      dateTimer = null;
    }

    if (pruneTimer) {
      clearTimeout(pruneTimer);
      pruneTimer = null;
    }
  };

  return {
    state,
    initAutoSync,
    stopAutoSync,
    pruneExpiredStatuses,
  };
}
