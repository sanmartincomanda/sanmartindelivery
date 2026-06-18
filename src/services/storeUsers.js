import { get, push, ref, set, update } from 'firebase/database';
import { database } from '../firebase';

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

export async function ensureStoreUser({ nombre, telefono, direccion, referencia }) {
  const cleanPhone = cleanStorePhone(telefono);
  const userKey = getStoreUserKey(cleanPhone);

  if (!userKey || !String(nombre || '').trim() || !String(direccion || '').trim()) {
    throw new Error('Datos de cliente incompletos');
  }

  const now = Date.now();
  const userRef = ref(database, `${STORE_USERS_PATH}/${userKey}`);
  const userSnapshot = await get(userRef);
  const existingUser = userSnapshot.val();

  const profile = {
    nombre: String(nombre || '').trim(),
    telefono: cleanPhone,
    direccion: String(direccion || '').trim(),
    referencia: String(referencia || '').trim(),
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
      telefono: profile.telefono,
      origen: 'tienda_virtual',
      updatedAt: now,
    });
  }

  await set(userRef, {
    ...(existingUser || {}),
    ...profile,
    clientKey,
    createdAt: existingUser?.createdAt || now,
  });

  return {
    ...profile,
    key: userKey,
    clientKey,
  };
}
