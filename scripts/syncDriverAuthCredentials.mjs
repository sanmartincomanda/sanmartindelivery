import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PROJECT_ID = 'comanda-digital-ac1ec';
const DATABASE_URL = 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com';
const WEB_API_KEY = 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro';
const AUTH_DOMAIN = 'auth.sanmartinsr.local';
const FIREBASE_TOOLS_CONFIG = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

const DEFAULT_DRIVERS = [
  { code: 'E-001', name: 'JORDIN', phone: '', active: true, sortOrder: 10 },
  { code: 'E-002', name: 'NOEL', phone: '', active: true, sortOrder: 20 },
  { code: 'E-003', name: 'CARLOS MORA', phone: '', active: true, sortOrder: 30 },
  { code: 'E-004', name: 'CHIMI', publicName: 'Noel Hernandez', phone: '', active: true, sortOrder: 40 },
];

const normalizeDriverLoginToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

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

const buildDriverEmail = (driverIdentifier) => buildInternalEmail(driverIdentifier, 'drivers');

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

const normalizeDriver = (driver = {}, fallback = {}) => {
  const source = driver || {};
  const backup = fallback || {};
  const code = normalizeDriverCode(source.code ?? backup.code);
  const name = String(source.name ?? backup.name ?? '').trim().toUpperCase();
  const publicName = String(source.publicName ?? backup.publicName ?? source.name ?? backup.name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const [firstName = code || 'driver'] = name.split(/\s+/).filter(Boolean);
  const lastName = name.split(/\s+/).filter(Boolean).at(-1) || code || 'driver';
  const loginUsername =
    String(source.loginUsername ?? backup.loginUsername ?? '').trim().toLowerCase() ||
    `${normalizeDriverLoginToken(firstName) || 'driver'}${getDriverCodeSuffix(code)}`;
  const loginPassword = `${normalizeDriverLoginToken(lastName) || 'driver'}${getDriverCodeSuffix(code)}`;

  return {
    ...backup,
    ...source,
    code,
    name,
    publicName,
    phone: String(source.phone ?? backup.phone ?? '').trim(),
    active: source.active ?? backup.active ?? true,
    sortOrder: Number(source.sortOrder ?? backup.sortOrder ?? 999),
    loginUsername,
    loginPassword,
    authUid: String(source.authUid ?? backup.authUid ?? '').trim(),
    createdAt: Number(source.createdAt ?? backup.createdAt ?? Date.now()),
    updatedAt: Number(source.updatedAt ?? backup.updatedAt ?? Date.now()),
  };
};

const mergeDrivers = (remoteDrivers = {}) => {
  const byCode = new Map();

  DEFAULT_DRIVERS.forEach((driver) => {
    const normalized = normalizeDriver(driver);
    byCode.set(normalized.code, normalized);
  });

  Object.values(remoteDrivers || {})
    .filter(Boolean)
    .forEach((driver) => {
      const normalized = normalizeDriver(driver, byCode.get(normalizeDriverCode(driver?.code)));
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

const readFirebaseToolsToken = async () => {
  const raw = await fs.readFile(FIREBASE_TOOLS_CONFIG, 'utf8');
  const parsed = JSON.parse(raw);
  const accessToken = String(parsed?.tokens?.access_token || '').trim();
  const expiresAt = Number(parsed?.tokens?.expires_at || 0);

  if (!accessToken) {
    throw new Error('No se encontro token de Firebase CLI. Ejecuta "npx firebase-tools login" en esta maquina.');
  }

  if (expiresAt && expiresAt <= Date.now() + 60_000) {
    throw new Error('El token de Firebase CLI ya vencio o esta por vencer. Ejecuta "npx firebase-tools login" y vuelve a correr este script.');
  }

  return accessToken;
};

const requestJson = async (url, { method = 'GET', accessToken, body } = {}) => {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      parsed?.error?.message ||
      parsed?.error_description ||
      raw ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed;
};

const lookupAccountByEmail = async (email, accessToken) => {
  const payload = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
    {
      method: 'POST',
      accessToken,
      body: {
        email: [email],
      },
    }
  );

  return Array.isArray(payload?.users) && payload.users.length ? payload.users[0] : null;
};

const upsertDriverAuthAccount = async (driver, accessToken) => {
  const email = buildDriverEmail(driver.loginUsername);
  const password = driver.loginPassword;
  const disabled = driver.active === false;
  const legacyEmail = buildDriverEmail(driver.code);
  let localId = driver.authUid || '';

  if (!localId) {
    const aliasAccount = await lookupAccountByEmail(email, accessToken);
    if (aliasAccount?.localId) {
      localId = aliasAccount.localId;
    }
  }

  if (!localId && legacyEmail !== email) {
    const legacyAccount = await lookupAccountByEmail(legacyEmail, accessToken);
    if (legacyAccount?.localId) {
      localId = legacyAccount.localId;
    }
  }

  if (localId) {
    const updated = await requestJson(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        accessToken,
        body: {
          localId,
          email,
          password,
          displayName: driver.name,
          emailVerified: true,
          disableUser: disabled,
          returnSecureToken: true,
        },
      }
    );

    return {
      uid: updated.localId || localId,
      email: updated.email || email,
    };
  }

  const created = await requestJson(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`,
    {
      method: 'POST',
      accessToken,
      body: {
        email,
        password,
        displayName: driver.name,
        emailVerified: true,
        disabled,
        returnSecureToken: true,
      },
    }
  );

  return {
    uid: created.localId,
    email: created.email || email,
  };
};

const patchDatabase = (nodePath, value, accessToken) =>
  requestJson(`${DATABASE_URL}/${nodePath}.json`, {
    method: 'PATCH',
    accessToken,
    body: value,
  });

const verifyDriverSignIn = async (driver) => {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${WEB_API_KEY}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: buildDriverEmail(driver.loginUsername),
        password: driver.loginPassword,
        returnSecureToken: true,
      }),
    }
  );

  const raw = await response.text();
  const parsed = raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message = parsed?.error?.message || raw || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return parsed?.localId || '';
};

async function main() {
  const accessToken = await readFirebaseToolsToken();
  const remoteDrivers = await requestJson(`${DATABASE_URL}/deliveryDrivers.json`, { accessToken });
  const drivers = mergeDrivers(remoteDrivers);

  if (!drivers.length) {
    throw new Error('No se encontraron entregadores en deliveryDrivers.');
  }

  console.log(`Sincronizando ${drivers.length} entregadores...`);

  for (const driver of drivers) {
    const authAccount = await upsertDriverAuthAccount(driver, accessToken);
    const now = Date.now();

    await patchDatabase(
      `deliveryDrivers/${getDriverKey(driver.code)}`,
      {
        code: driver.code,
        name: driver.name,
        publicName: driver.publicName || driver.name,
        phone: driver.phone,
        active: driver.active,
        sortOrder: driver.sortOrder,
        loginUsername: driver.loginUsername,
        authUid: authAccount.uid,
        updatedAt: now,
      },
      accessToken
    );

    await patchDatabase(
      `userRoles/${authAccount.uid}`,
      {
        role: 'driver',
        driverCode: driver.code,
        driverUsername: driver.loginUsername,
        email: authAccount.email,
        displayName: driver.name,
        updatedAt: now,
      },
      accessToken
    );

    await verifyDriverSignIn(driver);
    console.log(`OK ${driver.code}: ${driver.loginUsername} / ${driver.loginPassword}`);
  }

  console.log('Credenciales Driver sincronizadas correctamente.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
