import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { endAt, get, orderByChild, query, ref, startAt } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

export const CRM_PROJECT_ID = 'crm-sanmartin-granada';
export const CRM_STORAGE_BUCKET = 'crm-sanmartin-granada.firebasestorage.app';
export const CRM_DASHBOARD_STORAGE_PATH = 'crm/dashboard.json';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(scriptPath, '..', '..');
const cwd = process.cwd();
const localConfigCandidates = [
  resolve(repoRoot, 'sicar.local.json'),
  resolve(cwd, 'sicar.local.json'),
];
const localConfigPath = localConfigCandidates.find((candidate) => existsSync(candidate)) || '';
const localConfig = localConfigPath ? JSON.parse(readFileSync(localConfigPath, 'utf8')) : {};

const sicarConfig = {
  host: process.env.SICAR_MYSQL_HOST || localConfig.host || '127.0.0.1',
  port: Number(process.env.SICAR_MYSQL_PORT || localConfig.port || 3307),
  database: process.env.SICAR_MYSQL_DATABASE || localConfig.database || 'sicar',
  user: process.env.SICAR_MYSQL_USER || localConfig.user || 'root',
  password: process.env.SICAR_MYSQL_PASSWORD || localConfig.password || '',
  mysqlExePath:
    process.env.SICAR_MYSQL_EXE_PATH ||
    localConfig.mysqlExePath ||
    'C:\\Program Files (x86)\\SICAR-S-131AB\\MySQL\\MySQL Server 5.6\\bin\\mysql.exe',
};

const STORE_ORDERS_PATH = 'orders';
const ORDER_ARCHIVE_ROOT_DIR = resolve(repoRoot, 'sync-backups', 'order-history');
const LOCAL_BACKUP_PATH = resolve(repoRoot, 'sync-backups', 'crm', 'dashboard.json');
const EMBEDDED_PUBLIC_SNAPSHOT_PATH = resolve(repoRoot, 'public', 'crm', 'dashboard.json');
const STORE_CHANNEL = 'tienda_virtual';
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
const CUSTOMER_LOOKBACK_DAYS = 365;
const CUSTOMER_LIST_LIMIT = 12;

const cache = {
  payload: null,
  generatedAt: 0,
  pending: null,
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantity = (value) => Number(Number(value || 0).toFixed(3));
const roundPercent = (value) => Number(Number(value || 0).toFixed(1));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const normalizeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeStoreOrderStatus = (status = '') => {
  const normalized = normalizeText(status);
  if (normalized.includes('entregado')) {
    return 'entregado';
  }
  if (normalized.includes('cancel') || normalized.includes('anulad')) {
    return 'cancelado';
  }
  if (normalized.includes('enviado')) {
    return 'enviado';
  }
  if (normalized.includes('prepar')) {
    return 'preparacion';
  }
  return 'pendiente';
};

const normalizePaymentLabel = (value = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) {
    return 'Sin metodo';
  }
  return normalized;
};

const isPublicoGeneralName = (value = '') => {
  const normalized = normalizeText(value);
  return normalized === 'publico en general' || normalized === 'publico general';
};

const formatDateKey = (date = new Date()) => {
  const safeDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}-${String(
    safeDate.getDate()
  ).padStart(2, '0')}`;
};

const formatDateTime = (date = new Date()) => {
  const safeDate = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  return `${formatDateKey(safeDate)} ${String(safeDate.getHours()).padStart(2, '0')}:${String(
    safeDate.getMinutes()
  ).padStart(2, '0')}:${String(safeDate.getSeconds()).padStart(2, '0')}`;
};

const getDayDistance = (dateFrom, dateTo) => {
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
};

const calculatePercentChange = (currentValue, previousValue) => {
  const current = Number(currentValue || 0);
  const previous = Number(previousValue || 0);

  if (previous <= 0) {
    return current > 0 ? 100 : 0;
  }

  return roundPercent(((current - previous) / previous) * 100);
};

const getQuantile = (values = [], quantile = 0.5) => {
  const cleaned = (Array.isArray(values) ? values : [])
    .map((value) => Number(value || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (!cleaned.length) {
    return 0;
  }

  if (cleaned.length === 1) {
    return cleaned[0];
  }

  const position = clamp(Number(quantile || 0), 0, 1) * (cleaned.length - 1);
  const baseIndex = Math.floor(position);
  const rest = position - baseIndex;
  const current = cleaned[baseIndex];
  const next = cleaned[Math.min(cleaned.length - 1, baseIndex + 1)];
  return current + (next - current) * rest;
};

const formatShortDate = (dateKey = '') => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(dateKey || '-');
  }

  return date.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
  });
};

const getDaysBetween = (dateFrom, dateTo) => {
  const start = new Date(`${dateFrom}T00:00:00`);
  const end = new Date(`${dateTo}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return 0;
  }
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

const addDays = (date, amount) => {
  const nextDate = new Date(date.getTime());
  nextDate.setDate(nextDate.getDate() + Number(amount || 0));
  return nextDate;
};

const buildPreviousPeriod = (period) => {
  const dayCount = Math.max(1, getDaysBetween(period?.dateFrom, period?.dateTo));
  const currentStart = new Date(`${String(period?.dateFrom || '').trim()}T12:00:00`);
  if (Number.isNaN(currentStart.getTime())) {
    return {
      key: `${String(period?.key || 'period')}-previous`,
      dateFrom: '',
      dateTo: '',
      dayCount,
    };
  }

  const previousEnd = addDays(currentStart, -1);
  const previousStart = addDays(previousEnd, -(dayCount - 1));

  return {
    key: `${String(period?.key || 'period')}-previous`,
    dateFrom: formatDateKey(previousStart),
    dateTo: formatDateKey(previousEnd),
    dayCount,
  };
};

const buildPeriodDefinitions = (now = new Date()) => {
  const today = new Date(now.getTime());
  today.setHours(12, 0, 0, 0);
  const todayKey = formatDateKey(today);
  const weekStart = addDays(today, -6);
  const monthStart = addDays(today, -29);
  const quarterStart = addDays(today, -89);
  const monthToDateStart = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0, 0);

  return [
    { key: 'today', dateFrom: todayKey, dateTo: todayKey },
    { key: 'week', dateFrom: formatDateKey(weekStart), dateTo: todayKey },
    { key: 'month', dateFrom: formatDateKey(monthStart), dateTo: todayKey },
    { key: 'mtd', dateFrom: formatDateKey(monthToDateStart), dateTo: todayKey },
    { key: 'quarter', dateFrom: formatDateKey(quarterStart), dateTo: todayKey },
  ];
};

