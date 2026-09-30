import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectId = 'comanda-digital-ac1ec';
const databaseUrl = 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com';
const driverCode = 'E-RUTA';
const loginUsername = 'rutasanmartin';
const email = `${loginUsername}@drivers.auth.sanmartinsr.local`;
const rawPassword = String(process.env.ROUTE_SAN_MARTIN_DRIVER_PASSWORD || '');
const password = rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
const apply = process.argv.includes('--apply');
const verify = process.argv.includes('--verify');

if ((apply || verify) && !rawPassword) {
  throw new Error('Define ROUTE_SAN_MARTIN_DRIVER_PASSWORD en el entorno.');
}

if (verify) {
  const response = await fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  if (!response.ok) throw new Error('No se pudo iniciar sesion con el usuario Ruta San Martin.');
  console.log('Acceso del usuario Ruta San Martin verificado.');
} else {

const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const accessToken = String(config?.tokens?.access_token || '');
if (!accessToken || Number(config?.tokens?.expires_at || 0) < Date.now() + 60_000) {
  throw new Error('Inicia sesion de nuevo con Firebase CLI antes de crear el usuario.');
}

const request = async (url, method = 'GET', body) => {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result?.error?.message || `HTTP ${response.status}`);
  }
  return result;
};

const accountResult = await request(
  `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`,
  'POST',
  { email: [email] }
);
const existingAccount = accountResult?.users?.[0] || null;
const existingDriver = await request(`${databaseUrl}/deliveryDrivers/${driverCode}.json`);
if (existingDriver && existingDriver.code !== driverCode) {
  throw new Error('El codigo E-RUTA ya pertenece a otro entregador.');
}
if (existingAccount?.localId) {
  const existingRole = await request(`${databaseUrl}/userRoles/${existingAccount.localId}.json`);
  if (existingRole && (existingRole.role !== 'driver' || existingRole.driverCode !== driverCode)) {
    throw new Error('El usuario rutasanmartin ya pertenece a otro rol o entregador.');
  }
}

if (!apply) {
  console.log(`Revision: ${loginUsername}; cuenta ${existingAccount ? 'existente' : 'nueva'}; ficha ${existingDriver ? 'existente' : 'nueva'}. Usa --apply para crearla.`);
} else {
const account = await request(
  `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts${existingAccount ? ':update' : ''}`,
  'POST',
  {
    ...(existingAccount ? { localId: existingAccount.localId } : {}),
    email,
    password,
    displayName: 'Ruta San Martin',
    emailVerified: true,
    disabled: false,
    returnSecureToken: true,
  }
);
const uid = String(account.localId || existingAccount?.localId || '').trim();
if (!uid) throw new Error('Firebase no devolvio el identificador del usuario.');

await request(`${databaseUrl}/userRoles/${uid}.json`, 'PUT', {
  role: 'driver',
  driverCode,
  driverUsername: loginUsername,
  username: loginUsername,
  email,
  displayName: 'Ruta San Martin',
  branchId: 'granada',
  storeBranchId: 'granada',
  updatedAt: Date.now(),
});
await request(`${databaseUrl}/deliveryDrivers/${driverCode}.json`, 'PUT', {
  ...existingDriver,
  code: driverCode,
  name: 'RUTA SAN MARTIN',
  publicName: 'Ruta San Martin',
  branchId: 'granada',
  storeBranchId: 'granada',
  serviceArea: 'all',
  active: true,
  sortOrder: 900,
  loginUsername,
  authUid: uid,
  createdAt: existingDriver?.createdAt || Date.now(),
  updatedAt: Date.now(),
});
console.log(`Usuario ${loginUsername} creado y vinculado a ${driverCode}.`);
}
}
