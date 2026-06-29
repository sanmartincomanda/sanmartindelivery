import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { endAt, get, orderByChild, query, ref, startAt, update } from 'firebase/database';
import {
  buildArchivedOrderRecord,
  getArchiveMonthKey,
  getOrderHistoryRetentionStartDate,
  isCanceledOrderStatus,
  isOrderWithinHistoryRetention,
  ORDER_HISTORY_RETENTION_DAYS,
  normalizeCouponCode,
  shouldArchiveRealtimeOrder,
  sortOrdersByDateAndNumberDesc,
  STORE_COUPON_ARCHIVE_USAGE_PATH,
} from '../src/services/orderArchive.js';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const ARCHIVE_ROOT_DIR = 'sync-backups/order-history';
const STATE_FILE_NAME = 'sync-backups/order-archive-state.json';
const ORDER_ARCHIVE_POLL_INTERVAL_MS = 5 * 60 * 1000;
const ARCHIVE_BATCH_SIZE = 250;
const LIVE_ORDER_PATHS = ['orders', 'rutaOrders'];

const normalizeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const loadJsonFile = (filePath, fallbackValue) => {
  if (!existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    const raw = readFileSync(filePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : fallbackValue;
  } catch {
    return fallbackValue;
  }
};

const saveJsonFile = (filePath, payload) => {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
};

const splitIntoBatches = (entries = [], size = ARCHIVE_BATCH_SIZE) => {
  const source = Array.isArray(entries) ? entries : [];
  const chunkSize = Math.max(1, Number(size || ARCHIVE_BATCH_SIZE));
  const batches = [];

  for (let index = 0; index < source.length; index += chunkSize) {
    batches.push(source.slice(index, index + chunkSize));
  }

  return batches;
};

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getArchiveMonthFilePath = (archiveRootDir, monthKey) =>
  resolve(archiveRootDir, `${String(monthKey || '').trim() || 'unknown'}.json`);

const listMonthKeysBetween = (dateFrom, dateTo) => {
  const cleanDateFrom = String(dateFrom || '').trim();
  const cleanDateTo = String(dateTo || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDateTo)) {
    return [];
  }

  const [fromYear, fromMonth] = cleanDateFrom.split('-').map(Number);
  const [toYear, toMonth] = cleanDateTo.split('-').map(Number);
  const current = new Date(fromYear, fromMonth - 1, 1);
  const end = new Date(toYear, toMonth - 1, 1);
  const result = [];

  while (current <= end) {
    result.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }

  return result;
};

