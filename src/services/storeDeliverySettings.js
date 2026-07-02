import { onValue, ref, set } from 'firebase/database';
import { database } from '../firebase.js';
import { getDistanceKm, normalizeLocation } from './geo.js';

export const STORE_DELIVERY_SETTINGS_PATH = 'storeDeliverySettings';
export const STORE_DELIVERY_TAX_RATE = 15;
export const STORE_DEFAULT_COVERAGE_RADIUS_KM = 7.5;
export const STORE_DELIVERY_FEE_BRACKETS = [
  { key: 'under2km', label: '< 2 km', maxDistanceKm: 2 },
  { key: 'under35km', label: '< 3.5 km', maxDistanceKm: 3.5 },
  { key: 'under4km', label: '< 4 km', maxDistanceKm: 4 },
  { key: 'under6km', label: '< 6 km', maxDistanceKm: 6 },
  { key: 'above6km', label: '+ 6 km', maxDistanceKm: Number.POSITIVE_INFINITY },
];
export const STORE_OPERATION_DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];
export const STORE_OPERATION_DAY_LABELS = {
  monday: 'Lunes',
  tuesday: 'Martes',
  wednesday: 'Miercoles',
  thursday: 'Jueves',
  friday: 'Viernes',
  saturday: 'Sabado',
  sunday: 'Domingo',
};
export const DEFAULT_STORE_OPERATION_HOURS = {
  monday: { enabled: true, open: '06:45', close: '17:15' },
  tuesday: { enabled: true, open: '06:45', close: '17:15' },
  wednesday: { enabled: true, open: '06:45', close: '17:15' },
  thursday: { enabled: true, open: '06:45', close: '17:15' },
  friday: { enabled: true, open: '06:45', close: '17:15' },
  saturday: { enabled: true, open: '06:45', close: '17:15' },
  sunday: { enabled: true, open: '07:00', close: '14:00' },
};

export const DEFAULT_STORE_DELIVERY_SETTINGS = {
  taxRate: STORE_DELIVERY_TAX_RATE,
  coverageRadiusKm: STORE_DEFAULT_COVERAGE_RADIUS_KM,
  storeLocation: normalizeLocation({
    lat: 11.9299,
    lng: -85.956,
    label: 'Carnes San Martin Granada',
    updatedAt: Date.now(),
  }),
  fees: {
    under2km: 30,
    under35km: 39.13,
    under4km: 45,
    under6km: 60,
    above6km: 100,
  },
  operationHours: DEFAULT_STORE_OPERATION_HOURS,
  updatedAt: 0,
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundDistance = (value) => Number(Number(value || 0).toFixed(2));

const normalizePositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 0) {
    return roundMoney(numeric);
  }

  return roundMoney(fallback);
};

