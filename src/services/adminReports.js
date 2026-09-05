const STORE_CHANNEL = 'tienda_virtual';

export const REPORT_PERIOD_OPTIONS = Object.freeze([
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
]);

const normalizeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

const parseIsoDate = (value = '') => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatReportDateKey = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
};

export const shiftReportDate = (dateKey, days) => {
  const date = parseIsoDate(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + Number(days || 0));
  return formatReportDateKey(date);
};

export const getReportDateRange = (days = 7, todayKey = formatReportDateKey()) => {
  const safeDays = REPORT_PERIOD_OPTIONS.some((option) => option.value === Number(days))
    ? Number(days)
    : 7;

  return {
    days: safeDays,
    dateFrom: shiftReportDate(todayKey, -(safeDays - 1)),
    dateTo: todayKey,
    previousDateFrom: shiftReportDate(todayKey, -(safeDays * 2 - 1)),
    previousDateTo: shiftReportDate(todayKey, -safeDays),
  };
};

export const isStoreReportOrder = (order = {}) =>
  normalizeText(order?.canal) === STORE_CHANNEL;

export const isCanceledReportOrder = (order = {}) => {
  const status = normalizeText(order?.estado);
  return status.includes('cancel') || status.includes('anulad');
};

export const isDeliveredReportOrder = (order = {}) =>
  normalizeText(order?.estado).includes('entregado');

const isPickupReportOrder = (order = {}) => {
  const fulfillment = normalizeText(
    order?.fulfillmentType || order?.fulfillmentLabel || order?.tipoEntrega
  );
  return fulfillment.includes('pickup') || fulfillment.includes('retiro') || fulfillment.includes('recoger');
};

const getOrderTotal = (order = {}) => {
  const total = Number(order?.total ?? order?.totalActualizado ?? order?.subtotalEstimado ?? 0);
  return Number.isFinite(total) && total > 0 ? total : 0;
};

const getBranchId = (order = {}) =>
  String(order?.storeBranchId || order?.storeBranchCode || 'granada').trim().toLowerCase() || 'granada';

const getBranchName = (order = {}) =>
  String(
    order?.storeBranchShortName ||
      order?.storeBranchName ||
      order?.storeBranchCity ||
      getBranchId(order)
  ).trim();

const getDriverName = (order = {}) =>
  String(order?.repartidorPublico || order?.repartidor || order?.entregadoPor || '').trim();

const getOrderCreatedAt = (order = {}) =>
  Number(order?.timestampIngresoMs || order?.timestampCreado || order?.createdAt || 0);

const getOrderDeliveredAt = (order = {}) =>
  Number(order?.timestampEntregadoMs || order?.timestampFinalizado || 0);

const getDeliveryMinutes = (order = {}) => {
  const createdAt = getOrderCreatedAt(order);
  const deliveredAt = getOrderDeliveredAt(order);
  if (!createdAt || !deliveredAt || deliveredAt < createdAt) return null;

  const minutes = Math.round((deliveredAt - createdAt) / 60000);
  return minutes > 0 && minutes < 24 * 60 ? minutes : null;
};

const getTrend = (current, previous) => {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (previousValue <= 0) return null;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
};

const isWithinRange = (order, dateFrom, dateTo) => {
  const date = String(order?.fecha || '').trim();
  return Boolean(date && date >= dateFrom && date <= dateTo);
};

const matchesBranch = (order, branchId) => branchId === 'all' || getBranchId(order) === branchId;

const summarizePeriod = (orders = []) => {
  const storeOrders = orders.filter(isStoreReportOrder);
  const validStoreOrders = storeOrders.filter((order) => !isCanceledReportOrder(order));
  const canceledStoreOrders = storeOrders.filter(isCanceledReportOrder);
  const deliveryOrders = validStoreOrders.filter((order) => !isPickupReportOrder(order));
  const deliveredOrders = deliveryOrders.filter(isDeliveredReportOrder);
  const sales = roundMoney(validStoreOrders.reduce((sum, order) => sum + getOrderTotal(order), 0));
  const deliveryDurations = deliveredOrders.map(getDeliveryMinutes).filter(Number.isFinite);

  return {
    totalOrders: orders.length,
    manualOrders: orders.filter((order) => !isStoreReportOrder(order)).length,
    storeOrders: storeOrders.length,
    validStoreOrders: validStoreOrders.length,
    canceledStoreOrders: canceledStoreOrders.length,
    sales,
    averageTicket: validStoreOrders.length ? roundMoney(sales / validStoreOrders.length) : 0,
    deliveryOrders: deliveryOrders.length,
    deliveredOrders: deliveredOrders.length,
    deliveryCompletionRate: deliveryOrders.length
      ? Number(((deliveredOrders.length / deliveryOrders.length) * 100).toFixed(1))
      : 0,
    cancellationRate: storeOrders.length
      ? Number(((canceledStoreOrders.length / storeOrders.length) * 100).toFixed(1))
      : 0,
    averageDeliveryMinutes: deliveryDurations.length
      ? Math.round(deliveryDurations.reduce((sum, value) => sum + value, 0) / deliveryDurations.length)
      : null,
  };
};

