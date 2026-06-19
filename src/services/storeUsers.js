import { get, push, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { hasLocation, normalizeLocation } from './geo';

export const STORE_USERS_PATH = 'storeUsers';

export const cleanStorePhone = (phone) => String(phone || '').replace(/[^\d+]/g, '').trim();

export const getStoreUserKey = (phone) => {
  const cleanPhone = cleanStorePhone(phone);
  return cleanPhone.replace(/[.#$/[\]]/g, '_');
};

const buildClientCode = (phone) => {
  const digits = cleanStorePhone(phone).replace(/\D/g, '');
  return `TV-${digits.slice(-4) || 'WEB'}`;
};

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const fallbackHash = (value) => {
  if (typeof btoa === 'function') {
    return `fallback:${btoa(unescape(encodeURIComponent(value)))}`;
  }

  return `fallback:${value}`;
};

export async function hashStorePassword(phone, password) {
  const cleanPhone = cleanStorePhone(phone);
  const rawValue = `${cleanPhone}:${String(password || '')}`;

  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(rawValue);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return `sha256:${toHex(digest)}`;
  }

  return fallbackHash(rawValue);
}

const sanitizeStoreUser = (user, key) => {
  if (!user) {
    return null;
  }

  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    key,
    hasPassword: Boolean(passwordHash),
  };
};

export async function ensureStoreUser({ nombre, telefono, direccion, referencia, passwordHash, ubicacion }) {
  const cleanPhone = cleanStorePhone(telefono);
  const userKey = getStoreUserKey(cleanPhone);

  if (!userKey || !String(nombre || '').trim() || !String(direccion || '').trim()) {
    throw new Error('Datos de cliente incompletos');
  }

  const now = Date.now();
  const userRef = ref(database, `${STORE_USERS_PATH}/${userKey}`);
  const userSnapshot = await get(userRef);
  const existingUser = userSnapshot.val();
  const normalizedLocation = normalizeLocation(ubicacion) || normalizeLocation(existingUser?.ubicacion);

  if (!hasLocation(normalizedLocation)) {
    const error = new Error('Ubicacion exacta requerida');
    error.code = 'LOCATION_REQUIRED';
    throw error;
  }

  const profile = {
    nombre: String(nombre || '').trim(),
    telefono: cleanPhone,
    direccion: String(direccion || '').trim(),
    referencia: String(referencia || '').trim(),
    ubicacion: normalizedLocation,
    codigo: existingUser?.codigo || buildClientCode(cleanPhone),
    updatedAt: now,
  };

  let clientKey = existingUser?.clientKey || null;
  if (!clientKey) {
    const newClientRef = push(ref(database, 'clients'));
    clientKey = newClientRef.key;
    await set(newClientRef, {
      nombre: profile.nombre,
      codigo: profile.codigo,
      direccion: profile.referencia
        ? `${profile.direccion} | Ref: ${profile.referencia}`
        : profile.direccion,
      ubicacion: profile.ubicacion,
      telefono: profile.telefono,
      origen: 'tienda_virtual',
      createdAt: now,
    });
  } else {
    await update(ref(database, `clients/${clientKey}`), {
      nombre: profile.nombre,
      codigo: profile.codigo,
      direccion: profile.referencia
        ? `${profile.direccion} | Ref: ${profile.referencia}`
        : profile.direccion,
      ubicacion: profile.ubicacion,
      telefono: profile.telefono,
      origen: 'tienda_virtual',
      updatedAt: now,
    });
  }

  await set(userRef, {
    ...(existingUser || {}),
    ...profile,
    clientKey,
    passwordHash: passwordHash || existingUser?.passwordHash || '',
    createdAt: existingUser?.createdAt || now,
  });

  return {
    ...profile,
    key: userKey,
    clientKey,
  };
}

export async function registerStoreUser({ nombre, telefono, direccion, referencia, password, ubicacion }) {
  const cleanPhone = cleanStorePhone(telefono);
  const userKey = getStoreUserKey(cleanPhone);
  const cleanPassword = String(password || '').trim();

  if (
    !userKey ||
    !String(nombre || '').trim() ||
    !String(direccion || '').trim() ||
    cleanPassword.length < 4 ||
    !hasLocation(ubicacion)
  ) {
    const error = new Error('Datos de registro incompletos');
    error.code = 'REGISTER_INCOMPLETE';
    throw error;
  }

  const userRef = ref(database, `${STORE_USERS_PATH}/${userKey}`);
  const userSnapshot = await get(userRef);
  const existingUser = userSnapshot.val();

  if (existingUser?.passwordHash) {
    const error = new Error('El usuario ya existe');
    error.code = 'USER_EXISTS';
    throw error;
  }

  const passwordHash = await hashStorePassword(cleanPhone, cleanPassword);
  const profile = await ensureStoreUser({
    nombre,
    telefono: cleanPhone,
    direccion,
    referencia,
    ubicacion,
    passwordHash,
  });

  await update(userRef, {
    passwordHash,
    lastLoginAt: Date.now(),
  });

  return sanitizeStoreUser(
    {
      ...profile,
      passwordHash,
    },
    userKey
  );
}

export async function loginStoreUser({ telefono, password }) {
  const cleanPhone = cleanStorePhone(telefono);
  const userKey = getStoreUserKey(cleanPhone);
  const cleanPassword = String(password || '').trim();

  if (!userKey || !cleanPassword) {
    const error = new Error('Credenciales incompletas');
    error.code = 'LOGIN_INCOMPLETE';
    throw error;
  }

  const userRef = ref(database, `${STORE_USERS_PATH}/${userKey}`);
  const userSnapshot = await get(userRef);
  const user = userSnapshot.val();

  if (!user?.passwordHash) {
    const error = new Error('Usuario no encontrado');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const passwordHash = await hashStorePassword(cleanPhone, cleanPassword);
  if (passwordHash !== user.passwordHash) {
    const error = new Error('Contrasena incorrecta');
    error.code = 'INVALID_PASSWORD';
    throw error;
  }

  await update(userRef, {
    lastLoginAt: Date.now(),
  });

  return sanitizeStoreUser(user, userKey);
}

export async function updateStoreUserProfile(user, patch) {
  const currentUser = user || {};
  const nextProfile = await ensureStoreUser({
    nombre: patch.nombre ?? currentUser.nombre,
    telefono: currentUser.telefono,
    direccion: patch.direccion ?? currentUser.direccion,
    referencia: patch.referencia ?? currentUser.referencia,
    ubicacion: patch.ubicacion ?? currentUser.ubicacion,
  });

  const safeUser = sanitizeStoreUser(
    {
      ...currentUser,
      ...nextProfile,
    },
    currentUser.key || getStoreUserKey(currentUser.telefono)
  );

  return {
    ...safeUser,
    hasPassword: currentUser.hasPassword,
  };
}

export async function updateStoreUserPassword(user, password) {
  const cleanPhone = cleanStorePhone(user?.telefono);
  const userKey = user?.key || getStoreUserKey(cleanPhone);
  const cleanPassword = String(password || '').trim();

  if (!userKey || !cleanPhone || cleanPassword.length < 4) {
    const error = new Error('Contrasena incompleta');
    error.code = 'PASSWORD_INCOMPLETE';
    throw error;
  }

  const passwordHash = await hashStorePassword(cleanPhone, cleanPassword);

  await update(ref(database, `${STORE_USERS_PATH}/${userKey}`), {
    passwordHash,
    passwordUpdatedAt: Date.now(),
  });

  return true;
}
