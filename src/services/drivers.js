import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { hashStorePassword } from './storeUsers';

export const DRIVERS_PATH = 'deliveryDrivers';

export const DEFAULT_DRIVERS = [
  { code: 'E-001', name: 'JORDIN', phone: '', active: true, sortOrder: 10 },
  { code: 'E-002', name: 'NOEL', phone: '', active: true, sortOrder: 20 },
  { code: 'E-003', name: 'CARLOS MORA', phone: '', active: true, sortOrder: 30 },
  { code: 'E-004', name: 'CHIMI', phone: '', active: true, sortOrder: 40 },
];

const normalizeDriverLoginToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const cleanDriverCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

export const normalizeDriverCode = cleanDriverCode;

export const getDriverKey = (code) => cleanDriverCode(code).replace(/[.#$/[\]]/g, '_');

export const getDriverCodeSuffix = (code = '') => {
  const match = String(code || '').match(/(\d{1,})$/);
  return String(match?.[1] || '').padStart(3, '0').slice(-3);
};

export const getDriverLoginUsername = (driver = {}) => {
  const normalized = normalizeDriver(driver);
  const [firstName = normalized.code || 'driver'] = String(normalized.name || '')
    .split(/\s+/)
    .filter(Boolean);

  return `${normalizeDriverLoginToken(firstName) || 'driver'}${getDriverCodeSuffix(normalized.code)}`;
};

export const getDriverLoginPassword = (driver = {}) => {
  const normalized = normalizeDriver(driver);
  const nameParts = String(normalized.name || '')
    .split(/\s+/)
    .filter(Boolean);
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : nameParts[0] || normalized.code || 'driver';

  return `${normalizeDriverLoginToken(lastName) || 'driver'}${getDriverCodeSuffix(normalized.code)}`;
};

export const findDriverByLoginIdentifier = (identifier, drivers = []) => {
  const rawIdentifier = String(identifier || '').trim();
  if (!rawIdentifier) {
    return null;
  }

  const normalizedCode = normalizeDriverCode(rawIdentifier);
  const normalizedLogin = normalizeDriverLoginToken(rawIdentifier);

  return (
    drivers.find((driver) => driver?.code === normalizedCode) ||
    drivers.find((driver) => getDriverLoginUsername(driver) === normalizedLogin) ||
    null
  );
};

export const normalizeDriver = (driver = {}, fallback = {}) => {
  const source = driver || {};
  const backup = fallback || {};
  const code = cleanDriverCode(source.code ?? backup.code);
  const name = String(source.name ?? backup.name ?? '').trim().toUpperCase();
  const loginUsername =
    String(source.loginUsername ?? backup.loginUsername ?? '').trim().toLowerCase() ||
    getDriverLoginUsername({ code, name });

  return {
    code,
    name,
    phone: String(source.phone ?? backup.phone ?? '').trim(),
    active: source.active ?? backup.active ?? true,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? 999),
    loginUsername,
    passwordHash: String(source.passwordHash ?? backup.passwordHash ?? '').trim(),
    createdAt: Number(source.createdAt ?? backup.createdAt ?? Date.now()),
    updatedAt: Number(source.updatedAt ?? backup.updatedAt ?? Date.now()),
  };
};

export const mergeDrivers = (remoteDrivers = {}) => {
  const byCode = new Map();

  DEFAULT_DRIVERS.forEach((driver) => {
    const normalized = normalizeDriver(driver);
    byCode.set(normalized.code, normalized);
  });

  Object.values(remoteDrivers || {}).filter(Boolean).forEach((driver) => {
    const normalized = normalizeDriver(driver, byCode.get(cleanDriverCode(driver?.code)));
    if (normalized.code) {
      byCode.set(normalized.code, normalized);
    }
  });

  return Array.from(byCode.values()).sort(
    (left, right) =>
      Number(left.sortOrder || 0) - Number(right.sortOrder || 0) ||
      String(left.code || '').localeCompare(String(right.code || ''))
  );
};

export async function saveDriver(driver) {
  const now = Date.now();
  const source = driver || {};
  const normalized = normalizeDriver({
    ...source,
    updatedAt: now,
    createdAt: source.createdAt || now,
  });

  if (!normalized.code || !normalized.name) {
    throw new Error('Entregador incompleto');
  }

  const record = { ...normalized };
  const password = String(source.password || '').trim();
  if (password) {
    record.passwordHash = await hashStorePassword(normalized.code, password);
    record.passwordUpdatedAt = now;
  }

  delete record.password;
  await set(ref(database, `${DRIVERS_PATH}/${getDriverKey(normalized.code)}`), record);
  return record;
}

export async function updateDriver(code, patch) {
  const driverKey = getDriverKey(code);
  if (!driverKey) {
    throw new Error('Codigo invalido');
  }

  const payload = {
    ...patch,
    code: normalizeDriverCode(code),
    updatedAt: Date.now(),
  };

  if (payload.password) {
    payload.passwordHash = await hashStorePassword(normalizeDriverCode(code), payload.password);
    payload.passwordUpdatedAt = Date.now();
    delete payload.password;
  }

  await update(ref(database, `${DRIVERS_PATH}/${driverKey}`), payload);
}

export async function fetchDriverByCode(code) {
  const driverKey = getDriverKey(code);
  if (!driverKey) {
    return null;
  }

  const snapshot = await get(ref(database, `${DRIVERS_PATH}/${driverKey}`));
  return snapshot.exists() ? normalizeDriver(snapshot.val()) : null;
}

export async function fetchDrivers() {
  const snapshot = await get(ref(database, DRIVERS_PATH));
  return mergeDrivers(snapshot.val());
}

export async function seedDefaultDriversIfEmpty() {
  const snapshot = await get(ref(database, DRIVERS_PATH));
  if (snapshot.exists()) {
    return false;
  }

  const updates = {};
  DEFAULT_DRIVERS.forEach((driver) => {
    updates[getDriverKey(driver.code)] = normalizeDriver(driver);
  });

  await set(ref(database, DRIVERS_PATH), updates);
  return true;
}

export async function loginDriver({ code, password }, drivers = []) {
  const cleanCode = normalizeDriverCode(code);
  const cleanPassword = String(password || '').trim();
  const driver = drivers.find((item) => item?.code === cleanCode);

  if (!driver || driver.active === false || !cleanPassword) {
    throw new Error('Credenciales invalidas');
  }

  const expectedHash = driver.passwordHash || (await hashStorePassword(cleanCode, cleanCode));
  const passwordHash = await hashStorePassword(cleanCode, cleanPassword);
  if (passwordHash !== expectedHash) {
    throw new Error('Credenciales invalidas');
  }

  await update(ref(database, `${DRIVERS_PATH}/${getDriverKey(cleanCode)}`), {
    lastLoginAt: Date.now(),
  }).catch(() => {});

  const { passwordHash: _passwordHash, ...safeDriver } = driver;
  return safeDriver;
}
