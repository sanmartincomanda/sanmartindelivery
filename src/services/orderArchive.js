export const STORE_COUPON_ARCHIVE_USAGE_PATH = 'storeCouponUsageArchive';

export const normalizeCouponCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase();

export const normalizeOrderStatusText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

export const isCanceledOrderStatus = (status = '') => {
  const normalized = normalizeOrderStatusText(status);
  return normalized.includes('cancel') || normalized.includes('anulad');
};

export const isFinalOrderStatus = (status = '') => {
  const normalized = normalizeOrderStatusText(status);
  return (
    normalized.includes('entregado') ||
    normalized.includes('cancel') ||
    normalized.includes('anulad')
  );
};

export const getArchiveMonthKey = (fecha = '') => {
  const cleanDate = String(fecha || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
    return '';
  }

  return cleanDate.slice(0, 7);
};

export const shouldArchiveRealtimeOrder = (order = {}, todayKey = '') => {
  const orderDate = String(order?.fecha || '').trim();
  const cleanToday = String(todayKey || '').trim();

  if (!orderDate || !cleanToday) {
    return false;
  }

  return orderDate < cleanToday;
};

export const buildArchivedOrderRecord = (orderKey, order = {}, sourcePath = 'orders', archivedAt = Date.now()) => ({
  firebaseKey: String(orderKey || '').trim(),
  archivedSource: String(sourcePath || 'orders').trim() || 'orders',
  archivedAt,
  archivedAtIso: new Date(archivedAt).toISOString(),
  archivedCouponCode: normalizeCouponCode(order?.cupon?.code),
  ...order,
});

export const sortOrdersByDateAndNumberDesc = (orders = []) =>
  [...orders].sort((left, right) => {
    const dateDiff = String(right?.fecha || '').localeCompare(String(left?.fecha || ''));
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const numberDiff = Number(right?.id || 0) - Number(left?.id || 0);
    if (numberDiff !== 0) {
      return numberDiff;
    }

    return Number(right?.timestamp || 0) - Number(left?.timestamp || 0);
  });
