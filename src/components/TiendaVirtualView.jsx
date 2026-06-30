import React, { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { equalTo, get, orderByChild, query as databaseQuery, ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  QUICK_WEIGHTS,
  STORE_PAYMENT_OPTIONS,
} from '../data/tiendaVirtual';
import { STORE_SUBCATEGORY_CANONICALS } from '../data/storeSubcategoryRules';
import {
  compareCatalogProducts,
  getProductMinQuantity,
  getProductQuantityStep,
  isUnitMeasure,
  mergeCatalogProducts,
  STORE_CATALOG_PATH,
  STORE_CATALOG_META_PATH,
} from '../services/storeCatalog';
import {
  mergeStoreCategories,
  STORE_CATEGORIES_PATH,
} from '../services/storeCategories';
import {
  calculateCouponDiscount,
  mergeStoreCoupons,
  normalizeStoreCoupon,
  normalizeCouponUsageLimit,
  normalizeCouponCode,
  STORE_COUPONS_PATH,
} from '../services/storeCoupons';
import {
  isStorePromotionVisible,
  mergeStorePromotions,
  STORE_PROMOTIONS_PATH,
} from '../services/storePromotions';
import {
  readStoreJsonCache,
  STORE_CATALOG_CACHE_KEY,
  STORE_CATALOG_CACHE_VERSION,
  STORE_CATEGORIES_CACHE_KEY,
  STORE_CATEGORIES_CACHE_VERSION,
  STORE_COUPONS_CACHE_KEY,
  STORE_COUPONS_CACHE_VERSION,
  STORE_PROMOTIONS_CACHE_KEY,
  STORE_PROMOTIONS_CACHE_VERSION,
  unwrapStoreCache,
  writeStoreVersionedCache,
} from '../services/storeCache';
import {
  buildGoogleMapsAddressUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsPlaceUrl,
  getBrowserLocation,
  hasLocation,
  normalizeLocation,
  reverseGeocodeLocation,
  searchLocationCandidates,
} from '../services/geo';
import {
  calculateStoreDeliveryQuote,
  DEFAULT_STORE_DELIVERY_SETTINGS,
  formatStoreDeliveryDistance,
  subscribeStoreDeliverySettings,
} from '../services/storeDeliverySettings';
import {
  claimStoreWelcomeCoupon,
  getStoreWelcomeCouponEffectiveStatus,
  normalizeStoreWelcomeCoupon,
  STORE_WELCOME_COUPON_AMOUNT,
  STORE_WELCOME_COUPON_MINIMUM,
} from '../services/storeWelcomeCoupon';
import {
  formatBirthdayInputValue,
  normalizeBirthdayInput,
  normalizeBirthdayValue,
} from '../services/customerBirthday';
import {
  cleanStorePhone,
  completeGoogleStoreUserProfile,
  loginStoreUserWithGoogle,
  loginStoreUser,
  registerStoreUser,
  requestStorePasswordReset,
  updateStoreUserProfile,
} from '../services/storeUsers';
import {
  isPickupOrder,
  ORDER_FULFILLMENT_DELIVERY,
  ORDER_FULFILLMENT_PICKUP,
  subscribeOrdersForStoreUser,
  formatOrderNumber,
  formatWeight,
  STORE_CHANNEL,
} from '../services/orders';
import { STORE_COUPON_ARCHIVE_USAGE_PATH } from '../services/orderArchive';
import { onFirebaseAuthChange, signOutCurrentUser } from '../services/authRoles';
import StoreRewardsSheet, { StoreRewardsSummaryCard } from './StoreRewardsSheet';
import {
  buildStoreRewardRedemptionSnapshot,
  calculateEarnedRewardPoints,
  DEFAULT_STORE_REWARD_SETTINGS,
  mergeStoreRewards,
  normalizeStoreRewardAccount,
  reserveStoreRewardPoints,
  subscribeStoreRewardAccount,
  subscribeStoreRewardSettings,
  subscribeStoreRewardTransactions,
  subscribeStoreRewards,
} from '../services/storeRewards';
import { SAN_MARTIN_STORE_CSS_VARS, SAN_MARTIN_THEME } from '../styles/sanMartinTheme';

const LOGO_PATH = '/tienda/branding/logo-mark.svg';
const STORE_BRAND_TITLE = 'Delivery Carnes San Martin Granada';
const STORE_THEME = SAN_MARTIN_THEME;
const STORE_SESSION_KEY = 'sanmartin_store_user';
const STORE_WHATSAPP_NUMBER = '50584657949';
const ORDER_PROGRESS_STEPS = [
  { key: 'preparando', label: 'Preparando', icon: 'prep' },
  { key: 'en_camino', label: 'En camino', icon: 'driver' },
  { key: 'entregado', label: 'Entregado', icon: 'done' },
];
const PICKUP_ORDER_PROGRESS_STEPS = [
  { key: 'preparando', label: 'Preparando', icon: 'prep' },
  { key: 'pickup', label: 'Pickup listo', icon: 'pickup' },
  { key: 'entregado', label: 'Recogido', icon: 'done' },
];
const MAP_PICKER_DEFAULT_LOCATION = normalizeLocation({
  lat: 11.9299,
  lng: -85.956,
  label: 'Granada, Nicaragua',
});
const MAP_PICKER_TILE_SIZE = 256;
const MAP_PICKER_WIDTH = 360;
const MAP_PICKER_HEIGHT = 260;
const QUANTITY_EPSILON = 0.00001;
const STORE_STORY_DURATION_MS = 10000;
const STORE_GROUP_PAGE_SIZE = 5;
const STORE_CASH_PAYMENT = 'EFECTIVO';
const EMPTY_STORE_AUTH_FORM = {
  nombre: '',
  email: '',
  telefono: '',
  fechaCumpleanos: '',
  password: '',
  confirmPassword: '',
  direccion: '',
  referencia: '',
  ubicacion: null,
};

const resolveStoreLoginCredentials = (value = '') => {
  const cleanValue = String(value || '').trim();

  if (!cleanValue) {
    return { email: '', telefono: '' };
  }

  return cleanValue.includes('@')
    ? { email: cleanValue, telefono: '' }
    : { email: '', telefono: cleanValue };
};

const normalizeCheckoutPayment = (value) => {
  const cleanValue = String(value || '').trim().toUpperCase();

  if (cleanValue.includes('EFECTIVO')) return 'EFECTIVO';
  if (cleanValue.includes('TRANSFER')) return 'TRANSFERENCIA';
  if (cleanValue.includes('LINK')) return 'LINK DE PAGO';
  if (cleanValue.includes('TARJETA') || cleanValue.includes('POS')) return 'TARJETA';

  return STORE_CASH_PAYMENT;
};

const getBirthdayFieldValue = (value = '') => formatBirthdayInputValue(value) || normalizeBirthdayInput(value);

const getPaymentMeta = (payment) => {
  const value = normalizeCheckoutPayment(payment);
  const meta = {
    TARJETA: {
      icon: 'card',
      title: 'Tarjeta',
      detail: 'POS / tarjeta',
    },
    TRANSFERENCIA: {
      icon: 'bank',
      title: 'Transferencia',
      detail: 'Bancaria',
    },
    'LINK DE PAGO': {
      icon: 'link',
      title: 'Link de pago',
      detail: 'Te enviamos link',
    },
    EFECTIVO: {
      icon: 'cash',
      title: 'Efectivo',
      detail: 'Pago al recibir',
    },
  };

  return {
    value,
    ...(meta[value] || meta.EFECTIVO),
  };
};

const getGoogleAuthErrorMessage = (error = {}) => {
  if (error.code === 'auth/unauthorized-domain') {
    return 'Google no esta autorizado para este dominio. Agrega tienda.sanmartinsr.com en Firebase Authentication > Settings > Authorized domains.';
  }

  if (error.code === 'auth/operation-not-allowed') {
    return 'Google no esta habilitado en Firebase Authentication > Sign-in method.';
  }

  if (error.code === 'auth/popup-blocked') {
    return 'El navegador bloqueo la ventana de Google. Permite popups para esta pagina e intenta de nuevo.';
  }

  if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
    return 'Se cerro la ventana de Google antes de terminar el ingreso.';
  }

  return 'No se pudo entrar con Google. Revisa que Google este habilitado y el dominio autorizado en Firebase.';
};

const normalizeStorePriorityText = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

const STORE_ALL_PRODUCTS_PRIORITY_GROUPS = [
  { category: 'res', subcategory: 'linea diaria', title: 'Res · Linea Diaria' },
  { category: 'res', subcategory: 'linea gold', title: 'Res · Linea Gold' },
  { category: 'res', subcategory: 'linea parrillera', title: 'Res · Linea Parrillera' },
  {
    category: 'res',
    subcategory: 'linea practica y tortas hamburguesa',
    title: 'Res · Linea Practica',
  },
  { category: 'pollo', subcategory: 'pollo', title: 'Pollo · Pollo' },
  { category: 'cerdo', subcategory: 'cerdo', title: 'Cerdo · Cerdo' },
  ...(STORE_SUBCATEGORY_CANONICALS.abarroteria || []).map((subcategory) => ({
    category: 'abarroteria',
    subcategory,
    title: `Abarroteria - ${subcategory}`,
    kicker: 'Top 5 mas vendido',
    homeLimit: STORE_GROUP_PAGE_SIZE,
  })),
  { category: 'congelados', subcategory: 'mariscos', title: 'Congelados · Mariscos' },
  { category: 'refrigerados', subcategory: 'embutidos', title: 'Refrigerados · Embutidos' },
];

const STORE_ALL_PRODUCTS_PRIORITY_INDEX = new Map(
  STORE_ALL_PRODUCTS_PRIORITY_GROUPS.map(({ category, subcategory }, index) => [
    `${normalizeStorePriorityText(category)}::${normalizeStorePriorityText(subcategory)}`,
    index,
  ])
);

const getStoreAllProductsPriority = (product = {}) => {
  const priorityKey = `${normalizeStorePriorityText(product?.category)}::${normalizeStorePriorityText(product?.subcategory)}`;
  if (STORE_ALL_PRODUCTS_PRIORITY_INDEX.has(priorityKey)) {
    return STORE_ALL_PRODUCTS_PRIORITY_INDEX.get(priorityKey);
  }

  return Number.MAX_SAFE_INTEGER;
};

const getStoreGeneralCatalogTailPriority = (product = {}) => {
  const normalizedCategory = normalizeStorePriorityText(product?.category);
  const normalizedSubcategory = normalizeStorePriorityText(product?.subcategory);

  if (normalizedCategory === 'res' && normalizedSubcategory === 'productos industriales') {
    return 2;
  }

  if (normalizedSubcategory.includes('otros')) {
    return 1;
  }

  return 0;
};

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;
const buildCoverageErrorMessage = (deliveryQuote) => {
  if (!deliveryQuote || deliveryQuote.reason !== 'out_of_coverage') {
    return '';
  }

  return `Solo atendemos dentro de ${formatStoreDeliveryDistance(
    deliveryQuote.coverageRadiusKm
  )} desde la tienda. Tu ubicacion esta a ${formatStoreDeliveryDistance(
    deliveryQuote.distanceKm
  )}.`;
};

const buildStoreDeliverySummary = (deliveryQuote) => {
  if (!deliveryQuote) {
    return {
      title: 'Servicio a domicilio',
      message: 'Guarda el punto exacto para calcular el envio.',
      tone: 'neutral',
    };
  }

  if (deliveryQuote.isPickup) {
    return {
      title: 'Pickup en tienda',
      message: 'Retiras en tienda sin costo de envio.',
      tone: 'pickup',
    };
  }

  if (deliveryQuote.reason === 'missing_store_location') {
    return {
      title: 'Servicio a domicilio',
      message: 'La tienda aun no tiene configurada su ubicacion base para calcular envio.',
      tone: 'warning',
    };
  }

  if (deliveryQuote.reason === 'missing_destination') {
    return {
      title: 'Servicio a domicilio',
      message: 'Guarda tu punto exacto para calcular el costo del envio.',
      tone: 'neutral',
    };
  }

  if (deliveryQuote.reason === 'out_of_coverage') {
    return {
      title: 'Fuera de cobertura',
      message: buildCoverageErrorMessage(deliveryQuote),
      tone: 'error',
    };
  }

  return {
    title: 'Servicio a domicilio',
    message: `Distancia estimada ${formatStoreDeliveryDistance(
      deliveryQuote.distanceKm
    )}. Envio ${formatCurrency(deliveryQuote.totalFee)} con IVA incluido.`,
    tone: 'active',
  };
};

const findWelcomeCouponHeroImage = (products = []) => {
  const prioritizedProduct = (Array.isArray(products) ? products : []).find((product) => {
    const text = `${product?.category || ''} ${product?.subcategory || ''} ${product?.name || ''}`
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    return (
      String(product?.image || '').trim() &&
      (text.includes('new york') ||
        text.includes('rib eye') ||
        text.includes('t-bone') ||
        text.includes('parrill') ||
        text.includes('res'))
    );
  });

  return prioritizedProduct?.image || '';
};

const getWelcomeCouponCartMessage = (welcomeCoupon = null, totalAmount = 0) => {
  const normalized = normalizeStoreWelcomeCoupon(welcomeCoupon);
  if (!normalized) {
    return '';
  }

  if (Number(totalAmount || 0) < Number(normalized.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM)) {
    return `Disponible desde ${formatCurrency(normalized.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM)} de compra.`;
  }

  return `Listo para descontarte ${formatCurrency(normalized.amount || STORE_WELCOME_COUPON_AMOUNT)} en este pedido.`;
};

const isCanceledOrderStatus = (status) => {
  const normalized = normalizeStorePriorityText(status);
  return normalized.includes('cancel') || normalized.includes('anulad');
};

const getInitialCatalogState = () => {
  const cachedCatalog = unwrapStoreCache(
    readStoreJsonCache(STORE_CATALOG_CACHE_KEY),
    STORE_CATALOG_CACHE_VERSION
  );
  const hasCachedCatalog =
    Boolean(cachedCatalog.data) &&
    typeof cachedCatalog.data === 'object' &&
    Object.keys(cachedCatalog.data).length > 0;

  return {
    catalog: hasCachedCatalog ? mergeCatalogProducts(cachedCatalog.data) : [],
    loading: !hasCachedCatalog,
  };
};

const getInitialStoreCollection = (cacheKey, cacheVersion, mergeCollection, fallbackValue) => {
  const cachedCollection = unwrapStoreCache(readStoreJsonCache(cacheKey), cacheVersion);
  const hasCachedCollection =
    Boolean(cachedCollection.data) &&
    typeof cachedCollection.data === 'object' &&
    Object.keys(cachedCollection.data).length > 0;

  if (hasCachedCollection) {
    return mergeCollection(cachedCollection.data);
  }

  return fallbackValue;
};

const isUnitProduct = (product) => isUnitMeasure(product?.unit);

const getQuantityStep = (product) => getProductQuantityStep(product);

const getMinQuantity = (product) => getProductMinQuantity(product);

const clampQuantity = (value, product) => {
  const step = getQuantityStep(product);
  const minQuantity = getMinQuantity(product);
  const rounded = Math.round(Number(value || 0) / step) * step;
  if (rounded <= 0) {
    return 0;
  }

  return Number(Math.max(rounded, minQuantity).toFixed(3));
};

const isValidQuantityStep = (value, product) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return true;
  }

  const minQuantity = getMinQuantity(product);
  if (numberValue < minQuantity - QUANTITY_EPSILON) {
    return false;
  }

  const step = getQuantityStep(product);
  const steps = (numberValue - minQuantity) / step;
  return Math.abs(steps - Math.round(steps)) < QUANTITY_EPSILON;
};

const formatStoreQuantity = (quantity, unit) =>
  String(unit).toLowerCase() === 'unidad' ? String(Number(quantity || 0)) : formatWeight(quantity);

const getQuickQuantities = (product) => {
  if (!product) {
    return QUICK_WEIGHTS;
  }

  const minQuantity = getMinQuantity(product);
  const step = getQuantityStep(product);
  const totalOptions = isUnitProduct(product) ? 4 : 5;

  return Array.from({ length: totalOptions }, (_, index) =>
    Number((minQuantity + index * step).toFixed(3))
  );
};

const getQuantityRuleMessage = (product) => {
  const minQuantity = getMinQuantity(product);
  const step = getQuantityStep(product);
  const minLabel = `${formatStoreQuantity(minQuantity, product?.unit)} ${product?.unit || ''}`.trim();
  const stepLabel = `${formatStoreQuantity(step, product?.unit)} ${product?.unit || ''}`.trim();

  if (!isUnitProduct(product) && step === 1) {
    return `Se vende desde ${minLabel} y solo permite pesos cerrados en incrementos de ${stepLabel}.`;
  }

  return `Se vende desde ${minLabel} en incrementos de ${stepLabel}.`;
};

const clampLatitude = (value) => Math.max(-85, Math.min(85, Number(value) || 0));

const normalizeLongitude = (value) => {
  const numeric = Number(value) || 0;
  return ((((numeric + 180) % 360) + 360) % 360) - 180;
};

const locationToWorldPoint = (location, zoom) => {
  const scale = MAP_PICKER_TILE_SIZE * 2 ** zoom;
  const lat = clampLatitude(location?.lat);
  const lng = normalizeLongitude(location?.lng);
  const sinLat = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const worldPointToLocation = (x, y, zoom) => {
  const scale = MAP_PICKER_TILE_SIZE * 2 ** zoom;
  const lng = normalizeLongitude((x / scale) * 360 - 180);
  const mercatorY = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));

  return normalizeLocation({
    lat,
    lng,
    label: 'Punto seleccionado en mapa',
    updatedAt: Date.now(),
  });
};

const buildManualLocation = (lat, lng) =>
  normalizeLocation({
    lat: clampLatitude(lat),
    lng: normalizeLongitude(lng),
    label: 'Punto seleccionado en mapa',
    updatedAt: Date.now(),
  });

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const LOCATION_ADDRESS_PLACEHOLDERS = [
  '',
  'ubicacion guardada desde el mapa',
  'ubicacion seleccionada en el mapa',
  'punto seleccionado en mapa',
];

const shouldAutofillAddress = (value) =>
  LOCATION_ADDRESS_PLACEHOLDERS.includes(removeTextAccents(value).trim());

const createEmptyDeliveryDraft = () => ({
  direccion: '',
  referencia: '',
  ubicacion: null,
});

const createUserDeliveryDraft = (user = {}) => ({
  direccion: String(user?.direccion || '').trim(),
  referencia: String(user?.referencia || '').trim(),
  ubicacion: normalizeLocation(user?.ubicacion),
});

const normalizeCustomerOrderStatus = (status) => {
  const normalizedStatus = removeTextAccents(status || 'Pendiente');

  if (normalizedStatus.includes('cancel')) {
    return 'cancelado';
  }

  if (normalizedStatus.includes('anulad')) {
    return 'cancelado';
  }

  if (normalizedStatus.includes('enviado')) {
    return 'enviado';
  }

  if (normalizedStatus.includes('entregado')) {
    return 'entregado';
  }

  if (normalizedStatus.includes('preparado')) {
    return 'preparado';
  }

  if (normalizedStatus.includes('preparacion')) {
    return 'preparando';
  }

  return 'pendiente';
};

const isFinalCustomerOrder = (order = {}) =>
  ['cancelado', 'entregado'].includes(normalizeCustomerOrderStatus(order.estado));

const isSameStoreCustomerOrder = (left, right) => {
  if (!left || !right) {
    return false;
  }

  if (left.firebaseKey && right.firebaseKey && left.firebaseKey === right.firebaseKey) {
    return true;
  }

  return left.id !== undefined && right.id !== undefined && String(left.id) === String(right.id);
};

const resolveActiveStoreCustomerOrder = (orders = [], createdOrder = null) => {
  const listedOrders = Array.isArray(orders) ? orders : [];
  const liveCreatedOrder = createdOrder
    ? listedOrders.find((order) => isSameStoreCustomerOrder(order, createdOrder))
    : null;
  const liveOrCreatedOrder = liveCreatedOrder || createdOrder;

  if (liveOrCreatedOrder && !isFinalCustomerOrder(liveOrCreatedOrder)) {
    return liveOrCreatedOrder;
  }

  return listedOrders.find((order) => !isFinalCustomerOrder(order)) || null;
};

const getFulfillmentTypeLabel = (fulfillmentType) =>
  fulfillmentType === ORDER_FULFILLMENT_PICKUP ? 'Pickup en tienda' : 'Entrega a domicilio';

const getOrderProgressSteps = (order = {}) =>
  isPickupOrder(order) ? PICKUP_ORDER_PROGRESS_STEPS : ORDER_PROGRESS_STEPS;

const getShortPersonName = (name, fallback) => {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return fallback;
  }

  const [firstName] = cleanName.split(/\s+/);
  return firstName || fallback;
};

const getCustomerStatusMeta = (order = {}) => {
  const statusKey = normalizeCustomerOrderStatus(order.estado);
  const riderName = getShortPersonName(order.repartidor, 'Jordin');
  const pickupOrder = isPickupOrder(order);

  const statusMeta = {
    pendiente: {
      accent: '#ef4444',
      soft: '#fff1f2',
      emoji: '🧾',
      label: 'Pedido recibido',
      message: 'Recibimos tu pedido. Ya esta en la fila de cocina y te iremos avisando cada paso.',
      progress: 1,
    },
    preparando: {
      accent: '#f59e0b',
      soft: '#fffbeb',
      emoji: '👨‍🍳',
      label: 'En cocina',
      message: 'Nuestro equipo ya esta preparando tu pedido con cuidado.',
      progress: 2,
    },
    preparado: {
      accent: '#10b981',
      soft: '#ecfdf5',
      emoji: '✅',
      label: pickupOrder ? 'Listo para recoger' : 'Pedido listo',
      message: pickupOrder
        ? 'Tu pedido ya esta listo para recoger en tienda.'
        : 'Tu pedido ya esta listo. Estamos coordinando la salida para entregarlo con cuidado.',
      progress: 3,
    },
    enviado: {
      accent: '#2563eb',
      soft: '#eff6ff',
      emoji: '🏍️',
      label: 'En camino',
      message: `${riderName} lleva tu pedido en camino.`,
      progress: 4,
    },
    entregado: {
      accent: '#16a34a',
      soft: '#f0fdf4',
      emoji: 'OK',
      label: pickupOrder ? 'Pedido recogido' : 'Pedido entregado',
      message: pickupOrder
        ? 'Tu pedido ya fue recogido. Gracias por comprar en Carnes San Martin Granada.'
        : 'Tu pedido fue entregado. Gracias por comprar en Carnes San Martin Granada.',
      progress: pickupOrder ? 4 : 5,
    },
    cancelado: {
      accent: '#64748b',
      soft: '#f8fafc',
      emoji: 'ℹ️',
      label: 'Pedido cancelado',
      message: 'Este pedido fue cancelado. Si necesitas ayuda, escribenos por WhatsApp.',
      progress: 0,
    },
  };

  return statusMeta[statusKey] || statusMeta.pendiente;
};

const getCustomerStatusMetaV2 = (order = {}) => {
  const statusKey = normalizeCustomerOrderStatus(order.estado);
  const pickupOrder = isPickupOrder(order);
  const riderName = getShortPersonName(order.repartidor, 'Por asignar');
  const preparingMeta = {
    accent: '#9f1239',
    soft: '#fff1f2',
    visual: 'prep',
    label: 'Carnes San Martin',
    message: 'Carnes San Martin esta preparando tu pedido.',
    progress: 1,
  };

  if (statusKey === 'cancelado') {
    return {
      accent: '#64748b',
      soft: '#f8fafc',
      visual: 'cancel',
      label: 'Pedido cancelado',
      message: 'Este pedido fue cancelado. Si necesitas ayuda, escribenos por WhatsApp.',
      progress: 0,
    };
  }

  if (statusKey === 'entregado') {
    return {
      accent: '#16a34a',
      soft: '#f0fdf4',
      visual: 'done',
      label: pickupOrder ? 'Pedido recogido' : 'Pedido entregado',
      message: pickupOrder
        ? 'Entregado - tu pedido fue recogido. Gracias por comprar en Carnes San Martin Granada.'
        : 'Entregado - tu pedido fue entregado. Gracias por comprar en Carnes San Martin Granada.',
      progress: 3,
    };
  }

  if (statusKey === 'enviado') {
    return {
      accent: '#2563eb',
      soft: '#eff6ff',
      visual: 'driver',
      label: pickupOrder ? 'Pickup listo' : 'Driver en camino',
      message: pickupOrder
        ? 'Tu pedido esta listo para recoger en tienda.'
        : `Driver - ${riderName} tiene tu pedido en camino.`,
      progress: 2,
    };
  }

  if (statusKey === 'preparado' && pickupOrder) {
    return {
      accent: '#2563eb',
      soft: '#eff6ff',
      visual: 'pickup',
      label: 'Pickup listo',
      message: 'Tu pedido esta listo para recoger en tienda.',
      progress: 2,
    };
  }

  return preparingMeta;
};

const buildOrderItemsMessage = (order = {}) => {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return order.pedido || 'Sin detalle de productos';
  }

  return order.items
    .map((item) => {
      const quantity = formatStoreQuantity(item.cantidad, item.unidad);
      const nameLine = [
        '*',
        quantity,
        item.unidad || '',
        item.nombre || '',
        item.codigo ? `[${item.codigo}]` : '',
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      const lines = [nameLine];

      if (item.descripcion) {
        lines.push(`  Descripcion: ${item.descripcion}`);
      }

      if (Number(item.subtotal || 0) > 0) {
        lines.push(`  Subtotal: ${formatCurrency(item.subtotal)}`);
      }

      return lines.join('\n');
    })
    .join('\n');
};

const buildOrderWhatsAppMessage = (order = {}, currentUser = {}) => {
  const customerName = currentUser?.nombre || order.cliente || 'Cliente';
  const customerPhone = currentUser?.telefono || order.telefono || '';
  const orderNumber = formatOrderNumber(order.id);
  const totalLabel = order?.totalAproximado === false ? 'Total actualizado' : 'Total aproximado';
  const fulfillmentLabel = getFulfillmentTypeLabel(
    isPickupOrder(order) ? ORDER_FULFILLMENT_PICKUP : ORDER_FULFILLMENT_DELIVERY
  );

  return [
    'Hola Carnes San Martin Granada.',
    'Tengo este pedido en linea',
    `Pedido #${orderNumber}`,
    `Cliente: ${customerName}`,
    customerPhone ? `Telefono: ${customerPhone}` : '',
    `Tipo: ${fulfillmentLabel}`,
    `Estado actual: ${order.estado || 'Pendiente'}`,
    `${totalLabel}: ${formatCurrency(order.total)}`,
    'Productos:',
    buildOrderItemsMessage(order),
    order?.totalAproximado === false
      ? ''
      : 'Nota: El total puede *variar* por el peso exacto de cada producto.',
  ]
    .filter(Boolean)
    .join('\n');
};

const buildOrderWhatsAppLink = (order, currentUser) =>
  `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildOrderWhatsAppMessage(order, currentUser)
  )}`;

