import { equalTo, get, onValue, orderByChild, query, ref, startAt, update } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
  refreshAuthenticatedFirebaseSession,
} from './firebaseScriptAuth.mjs';
import {
  buildStoreRewardRedemptionTextLines,
  normalizeStoreRewardRedemption,
} from '../src/services/storeRewards.js';

const STORE_CHANNEL = 'tienda_virtual';
const MANUAL_CHANNEL = 'manual';
const STORE_ORDERS_PATH = 'orders';
const CLIENTS_PATH = 'clients';
const STORE_USERS_PATH = 'storeUsers';
const QUOTE_QUEUE_PATH = 'sicarQuoteQueue';
const LINKED_QUOTES_PATH = 'sicarLinkedQuotes';
const LINKED_QUOTES_REFRESH_MS = 5000;
const DEFAULT_CLIENT_ID = 1;
const DEFAULT_USER_ID = 1;
const DEFAULT_VENDOR_ID = 7;
const DEFAULT_CURRENCY_ID = 1;
const DEFAULT_CURRENCY_ABBR = 'NIO';
const DEFAULT_CURRENCY_EXCHANGE = 1;
const DEFAULT_ZERO_TAX_IMP_ID = 4;
const STORE_CUSTOMER_COMMENT = 'Cliente tienda virtual';

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundQuantity = (value) => Number(Number(value || 0).toFixed(3));
const roundRate = (value) => Number(Number(value || 0).toFixed(6));
const truncateMoney = (value) => Math.trunc(Number(value || 0) * 100) / 100;
const formatMoney = (value) => roundMoney(value).toFixed(2);
const formatQuantity = (value) => roundQuantity(value).toFixed(3);
const formatRate = (value) => roundRate(value).toFixed(6);
const normalizeText = (value = '') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const normalizeCode = (value = '') => String(value ?? '').trim();
const formatAppOrderCode = (order = {}) => {
  const explicitCode = String(order?.orderNumber || '').trim().toUpperCase();
  if (explicitCode) {
    return explicitCode;
  }

  const branchId = String(order?.storeBranchId || order?.storeBranchCode || 'granada').trim().toLowerCase();
  const branchPrefix = { granada: 'GR', nindiri: 'NI', masaya: 'MY' }[branchId] || branchId.slice(0, 2).toUpperCase() || 'GR';
  return `${branchPrefix}-${String(Number(order?.id || 0)).padStart(3, '0')}`;
};
const normalizeEmail = (value = '') => String(value ?? '').trim().toLowerCase();
const normalizePhone = (value = '') => String(value ?? '').replace(/[^\d+]/g, '').trim();
const isFirebasePermissionDeniedError = (error) =>
  /permission_denied/i.test(String(error?.message || error || '').trim());
const normalizePaymentMethodLabel = (value = '') => {
  const normalized = removeTextAccents(value || '');

  if (normalized.includes('efectivo')) {
    return 'EFECTIVO';
  }

  if (normalized.includes('pos') || normalized.includes('tarjeta')) {
    return 'POS / TARJETA';
  }

  if (normalized.includes('link')) {
    return 'LINK DE PAGO';
  }

  if (normalized.includes('transfer')) {
    return 'TRANSFERENCIA';
  }

  return String(value || '').trim().toUpperCase() || 'METODO DE PAGO';
};
const toComparableValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const formatWeightLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '0';
  }

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1).replace(/\.0$/, '');
};

const normalizeStoreUnitLabel = (value = '') => {
  const unit = String(value || '').trim().toUpperCase();
  if (unit.includes('LB')) {
    return 'lb';
  }
  return 'unidad';
};

const formatStoreQuantityLabel = (quantity, unit) =>
  String(unit || '').trim().toLowerCase() === 'unidad'
    ? String(Number(quantity || 0))
    : formatWeightLabel(quantity);

const normalizeOrderSpecialPromotion = (value = null) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const id = normalizeCode(value.id || '');
  const title = normalizeText(value.title || '');
  const discountPct = roundMoney(value.discountPct || 0);

  if (!id && !title && discountPct <= 0) {
    return null;
  }

  return {
    id,
    title,
    discountPct,
  };
};

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeOrderStatus = (status) => removeTextAccents(status || 'pendiente');

const isFinalStoreStatus = (status) => {
  const normalizedStatus = normalizeOrderStatus(status);
  return (
    normalizedStatus.includes('entregado') ||
    normalizedStatus.includes('cancel') ||
    normalizedStatus.includes('anulad')
  );
};

const formatDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getLinkedQuoteSeedStartDate = (daysBack = 90) => {
  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);
  baseDate.setDate(baseDate.getDate() - Math.max(1, Number(daysBack || 90)));
  return formatDateKey(baseDate);
};

const escapeSqlText = (value, sqlEscape) => `'${sqlEscape(String(value || ''))}'`;

const parseImpIds = (value = '') =>
  String(value || '')
    .split(',')
    .map((entry) => Number(String(entry || '').trim()))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

const normalizeOrderItems = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      code: String(item?.codigo ?? item?.code ?? '').trim(),
      name: String(item?.nombre ?? item?.name ?? '').trim(),
      description: String(item?.descripcion ?? item?.description ?? '').trim(),
      unit: String(item?.unidad ?? item?.unit ?? 'lb').trim() || 'lb',
      quantity: roundQuantity(item?.cantidad ?? item?.quantity ?? 0),
      unitPrice: roundMoney(item?.precioUnitario ?? item?.price ?? 0),
      originalUnitPrice: roundMoney(
        item?.precioUnitarioOriginal ?? item?.originalUnitPrice ?? item?.precioUnitario ?? item?.price ?? 0
      ),
      fixedPrice:
        item?.precioFijo === true ||
        item?.priceLocked === true ||
        Boolean(item?.promocionEspecial?.id || item?.specialPromotion?.id),
      specialPromotion: normalizeOrderSpecialPromotion(
        item?.promocionEspecial ?? item?.specialPromotion ?? null
      ),
      subtotal: roundMoney(item?.subtotal ?? 0),
    }))
    .filter((item) => item.code && item.quantity > 0);

const isQuoteEligibleOrder = (order = {}) => {
  const channel = String(order?.canal || '').trim();
  if (channel === STORE_CHANNEL) {
    return true;
  }

  return channel === MANUAL_CHANNEL && normalizeOrderItems(order?.items).length > 0;
};

