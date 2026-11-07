import { ref, set } from 'firebase/database';
import { database } from '../firebase';
import { getCurrentAuthUser, revokeStoreAppleAccessForDeletion } from './authRoles';

export const STORE_PRIVACY_URL = 'https://tienda.sanmartinsr.com/privacidad';
export const STORE_ACCOUNT_DELETION_URL = 'https://tienda.sanmartinsr.com/eliminar-cuenta';
export const STORE_SUPPORT_EMAIL = 'carnessanmartingranada1@gmail.com';
export const STORE_ACCOUNT_DELETION_REQUESTS_PATH = 'storeAccountDeletionRequests';

export async function requestStoreAccountDeletion(user = {}, reason = '') {
  const authUser = getCurrentAuthUser();
  const uid = String(user?.key || authUser?.uid || '').trim();

  if (!authUser?.uid || !uid || authUser.uid !== uid) {
    const error = new Error('Debes iniciar sesion nuevamente para solicitar la eliminacion.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const appleAccessRevoked = await revokeStoreAppleAccessForDeletion(authUser);
  if (getCurrentAuthUser()?.uid !== uid) {
    throw Object.assign(new Error('La sesion cambio. Inicia sesion nuevamente.'), { code: 'AUTH_REQUIRED' });
  }
  const now = Date.now();
  const payload = {
    uid,
    status: 'pending',
    requestedAt: now,
    updatedAt: now,
    name: String(user?.nombre || authUser.displayName || '').trim(),
    email: String(user?.email || authUser.email || '').trim().toLowerCase(),
    phone: String(user?.telefono || '').trim(),
    customerCode: String(user?.codigo || '').trim(),
    reason: String(reason || '').trim().slice(0, 500),
    source: 'store_app',
    ...(appleAccessRevoked ? { appleAccessRevokedAt: now } : {}),
  };

  await set(ref(database, `${STORE_ACCOUNT_DELETION_REQUESTS_PATH}/${uid}`), payload);
  return payload;
}
