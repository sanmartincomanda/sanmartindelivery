const STORE_CHANNEL = 'tienda_virtual';

export const ORDER_TRACE_STATUS_OPTIONS = Object.freeze([
  { value: 'all', label: 'Todos los estados' },
  { value: 'pending', label: 'Pendiente' },
  { value: 'preparing', label: 'En preparacion' },
  { value: 'prepared', label: 'Preparado' },
  { value: 'sent', label: 'Enviado' },
  { value: 'delivered', label: 'Entregado' },
  { value: 'canceled', label: 'Cancelado' },
]);

export const normalizeTraceText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const getOrderTraceStatusKey = (order = {}) => {
  const status = normalizeTraceText(order?.estado);
  if (status.includes('cancel') || status.includes('anulad')) return 'canceled';
  if (status.includes('entregado')) return 'delivered';
  if (status.includes('enviado')) return 'sent';
  if (status.includes('preparado') || status.includes('listo')) return 'prepared';
  if (status.includes('preparacion')) return 'preparing';
  return 'pending';
};

export const getOrderTraceStatusLabel = (order = {}) => {
  const key = getOrderTraceStatusKey(order);
  return ORDER_TRACE_STATUS_OPTIONS.find((option) => option.value === key)?.label || 'Pendiente';
};

export const getOrderTraceChannel = (order = {}) => {
  const channel = normalizeTraceText(`${order?.canal || ''} ${order?.canalLabel || ''}`);
  return channel.includes(STORE_CHANNEL) || channel.includes('tienda') || channel.includes('virtual')
    ? 'store'
    : 'manual';
};

export const getOrderTraceChannelLabel = (order = {}) =>
  getOrderTraceChannel(order) === 'store'
    ? String(order?.canalLabel || 'Tienda Virtual').trim()
    : String(order?.canalLabel || 'Ingreso manual').trim();

export const getOrderTraceBranchId = (order = {}) =>
  String(order?.storeBranchId || order?.storeBranchCode || 'granada').trim().toLowerCase() || 'granada';

export const getOrderTraceBranchName = (order = {}) =>
  String(
    order?.storeBranchShortName ||
      order?.storeBranchCity ||
      order?.storeBranchName ||
      getOrderTraceBranchId(order)
  ).trim();

export const getOrderTraceBranchOptions = (orders = []) => {
  const branches = new Map();
  orders.forEach((order) => {
    const id = getOrderTraceBranchId(order);
    if (!branches.has(id)) branches.set(id, getOrderTraceBranchName(order));
  });

  return Array.from(branches.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name, 'es'));
};

const getOrderSearchValues = (order = {}) => [
  order?.orderNumber,
  order?.displayId,
  order?.id,
  order?.firebaseKey,
  order?.fecha,
  order?.cliente,
  order?.clienteCodigo,
  order?.telefono,
  order?.direccion,
  order?.referencia,
  order?.pedido,
  order?.observaciones,
  order?.estado,
  order?.metodoPago,
  order?.canal,
  order?.canalLabel,
  order?.cocinero,
  order?.repartidor,
  order?.repartidorPublico,
  order?.entregadoPor,
  order?.canceladoPor,
  getOrderTraceBranchName(order),
];

const orderMatchesSearch = (order, search) => {
  const term = normalizeTraceText(search);
  if (!term) return true;
  return getOrderSearchValues(order).some((value) => normalizeTraceText(value).includes(term));
};

export const filterOrderTraceHistory = (
  orders = [],
  {
    search = '',
    dateFrom = '',
    dateTo = '',
    status = 'all',
    channel = 'all',
    branchId = 'all',
  } = {}
) =>
  [...orders]
    .filter((order) => {
      const date = String(order?.fecha || '').trim();
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      if (status !== 'all' && getOrderTraceStatusKey(order) !== status) return false;
      if (channel !== 'all' && getOrderTraceChannel(order) !== channel) return false;
      if (branchId !== 'all' && getOrderTraceBranchId(order) !== branchId) return false;
      return orderMatchesSearch(order, search);
    })
    .sort((left, right) => {
      const dateDifference = String(right?.fecha || '').localeCompare(String(left?.fecha || ''));
      if (dateDifference !== 0) return dateDifference;
      const idDifference = Number(right?.id || 0) - Number(left?.id || 0);
      if (idDifference !== 0) return idDifference;
      return Number(right?.timestamp || 0) - Number(left?.timestamp || 0);
    });

export const buildOrderTraceSummary = (orders = []) => ({
  total: orders.length,
  store: orders.filter((order) => getOrderTraceChannel(order) === 'store').length,
  manual: orders.filter((order) => getOrderTraceChannel(order) === 'manual').length,
  delivered: orders.filter((order) => getOrderTraceStatusKey(order) === 'delivered').length,
});

const firstRecordedValue = (...values) =>
  values.find((value) => value !== null && value !== undefined && String(value).trim() !== '') || '';

export const buildOrderTraceTimeline = (order = {}) => {
  const channelLabel = getOrderTraceChannelLabel(order);
  const driver = String(order?.repartidorPublico || order?.repartidor || '').trim();
  const deliveredBy = String(order?.entregadoPorPublico || order?.entregadoPor || driver).trim();
  const events = [
    {
      id: 'received',
      label: 'Pedido ingresado',
      time: firstRecordedValue(order?.timestampIngreso, order?.timestampIngresoMs, order?.timestampCreado),
      actorLabel: 'Origen',
      actor: channelLabel,
    },
    {
      id: 'preparing',
      label: 'Inicio en cocina',
      time: order?.timestampPreparacion || '',
      actorLabel: 'Preparado por',
      actor: order?.cocinero || '',
    },
    {
      id: 'prepared',
      label: 'Pedido preparado',
      time: order?.timestampPreparado || '',
      actorLabel: 'Responsable',
      actor: order?.cocinero || '',
    },
    {
      id: 'sent',
      label: 'Asignado / enviado',
      time: firstRecordedValue(order?.timestampEnviado, order?.timestampAsignado),
      actorLabel: 'Repartidor',
      actor: driver,
    },
    {
      id: 'delivered',
      label: 'Pedido entregado',
      time: firstRecordedValue(order?.timestampEntregado, order?.timestampEntregadoMs),
      actorLabel: 'Entregado por',
      actor: deliveredBy,
    },
  ];

  if (getOrderTraceStatusKey(order) === 'canceled' || order?.timestampCancelado) {
    events.push({
      id: 'canceled',
      label: 'Pedido cancelado',
      time: firstRecordedValue(order?.timestampCancelado, order?.timestampCanceladoMs, order?.timestampAnuladoMs),
      actorLabel: 'Cancelado por',
      actor: order?.canceladoPor || '',
    });
  }

  return events.map((event) => ({
    ...event,
    recorded: Boolean(event.time),
  }));
};
