import { buildStoreKitchenOrderText } from './orders.js';

const DELIVERY_SERVICE_ITEM_CODES = new Set(['00171', '00172', '00247', '00248', '00249']);

export const normalizeStoreItemCode = (item = {}) =>
  String(item?.codigo ?? item?.code ?? '').trim().toUpperCase();

export const getStoreDisplayItems = (pedido = {}) =>
  (Array.isArray(pedido.items) ? pedido.items : []).filter((item) => {
    const sourceType = String(item?.sourceType || '').trim().toLowerCase();
    return !DELIVERY_SERVICE_ITEM_CODES.has(normalizeStoreItemCode(item)) &&
      sourceType !== 'delivery' && sourceType !== 'reward';
  });

export const getStoreProductItems = (pedido = {}) =>
  getStoreDisplayItems(pedido).filter((item) => normalizeStoreItemCode(item));

export const getStoreRewardItems = (pedido = {}) => {
  const redemption = pedido?.rewardRedemption;
  const rewardName = String(redemption?.rewardName || 'Premio Miembro Gold').trim();
  const memberRewardItems = (Array.isArray(redemption?.items) ? redemption.items : [])
    .map((item, index) => ({
      id: String(item?.id || `${item?.productCode || 'premio'}-${index}`).trim(),
      codigo: String(item?.productCode || '').trim(),
      nombre: String(item?.productName || item?.choiceLabel || item?.productCode || 'Producto premio').trim(),
      cantidad: Math.max(1, Number(item?.quantity || 1)),
      unidad: String(item?.productUnit || 'unidad').trim() || 'unidad',
      rewardName,
    }))
    .filter((item) => item.codigo && item.nombre);
  const firstOrderReward = pedido?.firstOrderReward;
  const welcomeRewardItem = firstOrderReward?.sku && firstOrderReward?.itemName
    ? [{
        id: String(firstOrderReward.itemId || firstOrderReward.sku),
        codigo: String(firstOrderReward.sku),
        nombre: String(firstOrderReward.itemName),
        cantidad: 1,
        unidad: 'unidad',
        rewardName: 'Regalia de primera compra',
      }]
    : [];
  const recordedRewards = [...memberRewardItems, ...welcomeRewardItem];
  const recordedCodes = new Set(recordedRewards.map((item) => item.codigo.toUpperCase()));
  const extraRewards = (Array.isArray(pedido.items) ? pedido.items : [])
    .filter((item) => String(item?.sourceType || '').trim().toLowerCase() === 'reward')
    .filter((item) => !recordedCodes.has(normalizeStoreItemCode(item)))
    .map((item, index) => ({
      id: String(item?.id || normalizeStoreItemCode(item) || `reward-${index}`),
      codigo: normalizeStoreItemCode(item),
      nombre: String(item?.nombre || item?.name || 'Regalía').trim(),
      cantidad: Math.max(1, Number(item?.cantidad ?? item?.quantity ?? 1)),
      unidad: String(item?.unidad || item?.unit || 'unidad').trim() || 'unidad',
      rewardName: 'Regalía del pedido',
    }));

  return [...recordedRewards, ...extraRewards];
};

export const getRequestedStoreQuantity = (item = {}) =>
  Number(item?.cantidadSolicitada ?? item?.requestedQuantity ?? item?.cantidad ?? item?.quantity ?? 0);

export const getActualStoreQuantity = (item = {}) =>
  Number(item?.cantidadReal ?? item?.realQuantity ?? item?.cantidad ?? item?.quantity ?? 0);

export const roundStoreQuantity = (value) => Number(Number(value || 0).toFixed(3));
export const formatStoreQuantity = (value) => String(roundStoreQuantity(value));

export const formatStoreQuantityInputValue = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';
  return formatStoreQuantity(numeric);
};

export const parseStoreQuantityInputValue = (value) => {
  const normalized = String(value || '').trim().replace(',', '.');
  return normalized ? Number(normalized) : NaN;
};

