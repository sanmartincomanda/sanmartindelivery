import { push, ref, remove, set, update } from 'firebase/database';
import { database } from '../firebase';
import { normalizeLocation } from './geo';

export const CLIENT_DIRECTORY_PATH = 'clientDirectory';

const cleanText = (value = '') => String(value || '').trim();

export const normalizeClientDirectoryEntry = (client = {}) => {
  const location = normalizeLocation(client.ubicacion || client.location);

  return {
    nombre: cleanText(client.nombre),
    codigo: cleanText(client.codigo),
    direccion: cleanText(client.direccion),
    telefono: cleanText(client.telefono),
    ubicacion: location || null,
    origen: cleanText(client.origen) || 'manual',
    storeUserKey: cleanText(client.storeUserKey),
    createdByRole: cleanText(client.createdByRole),
    updatedAt: Number(client.updatedAt || Date.now()),
  };
};

export const buildClientDirectoryRootUpdate = (clientKey, client = {}) => ({
  [`${CLIENT_DIRECTORY_PATH}/${clientKey}`]: normalizeClientDirectoryEntry(client),
});

export async function setClientDirectoryEntry(clientKey, client = {}) {
  const cleanKey = cleanText(clientKey);
  if (!cleanKey) {
    return;
  }

  await set(ref(database, `${CLIENT_DIRECTORY_PATH}/${cleanKey}`), normalizeClientDirectoryEntry(client));
}

export async function removeClientDirectoryEntry(clientKey) {
  const cleanKey = cleanText(clientKey);
  if (!cleanKey) {
    return;
  }

  await remove(ref(database, `${CLIENT_DIRECTORY_PATH}/${cleanKey}`));
}

export async function createManualClient(client = {}) {
  const now = Date.now();
  const clientRef = push(ref(database, 'clients'));
  const clientKey = clientRef.key;
  const clientData = {
    nombre: cleanText(client.nombre),
    codigo: cleanText(client.codigo),
    direccion: cleanText(client.direccion),
    telefono: cleanText(client.telefono),
    ubicacion: normalizeLocation(client.ubicacion) || null,
    origen: cleanText(client.origen) || 'manual',
    createdByRole: cleanText(client.createdByRole) || 'operator',
    createdAt: now,
    updatedAt: now,
  };

  await update(ref(database), {
    [`clients/${clientKey}`]: clientData,
    ...buildClientDirectoryRootUpdate(clientKey, clientData),
  });

  return {
    firebaseKey: clientKey,
    ...clientData,
  };
}