const buildCustomerVisibleOrderSignature = (source = {}) =>
  JSON.stringify({
    subtotal: roundMoney(source?.subtotalEstimado ?? source?.subtotal ?? 0).toFixed(2),
    discount: roundMoney(source?.descuentoCupon ?? source?.discount ?? 0).toFixed(2),
    deliveryFee: roundMoney(source?.deliveryFee ?? 0).toFixed(2),
    total: roundMoney(source?.total ?? source?.customerTotal ?? 0).toFixed(2),
    items: (Array.isArray(source?.items) ? source.items : []).map((item) => ({
      code: normalizeCode(item?.codigo ?? item?.code ?? item?.name ?? item?.nombre ?? ''),
      qty: roundQuantity(item?.cantidadReal ?? item?.cantidad ?? item?.quantity ?? 0).toFixed(3),
      price: roundMoney(item?.precioUnitario ?? item?.price ?? 0).toFixed(2),
      subtotal: roundMoney(item?.subtotal ?? item?.total ?? 0).toFixed(2),
    })),
  });

const DELIVERY_SERVICE_CODES_BY_BRACKET = {
  under2km: '00171',
  under35km: '00172',
  under4km: '00247',
  under6km: '00248',
  above6km: '00249',
  above8km: '00249',
};
const DELIVERY_SERVICE_CODES = new Set(
  Object.values(DELIVERY_SERVICE_CODES_BY_BRACKET).map((code) => normalizeCode(code)).filter(Boolean)
);
const isDeliveryServiceCode = (value = '') => DELIVERY_SERVICE_CODES.has(normalizeCode(value));
const getOrderDeliveryOriginalFee = (order = {}) =>
  roundMoney(order?.deliveryFeeOriginal ?? order?.deliveryFee ?? 0);
const hasFreeDeliveryApplied = (order = {}) =>
  Boolean(order?.deliveryFree) && getOrderDeliveryOriginalFee(order) > 0;

const resolveDeliveryServiceBracketKey = (order = {}) => {
  const explicitKey = String(order?.deliveryFeeBracket || '').trim();
  if (explicitKey && DELIVERY_SERVICE_CODES_BY_BRACKET[explicitKey]) {
    return explicitKey;
  }

  const distanceKm = Number(order?.deliveryDistanceKm || 0);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return '';
  }

  if (distanceKm <= 1.85) return 'under2km';
  if (distanceKm <= 3.1) return 'under35km';
  if (distanceKm <= 3.9) return 'under4km';
  if (distanceKm <= 5.5) return 'under6km';
  if (distanceKm <= 8) return 'above6km';
  return 'above8km';
};

const buildDeliveryServiceOrderItem = (order = {}) => {
  const deliveryFee = getOrderDeliveryOriginalFee(order);
  if (deliveryFee <= 0) {
    return null;
  }

  const bracketKey = resolveDeliveryServiceBracketKey(order);
  const code = DELIVERY_SERVICE_CODES_BY_BRACKET[bracketKey] || '';
  if (!code) {
    throw new Error('No se pudo determinar el SKU de servicio a domicilio para este pedido.');
  }

  return {
    code,
    name: 'SERVICIO A DOMICILIO',
    description: 'Servicio a domicilio',
    unit: 'unidad',
    quantity: 1,
    unitPrice: deliveryFee,
    subtotal: deliveryFee,
    isDelivery: true,
    isComplimentary: hasFreeDeliveryApplied(order),
    deliveryFeeBracket: bracketKey,
  };
};

const normalizeRewardOrderItems = (rewardRedemption = {}) => {
  const normalizedRewardRedemption = normalizeStoreRewardRedemption(rewardRedemption);
  if (!normalizedRewardRedemption) {
    return [];
  }

  return (Array.isArray(normalizedRewardRedemption.items) ? normalizedRewardRedemption.items : [])
    .map((item) => ({
      code: String(item?.productCode || '').trim(),
      name: String(item?.productName || item?.choiceLabel || '').trim(),
      description: '',
      unit: 'unidad',
      quantity: roundQuantity(item?.quantity || 0),
      unitPrice: 0,
      subtotal: 0,
      rewardId: String(normalizedRewardRedemption.rewardId || '').trim(),
      rewardName: String(normalizedRewardRedemption.rewardName || '').trim(),
      isReward: true,
    }))
    .filter((item) => item.code && item.quantity > 0);
};

const calculateOrderCouponDiscount = (order = {}, baseTotal = 0) => {
  const safeBaseTotal = roundMoney(baseTotal);
  if (safeBaseTotal <= 0) {
    return 0;
  }

  const coupon = order?.cupon || {};
  const couponType = String(coupon?.type || '').trim().toLowerCase();
  const couponValue = roundMoney(coupon?.value || 0);
  const explicitDiscount = roundMoney(order?.descuentoCupon || 0);

  if (couponType === 'percent') {
    const percent = Math.min(Math.max(Number(couponValue || 0), 0), 100);
    return roundMoney((safeBaseTotal * percent) / 100);
  }

  if (explicitDiscount > 0) {
    return roundMoney(Math.min(explicitDiscount, safeBaseTotal));
  }

  if (couponType === 'amount' && couponValue > 0) {
    return roundMoney(Math.min(couponValue, safeBaseTotal));
  }

  return 0;
};

const deriveQuotedProductSubtotal = (quote = {}, order = {}) => {
  const explicitProductSubtotal = roundMoney(quote?.productSubtotal || 0);
  if (explicitProductSubtotal > 0) {
    return explicitProductSubtotal;
  }

  return roundMoney(
    Math.max(
      roundMoney(quote?.sicarTotal ?? quote?.total ?? 0) - roundMoney(order?.deliveryFee || 0),
      0
    )
  );
};

