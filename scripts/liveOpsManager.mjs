import { getApps, initializeApp } from 'firebase/app';
import {
  equalTo,
  get,
  getDatabase,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  orderByChild,
  query,
  ref,
} from 'firebase/database';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const SOURCE_PATHS = {
  orders: 'orders',
  rutaOrders: 'rutaOrders',
};

const getFirebaseDatabase = () => {
  const existingApp = getApps().find((entry) => entry.name === 'live-ops-manager');
  const app = existingApp || initializeApp(FIREBASE_CONFIG, 'live-ops-manager');
  return getDatabase(app);
};

const sortCollectionItems = (source, items = []) => {
  const safeItems = [...items];

  if (source === 'rutaOrders') {
    return safeItems.sort((left, right) => {
      const timestampDiff = Number(left?.timestamp || 0) - Number(right?.timestamp || 0);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }

      return Number(left?.id || 0) - Number(right?.id || 0);
    });
  }

  return safeItems.sort((left, right) => {
    const idDiff = Number(left?.id || 0) - Number(right?.id || 0);
    if (idDiff !== 0) {
      return idDiff;
    }

    return Number(left?.timestamp || 0) - Number(right?.timestamp || 0);
  });
};

export function createLiveOpsManager() {
  const database = getFirebaseDatabase();
  const caches = {
    orders: new Map(),
    rutaOrders: new Map(),
  };
  const revisions = {
    orders: 0,
    rutaOrders: 0,
  };
  const unsubscribers = {
    orders: [],
    rutaOrders: [],
  };
  const state = {
    listening: false,
    currentDate: '',
    ordersRevision: 0,
    rutaOrdersRevision: 0,
    lastOrdersCount: 0,
    lastRutaOrdersCount: 0,
    lastSyncAt: '',
    lastError: '',
  };

  const clearSourceListeners = (source) => {
    unsubscribers[source].forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch {
        // noop
      }
    });
    unsubscribers[source] = [];
  };

  const clearAllListeners = () => {
    Object.keys(unsubscribers).forEach((source) => {
      clearSourceListeners(source);
    });
  };

  const bumpRevision = (source) => {
    const now = Date.now();
    revisions[source] = now;
    state.lastSyncAt = new Date(now).toISOString();
    state.lastError = '';

    if (source === 'orders') {
      state.ordersRevision = now;
      state.lastOrdersCount = caches.orders.size;
      return;
    }

    state.rutaOrdersRevision = now;
    state.lastRutaOrdersCount = caches.rutaOrders.size;
  };

  const primeSource = async (source, date) => {
    const sourcePath = SOURCE_PATHS[source];
    if (!sourcePath) {
      return;
    }

    const snapshot = await get(
      query(ref(database, sourcePath), orderByChild('fecha'), equalTo(String(date || '').trim()))
    );

    const nextCache = new Map();
    Object.entries(snapshot.val() || {}).forEach(([firebaseKey, value]) => {
      nextCache.set(firebaseKey, {
        firebaseKey,
        ...(value || {}),
      });
    });

    caches[source] = nextCache;
    bumpRevision(source);
  };

  const subscribeSource = async (source, date) => {
    const sourcePath = SOURCE_PATHS[source];
    if (!sourcePath) {
      return;
    }

    clearSourceListeners(source);
    await primeSource(source, date);

    const collectionQuery = query(
      ref(database, sourcePath),
      orderByChild('fecha'),
      equalTo(String(date || '').trim())
    );

    const handleUpsert = (snapshot) => {
      if (!snapshot?.key) {
        return;
      }

      caches[source].set(snapshot.key, {
        firebaseKey: snapshot.key,
        ...(snapshot.val() || {}),
      });
      bumpRevision(source);
    };

    const handleRemove = (snapshot) => {
      if (!snapshot?.key) {
        return;
      }

      caches[source].delete(snapshot.key);
      bumpRevision(source);
    };

    unsubscribers[source] = [
      onChildAdded(collectionQuery, handleUpsert, (error) => {
        state.lastError = String(error?.message || error || 'No se pudo escuchar pedidos.');
      }),
      onChildChanged(collectionQuery, handleUpsert, (error) => {
        state.lastError = String(error?.message || error || 'No se pudo escuchar pedidos.');
      }),
      onChildRemoved(collectionQuery, handleRemove, (error) => {
        state.lastError = String(error?.message || error || 'No se pudo escuchar pedidos.');
      }),
    ];
  };

  const ensureDate = async (date) => {
    const cleanDate = String(date || '').trim();
    if (!cleanDate) {
      throw new Error('Falta la fecha para cargar la operacion del dia.');
    }

    if (state.currentDate === cleanDate && state.listening) {
      return;
    }

    state.currentDate = cleanDate;
    state.listening = true;

    await Promise.all([
      subscribeSource('orders', cleanDate),
      subscribeSource('rutaOrders', cleanDate),
    ]);
  };

  const getCollectionPayload = async (source, date) => {
    await ensureDate(date);
    const cleanSource = source === 'rutaOrders' ? 'rutaOrders' : 'orders';
    const items = sortCollectionItems(cleanSource, Array.from(caches[cleanSource].values()));
    const counter =
      cleanSource === 'orders'
        ? Number((await get(ref(database, `orderCounters/${String(date || '').trim()}`))).val() || 0)
        : null;

    return {
      ok: true,
      source: cleanSource,
      date: String(date || '').trim(),
      revision: Number(revisions[cleanSource] || 0),
      count: items.length,
      counter,
      orders: items,
    };
  };

  const getCollectionMeta = async (source, date) => {
    const payload = await getCollectionPayload(source, date);
    return {
      ok: true,
      source: payload.source,
      date: payload.date,
      revision: payload.revision,
      count: payload.count,
      counter: payload.counter,
    };
  };

  const stop = () => {
    state.listening = false;
    clearAllListeners();
  };

  return {
    state,
    ensureDate,
    getCollectionPayload,
    getCollectionMeta,
    stop,
  };
}
