import admin from 'firebase-admin';

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

const buildDriverEmail = (driverCode) => buildInternalEmail(driverCode, 'drivers');

const normalizeDriverCode = (value = '') =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');

const getDriverKey = (code) => normalizeDriverCode(code).replace(/[.#$/[\]]/g, '_');

const DEFAULT_DRIVERS = [
  { code: 'E-001', name: 'JORDIN', phone: '', active: true, sortOrder: 10 },
  { code: 'E-002', name: 'NOEL', phone: '', active: true, sortOrder: 20 },
  { code: 'E-003', name: 'CARLOS MORA', phone: '', active: true, sortOrder: 30 },
  { code: 'E-004', name: 'CHIMI', phone: '', active: true, sortOrder: 40 },
];

const INTERNAL_USERS = [
  {
    username: process.env.ADMIN_USER || 'delivery',
    password: process.env.ADMIN_PASSWORD || 'delivery2026',
    scope: 'admin',
    role: 'admin',
    displayName: 'Administracion',
  },
  {
    username: process.env.KITCHEN_USER || 'cocina',
    password: process.env.KITCHEN_PASSWORD || 'cocina2026',
    scope: 'kitchen',
    role: 'kitchen',
    displayName: 'Cocina',
  },
];

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    databaseURL: DATABASE_URL,
  });
}

const auth = admin.auth();
const db = admin.database();

async function upsertAuthUser({ email, password, displayName }) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      password,
      displayName,
      disabled: false,
    });
    return existing;
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
      password: user.password,
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
  for (const driver of DEFAULT_DRIVERS) {
    const code = normalizeDriverCode(driver.code);
    const email = buildDriverEmail(code);
    const authUser = await upsertAuthUser({
      email,
      password: process.env[`DRIVER_${code.replace(/[^A-Z0-9]/g, '_')}_PASSWORD`] || code,
      displayName: driver.name,
    });

    await writeRole(authUser.uid, {
      role: 'driver',
      driverCode: code,
      email,
      displayName: driver.name,
    });

    await db.ref(`deliveryDrivers/${getDriverKey(code)}`).update({
      ...driver,
      code,
      authUid: authUser.uid,
      updatedAt: Date.now(),
    });

    console.log(`OK driver ${code}: ${email}`);
  }
}

async function main() {
  await seedInternalUsers();
  await seedDrivers();
  console.log('Usuarios Auth y roles listos.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
