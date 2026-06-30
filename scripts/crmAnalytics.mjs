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

const cache = {
  payload: null,
  generatedAt: 0,
  pending: null,
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantity = (value) => Number(Number(value || 0).toFixed(3));
const roundPercent = (value) => Number(Number(value || 0).toFixed(1));

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

      return {
        orderKey: String(order?.firebaseKey || '').trim(),
        orderNumber: Number(order?.id || 0),
        date: String(order?.fecha || '').trim(),
        dateTime: order?.timestampIngresoMs
          ? new Date(Number(order.timestampIngresoMs)).toISOString()
          : `${String(order?.fecha || '').trim()}T12:00:00`,
        customerKey:
          String(order?.storeUserKey || '').trim() ||
          String(order?.clienteFirebaseKey || '').trim() ||
          String(order?.telefono || '').trim() ||
          String(order?.cliente || '').trim(),
        customerName: String(order?.cliente || '').trim() || 'Cliente sin nombre',
        paymentMethod: normalizePaymentLabel(order?.metodoPago),
        status,
        finalAmount,
        pickup,
        rewardUsed: Boolean(order?.rewardRedemption?.rewardId),
        couponUsed: Boolean(String(order?.cupon?.code || '').trim()),
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

const buildSicarDateFilter = (dateFrom, dateTo) => {
  const cleanFrom = String(dateFrom || '').trim();
  const cleanTo = String(dateTo || '').trim();
  return `v.status = 1 AND v.total > 0 AND v.fecha >= '${cleanFrom} 00:00:00' AND v.fecha < DATE_ADD('${cleanTo}', INTERVAL 1 DAY)`;
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

  return {
    onlineRevenueSharePct: sicarRevenue > 0 ? roundPercent((onlineRevenue / sicarRevenue) * 100) : 0,
  };
};

const buildDashboardPayload = async () => {
  const periodDefinitions = buildPeriodDefinitions(new Date());
  const maxLookbackDate = periodDefinitions.reduce(
    (current, period) => (!current || period.dateFrom < current ? period.dateFrom : current),
    ''
  );
  const maxDate = periodDefinitions.reduce(
    (current, period) => (!current || period.dateTo > current ? period.dateTo : current),
    ''
  );

  const storeOrders = normalizeStoreOrdersForAnalytics(await loadStoreOrders(maxLookbackDate, maxDate));
  const periods = {};

  for (const period of periodDefinitions) {
    const online = aggregateStorePeriod(storeOrders, period);
    const sicar = await loadSicarPeriod(period);
    periods[period.key] = {
      key: period.key,
      dateFrom: period.dateFrom,
      dateTo: period.dateTo,
      dayCount: getDaysBetween(period.dateFrom, period.dateTo),
      online,
      sicar,
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