const buildDailyRows = (orders, dateFrom, days) => {
  const rows = [];

  for (let index = 0; index < days; index += 1) {
    const date = shiftReportDate(dateFrom, index);
    const dayOrders = orders.filter((order) => String(order?.fecha || '') === date);
    const validStoreOrders = dayOrders.filter(
      (order) => isStoreReportOrder(order) && !isCanceledReportOrder(order)
    );

    rows.push({
      date,
      totalOrders: dayOrders.length,
      storeOrders: dayOrders.filter(isStoreReportOrder).length,
      manualOrders: dayOrders.filter((order) => !isStoreReportOrder(order)).length,
      sales: roundMoney(validStoreOrders.reduce((sum, order) => sum + getOrderTotal(order), 0)),
    });
  }

  return rows;
};

const buildDriverRows = (orders) => {
  const drivers = new Map();

  orders
    .filter(
      (order) =>
        isStoreReportOrder(order) &&
        !isCanceledReportOrder(order) &&
        !isPickupReportOrder(order) &&
        getDriverName(order)
    )
    .forEach((order) => {
      const name = getDriverName(order);
      const key = normalizeText(name);
      const current = drivers.get(key) || {
        key,
        name,
        assigned: 0,
        delivered: 0,
        sales: 0,
        deliveryMinutes: [],
      };

      current.assigned += 1;
      current.sales += getOrderTotal(order);
      if (isDeliveredReportOrder(order)) {
        current.delivered += 1;
        const minutes = getDeliveryMinutes(order);
        if (Number.isFinite(minutes)) current.deliveryMinutes.push(minutes);
      }
      drivers.set(key, current);
    });

  return Array.from(drivers.values())
    .map((driver) => ({
      key: driver.key,
      name: driver.name,
      assigned: driver.assigned,
      delivered: driver.delivered,
      sales: roundMoney(driver.sales),
      completionRate: driver.assigned
        ? Number(((driver.delivered / driver.assigned) * 100).toFixed(1))
        : 0,
      averageMinutes: driver.deliveryMinutes.length
        ? Math.round(
            driver.deliveryMinutes.reduce((sum, value) => sum + value, 0) /
              driver.deliveryMinutes.length
          )
        : null,
    }))
    .sort((left, right) => right.delivered - left.delivered || right.assigned - left.assigned);
};

const buildBranchRows = (orders) => {
  const branches = new Map();

  orders
    .filter((order) => isStoreReportOrder(order) && !isCanceledReportOrder(order))
    .forEach((order) => {
      const id = getBranchId(order);
      const current = branches.get(id) || { id, name: getBranchName(order), orders: 0, sales: 0 };
      current.orders += 1;
      current.sales += getOrderTotal(order);
      branches.set(id, current);
    });

  return Array.from(branches.values())
    .map((branch) => ({ ...branch, sales: roundMoney(branch.sales) }))
    .sort((left, right) => right.sales - left.sales);
};

const STATUS_ORDER = ['Pendiente', 'En preparacion', 'Preparado', 'Enviado', 'Entregado', 'Cancelado'];

const getStatusLabel = (status = '') => {
  const normalized = normalizeText(status || 'Pendiente');
  if (normalized.includes('cancel') || normalized.includes('anulad')) return 'Cancelado';
  if (normalized.includes('entregado')) return 'Entregado';
  if (normalized.includes('enviado')) return 'Enviado';
  if (normalized.includes('preparado') || normalized.includes('listo')) return 'Preparado';
  if (normalized.includes('preparacion')) return 'En preparacion';
  return 'Pendiente';
};

const buildStatusRows = (orders) => {
  const counts = new Map(STATUS_ORDER.map((status) => [status, 0]));
  orders.filter(isStoreReportOrder).forEach((order) => {
    const status = getStatusLabel(order?.estado);
    counts.set(status, Number(counts.get(status) || 0) + 1);
  });

  return STATUS_ORDER.map((status) => ({ status, count: counts.get(status) || 0 })).filter(
    (row) => row.count > 0
  );
};

export const buildAdminSalesReport = (
  orders = [],
  {
    dateFrom,
    dateTo,
    previousDateFrom,
    previousDateTo,
    days = 7,
    branchId = 'all',
  }
) => {
  const branchOrders = orders.filter((order) => matchesBranch(order, branchId));
  const currentOrders = branchOrders.filter((order) => isWithinRange(order, dateFrom, dateTo));
  const previousOrders = branchOrders.filter((order) =>
    isWithinRange(order, previousDateFrom, previousDateTo)
  );
  const current = summarizePeriod(currentOrders);
  const previous = summarizePeriod(previousOrders);

  return {
    current,
    previous,
    trends: {
      sales: getTrend(current.sales, previous.sales),
      storeOrders: getTrend(current.validStoreOrders, previous.validStoreOrders),
      averageTicket: getTrend(current.averageTicket, previous.averageTicket),
    },
    daily: buildDailyRows(currentOrders, dateFrom, days),
    drivers: buildDriverRows(currentOrders),
    branches: buildBranchRows(currentOrders),
    statuses: buildStatusRows(currentOrders),
  };
};

export const getReportBranchOptions = (orders = []) => {
  const branches = new Map();
  orders.forEach((order) => {
    const id = getBranchId(order);
    if (!branches.has(id)) branches.set(id, getBranchName(order));
  });

  return Array.from(branches.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
};
