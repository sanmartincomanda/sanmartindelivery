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
