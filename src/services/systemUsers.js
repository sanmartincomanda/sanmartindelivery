import { get, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { hashStorePassword } from './storeUsers';

export const SYSTEM_USERS_PATH = 'systemUsers';
export const KITCHEN_USER_KEY = 'kitchen';

export const DEFAULT_KITCHEN_USER = {
  key: KITCHEN_USER_KEY,
  username: 'cocina',
  displayName: 'Cocina',
  active: true,
  passwordHash: '',
  createdAt: 0,
  updatedAt: 0,
};

const cleanUsername = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');

const sanitizeKitchenUser = (user = {}) => {
  const source = user || {};
  const username = cleanUsername(source.username || DEFAULT_KITCHEN_USER.username);

  return {
    key: KITCHEN_USER_KEY,
    username,
    displayName: String(source.displayName || source.name || 'Cocina').trim() || 'Cocina',
    active: source.active !== false,
    passwordHash: String(source.passwordHash || '').trim(),
    hasPassword: Boolean(source.passwordHash),
    createdAt: Number(source.createdAt || 0),
    updatedAt: Number(source.updatedAt || 0),
    lastLoginAt: Number(source.lastLoginAt || 0),
  };
};

export const normalizeKitchenUser = (user) => sanitizeKitchenUser(user || DEFAULT_KITCHEN_USER);

export async function saveKitchenUser({ username, displayName, password, active }) {
  const cleanUser = cleanUsername(username || DEFAULT_KITCHEN_USER.username);
  const cleanPassword = String(password || '').trim();

  if (!cleanUser) {
    throw new Error('Usuario de cocina incompleto');
  }

  const userRef = ref(database, `${SYSTEM_USERS_PATH}/${KITCHEN_USER_KEY}`);
  const snapshot = await get(userRef);
  const existingUser = normalizeKitchenUser(snapshot.val());
  const now = Date.now();
  const record = {
    key: KITCHEN_USER_KEY,
    username: cleanUser,
    displayName: String(displayName || 'Cocina').trim() || 'Cocina',
    active: active !== false,
    passwordHash: existingUser.passwordHash || '',
    createdAt: existingUser.createdAt || now,
    updatedAt: now,
  };

  if (cleanPassword) {
    if (cleanPassword.length < 4) {
      throw new Error('La contrasena debe tener al menos 4 caracteres');
    }

    record.passwordHash = await hashStorePassword(cleanUser, cleanPassword);
    record.passwordUpdatedAt = now;
  }

  await set(userRef, record);
  return normalizeKitchenUser(record);
}

export async function loginKitchenUser({ user, password }, kitchenUser) {
  const cleanUser = cleanUsername(user);
  const cleanPassword = String(password || '').trim();
  const configuredUser = normalizeKitchenUser(kitchenUser);

  if (!cleanUser || !cleanPassword || configuredUser.active === false) {
    throw new Error('Credenciales invalidas');
  }

  if (!configuredUser.passwordHash) {
    if (cleanUser !== 'cocina' || cleanPassword !== 'cocina2026') {
      throw new Error('Credenciales invalidas');
    }
  } else {
    const passwordHash = await hashStorePassword(configuredUser.username, cleanPassword);
    if (cleanUser !== configuredUser.username || passwordHash !== configuredUser.passwordHash) {
      throw new Error('Credenciales invalidas');
    }
  }

  await update(ref(database, `${SYSTEM_USERS_PATH}/${KITCHEN_USER_KEY}`), {
    lastLoginAt: Date.now(),
  }).catch(() => {});

  const { passwordHash: _passwordHash, ...safeUser } = configuredUser;
  return safeUser;
}
