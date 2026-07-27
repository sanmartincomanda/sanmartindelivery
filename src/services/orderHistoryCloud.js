import { get, ref } from 'firebase/database';
import { database } from '../firebase';
import {
  getOrderHistoryRetentionStartDate,
  ORDER_HISTORY_CLOUD_PATH,
  sortOrdersByDateAndNumberDesc,
} from './orderArchive';

const CLOUD_HISTORY_READ_BATCH_SIZE = 7;

const formatDateKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;

const parseLocalDate = (value = '') => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
};

const listHistoryDates = (dateFrom, dateTo) => {
  const retentionStart = getOrderHistoryRetentionStartDate();
  const cleanFrom = String(dateFrom || '').trim();
  const cleanTo = String(dateTo || '').trim();
  const start = parseLocalDate(cleanFrom > retentionStart ? cleanFrom : retentionStart);
  const end = parseLocalDate(cleanTo);

  if (!start || !end || start > end) {
    return [];
  }

  const dates = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
};

const splitIntoBatches = (entries, size = CLOUD_HISTORY_READ_BATCH_SIZE) => {
  const batches = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
};

export const mergeOrderHistoryRecords = (...orderGroups) => {
  const merged = new Map();

  orderGroups.flat().forEach((order) => {
    const key = String(order?.firebaseKey || '').trim();
    if (!key) {
      return;
    }
    merged.set(key, order);
  });

  return sortOrdersByDateAndNumberDesc(Array.from(merged.values()));
};

export async function fetchCloudOrderHistoryByDateRange(dateFrom, dateTo) {
  const dates = listHistoryDates(dateFrom, dateTo);
  const orders = [];

  for (const dateBatch of splitIntoBatches(dates)) {
    const snapshots = await Promise.all(
      dateBatch.map((dateKey) => get(ref(database, `${ORDER_HISTORY_CLOUD_PATH}/${dateKey}`)))
    );

    snapshots.forEach((snapshot) => {
      Object.entries(snapshot.val() || {}).forEach(([firebaseKey, order]) => {
        orders.push({
          firebaseKey,
          archivedSource: order?.archivedSource || 'orders',
          ...order,
        });
      });
    });
  }

  return sortOrdersByDateAndNumberDesc(orders);
}
