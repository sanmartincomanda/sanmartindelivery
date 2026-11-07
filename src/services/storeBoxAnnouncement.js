import { isBoxProduct } from './storeBoxSales.js';

export const BOX_ANNOUNCEMENT_ID = 'box_sales_launch_v1';
export const BOX_ANNOUNCEMENT_LIMIT = 10;
export const BOX_ANNOUNCEMENT_STORAGE_KEY = 'sanmartin_box_sales_launch_v1';
export const BOX_HOME_SECTION_ID = 'store-home-box-sales';

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Managua', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function boxAnnouncementDay(now = Date.now()) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(now)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// Unique dates make guest/account merges idempotent and keep the record bounded.
export function mergeBoxAnnouncementHistory(...records) {
  const days = [...new Set(records.flatMap(record => Object.keys(record?.days || {})
    .filter(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && record.days[day] === true)))].sort();
  return {
    count: Math.min(days.length, BOX_ANNOUNCEMENT_LIMIT),
    days: Object.fromEntries(days.slice(-BOX_ANNOUNCEMENT_LIMIT).map(day => [day, true])),
  };
}

export function canShowBoxAnnouncement(record, now = Date.now()) {
  const days = Object.keys(mergeBoxAnnouncementHistory(record).days);
  const today = boxAnnouncementDay(now);
  return days.length < BOX_ANNOUNCEMENT_LIMIT && !days.some(day => day >= today);
}

export function nextBoxAnnouncementHistory(record, now = Date.now()) {
  if (!canShowBoxAnnouncement(record, now)) return undefined;
  return mergeBoxAnnouncementHistory(record, { days: { [boxAnnouncementDay(now)]: true } });
}

export function getBoxAnnouncementProducts(products = []) {
  return products.filter(product => isBoxProduct(product) && product.active !== false && product.image &&
    (product.inventory == null || Number(product.inventory) > 0));
}
