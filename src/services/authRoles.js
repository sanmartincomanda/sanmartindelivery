import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { get, ref, set, update } from 'firebase/database';
import { auth, database } from '../firebase';

export const USER_ROLES_PATH = 'userRoles';

export const AUTH_ROLES = {
  ADMIN: 'admin',
  KITCHEN: 'kitchen',
  DRIVER: 'driver',
  CLIENT: 'client',
  SERVICE: 'service',
};

const AUTH_DOMAIN = 'auth.sanmartinsr.local';

export const cleanAuthPhone = (phone) => String(phone || '').replace(/[^\d+]/g, '').trim();

const sanitizeEmailToken = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '');

export const buildStoreCustomerEmail = (phone) => {
  const cleanPhone = cleanAuthPhone(phone).replace(/\D/g, '');
  return `${cleanPhone || 'cliente'}@clientes.${AUTH_DOMAIN}`;
};

export const buildInternalEmail = (username, scope = 'internal') => {
  const cleanUsername = sanitizeEmailToken(username);
  const cleanScope = sanitizeEmailToken(scope) || 'internal';
  return `${cleanUsername || 'usuario'}@${cleanScope}.${AUTH_DOMAIN}`;
};

export const buildDriverEmail = (driverCode) => buildInternalEmail(driverCode, 'drivers');

export const getCurrentAuthUser = () => auth.currentUser;

export const onFirebaseAuthChange = (callback) => onAuthStateChanged(auth, callback);

export async function fetchUserRole(uid = auth.currentUser?.uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) {
    return null;
  }

  const snapshot = await get(ref(database, `${USER_ROLES_PATH}/${cleanUid}`));
  return snapshot.val() || null;
}

export async function signInStoreCustomer({ telefono, password }) {
  const credential = await signInWithEmailAndPassword(
    auth,
    buildStoreCustomerEmail(telefono),
    String(password || '')
  );

  return credential.user;
}

export async function createStoreCustomerAuth({ nombre, telefono, password }) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    buildStoreCustomerEmail(telefono),
    String(password || '')
  );

  if (nombre) {
    await updateProfile(credential.user, { displayName: String(nombre || '').trim() }).catch(() => {});
  }

  return credential.user;
}

export async function signInInternalUser({ username, password, scope = 'internal' }) {
  const credential = await signInWithEmailAndPassword(
    auth,
    buildInternalEmail(username, scope),
    String(password || '')
  );

  return credential.user;
}

export async function signInDriverAuth({ code, password }) {
  const rawPassword = String(password || '');
  const authPassword = rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
  const credential = await signInWithEmailAndPassword(
    auth,
    buildDriverEmail(code),
    authPassword
  );

  return credential.user;
}

export async function assertRole(expectedRoles = [], uid = auth.currentUser?.uid) {
  const allowedRoles = Array.isArray(expectedRoles) ? expectedRoles : [expectedRoles];
  const roleRecord = await fetchUserRole(uid);
  if (!roleRecord || !allowedRoles.includes(roleRecord.role)) {
    const error = new Error('Rol no autorizado');
    error.code = 'ROLE_DENIED';
    throw error;
  }

  return roleRecord;
}

export async function upsertOwnClientRole(uid, payload = {}) {
  const cleanUid = String(uid || auth.currentUser?.uid || '').trim();
  if (!cleanUid || cleanUid !== auth.currentUser?.uid) {
    throw new Error('Usuario auth invalido');
  }

  await set(ref(database, `${USER_ROLES_PATH}/${cleanUid}`), {
    role: AUTH_ROLES.CLIENT,
    telefono: cleanAuthPhone(payload.telefono),
    nombre: String(payload.nombre || '').trim(),
    updatedAt: Date.now(),
  });
}

export async function touchLastLogin(uid = auth.currentUser?.uid) {
  const cleanUid = String(uid || '').trim();
  if (!cleanUid) {
    return;
  }

  await update(ref(database, `${USER_ROLES_PATH}/${cleanUid}`), {
    lastLoginAt: Date.now(),
  }).catch(() => {});
}

export const signOutCurrentUser = () => signOut(auth);
