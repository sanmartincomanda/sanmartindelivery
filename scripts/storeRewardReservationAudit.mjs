import { get, orderByChild, query, ref, startAt } from 'firebase/database';
import {
  getStoreRewardTransactionKey,
  linkRewardReservationToOrder,
  STORE_REWARD_ACCOUNTS_PATH,
  STORE_REWARD_TRANSACTIONS_PATH,
} from '../src/services/storeRewards.js';
import { ORDER_HISTORY_CLOUD_PATH, ORDER_ORIGINALS_PATH } from '../src/services/orderArchive.js';

const STALE_HOLD_MS = 15 * 60 * 1000;
const REVIEW_RECHECK_MS = 6 * 60 * 60 * 1000;
const dayKey = (timestamp) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(timestamp));
const reservationKey = (userKey, reservationId) => `${userKey}/${reservationId}`;

// Missing from live orders is NOT proof of abandonment: orders move to history.
// Only the confirmed cancellation flow may refund. Unresolved holds are audited.
export async function auditStoreRewardReservations({
  databaseInstance, now = Date.now(), startDate = '', reviewCache = new Map(),
}) {
  const read = async (path) => (await get(ref(databaseInstance, path))).val();
  const accounts = await read(STORE_REWARD_ACCOUNTS_PATH);
  const result = { inspected: 0, protected: 0, linked: 0, reviewCount: 0, review: [], released: 0 };
  const pending = [];
  const retainedCacheKeys = new Set();
  const flagForReview = (entry, reason) => {
    result.reviewCount++;
    if (result.review.length < 25) result.review.push({ ...entry, reason });
  };
  for (const [userKey, account] of Object.entries(accounts || {})) {
    for (const [reservationId, hold] of Object.entries(account?.holds || {})) {
      const requestedAt = Number(hold?.requestedAt || 0);
      if (requestedAt && now - requestedAt < STALE_HOLD_MS) continue;
      result.inspected++;
      if (hold?.orderKey && account.pendingReservationId !== reservationId) {
        result.protected++;
      } else {
        const entry = {
          userKey, reservationId, requestedAt,
          ...(hold?.orderKey ? { knownOrder: { orderKey: hold.orderKey, orderDate: hold.orderDate || '' } } : {}),
        };
        const key = reservationKey(userKey, reservationId);
        retainedCacheKeys.add(key);
        const cached = reviewCache.get(key);
        if (cached && now - cached.checkedAt < REVIEW_RECHECK_MS) {
          flagForReview(entry, cached.reason);
        } else {
          pending.push(entry);
        }
      }
    }
  }
  for (const key of reviewCache.keys()) {
    if (!retainedCacheKeys.has(key)) reviewCache.delete(key);
  }
  if (!pending.length) return result;

  const links = new Map();
  const conflicts = new Set();
  const indexOrders = (orders) => {
    for (const [orderKey, order] of Object.entries(orders || {})) {
      if (order?.canal !== 'tienda_virtual' || !order?.storeUserKey || !order?.rewardRedemption?.reservationId) continue;
      const key = reservationKey(order.storeUserKey, order.rewardRedemption.reservationId);
      if (links.has(key) && links.get(key).orderKey !== orderKey) conflicts.add(key);
      links.set(key, {
        orderKey, orderNumber: order.id || 0, orderDate: order.fecha || '',
      });
    }
  };
  if (pending.some((entry) => !entry.knownOrder)) {
    const liveRef = ref(databaseInstance, 'orders');
    indexOrders((await get(query(liveRef, orderByChild('fecha'), startAt(startDate || dayKey(now - 60 * 86400000))))).val());
  }
  const checkedDays = new Set();

  for (const entry of pending) {
    const key = reservationKey(entry.userKey, entry.reservationId);
    let link = entry.knownOrder || links.get(key);
    if (!link) {
      const transaction = await read(`${STORE_REWARD_TRANSACTIONS_PATH}/${entry.userKey}/${getStoreRewardTransactionKey(entry.reservationId)}`);
      if (transaction?.orderKey) {
        link = { orderKey: transaction.orderKey, orderNumber: transaction.orderNumber || 0, orderDate: transaction.orderDate || '' };
      }
    }
    if (!link && Number.isFinite(entry.requestedAt) && entry.requestedAt > 0) {
      // Legacy clients had no durable link. Read only the reservation day and
      // the following day (midnight checkout), once per pass, not 60 days/user.
      for (const date of [dayKey(entry.requestedAt), dayKey(entry.requestedAt + 86400000)]) {
        if (date > dayKey(now)) continue;
        if (!checkedDays.has(date)) {
          indexOrders(await read(`${ORDER_HISTORY_CLOUD_PATH}/${date}`));
          indexOrders(await read(`${ORDER_ORIGINALS_PATH}/${date}`));
          checkedDays.add(date);
        }
        link = links.get(key);
        if (link) break;
      }
    }
    if (link && !conflicts.has(key)) {
      const linked = await linkRewardReservationToOrder({ ...entry, ...link, databaseInstance });
      if (linked.linked) {
        result.protected++;
        result.linked++;
        reviewCache.delete(key);
        continue;
      }
      if (linked.reason === 'hold_missing') continue; // Settled concurrently.
    }
    const reason = link ? 'order_conflict' : 'order_not_verified';
    reviewCache.set(key, { reason, checkedAt: now });
    flagForReview(entry, reason);
  }
  return result;
}