const buildOrderText = (items = [], notes = '', summary = {}) => {
  const normalizedItems = normalizeOrderItems(items);
  const subtotal = roundMoney(
    summary.subtotal ?? normalizedItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0)
  );
  const total = roundMoney(summary.total ?? subtotal);
  const discount = roundMoney(summary.discount || 0);
  const totalLabel = String(summary.totalLabel || 'Total aproximado de pedido').trim();
  const subtotalLabel = String(summary.subtotalLabel || 'Subtotal estimado').trim();
  const deliveryFee = roundMoney(summary.deliveryFee || 0);
  const deliveryFree = hasFreeDeliveryApplied(summary);
  const deliveryDistanceKm = Number(summary.deliveryDistanceKm || 0);
  const paymentMethodLabel = normalizePaymentMethodLabel(summary.paymentMethod || summary.metodoPago);
  const lines = [];
  const rewardLines = buildStoreRewardRedemptionTextLines(summary.rewardRedemption);
  const cleanNotes = normalizeText(notes || summary.notes || '');

  if (discount > 0) {
    lines.push(`ALERTA APLICA CUPON C$${formatMoney(discount)}`);
    lines.push('');
  }

  lines.push(
    ...normalizedItems.map(
      (item) => `- ${formatStoreQuantityLabel(item.quantity, item.unit)} ${item.unit} ${item.name}`.trim()
    )
  );

  if (rewardLines.length > 0) {
    lines.push('');
    lines.push(...rewardLines);
  }

  if (subtotal > 0) {
    lines.push('');
    lines.push(`${subtotalLabel}: C$${formatMoney(subtotal)}`);
    if (deliveryFree) {
      lines.push('Servicio a domicilio: DELIVERY GRATIS');
    } else if (deliveryFee > 0) {
      const deliveryLabel =
        deliveryDistanceKm > 0
          ? `Servicio a domicilio (${formatWeightLabel(deliveryDistanceKm)} km)`
          : 'Servicio a domicilio';
      lines.push(`${deliveryLabel}: C$${formatMoney(deliveryFee)}`);
    }
    if (discount > 0) {
      lines.push(`Cupon aplicado: -C$${formatMoney(discount)}`);
      lines.push(`Metodo de pago: ${paymentMethodLabel}`);
    }
    lines.push(`${totalLabel}: C$${formatMoney(total)}`);
  }

  if (cleanNotes) {
    lines.push('');
    lines.push('Notas del cliente:');
    lines.push(cleanNotes);
  }

  return lines.join('\n').trim();
};

