// Only reads and writes to fixture data. CSP also blocks external connections.
import { mergeStoreBranches } from '../../src/services/storeBranches.js';
import { DEFAULT_STORE_DELIVERY_SETTINGS } from '../../src/services/storeDeliverySettings.js';
export { mergeStoreBranches, getStoreBranchById, getStoreBranchDeliverySettings } from '../../src/services/storeBranches.js';
export { calculateStoreDeliveryQuote, formatStoreDeliveryDistance } from '../../src/services/storeDeliverySettings.js';
export { getProductMinQuantity, getProductQuantityStep, mergeCatalogProducts } from '../../src/services/storeCatalog.js';
export const MANUAL_CHANNEL = 'manual';
export const ORDER_FULFILLMENT_DELIVERY = 'delivery';
export const ORDER_FULFILLMENT_PICKUP = 'pickup';
export const ORDER_FULFILLMENT_ROUTE_SAN_MARTIN = 'ruta_san_martin';
export const formatOrderNumber = (order, branch = 'granada') => order?.orderNumber || `${branch === 'granada' ? 'GR' : 'NI'}-${String(order).padStart(3, '0')}`;
export const subscribeStoreBranches = (callback) => { callback(mergeStoreBranches()); return () => {}; };
export const subscribeStoreDeliverySettings = (callback) => { callback(DEFAULT_STORE_DELIVERY_SETTINGS); return () => {}; };
export const createManualClient = async (client) => ({ ...client, firebaseKey: 'qa-new-client' });
export const getCurrentCatalogMap = async () => ({
  QA001: { code: 'QA001', name: 'Filete de res QA', price: 250, unit: 'lb', active: true, minQuantity: 1, quantityStep: 1 },
});