export default function TiendaVirtualView({
  onCreateOrder,
  mode = 'public',
  publicStoreUrl = 'https://tienda.sanmartinsr.com',
}) {
  const [catalogState] = useState(() => getInitialCatalogState());
  const [catalog, setCatalog] = useState(() => catalogState.catalog);
  const [catalogLoading, setCatalogLoading] = useState(() => catalogState.loading);
  const [categories, setCategories] = useState(() =>
    getInitialStoreCollection(
      STORE_CATEGORIES_CACHE_KEY,
      STORE_CATEGORIES_CACHE_VERSION,
      mergeStoreCategories,
      mergeStoreCategories()
    )
  );
  const [coupons, setCoupons] = useState(() =>
    getInitialStoreCollection(
      STORE_COUPONS_CACHE_KEY,
      STORE_COUPONS_CACHE_VERSION,
      mergeStoreCoupons,
      []
    )
  );
  const [promotions, setPromotions] = useState(() =>
    getInitialStoreCollection(
      STORE_PROMOTIONS_CACHE_KEY,
      STORE_PROMOTIONS_CACHE_VERSION,
      mergeStorePromotions,
      mergeStorePromotions()
    )
  );
  const [cart, setCart] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [welcomeCouponOpen, setWelcomeCouponOpen] = useState(false);
  const [welcomeCouponActionBusy, setWelcomeCouponActionBusy] = useState(false);
  const [quantityNotice, setQuantityNotice] = useState('');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeSubcategory, setActiveSubcategory] = useState('todas');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProductQuantity, setSelectedProductQuantity] = useState(0);
  const [selectedPromotionIndex, setSelectedPromotionIndex] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 1180 : false
  );
  const [currentUser, setCurrentUser] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return JSON.parse(window.localStorage.getItem(STORE_SESSION_KEY) || 'null');
    } catch (error) {
      console.error('No se pudo leer la sesion de tienda:', error);
      return null;
    }
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(() => ({ ...EMPTY_STORE_AUTH_FORM }));
  const [authProviderDraft, setAuthProviderDraft] = useState(null);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authLocating, setAuthLocating] = useState(false);
  const [authSheetOpen, setAuthSheetOpen] = useState(() => mode !== 'dashboard' && !currentUser);
  const [authPromptDismissed, setAuthPromptDismissed] = useState(() => Boolean(currentUser));
  const [pendingAuthIntent, setPendingAuthIntent] = useState('');
  const [customerOrders, setCustomerOrders] = useState([]);
  const [couponHistoryOrders, setCouponHistoryOrders] = useState([]);
  const [couponHistoryReady, setCouponHistoryReady] = useState(false);
  const [archivedCouponUsage, setArchivedCouponUsage] = useState({});
  const [archivedCouponUsageReady, setArchivedCouponUsageReady] = useState(false);
  const [customer, setCustomer] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    referencia: '',
    metodoPago: STORE_CASH_PAYMENT,
    cambioPara: '',
  });
  const [fulfillmentType, setFulfillmentType] = useState(ORDER_FULFILLMENT_DELIVERY);
  const [deliveryMode, setDeliveryMode] = useState('perfil');
  const [alternateDelivery, setAlternateDelivery] = useState(() => createEmptyDeliveryDraft());
  const [alternateLocating, setAlternateLocating] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [orderSuccessOpen, setOrderSuccessOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [rewardDefinitions, setRewardDefinitions] = useState({});
  const [rewardSettings, setRewardSettings] = useState(DEFAULT_STORE_REWARD_SETTINGS);
  const [rewardAccount, setRewardAccount] = useState(() => normalizeStoreRewardAccount({}, ''));
  const [rewardTransactions, setRewardTransactions] = useState([]);
  const [selectedRewardRedemption, setSelectedRewardRedemption] = useState(null);
  const [rewardActionBusy, setRewardActionBusy] = useState(false);
  const [rewardsReturnTarget, setRewardsReturnTarget] = useState('');
  const [groupVisibleCounts, setGroupVisibleCounts] = useState({});
  const quantityNoticeTimeoutRef = useRef(null);
  const autoAppliedCouponRef = useRef('');

  const deferredQuery = useDeferredValue(query);
  const isDashboard = mode === 'dashboard';
  const pickupFlow = fulfillmentType === ORDER_FULFILLMENT_PICKUP;

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      const cachedCatalog = unwrapStoreCache(
        readStoreJsonCache(STORE_CATALOG_CACHE_KEY),
        STORE_CATALOG_CACHE_VERSION
      );

      try {
        let remoteUpdatedAt = 0;
        let canReuseCache = false;

        if (cachedCatalog.data) {
          const metaSnapshot = await get(ref(database, STORE_CATALOG_META_PATH));
          remoteUpdatedAt = Number(metaSnapshot.val()?.updatedAt || 0);
          canReuseCache =
            cachedCatalog.updatedAt > 0 &&
            remoteUpdatedAt > 0 &&
            cachedCatalog.updatedAt >= remoteUpdatedAt;
        }

        if (canReuseCache) {
          if (!cancelled) {
            startTransition(() => {
              setCatalog(mergeCatalogProducts(cachedCatalog.data));
              setCatalogLoading(false);
            });
          }
          return;
        }

        const catalogSnapshot = await get(
          databaseQuery(ref(database, STORE_CATALOG_PATH), orderByChild('active'), equalTo(true))
        );
        const remoteCatalog = catalogSnapshot.val() || {};

        writeStoreVersionedCache(
          STORE_CATALOG_CACHE_KEY,
          STORE_CATALOG_CACHE_VERSION,
          remoteCatalog,
          remoteUpdatedAt || Date.now()
        );

        if (!cancelled) {
          startTransition(() => {
            setCatalog(mergeCatalogProducts(remoteCatalog));
            setCatalogLoading(false);
          });
        }
      } catch (error) {
        console.error('No se pudo cargar el catalogo de tienda:', error);

        if (!cancelled) {
          if (cachedCatalog.data) {
            startTransition(() => {
              setCatalog(mergeCatalogProducts(cachedCatalog.data));
            });
          }
          setCatalogLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreRewardSettings(
      (settings) => {
        setRewardSettings(settings);
      },
      (error) => {
        console.error('No se pudo cargar la configuracion de recompensas:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreRewards(
      (rewardMap) => {
        setRewardDefinitions(rewardMap && typeof rewardMap === 'object' ? rewardMap : {});
      },
      (error) => {
        console.error('No se pudieron cargar los premios del Club San Martin:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const snapshot = await get(ref(database, STORE_CATEGORIES_PATH));
        const remoteCategories = snapshot.val() || {};
        writeStoreVersionedCache(
          STORE_CATEGORIES_CACHE_KEY,
          STORE_CATEGORIES_CACHE_VERSION,
          remoteCategories
        );
        if (!cancelled) {
          startTransition(() => {
            setCategories(mergeStoreCategories(remoteCategories));
          });
        }
      } catch (error) {
        console.error('No se pudieron cargar las categorias de tienda:', error);
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCoupons = async () => {
      try {
        const snapshot = await get(
          databaseQuery(ref(database, STORE_COUPONS_PATH), orderByChild('active'), equalTo(true))
        );
        const remoteCoupons = snapshot.val() || {};
        writeStoreVersionedCache(
          STORE_COUPONS_CACHE_KEY,
          STORE_COUPONS_CACHE_VERSION,
          remoteCoupons
        );
        if (!cancelled) {
          startTransition(() => {
            setCoupons(mergeStoreCoupons(remoteCoupons));
          });
        }
      } catch (error) {
        console.error('No se pudieron cargar los cupones de tienda:', error);
      }
    };

    loadCoupons();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPromotions = async () => {
      try {
        const snapshot = await get(ref(database, STORE_PROMOTIONS_PATH));
        const remotePromotions = snapshot.val() || {};
        writeStoreVersionedCache(
          STORE_PROMOTIONS_CACHE_KEY,
          STORE_PROMOTIONS_CACHE_VERSION,
          remotePromotions
        );
        if (!cancelled) {
          startTransition(() => {
            setPromotions(mergeStorePromotions(remotePromotions));
          });
        }
      } catch (error) {
        console.error('No se pudieron cargar las historias de tienda:', error);
      }
    };

    loadPromotions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setIsMobileLayout(window.innerWidth <= 1180);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(
    () => () => {
      if (quantityNoticeTimeoutRef.current) {
        window.clearTimeout(quantityNoticeTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!currentUser) {
      setCustomerOrders([]);
      return undefined;
    }

    const cleanUserKey = String(currentUser.key || '').trim();
    if (!cleanUserKey) {
      setCustomerOrders([]);
      return undefined;
    }

    const unsubscribe = subscribeOrdersForStoreUser(
      cleanUserKey,
      (orders) => {
        setCustomerOrders(orders);
      },
      (error) => {
        console.error('No se pudieron cargar los pedidos del cliente:', error);
        setCustomerOrders([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.key) {
      setRewardAccount(normalizeStoreRewardAccount({}, ''));
      return undefined;
    }

    const unsubscribe = subscribeStoreRewardAccount(
      currentUser.key,
      (account) => {
        setRewardAccount(account);
      },
      (error) => {
        console.error('No se pudo cargar el saldo del Club San Martin:', error);
        setRewardAccount(normalizeStoreRewardAccount({}, currentUser.key));
      }
    );

    return () => unsubscribe();
  }, [currentUser?.key]);

  useEffect(() => {
    if (!currentUser?.key) {
      setRewardTransactions([]);
      return undefined;
    }

    const unsubscribe = subscribeStoreRewardTransactions(
      currentUser.key,
      (transactions) => {
        setRewardTransactions(Array.isArray(transactions) ? transactions : []);
      },
      (error) => {
        console.error('No se pudo cargar el historial de puntos:', error);
        setRewardTransactions([]);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.key]);

  useEffect(() => {
    if (!currentUser) {
      setCouponHistoryOrders([]);
      setCouponHistoryReady(true);
      setArchivedCouponUsage({});
      setArchivedCouponUsageReady(true);
      return undefined;
    }

    const cleanUserKey = String(currentUser.key || '').trim();
    if (!cleanUserKey) {
      setCouponHistoryOrders([]);
      setCouponHistoryReady(true);
      return undefined;
    }

    setCouponHistoryReady(false);

    const unsubscribe = subscribeOrdersForStoreUser(
      cleanUserKey,
      (orders) => {
        setCouponHistoryOrders(orders);
        setCouponHistoryReady(true);
      },
      (error) => {
        console.error('No se pudo cargar el historial de cupones del cliente:', error);
        setCouponHistoryOrders([]);
        setCouponHistoryReady(true);
      },
      0
    );

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setArchivedCouponUsage({});
      setArchivedCouponUsageReady(true);
      return undefined;
    }

    const cleanUserKey = String(currentUser.key || '').trim();
    if (!cleanUserKey) {
      setArchivedCouponUsage({});
      setArchivedCouponUsageReady(true);
      return undefined;
    }

    let cancelled = false;
    setArchivedCouponUsageReady(false);

    get(ref(database, `${STORE_COUPON_ARCHIVE_USAGE_PATH}/${cleanUserKey}`))
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        const counts = snapshot.val();
        setArchivedCouponUsage(counts && typeof counts === 'object' ? counts : {});
        setArchivedCouponUsageReady(true);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error('No se pudo cargar el uso archivado de cupones:', error);
        setArchivedCouponUsage({});
        setArchivedCouponUsageReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setCustomer((current) => ({
      ...current,
      nombre: currentUser.nombre || '',
      telefono: currentUser.telefono || '',
      direccion: currentUser.direccion || '',
      referencia: currentUser.referencia || '',
    }));
    setDeliveryMode('perfil');
    setAlternateDelivery(createEmptyDeliveryDraft());
  }, [currentUser]);

  const activeProducts = useMemo(
    () => catalog.filter((product) => product.active !== false),
    [catalog]
  );

  const storeRewards = useMemo(
    () => mergeStoreRewards(rewardDefinitions, activeProducts),
    [activeProducts, rewardDefinitions]
  );

  const categoryOptions = useMemo(
    () => {
      const orderedCategories = categories
        .filter((category) => category.active !== false)
        .sort((left, right) => {
          const leftIsPromotions = String(left?.id || '').trim().toLowerCase() === 'promociones';
          const rightIsPromotions = String(right?.id || '').trim().toLowerCase() === 'promociones';

          if (leftIsPromotions && !rightIsPromotions) {
            return -1;
          }

          if (!leftIsPromotions && rightIsPromotions) {
            return 1;
          }

          return 0;
        });

      return [{ id: 'todos', label: 'Todos', subcategories: [] }, ...orderedCategories];
    },
    [categories]
  );

  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === activeCategory) || categoryOptions[0],
    [activeCategory, categoryOptions]
  );

  useEffect(() => {
    if (!categoryOptions.some((category) => category.id === activeCategory)) {
      setActiveCategory('todos');
      setActiveSubcategory('todas');
    }
  }, [activeCategory, categoryOptions]);

  const subcategoryOptions = useMemo(() => {
    if (activeCategory === 'todos') {
      return [];
    }

    const officialSubcategories = selectedCategory?.subcategories || [];
    const productSubcategories = activeProducts
      .filter((product) => {
        if (activeCategory === 'promociones') {
          return product.promo || product.category === 'promociones';
        }

        return product.category === activeCategory;
      })
      .map((product) => product.subcategory)
      .filter(Boolean);

    return Array.from(new Set([...officialSubcategories, ...productSubcategories]));
  }, [activeCategory, activeProducts, selectedCategory]);

  const categoryProductCounts = useMemo(() => {
    const counts = {};

    categoryOptions.forEach((category) => {
      if (category.id === 'todos') {
        counts[category.id] = activeProducts.length;
        return;
      }

      counts[category.id] = activeProducts.filter((product) => {
        if (category.id === 'promociones') {
          return product.promo || product.category === 'promociones';
        }

        return product.category === category.id;
      }).length;
    });

    return counts;
  }, [activeProducts, categoryOptions]);

  const subcategoryProductCounts = useMemo(() => {
    if (activeCategory === 'todos') {
      return {};
    }

    const scopedProducts = activeProducts.filter((product) => {
      if (activeCategory === 'promociones') {
        return product.promo || product.category === 'promociones';
      }

      return product.category === activeCategory;
    });

    const counts = { todas: scopedProducts.length };

    subcategoryOptions.forEach((subcategory) => {
      counts[subcategory] = scopedProducts.filter(
        (product) => String(product.subcategory || '').toLowerCase() === subcategory.toLowerCase()
      ).length;
    });

    return counts;
  }, [activeCategory, activeProducts, subcategoryOptions]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    const matchingProducts = activeProducts.filter((product) => {
      const matchesCategory =
        activeCategory === 'todos' ||
        (activeCategory === 'promociones' && (product.promo || product.category === 'promociones')) ||
        product.category === activeCategory;

      const matchesSubcategory =
        activeSubcategory === 'todas' ||
        String(product.subcategory || '').toLowerCase() === activeSubcategory.toLowerCase();

      const matchesSearch =
        !normalizedQuery ||
        [product.code, product.name, product.description, product.category, product.subcategory]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesSubcategory && matchesSearch;
    });

    if (activeCategory !== 'todos') {
      return matchingProducts;
    }

    return [...matchingProducts].sort((left, right) => {
      const priorityDifference =
        getStoreAllProductsPriority(left) - getStoreAllProductsPriority(right);

      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const tailPriorityDifference =
        getStoreGeneralCatalogTailPriority(left) - getStoreGeneralCatalogTailPriority(right);

      if (tailPriorityDifference !== 0) {
        return tailPriorityDifference;
      }

      return compareCatalogProducts(left, right);
    });
  }, [activeCategory, activeProducts, activeSubcategory, deferredQuery]);

  const groupedAllProductsSections = useMemo(() => {
    if (activeCategory !== 'todos') {
      return [];
    }

    const groupedProducts = STORE_ALL_PRODUCTS_PRIORITY_GROUPS.map((group) => ({
      ...group,
      products: [],
    }));
    const remainingProducts = [];

    filteredProducts.forEach((product) => {
      const priorityIndex = getStoreAllProductsPriority(product);
      if (priorityIndex < groupedProducts.length) {
        const group = groupedProducts[priorityIndex];
        const homeLimit = Number(group.homeLimit || 0);

        if (homeLimit > 0 && group.products.length >= homeLimit) {
          remainingProducts.push(product);
          return;
        }

        group.products.push(product);
        return;
      }

      remainingProducts.push(product);
    });

    const sections = groupedProducts
      .filter((group) => group.products.length > 0)
      .map((group) => ({
        id: `${group.category}-${group.subcategory}`,
        title: group.title,
        kicker: group.kicker || 'Prioridad tienda',
        subtitle: `${group.products.length} productos`,
        products: group.products,
      }));

    if (remainingProducts.length > 0) {
      sections.push({
        id: 'otros-productos',
        title: 'Catalogo general',
        kicker: 'Catalogo general',
        subtitle: `${remainingProducts.length} productos`,
        products: remainingProducts,
      });
    }

    return sections;
  }, [activeCategory, filteredProducts]);

  useEffect(() => {
    if (activeCategory !== 'todos') {
      setGroupVisibleCounts({});
      return;
    }

    setGroupVisibleCounts((current) => {
      const next = {};

      groupedAllProductsSections.forEach((section) => {
        const currentVisible = Number(current[section.id] || STORE_GROUP_PAGE_SIZE);
        next[section.id] = Math.max(
          STORE_GROUP_PAGE_SIZE,
          Math.min(currentVisible, section.products.length)
        );
      });

      return next;
    });
  }, [activeCategory, groupedAllProductsSections]);

  const activeCustomerOrder = useMemo(
    () => resolveActiveStoreCustomerOrder(customerOrders, createdOrder),
    [createdOrder, customerOrders]
  );

  const hasTrackedOrder = Boolean(activeCustomerOrder);

  const cartItems = useMemo(
    () =>
      activeProducts
        .filter((product) => Number(cart[product.code] || 0) > 0)
        .map((product) => {
          const cantidad = Number(cart[product.code] || 0);
          return {
            codigo: product.code,
            nombre: product.name,
            descripcion: product.description,
            unidad: product.unit,
            cantidad,
            precioUnitario: product.price,
            subtotal: Number((cantidad * product.price).toFixed(2)),
            image: product.image,
            minQuantity: getMinQuantity(product),
            quantityStep: getQuantityStep(product),
          };
        }),
    [activeProducts, cart]
  );

  const totalAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cartItems]
  );

  const couponDiscount = useMemo(
    () => calculateCouponDiscount(appliedCoupon, totalAmount),
    [appliedCoupon, totalAmount]
  );

  const couponUsageByCode = useMemo(() => {
    const counts = {};

    Object.entries(archivedCouponUsage || {}).forEach(([code, value]) => {
      const normalizedCode = normalizeCouponCode(code);
      if (!normalizedCode) {
        return;
      }

      counts[normalizedCode] = Number(value || 0);
    });

    couponHistoryOrders.forEach((order) => {
      if (isCanceledOrderStatus(order?.estado)) {
        return;
      }

      const code = normalizeCouponCode(order?.cupon?.code);
      if (!code) {
        return;
      }

      counts[code] = Number(counts[code] || 0) + 1;
    });

    return counts;
  }, [archivedCouponUsage, couponHistoryOrders]);

  const couponUsageReady = couponHistoryReady && archivedCouponUsageReady;
  const welcomeCoupon = useMemo(
    () => normalizeStoreWelcomeCoupon(currentUser?.welcomeCoupon),
    [currentUser?.welcomeCoupon]
  );
  const welcomeCouponPersonalCoupon = useMemo(
    () => normalizeStoreCoupon(welcomeCoupon?.coupon || {}),
    [welcomeCoupon?.coupon]
  );
  const availableCoupons = useMemo(() => {
    const couponMap = new Map();

    coupons.forEach((coupon) => {
      const normalizedCoupon = normalizeStoreCoupon(coupon);
      if (normalizedCoupon.code) {
        couponMap.set(normalizedCoupon.code, normalizedCoupon);
      }
    });

    if (welcomeCouponPersonalCoupon.code) {
      couponMap.set(welcomeCouponPersonalCoupon.code, welcomeCouponPersonalCoupon);
    }

    return Array.from(couponMap.values());
  }, [coupons, welcomeCouponPersonalCoupon]);
  const welcomeCouponUsageCount = useMemo(
    () => Number(couponUsageByCode[normalizeCouponCode(welcomeCouponPersonalCoupon.code)] || 0),
    [couponUsageByCode, welcomeCouponPersonalCoupon.code]
  );
  const welcomeCouponStatus = useMemo(
    () => getStoreWelcomeCouponEffectiveStatus(welcomeCoupon, welcomeCouponUsageCount),
    [welcomeCoupon, welcomeCouponUsageCount]
  );

  const getCouponUsageMessage = (coupon) => {
    const assignedUserKey = String(coupon?.assignedUserKey || '').trim();
    if (assignedUserKey && (!currentUser?.key || currentUser.key !== assignedUserKey)) {
      return currentUser?.key
        ? 'Este cupon pertenece a otra cuenta.'
        : 'Inicia sesion para usar este cupon.';
    }

    const limit = normalizeCouponUsageLimit(coupon?.maxUsesPerUser || 0);
    if (limit <= 0) {
      return '';
    }

    if (!currentUser?.key) {
      return 'Inicia sesion para usar este cupon.';
    }

    if (!couponUsageReady) {
      return 'Estamos revisando tus cupones. Intenta nuevamente en unos segundos.';
    }

    const usedCount = Number(couponUsageByCode[normalizeCouponCode(coupon?.code)] || 0);
    if (usedCount < limit) {
      return '';
    }

    return limit === 1
      ? 'Este cupon ya fue utilizado en tu cuenta.'
      : `Este cupon ya alcanzo su limite de ${limit} usos en tu cuenta.`;
  };

  const applyResolvedCoupon = (coupon, options = {}) => {
    const normalizedCoupon = normalizeStoreCoupon(coupon);
    const allowBelowMinimum = options.allowBelowMinimum === true;
    const silent = options.silent === true;

    if (!normalizedCoupon.code || normalizedCoupon.active === false) {
      setAppliedCoupon(null);
      if (!silent) {
        setCouponMessage('Cupon no encontrado o inactivo.');
      }
      return false;
    }

    if (!allowBelowMinimum && normalizedCoupon.minimum > 0 && totalAmount < normalizedCoupon.minimum) {
      setAppliedCoupon(null);
      if (!silent) {
        setCouponMessage(`Este cupon aplica desde ${formatCurrency(normalizedCoupon.minimum)}.`);
      }
      return false;
    }

    const usageMessage = getCouponUsageMessage(normalizedCoupon);
    if (usageMessage) {
      setAppliedCoupon(null);
      if (!silent) {
        setCouponMessage(usageMessage);
      }
      return false;
    }

    const discount = calculateCouponDiscount(normalizedCoupon, totalAmount);
    if (!allowBelowMinimum && discount <= 0) {
      setAppliedCoupon(null);
      if (!silent) {
        setCouponMessage('Este cupon no genera descuento para este pedido.');
      }
      return false;
    }

    setAppliedCoupon(normalizedCoupon);
    setCouponInput(normalizedCoupon.code);
    if (!silent) {
      setCouponMessage(`Cupon aplicado: -${formatCurrency(discount)}.`);
    }
    autoAppliedCouponRef.current = normalizedCoupon.code;
    return true;
  };

  const approximateTotalAmount = useMemo(
    () => Number(Math.max(totalAmount - couponDiscount, 0).toFixed(2)),
    [couponDiscount, totalAmount]
  );

  const estimatedRewardPoints = useMemo(
    () => calculateEarnedRewardPoints(approximateTotalAmount, rewardSettings),
    [approximateTotalAmount, rewardSettings]
  );

  const selectedRewardDefinition = useMemo(
    () =>
      storeRewards.find((reward) => reward.id === String(selectedRewardRedemption?.rewardId || '').trim()) || null,
    [selectedRewardRedemption?.rewardId, storeRewards]
  );

  const activePromotions = useMemo(
    () => promotions.filter((promotion) => isStorePromotionVisible(promotion)),
    [promotions]
  );
  const welcomeCouponHeroImage = useMemo(
    () => findWelcomeCouponHeroImage(activeProducts),
    [activeProducts]
  );

  const savedDeliveryAddress = useMemo(() => createUserDeliveryDraft(currentUser), [currentUser]);
  const activeDeliveryAddress = deliveryMode === 'otra' ? alternateDelivery : savedDeliveryAddress;
  const showPromotions =
    deferredQuery.trim().length === 0 &&
    activeCategory === 'todos' &&
    activeSubcategory === 'todas' &&
    activePromotions.length > 0;

  useEffect(() => {
    if (selectedPromotionIndex === null) {
      return;
    }

    if (activePromotions.length === 0) {
      setSelectedPromotionIndex(null);
      return;
    }

    if (selectedPromotionIndex >= activePromotions.length) {
      setSelectedPromotionIndex(activePromotions.length - 1);
    }
  }, [activePromotions.length, selectedPromotionIndex]);

  const cartCount = cartItems.length;

  useEffect(() => {
    if (!currentUser?.key) {
      setWelcomeCouponOpen(false);
      autoAppliedCouponRef.current = '';
      return;
    }

    if (welcomeCouponStatus === 'available' && welcomeCoupon?.coupon?.code) {
      setWelcomeCouponOpen(true);
      return;
    }

    if (welcomeCouponStatus === 'used') {
      setWelcomeCouponOpen(false);
    }
  }, [currentUser?.key, welcomeCoupon?.coupon?.code, welcomeCouponStatus]);

  useEffect(() => {
    const welcomeCouponCode = normalizeCouponCode(welcomeCouponPersonalCoupon.code);
    if (!currentUser?.key || !welcomeCouponCode) {
      return;
    }

    if (welcomeCouponStatus !== 'claimed') {
      return;
    }

    if (appliedCoupon?.code || totalAmount < Number(welcomeCouponPersonalCoupon.minimum || STORE_WELCOME_COUPON_MINIMUM)) {
      return;
    }

    if (autoAppliedCouponRef.current === welcomeCouponCode) {
      return;
    }

    applyResolvedCoupon(welcomeCouponPersonalCoupon, { silent: true });
  }, [
    appliedCoupon?.code,
    currentUser?.key,
    totalAmount,
    welcomeCouponPersonalCoupon,
    welcomeCouponStatus,
  ]);

  useEffect(() => {
    if (selectedRewardRedemption && !selectedRewardDefinition) {
      setSelectedRewardRedemption(null);
    }
  }, [selectedRewardDefinition, selectedRewardRedemption]);

  useEffect(() => {
    if (!orderSuccessOpen || !createdOrder) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setOrderSuccessOpen(false);
      setOrdersOpen(true);
    }, 1500);

    return () => window.clearTimeout(timeoutId);
  }, [createdOrder, orderSuccessOpen]);

  const activeFilterSummary = useMemo(() => {
    if (catalogLoading && catalog.length === 0) {
      return {
        title: 'Cargando catalogo',
        subtitle: 'Estamos preparando los productos de la tienda.',
      };
    }

    const currentCategoryLabel = selectedCategory?.label || 'Todos';
    const currentSubcategoryLabel =
      activeSubcategory === 'todas' ? 'Todas las subcategorias' : activeSubcategory;
    const categoryCount =
      activeCategory === 'todos'
        ? activeProducts.length
        : Number(subcategoryProductCounts.todas || 0);

    return {
      title: currentCategoryLabel,
      subtitle:
        activeCategory === 'todos'
          ? `${filteredProducts.length} productos en el catalogo`
          : `${currentSubcategoryLabel} · ${categoryCount} productos en categoria`,
    };
  }, [
    activeCategory,
    activeProducts.length,
    activeSubcategory,
    filteredProducts.length,
    selectedCategory,
    subcategoryProductCounts,
  ]);

  const showCatalogSkeleton = catalogLoading && catalog.length === 0;

  useEffect(() => {
    if (cartItems.length === 0) {
      setCheckoutOpen(false);
    }
  }, [cartItems.length]);

  useEffect(() => {
    if (cartItems.length === 0 && appliedCoupon) {
      setAppliedCoupon(null);
      setCouponInput('');
      setCouponMessage('');
    }
  }, [appliedCoupon, cartItems.length]);

  useEffect(() => {
    if (!appliedCoupon) {
      return;
    }

    const refreshedCoupon = availableCoupons.find((coupon) => coupon.code === appliedCoupon.code);
    if (!refreshedCoupon || refreshedCoupon.active === false) {
      setAppliedCoupon(null);
      setCouponMessage('Este cupon ya no esta disponible.');
      return;
    }

    const usageMessage = getCouponUsageMessage(refreshedCoupon);
    if (usageMessage) {
      setAppliedCoupon(null);
      setCouponMessage(usageMessage);
      return;
    }

    if (JSON.stringify(refreshedCoupon) !== JSON.stringify(appliedCoupon)) {
      setAppliedCoupon(refreshedCoupon);
    }
  }, [appliedCoupon, availableCoupons, couponUsageByCode, couponUsageReady, currentUser]);

  useEffect(() => {
    if (!appliedCoupon) {
      return;
    }

    if (appliedCoupon.minimum > 0 && totalAmount < appliedCoupon.minimum) {
      setCouponMessage(`Este cupon aplica desde ${formatCurrency(appliedCoupon.minimum)}.`);
      return;
    }

    if (couponDiscount > 0) {
      setCouponMessage(`Cupon aplicado: -${formatCurrency(couponDiscount)}.`);
    }
  }, [appliedCoupon, couponDiscount, totalAmount]);

  const showQuantityNotice = (message) => {
    setQuantityNotice(message);

    if (quantityNoticeTimeoutRef.current) {
      window.clearTimeout(quantityNoticeTimeoutRef.current);
    }

    quantityNoticeTimeoutRef.current = window.setTimeout(() => {
      setQuantityNotice('');
      quantityNoticeTimeoutRef.current = null;
    }, 2000);
  };

  const updateQuantity = (code, nextValue) => {
    const product = activeProducts.find((item) => item.code === code) || catalog.find((item) => item.code === code);
    const numericValue = Number(nextValue);

    if (!Number.isFinite(numericValue)) {
      showQuantityNotice('Ingresa una cantidad valida.');
      return;
    }

    if (!isValidQuantityStep(numericValue, product)) {
      showQuantityNotice(getQuantityRuleMessage(product));
    }

    setCart((current) => ({
      ...current,
      [code]: clampQuantity(numericValue, product),
    }));
  };

  const updateCustomer = (field, value) => {
    setCustomer((current) => ({
      ...current,
      [field]: field === 'metodoPago' ? normalizeCheckoutPayment(value) : value,
      ...(field === 'metodoPago' && normalizeCheckoutPayment(value) !== STORE_CASH_PAYMENT
        ? { cambioPara: '' }
        : {}),
    }));
  };

  const applyCoupon = () => {
    const code = normalizeCouponCode(couponInput);
    if (!code) {
      setCouponMessage('Ingresa un codigo de cupon.');
      return;
    }

    const coupon = availableCoupons.find((item) => item.code === code);
    if (!coupon) {
      setAppliedCoupon(null);
      setCouponMessage('Cupon no encontrado o inactivo.');
      return;
    }

    applyResolvedCoupon(coupon);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMessage('');
  };

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({
      ...current,
      [field]: field === 'fechaCumpleanos' ? normalizeBirthdayInput(value) : value,
    }));
  };

  const openAuthSheet = (mode = 'login', intent = '') => {
    setAuthMode(mode);
    setAuthProviderDraft(null);
    setAuthError('');
    setAuthNotice('');
    setPendingAuthIntent(intent);
    setAuthSheetOpen(true);
  };

  const closeAuthSheet = ({ force = false } = {}) => {
    if (!force && !currentUser && !isDashboard) {
      return;
    }

    setAuthSheetOpen(false);
    setPendingAuthIntent('');
    setAuthProviderDraft(null);
    setAuthError('');
    setAuthNotice('');
  };

  const fillAddressFromLocation = (currentAddress, location, fallback) => {
    if (!shouldAutofillAddress(currentAddress)) {
      return currentAddress;
    }

    return String(location?.label || fallback || 'Ubicacion guardada desde el mapa').trim();
  };

  const resolveLocationWithAddress = async (location) => {
    const normalized = normalizeLocation(location);
    if (!normalized) {
      return null;
    }

    try {
      return (await reverseGeocodeLocation(normalized)) || normalized;
    } catch (error) {
      console.error('No se pudo resolver la direccion del punto:', error);
      return normalized;
    }
  };

  const captureAuthLocation = async () => {
    setAuthLocating(true);
    setAuthError('');

    try {
      const location = await resolveLocationWithAddress(await getBrowserLocation());
      updateAuthForm('ubicacion', location);
      updateAuthForm('direccion', fillAddressFromLocation(authForm.direccion, location));
    } catch (error) {
      console.error('No se pudo obtener ubicacion:', error);
      setAuthError('No pudimos tomar tu ubicacion. Activa permisos o ajusta el punto manualmente.');
    } finally {
      setAuthLocating(false);
    }
  };

  const updateAlternateDelivery = (field, value) => {
    setAlternateDelivery((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const captureAlternateLocation = async () => {
    setAlternateLocating(true);

    try {
      const location = await resolveLocationWithAddress(await getBrowserLocation());
      setAlternateDelivery((current) => ({
        ...current,
        ubicacion: location,
        direccion: fillAddressFromLocation(current.direccion, location),
      }));
    } catch (error) {
      console.error('No se pudo obtener ubicacion alterna:', error);
      alert('No pudimos tomar la ubicacion de entrega. Activa permisos o ajusta el punto manualmente.');
    } finally {
      setAlternateLocating(false);
    }
  };

  const persistStoreSession = (user) => {
    setCurrentUser(user);
    setCreatedOrder(null);
    setAuthPromptDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORE_SESSION_KEY, JSON.stringify(user));
    }
  };

  const clearStoreSession = async () => {
    setCurrentUser(null);
    setCreatedOrder(null);
    setOrderSuccessOpen(false);
    setCustomerOrders([]);
    setRewardTransactions([]);
    setRewardAccount(normalizeStoreRewardAccount({}, ''));
    setSelectedRewardRedemption(null);
    setDeliveryMode('perfil');
    setAlternateDelivery(createEmptyDeliveryDraft());
    setOrdersOpen(false);
    setRewardsOpen(false);
    setRewardsReturnTarget('');
    setCheckoutOpen(false);
    setProfileOpen(false);
    setAuthSheetOpen(false);
    setWelcomeCouponOpen(false);
    setAuthProviderDraft(null);
    setAuthPromptDismissed(false);
    setPendingAuthIntent('');
    autoAppliedCouponRef.current = '';
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORE_SESSION_KEY);
    }
    await signOutCurrentUser().catch(() => {});
  };

  useEffect(() => {
    if (isDashboard) {
      return undefined;
    }

    return onFirebaseAuthChange((authUser) => {
      if (authUser && (!currentUser || currentUser.key === authUser.uid)) {
        return;
      }

      if (!authUser && !currentUser) {
        setAuthSheetOpen(true);
        return;
      }

      setCurrentUser(null);
      setCreatedOrder(null);
      setCustomerOrders([]);
      setRewardTransactions([]);
      setRewardAccount(normalizeStoreRewardAccount({}, ''));
      setSelectedRewardRedemption(null);
      setOrdersOpen(false);
      setRewardsOpen(false);
      setRewardsReturnTarget('');
      setProfileOpen(false);
      setAuthPromptDismissed(false);
      setAuthSheetOpen(true);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORE_SESSION_KEY);
      }
    });
  }, [currentUser, isDashboard]);

  useEffect(() => {
    if (isDashboard || !currentUser?.key) {
      return undefined;
    }

    let cancelled = false;

    const verifyStoredSession = async () => {
      try {
        const snapshot = await get(ref(database, `storeUsers/${currentUser.key}`));
        if (cancelled || snapshot.exists()) {
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        console.warn('Sesion de tienda no valida:', error);
      }

      setCurrentUser(null);
      setCreatedOrder(null);
      setCustomerOrders([]);
      setRewardTransactions([]);
      setRewardAccount(normalizeStoreRewardAccount({}, ''));
      setSelectedRewardRedemption(null);
      setOrdersOpen(false);
      setRewardsOpen(false);
      setRewardsReturnTarget('');
      setProfileOpen(false);
      setAuthPromptDismissed(false);
      setAuthSheetOpen(true);
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(STORE_SESSION_KEY);
      }
      await signOutCurrentUser().catch(() => {});
    };

    verifyStoredSession();

    return () => {
      cancelled = true;
    };
  }, [currentUser?.key, isDashboard]);

  useEffect(() => {
    if (isDashboard) {
      return undefined;
    }

    if (currentUser) {
      if (!authPromptDismissed) {
        setAuthPromptDismissed(true);
      }
      return undefined;
    }

    if (authPromptDismissed || authSheetOpen) {
      return undefined;
    }

    const openTimer = window.setTimeout(() => {
      openAuthSheet('login', 'welcome');
    }, 280);

    return () => {
      window.clearTimeout(openTimer);
    };
  }, [authPromptDismissed, authSheetOpen, currentUser, isDashboard]);

  const cancelCustomerOrder = async (order) => {
    if (!order?.firebaseKey) {
      alert('No pudimos encontrar este pedido para anularlo.');
      return;
    }

    const confirmCancel = window.confirm(
      `Quieres anular el pedido #${formatOrderNumber(order.id)}?`
    );

    if (!confirmCancel) {
      return;
    }

    const nowMs = Date.now();
    const now = new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
    const cancelPayload = {
      estado: 'Cancelado',
      canceladoPor: 'Cliente tienda virtual',
      timestampCancelado: now,
      timestampCanceladoMs: nowMs,
      timestampFinalizado: nowMs,
      timestamp: nowMs,
    };

    try {
      await update(ref(database, `orders/${order.firebaseKey}`), cancelPayload);
      setCreatedOrder((current) =>
        current && (current.firebaseKey === order.firebaseKey || String(current.id) === String(order.id))
          ? { ...current, ...cancelPayload }
          : current
      );
    } catch (error) {
      console.error('Error anulando pedido virtual:', error);
      alert('No se pudo anular el pedido. Intenta escribirnos por WhatsApp.');
    }
  };

  const handleStoreLogin = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const credentials = resolveStoreLoginCredentials(authForm.email);
      const user = await loginStoreUser({
        email: credentials.email,
        telefono: credentials.telefono,
        password: authForm.password,
      });
      setAuthProviderDraft(null);
      persistStoreSession(user);
      const nextIntent = pendingAuthIntent;
      closeAuthSheet({ force: true });
      if (nextIntent === 'orders') {
        setOrdersOpen(true);
      }
      setAuthForm((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
      }));
    } catch (error) {
      console.error('Error iniciando sesion de tienda:', error);
      setAuthError('Correo, telefono o contrasena incorrectos.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStorePasswordReset = async () => {
    const credentials = resolveStoreLoginCredentials(authForm.email);
    const email = String(credentials.email || '').trim();

    if (!email) {
      setAuthNotice('');
      setAuthError('Para recuperar tu contrasena, escribe tu correo electronico.');
      return;
    }

    setAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      await requestStorePasswordReset({ email });
      setAuthNotice('Te enviamos un correo para recuperar tu contrasena. Revisa tambien spam o promociones.');
    } catch (error) {
      console.error('Error enviando recuperacion de contrasena:', error);
      if (error.code === 'EMAIL_REQUIRED') {
        setAuthError('Para recuperar tu contrasena, escribe tu correo electronico.');
      } else {
        setAuthError('No pudimos enviar la recuperacion. Revisa el correo e intenta de nuevo.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStoreGoogleLogin = async () => {
    setAuthLoading(true);
    setAuthError('');
    setAuthNotice('');

    try {
      const user = await loginStoreUserWithGoogle();
      setAuthProviderDraft(null);
      persistStoreSession(user);
      const nextIntent = pendingAuthIntent;
      closeAuthSheet({ force: true });
      if (nextIntent === 'orders') {
        setOrdersOpen(true);
      }
    } catch (error) {
      console.error('Error iniciando sesion con Google:', error);
      if (error.code === 'PROFILE_REQUIRED') {
        const authUser = error.authUser || {};
        setAuthProviderDraft({ provider: 'google', uid: authUser.uid });
        setAuthMode('register');
        setAuthForm((current) => ({
          ...current,
          nombre: authUser.nombre || current.nombre,
          email: authUser.email || current.email,
          password: '',
          confirmPassword: '',
        }));
        setAuthError('Completa telefono, direccion y punto del mapa para terminar tu cuenta.');
      } else {
        setAuthError(getGoogleAuthErrorMessage(error));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStoreRegister = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    setAuthNotice('');
    const isGoogleProfileCompletion = authProviderDraft?.provider === 'google';

    if (!isGoogleProfileCompletion && authForm.password !== authForm.confirmPassword) {
      setAuthLoading(false);
      setAuthError('Las contrasenas no coinciden.');
      return;
    }

    if (!isGoogleProfileCompletion && String(authForm.password || '').trim().length < 6) {
      setAuthLoading(false);
      setAuthError('La contrasena debe tener al menos 6 caracteres.');
      return;
    }

    if (!hasLocation(authForm.ubicacion)) {
      setAuthLoading(false);
      setAuthError('Debes guardar el punto exacto en el mapa antes de crear la cuenta.');
      return;
    }

    if (authForm.fechaCumpleanos && !normalizeBirthdayValue(authForm.fechaCumpleanos)) {
      setAuthLoading(false);
      setAuthError('Ingresa tu fecha de cumpleanos solo con dia y mes, por ejemplo 27/06.');
      return;
    }

    try {
      const user = isGoogleProfileCompletion
        ? await completeGoogleStoreUserProfile(authForm)
        : await registerStoreUser(authForm);
      setAuthProviderDraft(null);
      persistStoreSession(user);
      const nextIntent = pendingAuthIntent;
      closeAuthSheet({ force: true });
      if (nextIntent === 'orders') {
        setOrdersOpen(true);
      }
      setAuthForm({ ...EMPTY_STORE_AUTH_FORM });
    } catch (error) {
      console.error('Error registrando usuario de tienda:', error);
      if (error.code === 'USER_EXISTS') {
        setAuthError('Ese correo ya tiene cuenta. Inicia sesion.');
        setAuthMode('login');
      } else if (error.code === 'LOCATION_REQUIRED') {
        setAuthError('La ubicacion exacta en el mapa es obligatoria.');
      } else {
        setAuthError('Completa nombre, correo, telefono, direccion y el punto exacto del mapa.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProfileSave = async (profile) => {
    if (!currentUser) {
      return;
    }

    setSubmitting(true);
    try {
      const nextUser = await updateStoreUserProfile(currentUser, profile);
      persistStoreSession(nextUser);
      setProfileOpen(false);
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      alert(
        error.code === 'LOCATION_REQUIRED'
          ? 'Debes guardar la ubicacion exacta del mapa para actualizar tu perfil.'
          : 'No se pudo actualizar tu perfil.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openProduct = (product, options = {}) => {
    const currentQuantity = Number(cart[product.code] || 0);
    const shouldStartWithMinimum = options.prefillMinimum && currentQuantity <= 0;
    setSelectedProduct(product);
    setSelectedProductQuantity(shouldStartWithMinimum ? getMinQuantity(product) : currentQuantity);
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      alert('Enlace copiado.');
    } catch (error) {
      console.error('No se pudo copiar el enlace:', error);
      alert(publicStoreUrl);
    }
  };

  const openCustomerOrders = () => {
    if (!currentUser) {
      openAuthSheet('login', 'orders');
      return;
    }

    setOrdersOpen(true);
  };

  const openProfilePanel = () => {
    if (currentUser) {
      setProfileOpen(true);
      return;
    }

    openAuthSheet('login', 'guest');
  };

  const dismissOrderSuccess = () => {
    setOrderSuccessOpen(false);
    if (createdOrder) {
      setOrdersOpen(true);
    }
  };

  const handleClaimWelcomeCoupon = async () => {
    if (!currentUser?.key || !welcomeCoupon) {
      setWelcomeCouponOpen(false);
      return;
    }

    setWelcomeCouponActionBusy(true);

    try {
      const claimedCoupon = await claimStoreWelcomeCoupon({
        userKey: currentUser.key,
        welcomeCoupon,
      });

      const nextUser = {
        ...currentUser,
        welcomeCoupon: claimedCoupon,
      };

      persistStoreSession(nextUser);
      setWelcomeCouponOpen(false);

      if (
        Number(totalAmount || 0) >= Number(claimedCoupon.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM)
      ) {
        applyResolvedCoupon(claimedCoupon.coupon);
      } else {
        setCouponInput(claimedCoupon.coupon.code || '');
        setCouponMessage(getWelcomeCouponCartMessage(claimedCoupon, totalAmount));
      }
    } catch (error) {
      console.error('No se pudo activar el cupon de bienvenida:', error);
      alert('No pudimos activar tu cupon en este momento. Intenta nuevamente.');
    } finally {
      setWelcomeCouponActionBusy(false);
    }
  };

  const openRewardsPanel = (options = {}) => {
    if (!currentUser) {
      openAuthSheet('login', 'rewards');
      return;
    }

    const shouldCloseCheckout = options.closeCheckout === true;
    const nextReturnTarget = shouldCloseCheckout ? 'checkout' : '';
    setRewardsReturnTarget(nextReturnTarget);
    if (shouldCloseCheckout) {
      setCheckoutOpen(false);
    }
    setRewardsOpen(true);
  };

  const closeRewardsPanel = () => {
    const shouldReturnToCheckout = rewardsReturnTarget === 'checkout';
    setRewardsOpen(false);
    setRewardsReturnTarget('');
    if (shouldReturnToCheckout) {
      setCheckoutOpen(true);
    }
  };

  const handleSelectReward = (reward, selection = {}) => {
    if (!currentUser) {
      openAuthSheet('login', 'rewards');
      return;
    }

    const selectedSnapshot = buildStoreRewardRedemptionSnapshot(reward, selection, activeProducts);
    const shouldReturnToCheckout = rewardsReturnTarget === 'checkout';
    setSelectedRewardRedemption(selectedSnapshot);
    setRewardsOpen(false);
    setRewardsReturnTarget('');
    if (shouldReturnToCheckout) {
      setCheckoutOpen(true);
    }
  };

  const clearSelectedReward = () => {
    setSelectedRewardRedemption(null);
  };

  const submitOrder = async (event) => {
    event.preventDefault();

    if (!currentUser) {
      openAuthSheet('login', 'checkout');
      return;
    }

    if (cartItems.length === 0) {
      alert('Agrega al menos un producto.');
      return;
    }

    if (!pickupFlow && (!activeDeliveryAddress.direccion.trim() || !hasLocation(activeDeliveryAddress.ubicacion))) {
      if (deliveryMode === 'perfil') {
        alert('Completa tu direccion y guarda el punto exacto del mapa antes de enviar el pedido.');
        setProfileOpen(true);
      } else {
        alert('Completa la direccion alterna y guarda el punto exacto del mapa antes de enviar el pedido.');
      }
      return;
    }

    if (appliedCoupon) {
      const usageMessage = getCouponUsageMessage(appliedCoupon);
      if (usageMessage) {
        setAppliedCoupon(null);
        setCouponMessage(usageMessage);
        alert(usageMessage);
        return;
      }
    }

    setSubmitting(true);

    let reservedReward = null;

    try {
      const paymentMethod = normalizeCheckoutPayment(customer.metodoPago);
      const cashChangeText = String(customer.cambioPara || '').trim();
      const checkoutNotes = [
        notes.trim(),
        paymentMethod === STORE_CASH_PAYMENT && cashChangeText
          ? `Necesito cambio para: ${cashChangeText}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
      const fullAddress = activeDeliveryAddress.referencia
        ? `${activeDeliveryAddress.direccion} | Ref: ${activeDeliveryAddress.referencia}`
        : activeDeliveryAddress.direccion;

      if (selectedRewardRedemption && !selectedRewardDefinition) {
        throw new Error('El premio seleccionado ya no esta disponible.');
      }

      if (selectedRewardDefinition) {
        setRewardActionBusy(true);
        reservedReward = await reserveStoreRewardPoints({
          userKey: currentUser.key,
          reward: selectedRewardDefinition,
          selection: {
            choices: selectedRewardRedemption?.choiceSelections || {},
          },
          catalog: activeProducts,
          cartAmount: approximateTotalAmount,
          settings: rewardSettings,
        });
      }

      const order = await onCreateOrder(
        {
          cliente: currentUser.nombre,
          clienteCodigo: currentUser.codigo,
          clienteFirebaseKey: currentUser.clientKey,
          storeUserKey: currentUser.key,
          direccion: pickupFlow ? 'Pickup en tienda' : fullAddress,
          telefono: currentUser.telefono,
          referencia: pickupFlow ? '' : activeDeliveryAddress.referencia,
          ubicacion: pickupFlow ? null : activeDeliveryAddress.ubicacion,
          items: cartItems,
          subtotalEstimado: totalAmount,
          descuentoCupon: couponDiscount,
          cupon: appliedCoupon
            ? {
                code: appliedCoupon.code,
                title: appliedCoupon.title,
                type: appliedCoupon.type,
                value: appliedCoupon.value,
                minimum: appliedCoupon.minimum || 0,
                maxUsesPerUser: appliedCoupon.maxUsesPerUser || 0,
                assignedUserKey: appliedCoupon.assignedUserKey || '',
                campaignId: appliedCoupon.campaignId || '',
                autoApply: appliedCoupon.autoApply === true,
                personal: appliedCoupon.personal === true,
                welcomeCoupon: appliedCoupon.welcomeCoupon === true,
              }
            : null,
          total: approximateTotalAmount,
          estimatedRewardPoints,
          observaciones: checkoutNotes,
          metodoPago: paymentMethod,
          cambioPara: paymentMethod === STORE_CASH_PAYMENT ? cashChangeText : '',
          deliveryMode,
          fulfillmentType,
          rewardRedemption: reservedReward?.rewardSnapshot || null,
        },
        { channel: STORE_CHANNEL }
      );

      setCreatedOrder(order);
      setCart({});
      setAppliedCoupon(null);
      setCouponInput('');
      setCouponMessage('');
      setNotes('');
      setCustomer((current) => ({ ...current, cambioPara: '' }));
      setCheckoutOpen(false);
      setFulfillmentType(ORDER_FULFILLMENT_DELIVERY);
      setDeliveryMode('perfil');
      setAlternateDelivery(createEmptyDeliveryDraft());
      setSelectedRewardRedemption(null);
      setOrderSuccessOpen(true);
    } catch (error) {
      console.error('Error creando pedido virtual:', error);
      if (error.code === 'ORDER_LIMIT_REACHED') {
        alert('Hoy ya no quedan numeros disponibles.');
      } else if (error.code === 'INSUFFICIENT_POINTS' || error.code === 'MIN_PURCHASE_REQUIRED') {
        alert(error.message || 'No se pudo reservar el premio seleccionado.');
      } else {
        alert(
          error?.message ||
            'No se pudo enviar el pedido. Si el premio ya habia quedado reservado, el integrador lo liberara automaticamente.'
        );
      }
    } finally {
      setSubmitting(false);
      setRewardActionBusy(false);
    }
  };

  const renderStoreProductTile = (product) => {
    const quantity = Number(cart[product.code] || 0);

    return (
      <article key={product.code} className="store-product">
        <button
          type="button"
          className="store-product-card"
          aria-label={`Ver ${product.name}`}
          onClick={() => openProduct(product)}
        >
          <span className="store-product-media">
            <span className="store-product-image-shell">
              <span className="store-product-image">
                <img
                  src={product.image || LOGO_PATH}
                  alt={product.name}
                  loading="lazy"
                  decoding="async"
                />
              </span>
            </span>
          </span>
          <span className="store-product-code">{product.code}</span>
          <span className="store-product-name">{product.name}</span>
          <span className="store-price">{formatCurrency(product.price)}</span>
          <span className="store-unit">
            {quantity > 0
              ? `${formatStoreQuantity(quantity, product.unit)} ${product.unit} en carrito`
              : `C$ ${Number(product.price || 0).toFixed(2)}/${product.unit}`}
          </span>
        </button>
        <button
          type="button"
          className={`store-add ${quantity > 0 ? 'has-quantity' : ''}`}
          title="Agregar"
          aria-label={`Agregar ${product.name}`}
          onClick={() => openProduct(product, { prefillMinimum: true })}
        >
          {quantity > 0 ? formatStoreQuantity(quantity, product.unit) : '+'}
        </button>
      </article>
    );
  };

  return (
    <div className="store-shell">
      <style>{`
        .store-shell {
          ${SAN_MARTIN_STORE_CSS_VARS}
          min-height: ${isDashboard ? 'calc(100vh - 64px)' : '100vh'};
          position: relative;
          isolation: isolate;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 12% 12%, rgba(29, 116, 199, 0.1), transparent 28%),
            radial-gradient(circle at 88% 28%, rgba(220, 38, 38, 0.08), transparent 30%),
            linear-gradient(180deg, #f8fbff 0%, #eef6ff 48%, #f5f8fc 100%);
          color: var(--sm-text);
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }
        .store-shell::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          opacity: 0.24;
          background-image: url("data:image/svg+xml,%3Csvg width='420' height='420' viewBox='0 0 420 420' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%230c4b85' stroke-width='5' stroke-linecap='round' stroke-linejoin='round' opacity='.24'%3E%3Cpath d='M40 85 C82 42 128 42 170 85 S258 128 300 85'/%3E%3Cpath d='M54 138 C96 96 142 96 184 138 S272 180 314 138'/%3E%3Ccircle cx='330' cy='72' r='34' stroke-width='18'/%3E%3Cpath d='M80 302 C96 252 160 246 188 288 C204 314 184 348 142 354 C96 360 66 334 80 302Z'/%3E%3Cpath d='M250 300 C264 260 326 256 340 300Z'/%3E%3Cpath d='M252 308 H342 M270 334 C286 350 316 350 334 334'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 420px 420px;
          background-position: 3% 8%;
        }
        .store-shell * {
          box-sizing: border-box;
        }
        .store-page {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
          padding: ${isDashboard ? '18px' : '12px'} 18px 108px;
        }
        .store-page.with-floating-cart {
          max-width: 1500px;
        }
        .store-auth-page {
          position: relative;
          z-index: 1;
          min-height: ${isDashboard ? 'calc(100vh - 64px)' : '100vh'};
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          margin: 0 auto;
          padding: 44px 18px;
          background:
            radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.12), transparent 18%),
            radial-gradient(circle at 82% 16%, rgba(92, 170, 244, 0.18), transparent 24%),
            linear-gradient(135deg, rgba(8, 26, 49, 0.96), rgba(12, 77, 136, 0.94) 48%, rgba(220, 38, 38, 0.8));
          overflow: hidden;
        }
        .store-auth-page::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image: url("data:image/svg+xml,%3Csvg width='520' height='520' viewBox='0 0 520 520' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23fff7ef' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='92' cy='82' r='35' stroke-width='17'/%3E%3Cpath d='M322 78 l64 28 l-44 48 z M334 102 l34 12 M326 130 l30 9'/%3E%3Cpath d='M76 356 C98 300 162 296 190 342 C206 370 182 408 136 414 C92 420 58 390 76 356Z M112 344 C132 326 160 330 168 352'/%3E%3Cpath d='M328 346 C342 302 408 300 426 346Z M330 356 H428 M352 382 C370 400 404 400 422 382'/%3E%3Cpath d='M34 198 C78 154 128 154 172 198 S266 242 310 198'/%3E%3Cpath d='M204 472 C248 428 298 428 342 472 S436 516 480 472'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 520px 520px;
          background-position: 6% 10%;
        }
        .store-auth-card {
          position: relative;
          z-index: 1;
          width: min(450px, 100%);
          background: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 20px;
          padding: 30px 32px 32px;
          box-shadow: 0 28px 80px rgba(10, 42, 78, 0.22);
        }
        .store-auth-card.inline {
          width: 100%;
          padding: 6px 2px 2px;
          background: transparent;
          border: 0;
          border-radius: 0;
          box-shadow: none;
        }
        .store-auth-card.inline .store-auth-brand {
          text-align: left;
          margin-bottom: 18px;
        }
        .store-auth-card.inline .store-auth-brand .store-logo {
          margin: 0 0 12px;
        }
        .store-auth-guest-card {
          margin-top: 14px;
        }
        .store-auth-guest-button {
          width: 100%;
        }
        .store-auth-guest-card p {
          margin: 10px 0 0;
          color: var(--sm-text-soft);
          font-size: 13px;
          line-height: 1.5;
          text-align: center;
          font-weight: 700;
        }
        .store-auth-brand {
          text-align: center;
          margin-bottom: 22px;
        }
        .store-auth-brand .store-logo {
          width: 72px;
          height: 72px;
          margin: 0 auto 12px;
          border-radius: 18px;
          box-shadow: 0 18px 40px rgba(12, 77, 136, 0.14);
        }
        .store-auth-brand h1 {
          margin: 0;
          color: var(--sm-text);
          font-size: 24px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .store-auth-brand p {
          margin: 10px 0 0;
          color: var(--sm-text-soft);
          font-size: 14px;
          font-weight: 800;
        }
        .store-auth-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
          padding: 4px;
          border-radius: 999px;
          background: #f3f4f6;
        }
        .store-auth-toggle button {
          border: 0;
          border-radius: 999px;
          padding: 11px;
          background: transparent;
          cursor: pointer;
          font-weight: 900;
          color: #6b7280;
        }
        .store-auth-toggle button.active {
          background: var(--sm-primary-gradient);
          color: #ffffff;
          box-shadow: 0 10px 22px rgba(12, 77, 136, 0.22);
        }
        .store-auth-error {
          border-radius: 12px;
          padding: 10px 12px;
          background: #fee2e2;
          color: #991b1b;
          font-size: 13px;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .store-auth-notice {
          border-radius: 12px;
          padding: 10px 12px;
          background: #ecfdf5;
          color: #047857;
          font-size: 13px;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .store-auth-link-button {
          justify-self: end;
          border: 0;
          padding: 0 2px 4px;
          background: transparent;
          color: var(--sm-blue-deep);
          font-size: 13px;
          font-weight: 950;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .store-auth-link-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .store-google-button {
          width: 100%;
          justify-content: center;
          gap: 10px;
          margin-bottom: 12px;
          background: #ffffff;
        }
        .store-auth-card .store-button {
          background: linear-gradient(135deg, #0c4d88 0%, #3b82f6 100%);
          color: #ffffff;
          box-shadow: 0 16px 30px rgba(12, 77, 136, 0.24);
        }
        .store-auth-card .store-button.secondary {
          background: linear-gradient(135deg, rgba(12, 77, 136, 0.08), rgba(59, 130, 246, 0.12));
          color: var(--sm-blue-deep);
          border: 1px solid rgba(12, 77, 136, 0.16);
          box-shadow: none;
        }
        .store-auth-card .store-google-button {
          background: linear-gradient(135deg, rgba(12, 77, 136, 0.08), rgba(59, 130, 246, 0.12));
          border-color: rgba(12, 77, 136, 0.16);
          color: var(--sm-blue-deep);
        }
        .store-google-mark {
          width: 24px;
          height: 24px;
          display: inline-grid;
          place-items: center;
          border-radius: 999px;
          background: conic-gradient(from -40deg, #4285f4, #34a853, #fbbc05, #ea4335, #4285f4);
          color: #ffffff;
          font-size: 13px;
          font-weight: 950;
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.72);
        }
        .store-account-card {
          margin: 0 0 14px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .store-account-card strong {
          display: block;
        }
        .store-account-card span {
          display: block;
          margin-top: 2px;
          color: #6b7280;
          font-size: 13px;
          font-weight: 700;
        }
        .store-account-card.guest {
          border-color: rgba(12, 77, 136, 0.14);
          background: linear-gradient(135deg, rgba(12, 77, 136, 0.08), rgba(220, 38, 38, 0.05));
        }
        .store-account-card.guest strong {
          font-size: 15px;
          color: var(--sm-text);
        }
        .store-account-card.guest span {
          color: var(--sm-text-soft);
        }
        .store-inline-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .store-admin-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          padding: 12px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .store-top {
          position: sticky;
          top: ${isDashboard ? '64px' : '0'};
          z-index: 80;
          background: rgba(247, 251, 255, 0.92);
          backdrop-filter: blur(12px);
          padding: 8px 0 12px;
          display: grid;
          gap: 12px;
          overflow: clip;
        }
        .store-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          min-width: 0;
        }
        .store-brand-main {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
        }
        .store-brand-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }
        .store-brand-kicker {
          display: inline-flex;
          align-items: center;
          color: var(--sm-blue-deep);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .store-logo {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          object-fit: contain;
          background: transparent;
          box-shadow: 0 12px 24px rgba(12, 77, 136, 0.08);
        }
        .store-title {
          font-size: 24px;
          font-weight: 950;
          line-height: 1.02;
          letter-spacing: -0.03em;
        }
        .store-brand-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-shrink: 0;
        }
        .store-icon-button,
        .store-order-status-button,
        .store-button,
        .store-chip,
        .store-back,
        .store-add {
          border: 0;
          cursor: pointer;
          font-family: inherit;
          transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }
        .store-icon-button:hover,
        .store-order-status-button:hover,
        .store-button:hover,
        .store-chip:hover,
        .store-back:hover,
        .store-add:hover {
          transform: translateY(-1px);
        }
        .store-icon-button {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f9ff 100%);
          border: 1px solid rgba(12, 77, 136, 0.12);
          color: var(--sm-text);
          font-size: 18px;
          font-weight: 900;
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.06);
        }
        .store-profile-button {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .store-profile-icon {
          width: 18px;
          height: 18px;
          display: block;
        }
        .store-profile-indicator {
          position: absolute;
          top: 5px;
          right: 5px;
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: #ef4444;
          border: 2px solid #ffffff;
        }
        .store-order-status-button {
          min-height: 42px;
          border-radius: 999px;
          padding: 0 15px;
          background: linear-gradient(135deg, #0b1220, #0c4b85 62%, #dc2626);
          color: #fffaf5;
          box-shadow: 0 14px 28px rgba(10, 42, 78, 0.24);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .store-search-wrap {
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          border: 1px solid rgba(12, 77, 136, 0.12);
          border-radius: 26px;
          padding: 0 18px;
          min-height: 58px;
          box-shadow: 0 18px 34px rgba(15, 23, 42, 0.06);
        }
        .store-search {
          width: 100%;
          border: 0;
          outline: 0;
          font-size: 16px;
          font-weight: 800;
          background: transparent;
        }
        .store-search-tag {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(12, 77, 136, 0.08);
          color: var(--sm-blue-deep);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .store-filters-panel {
          border: 1px solid rgba(12, 77, 136, 0.12);
          border-radius: 28px;
          padding: 16px 16px 14px;
          background:
            radial-gradient(circle at top right, rgba(92, 170, 244, 0.3), transparent 32%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 250, 255, 0.98) 100%);
          box-shadow: 0 20px 44px rgba(12, 77, 136, 0.08);
        }
        .store-filter-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 0 4px 10px;
        }
        .store-filter-strip strong {
          display: block;
          color: #111827;
          font-size: 19px;
          font-weight: 950;
          letter-spacing: -0.02em;
        }
        .store-filter-strip span {
          display: block;
          margin-top: 4px;
          color: var(--sm-text-soft);
          font-size: 13px;
          font-weight: 800;
        }
        .store-filter-kicker {
          display: inline-flex;
          align-items: center;
          min-height: 32px;
          padding: 0 12px;
          border-radius: 999px;
          background: rgba(12, 77, 136, 0.08);
          color: var(--sm-blue-deep);
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .store-tabs {
          display: flex;
          gap: 14px;
          overflow-x: auto;
          padding: 6px 2px 10px;
          scrollbar-width: none;
        }
        .store-subtabs {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 6px 2px 2px;
          scrollbar-width: none;
        }
        .store-tabs::-webkit-scrollbar,
        .store-subtabs::-webkit-scrollbar {
          display: none;
        }
        .store-chip {
          flex: 0 0 auto;
          min-height: 54px;
          padding: 14px 20px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff 0%, #f4f9ff 100%);
          color: #4b5563;
          border: 1px solid #d9e8f7;
          box-shadow: 0 12px 24px rgba(12, 77, 136, 0.08);
          font-size: 14px;
          font-weight: 900;
          position: relative;
          overflow: hidden;
        }
        .store-chip::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.45), transparent 58%);
          opacity: 0;
          transition: opacity 0.2s ease;
          pointer-events: none;
        }
        .store-chip:hover::before,
        .store-chip.active::before {
          opacity: 1;
        }
        .store-chip:hover {
          box-shadow: 0 16px 30px rgba(12, 77, 136, 0.14);
        }
        .store-chip.active {
          background: linear-gradient(135deg, #0b1220, #0c4b85 58%, #dc2626);
          color: #ffffff;
          border-color: transparent;
          box-shadow: 0 16px 28px rgba(10, 42, 78, 0.22);
        }
        .store-filter-chip {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          min-width: 150px;
          gap: 5px;
          text-align: left;
        }
        .store-filter-chip.compact {
          min-width: auto;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          padding-right: 14px;
        }
        .store-filter-label,
        .store-filter-pill-label {
          display: block;
          font-size: 15px;
          font-weight: 950;
          line-height: 1.08;
        }
        .store-filter-meta {
          display: block;
          color: var(--sm-text-soft);
          font-size: 12px;
          font-weight: 800;
        }
        .store-filter-badge {
          min-width: 30px;
          height: 30px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0 10px;
          background: rgba(12, 77, 136, 0.08);
          color: var(--sm-blue-deep);
          font-size: 12px;
          font-weight: 950;
          line-height: 1;
        }
        .store-chip.active .store-filter-meta {
          color: rgba(255, 250, 245, 0.8);
        }
        .store-chip.active .store-filter-badge {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .store-subtabs .store-chip {
          min-height: 46px;
          padding: 10px 16px;
          font-size: 14px;
          background: rgba(255, 255, 255, 0.96);
          color: var(--sm-blue-deep);
          border-color: #d7e6f7;
          box-shadow: 0 10px 20px rgba(12, 77, 136, 0.06);
        }
        .store-subtabs .store-chip.active {
          background: var(--sm-black);
          border-color: var(--sm-black);
          color: #ffffff;
          box-shadow: 0 14px 28px rgba(17, 24, 39, 0.2);
        }
        .store-subtabs .store-filter-chip.compact {
          padding-right: 16px;
        }
        .store-subtabs .store-chip.active .store-filter-badge {
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }
        .store-promo {
          margin: 0;
          padding: 14px 16px 12px;
          border: 1px solid rgba(12, 77, 136, 0.12);
          border-radius: 28px;
          background:
            radial-gradient(circle at top right, rgba(92, 170, 244, 0.26), transparent 34%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 250, 255, 0.98) 100%);
          box-shadow: 0 20px 44px rgba(12, 77, 136, 0.08);
        }
        .store-section-title {
          font-size: 20px;
          font-weight: 900;
          margin: 0 0 12px;
          letter-spacing: -0.02em;
        }
        .store-stories {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding: 4px 2px 8px;
          align-items: flex-start;
          scroll-snap-type: x proximity;
        }
        .store-story {
          flex: 0 0 86px;
          min-height: 122px;
          border: 0;
          background: transparent;
          color: #111827;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.15;
          cursor: pointer;
          padding: 0;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 8px;
          scroll-snap-align: start;
        }
        .store-story-ring {
          width: 74px;
          height: 74px;
          margin: 0;
          border-radius: 999px;
          padding: 3px;
          background: conic-gradient(from 160deg, #fbbf24, #ef4444, #991b1b, #fbbf24);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 24px rgba(153, 27, 27, 0.16);
          flex: 0 0 auto;
          transition: transform 0.24s ease, box-shadow 0.24s ease;
        }
        .store-story-ring img {
          width: 100%;
          height: 100%;
          border: 3px solid #ffffff;
          border-radius: 999px;
          object-fit: cover;
          background: #ffffff;
        }
        .store-story:hover .store-story-ring {
          transform: translateY(-1px);
        }
        .store-story-title {
          display: block;
          white-space: normal;
          width: 100%;
          min-height: 30px;
          text-wrap: balance;
          overflow: hidden;
        }
        .store-story-viewer-overlay {
          position: fixed;
          inset: 0;
          z-index: 240;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .store-story-viewer {
          position: relative;
          width: min(430px, calc(100vw - 24px), calc((100vh - 24px) * 0.5625));
          aspect-ratio: 9 / 16;
          border-radius: 28px;
          overflow: hidden;
          background:
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%),
            linear-gradient(180deg, #1f2937 0%, #0f172a 100%);
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.45);
        }
        .store-story-viewer img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .store-story-progress {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          z-index: 5;
          display: flex;
          gap: 6px;
        }
        .store-story-progress-track {
          flex: 1;
          height: 4px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.28);
        }
        .store-story-progress-fill {
          display: block;
          width: 0;
          height: 100%;
          border-radius: inherit;
          background: #ffffff;
        }
        .store-story-progress-fill.active {
          animation: storeStoryProgress linear forwards;
        }
        .store-story-progress-fill.done {
          width: 100%;
        }
        @keyframes storeStoryProgress {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }
        .store-story-viewer-head {
          position: absolute;
          top: 28px;
          left: 18px;
          right: 18px;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: #ffffff;
        }
        .store-story-viewer-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .store-story-viewer-count {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.72);
        }
        .store-story-viewer-meta strong {
          font-size: 16px;
          line-height: 1.1;
          text-shadow: 0 2px 16px rgba(15, 23, 42, 0.6);
        }
        .store-story-close {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.48);
          color: #ffffff;
          font-size: 0;
          line-height: 1;
          backdrop-filter: blur(12px);
        }
        .store-story-close::before {
          content: 'x';
          font-size: 28px;
          line-height: 1;
        }
        .store-story-frame {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .store-story-scrim {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 2;
          pointer-events: none;
        }
        .store-story-scrim.top {
          top: 0;
          height: 28%;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0) 100%);
        }
        .store-story-scrim.bottom {
          bottom: 0;
          height: 14%;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.28) 100%);
        }
        .store-story-nav {
          position: absolute;
          inset: 0;
          z-index: 3;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .store-story-nav button {
          border: 0;
          background: transparent;
          cursor: pointer;
          touch-action: manipulation;
        }
        .store-story-nav button:disabled {
          cursor: default;
        }
        .store-product-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin: 18px 0 14px;
        }
        .store-grouped-sections {
          display: grid;
          gap: 20px;
        }
        .store-product-group {
          padding: 16px 16px 18px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 247, 243, 0.92));
          border: 1px solid rgba(123, 16, 34, 0.08);
          box-shadow: 0 16px 34px rgba(15, 23, 42, 0.06);
        }
        .store-product-group-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .store-product-group-kicker {
          display: inline-flex;
          align-items: center;
          min-height: 26px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(123, 16, 34, 0.08);
          color: #7b1022;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .store-product-group-title {
          margin: 6px 0 0;
          color: #111827;
          font-size: 24px;
          line-height: 1.05;
          font-weight: 950;
        }
        .store-product-group-meta {
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .store-product-group-footer {
          display: flex;
          justify-content: center;
          margin-top: 14px;
        }
        .store-product-group-more {
          min-width: 190px;
        }
        .store-count {
          margin: 0;
          font-size: 26px;
          line-height: 1;
          font-weight: 900;
        }
        .store-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .store-grid-skeleton {
          pointer-events: none;
        }
        .store-product {
          position: relative;
          min-width: 0;
          display: flex;
        }
        .store-product-skeleton {
          display: grid;
          gap: 10px;
        }
        .store-product-card {
          position: relative;
          width: 100%;
          min-width: 0;
          border: 0;
          background: transparent;
          padding: 6px 4px 10px;
          color: inherit;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 5px;
          cursor: pointer;
          transform: translateZ(0);
          transition: transform 0.24s ease, filter 0.24s ease;
        }
        .store-product-card::before,
        .store-product-card::after {
          content: none;
        }
        .store-product-card > * {
          position: relative;
          z-index: 1;
        }
        .store-product:hover .store-product-card {
          transform: translateY(-4px);
          filter: saturate(1.03);
        }
        .store-product:active .store-product-card,
        .store-product-card:focus-visible {
          transform: translateY(-1px) scale(0.985);
        }
        .store-product-card:focus-visible {
          outline: 3px solid rgba(123, 16, 34, 0.3);
          outline-offset: 4px;
        }
        .store-product-media {
          width: 100%;
          display: block;
          padding: 7px;
          border-radius: 28px;
          background: linear-gradient(145deg, rgba(123, 16, 34, 0.12), rgba(255, 227, 214, 0.88));
          box-shadow: 0 14px 26px rgba(123, 16, 34, 0.1);
        }
        .store-product-image-shell {
          display: block;
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 24px;
          background: linear-gradient(180deg, #ffffff 0%, #fff5ef 100%);
          border: 1px solid rgba(255, 255, 255, 0.72);
          overflow: hidden;
        }
        .store-product-image {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .store-product-image img {
          width: 88%;
          height: 88%;
          object-fit: contain;
          transition: transform 0.28s ease;
        }
        .store-product:hover .store-product-image img {
          transform: scale(1.04);
        }
        .store-skeleton-media,
        .store-skeleton-line {
          position: relative;
          overflow: hidden;
          background: linear-gradient(90deg, #f3f4f6 0%, #eceff3 50%, #f3f4f6 100%);
          background-size: 200% 100%;
          animation: storeSkeletonPulse 1.2s ease-in-out infinite;
        }
        .store-skeleton-media {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 8px;
        }
        .store-skeleton-line {
          border-radius: 999px;
          height: 14px;
        }
        .store-skeleton-line.title {
          width: 88%;
          height: 16px;
        }
        .store-skeleton-line.price {
          width: 42%;
        }
        .store-skeleton-line.meta {
          width: 58%;
        }
        .store-add {
          position: absolute;
          top: 10px;
          right: 6px;
          min-width: 56px;
          height: 56px;
          padding: 0 16px;
          border-radius: 999px;
          background: linear-gradient(135deg, #b91c1c, #ef4444);
          color: #ffffff;
          font-size: 24px;
          font-weight: 950;
          line-height: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 16px 32px rgba(185, 28, 28, 0.24);
          border: 0;
          z-index: 3;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }
        .store-add.has-quantity {
          min-width: 64px;
          font-size: 14px;
          letter-spacing: -0.01em;
        }
        .store-add:hover {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 20px 38px rgba(185, 28, 28, 0.3);
          filter: saturate(1.06);
        }
        .store-product-code {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 20px;
          align-self: flex-start;
          padding: 0 8px;
          border-radius: 999px;
          background: rgba(123, 16, 34, 0.08);
          color: #7b1022;
          font-size: 9px;
          font-weight: 950;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .store-product-name {
          display: block;
          margin: 0;
          min-height: 34px;
          color: #111827;
          font-size: 13px;
          line-height: 1.2;
          font-weight: 850;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .store-price {
          display: block;
          margin: 0;
          font-size: 17px;
          font-weight: 950;
          color: #7b1022;
        }
        .store-unit {
          display: block;
          margin: 0;
          color: #6b7280;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.32;
        }
        .store-empty {
          padding: 34px;
          border: 1px dashed #d1d5db;
          border-radius: 8px;
          color: #6b7280;
          text-align: center;
        }
        .store-auth-choice-card {
          margin-top: 0;
          border: 1px solid rgba(123, 16, 34, 0.12);
          background: linear-gradient(180deg, #fffdfc 0%, #fff6f3 100%);
        }
        .store-auth-choice-card p {
          margin: 10px 0 0;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }
        .store-auth-inline-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .store-auth-inline-actions .store-button {
          flex: 1 1 180px;
        }
        .store-auth-inline-note {
          margin-top: 12px;
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
        }
        .store-auth-choice-divider {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 14px 0 10px;
          color: #9f6b70;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .store-auth-choice-divider::before,
        .store-auth-choice-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: rgba(123, 16, 34, 0.14);
        }
        @keyframes storeSkeletonPulse {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
        .store-floating-cart {
          position: fixed;
          top: ${isDashboard ? '148px' : '132px'};
          right: max(18px, calc((100vw - 1500px) / 2 + 18px));
          z-index: 110;
          width: 300px;
          max-height: calc(100vh - 170px);
          border: 1px solid rgba(123, 16, 34, 0.12);
          border-radius: 26px;
          background: rgba(255, 255, 255, 0.92);
          color: #111827;
          overflow: hidden;
          box-shadow: 0 26px 70px rgba(123, 16, 34, 0.18);
          backdrop-filter: blur(18px);
        }
        .store-floating-cart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 16px 12px;
          background: linear-gradient(135deg, rgba(123, 16, 34, 0.08), rgba(217, 74, 63, 0.04));
        }
        .store-floating-cart-head strong {
          display: block;
          font-size: 16px;
        }
        .store-floating-cart-head span {
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
        }
        .store-floating-cart-items {
          max-height: 290px;
          overflow: auto;
          padding: 6px 14px 2px;
        }
        .store-floating-cart-item {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid #f0e6e7;
        }
        .store-floating-cart-item:last-child {
          border-bottom: 0;
        }
        .store-floating-cart-thumb {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          object-fit: contain;
          background: #fff7f4;
          border: 1px solid #f1dfe0;
        }
        .store-floating-cart-name {
          margin: 0 0 6px;
          color: #374151;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.25;
        }
        .store-floating-cart-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .store-floating-cart-controls button {
          width: 26px;
          height: 26px;
          border: 1px solid #ead8da;
          border-radius: 999px;
          background: #ffffff;
          color: #7b1022;
          cursor: pointer;
          font-weight: 950;
        }
        .store-floating-cart-controls strong {
          margin-left: auto;
          color: #111827;
          font-size: 12px;
          white-space: nowrap;
        }
        .store-floating-qty-input,
        .store-qty-input {
          min-width: 0;
          border: 1px solid #ead8da;
          border-radius: 999px;
          background: #ffffff;
          color: #111827;
          font: inherit;
          font-weight: 900;
          text-align: center;
          outline: 0;
        }
        .store-floating-qty-input {
          width: 64px;
          height: 28px;
          font-size: 12px;
        }
        .store-floating-cart-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px 16px;
          border-top: 1px solid #f0e6e7;
        }
        .store-floating-cart-total small {
          display: block;
          color: #9f6b70;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .store-floating-cart-total strong {
          display: block;
          margin-top: 2px;
          color: #111827;
          font-size: 18px;
        }
        .store-floating-cart-total span {
          display: block;
          margin-top: 2px;
          color: #047857;
          font-size: 12px;
          font-weight: 900;
        }
        .store-floating-cart-total em {
          display: block;
          margin-top: 2px;
          color: #9f6b70;
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
        }
        .store-quantity-notice {
          position: fixed;
          left: 50%;
          bottom: 28px;
          z-index: 260;
          transform: translateX(-50%);
          width: min(460px, calc(100vw - 28px));
          border-radius: 999px;
          padding: 13px 18px;
          background: #7b1022;
          color: #fffaf5;
          text-align: center;
          font-size: 14px;
          font-weight: 950;
          box-shadow: 0 18px 42px rgba(123, 16, 34, 0.24);
        }
        .store-button {
          border-radius: 999px;
          padding: 12px 18px;
          background: #ef4444;
          color: #ffffff;
          font-weight: 900;
          font-size: 14px;
        }
        .store-button.secondary {
          background: #ffffff;
          color: #111827;
          border: 1px solid #e5e7eb;
        }
        .store-checkout-sheet .store-button {
          background: var(--sm-primary-gradient);
          color: #ffffff;
          box-shadow: 0 16px 30px rgba(12, 77, 136, 0.24);
        }
        .store-checkout-sheet .store-button.secondary {
          background: #ffffff;
          color: var(--sm-blue-deep);
          border: 1px solid rgba(12, 77, 136, 0.16);
          box-shadow: none;
        }
        .store-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }
        .store-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(17, 24, 39, 0.38);
          display: flex;
          align-items: end;
          justify-content: center;
        }
        .store-sheet-overlay.auth-overlay {
          align-items: center;
          padding: 20px;
          background: rgba(8, 26, 49, 0.52);
          backdrop-filter: blur(12px);
        }
        .store-sheet-overlay.product-overlay {
          padding: 20px;
          align-items: center;
          background: rgba(17, 24, 39, 0.58);
          backdrop-filter: blur(14px);
        }
        .store-auth-sheet {
          position: relative;
          width: min(980px, calc(100vw - 24px));
          max-height: calc(100vh - 24px);
          overflow: auto;
          border-radius: 32px;
          padding: 26px 20px;
          background:
            radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.12), transparent 18%),
            radial-gradient(circle at 82% 16%, rgba(92, 170, 244, 0.18), transparent 24%),
            linear-gradient(135deg, rgba(8, 26, 49, 0.96), rgba(12, 77, 136, 0.94) 48%, rgba(220, 38, 38, 0.8));
          box-shadow: 0 34px 90px rgba(10, 42, 78, 0.3);
        }
        .store-auth-sheet::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image: url("data:image/svg+xml,%3Csvg width='520' height='520' viewBox='0 0 520 520' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23fff7ef' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='92' cy='82' r='35' stroke-width='17'/%3E%3Cpath d='M322 78 l64 28 l-44 48 z M334 102 l34 12 M326 130 l30 9'/%3E%3Cpath d='M76 356 C98 300 162 296 190 342 C206 370 182 408 136 414 C92 420 58 390 76 356Z M112 344 C132 326 160 330 168 352'/%3E%3Cpath d='M328 346 C342 302 408 300 426 346Z M330 356 H428 M352 382 C370 400 404 400 422 382'/%3E%3Cpath d='M34 198 C78 154 128 154 172 198 S266 242 310 198'/%3E%3Cpath d='M204 472 C248 428 298 428 342 472 S436 516 480 472'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 520px 520px;
          background-position: 6% 10%;
        }
        .store-auth-sheet > * {
          position: relative;
          z-index: 1;
        }
        .store-auth-sheet .store-sheet-head {
          width: min(450px, 100%);
          margin: 0 auto 18px;
          color: #ffffff;
          justify-content: space-between;
        }
        .store-auth-sheet .store-sheet-head strong {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.02em;
        }
        .store-auth-sheet .store-auth-card.inline {
          width: min(450px, 100%);
          margin: 0 auto;
          padding: 30px 32px 32px;
          background: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 20px;
          box-shadow: 0 28px 80px rgba(10, 42, 78, 0.22);
        }
        .store-auth-sheet .store-auth-card.inline .store-auth-brand {
          text-align: center;
          margin-bottom: 22px;
        }
        .store-auth-sheet .store-auth-card.inline .store-auth-brand .store-logo {
          margin: 0 auto 12px;
        }
        .store-sheet {
          width: min(720px, 100%);
          max-height: calc(100vh - 28px);
          overflow: auto;
          background: #ffffff;
          border-radius: 18px 18px 0 0;
          padding: 16px;
          box-shadow: 0 -18px 42px rgba(15, 23, 42, 0.18);
        }
        .store-sheet.full {
          width: min(980px, 100%);
        }
        .store-checkout-sheet {
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          border: 1px solid rgba(12, 77, 136, 0.12);
          box-shadow: 0 -18px 42px rgba(12, 77, 136, 0.16);
        }
        .store-product-sheet {
          width: min(980px, calc(100vw - 40px));
          max-height: calc(100vh - 40px);
          border-radius: 32px;
          padding: 22px;
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.28);
        }
        .store-back {
          min-width: 56px;
          height: 46px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 0 16px 0 12px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff 0%, #fff1f2 100%);
          color: #111827;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.1);
          border: 1px solid rgba(123, 16, 34, 0.12);
        }
        .store-back-icon {
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0;
          line-height: 1;
          position: relative;
        }
        .store-back-icon::before {
          content: '';
          width: 10px;
          height: 10px;
          display: block;
          border-left: 2.8px solid currentColor;
          border-bottom: 2.8px solid currentColor;
          transform: rotate(45deg);
          margin-left: 3px;
        }
        .store-back-label {
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }
        .store-checkout-sheet .store-back {
          background: linear-gradient(180deg, #ffffff 0%, #f4faff 100%);
          color: var(--sm-blue-deep);
          border: 1px solid rgba(12, 77, 136, 0.16);
        }
        .store-sheet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .store-sheet-head.product {
          position: sticky;
          top: -22px;
          z-index: 6;
          margin: -22px -22px 18px;
          padding: 18px 22px 12px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.86) 78%, rgba(255, 255, 255, 0) 100%);
          backdrop-filter: blur(10px);
        }
        .store-product-sheet-heading {
          min-width: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
          text-align: right;
        }
        .store-product-sheet-heading span {
          color: #7b1022;
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .store-product-sheet-heading strong {
          max-width: min(460px, 52vw);
          color: #111827;
          font-size: 18px;
          line-height: 1.08;
          text-wrap: balance;
        }
        .store-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 18px;
          align-items: start;
        }
        .store-detail-image {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 28px;
          background: linear-gradient(180deg, #fff8f5 0%, #ffffff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #ead8da;
          padding: 16px;
        }
        .store-detail-image img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .store-qty-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 16px 0;
        }
        .store-stepper {
          display: grid;
          grid-template-columns: 48px 1fr 48px;
          gap: 8px;
          align-items: center;
          margin-bottom: 14px;
        }
        .store-stepper button {
          height: 46px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          font-size: 24px;
          font-weight: 900;
          cursor: pointer;
        }
        .store-stepper strong {
          height: 46px;
          border-radius: 999px;
          background: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .store-stepper .store-qty-input {
          width: 100%;
          height: 46px;
          font-size: 18px;
        }
        .store-form {
          display: grid;
          gap: 10px;
        }
        .store-field-stack {
          display: grid;
          gap: 6px;
        }
        .store-field-caption {
          color: #6b7280;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.01em;
          padding-left: 2px;
        }
        .store-field-note {
          color: #8b1e2d;
          font-size: 12px;
          font-weight: 700;
          line-height: 1.4;
          padding-left: 2px;
        }
        .store-field,
        .store-input,
        .store-textarea,
        .store-select {
          width: 100%;
          min-height: 46px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          outline: 0;
          font: inherit;
          background: #ffffff;
        }
        .store-textarea {
          min-height: 88px;
          resize: vertical;
        }
        .store-coupon-card {
          display: grid;
          gap: 10px;
          border: 1px solid #f1dfe0;
          border-radius: 16px;
          padding: 12px;
          background: linear-gradient(135deg, rgba(123, 16, 34, 0.06), rgba(255, 247, 244, 0.82));
        }
        .store-coupon-card strong {
          display: block;
          color: #111827;
        }
        .store-checkout-sheet .store-coupon-card {
          border: 1px solid rgba(12, 77, 136, 0.14);
          background: linear-gradient(180deg, #ffffff 0%, #f4faff 100%);
        }
        .store-coupon-card span,
        .store-coupon-card p {
          margin: 3px 0 0;
          color: #7b1022;
          font-size: 12px;
          font-weight: 800;
        }
        .store-checkout-sheet .store-coupon-card span,
        .store-checkout-sheet .store-coupon-card p {
          color: var(--sm-blue-deep);
        }
        .store-coupon-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
        }
        .store-coupon-discount,
        .store-total-note div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .store-coupon-discount {
          border-top: 1px solid #ead8da;
          padding-top: 8px;
        }
        .store-checkout-sheet .store-coupon-discount {
          border-top: 1px solid rgba(12, 77, 136, 0.14);
        }
        .store-coupon-discount strong {
          color: #047857;
        }
        .store-total-note {
          border: 1px solid #fde2e2;
          border-radius: 16px;
          padding: 13px;
          background: #fff7f4;
        }
        .store-checkout-sheet .store-total-note {
          border: 1px solid rgba(12, 77, 136, 0.14);
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
        }
        .store-total-note span {
          color: #7b1022;
          font-size: 13px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .store-checkout-sheet .store-total-note span {
          color: var(--sm-blue-deep);
        }
        .store-total-note strong {
          color: #111827;
          font-size: 22px;
        }
        .store-total-note p {
          margin: 8px 0 0;
          color: #7c5b5f;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.4;
        }
        .store-checkout-sheet .store-total-note p {
          color: var(--sm-text-soft);
        }
        .store-checkout-progress {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 4px;
          margin: -2px 0 14px;
          border-radius: 999px;
          background: #f7f7f8;
        }
        .store-checkout-sheet .store-checkout-progress {
          background: #edf4fb;
        }
        .store-checkout-progress span {
          border-radius: 999px;
          padding: 9px 10px;
          color: #9b6b72;
          font-size: 12px;
          font-weight: 950;
          text-align: center;
        }
        .store-checkout-sheet .store-checkout-progress span {
          color: #6a86a5;
        }
        .store-checkout-progress span.active {
          background: #7b1022;
          color: #ffffff;
          box-shadow: 0 10px 22px rgba(123, 16, 34, 0.16);
        }
        .store-checkout-sheet .store-checkout-progress span.active {
          background: var(--sm-primary-gradient);
          box-shadow: 0 10px 22px rgba(12, 77, 136, 0.22);
        }
        .store-checkout-step {
          display: grid;
          gap: 12px;
        }
        .store-checkout-mini-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 1px solid #fde2e2;
          border-radius: 18px;
          padding: 12px 14px;
          background: #fff7f4;
        }
        .store-checkout-sheet .store-checkout-mini-total {
          border: 1px solid rgba(12, 77, 136, 0.14);
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
        }
        .store-checkout-mini-total span {
          color: #7b1022;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .store-checkout-sheet .store-checkout-mini-total span {
          color: var(--sm-blue-deep);
        }
        .store-checkout-mini-total strong {
          color: #111827;
          font-size: 20px;
        }
        .store-location-card {
          display: grid;
          gap: 10px;
          border: 1px solid #ead8da;
          border-radius: 16px;
          padding: 12px;
          background: #fff7f4;
        }
        .store-location-card strong {
          display: block;
          color: #111827;
        }
        .store-location-card span {
          display: block;
          margin-top: 3px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
        }
        .store-location-card a {
          color: #7b1022;
          font-size: 13px;
          font-weight: 900;
          text-decoration: none;
        }
        .store-location-map {
          height: 180px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #ead8da;
          background: #f3f4f6;
        }
        .store-location-map iframe {
          width: 100%;
          height: 100%;
          border: 0;
        }
        .store-location-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .store-location-feedback {
          display: block;
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
          text-decoration: none;
        }
        .store-location-feedback.error {
          background: #fff1f2;
          color: #be123c;
        }
        .store-location-results {
          display: grid;
          gap: 8px;
        }
        .store-location-result {
          width: 100%;
          border: 1px solid #ead8da;
          border-radius: 14px;
          padding: 10px 12px;
          background: #ffffff;
          color: #111827;
          text-align: left;
          cursor: pointer;
        }
        .store-location-result strong {
          display: block;
          margin: 0;
          color: #111827;
          font-size: 13px;
        }
        .store-location-selected {
          border: 1px solid #ead8da;
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.92);
        }
        .store-location-selected strong {
          display: block;
          color: #111827;
          font-size: 13px;
        }
        .store-location-selected span {
          display: block;
          margin-top: 4px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
        }
        .store-map-picker {
          width: min(430px, calc(100vw - 32px));
          border-radius: 24px;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(38, 6, 12, 0.28);
        }
        .store-map-picker-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .store-map-picker-head strong {
          display: block;
          color: #111827;
          font-size: 18px;
        }
        .store-map-picker-head span {
          display: block;
          margin-top: 3px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
        }
        .store-map-canvas {
          position: relative;
          width: ${MAP_PICKER_WIDTH}px;
          max-width: 100%;
          height: ${MAP_PICKER_HEIGHT}px;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid #ead8da;
          border-radius: 18px;
          background: #f3f4f6;
          cursor: grab;
          touch-action: none;
          user-select: none;
        }
        .store-map-canvas.dragging {
          cursor: grabbing;
        }
        .store-map-canvas img {
          position: absolute;
          width: ${MAP_PICKER_TILE_SIZE}px;
          height: ${MAP_PICKER_TILE_SIZE}px;
          user-select: none;
          pointer-events: none;
        }
        .store-map-pin {
          position: absolute;
          width: 30px;
          height: 30px;
          border: 4px solid #ffffff;
          border-radius: 999px 999px 999px 0;
          background: #b91c1c;
          box-shadow: 0 10px 25px rgba(185, 28, 28, 0.35);
          transform: translate(-50%, -100%) rotate(-45deg);
          pointer-events: none;
        }
        .store-map-pin::after {
          content: '';
          position: absolute;
          inset: 7px;
          border-radius: 999px;
          background: #ffffff;
        }
        .store-map-hint {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 10px;
          border-radius: 999px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.92);
          color: #7b1022;
          font-size: 11px;
          font-weight: 950;
          text-align: center;
          pointer-events: none;
        }
        .store-map-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .store-map-tools,
        .store-map-picker-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .store-mini-button {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #ead8da;
          border-radius: 999px;
          padding: 0 13px;
          background: #fff7f4;
          color: #7b1022;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
          text-decoration: none;
        }
        .store-order-line {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #f1f2f4;
        }
        .store-order-line-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .store-order-line-controls button {
          min-height: 28px;
          border: 1px solid #ead8da;
          border-radius: 999px;
          padding: 0 10px;
          background: #ffffff;
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
        }
        .store-checkout-sheet .store-order-line-controls button {
          border-color: rgba(12, 77, 136, 0.16);
          color: var(--sm-blue-deep);
        }
        .store-order-line-remove {
          margin-left: auto;
        }
        .store-order-line img {
          width: 52px;
          height: 52px;
          border-radius: 8px;
          object-fit: contain;
          background: #f7f7f8;
        }
        .store-choice-section {
          display: grid;
          gap: 10px;
        }
        .store-choice-section.compact {
          gap: 8px;
        }
        .store-choice-title {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #111827;
          font-size: 13px;
          font-weight: 950;
          letter-spacing: -0.01em;
        }
        .store-choice-title .store-checkout-icon {
          width: 24px;
          height: 24px;
          color: #9f1239;
          background: #fff1f2;
        }
        .store-checkout-sheet .store-choice-title .store-checkout-icon {
          color: var(--sm-blue-deep);
          background: rgba(12, 77, 136, 0.08);
        }
        .store-choice-grid {
          display: grid;
          gap: 10px;
        }
        .store-choice-grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .store-choice-grid.payment {
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .store-choice-card {
          min-height: 84px;
          border: 1px solid #ead8da;
          border-radius: 20px;
          padding: 12px;
          background: linear-gradient(180deg, #ffffff, #fffafa);
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          text-align: left;
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr);
          grid-template-areas:
            "icon title"
            "icon detail";
          column-gap: 10px;
          align-items: center;
          box-shadow: 0 12px 24px rgba(123, 16, 34, 0.06);
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .store-checkout-sheet .store-choice-card {
          border-color: rgba(12, 77, 136, 0.14);
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          color: var(--sm-blue-deep);
          box-shadow: 0 12px 24px rgba(12, 77, 136, 0.08);
        }
        .store-choice-card:hover {
          transform: translateY(-2px);
          border-color: rgba(159, 18, 57, 0.32);
          box-shadow: 0 18px 34px rgba(123, 16, 34, 0.12);
        }
        .store-checkout-sheet .store-choice-card:hover {
          border-color: rgba(12, 77, 136, 0.24);
          box-shadow: 0 18px 34px rgba(12, 77, 136, 0.14);
        }
        .store-choice-card.active {
          border-color: transparent;
          background: linear-gradient(135deg, #7b1022, #d43f3a);
          color: #ffffff;
          box-shadow: 0 18px 36px rgba(123, 16, 34, 0.24);
        }
        .store-checkout-sheet .store-choice-card.active {
          background: var(--sm-primary-gradient);
          box-shadow: 0 18px 36px rgba(12, 77, 136, 0.24);
        }
        .store-choice-card strong {
          grid-area: title;
          color: inherit;
          font-size: 15px;
          font-weight: 950;
          letter-spacing: -0.02em;
        }
        .store-choice-card span:not(.store-checkout-icon) {
          grid-area: detail;
          color: rgba(123, 16, 34, 0.66);
          font-size: 11px;
          font-weight: 850;
          line-height: 1.25;
        }
        .store-checkout-sheet .store-choice-card span:not(.store-checkout-icon) {
          color: var(--sm-text-soft);
        }
        .store-choice-card.active span:not(.store-checkout-icon) {
          color: rgba(255, 255, 255, 0.82);
        }
        .store-choice-card.mini {
          min-height: 72px;
          border-radius: 18px;
        }
        .store-choice-card.payment {
          min-height: 92px;
          grid-template-columns: 1fr;
          grid-template-areas:
            "icon"
            "title"
            "detail";
          justify-items: center;
          text-align: center;
          padding: 12px 8px;
        }
        .store-checkout-icon {
          grid-area: icon;
          width: 36px;
          height: 36px;
          border-radius: 14px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #7b1022;
          background: rgba(123, 16, 34, 0.08);
          flex: 0 0 auto;
        }
        .store-checkout-sheet .store-checkout-icon {
          color: var(--sm-blue-deep);
          background: rgba(12, 77, 136, 0.08);
        }
        .store-checkout-icon svg {
          width: 22px;
          height: 22px;
        }
        .store-choice-card.active .store-checkout-icon {
          color: #7b1022;
          background: #ffffff;
        }
        .store-checkout-sheet .store-choice-card.active .store-checkout-icon {
          color: var(--sm-blue-deep);
          background: #ffffff;
        }
        .store-cash-change {
          display: grid;
          gap: 8px;
          border: 1px solid #fde2e2;
          border-radius: 18px;
          padding: 12px;
          background: #fff7f4;
        }
        .store-checkout-sheet .store-cash-change,
        .store-checkout-sheet .store-payment-note,
        .store-checkout-sheet .store-location-card,
        .store-checkout-sheet .store-location-selected {
          border: 1px solid rgba(12, 77, 136, 0.14);
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
        }
        .store-cash-change span {
          color: #7b1022;
          font-size: 13px;
          font-weight: 950;
        }
        .store-checkout-sheet .store-cash-change span,
        .store-checkout-sheet .store-payment-note,
        .store-checkout-sheet .store-location-card a,
        .store-checkout-sheet .store-location-feedback {
          color: var(--sm-blue-deep);
        }
        .store-payment-note {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #fde2e2;
          border-radius: 18px;
          padding: 12px;
          background: #fff7f4;
          color: #7b1022;
          font-size: 13px;
          font-weight: 950;
          line-height: 1.35;
        }
        .store-payment-note .store-checkout-icon {
          width: 34px;
          height: 34px;
          background: #ffffff;
        }
        .store-checkout-sheet .store-location-card span,
        .store-checkout-sheet .store-location-selected span,
        .store-checkout-sheet .store-map-picker-head span {
          color: var(--sm-text-soft);
        }
        .store-checkout-sheet .store-mini-button,
        .store-checkout-sheet .store-location-result {
          border-color: rgba(12, 77, 136, 0.14);
          color: var(--sm-blue-deep);
          background: #ffffff;
        }
        .store-mobile-cart {
          position: fixed;
          left: 14px;
          right: 14px;
          bottom: 14px;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 0;
          border-radius: 24px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #111827, #7b1022);
          color: #fffaf5;
          box-shadow: 0 28px 60px rgba(17, 24, 39, 0.34);
          cursor: pointer;
          text-align: left;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .store-mobile-cart.hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(120%);
        }
        .store-mobile-cart strong,
        .store-mobile-cart span,
        .store-mobile-cart em {
          display: block;
        }
        .store-mobile-cart strong {
          font-size: 15px;
          font-weight: 950;
        }
        .store-mobile-cart span {
          margin-top: 2px;
          color: rgba(255, 250, 245, 0.78);
          font-size: 12px;
          font-style: normal;
          font-weight: 800;
        }
        .store-mobile-cart em {
          font-size: 13px;
          font-style: normal;
          font-weight: 950;
          white-space: nowrap;
        }
        .store-order-bubble {
          position: fixed;
          right: 14px;
          bottom: 22px;
          z-index: 135;
          min-height: 56px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px 10px 10px;
          border: 0;
          border-radius: 999px;
          background: linear-gradient(135deg, #7b1022, #d94a3f);
          color: #fffaf5;
          box-shadow: 0 24px 48px rgba(123, 16, 34, 0.32);
          text-align: left;
        }
        .store-order-bubble.elevated {
          bottom: 92px;
        }
        .store-order-bubble-icon {
          width: 36px;
          height: 36px;
          flex: 0 0 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.16);
        }
        .store-order-bubble-copy {
          display: grid;
          gap: 1px;
        }
        .store-order-bubble-copy strong {
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .store-order-bubble-copy span {
          font-size: 12px;
          color: rgba(255, 250, 245, 0.84);
          font-weight: 800;
        }
        .store-success-overlay {
          position: fixed;
          inset: 0;
          z-index: 250;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(15, 23, 42, 0.34);
          backdrop-filter: blur(10px);
        }
        .store-success-card {
          width: min(360px, 100%);
          border-radius: 28px;
          padding: 28px 24px 22px;
          background: linear-gradient(180deg, #ffffff 0%, #f7fff9 100%);
          border: 1px solid rgba(16, 185, 129, 0.14);
          box-shadow: 0 28px 70px rgba(15, 23, 42, 0.18);
          text-align: center;
        }
        .store-success-check {
          width: 76px;
          height: 76px;
          margin: 0 auto 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: radial-gradient(circle at top, #34d399, #10b981);
          box-shadow: 0 18px 36px rgba(16, 185, 129, 0.28);
        }
        .store-success-card h3 {
          margin: 0;
          color: #111827;
          font-size: 24px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .store-success-card p {
          margin: 10px 0 0;
          color: #475569;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.5;
        }
        .store-success-card .store-button {
          width: 100%;
          margin-top: 18px;
        }
        .store-status-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          margin-top: 10px;
        }
        .store-checkout-sheet .store-status-card {
          border: 1px solid rgba(12, 77, 136, 0.14);
          border-radius: 18px;
          background: linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
        }
        .store-status-card.guest-form-card {
          margin-top: 12px;
        }
        .store-friendly-status {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        }
        .store-friendly-status::after {
          content: '';
          position: absolute;
          inset: auto -38px -54px auto;
          width: 132px;
          height: 132px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.68);
        }
        .store-friendly-head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .store-status-visual {
          width: 72px;
          height: 72px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.1);
          flex: 0 0 auto;
        }
        .store-status-visual svg {
          width: 62px;
          height: 62px;
        }
        .store-status-visual.compact {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          box-shadow: none;
          background: rgba(255, 255, 255, 0.88);
        }
        .store-status-visual.compact svg {
          width: 24px;
          height: 24px;
        }
        .store-status-message {
          position: relative;
          z-index: 1;
          margin: 12px 0 0;
          color: #475569;
          line-height: 1.45;
        }
        .store-progress {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 16px;
        }
        .store-progress-step {
          min-height: 58px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 5px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.72);
          color: #94a3b8;
          font-size: 10.5px;
          font-weight: 900;
          text-align: center;
          line-height: 1.1;
          padding: 7px 6px;
        }
        .store-progress-step.done {
          color: #ffffff;
        }
        .store-progress-step.done .store-status-visual.compact {
          background: #ffffff;
        }
        .store-order-meta {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }
        .store-order-meta span {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .store-order-meta strong {
          display: block;
          margin-top: 2px;
          color: #111827;
          font-size: 13px;
        }
        .store-whatsapp-button {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 14px;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          font-weight: 950;
          text-decoration: none;
          box-shadow: 0 16px 30px rgba(22, 163, 74, 0.24);
        }
        .store-cancel-order-button {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 10px;
          border: 1px solid #fecaca;
          border-radius: 999px;
          background: #fff7f7;
          color: #dc2626;
          cursor: pointer;
          font: inherit;
          font-weight: 950;
        }
        .store-status-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 6px 10px;
          background: #f3f4f6;
          font-size: 12px;
          font-weight: 900;
        }
        .store-section-label {
          margin: 14px 0 8px;
          color: #7b1022;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .store-history-toggle {
          width: 100%;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
          border: 1px solid #ead8da;
          border-radius: 16px;
          padding: 0 14px;
          background: #fff8f6;
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          font-weight: 950;
        }
        .store-history-toggle span {
          display: inline-flex;
          min-width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #7b1022;
          color: #fffaf5;
          font-size: 12px;
        }
        .store-history-list {
          margin-top: 8px;
        }
        .store-orders-hero {
          margin-top: 2px;
          padding: 18px 18px 16px;
          border-radius: 24px;
          background:
            radial-gradient(circle at top right, rgba(255, 225, 214, 0.65), transparent 32%),
            linear-gradient(180deg, #ffffff 0%, #fff8f6 100%);
          border: 1px solid rgba(123, 16, 34, 0.1);
          box-shadow: 0 20px 44px rgba(123, 16, 34, 0.08);
        }
        .store-orders-hero h2 {
          margin: 12px 0 4px;
          color: #111827;
          font-size: 24px;
          line-height: 1.04;
          letter-spacing: -0.03em;
        }
        .store-orders-hero p {
          margin: 0;
          color: #64748b;
          font-size: 14px;
          line-height: 1.5;
          font-weight: 700;
        }
        .store-status-items {
          position: relative;
          z-index: 1;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #f1f2f4;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }
        .store-status-items-title {
          display: block;
          margin-bottom: 8px;
          color: #111827;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }
        @media (min-width: 1181px) {
          .store-page.with-floating-cart {
            padding-right: 336px;
          }
        }
        @media (max-width: 1180px) {
          .store-floating-cart {
            top: auto;
            right: 14px;
            bottom: 14px;
            left: 14px;
            width: auto;
            max-height: none;
            border-radius: 24px;
          }
          .store-floating-cart-items {
            display: none;
          }
          .store-floating-cart-head,
          .store-floating-cart-total {
            padding: 12px 14px;
          }
          .store-page.with-floating-cart {
            padding-right: 18px;
          }
          .store-quantity-notice {
            bottom: 116px;
          }
        }
        @media (min-width: 1400px) {
          .store-grid {
            grid-template-columns: repeat(5, minmax(0, 1fr));
          }
        }
        @media (max-width: 980px) {
          .store-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 720px) {
          .store-page {
            padding-left: 14px;
            padding-right: 14px;
            padding-bottom: 180px;
          }
          .store-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px 12px;
          }
          .store-story {
            flex-basis: 82px;
            min-height: 116px;
          }
          .store-story-ring {
            width: 68px;
            height: 68px;
          }
          .store-story-viewer {
            width: min(calc(100vw - 20px), calc((100vh - 20px) * 0.5625));
            border-radius: 24px;
          }
          .store-story-viewer-head {
            top: 24px;
            left: 14px;
            right: 14px;
          }
          .store-story-progress {
            top: 10px;
            left: 10px;
            right: 10px;
          }
          .store-detail-grid {
            grid-template-columns: 1fr;
          }
          .store-sheet,
          .store-sheet.full {
            width: 100%;
            max-height: 100vh;
            border-radius: 24px 24px 0 0;
            padding: 16px 14px 22px;
          }
          .store-sheet-overlay.product-overlay {
            padding: 0;
            align-items: stretch;
          }
          .store-product-sheet {
            width: 100%;
            min-height: 100vh;
            max-height: 100vh;
            border-radius: 0;
            padding: calc(env(safe-area-inset-top, 0px) + 12px) 14px 26px;
          }
          .store-sheet-head.product {
            top: 0;
            margin: 0 0 14px;
            padding: 0 0 10px;
            background: linear-gradient(180deg, #ffffff 0%, rgba(255, 255, 255, 0.9) 72%, rgba(255, 255, 255, 0) 100%);
          }
          .store-product-sheet-heading {
            align-items: flex-start;
            text-align: left;
          }
          .store-product-sheet-heading strong {
            max-width: none;
            font-size: 17px;
          }
          .store-back {
            min-width: 50px;
            padding: 0 14px 0 10px;
          }
          .store-back-icon {
            font-size: 30px;
          }
          .store-back-label {
            display: none;
          }
          .store-product-card {
            padding: 4px 2px 8px;
          }
          .store-product-group {
            padding: 14px 12px 16px;
            border-radius: 24px;
          }
          .store-product-group-head {
            align-items: flex-start;
            flex-direction: column;
            gap: 8px;
          }
          .store-product-group-title {
            font-size: 20px;
          }
          .store-product-group-meta {
            font-size: 11px;
            white-space: normal;
          }
          .store-product-group-more {
            width: 100%;
            min-width: 0;
          }
          .store-add {
            top: 10px;
            right: 4px;
            min-width: 52px;
            height: 52px;
            padding: 0 14px;
            font-size: 22px;
          }
          .store-add.has-quantity {
            min-width: 58px;
            font-size: 13px;
          }
          .store-product-name {
            font-size: 12px;
            min-height: 30px;
          }
          .store-price {
            font-size: 15px;
          }
          .store-unit {
            font-size: 10px;
          }
          .store-product-media {
            padding: 6px;
            border-radius: 24px;
          }
          .store-product-image-shell {
            border-radius: 20px;
          }
          .store-brand-row {
            align-items: center;
            gap: 10px;
          }
          .store-brand-main {
            gap: 10px;
            align-items: flex-start;
          }
          .store-brand-copy {
            gap: 4px;
          }
          .store-brand-kicker {
            font-size: 9px;
          }
          .store-title {
            font-size: 16px;
            line-height: 1.06;
          }
          .store-brand-actions {
            gap: 6px;
          }
          .store-icon-button {
            width: 40px;
            height: 40px;
          }
          .store-filter-strip {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 0 0 8px;
          }
          .store-filters-panel {
            padding: 10px 12px 8px;
            border-radius: 22px;
          }
          .store-search-wrap {
            min-height: 54px;
            padding: 0 14px;
            border-radius: 22px;
          }
          .store-search-tag {
            min-height: 30px;
            padding: 0 10px;
            font-size: 11px;
          }
          .store-chip {
            min-height: 40px;
            padding: 9px 13px;
          }
          .store-filter-chip {
            min-width: 116px;
            gap: 3px;
          }
          .store-filter-chip.compact {
            min-width: auto;
          }
          .store-filter-strip strong {
            font-size: 15px;
          }
          .store-filter-strip span {
            margin-top: 2px;
            font-size: 11px;
          }
          .store-filter-strip > div span {
            display: none;
          }
          .store-filter-kicker {
            min-height: 26px;
            padding: 0 10px;
            font-size: 10px;
          }
          .store-tabs {
            gap: 10px;
            padding: 4px 0 8px;
          }
          .store-subtabs {
            gap: 8px;
            padding: 4px 0 0;
          }
          .store-filter-label,
          .store-filter-pill-label {
            font-size: 13px;
          }
          .store-filter-meta {
            font-size: 10px;
          }
          .store-filter-badge {
            min-width: 22px;
            height: 22px;
            padding: 0 7px;
            font-size: 10px;
          }
          .store-subtabs .store-chip {
            min-height: 36px;
            padding: 7px 11px;
          }
          .store-subtabs .store-filter-chip.compact {
            padding-right: 11px;
          }
          .store-product-head {
            margin: 10px 0 10px;
          }
          .store-grouped-sections {
            gap: 14px;
          }
          .store-order-status-button {
            min-height: 38px;
            padding: 0 12px;
            font-size: 11px;
          }
          .store-order-bubble {
            left: 14px;
            right: 14px;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 16px);
          }
          .store-order-bubble.elevated {
            bottom: calc(env(safe-area-inset-bottom, 0px) + 92px);
          }
          .store-mobile-cart {
            bottom: calc(env(safe-area-inset-bottom, 0px) + 14px);
          }
          .store-auth-page {
            padding: 24px 14px;
          }
          .store-auth-card {
            padding: 24px 18px;
          }
          .store-auth-card.inline {
            padding: 4px 0 2px;
          }
          .store-auth-brand h1 {
            font-size: 22px;
          }
          .store-orders-hero {
            padding: 16px 16px 14px;
            border-radius: 22px;
          }
          .store-orders-hero h2 {
            font-size: 20px;
          }
          .store-order-meta {
            grid-template-columns: 1fr;
          }
          .store-progress {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .store-location-actions,
          .store-map-fields,
          .store-choice-grid.two {
            grid-template-columns: 1fr;
          }
          .store-choice-grid.payment {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .store-choice-card {
            min-height: 76px;
          }
          .store-choice-card.payment {
            min-height: 82px;
          }
          .store-progress-step {
            min-height: 54px;
            font-size: 9.5px;
          }
        }
      `}</style>

      <div className={`store-page ${cartItems.length > 0 ? 'with-floating-cart' : ''}`}>
        {isDashboard && (
          <div className="store-admin-bar">
            <strong>{STORE_BRAND_TITLE}</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="store-button secondary" onClick={copyPublicLink}>
                Copiar enlace
              </button>
              <button
                type="button"
                className="store-button"
                onClick={() => window.open(publicStoreUrl, '_blank', 'noopener,noreferrer')}
              >
                Abrir tienda
              </button>
            </div>
          </div>
        )}

        <header className="store-top">
          <div className="store-brand-row">
            <div className="store-brand-main">
              <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
              <div className="store-brand-copy">
                <span className="store-brand-kicker">Tu carne favorita, a un toque de distancia</span>
                <div className="store-title">{STORE_BRAND_TITLE}</div>
              </div>
            </div>
            <div className="store-brand-actions">
              {!isMobileLayout && hasTrackedOrder && (
                <button
                  type="button"
                  className="store-order-status-button"
                  title="Estado de mi pedido"
                  onClick={openCustomerOrders}
                >
                  Mi pedido
                </button>
              )}
              <button
                type="button"
                className="store-icon-button store-profile-button"
                title={currentUser ? 'Mi perfil' : 'Inicia sesion'}
                onClick={openProfilePanel}
              >
                <StoreProfileGlyph active={hasTrackedOrder} />
              </button>
              <button
                type="button"
                className="store-icon-button"
                title="Carrito"
                onClick={() => setCheckoutOpen(true)}
              >
                {cartItems.length || '+'}
              </button>
            </div>
          </div>

          <label className="store-search-wrap">
            <span className="store-search-tag">Buscar</span>
            <input
              className="store-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Buscar en Carnes San Martin Granada"
            />
          </label>
        </header>

        {rewardSettings.enabled !== false && (
          <section style={{ marginTop: isMobileLayout ? 10 : 18, marginBottom: isMobileLayout ? 4 : 8 }}>
            <StoreRewardsSummaryCard
              currentUser={currentUser}
              settings={rewardSettings}
              account={rewardAccount}
              rewards={storeRewards}
              cartAmount={approximateTotalAmount}
              selectedReward={selectedRewardRedemption}
              onOpen={openRewardsPanel}
              compact={isMobileLayout}
            />
          </section>
        )}

        <main>
          <section className="store-filters-panel">
            <div className="store-filter-strip">
              <div>
                <strong>{activeFilterSummary.title}</strong>
                <span>{activeFilterSummary.subtitle}</span>
              </div>
              <span className="store-filter-kicker">Categorias</span>
            </div>

            <nav className="store-tabs">
              {categoryOptions.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`store-chip store-filter-chip ${activeCategory === category.id ? 'active' : ''}`}
                  onClick={() => {
                    setActiveCategory(category.id);
                    setActiveSubcategory('todas');
                  }}
                >
                  <span className="store-filter-label">{category.label}</span>
                  <span className="store-filter-meta">
                    {Number(categoryProductCounts[category.id] || 0)} productos
                  </span>
                </button>
              ))}
            </nav>

            {subcategoryOptions.length > 0 && (
              <nav className="store-subtabs">
                <button
                  type="button"
                  className={`store-chip store-filter-chip compact ${
                    activeSubcategory === 'todas' ? 'active' : ''
                  }`}
                  onClick={() => setActiveSubcategory('todas')}
                >
                  <span className="store-filter-pill-label">Todas</span>
                  <span className="store-filter-badge">
                    {Number(subcategoryProductCounts.todas || 0)}
                  </span>
                </button>
                {subcategoryOptions.map((subcategory) => (
                  <button
                    key={subcategory}
                    type="button"
                    className={`store-chip store-filter-chip compact ${
                      activeSubcategory === subcategory ? 'active' : ''
                    }`}
                    onClick={() => setActiveSubcategory(subcategory)}
                  >
                    <span className="store-filter-pill-label">{subcategory}</span>
                    <span className="store-filter-badge">
                      {Number(subcategoryProductCounts[subcategory] || 0)}
                    </span>
                  </button>
                ))}
              </nav>
            )}
          </section>

          <div className="store-product-head">
            <h2 className="store-count">
              {showCatalogSkeleton ? 'Cargando productos...' : `${filteredProducts.length} productos`}
            </h2>
            <button
              type="button"
              className="store-button secondary"
              onClick={() => {
                setQuery('');
                setActiveCategory('todos');
                setActiveSubcategory('todas');
              }}
            >
              Limpiar
            </button>
          </div>

          {showCatalogSkeleton ? (
            <div className="store-grid store-grid-skeleton" aria-label="Cargando catalogo">
              {Array.from({ length: 8 }, (_, index) => (
                <article key={`skeleton-${index}`} className="store-product store-product-skeleton">
                  <div className="store-skeleton-media" />
                  <div className="store-skeleton-line title" />
                  <div className="store-skeleton-line price" />
                  <div className="store-skeleton-line meta" />
                </article>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="store-empty">No encontramos productos con esa busqueda.</div>
          ) : activeCategory === 'todos' ? (
            <div className="store-grouped-sections">
              {groupedAllProductsSections.map((section, sectionIndex) => {
                const visibleCount = Number(groupVisibleCounts[section.id] || STORE_GROUP_PAGE_SIZE);
                const visibleProducts = section.products.slice(0, visibleCount);
                const remainingCount = Math.max(section.products.length - visibleProducts.length, 0);
                const nextBatchSize = Math.min(STORE_GROUP_PAGE_SIZE, remainingCount);

                return (
                  <React.Fragment key={section.id}>
                    <section className="store-product-group">
                      <div className="store-product-group-head">
                        <div>
                          <span className="store-product-group-kicker">{section.kicker}</span>
                          <h3 className="store-product-group-title">{section.title}</h3>
                        </div>
                        <span className="store-product-group-meta">
                          {visibleProducts.length} de {section.products.length} productos
                        </span>
                      </div>
                      <div className="store-grid">
                        {visibleProducts.map((product) => renderStoreProductTile(product))}
                      </div>
                      {remainingCount > 0 && (
                        <div className="store-product-group-footer">
                          <button
                            type="button"
                            className="store-button secondary store-product-group-more"
                            onClick={() =>
                              setGroupVisibleCounts((current) => ({
                                ...current,
                                [section.id]: Math.min(
                                  Number(current[section.id] || STORE_GROUP_PAGE_SIZE) + STORE_GROUP_PAGE_SIZE,
                                  section.products.length
                                ),
                              }))
                            }
                          >
                            Mostrar {nextBatchSize} mas
                          </button>
                        </div>
                      )}
                    </section>

                    {showPromotions && sectionIndex === 0 && (
                      <PromotionsStrip
                        promotions={activePromotions}
                        onOpen={(promotionIndex) => setSelectedPromotionIndex(promotionIndex)}
                      />
                    )}
                  </React.Fragment>
                );
              })}
              {showPromotions && groupedAllProductsSections.length === 0 && (
                <PromotionsStrip
                  promotions={activePromotions}
                  onOpen={(promotionIndex) => setSelectedPromotionIndex(promotionIndex)}
                />
              )}
            </div>
          ) : (
            <div className="store-grid">
              {filteredProducts.map((product) => renderStoreProductTile(product))}
            </div>
          )}
        </main>
      </div>

      {cartItems.length > 0 && !selectedProduct && !checkoutOpen && !ordersOpen && !profileOpen && (
        isMobileLayout ? (
          <MobileCartBar
            cartCount={cartCount}
            approximateTotalAmount={approximateTotalAmount}
            hidden={searchFocused}
            onOpen={() => setCheckoutOpen(true)}
          />
        ) : (
          <FloatingCart
            cartItems={cartItems}
            cartCount={cartCount}
            couponDiscount={couponDiscount}
            approximateTotalAmount={approximateTotalAmount}
            onCheckout={() => setCheckoutOpen(true)}
            onQuantityChange={updateQuantity}
          />
        )
      )}

      {quantityNotice && <div className="store-quantity-notice">{quantityNotice}</div>}

      {isMobileLayout &&
        hasTrackedOrder &&
        !ordersOpen &&
        !profileOpen &&
        !authSheetOpen &&
        !orderSuccessOpen && (
          <FloatingOrderBubble
            order={activeCustomerOrder}
            elevated={cartItems.length > 0 && !selectedProduct && !checkoutOpen}
            onOpen={openCustomerOrders}
          />
        )}

      {selectedProduct && (
        <ProductSheet
          product={selectedProduct}
          cartQuantity={Number(cart[selectedProduct.code] || 0)}
          quantity={selectedProductQuantity}
          onClose={() => setSelectedProduct(null)}
          onConfirm={() => {
            updateQuantity(selectedProduct.code, selectedProductQuantity);
            setSelectedProduct(null);
          }}
          onQuantityChange={(nextQuantity) => {
            if (!isValidQuantityStep(nextQuantity, selectedProduct)) {
              showQuantityNotice(getQuantityRuleMessage(selectedProduct));
            }

            setSelectedProductQuantity(clampQuantity(nextQuantity, selectedProduct));
          }}
        />
      )}

      {selectedPromotionIndex !== null && (
        <PromotionViewer
          promotions={activePromotions}
          activeIndex={selectedPromotionIndex}
          onChange={setSelectedPromotionIndex}
          onClose={() => setSelectedPromotionIndex(null)}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          cartItems={cartItems}
          currentUser={currentUser}
          customer={customer}
          fulfillmentType={fulfillmentType}
          deliveryMode={deliveryMode}
          alternateDelivery={alternateDelivery}
          alternateLocating={alternateLocating}
          notes={notes}
          submitting={submitting}
          appliedCoupon={appliedCoupon}
          couponDiscount={couponDiscount}
          couponInput={couponInput}
          couponMessage={couponMessage}
          approximateTotalAmount={approximateTotalAmount}
          estimatedRewardPoints={estimatedRewardPoints}
          totalAmount={totalAmount}
          rewardSettings={rewardSettings}
          selectedReward={selectedRewardRedemption}
          welcomeCoupon={welcomeCoupon}
          welcomeCouponStatus={welcomeCouponStatus}
          welcomeCouponActionBusy={welcomeCouponActionBusy}
          onClose={() => setCheckoutOpen(false)}
          onCustomerChange={updateCustomer}
          onFulfillmentTypeChange={setFulfillmentType}
          onDeliveryModeChange={setDeliveryMode}
          onQuantityChange={updateQuantity}
          onAlternateDeliveryChange={updateAlternateDelivery}
          onCaptureAlternateLocation={captureAlternateLocation}
          onApplyCoupon={applyCoupon}
          onApplySpecificCoupon={applyResolvedCoupon}
          onCouponInputChange={setCouponInput}
          onEditProfile={() => setProfileOpen(true)}
          onNotesChange={setNotes}
          onOpenLogin={() => openAuthSheet('login', 'checkout')}
          onOpenRegister={() => openAuthSheet('register', 'checkout')}
          onOpenRewards={() => openRewardsPanel({ closeCheckout: true })}
          onClaimWelcomeCoupon={handleClaimWelcomeCoupon}
          onClearSelectedReward={clearSelectedReward}
          onRemoveCoupon={removeCoupon}
          onSubmit={submitOrder}
        />
      )}

      {ordersOpen && currentUser && (
        <OrdersSheet
          currentUser={currentUser}
          orders={customerOrders}
          createdOrder={createdOrder}
          onCancelOrder={cancelCustomerOrder}
          onClose={() => setOrdersOpen(false)}
        />
      )}

      {profileOpen && currentUser && (
        <ProfileSheet
          user={currentUser}
          saving={submitting}
          onClose={() => setProfileOpen(false)}
          onSignOut={clearStoreSession}
          onSave={handleProfileSave}
        />
      )}

      <StoreRewardsSheet
        open={rewardsOpen}
        currentUser={currentUser}
        settings={rewardSettings}
        rewards={storeRewards}
        account={rewardAccount}
        transactions={rewardTransactions}
        cartAmount={approximateTotalAmount}
        selectedReward={selectedRewardRedemption}
        rewardActionBusy={rewardActionBusy}
        onSelectReward={handleSelectReward}
        onClearSelectedReward={clearSelectedReward}
        onClose={closeRewardsPanel}
        onOpenAuth={() => openAuthSheet('login', 'rewards')}
      />

      {authSheetOpen && (
        <StoreAuthSheet
          authMode={authMode}
          authForm={authForm}
          authError={authError}
          authNotice={authNotice}
          authLoading={authLoading}
          authLocating={authLocating}
          authProviderDraft={authProviderDraft}
          locked={!isDashboard && !currentUser}
          onClose={closeAuthSheet}
          onAuthModeChange={(mode) => {
            setAuthMode(mode);
            if (mode !== 'register') {
              setAuthProviderDraft(null);
            }
            setAuthError('');
            setAuthNotice('');
          }}
          onFormChange={updateAuthForm}
          onCaptureLocation={captureAuthLocation}
          onManualLocation={(location) => {
            updateAuthForm('ubicacion', location);
            updateAuthForm(
              'direccion',
              fillAddressFromLocation(authForm.direccion, location, 'Ubicacion seleccionada en el mapa')
            );
          }}
          onLogin={handleStoreLogin}
          onGoogleLogin={handleStoreGoogleLogin}
          onPasswordReset={handleStorePasswordReset}
          onRegister={handleStoreRegister}
        />
      )}

      {welcomeCouponOpen && welcomeCoupon && (
        <WelcomeCouponModal
          welcomeCoupon={welcomeCoupon}
          heroImage={welcomeCouponHeroImage}
          busy={welcomeCouponActionBusy}
          onClose={() => setWelcomeCouponOpen(false)}
          onClaim={handleClaimWelcomeCoupon}
        />
      )}

      {orderSuccessOpen && <OrderSuccessSheet onClose={dismissOrderSuccess} />}
    </div>
  );
}

function WelcomeCouponModal({
  welcomeCoupon,
  heroImage = '',
  busy = false,
  onClose,
  onClaim,
}) {
  const amount = `C$${Math.round(Number(welcomeCoupon?.amount || STORE_WELCOME_COUPON_AMOUNT))}`;
  const minimum = `C$${Math.round(
    Number(welcomeCoupon?.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM)
  )}`;
  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 80,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '18px',
    background:
      'linear-gradient(180deg, rgba(7, 18, 37, 0.80) 0%, rgba(4, 12, 26, 0.92) 100%)',
    backdropFilter: 'blur(8px)',
  };
  const cardStyle = {
    position: 'relative',
    width: 'min(460px, 100%)',
    minHeight: 'min(86vh, 760px)',
    overflow: 'hidden',
    borderRadius: '34px',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow: '0 34px 90px rgba(0, 0, 0, 0.48)',
    backgroundImage: heroImage
      ? `linear-gradient(180deg, rgba(7, 9, 14, 0.12) 0%, rgba(7, 9, 14, 0.54) 38%, rgba(7, 9, 14, 0.92) 100%), url(${heroImage})`
      : 'linear-gradient(180deg, #161616 0%, #090909 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
  };
  const buttonStyle = {
    width: '100%',
    border: 'none',
    borderRadius: 999,
    padding: '18px 24px',
    fontSize: '1rem',
    fontWeight: 900,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    background: 'linear-gradient(135deg, #0f3b82 0%, #2166d9 100%)',
    color: '#fff',
    boxShadow: '0 16px 34px rgba(13, 71, 161, 0.34)',
    cursor: busy ? 'wait' : 'pointer',
  };

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar promocion"
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(10, 10, 10, 0.4)',
            color: '#fff',
            fontSize: 22,
            cursor: 'pointer',
          }}
        >
          ×
        </button>

        <div style={{ padding: '34px 28px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 14,
              padding: '12px 16px',
              borderRadius: 24,
              background: 'rgba(0, 0, 0, 0.36)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <img
              src={LOGO_PATH}
              alt="Carnes San Martin"
              style={{ width: 54, height: 54, objectFit: 'contain' }}
            />
            <div style={{ display: 'grid', gap: 2 }}>
              <strong style={{ fontSize: 20, lineHeight: 1 }}>Carnes San Martin</strong>
              <span style={{ fontSize: 16, fontWeight: 700, opacity: 0.9 }}>Granada</span>
            </div>
          </div>

          <div style={{ marginTop: 34 }}>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, letterSpacing: '-0.04em' }}>
              GANASTE UN CUPON DE
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 'clamp(4rem, 18vw, 7rem)',
                lineHeight: 0.96,
                fontWeight: 1000,
                letterSpacing: '-0.08em',
                color: '#f5cf59',
                textShadow: '0 10px 30px rgba(0,0,0,0.26)',
              }}
            >
              {amount}
            </div>
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 800 }}>
              Canjeable en tu siguiente compra
            </div>
            <div
              style={{
                marginTop: 18,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '11px 18px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, #0b49ba 0%, #1f76ff 100%)',
                color: '#fff',
                fontSize: 18,
                fontWeight: 800,
                boxShadow: '0 18px 32px rgba(15, 80, 190, 0.32)',
              }}
            >
              Tu compra debe ser como minimo de {minimum}
            </div>
          </div>
        </div>

        <div style={{ padding: '0 28px 28px' }}>
          <button type="button" style={buttonStyle} onClick={onClaim} disabled={busy}>
            {busy ? 'Activando...' : 'Canjear'}
          </button>
        </div>
      </div>
    </div>
  );
}

function StoreAuthView({
  authMode,
  authForm,
  authError,
  authNotice,
  authLoading,
  authLocating,
  authProviderDraft,
  embedded = false,
  onAuthModeChange,
  onCaptureLocation,
  onManualLocation,
  onFormChange,
  onLogin,
  onGoogleLogin,
  onPasswordReset,
  onRegister,
}) {
  const isRegister = authMode === 'register';
  const isGoogleProfileCompletion = isRegister && authProviderDraft?.provider === 'google';

  const content = (
    <section className={`store-auth-card ${embedded ? 'inline' : ''}`}>
      <div className="store-auth-brand">
        <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
        <h1>{STORE_BRAND_TITLE}</h1>
        <p>Inicia sesion para enviar pedidos y ver el estado de tu pedido.</p>
      </div>

      <div className="store-auth-toggle">
        <button
          type="button"
          className={!isRegister ? 'active' : ''}
          onClick={() => onAuthModeChange('login')}
        >
          Ingresar
        </button>
        <button
          type="button"
          className={isRegister ? 'active' : ''}
          onClick={() => onAuthModeChange('register')}
        >
          Crear cuenta
        </button>
      </div>

      <h2 style={{ margin: '0 0 4px', fontSize: 26 }}>{isRegister ? 'Crea tu usuario' : 'Bienvenido'}</h2>
      <p style={{ margin: '0 0 16px', color: '#6b7280', fontWeight: 700 }}>
        {isRegister
          ? 'Usaremos estos datos para tus pedidos delivery.'
          : 'Ingresa con tu correo o telefono y contrasena.'}
      </p>

      {authError && <div className="store-auth-error">{authError}</div>}
      {authNotice && <div className="store-auth-notice">{authNotice}</div>}

      <button
        type="button"
        className="store-button secondary store-google-button"
        onClick={onGoogleLogin}
        disabled={authLoading}
      >
        <span className="store-google-mark">G</span>
        Continuar con Google
      </button>

      <div className="store-auth-choice-divider">o</div>

      <form className="store-form" onSubmit={isRegister ? onRegister : onLogin}>
        {isRegister && (
          <input
            className="store-field"
            value={authForm.nombre}
            onChange={(event) => onFormChange('nombre', event.target.value)}
            placeholder="Nombre completo"
            required
          />
        )}
        <input
          className="store-field"
          type={isRegister ? 'email' : 'text'}
          value={authForm.email}
          onChange={(event) => onFormChange('email', event.target.value)}
          placeholder={isRegister ? 'Correo electronico' : 'Correo o telefono'}
          disabled={isGoogleProfileCompletion}
          autoComplete={isRegister ? 'email' : 'username'}
          required
        />
        {isRegister && (
          <input
            className="store-field"
            value={authForm.telefono}
            onChange={(event) => onFormChange('telefono', event.target.value)}
            placeholder="Telefono o WhatsApp"
            required
          />
        )}
        {isRegister && (
          <label className="store-field-stack">
            <span className="store-field-caption">Fecha de cumpleanos</span>
            <input
              className="store-field"
              type="text"
              inputMode="numeric"
              autoComplete="bday-day"
              placeholder="DD/MM"
              maxLength={5}
              value={authForm.fechaCumpleanos || ''}
              onChange={(event) => onFormChange('fechaCumpleanos', event.target.value)}
            />
            <span className="store-field-note">RECIBIRAS PREMIO ESPECIAL EN TU CUMPLEANOS</span>
          </label>
        )}
        {!isGoogleProfileCompletion && (
          <>
            <input
              className="store-field"
              type="password"
              value={authForm.password}
              onChange={(event) => onFormChange('password', event.target.value)}
              placeholder="Contrasena"
              required
            />
            {!isRegister && (
              <button
                type="button"
                className="store-auth-link-button"
                onClick={onPasswordReset}
                disabled={authLoading}
              >
                Olvide mi contrasena
              </button>
            )}
          </>
        )}
        {isRegister && !isGoogleProfileCompletion && (
          <input
            className="store-field"
            type="password"
            value={authForm.confirmPassword}
            onChange={(event) => onFormChange('confirmPassword', event.target.value)}
            placeholder="Confirmar contrasena"
            required
          />
        )}
        {isRegister && (
          <>
            <input
              className="store-field"
              value={authForm.direccion}
              onChange={(event) => onFormChange('direccion', event.target.value)}
              placeholder="Direccion de entrega"
              required
            />
            <input
              className="store-field"
              value={authForm.referencia}
              onChange={(event) => onFormChange('referencia', event.target.value)}
              placeholder="Referencia"
            />
            <LocationCaptureBlock
              location={authForm.ubicacion}
              locating={authLocating}
              onCapture={onCaptureLocation}
              onManualLocation={onManualLocation}
              onAddressResolved={(value) => {
                if (shouldAutofillAddress(authForm.direccion)) {
                  onFormChange('direccion', value);
                }
              }}
            />
          </>
        )}
        <button type="submit" className="store-button" disabled={authLoading}>
          {authLoading
            ? 'Procesando...'
            : isGoogleProfileCompletion
              ? 'Completar cuenta'
              : isRegister
                ? 'Crear cuenta y entrar'
                : 'Entrar a la tienda'}
        </button>
      </form>
    </section>
  );

  if (embedded) {
    return content;
  }

  return <div className="store-auth-page">{content}</div>;
}

function StoreProfileGlyph({ active = false }) {
  return (
    <>
      <svg
        className="store-profile-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="8" r="4" />
      </svg>
      {active && <span className="store-profile-indicator" aria-hidden="true" />}
    </>
  );
}

function StoreBackButton({ onClick, label = 'Volver' }) {
  return (
    <button type="button" className="store-back" onClick={onClick}>
      <span className="store-back-icon" aria-hidden="true">
        ←
      </span>
      <span className="store-back-label">{label}</span>
    </button>
  );
}

function StoreAuthSheet({ onClose, locked = false, ...props }) {
  return (
    <div className="store-sheet-overlay auth-overlay">
      <div className="store-auth-sheet">
        <div className="store-sheet-head">
          {locked ? <span /> : <StoreBackButton onClick={onClose} />}
          <strong>{locked ? 'Ingresa a la tienda' : 'Inicia sesion'}</strong>
        </div>
        <StoreAuthView {...props} embedded />
      </div>
    </div>
  );
}

function LocationCaptureBlock({ location, locating, onCapture, onManualLocation, onAddressResolved }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const mapUrl = buildGoogleMapsPlaceUrl(location);
  const embedUrl = buildGoogleMapsEmbedUrl(location);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length < 3) {
      setSearchResults([]);
      setSearchError('');
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');

      try {
        const results = await searchLocationCandidates(trimmedQuery, {
          countryCode: 'ni',
          limit: 12,
          broad: true,
        });
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('No encontramos coincidencias. Prueba con barrio, negocio, calle o referencia.');
        }
      } catch (error) {
        console.error('No se pudieron buscar direcciones:', error);
        setSearchResults([]);
        setSearchError('No pudimos buscar direcciones en este momento.');
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  return (
    <div className="store-location-card">
      <div>
        <strong>Ubicacion exacta</strong>
        <span>
          Busca tu direccion o negocio, elige un resultado y ajusta el pin si hace falta.
        </span>
      </div>
      <input
        className="store-field"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Buscar direccion, restaurante o negocio"
      />
      {searching && <div className="store-location-feedback">Buscando ubicaciones...</div>}
      {searchError && <div className="store-location-feedback error">{searchError}</div>}
      {searchQuery.trim().length >= 3 && (
        <a
          className="store-location-feedback"
          href={buildGoogleMapsAddressUrl(searchQuery)}
          target="_blank"
          rel="noreferrer"
        >
          Buscar esta direccion en Google Maps
        </a>
      )}
      {searchResults.length > 0 && (
        <div className="store-location-results">
          {searchResults.map((result) => (
            <button
              key={`${result.placeId || result.label}-${result.lat}-${result.lng}`}
              type="button"
              className="store-location-result"
              onClick={() => {
                onManualLocation(result);
                onAddressResolved?.(result.label || result.shortLabel || '');
                setSearchQuery('');
                setSearchResults([]);
                setSearchError('');
              }}
            >
              <strong>{result.shortLabel || 'Direccion encontrada'}</strong>
              <span>{result.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="store-location-actions">
        <button type="button" className="store-button secondary" onClick={onCapture} disabled={locating}>
          {locating ? 'Tomando ubicacion...' : hasLocation(location) ? 'Usar mi ubicacion actual' : 'Ubicacion actual'}
        </button>
        <button type="button" className="store-button secondary" onClick={() => setPickerOpen(true)}>
          Ajustar en mapa
        </button>
      </div>
      {hasLocation(location) && (
        <>
          <div className="store-location-selected">
            <strong>{location?.label || 'Punto guardado'}</strong>
            <span>
              {Number(location?.lat || 0).toFixed(6)}, {Number(location?.lng || 0).toFixed(6)}
            </span>
          </div>
          <div className="store-location-map">
            <iframe title="Ubicacion de entrega" src={embedUrl} loading="lazy" />
          </div>
          <a href={mapUrl} target="_blank" rel="noreferrer">
            Abrir punto en Google Maps
          </a>
        </>
      )}
      {pickerOpen && (
        <MapPointPicker
          location={location}
          onClose={() => setPickerOpen(false)}
          onSave={(nextLocation) => {
            onManualLocation(nextLocation);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MapPointPicker({ location, onClose, onSave }) {
  const initialLocation = normalizeLocation(location) || MAP_PICKER_DEFAULT_LOCATION;
  const [center, setCenter] = useState(initialLocation);
  const [selected, setSelected] = useState(initialLocation);
  const [zoom, setZoom] = useState(16);
  const [latDraft, setLatDraft] = useState(initialLocation.lat.toFixed(6));
  const [lngDraft, setLngDraft] = useState(initialLocation.lng.toFixed(6));
  const [savingPoint, setSavingPoint] = useState(false);
  const [draggingMap, setDraggingMap] = useState(false);
  const dragStateRef = useRef(null);

  useEffect(() => {
    setLatDraft(selected.lat.toFixed(6));
    setLngDraft(selected.lng.toFixed(6));
  }, [selected.lat, selected.lng]);

  const mapGeometry = useMemo(() => {
    const centerPoint = locationToWorldPoint(center, zoom);
    const topLeft = {
      x: centerPoint.x - MAP_PICKER_WIDTH / 2,
      y: centerPoint.y - MAP_PICKER_HEIGHT / 2,
    };
    const tileStartX = Math.floor(topLeft.x / MAP_PICKER_TILE_SIZE);
    const tileEndX = Math.floor((topLeft.x + MAP_PICKER_WIDTH) / MAP_PICKER_TILE_SIZE);
    const tileStartY = Math.floor(topLeft.y / MAP_PICKER_TILE_SIZE);
    const tileEndY = Math.floor((topLeft.y + MAP_PICKER_HEIGHT) / MAP_PICKER_TILE_SIZE);
    const tileCount = 2 ** zoom;
    const tiles = [];

    for (let x = tileStartX; x <= tileEndX; x += 1) {
      for (let y = tileStartY; y <= tileEndY; y += 1) {
        if (y < 0 || y >= tileCount) {
          continue;
        }

        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${zoom}-${x}-${y}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
          left: x * MAP_PICKER_TILE_SIZE - topLeft.x,
          top: y * MAP_PICKER_TILE_SIZE - topLeft.y,
        });
      }
    }

    return { tiles, topLeft };
  }, [center, zoom]);

  const selectedPoint = useMemo(() => {
    const point = locationToWorldPoint(selected, zoom);
    return {
      left: point.x - mapGeometry.topLeft.x,
      top: point.y - mapGeometry.topLeft.y,
    };
  }, [mapGeometry.topLeft.x, mapGeometry.topLeft.y, selected, zoom]);

  const applyManualCoordinates = () => {
    const nextLocation = buildManualLocation(latDraft, lngDraft);
    if (!nextLocation) {
      return;
    }

    setSelected(nextLocation);
    setCenter(nextLocation);
  };

  const getMapEventPoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (MAP_PICKER_WIDTH / rect.width),
      y: (event.clientY - rect.top) * (MAP_PICKER_HEIGHT / rect.height),
    };
  };

  const movePinToLocation = (nextLocation) => {
    if (!nextLocation) {
      return;
    }

    setSelected(nextLocation);
    setCenter(nextLocation);
  };

  const handleMapPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCenterPoint: locationToWorldPoint(center, zoom),
      rectWidth: rect.width,
      rectHeight: rect.height,
      dragged: false,
    };

    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDraggingMap(true);
  };

  const handleMapPointerMove = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = (event.clientX - dragState.startClientX) * (MAP_PICKER_WIDTH / dragState.rectWidth);
    const deltaY = (event.clientY - dragState.startClientY) * (MAP_PICKER_HEIGHT / dragState.rectHeight);

    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) {
      dragState.dragged = true;
    }

    if (!dragState.dragged) {
      return;
    }

    event.preventDefault();
    movePinToLocation(
      worldPointToLocation(
        dragState.startCenterPoint.x - deltaX,
        dragState.startCenterPoint.y - deltaY,
        zoom
      )
    );
  };

  const finishMapPointer = (event) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
    setDraggingMap(false);

    if (dragState.dragged) {
      return;
    }

    const point = getMapEventPoint(event);
    const nextLocation = worldPointToLocation(
      mapGeometry.topLeft.x + point.x,
      mapGeometry.topLeft.y + point.y,
      zoom
    );

    movePinToLocation(nextLocation);
  };

  const cancelMapPointer = (event) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      dragStateRef.current = null;
      setDraggingMap(false);
    }
  };

  return (
    <div className="store-sheet-overlay">
      <div className="store-map-picker">
        <div className="store-map-picker-head">
          <div>
            <strong>Ubicar punto de entrega</strong>
            <span>Arrastra el mapa o toca el punto exacto donde debe llegar el entregador.</span>
          </div>
          <StoreBackButton onClick={onClose} />
        </div>

        <div
          className={`store-map-canvas ${draggingMap ? 'dragging' : ''}`}
          onPointerDown={handleMapPointerDown}
          onPointerMove={handleMapPointerMove}
          onPointerUp={finishMapPointer}
          onPointerCancel={cancelMapPointer}
        >
          {mapGeometry.tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <span className="store-map-pin" style={{ left: selectedPoint.left, top: selectedPoint.top }} />
          <div className="store-map-hint">Arrastra el mapa o toca para mover el pin</div>
        </div>

        <div className="store-map-tools">
          <button type="button" className="store-mini-button" onClick={() => setZoom((value) => Math.min(18, value + 1))}>
            Acercar
          </button>
          <button type="button" className="store-mini-button" onClick={() => setZoom((value) => Math.max(12, value - 1))}>
            Alejar
          </button>
          <button type="button" className="store-mini-button" onClick={() => setCenter(selected)}>
            Centrar pin
          </button>
        </div>

        <div className="store-map-fields">
          <input
            className="store-field"
            value={latDraft}
            onChange={(event) => setLatDraft(event.target.value)}
            placeholder="Latitud"
          />
          <input
            className="store-field"
            value={lngDraft}
            onChange={(event) => setLngDraft(event.target.value)}
            placeholder="Longitud"
          />
        </div>
        <div className="store-location-selected">
          <strong>{selected?.label || 'Punto seleccionado'}</strong>
          <span>{latDraft}, {lngDraft}</span>
        </div>
        <div className="store-map-tools">
          <button type="button" className="store-mini-button" onClick={applyManualCoordinates}>
            Aplicar coordenadas
          </button>
          <a className="store-mini-button" href={buildGoogleMapsPlaceUrl(selected)} target="_blank" rel="noreferrer">
            Ver en Google Maps
          </a>
        </div>

        <div className="store-map-picker-actions">
          <button type="button" className="store-button secondary" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="store-button"
            style={{ flex: 2 }}
            disabled={savingPoint}
            onClick={async () => {
              setSavingPoint(true);
              try {
                const resolvedLocation = (await reverseGeocodeLocation(selected)) || selected;
                onSave(resolvedLocation);
              } catch (error) {
                console.error('No se pudo resolver el punto seleccionado:', error);
                onSave(selected);
              } finally {
                setSavingPoint(false);
              }
            }}
          >
            {savingPoint ? 'Guardando punto...' : 'Guardar este punto'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileSheet({ user, saving, onClose, onSave, onSignOut }) {
  const [profile, setProfile] = useState({
    nombre: user?.nombre || '',
    direccion: user?.direccion || '',
    referencia: user?.referencia || '',
    fechaCumpleanos: getBirthdayFieldValue(user?.fechaCumpleanos || user?.fechaNacimiento || ''),
    ubicacion: user?.ubicacion || null,
  });
  const [locating, setLocating] = useState(false);

  const updateProfile = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: field === 'fechaCumpleanos' ? normalizeBirthdayInput(value) : value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!profile.nombre.trim() || !profile.direccion.trim() || !hasLocation(profile.ubicacion)) {
      alert('Nombre, direccion y punto exacto en el mapa son obligatorios.');
      return;
    }

    if (profile.fechaCumpleanos && !normalizeBirthdayValue(profile.fechaCumpleanos)) {
      alert('Ingresa tu fecha de cumpleanos solo con dia y mes, por ejemplo 27/06.');
      return;
    }

    onSave(profile);
  };

  const captureProfileLocation = async () => {
    setLocating(true);
    try {
      const currentLocation = await getBrowserLocation();
      const location = (await reverseGeocodeLocation(currentLocation)) || currentLocation;
      updateProfile('ubicacion', location);
      if (shouldAutofillAddress(profile.direccion)) {
        updateProfile('direccion', location?.label || 'Ubicacion guardada desde el mapa');
      }
    } catch (error) {
      console.error('No se pudo obtener ubicacion:', error);
      alert('No pudimos tomar tu ubicacion. Activa permisos o intenta de nuevo.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <StoreBackButton onClick={onClose} />
          <strong>Mi perfil</strong>
        </div>

        <form className="store-form" onSubmit={handleSubmit}>
          <input
            className="store-field"
            value={profile.nombre}
            onChange={(event) => updateProfile('nombre', event.target.value)}
            placeholder="Nombre completo"
          />
          <input className="store-field" value={user?.telefono || ''} disabled />
          <input
            className="store-field"
            value={profile.direccion}
            onChange={(event) => updateProfile('direccion', event.target.value)}
            placeholder="Direccion de entrega"
          />
          <label className="store-field-stack">
            <span className="store-field-caption">Fecha de cumpleanos</span>
            <input
              className="store-field"
              type="text"
              inputMode="numeric"
              autoComplete="bday-day"
              placeholder="DD/MM"
              maxLength={5}
              value={profile.fechaCumpleanos || ''}
              onChange={(event) => updateProfile('fechaCumpleanos', event.target.value)}
            />
            <span className="store-field-note">RECIBIRAS PREMIO ESPECIAL EN TU CUMPLEANOS</span>
          </label>
          <input
            className="store-field"
            value={profile.referencia}
            onChange={(event) => updateProfile('referencia', event.target.value)}
            placeholder="Referencia"
          />
          <LocationCaptureBlock
            location={profile.ubicacion}
            locating={locating}
            onCapture={captureProfileLocation}
            onManualLocation={(location) => {
              updateProfile('ubicacion', location);
              if (shouldAutofillAddress(profile.direccion)) {
                updateProfile('direccion', location?.label || 'Ubicacion seleccionada en el mapa');
              }
            }}
            onAddressResolved={(value) => {
              if (shouldAutofillAddress(profile.direccion)) {
                updateProfile('direccion', value);
              }
            }}
          />
          <button type="submit" className="store-button" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar perfil'}
          </button>
          <button type="button" className="store-button secondary" onClick={onSignOut}>
            Cerrar sesion
          </button>
        </form>
      </div>
    </div>
  );
}

function PromotionViewer({ promotions, activeIndex, onChange, onClose }) {
  const promotion = promotions[activeIndex] || null;
  const isFirstPromotion = activeIndex <= 0;
  const isLastPromotion = activeIndex >= promotions.length - 1;

  const goToPrevious = () => {
    if (isFirstPromotion) {
      return;
    }

    onChange(activeIndex - 1);
  };

  const goToNext = () => {
    if (isLastPromotion) {
      onClose();
      return;
    }

    onChange(activeIndex + 1);
  };

  useEffect(() => {
    if (!promotion || typeof window === 'undefined') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (isLastPromotion) {
        onClose();
        return;
      }

      onChange(activeIndex + 1);
    }, STORE_STORY_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [promotion, activeIndex, isLastPromotion, onChange, onClose]);

  useEffect(() => {
    if (!promotion || typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promotion, activeIndex]);

  useEffect(() => {
    if (!promotion || typeof document === 'undefined') {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [promotion]);

  if (!promotion) {
    return null;
  }

  return (
    <div className="store-story-viewer-overlay" onClick={onClose}>
      <div
        className="store-story-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Promocion ${activeIndex + 1} de ${promotions.length}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="store-story-progress" aria-hidden="true">
          {promotions.map((item, index) => (
            <span key={item.id} className="store-story-progress-track">
              <span
                className={[
                  'store-story-progress-fill',
                  index === activeIndex ? 'active' : '',
                  index < activeIndex ? 'done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={index === activeIndex ? { animationDuration: `${STORE_STORY_DURATION_MS}ms` } : undefined}
              />
            </span>
          ))}
        </div>

        <div className="store-story-viewer-head">
          <div className="store-story-viewer-meta">
            <span className="store-story-viewer-count">
              Historia {activeIndex + 1} / {promotions.length}
            </span>
            <strong>{promotion.title}</strong>
          </div>
          <button type="button" className="store-story-close" onClick={onClose} aria-label="Cerrar historias">
            ×
          </button>
        </div>

        <div className="store-story-frame">
          <img src={promotion.image} alt={promotion.title} />
          <div className="store-story-scrim top" />
          <div className="store-story-scrim bottom" />

          <div className="store-story-nav" aria-hidden="true">
            <button
              type="button"
              onClick={goToPrevious}
              disabled={isFirstPromotion}
              aria-label="Promocion anterior"
            />
            <button
              type="button"
              onClick={goToNext}
              aria-label={isLastPromotion ? 'Cerrar historias' : 'Siguiente promocion'}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuantityInput({ value, step, className, onChange, ariaLabel }) {
  const [draftValue, setDraftValue] = useState(value ? String(value) : '');

  useEffect(() => {
    setDraftValue(value ? String(value) : '');
  }, [value]);

  const handleChange = (event) => {
    const nextValue = event.target.value.replace(',', '.');

    if (!/^\d*\.?\d*$/.test(nextValue)) {
      return;
    }

    setDraftValue(nextValue);
    onChange(nextValue);
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draftValue}
      placeholder="0"
      onChange={handleChange}
      onBlur={() => setDraftValue(value ? String(value) : '')}
    />
  );
}

function FloatingCart({
  cartItems,
  cartCount,
  couponDiscount,
  approximateTotalAmount,
  onCheckout,
  onQuantityChange,
}) {
  return (
    <aside className="store-floating-cart" aria-label="Carrito flotante">
      <div className="store-floating-cart-head">
        <div>
          <strong>Tu carrito</strong>
          <span>{cartCount === 1 ? '1 producto agregado' : `${cartCount} productos agregados`}</span>
        </div>
        <button type="button" className="store-button" onClick={onCheckout}>
          Ver pedido
        </button>
      </div>

      <div className="store-floating-cart-items">
        {cartItems.map((item) => {
          const step = getQuantityStep({ unit: item.unidad, quantityStep: item.quantityStep });
          const minQuantity = getMinQuantity({ unit: item.unidad, minQuantity: item.minQuantity });
          const currentQuantity = Number(item.cantidad || 0);

          return (
            <div key={item.codigo} className="store-floating-cart-item">
              <img
                className="store-floating-cart-thumb"
                src={item.image || LOGO_PATH}
                alt={item.nombre}
              />
              <div>
                <p className="store-floating-cart-name">{item.nombre}</p>
                <div className="store-floating-cart-controls">
                  <button
                    type="button"
                    aria-label={`Quitar ${item.nombre}`}
                    onClick={() =>
                      onQuantityChange(
                        item.codigo,
                        currentQuantity <= minQuantity + QUANTITY_EPSILON ? 0 : currentQuantity - step
                      )
                    }
                  >
                    -
                  </button>
                  <QuantityInput
                    className="store-floating-qty-input"
                    step={step}
                    value={currentQuantity}
                    ariaLabel={`Cantidad de ${item.nombre}`}
                    onChange={(nextValue) => onQuantityChange(item.codigo, nextValue)}
                  />
                  <button
                    type="button"
                    aria-label={`Agregar ${item.nombre}`}
                    onClick={() => onQuantityChange(item.codigo, currentQuantity + step)}
                  >
                    +
                  </button>
                  <strong>{formatCurrency(item.subtotal)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="store-floating-cart-total">
        <div>
          <small>Total</small>
          {couponDiscount > 0 && <span>-{formatCurrency(couponDiscount)} en cupon</span>}
          <strong>{formatCurrency(approximateTotalAmount)}</strong>
          <em>Nota: Total puede variar por diferencia en pesos de sus productos.</em>
        </div>
        <button type="button" className="store-button" onClick={onCheckout}>
          Confirmar
        </button>
      </div>
    </aside>
  );
}

function MobileCartBar({ cartCount, approximateTotalAmount, hidden, onOpen }) {
  return (
    <button
      type="button"
      className={`store-mobile-cart ${hidden ? 'hidden' : ''}`}
      onClick={onOpen}
      aria-label="Abrir carrito"
    >
      <div>
        <strong>{cartCount === 1 ? '1 producto' : `${cartCount} productos`}</strong>
        <span>{formatCurrency(approximateTotalAmount)}</span>
      </div>
      <em>Ver carrito</em>
    </button>
  );
}

function ProductSheet({ product, cartQuantity, quantity, onClose, onConfirm, onQuantityChange }) {
  const subtotal = Number(quantity || 0) * Number(product.price || 0);
  const step = getQuantityStep(product);
  const minQuantity = getMinQuantity(product);

  return (
    <div className="store-sheet-overlay product-overlay">
      <div className="store-sheet full store-product-sheet">
        <div className="store-sheet-head product">
          <StoreBackButton onClick={onClose} />
          <div className="store-product-sheet-heading">
            <span>{product.code}</span>
            <strong>Detalle del producto</strong>
          </div>
        </div>

        <div className="store-detail-grid">
          <div className="store-detail-image">
            <img src={product.image || LOGO_PATH} alt={product.name} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 30, lineHeight: 1.04 }}>{product.name}</h2>
            <p className="store-price" style={{ fontSize: 24 }}>
              {formatCurrency(product.price)}
            </p>
            <p className="store-unit">{product.description || `Precio por ${product.unit}`}</p>
            <p className="store-unit" style={{ marginTop: 8 }}>
              {getQuantityRuleMessage(product)}
            </p>
            {cartQuantity > 0 && (
              <p className="store-unit" style={{ marginTop: 6 }}>
                Actualmente tienes {formatStoreQuantity(cartQuantity, product.unit)} {product.unit} en carrito.
              </p>
            )}

            <div className="store-qty-row">
              {getQuickQuantities(product).map((weight) => (
                <button
                  key={weight}
                  type="button"
                  className={`store-chip ${quantity === weight ? 'active' : ''}`}
                  onClick={() => onQuantityChange(weight)}
                >
                  {formatStoreQuantity(weight, product.unit)} {product.unit}
                </button>
              ))}
            </div>

            <div className="store-stepper">
              <button
                type="button"
                onClick={() => onQuantityChange(quantity <= minQuantity + QUANTITY_EPSILON ? 0 : quantity - step)}
              >
                -
              </button>
              <QuantityInput
                className="store-qty-input"
                step={step}
                value={quantity}
                ariaLabel={`Cantidad de ${product.name}`}
                onChange={onQuantityChange}
              />
              <button type="button" onClick={() => onQuantityChange(quantity > 0 ? quantity + step : minQuantity)}>
                +
              </button>
            </div>

            <p className="store-unit" style={{ marginBottom: 14 }}>
              {quantity > 0
                ? `${formatStoreQuantity(quantity, product.unit)} ${product.unit} seleccionado`
                : `Elige la cantidad en ${product.unit}`}
            </p>

            <button
              type="button"
              className="store-button"
              style={{ width: '100%' }}
              disabled={quantity <= 0 && cartQuantity <= 0}
              onClick={onConfirm}
            >
              {quantity > 0
                ? `Guardar ${formatCurrency(subtotal)}`
                : cartQuantity > 0
                  ? 'Quitar del carrito'
                  : 'Selecciona cantidad para agregar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StoreCheckoutIcon({ name }) {
  const commonProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  const icons = {
    route: (
      <svg {...commonProps}>
        <path d="M5 18c2.8-5 11.2-2 14-7" />
        <circle cx="5" cy="18" r="2" />
        <circle cx="19" cy="7" r="2" />
      </svg>
    ),
    delivery: (
      <svg {...commonProps}>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h3l3 3v3h-6z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="17" cy="18" r="2" />
      </svg>
    ),
    pickup: (
      <svg {...commonProps}>
        <path d="M6 8h12l-1 12H7z" />
        <path d="M9 8a3 3 0 0 1 6 0" />
        <path d="M8 12h8" />
      </svg>
    ),
    home: (
      <svg {...commonProps}>
        <path d="M4 11 12 4l8 7" />
        <path d="M6 10v10h12V10" />
        <path d="M10 20v-5h4v5" />
      </svg>
    ),
    pin: (
      <svg {...commonProps}>
        <path d="M12 21s7-5.2 7-11a7 7 0 0 0-14 0c0 5.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.3" />
      </svg>
    ),
    wallet: (
      <svg {...commonProps}>
        <path d="M4 7h15a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2V6a2 2 0 0 0 2 1z" />
        <path d="M16 13h5" />
        <circle cx="17.5" cy="13" r=".5" />
      </svg>
    ),
    card: (
      <svg {...commonProps}>
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 10h18" />
        <path d="M7 15h4" />
      </svg>
    ),
    bank: (
      <svg {...commonProps}>
        <path d="M4 10h16" />
        <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
        <path d="M3 19h18" />
        <path d="m12 4 8 4H4z" />
      </svg>
    ),
    link: (
      <svg {...commonProps}>
        <path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.6 5" />
        <path d="M14 11a5 5 0 0 0-7.1 0l-1.4 1.4a5 5 0 0 0 7.1 7.1l.8-.8" />
      </svg>
    ),
    cash: (
      <svg {...commonProps}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="12" cy="12" r="3" />
        <path d="M6 9v6M18 9v6" />
      </svg>
    ),
  };

  return <span className="store-checkout-icon">{icons[name] || icons.wallet}</span>;
}

function CheckoutSheet({
  cartItems,
  currentUser,
  customer,
  fulfillmentType,
  deliveryMode,
  alternateDelivery,
  alternateLocating,
  notes,
  submitting,
  appliedCoupon,
  couponDiscount,
  couponInput,
  couponMessage,
  approximateTotalAmount,
  estimatedRewardPoints,
  totalAmount,
  rewardSettings,
  selectedReward,
  welcomeCoupon,
  welcomeCouponStatus,
  welcomeCouponActionBusy,
  onClose,
  onApplyCoupon,
  onAlternateDeliveryChange,
  onCaptureAlternateLocation,
  onClaimWelcomeCoupon,
  onApplySpecificCoupon,
  onCustomerChange,
  onCouponInputChange,
  onFulfillmentTypeChange,
  onDeliveryModeChange,
  onEditProfile,
  onNotesChange,
  onOpenLogin,
  onOpenRegister,
  onOpenRewards,
  onClearSelectedReward,
  onQuantityChange,
  onRemoveCoupon,
  onSubmit,
}) {
  const isGuestCheckout = !currentUser;
  const pickupFlow = fulfillmentType === ORDER_FULFILLMENT_PICKUP;
  const paymentValue = normalizeCheckoutPayment(customer.metodoPago);
  const [checkoutStep, setCheckoutStep] = useState('cart');
  const isCartStep = checkoutStep === 'cart';
  const deliveryChoices = [
    {
      value: ORDER_FULFILLMENT_DELIVERY,
      icon: 'delivery',
      title: 'Domicilio',
      detail: 'Entrega a domicilio',
    },
    {
      value: ORDER_FULFILLMENT_PICKUP,
      icon: 'pickup',
      title: 'Pickup',
      detail: 'Retirar en tienda',
    },
  ];
  const addressChoices = [
    {
      value: 'perfil',
      icon: 'home',
      title: 'Mi direccion',
      detail: 'Usar guardada',
    },
    {
      value: 'otra',
      icon: 'pin',
      title: 'Otra',
      detail: 'Nueva entrega',
    },
  ];
  const paymentChoices = STORE_PAYMENT_OPTIONS.map(getPaymentMeta);
  const showWelcomeCouponCard =
    welcomeCoupon &&
    welcomeCoupon.coupon &&
    welcomeCouponStatus !== 'used';
  const welcomeCouponCanApply =
    showWelcomeCouponCard &&
    Number(totalAmount || 0) >= Number(welcomeCoupon.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM);
  const welcomeCouponIsApplied =
    normalizeCouponCode(appliedCoupon?.code) === normalizeCouponCode(welcomeCoupon?.coupon?.code);

  useEffect(() => {
    setCheckoutStep('cart');
  }, [cartItems.length]);

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet store-checkout-sheet">
        <div className="store-sheet-head">
          <StoreBackButton onClick={isCartStep ? onClose : () => setCheckoutStep('cart')} />
          <strong>{isCartStep ? 'Tu pedido' : 'Entrega y pago'}</strong>
        </div>

        <div className="store-checkout-progress">
          <span className={isCartStep ? 'active' : ''}>1. Carrito</span>
          <span className={!isCartStep ? 'active' : ''}>2. Confirmar</span>
        </div>

        {isCartStep ? (
          <div className="store-checkout-step">
            {cartItems.map((item) => (
              <div key={item.codigo} className="store-order-line">
                <img src={item.image || LOGO_PATH} alt={item.nombre} />
                <div>
                  <strong>{item.nombre}</strong>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>
                    {formatStoreQuantity(item.cantidad, item.unidad)} {item.unidad} x{' '}
                    {formatCurrency(item.precioUnitario)}
                  </div>
                  <div className="store-order-line-controls">
                    <button
                      type="button"
                      onClick={() =>
                        onQuantityChange(
                          item.codigo,
                          Number(item.cantidad || 0) <= Number(item.minQuantity || 0) + QUANTITY_EPSILON
                            ? 0
                            : Number(item.cantidad || 0) - Number(item.quantityStep || 1)
                        )
                      }
                    >
                      -
                    </button>
                    <QuantityInput
                      className="store-floating-qty-input"
                      step={item.quantityStep}
                      value={Number(item.cantidad || 0)}
                      ariaLabel={`Cantidad de ${item.nombre}`}
                      onChange={(nextValue) => onQuantityChange(item.codigo, nextValue)}
                    />
                    <button
                      type="button"
                      onClick={() => onQuantityChange(item.codigo, Number(item.cantidad || 0) + Number(item.quantityStep || 1))}
                    >
                      +
                    </button>
                    <button type="button" className="store-order-line-remove" onClick={() => onQuantityChange(item.codigo, 0)}>
                      Quitar
                    </button>
                  </div>
                </div>
                <strong>{formatCurrency(item.subtotal)}</strong>
              </div>
            ))}

            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 8px' }}>
              <strong>Total</strong>
              <strong>{formatCurrency(totalAmount)}</strong>
            </div>
            <p style={{ margin: '0 0 14px', color: 'var(--store-text-soft)', fontSize: '0.92rem' }}>
              Precios incluyen <strong>IVA</strong>.
            </p>

            {showWelcomeCouponCard && (
              <div className="store-status-card" style={{ marginTop: 0 }}>
                <div className="store-status-pill">Cupon de bienvenida</div>
                <h3 style={{ margin: '10px 0 4px' }}>
                  {formatCurrency(welcomeCoupon.amount || STORE_WELCOME_COUPON_AMOUNT)} para tu compra
                </h3>
                <p style={{ margin: 0 }}>
                  {welcomeCouponStatus === 'available'
                    ? `Activalo primero. Compra minima ${formatCurrency(
                        welcomeCoupon.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM
                      )}.`
                    : getWelcomeCouponCartMessage(welcomeCoupon, totalAmount)}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  {welcomeCouponStatus === 'available' ? (
                    <button
                      type="button"
                      className="store-button"
                      onClick={onClaimWelcomeCoupon}
                      disabled={welcomeCouponActionBusy}
                    >
                      {welcomeCouponActionBusy ? 'Activando...' : 'Canjear'}
                    </button>
                  ) : welcomeCouponCanApply && !welcomeCouponIsApplied ? (
                    <button
                      type="button"
                      className="store-button"
                      onClick={() => onApplySpecificCoupon(welcomeCoupon.coupon)}
                    >
                      Aplicar automaticamente
                    </button>
                  ) : welcomeCouponIsApplied ? (
                    <button type="button" className="store-button secondary" onClick={onRemoveCoupon}>
                      Quitar cupon
                    </button>
                  ) : null}
                  <span
                    style={{
                      alignSelf: 'center',
                      color: 'var(--store-text-soft)',
                      fontSize: '0.92rem',
                      fontWeight: 700,
                    }}
                  >
                    {welcomeCouponCanApply
                      ? `Codigo ${welcomeCoupon.coupon.code}`
                      : `Se activa al llegar a ${formatCurrency(
                          welcomeCoupon.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM
                        )}`}
                  </span>
                </div>
              </div>
            )}

            <div className="store-coupon-card">
              <div>
                <strong>Cupon</strong>
                <span>Si tienes un codigo promocional, aplicalo aqui.</span>
              </div>
              <div className="store-coupon-row">
                <input
                  className="store-input"
                  value={couponInput}
                  onChange={(event) => onCouponInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onApplyCoupon();
                    }
                  }}
                  placeholder="Codigo de cupon"
                />
                {appliedCoupon ? (
                  <button type="button" className="store-button secondary" onClick={onRemoveCoupon}>
                    Quitar
                  </button>
                ) : (
                  <button type="button" className="store-button secondary" onClick={onApplyCoupon}>
                    Aplicar
                  </button>
                )}
              </div>
              {couponMessage && <p>{couponMessage}</p>}
              {couponDiscount > 0 && (
                <div className="store-coupon-discount">
                  <span>{appliedCoupon?.code}</span>
                  <strong>-{formatCurrency(couponDiscount)}</strong>
                </div>
              )}
            </div>

            <div className="store-total-note">
              <div>
                <span>Total</span>
                <strong>{formatCurrency(approximateTotalAmount)}</strong>
              </div>
              <p>
                <strong>Nota:</strong> Total puede variar por diferencia en pesos de sus productos.
              </p>
            </div>

            <div className="store-status-card" style={{ marginTop: 0 }}>
              <div className="store-status-pill">Miembro Gold</div>
              <h3 style={{ margin: '10px 0 4px' }}>
                {currentUser
                  ? `Con esta compra ganaras aproximadamente ${estimatedRewardPoints} puntos.`
                  : 'Inicia sesion para acumular puntos en cada compra.'}
              </h3>
              {!currentUser && (
                <p style={{ margin: 0 }}>
                  Como invitado puedes comprar normal, pero Miembro Gold San Martin Granada necesita cuenta para guardar tus puntos.
                </p>
              )}
              {rewardSettings?.enabled !== false && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  {selectedReward ? (
                    <>
                      <button type="button" className="store-button" onClick={onOpenRewards}>
                        Premio seleccionado
                      </button>
                      <button type="button" className="store-button secondary" onClick={onClearSelectedReward}>
                        Seguir acumulando
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="store-button secondary"
                      onClick={currentUser ? onOpenRewards : onOpenLogin}
                    >
                      {currentUser ? 'Canjear premio en este pedido' : 'Inicia sesion para canjear'}
                    </button>
                  )}
                </div>
              )}
            </div>

            <button type="button" className="store-button" onClick={() => setCheckoutStep('details')}>
              Pedir en linea
            </button>
          </div>
        ) : (
          <form className="store-form" onSubmit={onSubmit}>
            <div className="store-checkout-mini-total">
              <span>Total</span>
              <strong>{formatCurrency(approximateTotalAmount)}</strong>
            </div>
            <p style={{ margin: '0 0 14px', color: 'var(--store-text-soft)', fontSize: '0.92rem' }}>
              Precios incluyen <strong>IVA</strong>.
            </p>

            {showWelcomeCouponCard && (
              <div className="store-status-card" style={{ marginTop: 0 }}>
                <div className="store-status-pill">Cupon de bienvenida</div>
                <h3 style={{ margin: '10px 0 4px' }}>
                  {formatCurrency(welcomeCoupon.amount || STORE_WELCOME_COUPON_AMOUNT)} disponibles
                </h3>
                <p style={{ margin: 0 }}>
                  {welcomeCouponStatus === 'available'
                    ? `Activalo primero. Compra minima ${formatCurrency(
                        welcomeCoupon.minimumPurchase || STORE_WELCOME_COUPON_MINIMUM
                      )}.`
                    : getWelcomeCouponCartMessage(welcomeCoupon, totalAmount)}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  {welcomeCouponStatus === 'available' ? (
                    <button
                      type="button"
                      className="store-button"
                      onClick={onClaimWelcomeCoupon}
                      disabled={welcomeCouponActionBusy}
                    >
                      {welcomeCouponActionBusy ? 'Activando...' : 'Canjear'}
                    </button>
                  ) : welcomeCouponCanApply && !welcomeCouponIsApplied ? (
                    <button
                      type="button"
                      className="store-button secondary"
                      onClick={() => onApplySpecificCoupon(welcomeCoupon.coupon)}
                    >
                      Aplicar automaticamente
                    </button>
                  ) : welcomeCouponIsApplied ? (
                    <button type="button" className="store-button secondary" onClick={onRemoveCoupon}>
                      Cupon aplicado
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {rewardSettings?.enabled !== false && (
              <div className="store-status-card" style={{ marginTop: 0 }}>
                <div className="store-status-pill">Miembro Gold</div>
                <h3 style={{ margin: '10px 0 4px' }}>
                  {selectedReward
                    ? `Premio elegido: ${selectedReward.rewardName}`
                    : `Con esta compra ganaras aproximadamente ${estimatedRewardPoints} puntos.`}
                </h3>
                <p style={{ margin: 0 }}>
                  {selectedReward
                    ? 'Solo se permite un premio por pedido. Si prefieres, puedes seguir acumulando para uno mejor.'
                    : 'Puedes elegir un premio ahora si ya alcanzaste los puntos necesarios.'}
                </p>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                  <button
                    type="button"
                    className="store-button secondary"
                    onClick={currentUser ? onOpenRewards : onOpenLogin}
                  >
                    {selectedReward ? 'Cambiar premio' : 'Ver recompensas'}
                  </button>
                  {selectedReward && (
                    <button type="button" className="store-button secondary" onClick={onClearSelectedReward}>
                      Seguir acumulando
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="store-choice-section">
              <div className="store-choice-title">
                <StoreCheckoutIcon name="route" />
                <span>Tipo de entrega</span>
              </div>
              <div className="store-choice-grid two">
                {deliveryChoices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    className={`store-choice-card ${fulfillmentType === choice.value ? 'active' : ''}`}
                    aria-pressed={fulfillmentType === choice.value}
                    onClick={() => onFulfillmentTypeChange(choice.value)}
                  >
                    <StoreCheckoutIcon name={choice.icon} />
                    <strong>{choice.title}</strong>
                    <span>{choice.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            {isGuestCheckout ? (
              <div className="store-status-card store-auth-choice-card">
                <div className="store-status-pill">Realizar pedido en linea</div>
                <h3 style={{ margin: '10px 0 4px' }}>
                  Inicia sesion o crea tu cuenta para enviar el pedido
                </h3>
                <p>Asi guardamos tu direccion, historial y estado del pedido en un solo lugar.</p>
                <div className="store-auth-inline-actions">
                  <button type="button" className="store-button" onClick={onOpenLogin}>
                    Inicia sesion
                  </button>
                  <button type="button" className="store-button secondary" onClick={onOpenRegister}>
                    Crear cuenta
                  </button>
                </div>
              </div>
            ) : (
              <>
                {pickupFlow ? (
                  <div className="store-status-card" style={{ marginTop: 0 }}>
                    <div className="store-status-pill">Pickup</div>
                    <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
                    <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
                      {currentUser.telefono}
                      <br />
                      Recogeras este pedido directamente en tienda.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="store-choice-section compact">
                      <div className="store-choice-title">
                        <StoreCheckoutIcon name="pin" />
                        <span>Direccion</span>
                      </div>
                      <div className="store-choice-grid two">
                        {addressChoices.map((choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            className={`store-choice-card mini ${deliveryMode === choice.value ? 'active' : ''}`}
                            aria-pressed={deliveryMode === choice.value}
                            onClick={() => onDeliveryModeChange(choice.value)}
                          >
                            <StoreCheckoutIcon name={choice.icon} />
                            <strong>{choice.title}</strong>
                            <span>{choice.detail}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {deliveryMode === 'perfil' ? (
                      <div className="store-status-card" style={{ marginTop: 0 }}>
                        <div className="store-status-pill">Entrega</div>
                        <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
                        <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
                          {currentUser.telefono}
                          <br />
                          {currentUser.direccion}
                          {currentUser.referencia ? ` | Ref: ${currentUser.referencia}` : ''}
                        </div>
                        {!hasLocation(currentUser.ubicacion) && (
                          <div className="store-location-feedback error" style={{ marginTop: 10 }}>
                            Debes guardar el punto exacto del mapa en tu perfil antes de pedir.
                          </div>
                        )}
                        <button
                          type="button"
                          className="store-button secondary"
                          style={{ marginTop: 10 }}
                          onClick={onEditProfile}
                        >
                          Editar mi direccion
                        </button>
                      </div>
                    ) : (
                      <div className="store-status-card" style={{ marginTop: 0 }}>
                        <div className="store-status-pill">Entrega alterna</div>
                        <div className="store-form" style={{ marginTop: 12 }}>
                          <input
                            className="store-field"
                            value={alternateDelivery.direccion}
                            onChange={(event) => onAlternateDeliveryChange('direccion', event.target.value)}
                            placeholder="Direccion de entrega"
                          />
                          <input
                            className="store-field"
                            value={alternateDelivery.referencia}
                            onChange={(event) => onAlternateDeliveryChange('referencia', event.target.value)}
                            placeholder="Referencia"
                          />
                          <LocationCaptureBlock
                            location={alternateDelivery.ubicacion}
                            locating={alternateLocating}
                            onCapture={onCaptureAlternateLocation}
                            onManualLocation={(location) => {
                              onAlternateDeliveryChange('ubicacion', location);
                              if (shouldAutofillAddress(alternateDelivery.direccion)) {
                                onAlternateDeliveryChange('direccion', location?.label || 'Ubicacion seleccionada en el mapa');
                              }
                            }}
                            onAddressResolved={(value) => {
                              if (shouldAutofillAddress(alternateDelivery.direccion)) {
                                onAlternateDeliveryChange('direccion', value);
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            <div className="store-choice-section">
              <div className="store-choice-title">
                <StoreCheckoutIcon name="wallet" />
                <span>Forma de pago</span>
              </div>
              <div className="store-choice-grid payment">
                {paymentChoices.map((payment) => (
                  <button
                    key={payment.value}
                    type="button"
                    className={`store-choice-card payment ${paymentValue === payment.value ? 'active' : ''}`}
                    aria-pressed={paymentValue === payment.value}
                    onClick={() => onCustomerChange('metodoPago', payment.value)}
                  >
                    <StoreCheckoutIcon name={payment.icon} />
                    <strong>{payment.title}</strong>
                    <span>{payment.detail}</span>
                  </button>
                ))}
              </div>
            </div>

            {paymentValue === 'LINK DE PAGO' && (
              <div className="store-payment-note">
                <StoreCheckoutIcon name="link" />
                <span>Se enviara el link por WhatsApp a tu numero registrado.</span>
              </div>
            )}

            {paymentValue === STORE_CASH_PAYMENT && (
              <label className="store-cash-change">
                <span>Necesito cambio para:</span>
                <input
                  className="store-field"
                  value={customer.cambioPara || ''}
                  inputMode="decimal"
                  onChange={(event) => onCustomerChange('cambioPara', event.target.value)}
                  placeholder="Ej. C$ 500"
                />
              </label>
            )}
            <textarea
              className="store-textarea"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Notas para tu pedido"
            />
            <button type="submit" className="store-button" disabled={submitting}>
              {submitting ? 'Enviando...' : 'Realizar pedido en linea'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function PromotionsStrip({ promotions, onOpen }) {
  if (!Array.isArray(promotions) || promotions.length === 0) {
    return null;
  }

  return (
    <section className="store-promo">
      <h2 className="store-section-title">Promociones activas</h2>
      <div className="store-stories">
        {promotions.map((promotion, index) => (
          <button
            key={promotion.id}
            type="button"
            className="store-story"
            onClick={() => onOpen(index)}
          >
            <span className="store-story-ring">
              <img src={promotion.image} alt={promotion.title} loading="lazy" decoding="async" />
            </span>
            <span className="store-story-title">{promotion.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FloatingOrderBubble({ order, elevated = false, onOpen }) {
  const meta = getCustomerStatusMeta(order);
  const orderNumber = formatOrderNumber(order?.id);

  return (
    <button
      type="button"
      className={`store-order-bubble ${elevated ? 'elevated' : ''}`}
      onClick={onOpen}
    >
      <span className="store-order-bubble-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 7h18" />
          <path d="M7 3v8" />
          <path d="M17 3v8" />
          <rect x="4" y="5" width="16" height="15" rx="3" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      </span>
      <span className="store-order-bubble-copy">
        <strong>Pedido #{orderNumber}</strong>
        <span>{meta.label}</span>
      </span>
    </button>
  );
}

function OrderSuccessSheet({ onClose }) {
  return (
    <div className="store-success-overlay" onClick={onClose}>
      <div className="store-success-card" onClick={(event) => event.stopPropagation()}>
        <div className="store-success-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="#ffffff" strokeWidth="2.8">
            <path d="M5 12l4.2 4.2L19 6.5" />
          </svg>
        </div>
        <h3>Pedido realizado con exito</h3>
        <p>Tu pedido ya entro al sistema. Enseguida te mostramos el estado para que le des seguimiento.</p>
        <button type="button" className="store-button" onClick={onClose}>
          Ver estado del pedido
        </button>
      </div>
    </div>
  );
}

function OrdersSheet({ currentUser, orders, createdOrder, onCancelOrder, onClose }) {
  const [showPreviousOrders, setShowPreviousOrders] = useState(false);
  const listedOrders = Array.isArray(orders) ? orders : [];
  const activeOrder = resolveActiveStoreCustomerOrder(listedOrders, createdOrder);
  const previousOrders = activeOrder
    ? listedOrders.filter((order) => !isSameStoreCustomerOrder(order, activeOrder))
    : listedOrders;

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <StoreBackButton onClick={onClose} />
          <strong>ESTADO DE MI PEDIDO</strong>
        </div>

        <div className="store-orders-hero">
          <div className="store-status-pill">Seguimiento en vivo</div>
          <h2>{currentUser.nombre}</h2>
          <p>
            Aqui veras tu pedido en tres pasos simples: preparacion, camino y entrega.
          </p>
        </div>

        {activeOrder ? (
          <>
            <div className="store-section-label">Pedido actual</div>
            <OrderStatusCard
              order={activeOrder}
              currentUser={currentUser}
              highlight
              onCancelOrder={onCancelOrder}
            />
          </>
        ) : (
          <div className="store-empty" style={{ marginTop: 12 }}>
            Todavia no tienes pedidos en esta cuenta.
          </div>
        )}

        {previousOrders.length > 0 && (
          <>
            <button
              type="button"
              className="store-history-toggle"
              onClick={() => setShowPreviousOrders((value) => !value)}
            >
              {showPreviousOrders ? 'Ocultar pedidos anteriores' : 'Ver pedidos anteriores'}
              <span>{previousOrders.length}</span>
            </button>

            {showPreviousOrders && (
              <div className="store-history-list">
                {previousOrders.map((order) => (
                  <OrderStatusCard
                    key={order.firebaseKey || order.id}
                    order={order}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StoreOrderStatusVisual({ type = 'prep', compact = false }) {
  const commonProps = {
    viewBox: '0 0 96 96',
    fill: 'none',
    'aria-hidden': true,
  };
  const visuals = {
    prep: (
      <svg {...commonProps}>
        <path d="M22 57c0-14 14-25 31-25 12 0 22 5 25 14 4 10-6 22-25 25-18 3-31-2-31-14Z" fill="#fecaca" />
        <path d="M28 57c0-9 11-17 25-17 8 0 15 3 18 8 3 6-4 14-18 16-14 3-25 0-25-7Z" fill="#dc2626" />
        <path d="M39 46c4 8 14 10 24 5" stroke="#fff7ed" strokeWidth="4" strokeLinecap="round" />
        <path d="M33 56c8 5 20 6 31 0" stroke="#991b1b" strokeWidth="4" strokeLinecap="round" opacity=".45" />
        <path d="M29 36c5-7 15-12 27-12" stroke="#fecaca" strokeWidth="6" strokeLinecap="round" opacity=".7" />
      </svg>
    ),
    driver: (
      <svg {...commonProps}>
        <path d="M18 54h38l10-18h11c7 0 12 6 12 13v12H76" fill="#dbeafe" />
        <path d="M18 54h38l10-18h11c7 0 12 6 12 13v12H76M18 54v7h10" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M37 61h24" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" />
        <circle cx="33" cy="64" r="9" fill="#111827" />
        <circle cx="71" cy="64" r="9" fill="#111827" />
        <circle cx="33" cy="64" r="3" fill="#ffffff" />
        <circle cx="71" cy="64" r="3" fill="#ffffff" />
        <path d="M23 43h25" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
        <path d="M12 38h18M8 49h14" stroke="#93c5fd" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
    pickup: (
      <svg {...commonProps}>
        <path d="M26 32h44l-4 42H30z" fill="#dbeafe" />
        <path d="M26 32h44l-4 42H30z" stroke="#1d4ed8" strokeWidth="5" strokeLinejoin="round" />
        <path d="M37 32a11 11 0 0 1 22 0" stroke="#1d4ed8" strokeWidth="5" strokeLinecap="round" />
        <path d="M36 49h24" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
    done: (
      <svg {...commonProps}>
        <circle cx="48" cy="48" r="33" fill="#dcfce7" />
        <path d="m31 49 12 12 24-28" stroke="#16a34a" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24 75h48" stroke="#86efac" strokeWidth="5" strokeLinecap="round" />
      </svg>
    ),
    cancel: (
      <svg {...commonProps}>
        <circle cx="48" cy="48" r="32" fill="#f1f5f9" />
        <path d="m35 35 26 26M61 35 35 61" stroke="#64748b" strokeWidth="8" strokeLinecap="round" />
      </svg>
    ),
  };

  return (
    <span className={`store-status-visual ${compact ? 'compact' : ''}`}>
      {visuals[type] || visuals.prep}
    </span>
  );
}

function OrderStatusCard({ order, currentUser, highlight = false, onCancelOrder }) {
  const meta = getCustomerStatusMetaV2(order);
  const orderNumber = formatOrderNumber(order.id);
  const totalLabel = order?.totalAproximado === false ? 'Total actualizado' : 'Total aproximado';
  const pickupOrder = isPickupOrder(order);
  const riderName = order.repartidor
    ? getShortPersonName(order.repartidor, order.repartidor)
    : pickupOrder
      ? 'No aplica'
      : 'Por asignar';
  const whatsappLink = buildOrderWhatsAppLink(order, currentUser);
  const statusKey = normalizeCustomerOrderStatus(order.estado);
  const canCancelOrder =
    typeof onCancelOrder === 'function' && !['cancelado', 'enviado', 'entregado'].includes(statusKey);

  return (
    <div
      className="store-status-card store-friendly-status"
      style={{
        borderColor: meta.accent,
        background: `linear-gradient(135deg, ${meta.soft} 0%, #ffffff 72%)`,
      }}
    >
      <div className="store-friendly-head">
        <StoreOrderStatusVisual type={meta.visual} />
        <div style={{ flex: 1 }}>
          <div
            className="store-status-pill"
            style={{
              background: highlight ? '#111827' : '#ffffff',
              color: highlight ? '#ffffff' : '#111827',
            }}
          >
            Pedido #{orderNumber}
          </div>
          <h3 style={{ margin: '10px 0 2px', color: '#111827' }}>{meta.label}</h3>
          <div style={{ color: meta.accent, fontSize: 13, fontWeight: 900 }}>
            {order.estado || 'Pendiente'}
          </div>
        </div>
      </div>

      <p className="store-status-message">{meta.message}</p>

      <div className="store-progress" aria-label="Progreso del pedido">
        {getOrderProgressSteps(order).map((step, index) => {
          const isDone = meta.progress >= index + 1;
          return (
            <span
              key={step.key}
              className={`store-progress-step ${isDone ? 'done' : ''}`}
              style={isDone ? { background: meta.accent } : undefined}
            >
              <StoreOrderStatusVisual type={step.icon} compact />
              {step.label}
            </span>
          );
        })}
      </div>

      <div className="store-order-meta">
        <div>
          <span>Ingreso</span>
          <strong>
            {order.fecha || 'Hoy'} {order.timestampIngreso || ''}
          </strong>
        </div>
        <div>
          <span>{totalLabel}</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
        <div>
          <span>{pickupOrder ? 'Modalidad' : 'Entrega'}</span>
          <strong>
            {pickupOrder ? 'Pickup en tienda' : 'Delivery a domicilio'}
            {order.timestampPreparacion ? ` - ${order.timestampPreparacion}` : ''}
          </strong>
        </div>
        <div>
          <span>{pickupOrder ? 'Retiro' : 'Repartidor'}</span>
          <strong>
            {riderName}
            {order.timestampEntregado
              ? ` - ${pickupOrder ? 'Recogido' : 'Entregado'} ${order.timestampEntregado}`
              : order.timestampEnviado
                ? ` - ${order.timestampEnviado}`
                : ''}
          </strong>
        </div>
      </div>

      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="store-status-items">
          <strong className="store-status-items-title">Detalle del pedido</strong>
          {order.items.map((item) => (
            <div key={`${order.firebaseKey || order.id}-${item.codigo || item.nombre}`}>
              <div>
                {formatStoreQuantity(item.cantidad, item.unidad)} {item.unidad} {item.nombre}
                {item.codigo ? ` [${item.codigo}]` : ''}
              </div>
              {item.descripcion && <small>{item.descripcion}</small>}
              {Number(item.subtotal || 0) > 0 && <small>{formatCurrency(item.subtotal)}</small>}
            </div>
          ))}
        </div>
      )}

      {order.rewardRedemption?.rewardName && (
        <div className="store-status-items">
          <strong className="store-status-items-title">Premio Miembro Gold</strong>
          <div>
            <div>{order.rewardRedemption.rewardName}</div>
            <small>
              {Number(order.rewardRedemption.pointsRedeemed || 0)} puntos canjeados
              {order.rewardRedemption.status === 'redeemed'
                ? ' - aplicado'
                : order.rewardRedemption.status === 'refunded'
                  ? ' - puntos devueltos'
                  : ' - pendiente de confirmar'}
            </small>
          </div>
          {(Array.isArray(order.rewardRedemption.items) ? order.rewardRedemption.items : []).map((item) => (
            <div key={`${order.firebaseKey || order.id}-reward-${item.productCode || item.productName}`}>
              <div>
                {Number(item.quantity || 1)} x {item.productName || item.productCode}
              </div>
            </div>
          ))}
        </div>
      )}

      <a className="store-whatsapp-button" href={whatsappLink} target="_blank" rel="noreferrer">
        💬 Escribir a WhatsApp de la tienda
      </a>

      {canCancelOrder && (
        <button
          type="button"
          className="store-cancel-order-button"
          onClick={() => onCancelOrder(order)}
        >
          Anular pedido
        </button>
      )}
    </div>
  );
}