const listMonthKeysBetween = (dateFrom, dateTo) => {
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return [];
  }

  const current = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  const last = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);
  const keys = [];

  while (current <= last) {
    keys.push(`${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }

  return keys;
};

const createDailySeed = (dateFrom, dateTo, factory) => {
  const rows = [];
  const start = new Date(`${dateFrom}T12:00:00`);
  const end = new Date(`${dateTo}T12:00:00`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return rows;
  }

  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    const date = formatDateKey(cursor);
    rows.push(factory(date));
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
};

const ensureDirectoryForFile = (filePath) => mkdirSync(dirname(filePath), { recursive: true });

const saveLocalBackup = (payload) => {
  ensureDirectoryForFile(LOCAL_BACKUP_PATH);
  writeFileSync(LOCAL_BACKUP_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return LOCAL_BACKUP_PATH;
};

const saveEmbeddedPublicSnapshot = (payload) => {
  ensureDirectoryForFile(EMBEDDED_PUBLIC_SNAPSHOT_PATH);
  writeFileSync(EMBEDDED_PUBLIC_SNAPSHOT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  return EMBEDDED_PUBLIC_SNAPSHOT_PATH;
};

const runMysqlQuery = (queryText) =>
  new Promise((resolvePromise, rejectPromise) => {
    if (!existsSync(sicarConfig.mysqlExePath)) {
      rejectPromise(new Error(`No se encontro mysql.exe en ${sicarConfig.mysqlExePath}`));
      return;
    }

    const args = [
      '-B',
      '-N',
      '--default-character-set=latin1',
      '-h',
      sicarConfig.host,
      '-P',
      String(sicarConfig.port),
      '-u',
      sicarConfig.user,
      `-p${sicarConfig.password}`,
      '-D',
      sicarConfig.database,
      '-e',
      queryText,
    ];

    const child = spawn(sicarConfig.mysqlExePath, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('latin1');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('latin1');
    });

    child.on('error', (error) => rejectPromise(error));

    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(stderr || `mysql.exe finalizo con codigo ${code}`));
        return;
      }

      resolvePromise(
        stdout
          .split(/\r?\n/)
          .filter((line) => line.trim() && !line.startsWith('Warning:'))
          .map((line) => line.split('\t'))
      );
    });
  });

const readArchiveOrders = (dateFrom, dateTo) => {
  if (!existsSync(ORDER_ARCHIVE_ROOT_DIR)) {
    return [];
  }

  const rows = [];
  const monthKeys = new Set(listMonthKeysBetween(dateFrom, dateTo));

  readdirSync(ORDER_ARCHIVE_ROOT_DIR)
    .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
    .forEach((fileName) => {
      const monthKey = fileName.replace(/\.json$/i, '');
      if (!monthKeys.has(monthKey)) {
        return;
      }

      try {
        const filePath = resolve(ORDER_ARCHIVE_ROOT_DIR, fileName);
        const bucket = JSON.parse(readFileSync(filePath, 'utf8'));
        Object.values(bucket || {}).forEach((order) => {
          if (!order || typeof order !== 'object') {
            return;
          }

          const orderDate = String(order.fecha || '').trim();
          if (!orderDate || orderDate < dateFrom || orderDate > dateTo) {
            return;
          }

          rows.push(order);
        });
      } catch {
        // ignore malformed archive bucket
      }
    });

  return rows;
};

const readLiveStoreOrders = async (dateFrom, dateTo) => {
  await ensureAuthenticatedFirebaseSession();
  const database = getAuthenticatedFirebaseDatabase();
  const snapshot = await get(
    query(ref(database, STORE_ORDERS_PATH), orderByChild('fecha'), startAt(dateFrom), endAt(dateTo))
  );

  return Object.entries(snapshot.val() || {}).map(([firebaseKey, value]) => ({
    firebaseKey,
    ...(value || {}),
  }));
};

const loadStoreOrders = async (dateFrom, dateTo) => {
  const [archivedOrders, liveOrders] = await Promise.all([
    Promise.resolve(readArchiveOrders(dateFrom, dateTo)),
    readLiveStoreOrders(dateFrom, dateTo),
  ]);

  const dedupedOrders = new Map();
  [...archivedOrders, ...liveOrders].forEach((order) => {
    const firebaseKey = String(order?.firebaseKey || '').trim() || `${order?.fecha || ''}-${order?.id || ''}`;
    if (!firebaseKey) {
      return;
    }

    dedupedOrders.set(firebaseKey, {
      ...order,
      firebaseKey,
    });
  });

  return Array.from(dedupedOrders.values());
};

const resolveStoreFinalAmount = (order = {}) => {
  const sicarTotal = roundMoney(order?.sicarQuote?.total || 0);
  if (order?.totalAproximado === false && sicarTotal > 0) {
    return sicarTotal;
  }

  return roundMoney(order?.total || order?.subtotalEstimado || 0);
};

const normalizeStoreOrderItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      code: String(item?.codigo ?? item?.code ?? '').trim(),
      name: String(item?.nombre ?? item?.name ?? '').trim(),
      quantity: roundQuantity(item?.cantidad ?? item?.quantity ?? 0),
      revenue: roundMoney(item?.subtotal ?? Number(item?.price || 0) * Number(item?.quantity || 0)),
    }))
    .filter((item) => item.code && item.quantity > 0);

const normalizeStoreOrdersForAnalytics = (orders = []) =>
  (Array.isArray(orders) ? orders : [])
    .filter((order) => String(order?.canal || '').trim() === STORE_CHANNEL)
    .map((order) => {
      const status = normalizeStoreOrderStatus(order?.estado || '');
      const finalAmount = resolveStoreFinalAmount(order);
      const pickup = String(order?.fulfillmentType || order?.deliveryMode || '').trim().toLowerCase() === 'pickup';
      const customerName = String(order?.cliente || '').trim() || 'Cliente sin nombre';
      const customerCode = String(order?.clienteCodigo || '').trim();
      const customerPhone = String(order?.telefono || '').trim();
      const customerKey =
        String(order?.storeUserKey || '').trim() ||
        String(order?.clienteFirebaseKey || '').trim() ||
        customerCode ||
        customerPhone ||
        normalizeText(customerName) ||
        String(order?.firebaseKey || '').trim();

      return {
        orderKey: String(order?.firebaseKey || '').trim(),
        orderNumber: Number(order?.id || 0),
        date: String(order?.fecha || '').trim(),
        dateTime: order?.timestampIngresoMs
          ? new Date(Number(order.timestampIngresoMs)).toISOString()
          : `${String(order?.fecha || '').trim()}T12:00:00`,
        customerKey,
        customerCode,
        customerPhone,
        customerName,
        paymentMethod: normalizePaymentLabel(order?.metodoPago),
        status,
        finalAmount,
        pickup,
        rewardUsed: Boolean(order?.rewardRedemption?.rewardId),
        rewardId: String(order?.rewardRedemption?.rewardId || '').trim(),
        couponUsed: Boolean(String(order?.cupon?.code || '').trim()),
        couponCode: String(order?.cupon?.code || '').trim(),
        items: normalizeStoreOrderItems(order?.items),
      };
    });

const aggregateStorePeriod = (orders = [], period) => {
  const dateFrom = String(period?.dateFrom || '').trim();
  const dateTo = String(period?.dateTo || '').trim();
  const scopedOrders = orders.filter((order) => order.date >= dateFrom && order.date <= dateTo);

  const summary = {
    revenue: 0,
    projectedRevenue: 0,
    orderCount: 0,
    deliveredCount: 0,
    pendingCount: 0,
    canceledCount: 0,
    pickupCount: 0,
    deliveryCount: 0,
    uniqueCustomers: 0,
    rewardOrders: 0,
    couponOrders: 0,
    averageTicket: 0,
  };

  const dailyMap = new Map(
    createDailySeed(dateFrom, dateTo, (date) => ({
      date,
      label: formatShortDate(date),
      orderCount: 0,
      deliveredCount: 0,
      canceledCount: 0,
      revenue: 0,
      projectedRevenue: 0,
    })).map((row) => [row.date, row])
  );
  const paymentMap = new Map();
  const productMap = new Map();
  const customerMap = new Map();
  const uniqueCustomers = new Set();

  scopedOrders.forEach((order) => {
    const dailyEntry = dailyMap.get(order.date);
    const activeOrder = order.status !== 'cancelado';

    if (order.status === 'cancelado') {
      summary.canceledCount += 1;
      if (dailyEntry) {
        dailyEntry.canceledCount += 1;
      }
      return;
    }

    summary.orderCount += 1;
    summary.projectedRevenue = roundMoney(summary.projectedRevenue + order.finalAmount);
    uniqueCustomers.add(order.customerKey);

    if (order.rewardUsed) {
      summary.rewardOrders += 1;
    }

    if (order.couponUsed) {
      summary.couponOrders += 1;
    }

    if (order.pickup) {
      summary.pickupCount += 1;
    } else {
      summary.deliveryCount += 1;
    }

    if (dailyEntry) {
      dailyEntry.orderCount += 1;
      dailyEntry.projectedRevenue = roundMoney(dailyEntry.projectedRevenue + order.finalAmount);
    }

    const paymentKey = order.paymentMethod || 'Sin metodo';
    const currentPayment = paymentMap.get(paymentKey) || { name: paymentKey, total: 0, count: 0 };
    paymentMap.set(paymentKey, {
      ...currentPayment,
      total: roundMoney(currentPayment.total + order.finalAmount),
      count: currentPayment.count + 1,
    });

    if (order.status === 'entregado') {
      summary.deliveredCount += 1;
      summary.revenue = roundMoney(summary.revenue + order.finalAmount);

      if (dailyEntry) {
        dailyEntry.deliveredCount += 1;
        dailyEntry.revenue = roundMoney(dailyEntry.revenue + order.finalAmount);
      }

      const customerKey = order.customerKey || order.customerName;
      const currentCustomer = customerMap.get(customerKey) || {
        key: customerKey,
        code: '',
        name: order.customerName,
        revenue: 0,
        ordersCount: 0,
      };
      customerMap.set(customerKey, {
        ...currentCustomer,
        revenue: roundMoney(currentCustomer.revenue + order.finalAmount),
        ordersCount: currentCustomer.ordersCount + 1,
      });

      order.items.forEach((item) => {
        const itemKey = item.code || item.name;
        const currentProduct = productMap.get(itemKey) || {
          code: item.code,
          name: item.name,
          quantity: 0,
          revenue: 0,
          ordersCount: 0,
        };

        productMap.set(itemKey, {
          ...currentProduct,
          quantity: roundQuantity(currentProduct.quantity + item.quantity),
          revenue: roundMoney(currentProduct.revenue + item.revenue),
          ordersCount: currentProduct.ordersCount + 1,
        });
      });
    } else {
      summary.pendingCount += 1;
    }

    if (!activeOrder) {
      summary.pendingCount = Math.max(summary.pendingCount - 1, 0);
    }
  });

  summary.uniqueCustomers = uniqueCustomers.size;
  summary.averageTicket = summary.deliveredCount > 0 ? roundMoney(summary.revenue / summary.deliveredCount) : 0;

  const sortByRevenue = (left, right) =>
    Number(right?.revenue || 0) - Number(left?.revenue || 0) ||
    Number(right?.ordersCount || right?.salesCount || 0) - Number(left?.ordersCount || left?.salesCount || 0) ||
    String(left?.name || '').localeCompare(String(right?.name || ''));

  const recentOrders = scopedOrders
    .filter((order) => order.status !== 'cancelado')
    .sort((left, right) => String(right.dateTime || '').localeCompare(String(left.dateTime || '')))
    .slice(0, 8)
    .map((order) => ({
      orderKey: order.orderKey,
      orderNumber: order.orderNumber,
      dateTime: order.dateTime,
      customer: order.customerName,
      payment: order.paymentMethod,
      total: order.finalAmount,
      status: order.status === 'entregado' ? 'Entregado' : order.status === 'enviado' ? 'Enviado' : 'Pendiente',
    }));

  return {
    summary,
    daily: Array.from(dailyMap.values()),
    paymentMethods: Array.from(paymentMap.values()).sort((left, right) => Number(right.total || 0) - Number(left.total || 0)),
    topProducts: Array.from(productMap.values()).sort(sortByRevenue).slice(0, 10),
    topCustomers: Array.from(customerMap.values()).sort(sortByRevenue).slice(0, 10),
    recentOrders,
  };
};

const buildCustomerInsights = (transactions = [], period, options = {}) => {
  const channel = String(options.channel || '').trim() || 'general';
  const dateFrom = String(period?.dateFrom || '').trim();
  const dateTo = String(period?.dateTo || '').trim();
  const dayCount = Math.max(1, getDaysBetween(dateFrom, dateTo));
  const previousPeriod = buildPreviousPeriod(period);
  const previousDateFrom = String(previousPeriod.dateFrom || '').trim();
  const previousDateTo = String(previousPeriod.dateTo || '').trim();
  const normalizedTransactions = (Array.isArray(transactions) ? transactions : [])
    .map((transaction) => ({
      customerKey: String(transaction?.customerKey || '').trim(),
      customerCode: String(transaction?.customerCode || '').trim(),
      customerName: String(transaction?.customerName || '').trim() || 'Cliente sin nombre',
      date: String(transaction?.date || '').trim(),
      dateTime: String(transaction?.dateTime || '').trim() || `${String(transaction?.date || '').trim()}T12:00:00`,
      total: roundMoney(transaction?.total || 0),
      paymentMethod: normalizePaymentLabel(transaction?.paymentMethod),
      rewardUsed: Boolean(transaction?.rewardUsed),
      couponUsed: Boolean(transaction?.couponUsed),
    }))
    .filter((transaction) => transaction.customerKey && transaction.date);

  const customerMap = new Map();
  normalizedTransactions.forEach((transaction) => {
    const currentCustomer = customerMap.get(transaction.customerKey) || {
      key: transaction.customerKey,
      code: transaction.customerCode,
      name: transaction.customerName,
      transactions: [],
    };

    currentCustomer.code = currentCustomer.code || transaction.customerCode;
    currentCustomer.name = currentCustomer.name || transaction.customerName;
    currentCustomer.transactions.push(transaction);
    customerMap.set(transaction.customerKey, currentCustomer);
  });

  const draftProfiles = Array.from(customerMap.values()).map((customer) => {
    const rows = customer.transactions
      .slice()
      .sort(
        (left, right) =>
          String(left.dateTime || left.date).localeCompare(String(right.dateTime || right.date)) ||
          String(left.date || '').localeCompare(String(right.date || ''))
      );

    const currentTransactions = rows.filter((row) => row.date >= dateFrom && row.date <= dateTo);
    const previousTransactions = rows.filter((row) => row.date >= previousDateFrom && row.date <= previousDateTo);
    const beforeCurrentTransactions = rows.filter((row) => row.date < dateFrom);
    const beforePreviousTransactions = rows.filter((row) => row.date < previousDateFrom);
    const currentRevenue = roundMoney(currentTransactions.reduce((total, row) => total + Number(row.total || 0), 0));
    const previousRevenue = roundMoney(previousTransactions.reduce((total, row) => total + Number(row.total || 0), 0));
    const lifetimeRevenue = roundMoney(rows.reduce((total, row) => total + Number(row.total || 0), 0));
    const paymentCounts = new Map();

    rows.forEach((row) => {
      const paymentKey = row.paymentMethod || 'Sin metodo';
      paymentCounts.set(paymentKey, Number(paymentCounts.get(paymentKey) || 0) + 1);
    });

    const preferredPayment = Array.from(paymentCounts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] || 'Sin metodo';
    const gapDays = [];
    for (let index = 1; index < rows.length; index += 1) {
      gapDays.push(getDayDistance(rows[index - 1].date, rows[index].date));
    }

    return {
      key: customer.key,
      code: customer.code,
      name: customer.name,
      channel,
      currentRevenue,
      previousRevenue,
      lifetimeRevenue,
      currentOrders: currentTransactions.length,
      previousOrders: previousTransactions.length,
      lifetimeOrders: rows.length,
      currentTicket: currentTransactions.length > 0 ? roundMoney(currentRevenue / currentTransactions.length) : 0,
      previousTicket: previousTransactions.length > 0 ? roundMoney(previousRevenue / previousTransactions.length) : 0,
      rewardOrders: currentTransactions.filter((row) => row.rewardUsed).length,
      couponOrders: currentTransactions.filter((row) => row.couponUsed).length,
      firstPurchaseDate: rows[0]?.date || '',
      lastPurchaseDate: rows[rows.length - 1]?.date || '',
      lastPurchaseDateTime: rows[rows.length - 1]?.dateTime || '',
      daysSinceLastPurchase: rows.length ? getDayDistance(rows[rows.length - 1].date, dateTo) : 0,
      averageGapDays:
        gapDays.length > 0 ? roundMoney(gapDays.reduce((total, value) => total + value, 0) / gapDays.length) : 0,
      beforeCurrentTransactionsCount: beforeCurrentTransactions.length,
      beforePreviousTransactionsCount: beforePreviousTransactions.length,
      preferredPayment,
    };
  });

  const activeRevenueValues = draftProfiles.filter((profile) => profile.currentRevenue > 0).map((profile) => profile.currentRevenue);
  const lifetimeRevenueValues = draftProfiles.map((profile) => profile.lifetimeRevenue);
  const vipRevenueThreshold = getQuantile(activeRevenueValues.length ? activeRevenueValues : lifetimeRevenueValues, 0.75);
  const strategicRevenueThreshold = getQuantile(lifetimeRevenueValues, 0.8);
  const defaultAtRiskDays = Math.max(14, Math.round(dayCount * 0.8));

  const profiles = draftProfiles.map((profile) => {
    const repeatCustomer = profile.lifetimeOrders > 1;
    const isActive = profile.currentOrders > 0;
    const hadPreviousActivity = profile.previousOrders > 0;
    const isNew = isActive && profile.beforeCurrentTransactionsCount === 0;
    const isReactivated = isActive && !hadPreviousActivity && profile.beforePreviousTransactionsCount > 0;
    const isLost = !isActive && hadPreviousActivity;
    const expectedGap = Math.max(defaultAtRiskDays, Math.round(Number(profile.averageGapDays || 0) * 1.35));
    const isAtRisk =
      !isActive &&
      !isLost &&
      repeatCustomer &&
      profile.daysSinceLastPurchase >= expectedGap &&
      profile.lifetimeRevenue >= strategicRevenueThreshold;
    const revenueDelta = roundMoney(profile.currentRevenue - profile.previousRevenue);
    const ordersDelta = profile.currentOrders - profile.previousOrders;
    const revenueChangePct = calculatePercentChange(profile.currentRevenue, profile.previousRevenue);
    const ordersChangePct = calculatePercentChange(profile.currentOrders, profile.previousOrders);
    const isDeclining = isActive && profile.previousRevenue > 0 && profile.currentRevenue <= profile.previousRevenue * 0.8;
    const isGrowing = isActive && profile.previousRevenue > 0 && profile.currentRevenue >= profile.previousRevenue * 1.2;
    const isVip =
      isActive &&
      repeatCustomer &&
      (profile.currentRevenue >= vipRevenueThreshold || profile.lifetimeRevenue >= strategicRevenueThreshold);

    let status = 'Dormido';
    let tone = 'slate';
    if (isLost) {
      status = 'Perdido';
      tone = 'red';
    } else if (isAtRisk) {
      status = 'En riesgo';
      tone = 'amber';
    } else if (isDeclining) {
      status = 'En caida';
      tone = 'orange';
    } else if (isReactivated) {
      status = 'Reactivado';
      tone = 'teal';
    } else if (isNew) {
      status = 'Nuevo';
      tone = 'blue';
    } else if (isVip) {
      status = 'VIP';
      tone = 'indigo';
    } else if (isActive && repeatCustomer) {
      status = 'Frecuente';
      tone = 'green';
    } else if (isActive) {
      status = 'Activo';
      tone = 'sky';
    }

    return {
      ...profile,
      repeatCustomer,
      isActive,
      hadPreviousActivity,
      isNew,
      isReactivated,
      isLost,
      isAtRisk,
      isDeclining,
      isGrowing,
      isVip,
      isPublicoGeneral: isPublicoGeneralName(profile.name),
      revenueDelta,
      revenueChangePct,
      ordersDelta,
      ordersChangePct,
      status,
      tone,
      summaryNote:
        isLost
          ? 'Compraba en la ventana anterior y en esta no aparece.'
          : isAtRisk
            ? 'Cliente valioso con inactividad superior a su ritmo habitual.'
            : isDeclining
              ? 'Sigue activo, pero compro menos que en la ventana anterior.'
              : isReactivated
                ? 'Regreso despues de estar ausente en la ventana anterior.'
                : isNew
                  ? 'Primera compra dentro del historial analizado.'
                  : isVip
                    ? 'Cliente de alto valor activo en esta ventana.'
                    : isActive
                      ? 'Cliente activo dentro de la ventana actual.'
                      : 'Sin actividad en la ventana actual.',
    };
  });

  const currentRevenueTotal = roundMoney(profiles.reduce((total, profile) => total + Number(profile.currentRevenue || 0), 0));
  const profilesWithShare = profiles.map((profile) => ({
    ...profile,
    currentRevenueSharePct: currentRevenueTotal > 0 ? roundPercent((profile.currentRevenue / currentRevenueTotal) * 100) : 0,
  }));

  const activeCustomers = profilesWithShare.filter((profile) => profile.isActive);
  const previousActiveCustomers = profilesWithShare.filter((profile) => profile.hadPreviousActivity);
  const retainedCustomers = profilesWithShare.filter((profile) => profile.isActive && profile.hadPreviousActivity);
  const lostCustomers = profilesWithShare.filter((profile) => profile.isLost);
  const atRiskCustomers = profilesWithShare.filter((profile) => profile.isAtRisk);
  const decliningCustomers = profilesWithShare.filter((profile) => profile.isDeclining);
  const growingCustomers = profilesWithShare.filter((profile) => profile.isGrowing);
  const reactivatedCustomers = profilesWithShare.filter((profile) => profile.isReactivated);
  const newCustomers = profilesWithShare.filter((profile) => profile.isNew);
  const vipCustomers = profilesWithShare.filter((profile) => profile.isVip);
  const publicoGeneralCustomers = profilesWithShare.filter((profile) => profile.isPublicoGeneral);

  const byRevenue = (left, right) =>
    Number(right.currentRevenue || right.previousRevenue || right.lifetimeRevenue || 0) -
      Number(left.currentRevenue || left.previousRevenue || left.lifetimeRevenue || 0) ||
    Number(right.lifetimeOrders || 0) - Number(left.lifetimeOrders || 0) ||
    String(left.name || '').localeCompare(String(right.name || ''));

  const revenueSortedActive = activeCustomers.slice().sort((left, right) => Number(right.currentRevenue || 0) - Number(left.currentRevenue || 0));
  const top5Revenue = roundMoney(revenueSortedActive.slice(0, 5).reduce((total, profile) => total + Number(profile.currentRevenue || 0), 0));
  const top10Revenue = roundMoney(revenueSortedActive.slice(0, 10).reduce((total, profile) => total + Number(profile.currentRevenue || 0), 0));
  const repeatActiveCustomers = activeCustomers.filter((profile) => profile.repeatCustomer);
  const averageGapProfiles = profilesWithShare.filter((profile) => Number(profile.averageGapDays || 0) > 0);
  const recencyProfiles = activeCustomers.filter((profile) => Number(profile.daysSinceLastPurchase || 0) >= 0);

  const directory = profilesWithShare
    .slice()
    .sort((left, right) => {
      const leftPriority =
        (left.isLost ? 6 : 0) +
        (left.isAtRisk ? 5 : 0) +
        (left.isDeclining ? 4 : 0) +
        (left.isVip ? 3 : 0) +
        (left.isReactivated ? 2 : 0) +
        (left.isNew ? 1 : 0);
      const rightPriority =
        (right.isLost ? 6 : 0) +
        (right.isAtRisk ? 5 : 0) +
        (right.isDeclining ? 4 : 0) +
        (right.isVip ? 3 : 0) +
        (right.isReactivated ? 2 : 0) +
        (right.isNew ? 1 : 0);

      return (
        rightPriority - leftPriority ||
        Number(right.currentRevenue || right.previousRevenue || right.lifetimeRevenue || 0) -
          Number(left.currentRevenue || left.previousRevenue || left.lifetimeRevenue || 0) ||
        Number(right.lifetimeOrders || 0) - Number(left.lifetimeOrders || 0) ||
        String(left.name || '').localeCompare(String(right.name || ''))
      );
    });

  return {
    channel,
    currentPeriod: {
      dateFrom,
      dateTo,
      dayCount,
    },
    previousPeriod,
    summary: {
      activeCustomers: activeCustomers.length,
      previousActiveCustomers: previousActiveCustomers.length,
      retainedCustomers: retainedCustomers.length,
      retentionRatePct:
        previousActiveCustomers.length > 0 ? roundPercent((retainedCustomers.length / previousActiveCustomers.length) * 100) : 0,
      repeatPurchaseRatePct:
        activeCustomers.length > 0 ? roundPercent((repeatActiveCustomers.length / activeCustomers.length) * 100) : 0,
      churnRatePct:
        previousActiveCustomers.length > 0 ? roundPercent((lostCustomers.length / previousActiveCustomers.length) * 100) : 0,
      lostRatePct:
        previousActiveCustomers.length > 0 ? roundPercent((lostCustomers.length / previousActiveCustomers.length) * 100) : 0,
      atRiskRatePct:
        profilesWithShare.length > 0 ? roundPercent((atRiskCustomers.length / profilesWithShare.length) * 100) : 0,
      decliningRatePct:
        activeCustomers.length > 0 ? roundPercent((decliningCustomers.length / activeCustomers.length) * 100) : 0,
      reactivatedRatePct:
        activeCustomers.length > 0 ? roundPercent((reactivatedCustomers.length / activeCustomers.length) * 100) : 0,
      newCustomersRatePct:
        activeCustomers.length > 0 ? roundPercent((newCustomers.length / activeCustomers.length) * 100) : 0,
      vipCustomersRatePct:
        activeCustomers.length > 0 ? roundPercent((vipCustomers.length / activeCustomers.length) * 100) : 0,
      publicoGeneralCount: publicoGeneralCustomers.length,
      publicoGeneralRatePct:
        profilesWithShare.length > 0 ? roundPercent((publicoGeneralCustomers.length / profilesWithShare.length) * 100) : 0,
      totalProfiles: profilesWithShare.length,
      reactivatedCount: reactivatedCustomers.length,
      newCustomersCount: newCustomers.length,
      decliningCustomersCount: decliningCustomers.length,
      growingCustomersCount: growingCustomers.length,
      atRiskCustomersCount: atRiskCustomers.length,
      lostCustomersCount: lostCustomers.length,
      vipCustomersCount: vipCustomers.length,
      revenuePerActiveCustomer:
        activeCustomers.length > 0 ? roundMoney(currentRevenueTotal / activeCustomers.length) : 0,
      averageOrdersPerActiveCustomer:
        activeCustomers.length > 0
          ? roundMoney(activeCustomers.reduce((total, profile) => total + Number(profile.currentOrders || 0), 0) / activeCustomers.length)
          : 0,
      averageGapDays:
        averageGapProfiles.length > 0
          ? roundMoney(
              averageGapProfiles.reduce((total, profile) => total + Number(profile.averageGapDays || 0), 0) / averageGapProfiles.length
            )
          : 0,
      averageDaysSinceLastPurchase:
        recencyProfiles.length > 0
          ? roundMoney(
              recencyProfiles.reduce((total, profile) => total + Number(profile.daysSinceLastPurchase || 0), 0) / recencyProfiles.length
            )
          : 0,
      top5RevenueSharePct: currentRevenueTotal > 0 ? roundPercent((top5Revenue / currentRevenueTotal) * 100) : 0,
      top10RevenueSharePct: currentRevenueTotal > 0 ? roundPercent((top10Revenue / currentRevenueTotal) * 100) : 0,
      currentRevenue: currentRevenueTotal,
      previousRevenue: roundMoney(previousActiveCustomers.reduce((total, profile) => total + Number(profile.previousRevenue || 0), 0)),
    },
    vipCustomers: vipCustomers.slice().sort(byRevenue).slice(0, CUSTOMER_LIST_LIMIT),
    lostCustomers: lostCustomers.slice().sort(byRevenue).slice(0, CUSTOMER_LIST_LIMIT),
    atRiskCustomers: atRiskCustomers.slice().sort(byRevenue).slice(0, CUSTOMER_LIST_LIMIT),
    decliningCustomers: decliningCustomers
      .slice()
      .sort((left, right) => Number(left.revenueDelta || 0) - Number(right.revenueDelta || 0))
      .slice(0, CUSTOMER_LIST_LIMIT),
    growingCustomers: growingCustomers
      .slice()
      .sort((left, right) => Number(right.revenueDelta || 0) - Number(left.revenueDelta || 0))
      .slice(0, CUSTOMER_LIST_LIMIT),
    reactivatedCustomers: reactivatedCustomers.slice().sort(byRevenue).slice(0, CUSTOMER_LIST_LIMIT),
    newCustomers: newCustomers.slice().sort(byRevenue).slice(0, CUSTOMER_LIST_LIMIT),
    customerDirectory: directory,
  };
};

const buildSicarDateFilter = (dateFrom, dateTo) => {
  const cleanFrom = String(dateFrom || '').trim();
  const cleanTo = String(dateTo || '').trim();
  return `v.status = 1 AND v.total > 0 AND v.fecha >= '${cleanFrom} 00:00:00' AND v.fecha < DATE_ADD('${cleanTo}', INTERVAL 1 DAY)`;
};

const loadSicarCustomerTransactions = async (dateFrom, dateTo) => {
  const whereClause = buildSicarDateFilter(dateFrom, dateTo);
  const rows = await runMysqlQuery(`
    SELECT
      DATE_FORMAT(v.fecha, '%Y-%m-%d'),
      DATE_FORMAT(v.fecha, '%Y-%m-%d %H:%i:%s'),
      v.ven_id,
      COALESCE(c.clave, ''),
      COALESCE(NULLIF(TRIM(c.nombre), ''), 'Publico en General'),
      ROUND(v.total, 2),
      COALESCE(GROUP_CONCAT(DISTINCT COALESCE(tp.nombre, 'Sin metodo') ORDER BY tp.nombre SEPARATOR ', '), 'Sin metodo')
    FROM venta v
    LEFT JOIN ticket t ON t.tic_id = v.tic_id
    LEFT JOIN cliente c ON c.cli_id = t.cli_id
    LEFT JOIN ventatipopago vtp ON vtp.ven_id = v.ven_id
    LEFT JOIN tipopago tp ON tp.tpa_id = vtp.tpa_id
    WHERE ${whereClause}
    GROUP BY v.ven_id, v.fecha, c.clave, c.nombre, v.total
    ORDER BY v.fecha ASC, v.ven_id ASC;
  `);

  return rows.map((row) => {
    const customerCode = String(row[3] || '').trim();
    const customerName = String(row[4] || '').trim() || 'Publico en General';

    return {
      saleId: Number(row[2] || 0),
      date: String(row[0] || '').trim(),
      dateTime: String(row[1] || '').trim(),
      customerCode,
      customerName,
      customerKey: customerCode || normalizeText(customerName) || `venta-${String(row[2] || '').trim()}`,
      total: roundMoney(row[5] || 0),
      paymentMethod: String(row[6] || '').trim() || 'Sin metodo',
    };
  });
};

const loadSicarPeriod = async (period) => {
  const dateFrom = String(period?.dateFrom || '').trim();
  const dateTo = String(period?.dateTo || '').trim();
  const whereClause = buildSicarDateFilter(dateFrom, dateTo);

  const [summaryRows, dailyRows, paymentRows, productRows, customerRows, recentRows] = await Promise.all([
    runMysqlQuery(`
      SELECT
        COUNT(*),
        ROUND(SUM(v.total), 2),
        ROUND(AVG(v.total), 2),
        COUNT(DISTINCT COALESCE(t.cli_id, 0))
      FROM venta v
      LEFT JOIN ticket t ON t.tic_id = v.tic_id
      WHERE ${whereClause};
    `),
    runMysqlQuery(`
      SELECT
        DATE_FORMAT(v.fecha, '%Y-%m-%d'),
        COUNT(*),
        ROUND(SUM(v.total), 2),
        ROUND(AVG(v.total), 2)
      FROM venta v
      WHERE ${whereClause}
      GROUP BY DATE(v.fecha)
      ORDER BY DATE(v.fecha);
    `),
    runMysqlQuery(`
      SELECT
        COALESCE(tp.nombre, 'Sin metodo'),
        COUNT(DISTINCT v.ven_id),
        ROUND(SUM(COALESCE(vtp.total, v.total, 0)), 2)
      FROM venta v
      LEFT JOIN ventatipopago vtp ON vtp.ven_id = v.ven_id
      LEFT JOIN tipopago tp ON tp.tpa_id = vtp.tpa_id
      WHERE ${whereClause}
      GROUP BY COALESCE(tp.nombre, 'Sin metodo')
      ORDER BY 3 DESC, 2 DESC;
    `),
    runMysqlQuery(`
      SELECT
        COALESCE(d.clave, ''),
        COALESCE(d.descripcion, ''),
        ROUND(SUM(d.cantidad), 3),
        ROUND(SUM(d.importeCon), 2),
        COUNT(DISTINCT d.ven_id)
      FROM detallev d
      INNER JOIN venta v ON v.ven_id = d.ven_id
      WHERE ${whereClause}
      GROUP BY d.clave, d.descripcion
      ORDER BY 4 DESC, 3 DESC
      LIMIT 10;
    `),
    runMysqlQuery(`
      SELECT
        COALESCE(c.clave, ''),
        COALESCE(NULLIF(TRIM(c.nombre), ''), 'Publico en General'),
        COUNT(DISTINCT v.ven_id),
        ROUND(SUM(v.total), 2)
      FROM venta v
      LEFT JOIN ticket t ON t.tic_id = v.tic_id
      LEFT JOIN cliente c ON c.cli_id = t.cli_id
      WHERE ${whereClause}
      GROUP BY COALESCE(t.cli_id, 0), COALESCE(c.clave, ''), COALESCE(NULLIF(TRIM(c.nombre), ''), 'Publico en General')
      ORDER BY 4 DESC, 3 DESC
      LIMIT 10;
    `),
    runMysqlQuery(`
      SELECT
        DATE_FORMAT(v.fecha, '%Y-%m-%d %H:%i:%s'),
        v.ven_id,
        COALESCE(NULLIF(TRIM(c.nombre), ''), 'Publico en General'),
        COALESCE(GROUP_CONCAT(DISTINCT COALESCE(tp.nombre, 'Sin metodo') ORDER BY tp.nombre SEPARATOR ', '), 'Sin metodo'),
        ROUND(v.total, 2)
      FROM venta v
      LEFT JOIN ticket t ON t.tic_id = v.tic_id
      LEFT JOIN cliente c ON c.cli_id = t.cli_id
      LEFT JOIN ventatipopago vtp ON vtp.ven_id = v.ven_id
      LEFT JOIN tipopago tp ON tp.tpa_id = vtp.tpa_id
      WHERE ${whereClause}
      GROUP BY v.ven_id, v.fecha, c.nombre, v.total
      ORDER BY v.fecha DESC
      LIMIT 8;
    `),
  ]);

  const summaryRow = summaryRows[0] || [];
  const summary = {
    saleCount: Number(summaryRow[0] || 0),
    revenue: roundMoney(summaryRow[1] || 0),
    averageTicket: roundMoney(summaryRow[2] || 0),
    uniqueCustomers: Number(summaryRow[3] || 0),
  };

  const dailyMap = new Map(
    createDailySeed(dateFrom, dateTo, (date) => ({
      date,
      label: formatShortDate(date),
      saleCount: 0,
      revenue: 0,
      averageTicket: 0,
    })).map((row) => [row.date, row])
  );

  dailyRows.forEach((row) => {
    const date = String(row[0] || '').trim();
    const entry = dailyMap.get(date);
    if (!entry) {
      return;
    }

    entry.saleCount = Number(row[1] || 0);
    entry.revenue = roundMoney(row[2] || 0);
    entry.averageTicket = roundMoney(row[3] || 0);
  });

  return {
    summary,
    daily: Array.from(dailyMap.values()),
    paymentMethods: paymentRows.map((row) => ({
      name: String(row[0] || 'Sin metodo').trim() || 'Sin metodo',
      count: Number(row[1] || 0),
      total: roundMoney(row[2] || 0),
    })),
    topProducts: productRows.map((row) => ({
      code: String(row[0] || '').trim(),
      name: String(row[1] || '').trim() || 'Producto sin nombre',
      quantity: roundQuantity(row[2] || 0),
      revenue: roundMoney(row[3] || 0),
      salesCount: Number(row[4] || 0),
    })),
    topCustomers: customerRows.map((row) => ({
      code: String(row[0] || '').trim(),
      name: String(row[1] || '').trim() || 'Publico en General',
      ordersCount: Number(row[2] || 0),
      revenue: roundMoney(row[3] || 0),
    })),
    recentSales: recentRows.map((row) => ({
      saleId: Number(row[1] || 0),
      dateTime: String(row[0] || '').trim(),
      customer: String(row[2] || '').trim() || 'Publico en General',
      payment: String(row[3] || '').trim() || 'Sin metodo',
      total: roundMoney(row[4] || 0),
      status: 'Procesada',
    })),
  };
};

const buildComparison = (onlinePeriod = {}, sicarPeriod = {}) => {
  const onlineRevenue = Number(onlinePeriod?.summary?.revenue || 0);
  const sicarRevenue = Number(sicarPeriod?.summary?.revenue || 0);
  const onlineTicket = Number(onlinePeriod?.summary?.averageTicket || 0);
  const sicarTicket = Number(sicarPeriod?.summary?.averageTicket || 0);
  const onlineCustomers = Number(onlinePeriod?.summary?.uniqueCustomers || 0);
  const sicarCustomers = Number(sicarPeriod?.summary?.uniqueCustomers || 0);

  return {
    onlineRevenueSharePct: sicarRevenue > 0 ? roundPercent((onlineRevenue / sicarRevenue) * 100) : 0,
    onlineTicketVsSicarPct: sicarTicket > 0 ? roundPercent((onlineTicket / sicarTicket) * 100) : 0,
    onlineCustomerReachPct: sicarCustomers > 0 ? roundPercent((onlineCustomers / sicarCustomers) * 100) : 0,
  };
};

const buildDashboardPayload = async () => {
  const periodDefinitions = buildPeriodDefinitions(new Date());
  const minPeriodDate = periodDefinitions.reduce(
    (current, period) => (!current || period.dateFrom < current ? period.dateFrom : current),
    ''
  );
  const maxDate = periodDefinitions.reduce(
    (current, period) => (!current || period.dateTo > current ? period.dateTo : current),
    ''
  );
  const customerLookbackStart = formatDateKey(addDays(new Date(`${maxDate}T12:00:00`), -(CUSTOMER_LOOKBACK_DAYS - 1)));
  const fullLookbackDate = !minPeriodDate || customerLookbackStart < minPeriodDate ? customerLookbackStart : minPeriodDate;

  const [storeOrders, sicarCustomerTransactions] = await Promise.all([
    loadStoreOrders(fullLookbackDate, maxDate).then((rows) => normalizeStoreOrdersForAnalytics(rows)),
    loadSicarCustomerTransactions(fullLookbackDate, maxDate),
  ]);

  const deliveredStoreTransactions = storeOrders
    .filter((order) => order.status === 'entregado')
    .map((order) => ({
      customerKey: order.customerKey,
      customerCode: order.customerCode,
      customerName: order.customerName,
      date: order.date,
      dateTime: order.dateTime,
      total: order.finalAmount,
      paymentMethod: order.paymentMethod,
      rewardUsed: order.rewardUsed,
      couponUsed: order.couponUsed,
    }));

  const periods = {};

  for (const period of periodDefinitions) {
    const online = aggregateStorePeriod(storeOrders, period);
    const sicar = await loadSicarPeriod(period);
    const onlineCustomerHealth = buildCustomerInsights(deliveredStoreTransactions, period, { channel: 'online' });
    const sicarCustomerHealth = buildCustomerInsights(sicarCustomerTransactions, period, { channel: 'sicar' });

    periods[period.key] = {
      key: period.key,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      dayCount: getDaysBetween(period.dateFrom, period.dateTo),
      online,
      sicar,
      customerIntelligence: {
        online: onlineCustomerHealth,
        sicar: sicarCustomerHealth,
      },
      comparison: buildComparison(online, sicar),
    };
  }

  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    source: 'crm-analytics',
    defaultPeriod: 'month',
    periodOrder: periodDefinitions.map((period) => period.key),
    periods,
  };

  saveLocalBackup(payload);
  saveEmbeddedPublicSnapshot(payload);
  return payload;
};

export const getCrmLocalBackupPath = () => LOCAL_BACKUP_PATH;
export const getCrmEmbeddedSnapshotPath = () => EMBEDDED_PUBLIC_SNAPSHOT_PATH;

export async function getCrmDashboardSnapshot(options = {}) {
  const force = options.force === true;
  const now = Date.now();

  if (!force && cache.payload && now - cache.generatedAt <= CACHE_MAX_AGE_MS) {
    return cache.payload;
  }

  if (!force && cache.pending) {
    return cache.pending;
  }

  cache.pending = buildDashboardPayload()
    .then((payload) => {
      cache.payload = payload;
      cache.generatedAt = Date.now();
      cache.pending = null;
      return payload;
    })
    .catch((error) => {
      cache.pending = null;
      throw error;
    });

  return cache.pending;
}