export function createOrderArchiveManager({ repoRoot }) {
  const database = getAuthenticatedFirebaseDatabase();
  const archiveRootDir = resolve(repoRoot, ARCHIVE_ROOT_DIR);
  const stateFilePath = resolve(repoRoot, STATE_FILE_NAME);
  const state = {
    listening: false,
    archiving: false,
    pollIntervalMs: ORDER_ARCHIVE_POLL_INTERVAL_MS,
    lastArchiveAt: '',
    lastArchiveCount: 0,
    lastError: '',
    archiveRootDir,
    stateFilePath,
    ...loadJsonFile(stateFilePath, {}),
  };

  let pollTimer = null;
  let archivePromise = null;

  const persistState = () => {
    saveJsonFile(stateFilePath, {
      lastArchiveAt: state.lastArchiveAt || '',
      lastArchiveCount: normalizeNumber(state.lastArchiveCount, 0),
      lastError: state.lastError || '',
    });
  };

  const loadArchiveBucket = (monthKey) => {
    const filePath = getArchiveMonthFilePath(archiveRootDir, monthKey);
    return {
      filePath,
      data: loadJsonFile(filePath, {}),
    };
  };

  const flushRootUpdates = async (rootUpdates) => {
    const entries = Object.entries(rootUpdates || {});
    const batches = splitIntoBatches(entries, ARCHIVE_BATCH_SIZE);
    for (const batch of batches) {
      await update(ref(database), Object.fromEntries(batch));
    }
  };

  const pruneExpiredArchivedOrders = () => {
    if (!existsSync(archiveRootDir)) {
      return {
        removedCount: 0,
        retentionStartDate: getOrderHistoryRetentionStartDate(new Date(), ORDER_HISTORY_RETENTION_DAYS),
      };
    }

    const retentionStartDate = getOrderHistoryRetentionStartDate(new Date(), ORDER_HISTORY_RETENTION_DAYS);
    let removedCount = 0;

    readdirSync(archiveRootDir)
      .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
      .forEach((fileName) => {
        const filePath = resolve(archiveRootDir, fileName);
        const bucket = loadJsonFile(filePath, {});
        const nextBucket = {};
        let changed = false;

        Object.entries(bucket || {}).forEach(([orderKey, order]) => {
          if (isOrderWithinHistoryRetention(order, retentionStartDate)) {
            nextBucket[orderKey] = order;
            return;
          }

          changed = true;
          removedCount += 1;
        });

        if (changed) {
          saveJsonFile(filePath, nextBucket);
        }
      });

    return {
      removedCount,
      retentionStartDate,
    };
  };

  const archiveOrdersOnce = async () => {
    if (archivePromise) {
      return archivePromise;
    }

    archivePromise = (async () => {
      await ensureAuthenticatedFirebaseSession();

      state.archiving = true;
      state.lastError = '';

      try {
        const todayKey = formatDate(new Date());
        const pruneResult = pruneExpiredArchivedOrders();
        const [ordersSnapshot, routeOrdersSnapshot, archiveUsageSnapshot] = await Promise.all([
          get(query(ref(database, 'orders'), orderByChild('fecha'), endAt(todayKey))),
          get(query(ref(database, 'rutaOrders'), orderByChild('fecha'), endAt(todayKey))),
          get(ref(database, STORE_COUPON_ARCHIVE_USAGE_PATH)),
        ]);

        const monthBuckets = new Map();
        const rootUpdates = {};
        const usageMap = archiveUsageSnapshot.val() || {};
        let archivedCount = 0;

        for (const sourcePath of LIVE_ORDER_PATHS) {
          const sourceData =
            sourcePath === 'orders'
              ? ordersSnapshot.val() || {}
              : routeOrdersSnapshot.val() || {};

          Object.entries(sourceData).forEach(([orderKey, order]) => {
            if (!shouldArchiveRealtimeOrder(order, todayKey)) {
              return;
            }

            const monthKey = getArchiveMonthKey(order?.fecha);
            if (!monthKey) {
              return;
            }

            if (!monthBuckets.has(monthKey)) {
              monthBuckets.set(monthKey, loadArchiveBucket(monthKey));
            }

            const bucket = monthBuckets.get(monthKey);
            if (bucket.data[orderKey]) {
              rootUpdates[`${sourcePath}/${orderKey}`] = null;
              return;
            }

            bucket.data[orderKey] = buildArchivedOrderRecord(orderKey, order, sourcePath);
            rootUpdates[`${sourcePath}/${orderKey}`] = null;
            archivedCount += 1;

            const storeUserKey = String(order?.storeUserKey || '').trim();
            const couponCode = normalizeCouponCode(order?.cupon?.code);
            if (!storeUserKey || !couponCode || isCanceledOrderStatus(order?.estado)) {
              return;
            }

            const currentUserUsage = usageMap[storeUserKey] && typeof usageMap[storeUserKey] === 'object'
              ? { ...usageMap[storeUserKey] }
              : {};
            const nextCount = normalizeNumber(currentUserUsage[couponCode], 0) + 1;
            currentUserUsage[couponCode] = nextCount;
            usageMap[storeUserKey] = currentUserUsage;
            rootUpdates[`${STORE_COUPON_ARCHIVE_USAGE_PATH}/${storeUserKey}/${couponCode}`] = nextCount;
          });
        }

        if (archivedCount === 0) {
          state.lastArchiveAt = new Date().toISOString();
          state.lastArchiveCount = 0;
          persistState();
          return {
            ok: true,
            archivedCount: 0,
            prunedCount: pruneResult.removedCount,
          };
        }

        monthBuckets.forEach((bucket) => {
          saveJsonFile(bucket.filePath, bucket.data);
        });

        await flushRootUpdates(rootUpdates);

        state.lastArchiveAt = new Date().toISOString();
        state.lastArchiveCount = archivedCount;
        persistState();

        return {
          ok: true,
          archivedCount,
          prunedCount: pruneResult.removedCount,
        };
      } catch (error) {
        state.lastError = String(error?.message || error || 'No se pudo archivar el historial.');
        persistState();
        throw error;
      } finally {
        state.archiving = false;
        archivePromise = null;
      }
    })();

    return archivePromise;
  };

  const fetchArchivedOrdersByDateRange = async (dateFrom, dateTo) => {
    const cleanDateFrom = String(dateFrom || '').trim();
    const cleanDateTo = String(dateTo || '').trim();
    const retentionStartDate = getOrderHistoryRetentionStartDate(new Date(), ORDER_HISTORY_RETENTION_DAYS);
    const months = listMonthKeysBetween(cleanDateFrom, cleanDateTo);
    const archivedOrders = [];

    months.forEach((monthKey) => {
      const filePath = getArchiveMonthFilePath(archiveRootDir, monthKey);
      const bucket = loadJsonFile(filePath, {});
      Object.values(bucket).forEach((order) => {
        const fecha = String(order?.fecha || '').trim();
        if (!fecha) {
          return;
        }
        if (!isOrderWithinHistoryRetention(order, retentionStartDate)) {
          return;
        }
        if (cleanDateFrom && fecha < cleanDateFrom) {
          return;
        }
        if (cleanDateTo && fecha > cleanDateTo) {
          return;
        }
        archivedOrders.push(order);
      });
    });

    return sortOrdersByDateAndNumberDesc(archivedOrders);
  };

  const fetchLiveOrdersByDateRange = async (dateFrom, dateTo) => {
    await ensureAuthenticatedFirebaseSession();

    const cleanDateFrom = String(dateFrom || '').trim();
    const cleanDateTo = String(dateTo || '').trim();
    if (!cleanDateFrom || !cleanDateTo) {
      return [];
    }

    const snapshot = await get(
      query(
        ref(database, 'orders'),
        orderByChild('fecha'),
        startAt(cleanDateFrom),
        endAt(cleanDateTo)
      )
    );

    return sortOrdersByDateAndNumberDesc(
      Object.entries(snapshot.val() || {}).map(([firebaseKey, value]) => ({
        firebaseKey,
        ...value,
      }))
    );
  };

  const fetchHistoryByDateRange = async (dateFrom, dateTo) => {
    const [archivedOrders, liveOrders] = await Promise.all([
      fetchArchivedOrdersByDateRange(dateFrom, dateTo),
      fetchLiveOrdersByDateRange(dateFrom, dateTo),
    ]);

    const merged = new Map();
    [...archivedOrders, ...liveOrders].forEach((order) => {
      const key = String(order?.firebaseKey || '').trim();
      if (!key) {
        return;
      }
      merged.set(key, order);
    });

    return sortOrdersByDateAndNumberDesc(Array.from(merged.values()));
  };

  const scheduleNextPoll = (delayMs = ORDER_ARCHIVE_POLL_INTERVAL_MS) => {
    if (!state.listening) {
      return;
    }

    if (pollTimer) {
      clearTimeout(pollTimer);
    }

    pollTimer = setTimeout(() => {
      archiveOrdersOnce()
        .catch(() => {})
        .finally(() => {
          scheduleNextPoll(ORDER_ARCHIVE_POLL_INTERVAL_MS);
        });
    }, Math.max(5000, normalizeNumber(delayMs, ORDER_ARCHIVE_POLL_INTERVAL_MS)));
  };

  const initAutoArchive = () => {
    if (state.listening) {
      return;
    }

    state.listening = true;
    archiveOrdersOnce()
      .catch(() => {})
      .finally(() => {
        scheduleNextPoll(5000);
      });
  };

  const stopAutoArchive = () => {
    state.listening = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  return {
    state,
    initAutoArchive,
    stopAutoArchive,
    archiveOrdersOnce,
    fetchArchivedOrdersByDateRange,
    fetchLiveOrdersByDateRange,
    fetchHistoryByDateRange,
  };
}