const normalizeTimeString = (value, fallback = '06:45') => {
  const cleanValue = String(value || '').trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(cleanValue);

  if (!match) {
    return fallback;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeToMinutes = (value) => {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) {
    return Number.NaN;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

const normalizeStoreOperationDay = (day = {}, fallback = {}) => {
  const defaultDay = {
    enabled: true,
    open: '06:45',
    close: '17:15',
    ...(fallback || {}),
  };
  const open = normalizeTimeString(day.open, defaultDay.open);
  const close = normalizeTimeString(day.close, defaultDay.close);

  return {
    enabled: day.enabled !== undefined ? day.enabled !== false : defaultDay.enabled !== false,
    open,
    close,
  };
};

export const normalizeStoreOperationHours = (hours = {}, fallback = {}) =>
  STORE_OPERATION_DAY_ORDER.reduce((accumulator, dayKey) => {
    accumulator[dayKey] = normalizeStoreOperationDay(
      hours?.[dayKey],
      fallback?.[dayKey] ?? DEFAULT_STORE_OPERATION_HOURS[dayKey]
    );
    return accumulator;
  }, {});

export const formatStoreOperationTime = (value) => {
  const normalized = normalizeTimeString(value, '');
  if (!normalized) {
    return '';
  }

  const [hoursText, minutesText] = normalized.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const suffix = hours >= 12 ? 'p.m.' : 'a.m.';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
};

const formatStoreDayRange = (dayStart, dayEnd) => {
  const startLabel = STORE_OPERATION_DAY_LABELS[dayStart] || dayStart;
  const endLabel = STORE_OPERATION_DAY_LABELS[dayEnd] || dayEnd;

  if (dayStart === dayEnd) {
    return startLabel;
  }

  return `${startLabel} a ${endLabel}`;
};

export const buildStoreOperationScheduleSummary = (settings = DEFAULT_STORE_DELIVERY_SETTINGS) => {
  const operationHours = normalizeStoreOperationHours(
    settings?.operationHours,
    DEFAULT_STORE_OPERATION_HOURS
  );
  const groups = [];
  let currentGroup = null;

  STORE_OPERATION_DAY_ORDER.forEach((dayKey) => {
    const day = operationHours[dayKey];
    const signature = `${day.enabled ? 1 : 0}|${day.open}|${day.close}`;

    if (!currentGroup || currentGroup.signature !== signature) {
      if (currentGroup) {
        groups.push(currentGroup);
      }

      currentGroup = {
        signature,
        dayStart: dayKey,
        dayEnd: dayKey,
        ...day,
      };
      return;
    }

    currentGroup.dayEnd = dayKey;
  });

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups
    .map((group) => {
      const dayLabel = formatStoreDayRange(group.dayStart, group.dayEnd);
      if (group.enabled === false) {
        return `${dayLabel} Cerrado`;
      }

      return `${dayLabel} ${formatStoreOperationTime(group.open)} - ${formatStoreOperationTime(group.close)}`;
    })
    .join(' | ');
};

export const validateStoreOperationHours = (settings = DEFAULT_STORE_DELIVERY_SETTINGS) => {
  const operationHours = normalizeStoreOperationHours(
    settings?.operationHours,
    DEFAULT_STORE_OPERATION_HOURS
  );

  for (const dayKey of STORE_OPERATION_DAY_ORDER) {
    const day = operationHours[dayKey];
    if (day.enabled === false) {
      continue;
    }

    const openMinutes = timeToMinutes(day.open);
    const closeMinutes = timeToMinutes(day.close);
    if (!Number.isFinite(openMinutes) || !Number.isFinite(closeMinutes) || closeMinutes <= openMinutes) {
      return `Revisa el horario de ${STORE_OPERATION_DAY_LABELS[dayKey] || dayKey}. La hora de cierre debe ser mayor que la apertura.`;
    }
  }

  return '';
};

const getDayKeyFromDate = (date = new Date()) => {
  const baseDate = date instanceof Date ? date : new Date(date);
  const dayIndex = Number.isNaN(baseDate.getTime()) ? new Date().getDay() : baseDate.getDay();

  switch (dayIndex) {
    case 0:
      return 'sunday';
    case 1:
      return 'monday';
    case 2:
      return 'tuesday';
    case 3:
      return 'wednesday';
    case 4:
      return 'thursday';
    case 5:
      return 'friday';
    case 6:
      return 'saturday';
    default:
      return 'monday';
  }
};

export const buildStoreOperationClosedMessage = (
  settings = DEFAULT_STORE_DELIVERY_SETTINGS,
  now = new Date()
) => {
  const summary = buildStoreOperationScheduleSummary(settings);
  const currentDayKey = getDayKeyFromDate(now);
  const currentDayLabel = STORE_OPERATION_DAY_LABELS[currentDayKey] || 'Hoy';
  return `Tienda se encuentra cerrada. Horario de atencion: ${summary}. (${currentDayLabel})`;
};

export const getStoreOperationStatus = (
  settings = DEFAULT_STORE_DELIVERY_SETTINGS,
  now = new Date()
) => {
  const normalizedSettings = normalizeStoreDeliverySettings(settings);
  const currentDate = now instanceof Date ? now : new Date(now);
  const currentDayKey = getDayKeyFromDate(currentDate);
  const currentSchedule =
    normalizedSettings.operationHours?.[currentDayKey] || DEFAULT_STORE_OPERATION_HOURS[currentDayKey];
  const currentMinutes = currentDate.getHours() * 60 + currentDate.getMinutes();
  const openMinutes = timeToMinutes(currentSchedule.open);
  const closeMinutes = timeToMinutes(currentSchedule.close);
  const isOpen =
    currentSchedule.enabled !== false &&
    Number.isFinite(openMinutes) &&
    Number.isFinite(closeMinutes) &&
    currentMinutes >= openMinutes &&
    currentMinutes <= closeMinutes;

  return {
    open: isOpen,
    dayKey: currentDayKey,
    dayLabel: STORE_OPERATION_DAY_LABELS[currentDayKey] || currentDayKey,
    schedule: currentSchedule,
    summary: buildStoreOperationScheduleSummary(normalizedSettings),
    statusLabel: isOpen ? 'Abierta' : 'Cerrada',
    message: isOpen
      ? `Abierta hoy hasta ${formatStoreOperationTime(currentSchedule.close)}.`
      : buildStoreOperationClosedMessage(normalizedSettings, currentDate),
  };
};

export const normalizeStoreDeliveryFees = (fees = {}, fallback = {}) => {
  const source = fees || {};
  const backup = fallback || {};
  const defaultFees = DEFAULT_STORE_DELIVERY_SETTINGS.fees;

  return STORE_DELIVERY_FEE_BRACKETS.reduce((accumulator, bracket) => {
    accumulator[bracket.key] = normalizePositiveNumber(
      source[bracket.key],
      backup[bracket.key] ?? defaultFees[bracket.key] ?? 0
    );
    return accumulator;
  }, {});
};

export const normalizeStoreDeliverySettings = (settings = {}, fallback = {}) => {
  const source = settings || {};
  const backup = fallback || {};

  return {
    taxRate: Math.max(
      0,
      normalizePositiveNumber(
        source.taxRate,
        backup.taxRate ?? DEFAULT_STORE_DELIVERY_SETTINGS.taxRate
      )
    ),
    coverageRadiusKm: Math.max(
      0.5,
      roundDistance(
        source.coverageRadiusKm ??
          backup.coverageRadiusKm ??
          DEFAULT_STORE_DELIVERY_SETTINGS.coverageRadiusKm
      )
    ),
    storeLocation:
      normalizeLocation(source.storeLocation) ||
      normalizeLocation(backup.storeLocation) ||
      DEFAULT_STORE_DELIVERY_SETTINGS.storeLocation,
    fees: normalizeStoreDeliveryFees(source.fees, backup.fees),
    operationHours: normalizeStoreOperationHours(
      source.operationHours,
      backup.operationHours ?? DEFAULT_STORE_DELIVERY_SETTINGS.operationHours
    ),
    updatedAt: Number(source.updatedAt ?? backup.updatedAt ?? 0) || 0,
  };
};

export const getStoreDeliveryFeeRows = (settings = DEFAULT_STORE_DELIVERY_SETTINGS) => {
  const normalizedSettings = normalizeStoreDeliverySettings(settings);
  const taxMultiplier = normalizedSettings.taxRate / 100;

  return STORE_DELIVERY_FEE_BRACKETS.map((bracket) => {
    const baseFee = roundMoney(normalizedSettings.fees?.[bracket.key] || 0);
    const taxAmount = roundMoney(baseFee * taxMultiplier);
    const totalFee = roundMoney(baseFee + taxAmount);

    return {
      ...bracket,
      baseFee,
      taxAmount,
      totalFee,
    };
  });
};

export const formatStoreDeliveryDistance = (distanceKm) => {
  const numeric = Number(distanceKm || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0 km';
  }

  return `${numeric < 10 ? numeric.toFixed(2) : numeric.toFixed(1).replace(/\.0$/, '')} km`;
};

export const calculateStoreDeliveryQuote = ({
  settings = DEFAULT_STORE_DELIVERY_SETTINGS,
  destination = null,
  fulfillmentType = '',
} = {}) => {
  const normalizedSettings = normalizeStoreDeliverySettings(settings);
  const destinationLocation = normalizeLocation(destination);
  const storeLocation = normalizeLocation(normalizedSettings.storeLocation);
  const pickupOrder = String(fulfillmentType || '').trim().toLowerCase() === PICKUP_FULFILLMENT;

  if (pickupOrder) {
    return {
      available: true,
      reason: 'pickup',
      isPickup: true,
      withinCoverage: true,
      distanceKm: 0,
      coverageRadiusKm: normalizedSettings.coverageRadiusKm,
      feeKey: '',
      feeLabel: 'Pickup en tienda',
      baseFee: 0,
      taxRate: normalizedSettings.taxRate,
      taxAmount: 0,
      totalFee: 0,
    };
  }

  if (!storeLocation) {
    return {
      available: false,
      reason: 'missing_store_location',
      isPickup: false,
      withinCoverage: false,
      distanceKm: Number.POSITIVE_INFINITY,
      coverageRadiusKm: normalizedSettings.coverageRadiusKm,
      feeKey: '',
      feeLabel: '',
      baseFee: 0,
      taxRate: normalizedSettings.taxRate,
      taxAmount: 0,
      totalFee: 0,
    };
  }

  if (!destinationLocation) {
    return {
      available: false,
      reason: 'missing_destination',
      isPickup: false,
      withinCoverage: false,
      distanceKm: Number.POSITIVE_INFINITY,
      coverageRadiusKm: normalizedSettings.coverageRadiusKm,
      feeKey: '',
      feeLabel: '',
      baseFee: 0,
      taxRate: normalizedSettings.taxRate,
      taxAmount: 0,
      totalFee: 0,
    };
  }

  const distanceKm = roundDistance(getDistanceKm(storeLocation, destinationLocation));
  const withinCoverage = distanceKm <= normalizedSettings.coverageRadiusKm;

  if (!withinCoverage) {
    return {
      available: false,
      reason: 'out_of_coverage',
      isPickup: false,
      withinCoverage: false,
      distanceKm,
      coverageRadiusKm: normalizedSettings.coverageRadiusKm,
      feeKey: '',
      feeLabel: '',
      baseFee: 0,
      taxRate: normalizedSettings.taxRate,
      taxAmount: 0,
      totalFee: 0,
    };
  }

  const feeRows = getStoreDeliveryFeeRows(normalizedSettings);
  const matchedBracket =
    feeRows.find((bracket) => distanceKm <= bracket.maxDistanceKm) ||
    feeRows[feeRows.length - 1];

  return {
    available: true,
    reason: 'ok',
    isPickup: false,
    withinCoverage: true,
    distanceKm,
    coverageRadiusKm: normalizedSettings.coverageRadiusKm,
    feeKey: matchedBracket?.key || '',
    feeLabel: matchedBracket?.label || '',
    baseFee: roundMoney(matchedBracket?.baseFee || 0),
    taxRate: normalizedSettings.taxRate,
    taxAmount: roundMoney(matchedBracket?.taxAmount || 0),
    totalFee: roundMoney(matchedBracket?.totalFee || 0),
  };
};

export async function saveStoreDeliverySettings(settings) {
  const normalized = {
    ...normalizeStoreDeliverySettings(settings, DEFAULT_STORE_DELIVERY_SETTINGS),
    updatedAt: Date.now(),
  };

  await set(ref(database, STORE_DELIVERY_SETTINGS_PATH), normalized);
  return normalized;
}

export const subscribeStoreDeliverySettings = (onData, onError) =>
  onValue(
    ref(database, STORE_DELIVERY_SETTINGS_PATH),
    (snapshot) => {
      onData(normalizeStoreDeliverySettings(snapshot.val() || {}, DEFAULT_STORE_DELIVERY_SETTINGS));
    },
    onError
  );
const PICKUP_FULFILLMENT = 'pickup';
