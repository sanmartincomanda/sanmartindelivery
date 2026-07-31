import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { get, ref, set, update } from 'firebase/database';
import { auth, database } from '../firebase';

export const USER_ROLES_PATH = 'userRoles';

export const AUTH_ROLES = {
  ADMIN: 'admin',
  BRANCH_ADMIN: 'branch_admin',
  OPERATOR: 'operator',
  KITCHEN: 'kitchen',
  DRIVER: 'driver',
  CLIENT: 'client',
  SERVICE: 'service',
};

export const getRoleBranchId = (roleRecord = {}) =>
  String(roleRecord?.branchId || roleRecord?.storeBranchId || '')
    .trim()
    .toLowerCase();

const FIXED_ORDER_BRANCH_BY_USERNAME = Object.freeze({
  delivery: 'granada',
  cocina: 'granada',
  adminni: 'nindiri',
  adminmy: 'masaya',
});

export const getOrdersBranchScope = (roleRecord = {}, { forceKitchenScope = false } = {}) => {
  const role = String(roleRecord?.role || '').trim().toLowerCase();
  if (role === AUTH_ROLES.ADMIN) {
    return '';
  }

  const username = String(roleRecord?.username || '').trim().toLowerCase();
  if (FIXED_ORDER_BRANCH_BY_USERNAME[username]) {
    return FIXED_ORDER_BRANCH_BY_USERNAME[username];
  }

  const branchId = getRoleBranchId(roleRecord);
  if (branchId) {
    return branchId;
  }

  if (role === AUTH_ROLES.OPERATOR || role === AUTH_ROLES.KITCHEN || forceKitchenScope) {
    return 'granada';
  }

  return '';
};

const AUTH_DOMAIN = 'auth.sanmartinsr.local';

export const cleanAuthPhone = (phone) => String(phone || '').replace(/[^\d+]/g, '').trim();
export const normalizeAuthEmail = (email) => String(email || '').trim().toLowerCase();

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

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

export const resolveStoreCustomerEmail = ({ email, telefono } = {}) =>
  normalizeAuthEmail(email) || buildStoreCustomerEmail(telefono);

export const buildInternalEmail = (username, scope = 'internal') => {
  const cleanUsername = sanitizeEmailToken(username);
  const cleanScope = sanitizeEmailToken(scope) || 'internal';
  return `${cleanUsername || 'usuario'}@${cleanScope}.${AUTH_DOMAIN}`;
};

export const buildDriverEmail = (driverIdentifier) => buildInternalEmail(driverIdentifier, 'drivers');

const requestFirebaseAuth = async (action, payload) => {
  const apiKey = String(auth?.app?.options?.apiKey || '').trim();
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, returnSecureToken: true }),
    }
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.error?.message || `Firebase Auth HTTP ${response.status}`);
    error.code = data?.error?.message || 'auth/request-failed';
    throw error;
  }

  return data;
};

export async function provisionDriverAuthAccount({
  username,
  password,
  driverCode,
  displayName,
  branchId = 'granada',
}) {
  await assertRole(AUTH_ROLES.ADMIN);

  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanPassword = String(password || '').trim();
  const cleanDriverCode = String(driverCode || '').trim().toUpperCase();
  const cleanBranchId = String(branchId || 'granada').trim().toLowerCase() || 'granada';
  const email = buildDriverEmail(cleanUsername);

  if (!cleanUsername || !cleanDriverCode || cleanPassword.length < 6) {
    throw new Error('Credenciales Driver incompletas');
  }

  let authAccount;
  try {
    authAccount = await requestFirebaseAuth('signUp', {
      email,
      password: cleanPassword,
      displayName: String(displayName || cleanDriverCode).trim(),
    });
  } catch (error) {
    if (error?.code !== 'EMAIL_EXISTS') {
      throw error;
    }

    try {
      authAccount = await requestFirebaseAuth('signInWithPassword', {
        email,
        password: cleanPassword,
      });
    } catch (signInError) {
      const credentialError = new Error(
        `El usuario ${cleanUsername} ya existe, pero su clave no coincide con la clave mostrada.`
      );
      credentialError.code = signInError?.code || 'auth/driver-credential-conflict';
      throw credentialError;
    }
  }

  const uid = String(authAccount?.localId || '').trim();
  if (!uid) {
    throw new Error('Firebase no devolvio el identificador del entregador');
  }

  await set(ref(database, `${USER_ROLES_PATH}/${uid}`), {
    role: AUTH_ROLES.DRIVER,
    driverCode: cleanDriverCode,
    driverUsername: cleanUsername,
    username: cleanUsername,
    email,
    displayName: String(displayName || cleanDriverCode).trim(),
    branchId: cleanBranchId,
    storeBranchId: cleanBranchId,
    updatedAt: Date.now(),
  });

  return { uid, email };
}

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

export async function signInStoreCustomer({ email, telefono, password }) {
  const credential = await signInWithEmailAndPassword(
    auth,
    resolveStoreCustomerEmail({ email, telefono }),
    String(password || '')
  );

  return credential.user;
}

export async function sendStoreCustomerPasswordReset({ email, telefono }) {
  const authEmail = resolveStoreCustomerEmail({ email, telefono });
  if (!authEmail || authEmail.endsWith(`@clientes.${AUTH_DOMAIN}`)) {
    const error = new Error('Correo requerido');
    error.code = 'auth/email-required';
    throw error;
  }

  await sendPasswordResetEmail(auth, authEmail);
  return true;
}

export async function createStoreCustomerAuth({ nombre, email, telefono, password }) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    resolveStoreCustomerEmail({ email, telefono }),
    String(password || '')
  );

  if (nombre) {
    await updateProfile(credential.user, { displayName: String(nombre || '').trim() }).catch(() => {});
  }

  return credential.user;
}

export async function signInStoreCustomerWithGoogle() {
  if (Capacitor.isNativePlatform()) {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const nativeResult = await FirebaseAuthentication.signInWithGoogle({
      skipNativeAuth: true,
    });
    const idToken = nativeResult.credential?.idToken;
    const accessToken = nativeResult.credential?.accessToken;

    if (!idToken) {
      const error = new Error('Google no devolvio una credencial valida');
      error.code = 'auth/missing-google-id-token';
      throw error;
    }

    const googleCredential = GoogleAuthProvider.credential(idToken, accessToken || null);
    const credential = await signInWithCredential(auth, googleCredential);
    return credential.user;
  }

  const credential = await signInWithPopup(auth, googleProvider);
  return credential.user;
}

export async function signInInternalUser({ username, password, scope = 'internal' }) {
  const rawPassword = String(password || '');
  const authPassword = rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
  const credential = await signInWithEmailAndPassword(
    auth,
    buildInternalEmail(username, scope),
    authPassword
  );

  return credential.user;
}

export async function signInDriverAuth({ code, password }) {
  const driverIdentifier = String(code || '').trim();
  const rawPassword = String(password || '');
  const authPassword = rawPassword.length < 6 ? `${rawPassword}26` : rawPassword;
  const credential = await signInWithEmailAndPassword(
    auth,
    buildDriverEmail(driverIdentifier),
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
    email: normalizeAuthEmail(payload.email),
    nombre: String(payload.nombre || '').trim(),
    provider: String(payload.provider || 'password').trim() || 'password',
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
