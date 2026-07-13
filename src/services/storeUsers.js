import { equalTo, get, orderByChild, push, query, ref, set, update } from 'firebase/database';
import { database } from '../firebase';
import { hasLocation, normalizeLocation } from './geo';
import {
  buildStoreCustomerEmail,
  createStoreCustomerAuth,
  getCurrentAuthUser,
  normalizeAuthEmail,
  sendStoreCustomerPasswordReset,
  signInStoreCustomer,
  signInStoreCustomerWithGoogle,
  touchLastLogin,
  upsertOwnClientRole,
} from './authRoles';
import { normalizeBirthdayValue } from './customerBirthday';
import { setClientDirectoryEntry } from './clientDirectory';
import { ensureStoreWelcomeCouponForUser } from './storeWelcomeCoupon';

export const STORE_USERS_PATH = 'storeUsers';

export const cleanStorePhone = (phone) => String(phone || '').replace(/[^\d+]/g, '').trim();
export const cleanStoreEmail = (email) => normalizeAuthEmail(email);

export const getStoreUserKey = (phone) => {
  const cleanPhone = cleanStorePhone(phone);
  return cleanPhone.replace(/[.#$/[\]]/g, '_');
};

const normalizeCodeText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const buildClientCodeBase = (name, phone, uid = '') => {
  const digits = cleanStorePhone(phone).replace(/\D/g, '');
  const nameToken = normalizeCodeText(name);
  const initial = nameToken.charAt(0) || 'X';
  const uidSuffix = normalizeCodeText(uid).slice(0, 4);
  return `TV-${digits.slice(-4) || 'WEB'}${initial}${uidSuffix ? `-${uidSuffix}` : ''}`;
};

const isLegacyClientCode = (code = '') => /^TV-(WEB|\d{1,4})$/i.test(String(code || '').trim());

const resolveUniqueClientCode = async ({ name, phone, currentUserKey = '', currentCode = '' }) => {
  const normalizedCurrentCode = String(currentCode || '').trim().toUpperCase();
  if (normalizedCurrentCode && !isLegacyClientCode(normalizedCurrentCode)) {
    return normalizedCurrentCode;
  }

  const baseCode = buildClientCodeBase(name, phone, currentUserKey);

  if (currentUserKey && !isLegacyClientCode(baseCode)) {
    return baseCode;
  }

  const snapshot = await get(ref(database, STORE_USERS_PATH));
  const usedCodes = new Set();

  Object.entries(snapshot.val() || {}).forEach(([userKey, value]) => {
    if (userKey === currentUserKey) {
      return;
    }

    const code = String(value?.codigo || '')
      .trim()
      .toUpperCase();
    if (code) {
      usedCodes.add(code);
    }
  });

  if (!usedCodes.has(baseCode)) {
    return baseCode;
  }

  let suffix = 2;
  let candidate = `${baseCode}-${suffix}`;
  while (usedCodes.has(candidate)) {
    suffix += 1;
    candidate = `${baseCode}-${suffix}`;
  }

  return candidate;
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

const getStoreUserRecordByAuthUid = async (authUid = '') => {
  const cleanAuthUid = String(authUid || '').trim();
  if (!cleanAuthUid) {
    return null;
  }

  const snapshot = await get(ref(database, `${STORE_USERS_PATH}/${cleanAuthUid}`));
  if (!snapshot.exists()) {
    return null;
  }

  return {
    key: cleanAuthUid,
    value: snapshot.val(),
  };
};

const getStoreUserRecordByPhone = async (phone = '') => {
  const cleanPhone = cleanStorePhone(phone);
  if (!cleanPhone) {
    return null;
  }

  const snapshot = await get(query(ref(database, STORE_USERS_PATH), orderByChild('telefono'), equalTo(cleanPhone)));
  const [entry] = Object.entries(snapshot.val() || {});
  if (!entry) {
    return null;
  }

  const [key, value] = entry;
  return { key, value };
};

const getStoreUserRecordByEmail = async (email = '') => {
  const cleanEmail = cleanStoreEmail(email);
  if (!cleanEmail) {
    return null;
  }

  const snapshot = await get(query(ref(database, STORE_USERS_PATH), orderByChild('email'), equalTo(cleanEmail)));
  const [entry] = Object.entries(snapshot.val() || {});
  if (!entry) {
    return null;
  }

  const [key, value] = entry;
  return { key, value };
};

const getStoreUserRecordByContact = async ({ email = '', telefono = '' } = {}) => {
  const byPhone = await getStoreUserRecordByPhone(telefono);
  if (byPhone) {
    return byPhone;
  }

  return getStoreUserRecordByEmail(email);
};

const upsertStoreUserAtAuthUid = async (authUid, sourceValue = {}) => {
  const cleanAuthUid = String(authUid || '').trim();
  if (!cleanAuthUid || !sourceValue || typeof sourceValue !== 'object') {
    return null;
  }

  const now = Date.now();
  const { welcomeCoupon: _ignoredWelcomeCoupon, ...sourceProfile } = sourceValue || {};
  const nextValue = {
    ...sourceProfile,
    authUid: cleanAuthUid,
    updatedAt: now,
    lastLoginAt: now,
  };

  await set(ref(database, `${STORE_USERS_PATH}/${cleanAuthUid}`), nextValue);

  return {
    key: cleanAuthUid,
    value: nextValue,
  };
};

const resolveWelcomeCouponForStoreUser = async ({ userKey, phone, name }) => {
  try {
    return await ensureStoreWelcomeCouponForUser({
      userKey,
      phone,
      name,
    });
  } catch (error) {
    console.warn('No se pudo resolver el cupon de bienvenida del cliente.', error);
    return null;
  }
};

export async function ensureStoreUser({
  nombre,
  email,
  telefono,
  direccion,
  referencia,
  fechaCumpleanos,
  fechaNacimiento,
  passwordHash,
  ubicacion,
  authUid,
}) {
  const cleanPhone = cleanStorePhone(telefono);
  const cleanEmail = cleanStoreEmail(email);
  const userKey = String(authUid || getCurrentAuthUser()?.uid || '').trim() || getStoreUserKey(cleanPhone);

  if (!userKey || !String(nombre || '').trim() || !cleanPhone || !String(direccion || '').trim()) {
    throw new Error('Datos de cliente incompletos');
  }

  const now = Date.now();
  const userRef = ref(database, `${STORE_USERS_PATH}/${userKey}`);
  const userSnapshot = await get(userRef);
  const existingUser = userSnapshot.val();
  const normalizedLocation = normalizeLocation(ubicacion) || normalizeLocation(existingUser?.ubicacion);
  const normalizedBirthday = normalizeBirthdayValue(
    fechaCumpleanos || fechaNacimiento || existingUser?.fechaCumpleanos || existingUser?.fechaNacimiento
  );

  if (!hasLocation(normalizedLocation)) {
    const error = new Error('Ubicacion exacta requerida');
    error.code = 'LOCATION_REQUIRED';
    throw error;
  }

  const resolvedClientCode = await resolveUniqueClientCode({
    name: nombre,
    phone: cleanPhone,
    currentUserKey: userKey,
    currentCode: existingUser?.codigo,
  });

  const profile = {
    nombre: String(nombre || '').trim(),
    email: cleanEmail,
    telefono: cleanPhone,
    direccion: String(direccion || '').trim(),
    referencia: String(referencia || '').trim(),
    fechaCumpleanos: normalizedBirthday,
    ubicacion: normalizedLocation,
    codigo: resolvedClientCode,
    updatedAt: now,
  };

  let clientKey = existingUser?.clientKey || null;
  let clientPayload = null;
  if (!clientKey) {
    const newClientRef = push(ref(database, 'clients'));
    clientKey = newClientRef.key;
    clientPayload = {
      nombre: profile.nombre,
      codigo: profile.codigo,
      direccion: profile.referencia
        ? `${profile.direccion} | Ref: ${profile.referencia}`
        : profile.direccion,
      ubicacion: profile.ubicacion,
      telefono: profile.telefono,
      email: profile.email,
      fechaCumpleanos: profile.fechaCumpleanos,
      origen: 'tienda_virtual',
      storeUserKey: userKey,
      createdAt: now,
    };
    await set(newClientRef, clientPayload);
  } else {
    clientPayload = {
      nombre: profile.nombre,
      codigo: profile.codigo,
      direccion: profile.referencia
        ? `${profile.direccion} | Ref: ${profile.referencia}`
        : profile.direccion,
      ubicacion: profile.ubicacion,
      telefono: profile.telefono,
      email: profile.email,
      fechaCumpleanos: profile.fechaCumpleanos,
      origen: 'tienda_virtual',
      storeUserKey: userKey,
      updatedAt: now,
    };
    await update(ref(database, `clients/${clientKey}`), clientPayload);
  }

  await setClientDirectoryEntry(clientKey, {
    ...clientPayload,
    createdByRole: 'client',
    updatedAt: now,
  });

  await set(userRef, {
    ...(existingUser || {}),
    ...profile,
    clientKey,
    passwordHash: passwordHash || existingUser?.passwordHash || '',
    authUid: userKey,
    createdAt: existingUser?.createdAt || now,
  });

  return {
    ...profile,
    key: userKey,
    clientKey,
  };
}

export async function registerStoreUser({ nombre, email, telefono, direccion, referencia, fechaCumpleanos, password, ubicacion }) {
  return registerStoreUserWithEmail({ nombre, email, telefono, direccion, referencia, fechaCumpleanos, password, ubicacion });
}

export async function registerStoreUserWithEmail({
  nombre,
  email,
  telefono,
  direccion,
  referencia,
  fechaCumpleanos,
  password,
  ubicacion,
}) {
  const cleanEmail = cleanStoreEmail(email);
  const cleanPhone = cleanStorePhone(telefono);
  const userKey = getStoreUserKey(cleanPhone);
  const cleanPassword = String(password || '').trim();

  if (
    !cleanEmail ||
    !userKey ||
    !String(nombre || '').trim() ||
    !String(direccion || '').trim() ||
    cleanPassword.length < 6 ||
    !hasLocation(ubicacion)
  ) {
    const error = new Error('Datos de registro incompletos');
    error.code = 'REGISTER_INCOMPLETE';
    throw error;
  }

  let authUser = null;
  try {
    authUser = await createStoreCustomerAuth({ nombre, email: cleanEmail, telefono: cleanPhone, password: cleanPassword });
  } catch (error) {
    if (error.code === 'auth/email-already-in-use') {
      try {
        authUser = await signInStoreCustomer({
          email: cleanEmail,
          telefono: cleanPhone,
          password: cleanPassword,
        });
      } catch (signInError) {
        const userExistsError = new Error('El correo ya tiene cuenta');
        userExistsError.code = 'USER_EXISTS';
        throw userExistsError;
      }
    } else {
      throw error;
    }
  }

  const authUserKey = authUser.uid;
  await upsertOwnClientRole(authUserKey, { nombre, email: cleanEmail, telefono: cleanPhone });

  const passwordHash = await hashStorePassword(cleanPhone, cleanPassword);
  const profile = await ensureStoreUser({
    nombre,
    email: cleanEmail,
    telefono: cleanPhone,
    direccion,
    referencia,
    fechaCumpleanos,
    ubicacion,
    passwordHash,
    authUid: authUserKey,
  });

  await update(ref(database, `${STORE_USERS_PATH}/${authUserKey}`), {
    passwordHash,
    lastLoginAt: Date.now(),
  });

  const welcomeCoupon = await resolveWelcomeCouponForStoreUser({
    userKey: authUserKey,
    phone: cleanPhone,
    name: nombre,
  });

  return sanitizeStoreUser(
    {
      ...profile,
      welcomeCoupon,
      passwordHash,
    },
    authUserKey
  );
}

export async function loginStoreUser({ email, telefono, password }) {
  return loginStoreUserWithEmail({ email, telefono, password });
}

export async function requestStorePasswordReset({ email, telefono }) {
  let cleanEmail = cleanStoreEmail(email);
  const cleanPhone = cleanStorePhone(telefono);

  if (!cleanEmail && cleanPhone) {
    const contactRecord = await getStoreUserRecordByPhone(cleanPhone);
    cleanEmail = cleanStoreEmail(contactRecord?.value?.email);
  }

  if (!cleanEmail) {
    const error = new Error('Correo requerido');
    error.code = 'EMAIL_REQUIRED';
    throw error;
  }

  await sendStoreCustomerPasswordReset({ email: cleanEmail, telefono: cleanPhone });
  return true;
}

export async function loginStoreUserWithEmail({ email, telefono, password }) {
  const cleanEmail = cleanStoreEmail(email);
  const cleanPhone = cleanStorePhone(telefono);
  const cleanPassword = String(password || '').trim();

  if (!cleanEmail && !cleanPhone) {
    const error = new Error('Correo requerido');
    error.code = 'LOGIN_INCOMPLETE';
    throw error;
  }

  if (!cleanPassword) {
    const error = new Error('Credenciales incompletas');
    error.code = 'LOGIN_INCOMPLETE';
    throw error;
  }

  let authUser = null;
  let contactRecord = null;

  try {
    authUser = await signInStoreCustomer({ email: cleanEmail, telefono: cleanPhone, password: cleanPassword });
  } catch (primaryError) {
    contactRecord = await getStoreUserRecordByContact({ email: cleanEmail, telefono: cleanPhone });

    const fallbackPhone = cleanPhone || cleanStorePhone(contactRecord?.value?.telefono);
    const fallbackEmail = cleanEmail || cleanStoreEmail(contactRecord?.value?.email);
    const aliasEmailFromPhone = fallbackPhone ? buildStoreCustomerEmail(fallbackPhone) : '';
    const alternateEmail =
      fallbackEmail && fallbackEmail !== aliasEmailFromPhone ? fallbackEmail : '';

    try {
      if (cleanEmail && fallbackPhone) {
        authUser = await signInStoreCustomer({
          telefono: fallbackPhone,
          password: cleanPassword,
        });
      } else if (cleanPhone && alternateEmail) {
        authUser = await signInStoreCustomer({
          email: alternateEmail,
          password: cleanPassword,
        });
      } else {
        throw primaryError;
      }
    } catch (fallbackError) {
      throw primaryError;
    }
  }

  const authUserKey = authUser.uid;
  await touchLastLogin(authUserKey);

  let authUserRecord = await getStoreUserRecordByAuthUid(authUserKey);
  if (!authUserRecord) {
    contactRecord = contactRecord || (await getStoreUserRecordByContact({ email: cleanEmail, telefono: cleanPhone }));
    if (contactRecord?.value) {
      authUserRecord = await upsertStoreUserAtAuthUid(authUserKey, contactRecord.value);
    }
  }

  if (!authUserRecord?.value) {
    const error = new Error('Perfil incompleto');
    error.code = 'PROFILE_REQUIRED';
    error.authUser = {
      uid: authUserKey,
      email: cleanEmail || cleanStoreEmail(authUser.email),
      telefono: cleanPhone,
      nombre: String(authUser.displayName || '').trim(),
    };
    throw error;
  }

  await update(ref(database, `${STORE_USERS_PATH}/${authUserKey}`), {
    lastLoginAt: Date.now(),
  });

  const welcomeCoupon = await resolveWelcomeCouponForStoreUser({
    userKey: authUserKey,
    phone: authUserRecord.value?.telefono || cleanPhone,
    name: authUserRecord.value?.nombre,
  });

  return sanitizeStoreUser(
    {
      ...authUserRecord.value,
      welcomeCoupon,
    },
    authUserKey
  );
}

export async function loginStoreUserWithGoogle() {
  const authUser = await signInStoreCustomerWithGoogle();
  const authUserKey = authUser.uid;
  const userRef = ref(database, `${STORE_USERS_PATH}/${authUserKey}`);
  const userSnapshot = await get(userRef);
  const user = userSnapshot.val();

  if (!user) {
    await upsertOwnClientRole(authUserKey, {
      nombre: authUser.displayName,
      email: authUser.email,
      provider: 'google',
    });

    const error = new Error('Perfil incompleto');
    error.code = 'PROFILE_REQUIRED';
    error.authUser = {
      uid: authUser.uid,
      nombre: authUser.displayName || '',
      email: authUser.email || '',
    };
    throw error;
  }

  await upsertOwnClientRole(authUserKey, {
    nombre: user.nombre || authUser.displayName,
    email: user.email || authUser.email,
    telefono: user.telefono,
    provider: 'google',
  });

  await update(userRef, {
    email: user.email || cleanStoreEmail(authUser.email),
    lastLoginAt: Date.now(),
  });

  const welcomeCoupon = await resolveWelcomeCouponForStoreUser({
    userKey: authUserKey,
    phone: user.telefono,
    name: user.nombre || authUser.displayName,
  });

  return sanitizeStoreUser(
    {
      ...user,
      email: user.email || cleanStoreEmail(authUser.email),
      welcomeCoupon,
    },
    authUserKey
  );
}

export async function completeExistingStoreUserProfile({
  nombre,
  email,
  telefono,
  direccion,
  referencia,
  fechaCumpleanos,
  ubicacion,
  provider = 'google',
}) {
  const authUser = getCurrentAuthUser();
  if (!authUser) {
    const error = new Error('Sesion de Google no encontrada');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const cleanEmail = cleanStoreEmail(email || authUser.email);
  const cleanPhone = cleanStorePhone(telefono);

  await upsertOwnClientRole(authUser.uid, {
    nombre: nombre || authUser.displayName,
    email: cleanEmail,
    telefono: cleanPhone,
    provider: String(provider || 'password').trim() || 'password',
  });

  const profile = await ensureStoreUser({
    nombre: nombre || authUser.displayName,
    email: cleanEmail,
    telefono: cleanPhone,
    direccion,
    referencia,
    fechaCumpleanos,
    ubicacion,
    authUid: authUser.uid,
  });

  await update(ref(database, `${STORE_USERS_PATH}/${authUser.uid}`), {
    lastLoginAt: Date.now(),
  });

  const welcomeCoupon = await resolveWelcomeCouponForStoreUser({
    userKey: authUser.uid,
    phone: cleanPhone,
    name: nombre || authUser.displayName,
  });

  return sanitizeStoreUser(
    {
      ...profile,
      welcomeCoupon,
    },
    authUser.uid
  );
}

export const completeGoogleStoreUserProfile = (payload = {}) =>
  completeExistingStoreUserProfile({
    ...(payload || {}),
    provider: 'google',
  });

export async function updateStoreUserProfile(user, patch) {
  const currentUser = user || {};
  const nextProfile = await ensureStoreUser({
    nombre: patch.nombre ?? currentUser.nombre,
    email: patch.email ?? currentUser.email,
    telefono: currentUser.telefono,
    direccion: patch.direccion ?? currentUser.direccion,
    referencia: patch.referencia ?? currentUser.referencia,
    fechaCumpleanos: patch.fechaCumpleanos ?? currentUser.fechaCumpleanos ?? currentUser.fechaNacimiento,
    ubicacion: patch.ubicacion ?? currentUser.ubicacion,
    authUid: currentUser.key || getCurrentAuthUser()?.uid,
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
