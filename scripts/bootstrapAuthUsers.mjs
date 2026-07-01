import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com';

const AUTH_DOMAIN = 'auth.sanmartinsr.local';

const sanitizeEmailToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');

const buildInternalEmail = (username, scope = 'internal') => {
  const cleanUsername = sanitizeEmailToken(username);
  const cleanScope = sanitizeEmailToken(scope) || 'internal';
  return `${cleanUsername || 'usuario'}@${cleanScope}.${AUTH_DOMAIN}`;
};

const resolveAuthPassword = (password) => {
  const rawPassword = String(password || '');
  return rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
};

const buildDriverEmail = (driverIdentifier) => buildInternalEmail(driverIdentifier, 'drivers');

const normalizeDriverLoginToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

const normalizeDriverCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const getDriverKey = (code) => normalizeDriverCode(code).replace(/[.#$/[\]]/g, '_');

const getDriverCodeSuffix = (code = '') => {
  const match = String(code || '').match(/(\d{1,})$/);
  return String(match?.[1] || '').padStart(3, '0').slice(-3);
};

const normalizeDriverRecord = (driver = {}, fallback = {}) => {
  const source = driver || {};
  const backup = fallback || {};
  const code = normalizeDriverCode(source.code ?? backup.code);
  const name = String(source.name ?? backup.name ?? '').trim().toUpperCase();
  const nameParts = name.split(/\s+/).filter(Boolean);
  const firstName = nameParts[0] || code || 'driver';
  const lastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : firstName;
  const loginUsername =
    String(source.loginUsername ?? backup.loginUsername ?? '').trim().toLowerCase() ||
    `${normalizeDriverLoginToken(firstName) || 'driver'}${getDriverCodeSuffix(code)}`;
  const loginPassword = `${normalizeDriverLoginToken(lastName) || 'driver'}${getDriverCodeSuffix(code)}`;

  return {
    ...backup,
    ...source,
    code,
    name,
    phone: String(source.phone ?? backup.phone ?? '').trim(),
    active: source.active ?? backup.active ?? true,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? 999),
    loginUsername,
    loginPassword,
    authUid: String(source.authUid ?? backup.authUid ?? '').trim(),
  };
};

const mergeDrivers = (remoteDrivers = {}) => {
  const byCode = new Map();

  DEFAULT_DRIVERS.forEach((driver) => {
    const normalized = normalizeDriverRecord(driver);
    byCode.set(normalized.code, normalized);
  });

  Object.values(remoteDrivers || {})
    .filter(Boolean)
    .forEach((driver) => {
      const normalized = normalizeDriverRecord(driver, byCode.get(normalizeDriverCode(driver?.code)));
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

const DEFAULT_DRIVERS = [
  { code: 'E-001', name: 'JORDIN', phone: '', active: true, sortOrder: 10 },
  { code: 'E-002', name: 'NOEL', phone: '', active: true, sortOrder: 20 },
  { code: 'E-003', name: 'CARLOS MORA', phone: '', active: true, sortOrder: 30 },
  { code: 'E-004', name: 'CHIMI', phone: '', active: true, sortOrder: 40 },
];

const INTERNAL_USERS = [
  {
    username: process.env.OPERATOR_USER || 'delivery',
    password: process.env.OPERATOR_PASSWORD || 'delivery2026',
    scope: 'admin',
    role: 'operator',
    displayName: 'Delivery Operativo',
  },
  {
    username: process.env.ADMIN_USER || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin',
    scope: 'admin',
    role: 'admin',
    displayName: 'Administrador',
  },
  {
    username: process.env.KITCHEN_USER || 'cocina',
    password: process.env.KITCHEN_PASSWORD || 'cocina2026',
    scope: 'kitchen',
    role: 'kitchen',
    displayName: 'Cocina',
  },
];

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    databaseURL: DATABASE_URL,
  });
}

const auth = getAuth();
const db = getDatabase();

async function upsertAuthUser({ email, password, displayName }) {
  try {
    const existing = await auth.getUserByEmail(email);
    return auth.updateUser(existing.uid, {
      password,
      displayName,
      disabled: false,
    });
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    return auth.createUser({
      email,
      password,
      displayName,
      emailVerified: true,
      disabled: false,
    });
  }
}

async function resolveDriverAuthUser(driver, email) {
  if (driver.authUid) {
    try {
      return await auth.getUser(driver.authUid);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }
  }

  const legacyEmail = buildDriverEmail(driver.code);
  if (legacyEmail !== email) {
    try {
      return await auth.getUserByEmail(legacyEmail);
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }
  }

  return null;
}

async function writeRole(uid, payload) {
  await db.ref(`userRoles/${uid}`).set({
    ...payload,
    updatedAt: Date.now(),
  });
}

async function seedInternalUsers() {
  for (const user of INTERNAL_USERS) {
    const email = buildInternalEmail(user.username, user.scope);
    const authUser = await upsertAuthUser({
      email,
      password: resolveAuthPassword(user.password),
      displayName: user.displayName,
    });

    await writeRole(authUser.uid, {
      role: user.role,
      username: user.username,
      scope: user.scope,
      email,
      displayName: user.displayName,
    });

    console.log(`OK ${user.role}: ${email}`);
  }
}

async function seedDrivers() {
  const snapshot = await db.ref('deliveryDrivers').get();
  const drivers = mergeDrivers(snapshot.val());

  for (const driverRecord of drivers) {
    const driver = normalizeDriverRecord(driverRecord);
    const code = driver.code;
    const email = buildDriverEmail(driver.loginUsername);
    const defaultPassword = driver.loginPassword;
    const existingAuthUser = await resolveDriverAuthUser(driver, email);
    const authUser = existingAuthUser
      ? await auth.updateUser(existingAuthUser.uid, {
          email,
          password: process.env[`DRIVER_${code.replace(/[^A-Z0-9]/g, '_')}_PASSWORD`] || defaultPassword,
          displayName: driver.name,
          disabled: driver.active === false,
        })
      : await upsertAuthUser({
          email,
          password: process.env[`DRIVER_${code.replace(/[^A-Z0-9]/g, '_')}_PASSWORD`] || defaultPassword,
          displayName: driver.name,
        });

    await writeRole(authUser.uid, {
      role: 'driver',
      driverCode: code,
      driverUsername: driver.loginUsername,
      email,
      displayName: driver.name,
    });

    await db.ref(`deliveryDrivers/${getDriverKey(code)}`).update({
      ...driver,
      code,
      loginUsername: driver.loginUsername,
      authUid: authUser.uid,
      updatedAt: Date.now(),
    });

    console.log(`OK driver ${code}: ${driver.loginUsername}`);
  }
}

async function main() {
  await seedInternalUsers();
  await seedDrivers();
  console.log('Usuarios Auth y roles listos.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    db.goOffline();
    process.exit(process.exitCode || 0);
  });