export const getStoreQuantityStep = (item = {}) => {
  const explicitStep = Number(item?.quantityStep ?? item?.step ?? 0);
  if (Number.isFinite(explicitStep) && explicitStep > 0) return explicitStep;
  return String(item?.unidad ?? item?.unit ?? '').trim().toLowerCase() === 'unidad' ? 1 : 0.1;
};

const buildCustomerUpdateSignature = (source = {}) =>
  JSON.stringify({
    subtotal: Number(source?.subtotalEstimado ?? source?.subtotal ?? 0).toFixed(2),
    discount: Number(source?.descuentoCupon ?? source?.discount ?? 0).toFixed(2),
    deliveryFee: Number(source?.deliveryFee ?? 0).toFixed(2),
    total: Number(source?.total ?? 0).toFixed(2),
    items: (Array.isArray(source?.items) ? source.items : []).map((item) => ({
      code: String(item?.codigo ?? item?.code ?? item?.nombre ?? '').trim(),
      qty: Number(item?.cantidadReal ?? item?.cantidad ?? item?.quantity ?? 0).toFixed(3),
      price: Number(item?.precioUnitario ?? item?.price ?? 0).toFixed(2),
      subtotal: Number(item?.subtotal ?? 0).toFixed(2),
    })),
  });

export const buildStoreActualQuantitiesPatch = (pedido = {}, productItems = []) => {
  const updatedItems = productItems.map((item) => {
    const actualQuantity = roundStoreQuantity(getActualStoreQuantity(item));
    const requestedQuantity = roundStoreQuantity(getRequestedStoreQuantity(item) || actualQuantity);
    const unitPrice = Number(item?.precioUnitario ?? item?.price ?? 0);
    return {
      ...item,
      sourceType: 'order',
      cantidadSolicitada: requestedQuantity,
      cantidadReal: actualQuantity,
      cantidad: actualQuantity,
      subtotal: Number((actualQuantity * unitPrice).toFixed(2)),
    };
  });

  const subtotal = Number(updatedItems.reduce((sum, item) => sum + Number(item?.subtotal || 0), 0).toFixed(2));
  const discount = Math.max(0, Number(pedido?.descuentoCupon || 0));
  const deliveryFee = Math.max(0, Number(pedido?.deliveryFee || 0));
  const total = Number(Math.max(subtotal - discount + deliveryFee, 0).toFixed(2));
  const nowIso = new Date().toISOString();
  const nextCustomerSignature = buildCustomerUpdateSignature({
    items: updatedItems,
    subtotalEstimado: subtotal,
    descuentoCupon: discount,
    deliveryFee,
    total,
  });
  const currentCustomerSignature = buildCustomerUpdateSignature(pedido);
  const customerVisibleChange = nextCustomerSignature !== currentCustomerSignature;
  const currentCustomerUpdateRevision = String(pedido?.sicarQuote?.customerUpdateRevision || '').trim();
  const customerUpdateRevision = customerVisibleChange ? nowIso : currentCustomerUpdateRevision;

  return {
    items: updatedItems,
    pedido: buildStoreKitchenOrderText(updatedItems, {
      subtotal,
      discount,
      deliveryFee,
      deliveryFeeOriginal: pedido?.deliveryFeeOriginal,
      deliveryFree: pedido?.deliveryFree,
      deliveryDistanceKm: pedido?.deliveryDistanceKm,
      total,
      metodoPago: pedido?.metodoPago,
      totalLabel: 'Total actualizado de pedido',
      subtotalLabel: 'Subtotal actualizado',
      observaciones: pedido?.observaciones,
      rewardRedemption: pedido?.rewardRedemption,
      firstOrderReward: pedido?.firstOrderReward,
    }),
    subtotalEstimado: subtotal,
    total,
    totalAproximado: false,
    totalActualizadoAt: nowIso,
    sicarQuote: {
      ...(pedido?.sicarQuote || {}),
      status: 'pending',
      requestedAt: nowIso,
      requestedBy: 'lista_pedidos',
      lastRequestedByOrdersAt: nowIso,
      customerUpdateRevision,
      customerUpdatePending: customerVisibleChange || Boolean(pedido?.sicarQuote?.customerUpdatePending),
    },
  };
};
