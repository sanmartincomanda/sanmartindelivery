import { ref, update } from 'firebase/database';
import { database } from '../firebase';
import { normalizeStoreCustomerDiscount } from './storeDiscounts';
import { STORE_USERS_PATH } from './storeUsers';

export const saveStoreCustomerDiscount = async ({
  userKey,
  active = true,
  percent = 0,
  label = 'Descuento especial',
  updatedBy = 'admin',
} = {}) => {
  const cleanUserKey = String(userKey || '').trim();
  if (!cleanUserKey) {
    throw new Error('Selecciona un cliente.');
  }

  const normalized = normalizeStoreCustomerDiscount({
    active,
    percent,
    label,
    updatedAt: Date.now(),
    updatedBy,
  });

  await update(ref(database, `${STORE_USERS_PATH}/${cleanUserKey}`), {
    customerDiscount: normalized,
    updatedAt: Date.now(),
  });

  return normalized;
};
