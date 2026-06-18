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

const cleanDriverCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

export const normalizeDriverCode = cleanDriverCode;

export const getDriverKey = (code) => cleanDriverCode(code).replace(/[.#$/[\]]/g, '_');

export const normalizeDriver = (driver = {}, fallback = {}) => {
  const code = cleanDriverCode(driver.code ?? fallback.code);

  return {
    code,
    name: String(driver.name ?? fallback.name ?? '').trim().toUpperCase(),
    phone: String(driver.phone ?? fallback.phone ?? '').trim(),
    active: driver.active ?? fallback.active ?? true,
    sortOrder: Number(driver.sortOrder ?? fallback.sortOrder ?? 999),
    passwordHash: String(driver.passwordHash ?? fallback.passwordHash ?? '').trim(),
    createdAt: Number(driver.createdAt ?? fallback.createdAt ?? Date.now()),
    updatedAt: Number(driver.updatedAt ?? fallback.updatedAt ?? Date.now()),
  };
};

export const mergeDrivers = (remoteDrivers = {}) => {
  const byCode = new Map();

  DEFAULT_DRIVERS.forEach((driver) => {
    const normalized = normalizeDriver(driver);
    byCode.set(normalized.code, normalized);
  });

  Object.values(remoteDrivers || {}).forEach((driver) => {
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
  const normalized = normalizeDriver({
    ...driver,
    updatedAt: now,
    createdAt: driver.createdAt || now,
  });

  if (!normalized.code || !normalized.name) {
    throw new Error('Entregador incompleto');
  }

  const record = { ...normalized };
  const password = String(driver.password || '').trim();
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
  const driver = drivers.find((item) => item.code === cleanCode);

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