const buildCustomerQuoteMessage = (order = {}, quote = {}) => {
  const orderNumber = formatAppOrderCode(order);
  const customerDiscount = roundMoney(
    quote?.customerDiscount ?? quote?.discount ?? order?.descuentoCupon ?? 0
  );
  const customerTotal = roundMoney(
    quote?.customerTotal ?? Math.max(roundMoney(quote?.total || 0) - customerDiscount, 0)
  );
  const storeName = normalizeText(order?.storeBranchName || 'Carnes San Martin Granada');
  const lines = [
    `Hola ${String(order?.cliente || 'cliente').trim()}.`,
    `Tu pedido #${orderNumber} en ${storeName} fue actualizado.`,
    '',
    'Detalle actualizado:',
  ];

  (Array.isArray(quote.items) ? quote.items : [])
    .filter((item) => !isDeliveryServiceCode(item?.code || ''))
    .forEach((item) => {
    lines×½4öÚ$z{-®éÜj×—FV×2ÀÐ¢VF–Fó¢'V–ÆD÷&FW%FW‡B†—FV×2Â÷&FW"æö'6W'f6–öæW2Â°Ð¢7V'F÷FÃ¢&öGV7E7V'F÷FÂÀÐ¢F÷FÃ¢7W7FöÖW%F÷FÂÀÐ¢F—66÷VçC¢7W7FöÖW$F—66÷VçBÀÐ¢FVÆ—fW'”fVS¢÷&FW"æFVÆ—fW'”fVRÀÐ¢FVÆ—fW'”fVT÷&–v–æÃ¢÷&FW"æFVÆ—fW'”fVT÷&–v–æÂÀÐ¢FVÆ—fW'”g&VS¢÷&FW"æFVÆ—fW'”g&VRÀÐ¢FVÆ—fW'”F—7Fæ6T¶Ó¢÷&FW"æFVÆ—fW'”F—7Fæ6T¶ÒÀÐ¢ÖWFöFõvó¢÷&FW"æÖWFöFõvòÀÐ¢F÷FÄÆ&VÃ¢uF÷FÂ7GVÆ—¦FòFRVF–FòrÀÐ¢7V'F÷FÄÆ&VÃ¢u7V'F÷FÂ7GVÆ—¦FòrÀÐ¢&Wv&E&VFV×F–öã¢÷&FW"ç&Wv&E&VFV×F–öâÀÐ¢Ò’ÀÐ¢7V'F÷FÄW7F–ÖFó¢&öGV7E7V'F÷FÂÀÐ¢FW67VVçFô7Wöã¢7W7FöÖW$F—66÷VçBÀÐ¢F÷FÃ¢7W7FöÖW%F÷FÂÀÐ¢F÷FÄ&÷†–ÖFó¢fÇ6RÀÐ¢F÷FÄ7GVÆ—¦Fõ÷%6–6#¢G'VRÀÐ¢F÷FÄ7GVÆ—¦FôC¢æ÷t—6òÀÐ¢6–6%V÷FS¢°Ð¢7FGW3¢Ö—76–æt6öFW2æÆVæwF‚âòw'F–Âr¢vÆ–æ¶VBrÀÐ¢6÷D–C¢V÷FRæ6÷D–BÀÐ¢÷&FW$çVÖ&W#¢çVÖ&W"†÷&FW"æ–BÇÂ’ÀÐ¢÷&FW$6öFS¢f÷&ÖD÷&FW$6öFR†÷&FW"’ÀÐ¢÷&FW$FFS¢V÷FRæ÷&FW$FFRÀÐ¢6Æ”–C¢çVÖ&W"‡6–6$7W7FöÖW#òæ6Æ”–BÇÂ÷&FW#òç6–6%V÷FSòæ6Æ”–BÇÂ’ÀÐ¢6Æ–VçD6öFS¢æ÷&ÖÆ—¦T6öFR‡6–6$7W7FöÖW#òæ6ÆfRÇÂ÷&FW#òç6–6%V÷FSòæ6Æ–VçD6öFRÇÂrr’ÀÐ¢6Æ–VçDæÖS¢æ÷&ÖÆ—¦UFW‡B‡6–6$7W7FöÖW#òææÖRÇÂ÷&FW#òæ6Æ–VçFRÇÂrr’ÀÐ¢7V'F÷FÃ¢&öGV7E7V'F÷FÂÀÐ¢F—66÷VçC¢7W7FöÖW$F—66÷VçBÀÐ¢F÷FÃ¢w&÷75F÷FÂÀÐ¢w&÷75F÷FÂÀÐ¢7W7FöÖW%F÷FÂÀÐ¢Ö—76–æt6öFW2ÀÐ¢Æ7E7–æ6VDC¢æ÷t—6òÀÐ¢Æ7DÆ–VDC¢æ÷t—6òÀÐ¢7W7FöÖW%WFFU&Wf—6–öâÀÐ¢7W7FöÖW%WFFUVæF–æs Ð¢7W7FöÖW%f—6–&ÆT6†ævRÇÂ&ööÆVâ†÷&FW#òç6–6%V÷FSòæ7W7FöÖW%WFFUVæF–ær’ÀÐ¢ÒÀÐ¢Ó°Ð¢Ó°Ð Ð¢6öç7B7–æ4÷&FW%V÷FT–çFW&æÂÒ7–æ2†÷&FW$¶W’Â÷F–öç2Ò·Ò’Óâ°Ð¢v—BVç7W&TWF†VçF–6FVDf—&V&6U6W76–öâ‚“°Ð Ð¢6öç7BÇ•Fôf—&V&6RÒ÷F–öç2æÇ•Fôf—&V&6RÓÓÒG'VS°Ð¢6öç7B÷&FW"Òv—BvWD÷&FW$'”¶W’†÷&FW$¶W’“°Ð Ð¢–b‚÷&FW"’°Ð¢F‡&÷ræWrW'&÷"‚tæò6RVæ6öçG&òVÂVF–FòVâf—&V&6Râr“°Ð¢ÐÐ Ð¢–b‚—476–væVD'&æ6‚†÷&FW"’’°Ð¢F‡&÷ræWrW'&÷"†VÂVF–FòW'FVæV6RG¶vWD÷&FW$'&æ6„–B†÷&FW"—Ò’W7FR–çFVw&F÷"&ö6W6G¶76–væVD'&æ6„–GÒæ“°Ð¢ÐÐ Ð¢–b‚—5V÷FTVÆ–v–&ÆT÷&FW"†÷&FW"’’°Ð¢F‡&÷ræWrW'&÷"‚tVÂVF–FòæV6W6—FÂÖVæ÷2Vâ'F–7VÆò6öâ6öF–vò4”4"&7&V"Æ6÷F—¦6–öââr“°Ð¢ÐÐ Ð¢6öç7B6–6$7W7FöÖW"Òv—BVç7W&U6–6$7W7FöÖW$f÷$÷&FW"†÷&FW$¶W’Â÷&FW"“°Ð¢ÆWBV÷FU&VfW&Væ6RÒv—BvWEV÷FT'”÷&FW%&VfW&Væ6R†÷&FW"“°Ð¢ÆWBÖ—76–æt6öFW2ÒµÓ°Ð¢ÆWB7&VFVEV÷FRÒfÇ6S°Ð¢6öç7BG&gBÒv—B'V–ÆEV÷FTG&gB†÷&FW"“°Ð Ð¢–b‚V÷FU&VfW&Væ6R’°Ð¢6öç7B7&VFVBÒv—B–ç6W'EV÷FTG&gB†÷&FW"ÂG&gBÂ6–6$7W7FöÖW"“°Ð¢7&VFVEV÷FRÒG'VS°Ð¢Ö—76–æt6öFW2Ò'&’æ—4'&’†7&VFVBæÖ—76–æt6öFW2’ò7&VFVBæÖ—76–æt6öFW2¢µÓ°Ð¢V÷FU&VfW&Væ6RÒ²6÷D–C¢7&VFVBæ6÷D–BÓ°Ð¢ÒVÇ6R°Ð¢6öç7B&WÆ6VBÒv—B&WÆ6UV÷FTG&gB‡V÷FU&VfW&Væ6Ræ6÷D–BÂG&gBÂ6–6$7W7FöÖW"“°Ð¢Ö—76–æt6öFW2Ò'&’æ—4'&’‡&WÆ6VBæÖ—76–æt6öFW2’ò&WÆ6VBæÖ—76–æt6öFW2¢µÓ°Ð¢ÐÐ Ð¢–b‚V÷FU&VfW&Væ6Sòæ6÷D–B’°Ð¢F‡&÷ræWrW'&÷"‚tæò6RVFòÆö6Æ—¦"Æ6÷F—¦6–öâ4”4"&W7FRVF–Fòâr“°Ð¢ÐÐ Ð¢6öç7BV÷FRÒv—BvWEV÷FU6æ6†÷B‡V÷FU&VfW&Væ6R“°Ð¢6öç7B7W7FöÖW$F—66÷VçBÒ6Æ7VÆFT÷&FW$6÷WöäF—66÷VçB†÷&FW"Â&÷VæDÖöæW’‡V÷FRçF÷FÂÇÂ’“°Ð¢6öç7B7W7FöÖW%V÷FRÒ°Ð¢ââçV÷FRÀÐ¢F—66÷VçC¢7W7FöÖW$F—66÷VçBÀÐ¢7W7FöÖW$F—66÷VçBÀÐ¢7W7FöÖW%F÷FÃ¢&÷VæDÖöæW’„ÖF‚æÖ‚‡&÷VæDÖöæW’‡V÷FRçF÷FÂÇÂ’Ò7W7FöÖW$F—66÷VçBÂ’’ÀÐ¢6–6%F÷FÃ¢&÷VæDÖöæW’‡V÷FRçF÷FÂÇÂ’ÀÐ¢&öGV7E7V'F÷FÃ¢FW&—fUV÷FVE&öGV7E7V'F÷FÂ‡²ââçV÷FRÂ6–6%F÷FÃ¢&÷VæDÖöæW’‡V÷FRçF÷FÂÇÂ’ÒÂ÷&FW"’ÀÐ¢Ó°Ð¢6öç7BV÷FU7FGW2ÒÖ—76–æt6öFW2æÆVæwF‚âòw'F–Âr¢w7–æ6VBs°Ð¢6öç7BV÷FTÖWFF6‚Ò°Ð¢7FGW3¢V÷FU7FGW2ÀÐ¢6÷D–C¢7W7FöÖW%V÷FRæ6÷D–BÀÐ¢÷&FW$çVÖ&W#¢çVÖ&W"†÷&FW"æ–BÇÂ’ÀÐ¢÷&FW$6öFS¢f÷&ÖD÷&FW$6öFR†÷&FW"’ÀÐ¢÷&FW$FFS¢7W7FöÖW%V÷FRæ÷&FW$FFRÀÐ¢6Æ”–C¢çVÖ&W"‡6–6$7W7FöÖW#òæ6Æ”–BÇÂ’ÀÐ¢6Æ–VçD6öFS¢æ÷&ÖÆ—¦T6öFR‡6–6$7W7FöÖW#òæ6ÆfR’ÀÐ¢6Æ–VçDæÖS¢æ÷&ÖÆ—¦UFW‡B‡6–6$7W7FöÖW#òææÖRÇÂ÷&FW#òæ6Æ–VçFR’ÀÐ¢7V'F÷FÃ¢&÷VæDÖöæW’†7W7FöÖW%V÷FRç&öGV7E7V'F÷FÂÇÂ’ÀÐ¢F—66÷VçC¢&÷VæDÖöæW’†7W7FöÖW%V÷FRæF—66÷VçBÇÂ’ÀÐ¢F÷FÃ¢&÷VæDÖöæW’†7W7FöÖW%V÷FRçF÷FÂÇÂ’ÀÐ¢w&÷75F÷FÃ¢&÷VæDÖöæW’†7W7FöÖW%V÷FRç6–6%F÷FÂÇÂ7W7FöÖW%V÷FRçF÷FÂÇÂ’ÀÐ¢7W7FöÖW%F÷FÃ¢&÷VæDÖöæW’†7W7FöÖW%V÷FRæ7W7FöÖW%F÷FÂÇÂ’ÀÐ¢Ö—76–æt6öFW2ÀÐ¢7–æ6VDC¢æWrFFR‚’çFô•4õ7G&–ær‚’ÀÐ¢Æ7E7–æ6VDC¢æWrFFR‚’çFô•4õ7G&–ær‚’ÀÐ¢Ó°Ð Ð¢–b†Ç•Fôf—&V&6R’°Ð¢6öç7B÷&FW%F6‚Ò'V–ÆDf—&V&6T÷&FW%F6„g&öÕV÷FR†÷&FW"Â7W7FöÖW%V÷FRÂÖ—76–æt6öFW2Â6–6$7W7FöÖW"“°Ð¢v—BWFFTFF&6U&Vb‡&Vb†FF&6RÂGµ5Dõ$Uôõ$DU%5õD‡ÒòG¶÷&FW$¶W—Ö’Â÷&FW%F6‚“°Ð¢v—B7–æ4Æ–æ¶VEV÷FUvF6‚†÷&FW$¶W’Â÷&FW"Â7W7FöÖW%V÷FRÂ²Ç•Fôf—&V&6S¢G'VRÒ“°Ð¢ÒVÇ6R°Ð¢v—BWFFT÷&FW%V÷FU7FGW2†÷&FW$¶W’ÂV÷FTÖWFF6‚“°Ð¢v—B7–æ4Æ–æ¶VEV÷FUvF6‚†÷&FW$¶W’Â÷&FW"Â7W7FöÖW%V÷FRÂ²Ç•Fôf—&V&6S¢fÇ6RÒ“°Ð¢ÐÐ Ð¢v—B6ÆV%VWVTVçG'’†÷&FW$¶W’“°Ð Ð¢&WGW&â°Ð¢÷&FW$¶W’ÀÐ¢÷&FW$çVÖ&W#¢çVÖ&W"†÷&FW"æ–BÇÂ’ÀÐ¢÷&FW$6öFS¢7G&–ær†÷&FW#òæ÷&FW$çVÖ&W"ÇÂrr’çG&–Ò‚’ÀÐ¢7&VFVEV÷FRÀÐ¢V÷FS¢7W7FöÖW%V÷FRÀÐ¢Ö—76–æt6öFW2ÀÐ¢6–6$7W7FöÖW"ÀÐ¢v†G6ÖW76vS¢'V–ÆD7W7FöÖW%V÷FTÖW76vR†÷&FW"Â7W7FöÖW%V÷FR’ÀÐ¢7W7FöÖW%†öæS¢7G&–ær†÷&FW"çFVÆVföæòÇÂrr’çG&–Ò‚’ÀÐ¢7W7FöÖW$æÖS¢7G&–ær†÷&FW"æ6Æ–VçFRÇÂrr’çG&–Ò‚’ÀÐ¢Ó°Ð¢Ó°Ð Ð¢6öç7B&Vg&W6„Æ–æ¶VEV÷FW2Ò7–æ2‚’Óâ°Ð¢v—BVç7W&TWF†VçF–6FVDf—&V&6U6W76–öâ‚“°Ð Ð¢–b†Æ–æ¶VEV÷FW5&Vg&W6†–ær’°Ð¢&WGW&ã°Ð¢ÐÐ Ð¢Æ–æ¶VEV÷FW5&Vg&W6†–ærÒG'VS°Ð¢7FFRç&Vg&W6†–ætÆ–æ¶VEV÷FW2ÒG'VS°Ð¢7FFRæÆ7DÆ–æ¶VE&Vg&W6„BÒæWrFFR‚’çFô•4õ7G&–ær‚“°Ð Ð¢G'’°Ð¢6öç7B6æ6†÷BÒv—BvWB†vWD'&æ6…66÷VEVW'’„Ä”ä´TEõTõDU5õD‚’“°Ð¢6öç7BÆ–æ¶VEV÷FW2Ò6æ6†÷BçfÂ‚’ÇÂ·Ó°Ð¢6öç7BVçG&–W2Òö&¦V7BæVçG&–W2†Æ–æ¶VEV÷FW2’ç6÷'B€Ð¢†ÆVgBÂ&–v‡B’ÓâçVÖ&W"†ÆVgE³Óòæ÷&FW$çVÖ&W"ÇÂ’ÒçVÖ&W"‡&–v‡E³Óòæ÷&FW$çVÖ&W"ÇÂÐ¢“°Ð Ð¢7FFRçvF6†VEV÷FW46÷VçBÒVçG&–W2æÆVæwFƒ°Ð Ð¢f÷"†6öç7B¶÷&FW$¶W’ÂvF6„VçG'•ÒöbVçG&–W2’°Ð¢G'’°Ð¢6öç7B÷&FW"Òv—BvWD÷&FW$'”¶W’†÷&FW$¶W’“°Ð Ð¢–b†÷&FW"bb—476–væVD'&æ6‚†÷&FW"’’°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢–b‚÷&FW"ÇÂ—5V÷FTVÆ–v–&ÆT÷&FW"†÷&FW"’ÇÂ—4f–æÅ7F÷&U7FGW2†÷&FW"æW7FFò’’°Ð¢v—BWFFTFF&6U&Vb‡&Vb†FF&6R’Â°Ð¢¶G´Ä”ä´TEõTõDU5õD‡ÒòG¶÷&FW$¶W—ÖÓ¢çVÆÂÀÐ¢Ò“°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢6öç7B6÷D–BÒçVÖ&W"‡vF6„VçG'“òæ6÷D–BÇÂ÷&FW#òç6–6%V÷FSòæ6÷D–BÇÂ“°Ð¢–b†6÷D–BÃÒ’°Ð¢v—BWFFTFF&6U&Vb‡&Vb†FF&6R’Â°Ð¢¶G´Ä”ä´TEõTõDU5õD‡ÒòG¶÷&FW$¶W—ÖÓ¢çVÆÂÀÐ¢Ò“°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢6öç7BV÷FU6æ6†÷BÒv—BvWEV÷FU6æ6†÷B‡²6÷D–BÒ“°Ð¢6öç7B7W7FöÖW$F—66÷VçBÒ6Æ7VÆFT÷&FW$6÷WöäF—66÷VçB†÷&FW"Â&÷VæDÖöæW’‡V÷FU6æ6†÷BçF÷FÂÇÂ’“°Ð¢6öç7BV÷FRÒ°Ð¢ââçV÷FU6æ6†÷BÀÐ¢F—66÷VçC¢7W7FöÖW$F—66÷VçBÀÐ¢7W7FöÖW$F—66÷VçBÀÐ¢7W7FöÖW%F÷FÃ¢&÷VæDÖöæW’€Ð¢ÖF‚æÖ‚‡&÷VæDÖöæW’‡V÷FU6æ6†÷BçF÷FÂÇÂ’Ò7W7FöÖW$F—66÷VçBÂÐ¢’ÀÐ¢6–6%F÷FÃ¢&÷VæDÖöæW’‡V÷FU6æ6†÷BçF÷FÂÇÂ’ÀÐ¢&öGV7E7V'F÷FÃ¢FW&—fUV÷FVE&öGV7E7V'F÷FÂ€Ð¢²ââçV÷FU6æ6†÷BÂ6–6%F÷FÃ¢&÷VæDÖöæW’‡V÷FU6æ6†÷BçF÷FÂÇÂ’ÒÀÐ¢÷&FW Ð¢’ÀÐ¢Ó°Ð¢6öç7Bf–ævW'&–çBÒ'V–ÆEV÷FTf–ævW'&–çB‡V÷FR“°Ð¢6öç7B¶æ÷väf–ævW'&–çBÒ7G&–ær‡vF6„VçG'“òæÆ7Dö'6W'fVDf–ævW'&–çBÇÂrr’çG&–Ò‚“°Ð Ð¢–b‚¶æ÷väf–ævW'&–çB’°Ð¢v—B7–æ4Æ–æ¶VEV÷FUvF6‚†÷&FW$¶W’Â÷&FW"ÂV÷FRÂ°Ð¢Ç•Fôf—&V&6S¢÷&FW#òçF÷FÄ&÷†–ÖFòÓÓÒfÇ6RÀÐ¢Ò“°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢–b†¶æ÷väf–ævW'&–çBÓÓÒf–ævW'&–çB’°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢6öç7BÖ—76–æt6öFW2Ò'&’æ—4'&’†÷&FW#òç6–6%V÷FSòæÖ—76–æt6öFW2Ð¢ò÷&FW"ç6–6%V÷FRæÖ—76–æt6öFW0Ð¢¢µÓ°Ð¢6öç7B÷&FW%F6‚Ò'V–ÆDf—&V&6T÷&FW%F6„g&öÕV÷FR†÷&FW"ÂV÷FRÂÖ—76–æt6öFW2“°Ð¢v—BWFFTFF&6U&Vb‡&Vb†FF&6RÂGµ5Dõ$Uôõ$DU%5õD‡ÒòG¶÷&FW$¶W—Ö’Â÷&FW%F6‚“°Ð¢v—B7–æ4Æ–æ¶VEV÷FUvF6‚†÷&FW$¶W’Â÷&FW"ÂV÷FRÂ²Ç•Fôf—&V&6S¢G'VRÒ“°Ð Ð¢6öç7Bæ÷t—6òÒæWrFFR‚’çFô•4õ7G&–ær‚“°Ð¢7FFRæÆ7DWFôÇ”BÒæ÷t—6ó°Ð¢7FFRæÆ7E7V66W74BÒæ÷t—6ó°Ð¢7FFRæÆ7E&ö6W76VD÷&FW$¶W’Ò÷&FW$¶W“°Ð¢7FFRæÆ7EV÷FT–BÒçVÖ&W"‡V÷FRæ6÷D–BÇÂ“°Ð¢Ò6F6‚†W'&÷"’°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær€Ð¢W'&÷#òæÖW76vRÇÂW'&÷"ÇÂæò6RVFò&Vg&W66"Æ6÷F—¦6–öâ4”4"FVÂVF–FòG¶÷&FW$¶W—Òæ Ð¢“°Ð¢ÐÐ¢ÐÐ¢Ò6F6‚†W'&÷"’°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær†W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtæò6RVF–W&öâ&Vg&W66"Æ26÷F—¦6–öæW2VæÆ¦F2âr“°Ð¢Òf–æÆÇ’°Ð¢Æ–æ¶VEV÷FW5&Vg&W6†–ærÒfÇ6S°Ð¢7FFRç&Vg&W6†–ætÆ–æ¶VEV÷FW2ÒfÇ6S°Ð¢ÐÐ¢Ó°Ð Ð¢6öç7B66†VGVÆTÆ–æ¶VEV÷FW5&Vg&W6‚Ò†FVÆ”×2ÒÄ”ä´TEõTõDU5õ$Te$U4…ôÕ2’Óâ°Ð¢–b†Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"’°Ð¢6ÆV%F–ÖV÷WB†Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"“°Ð¢ÐÐ Ð¢Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"Ò6WEF–ÖV÷WB‚‚’Óâ°Ð¢&Vg&W6„Æ–æ¶VEV÷FW2‚Ð¢æ6F6‚‚‚’Óâ·ÒÐ¢æf–æÆÇ’‚‚’Óâ°Ð¢66†VGVÆTÆ–æ¶VEV÷FW5&Vg&W6‚„Ä”ä´TEõTõDU5õ$Te$U4…ôÕ2“°Ð¢Ò“°Ð¢ÒÂÖF‚æÖ‚ƒÂçVÖ&W"†FVÆ”×2ÇÂÄ”ä´TEõTõDU5õ$Te$U4…ôÕ2’’“°Ð¢Ó°Ð Ð¢6öç7B7–æ4÷&FW%V÷FRÒ7–æ2†÷&FW$¶W’Â÷F–öç2Ò·Ò’Óâ°Ð¢6öç7B6ÆVä÷&FW$¶W’Ò7G&–ær†÷&FW$¶W’ÇÂrr’çG&–Ò‚“°Ð¢–b‚6ÆVä÷&FW$¶W’’°Ð¢F‡&÷ræWrW'&÷"‚tfÇFVÂ–FVçF–f–6F÷"FVÂVF–Fòâr“°Ð¢ÐÐ Ð¢–b‡'Vææ–æt÷&FW%&öÖ—6W2æ†2†6ÆVä÷&FW$¶W’’’°Ð¢&WGW&â'Vææ–æt÷&FW%&öÖ—6W2ævWB†6ÆVä÷&FW$¶W’“°Ð¢ÐÐ Ð¢6öç7B&öÖ—6RÒ&öÖ—6Rç&W6öÇfR‚Ð¢çF†Vâ‚‚’Óâ7–æ4÷&FW%V÷FT–çFW&æÂ†6ÆVä÷&FW$¶W’Â÷F–öç2’Ð¢æf–æÆÇ’‚‚’Óâ°Ð¢'Vææ–æt÷&FW%&öÖ—6W2æFVÆWFR†6ÆVä÷&FW$¶W’“°Ð¢Ò“°Ð Ð¢'Vææ–æt÷&FW%&öÖ—6W2ç6WB†6ÆVä÷&FW$¶W’Â&öÖ—6R“°Ð¢&WGW&â&öÖ—6S°Ð¢Ó°Ð Ð¢6öç7B&ö6W75VWVRÒ7–æ2‚’Óâ°Ð¢–b‡7FFRç&ö6W76–ær’°Ð¢&ö6W75&WVW7FVBÒG'VS°Ð¢&WGW&ã°Ð¢ÐÐ Ð¢7FFRç&ö6W76–ærÒG'VS°Ð¢7FFRæÆ7E'VäBÒæWrFFR‚’çFô•4õ7G&–ær‚“°Ð¢7FFRæÆ7DW'&÷"Òrs°Ð Ð¢G'’°Ð¢6öç7B6æ6†÷BÒv—BvWB†vWD'&æ6…66÷VEVW'’…TõDUõTUTUõD‚’“°Ð¢6öç7BVWVTFFÒ6æ6†÷BçfÂ‚’ÇÂ·Ó°Ð¢6öç7BVWVTVçG&–W2Òö&¦V7BæVçG&–W2‡VWVTFFÐ¢æf–ÇFW"‚…²ÂfÇVUÒ’ÓàÐ¢7G&–ær‡fÇVSòç7FGW2ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚’ÓÓÒwVæF–ærrbb—476–væVD'&æ6‚‡fÇVRÐ¢Ð¢ç6÷'B‚†ÆVgBÂ&–v‡B’ÓâçVÖ&W"†ÆVgE³Óòç&WVW7FVDBÇÂ’ÒçVÖ&W"‡&–v‡E³Óòç&WVW7FVDBÇÂ’“°Ð Ð¢7FFRçVæF–æt6÷VçBÒVWVTVçG&–W2æÆVæwFƒ°Ð Ð¢f÷"†6öç7B¶÷&FW$¶W’ÂVçG'•ÒöbVWVTVçG&–W2’°Ð¢G'’°Ð¢6öç7BVWVVD÷&FW"Òv—BvWD÷&FW$'”¶W’†÷&FW$¶W’“°Ð¢–b‚VWVVD÷&FW"ÇÂ—476–væVD'&æ6‚‡VWVVD÷&FW"’’°Ð¢6öçF–çVS°Ð¢ÐÐ Ð¢6öç7B&W7VÇBÒv—B7–æ4÷&FW%V÷FR†÷&FW$¶W’Â²Ç•Fôf—&V&6S¢G'VRÒ“°Ð¢v—BWFFTFF&6U&Vb‡&Vb†FF&6RÂGµ5Dõ$Uôõ$DU%5õD‡ÒòG¶÷&FW$¶W—Ò÷6–6%V÷FV’Â°Ð¢7FGW3¢&W7VÇBæÖ—76–æt6öFW2æÆVæwF‚âòw'F–Âr¢w7–æ6VBrÀÐ¢6÷D–C¢&W7VÇBçV÷FRæ6÷D–BÀÐ¢÷&FW$çVÖ&W#¢çVÖ&W"‡&W7VÇBæ÷&FW$çVÖ&W"ÇÂ’ÀÐ¢÷&FW$6öFS¢7G&–ær‡&W7VÇBæ÷&FW$6öFRÇÂrr’çG&–Ò‚’ÀÐ¢÷&FW$FFS¢&W7VÇBçV÷FRæ÷&FW$FFRÀÐ¢7V'F÷FÃ¢&W7VÇBçV÷FRç&öGV7E7V'F÷FÂÇÂ&W7VÇBçV÷FRç7V'F÷FÂÀÐ¢F—66÷VçC¢&W7VÇBçV÷FRæF—66÷VçBÀÐ¢F÷FÃ¢&W7VÇBçV÷FRçF÷FÂÀÐ¢w&÷75F÷FÃ¢&W7VÇBçV÷FRç6–6%F÷FÂÇÂ&W7VÇBçV÷FRçF÷FÂÀÐ¢7W7FöÖW%F÷FÃ¢&W7VÇBçV÷FRæ7W7FöÖW%F÷FÂÇÂÀÐ¢Ö—76–æt6öFW3¢&W7VÇBæÖ—76–æt6öFW2ÀÐ¢7–æ6VDC¢æWrFFR‚’çFô•4õ7G&–ær‚’ÀÐ¢7&VFVEV÷FS¢&W7VÇBæ7&VFVEV÷FRÀÐ¢Ò“°Ð¢v—B6ÆV%VWVTVçG'’†÷&FW$¶W’“°Ð¢7FFRç7–æ6VD6÷VçB³Ò°Ð¢7FFRæÆ7E&ö6W76VD÷&FW$¶W’Ò÷&FW$¶W“°Ð¢7FFRæÆ7EV÷FT–BÒçVÖ&W"‡&W7VÇBçV÷FRæ6÷D–BÇÂ“°Ð¢7FFRæÆ7E7V66W74BÒæWrFFR‚’çFô•4õ7G&–ær‚“°Ð¢Ò6F6‚†W'&÷"’°Ð¢v—BÖ&µVWVT4W'&÷"†÷&FW$¶W’ÂVçG'’ÂW'&÷"“°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær†W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtfÆÆòFW66öæö6–FòVâ6öÆ4”4"âr“°Ð¢ÐÐ¢ÐÐ Ð¢7FFRçVæF–æt6÷VçBÒ°Ð¢Ò6F6‚†W'&÷"’°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær†W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtæò6RVFò&ö6W6"Æ6öÆ4”4"âr“°Ð¢Òf–æÆÇ’°Ð¢7FFRç&ö6W76–ærÒfÇ6S°Ð¢–b‡&ö6W75&WVW7FVB’°Ð¢&ö6W75&WVW7FVBÒfÇ6S°Ð¢6WEF–ÖV÷WB‚‚’Óâ°Ð¢&ö6W75VWVR‚’æ6F6‚‚‚’Óâ·Ò“°Ð¢ÒÂS“°Ð¢ÐÐ¢ÐÐ¢Ó°Ð Ð¢6öç7B–æ—DWFõ7–æ2Ò‚’Óâ°Ð¢–b‡VWVTÆ—7FVæW%7F'FVB’°Ð¢&WGW&ã°Ð¢ÐÐ Ð¢Vç7W&TWF†VçF–6FVDf—&V&6U6W76–öâ‚Ð¢çF†Vâ‚‚’Óâ°Ð¢VWVTÆ—7FVæW%7F'FVBÒG'VS°Ð¢VWVUVç7V'67&–&RÒöåfÇVR€Ð¢vWD'&æ6…66÷VEVW'’…TõDUõTUTUõD‚’ÀÐ¢‡6æ6†÷B’Óâ°Ð¢6öç7BVWVTFFÒ6æ6†÷BçfÂ‚’ÇÂ·Ó°Ð¢7FFRçVæF–æt6÷VçBÒö&¦V7BçfÇVW2‡VWVTFF’æf–ÇFW"€Ð¢†VçG'’’ÓàÐ¢7G&–ær†VçG'“òç7FGW2ÇÂrr’çG&–Ò‚’çFôÆ÷vW$66R‚’ÓÓÒwVæF–ærrbb—476–væVD'&æ6‚†VçG'’Ð¢’æÆVæwFƒ°Ð¢&ö6W75VWVR‚’æ6F6‚‚‚’Óâ·Ò“°Ð¢ÒÀÐ¢†W'&÷"’Óâ°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær†W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtæò6RVFòW67V6†"Æ6öÆ4”4"âr“°Ð¢ÐÐ¢“°Ð¢7FFRæÆ—7FVæ–ærÒG'VS°Ð¢6VVDÆ–æ¶VEV÷FUvF6†W4g&öÔ÷&FW'2‚’æ6F6‚‚†W'&÷"’Óâ°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær†W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtæò6RVF–W&öâ&W&"Æ26÷F—¦6–öæW2VæÆ¦F2âr“°Ð¢Ò“°Ð¢66†VGVÆTÆ–æ¶VEV÷FW5&Vg&W6‚ƒS“°Ð¢ÒÐ¢æ6F6‚‚†W'&÷"’Óâ°Ð¢7FFRæÆ7DW'&÷"Ò7G&–ær€Ð¢W'&÷#òæÖW76vRÇÂW'&÷"ÇÂtæò6RVFòWFVçF–6"VÂ–çFVw&F÷"4”4"6öçG&f—&V&6RâpÐ¢“°Ð¢Ò“°Ð¢Ó°Ð Ð¢6öç7B7F÷WFõ7–æ2Ò‚’Óâ°Ð¢–b‡G—VöbVWVUVç7V'67&–&RÓÓÒvgVæ7F–öâr’°Ð¢VWVUVç7V'67&–&R‚“°Ð¢ÐÐ¢VWVUVç7V'67&–&RÒçVÆÃ°Ð¢VWVTÆ—7FVæW%7F'FVBÒfÇ6S°Ð¢7FFRæÆ—7FVæ–ærÒfÇ6S°Ð¢–b†Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"’°Ð¢6ÆV%F–ÖV÷WB†Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"“°Ð¢Æ–æ¶VEV÷FW5&Vg&W6…F–ÖW"ÒçVÆÃ°Ð¢ÐÐ¢Æ–æ¶VEV÷FW5&Vg&W6†–ærÒfÇ6S°Ð¢7FFRç&Vg&W6†–ætÆ–æ¶VEV÷FW2ÒfÇ6S°Ð¢Ó°Ð Ð¢&WGW&â°Ð¢7FFRÀÐ¢–æ—DWFõ7–æ2ÀÐ¢7F÷WFõ7–æ2ÀÐ¢7–æ4÷&FW%V÷FRÀÐ¢Ó°Ð§ÐÐ 