import { getDistanceKm, normalizeLocation } from './geo.js';

export const ROUTE_SAN_MARTIN_FULFILLMENT = 'ruta_san_martin';
export const ROUTE_SAN_MARTIN_RADIUS_KM = 40;
export const ROUTE_SAN_MARTIN_NOTICE_MS = 24 * 60 * 60 * 1000;
export const ROUTE_SAN_MARTIN_ORIGIN_BRANCH_ID = 'granada';
const MANAGUA_OFFSET = '-06:00';
const ROUTE_SLOTS = [
  { key: 'morning', label: '9:00 a.m. - 12:00 p.m.', start: '09:00', end: '12:00' },
  { key: 'afternoon', label: '1:00 p.m. - 5:00 p.m.', start: '13:00', end: '17:00' },
];

const managuaDateKey = (date) => new Date(date.getTime() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10);

export const isRouteSanMartinOrder = (order = {}) =>
  String(order?.fulfillmentType || '').trim().toLowerCase() === ROUTE_SAN_MARTIN_FULFILLMENT;

export const getRouteSanMartinQuote = ({ branch, destination } = {}) => {
  const origin = normalizeLocation(branch?.storeLocation);
  const target = normalizeLocation(destination);
  const radiusKm = Number(branch?.routeSanMartinRadiusKm) > 0
    ? Math.min(Number(branch.routeSanMartinRadiusKm), ROUTE_SAN_MARTIN_RADIUS_KM)
    : ROUTE_SAN_MARTIN_RADIUS_KM;
  const distanceKm = origin && target ? getDistanceKm(origin, target) : Number.POSITIVE_INFINITY;

  return {
    available: branch?.id === ROUTE_SAN_MARTIN_ORIGIN_BRANCH_ID &&
      branch?.active !== false && Number.isFinite(distanceKm) && distanceKm <= radiusKm,
    distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : distanceKm,
    coverageRadiusKm: radiusKm,
    totalFee: 0,
  };
};

export const getRouteSanMartinSlots = (now = new Date(), days = 3) => {
  const orderedAt = now instanceof Date ? now : new Date(now);
  const firstDay = managuaDateKey(orderedAt);
  const minimumStart = orderedAt.getTime() + ROUTE_SAN_MARTIN_NOTICE_MS;
  const options = [];

  for (let offset = 1; offset <= days; offset += 1) {
    const day = new Date(`${firstDay}T12:00:00${MANAGUA_OFFSET}`);
    day.setUTCDate(day.getUTCDate() + offset);
    const deliveryDate = managuaDateKey(day);
    const dateLabel = day.toLocaleDateString('es-NI', {
      timeZone: 'America/Managua', weekday: 'long', day: 'numeric', month: 'long',
    });

    ROUTE_SLOTS.forEach((slot) => {
      const startAt = Date.parse(`${deliveryDate}T${slot.start}:00${MANAGUA_OFFSET}`);
      if (startAt < minimumStart) return;
      options.push({
        id: `${deliveryDate}:${slot.key}`,
        deliveryDate,
        dateLabel,
        label: slot.label,
        startAt,
        endAt: Date.parse(`${deliveryDate}T${slot.end}:00${MANAGUA_OFFSET}`),
      });
    });
  }

  return options;
};

export const getRouteSanMartinSchedule = (now = new Date(), slotId = '') => {
  const orderedAt = now instanceof Date ? now : new Date(now);
  const selectedSlot = getRouteSanMartinSlots(orderedAt).find((slot) => slot.id === slotId);
  if (slotId && !selectedSlot) return null;
  const earliestAt = selectedSlot?.startAt || orderedAt.getTime() + ROUTE_SAN_MARTIN_NOTICE_MS;

  return {
    deliveryDate: selectedSlot?.deliveryDate || managuaDateKey(new Date(earliestAt)),
    earliestAt,
    earliestLabel: selectedSlot
      ? `${selectedSlot.dateLabel}, ${selectedSlot.label}`
      : new Date(earliestAt).toLocaleString('es-NI', {
          timeZone: 'America/Managua', weekday: 'long', day: 'numeric', month: 'long',
          hour: 'numeric', minute: '2-digit',
        }),
    slotId: selectedSlot?.id || '',
    windowEndAt: selectedSlot?.endAt || 0,
    windowLabel: selectedSlot?.label || '',
  };
};

export const getRouteSanMartinDispatchDate = (order = {}) =>
  isRouteSanMartinOrder(order)
    ? String(order?.scheduledDeliveryDate || '').trim()
    : String(order?.fecha || '').trim();
