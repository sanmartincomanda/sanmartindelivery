import { onValue, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { getDistanceKm, normalizeLocation } from './geo';
import {
  DEFAULT_STORE_DELIVERY_SETTINGS,
  normalizeStoreDeliverySettings,
} from './storeDeliverySettings';

export const STORE_BRANCHES_PATH = 'storeBranches';
export const DEFAULT_STORE_BRANCH_ID = 'granada';
export const STORE_BRANCH_SELECTION_KEY = 'sanmartin_store_branch_v1';

export const DEFAULT_STORE_BRANCHES = Object.freeze({
  granada: {
    id: 'granada',
    tenantId: 'sanmartinsr',
    branchCode: 'granada',
    name: 'Carnes San Martin Granada',
    shortName: 'Granada',
    brandTitle: 'Delivery Carnes San Martin Granada',
    city: 'Granada',
    address: 'Oficinas Claro 50 metros al este, Granada',
    phone: '84657949',
    whatsapp: '50584657949',
    storeLocation: {
      lat: 11.9299,
      lng: -85.956,
      label: 'Carnes San Martin Granada',
    },
    coverageRadiusKm: 7.5,
    switchPromptRadiusKm: 12,
    active: true,
    acceptingOrders: true,
    displayOrder: 1,
  },
  masaya: {
    id: 'masaya',
    tenantId: 'sanmartinsr',
    branchCode: 'masaya',
    name: 'Carnes San Martin Masaya',
    shortName: 'Masaya',
    brandTitle: 'Delivery Carnes San Martin Masaya',
    city: 'Masaya',
    address: 'Del Parque Central 2 cuadras al sur, Masaya',
    phone: '89805608',
    whatsapp: '50589805608',
    storeLocation: {
      lat: 11.9751889,
      lng: -86.0934278,
      label: 'Carnes San Martin Masaya',
    },
    coverageRadiusKm: 7.5,
    switchPromptRadiusKm: 12,
    active: true,
    acceptingOrders: false,
    displayOrder: 2,
  },
  nindiri: {
    id: 'nindiri',
    tenantId: 'sanmartinsr',
    branchCode: 'nindiri',
    name: 'Carnes San Martin Nindiri',
    shortName: 'Nindiri',
    brandTitle: 'Delivery Carnes San Martin Nindiri',
    city: 'Nindiri',
    address: "Costado sur de la rotonda de Nindiri, Plaza Porta's",
    phone: '57457960',
    whatsapp: '50557457960',
    storeLocation: {
      lat: 11.9994395,
      lng: -86.1162223,
      label: 'Carnes San Martin Nindiri',
    },
    coverageRadiusKm: 7.5,
    switchPromptRadiusKm: 12,
    active: true,
    acceptingOrders: false,
    displayOrder: 3,
  },
});

const cleanPhone = (value = '') => String(value || '').replace(/\D/g, '');
const normalizePositiveNumber = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

export const normalizeStoreBranch = (branch = {}, fallback = {}) => {
  const source = branch && typeof branch === 'object' ? branch : {};
  const backup = fallback && typeof fallback === 'object' ? fallback : {};
  const id = String(source.id || backup.id || '').trim().toLowerCase();
  const name = String(source.name || backup.name || `Carnes San Martin ${id}`).trim();
  const shortName = String(source.shortName || backup.shortName || source.city || backup.city || id).trim();
  const location =
    normalizeLocation(source.storeLocation || source.location) ||
    normalizeLocation(backup.storeLocation || backup.location);

  return {
    id,
    tenantId: String(source.tenantId || backup.tenantId || 'sanmartinsr').trim(),
    branchCode: String(source.branchCode || backup.branchCode || id).trim().toLowerCase(),
    name,
    shortName,
    brandTitle: String(source.brandTitle || backup.brandTitle || `Delivery ${name}`).trim(),
    city: String(source.city || backup.city || shortName).trim(),
    address: String(source.address || backup.address || '').trim(),
    phone: cleanPhone(source.phone || backup.phone),
    whatsapp: cleanPhone(source.whatsapp || backup.whatsapp || source.phone || backup.phone),
    storeLocation: location,
    coverageRadiusKm: normalizePositiveNumber(
      source.coverageRadiusKm,
      normalizePositiveNumber(backup.coverageRadiusKm, 7.5)
    ),
    switchPromptRadiusKm: normalizePositiveNumber(
      source.switchPromptRadiusKm,
      normalizePositiveNumber(backup.switchPromptRadiusKm, 12)
    ),
    active: source.active !== undefined ? source.active !== false : backup.active !== false,
    acceptingOrders:
      source.acceptingOrders !== undefined
        ? source.acceptingOrders !== false
        : backup.acceptingOrders !== false,
    displayOrder: Math.max(
      0,
      Number(source.displayOrder ?? backup.displayOrder ?? 999) || 999
    ),
    deliverySettings:
      source.deliverySettings && typeof source.deliverySettings === 'object'
        ? source.deliverySettings
        : backup.deliverySettings && typeof backup.deliverySettings === 'object'
          ? backup.deliverySettings
          : null,
    updatedAt: Number(source.updatedAt || backup.updatedAt || 0) || 0,
  };
};

export const mergeStoreBranches = (remoteBranches = {}) => {
  const source = remoteBranches && typeof remoteBranches === 'object' ? remoteBranches : {};
  const ids = new Set([...Object.keys(DEFAULT_STORE_BRANCHES), ...Object.keys(source)]);

  return Array.from(ids)
    .map((id) =>
      normalizeStoreBranch(
        { ...(source[id] || {}), id },
        DEFAULT_STORE_BRANCHES[id] || { id }
      )
    )
    .filter((branch) => branch.id)
    .sort((left, right) => {
      const orderDiff = Number(left.displayOrder || 0) - Number(right.displayOrder || 0);
      return orderDiff || left.name.localeCompare(right.name, 'es');
    });
};

export const getStoreBranchById = (branches = [], branchId = DEFAULT_STORE_BRANCH_ID) => {
  const list = Array.isArray(branches) ? branches : mergeStoreBranches(branches);
  const cleanId = String(branchId || '').trim().toLowerCase();
  return (
    list.find((branch) => branch.id === cleanId && branch.active !== false) ||
    list.find((branch) => branch.id === DEFAULT_STORE_BRANCH_ID) ||
    list.find((branch) => branch.active !== false) ||
    normalizeStoreBranch(DEFAULT_STORE_BRANCHES[DEFAULT_STORE_BRANCH_ID])
  );
};

export const getNearestStoreBranch = (location, branches = []) => {
  const normalizedLocation = normalizeLocation(location);
  if (!normalizedLocation) {
    return null;
  }

  const candidates = (Array.isArray(branches) ? branches : mergeStoreBranches(branches))
    .filter((branch) => branch.active !== false && normalizeLocation(branch.storeLocation))
    .map((branch) => ({
      branch,
      distanceKm: getDistanceKm(normalizedLocation, branch.storeLocation),
    }))
    .filter((candidate) => Number.isFinite(candidate.distanceKm))
    .sort((left, right) => left.distanceKm - right.distanceKm);

  return candidates[0] || null;
};

export const getStoreBranchDeliverySettings = (
  branch,
  globalSettings = DEFAULT_STORE_DELIVERY_SETTINGS
) => {
  const normalizedBranch = normalizeStoreBranch(branch || {});
  const branchOverrides =
    normalizedBranch.deliverySettings && typeof normalizedBranch.deliverySettings === 'object'
      ? normalizedBranch.deliverySettings
      : {};

  return normalizeStoreDeliverySettings(
    {
      ...globalSettings,
      ...branchOverrides,
      fees: {
        ...(globalSettings?.fees || {}),
        ...(branchOverrides?.fees || {}),
      },
      operationHours: {
        ...(globalSettings?.operationHours || {}),
        ...(branchOverrides?.operationHours || {}),
      },
      storeLocation:
        normalizedBranch.storeLocation ||
        branchOverrides.storeLocation ||
        globalSettings?.storeLocation,
      coverageRadiusKm:
        normalizedBranch.coverageRadiusKm ||
        branchOverrides.coverageRadiusKm ||
        globalSettings?.coverageRadiusKm,
    },
    globalSettings
  );
};

export const subscribeStoreBranches = (onData, onError) =>
  onValue(
    ref(database, STORE_BRANCHES_PATH),
    (snapshot) => onData?.(mergeStoreBranches(snapshot.val() || {})),
    onError
  );

export const saveStoreBranch = async (branch = {}) => {
  const cleanId = String(branch.id || branch.branchCode || '').trim().toLowerCase();
  if (!cleanId) {
    throw new Error('La sucursal necesita un codigo.');
  }

  const fallback = DEFAULT_STORE_BRANCHES[cleanId] || { id: cleanId };
  const normalized = normalizeStoreBranch(
    {
      ...branch,
      id: cleanId,
      updatedAt: Date.now(),
    },
    fallback
  );

  await set(ref(database, `${STORE_BRANCHES_PATH}/${cleanId}`), normalized);
  return normalized;
};

export const seedDefaultStoreBranchesIfEmpty = async (existingBranches = {}) => {
  const source = Array.isArray(existingBranches)
    ? Object.fromEntries(existingBranches.map((branch) => [branch.id, branch]))
    : existingBranches || {};
  const updates = {};

  Object.entries(DEFAULT_STORE_BRANCHES).forEach(([branchId, branch]) => {
    if (!source[branchId]) {
      updates[branchId] = normalizeStoreBranch(
        { ...branch, updatedAt: Date.now() },
        branch
      );
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(database, STORE_BRANCHES_PATH), updates);
  }

  return mergeStoreBranches({ ...source, ...updates });
};
