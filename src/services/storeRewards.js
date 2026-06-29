import {
  get,
  limitToLast,
  onValue,
  orderByChild,
  query,
  ref,
  runTransaction,
  set,
  update,
} from 'firebase/database';
import { database } from '../firebase.js';

export const STORE_REWARD_SETTINGS_PATH = 'storeRewardSettings';
export const STORE_REWARDS_PATH = 'storeRewards';
export const STORE_REWARD_ACCOUNTS_PATH = 'storeRewardAccounts';
export const STORE_REWARD_TRANSACTIONS_PATH = 'storeRewardTransactions';
export const STORE_ORDER_REWARD_REDEMPTIONS_PATH = 'storeOrderRewardRedemptions';

export const STORE_REWARD_TYPES = {
  SINGLE_PRODUCT: 'single_product',
  CHOICE: 'choice',
  COMBO: 'combo',
};

export const STORE_REWARD_TRANSACTION_TYPES = {
  EARNED: 'earned',
  REDEEMED: 'redeemed',
  REVERSED: 'reversed',
  ADJUSTED: 'adjusted',
};

export const DEFAULT_STORE_REWARD_SETTINGS = {
  enabled: true,
  programName: 'Club San Martin Granada',
  pointsPerAmount: 1,
  amountPerPoint: 10,
  pointsExpirationMonths: 6,
  updatedAt: 0,
};

const DEFAULT_REWARD_ACCOUNT = {
  customerId: '',
  pointsBalance: 0,
  lifetimePointsEarned: 0,
  lifetimePointsRedeemed: 0,
  holds: {},
  pendingReservationId: '',
  earnedOrderPoints: {},
  settledReservationIds: {},
  updatedAt: 0,
  createdAt: 0,
};

const REWARD_SEED_PRODUCT_CODES = {
  tortaCasera: '7434001100064',
  tortaChimichurri: '7434001100927',
  tortaJalapeno: '7434001100934',
  newYork: '00047',
  tBone: '00052',
  ribEye: '00049',
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const roundPoints = (value) => Math.max(0, Math.trunc(Number(value || 0)));
const roundPercent = (value) => Number(Number(value || 0).toFixed(2));

const sanitizeRewardId = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const sanitizeTransactionKey = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[.#$/[\]]/g, '_');

const sanitizeChoiceGroup = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const normalizeBool = (value, fallback = true) => {
  if (value === undefined || value === null) {
    return Boolean(fallback);
  }

  return value === true || value === 'true' || value === 1 || value === '1';
};

const normalizeRewardTimestamp = (value, fallback = 0) => {
  const numeric = Number(value ?? fallback ?? 0);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
};

export const getStoreRewardKey = (rewardId) => sanitizeRewardId(rewardId).replace(/[.#$/[\]]/g, '_');

export const getStoreRewardTransactionKey = (value) => sanitizeTransactionKey(value);

export const normalizeStoreRewardSettings = (settings = {}, fallback = {}) => {
  const source = settings || {};
  const backup = fallback || {};

  return {
    enabled: normalizeBool(source.enabled, backup.enabled ?? DEFAULT_STORE_REWARD_SETTINGS.enabled),
    programName:
      String(source.programName ?? backup.programName ?? DEFAULT_STORE_REWARD_SETTINGS.programName).trim() ||
      DEFAULT_STORE_REWARD_SETTINGS.programName,
    pointsPerAmount: Math.max(
      1,
      roundPoints(source.pointsPerAmount ?? backup.pointsPerAmount ?? DEFAULT_STORE_REWARD_SETTINGS.pointsPerAmount)
    ),
    amountPerPoint: Math.max(
      1,
      roundMoney(source.amountPerPoint ?? backup.amountPerPoint ?? DEFAULT_STORE_REWARD_SETTINGS.amountPerPoint)
    ),
    pointsExpirationMonths: Math.max(
      0,
      roundPoints(
        source.pointsExpirationMonths ??
          backup.pointsExpirationMonths ??
          DEFAULT_STORE_REWARD_SETTINGS.pointsExpirationMonths
      )
    ),
    updatedAt: normalizeRewardTimestamp(source.updatedAt, backup.updatedAt),
  };
};

export const calculateStoreRewardRequiredSpend = (pointsRequired, settings = DEFAULT_STORE_REWARD_SETTINGS) => {
  const normalizedSettings = normalizeStoreRewardSettings(settings);
  const safePoints = Math.max(0, roundPoints(pointsRequired));
  if (safePoints <= 0) {
    return 0;
  }

  const spend = (safePoints * normalizedSettings.amountPerPoint) / Math.max(1, normalizedSettings.pointsPerAmount);
  return roundMoney(spend);
};

export const calculateStoreRewardWeightPercent = (reward = {}, settings = DEFAULT_STORE_REWARD_SETTINGS) => {
  const requiredSpend = calculateStoreRewardRequiredSpend(reward?.pointsRequired, settings);
  if (requiredSpend <= 0) {
    return 0;
  }

  return roundPercent((roundMoney(reward?.internalCost || 0) / requiredSpend) * 100);
};

export const calculateEarnedRewardPoints = (amount, settings = DEFAULT_STORE_REWARD_SETTINGS) => {
  const normalizedSettings = normalizeStoreRewardSettings(settings);
  const safeAmount = Math.max(0, roundMoney(amount));
  if (safeAmount <= 0) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((safeAmount / normalizedSettings.amountPerPoint) * normalizedSettings.pointsPerAmount)
  );
};

export const normalizeStoreRewardItem = (item = {}, rewardId = '', index = 0) => {
  const source = item || {};
  const productCode = String(source.productCode ?? source.code ?? '').trim();
  const choiceGroup = sanitizeChoiceGroup(source.choiceGroup || '');
  const id =
    sanitizeRewardId(source.id || '') ||
    sanitizeRewardId(`${rewardId}_${choiceGroup || productCode || `item_${index + 1}`}`);

  return {
    id,
    productCode,
    quantity: Math.max(1, Number(source.quantity || 1)),
    internalCost: roundMoney(source.internalCost || 0),
    isChoiceOption: normalizeBool(source.isChoiceOption, false),
    choiceGroup,
    choiceLabel: String(source.choiceLabel || '').trim(),
    sortOrder: Number(source.sortOrder ?? (index + 1) * 10) || (index + 1) * 10,
  };
};

export const normalizeStoreReward = (reward = {}, fallback = {}) => {
  const source = reward || {};
  const backup = fallback || {};
  const name = String(source.name ?? backup.name ?? '').trim();
  const id = sanitizeRewardId(source.id ?? backup.id ?? name);
  const rewardType = String(
    source.rewardType ?? backup.rewardType ?? STORE_REWARD_TYPES.SINGLE_PRODUCT
  ).trim();

  const normalizedItems = (Array.isArray(source.items) ? source.items : backup.items || [])
    .map((item, index) => normalizeStoreRewardItem(item, id, index))
    .filter((item) => item.id && item.productCode);

  return {
    id,
    name: name || id,
    description: String(source.description ?? backup.description ?? '').trim(),
    pointsRequired: Math.max(0, roundPoints(source.pointsRequired ?? backup.pointsRequired ?? 0)),
    internalCost: roundMoney(source.internalCost ?? backup.internalCost ?? 0),
    minPurchaseAmount: roundMoney(source.minPurchaseAmount ?? backup.minPurchaseAmount ?? 0),
    active: normalizeBool(source.active, backup.active ?? true),
    available: normalizeBool(source.available, backup.available ?? true),
    displayOrder: Number(source.displayOrder ?? backup.displayOrder ?? 999) || 999,
    rewardType:
      Object.values(STORE_REWARD_TYPES).includes(rewardType) ? rewardType : STORE_REWARD_TYPES.SINGLE_PRODUCT,
    imageProductCode: String(source.imageProductCode ?? backup.imageProductCode ?? '').trim(),
    deleted: normalizeBool(source.deleted, backup.deleted ?? false),
    maxPerOrder: Math.max(1, roundPoints(source.maxPerOrder ?? backup.maxPerOrder ?? 1)),
    notCashRedeemable: normalizeBool(source.notCashRedeemable, backup.notCashRedeemable ?? true),
    items: normalizedItems,
    createdAt: normalizeRewardTimestamp(source.createdAt, backup.createdAt),
    updatedAt: normalizeRewardTimestamp(source.updatedAt, backup.updatedAt),
  };
};

export const normalizeStoreRewardAccount = (account = {}, customerId = '') => {
  const source = account || {};

  return {
    customerId: String(source.customerId || customerId || '').trim(),
    pointsBalance: Math.max(0, roundPoints(source.pointsBalance || 0)),
    lifetimePointsEarned: Math.max(0, roundPoints(source.lifetimePointsEarned || 0)),
    lifetimePointsRedeemed: Math.max(0, roundPoints(source.lifetimePointsRedeemed || 0)),
    holds: source.holds && typeof source.holds === 'object' ? source.holds : {},
    pendingReservationId: String(source.pendingReservationId || '').trim(),
    earnedOrderPoints:
      source.earnedOrderPoints && typeof source.earnedOrderPoints === 'object'
        ? source.earnedOrderPoints
        : {},
    settledReservationIds:
      source.settledReservationIds && typeof source.settledReservationIds === 'object'
        ? source.settledReservationIds
        : {},
    updatedAt: normalizeRewardTimestamp(source.updatedAt),
    createdAt: normalizeRewardTimestamp(source.createdAt),
  };
};

export const getStoreRewardChoiceGroups = (reward = {}) => {
  const groups = new Map();

  (Array.isArray(reward.items) ? reward.items : []).forEach((item) => {
    if (!item?.isChoiceOption || !item?.choiceGroup) {
      return;
    }

    if (!groups.has(item.choiceGroup)) {
      groups.set(item.choiceGroup, []);
    }

    groups.get(item.choiceGroup).push(item);
  });

  return Array.from(groups.entries()).map(([choiceGroup, items]) => ({
    choiceGroup,
    items: [...items].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0)),
  }));
};

export const getStoreRewardFixedItems = (reward = {}) =>
  (Array.isArray(reward.items) ? reward.items : [])
    .filter((item) => !item?.isChoiceOption)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));

export const getStoreRewardChoiceItem = (reward = {}, choiceGroup = '', selectedProductCode = '') => {
  const normalizedGroup = sanitizeChoiceGroup(choiceGroup);
  const normalizedCode = String(selectedProductCode || '').trim();

  return (Array.isArray(reward.items) ? reward.items : []).find(
    (item) =>
      item?.isChoiceOption &&
      item?.choiceGroup === normalizedGroup &&
      String(item.productCode || '').trim() === normalizedCode
  ) || null;
};

export const resolveStoreRewardImage = (reward = {}, catalogByCode = {}) => {
  const imageProductCode = String(reward.imageProductCode || '').trim();
  const fallbackCode =
    imageProductCode ||
    String(getStoreRewardFixedItems(reward)[0]?.productCode || '').trim() ||
    String(getStoreRewardChoiceGroups(reward)[0]?.items?.[0]?.productCode || '').trim();

  return catalogByCode[fallbackCode]?.image || '';
};

export const hydrateStoreReward = (reward = {}, catalog = []) => {
  const normalizedReward = normalizeStoreReward(reward);
  const catalogByCode = Object.fromEntries(
    (Array.isArray(catalog) ? catalog : []).map((product) => [String(product.code || '').trim(), product])
  );

  const hydratedItems = normalizedReward.items.map((item) => {
    const linkedProduct = catalogByCode[item.productCode] || null;
    return {
      ...item,
      productName: linkedProduct?.name || item.choiceLabel || item.productCode,
      productImage: linkedProduct?.image || '',
      productUnit: linkedProduct?.unit || '',
    };
  });

  return {
    ...normalizedReward,
    items: hydratedItems,
    requiredSpend: calculateStoreRewardRequiredSpend(normalizedReward.pointsRequired),
    rewardWeightPercent: calculateStoreRewardWeightPercent(normalizedReward),
    image: resolveStoreRewardImage(normalizedReward, catalogByCode),
  };
};

export const mergeStoreRewards = (remoteRewards = {}, catalog = []) =>
  Object.values(remoteRewards || {})
    .filter(Boolean)
    .map((reward) => hydrateStoreReward(reward, catalog))
    .filter((reward) => reward.id && reward.deleted !== true)
    .sort(
      (left, right) =>
        Number(left.displayOrder || 0) - Number(right.displayOrder || 0) ||
        Number(left.pointsRequired || 0) - Number(right.pointsRequired || 0) ||
        String(left.name || '').localeCompare(String(right.name || ''), 'es-NI', {
          sensitivity: 'base',
          numeric: true,
        })
    );

export const buildStoreRewardRedemptionSnapshot = (reward = {}, selection = {}, catalog = []) => {
  const hydratedReward = hydrateStoreReward(reward, catalog);
  const selectedItems = [...getStoreRewardFixedItems(hydratedReward)];
  const selectedChoices = {};

  getStoreRewardChoiceGroups(hydratedReward).forEach((group) => {
    const preferredCode = String(selection?.choices?.[group.choiceGroup] || group.items?.[0]?.productCode || '').trim();
    const selectedChoice = group.items.find(
      (item) => String(item.productCode || '').trim() === preferredCode
    ) || group.items[0];

    if (selectedChoice) {
      selectedItems.push(selectedChoice);
      selectedChoices[group.choiceGroup] = String(selectedChoice.productCode || '').trim();
    }
  });

  return {
    reservationId: String(selection?.reservationId || '').trim(),
    rewardId: hydratedReward.id,
    rewardName: hydratedReward.name,
    rewardDescription: hydratedReward.description,
    rewardType: hydratedReward.rewardType,
    pointsRedeemed: hydratedReward.pointsRequired,
    minPurchaseAmount: hydratedReward.minPurchaseAmount,
    image: hydratedReward.image || '',
    imageProductCode: hydratedReward.imageProductCode || '',
    choiceSelections: selectedChoices,
    items: selectedItems.map((item) => ({
      id: item.id,
      productCode: String(item.productCode || '').trim(),
      productName: item.productName || item.choiceLabel || item.productCode,
      productImage: item.productImage || '',
      quantity: Math.max(1, Number(item.quantity || 1)),
      internalCost: roundMoney(item.internalCost || 0),
      choiceGroup: item.choiceGroup || '',
      isChoiceOption: Boolean(item.isChoiceOption),
    })),
    requestedAt: Date.now(),
    status: 'reserved',
  };
};

export const normalizeStoreRewardRedemption = (rewardRedemption = {}) => {
  if (!rewardRedemption || typeof rewardRedemption !== 'object') {
    return null;
  }

  const cleanRewardId = String(rewardRedemption.rewardId || '').trim();
  const cleanRewardName = String(rewardRedemption.rewardName || '').trim();
  const cleanReservationId = String(rewardRedemption.reservationId || '').trim();
  const normalizedItems = (Array.isArray(rewardRedemption.items) ? rewardRedemption.items : [])
    .map((item) => ({
      id: String(item?.id || '').trim(),
      productCode: String(item?.productCode || '').trim(),
      productName: String(item?.productName || item?.choiceLabel || '').trim(),
      productImage: String(item?.productImage || '').trim(),
      quantity: Math.max(1, Number(item?.quantity || 1)),
      internalCost: roundMoney(item?.internalCost || 0),
      choiceGroup: String(item?.choiceGroup || '').trim(),
      isChoiceOption: Boolean(item?.isChoiceOption),
    }))
    .filter((item) => item.productCode && item.productName);

  if (!cleanRewardId || !cleanRewardName || normalizedItems.length === 0) {
    return null;
  }

  const choiceSelections =
    rewardRedemption.choiceSelections && typeof rewardRedemption.choiceSelections === 'object'
      ? Object.fromEntries(
          Object.entries(rewardRedemption.choiceSelections)
            .map(([group, productCode]) => [sanitizeChoiceGroup(group), String(productCode || '').trim()])
            .filter(([group, productCode]) => group && productCode)
        )
      : {};

  return {
    reservationId: cleanReservationId,
    rewardId: cleanRewardId,
    rewardName: cleanRewardName,
    rewardDescription: String(rewardRedemption.rewardDescription || '').trim(),
    rewardType: String(rewardRedemption.rewardType || STORE_REWARD_TYPES.SINGLE_PRODUCT).trim(),
    pointsRedeemed: Math.max(0, roundPoints(rewardRedemption.pointsRedeemed || 0)),
    minPurchaseAmount: roundMoney(rewardRedemption.minPurchaseAmount || 0),
    image: String(rewardRedemption.image || '').trim(),
    imageProductCode: String(rewardRedemption.imageProductCode || '').trim(),
    choiceSelections,
    items: normalizedItems,
    requestedAt: normalizeRewardTimestamp(rewardRedemption.requestedAt, Date.now()),
    status: String(rewardRedemption.status || 'reserved').trim() || 'reserved',
  };
};

export const getStoreRewardRedemptionLabel = (rewardRedemption = {}) =>
  String(rewardRedemption?.rewardName || '').trim() || 'Premio Club San Martin';

export const buildStoreRewardRedemptionTextLines = (rewardRedemption = {}) => {
  const normalizedRewardRedemption = normalizeStoreRewardRedemption(rewardRedemption);
  if (!normalizedRewardRedemption) {
    return [];
  }

  const selectedItems = normalizedRewardRedemption.items;
  if (selectedItems.length === 0) {
    return [];
  }

  const lines = [
    'Premio Club San Martin:',
    `- ${getStoreRewardRedemptionLabel(normalizedRewardRedemption)} | C$0.00`,
  ];

  selectedItems.forEach((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const itemName =
      String(item.productName || item.choiceLabel || item.productCode || 'Producto premio').trim() ||
      'Producto premio';
    lines.push(`  Incluye: ${quantity} x ${itemName}`);
  });

  if (Number(normalizedRewardRedemption.pointsRedeemed || 0) > 0) {
    lines.push(`  Canjeado con ${roundPoints(normalizedRewardRedemption.pointsRedeemed)} puntos.`);
  }

  return lines;
};

export const resolveStoreRewardOrderFinalAmount = (order = {}) => {
  const sicarTotal = roundMoney(order?.sicarQuote?.total || 0);
  if (order?.totalAproximado === false && sicarTotal > 0) {
    return sicarTotal;
  }

  return roundMoney(order?.total || order?.subtotalEstimado || 0);
};

export const getRewardDisplayStatus = (reward = {}, pointsBalance = 0, cartAmount = 0, settings = DEFAULT_STORE_REWARD_SETTINGS) => {
  const normalizedSettings = normalizeStoreRewardSettings(settings);
  const normalizedReward = normalizeStoreReward(reward);
  const safePoints = Math.max(0, roundPoints(pointsBalance));
  const missingPoints = Math.max(0, normalizedReward.pointsRequired - safePoints);
  const minPurchaseAmount = roundMoney(normalizedReward.minPurchaseAmount || 0);
  const cartEligible = minPurchaseAmount <= 0 || roundMoney(cartAmount) >= minPurchaseAmount;
  const activeProgram = normalizedSettings.enabled === true;

  if (!activeProgram) {
    return {
      status: 'disabled',
      missingPoints,
      cartEligible,
    };
  }

  if (normalizedReward.active === false || normalizedReward.deleted === true) {
    return {
      status: 'inactive',
      missingPoints,
      cartEligible,
    };
  }

  if (normalizedReward.available === false) {
    return {
      status: 'unavailable',
      missingPoints,
      cartEligible,
    };
  }

  if (!cartEligible) {
    return {
      status: 'min_purchase',
      missingPoints,
      cartEligible: false,
    };
  }

  if (missingPoints <= 0) {
    return {
      status: 'available',
      missingPoints: 0,
      cartEligible: true,
    };
  }

  return {
    status: 'locked',
    missingPoints,
    cartEligible: true,
  };
};

export const createRewardReservationId = () =>
  `rr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

const createAccountTransactionRecord = ({
  customerId,
  orderKey = '',
  rewardId = '',
  rewardName = '',
  type = STORE_REWARD_TRANSACTION_TYPES.ADJUSTED,
  points = 0,
  signedPoints = 0,
  balanceBefore = 0,
  balanceAfter = 0,
  note = '',
  status = 'applied',
  rewardSnapshot = null,
}) => ({
  customerId: String(customerId || '').trim(),
  orderKey: String(orderKey || '').trim(),
  rewardId: String(rewardId || '').trim(),
  rewardName: String(rewardName || '').trim(),
  type,
  status,
  points: roundPoints(points),
  signedPoints: Number(signedPoints || 0),
  balanceBefore: roundPoints(balanceBefore),
  balanceAfter: roundPoints(balanceAfter),
  note: String(note || '').trim(),
  rewardSnapshot: rewardSnapshot || null,
  createdAt: Date.now(),
});

export const ensureStoreRewardAccount = async (userKey, options = {}) => {
  const cleanUserKey = String(userKey || '').trim();
  if (!cleanUserKey) {
    throw new Error('Cliente invalido para recompensas.');
  }

  const databaseInstance = options.databaseInstance || database;
  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  const snapshot = await get(accountRef);
  const existing = snapshot.val();

  if (existing) {
    return normalizeStoreRewardAccount(existing, cleanUserKey);
  }

  const now = Date.now();
  const nextAccount = {
    ...DEFAULT_REWARD_ACCOUNT,
    customerId: cleanUserKey,
    createdAt: now,
    updatedAt: now,
  };

  await set(accountRef, nextAccount);
  return nextAccount;
};

export async function reserveStoreRewardPoints({
  userKey,
  reward,
  selection = {},
  catalog = [],
  cartAmount = 0,
  settings = DEFAULT_STORE_REWARD_SETTINGS,
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  if (!cleanUserKey) {
    throw new Error('Debes iniciar sesion para canjear un premio.');
  }

  const normalizedSettings = normalizeStoreRewardSettings(settings);
  const hydratedReward = hydrateStoreReward(reward, catalog);
  const status = getRewardDisplayStatus(hydratedReward, Number(selection.pointsBalance || 0), cartAmount, normalizedSettings);

  if (normalizedSettings.enabled !== true) {
    throw new Error('El Club San Martin no esta disponible en este momento.');
  }

  if (!hydratedReward.id || hydratedReward.active === false || hydratedReward.available === false) {
    throw new Error('Este premio no esta disponible ahora mismo.');
  }

  if (status.status === 'min_purchase') {
    throw new Error(`Este premio requiere una compra minima de C$ ${Number(hydratedReward.minPurchaseAmount || 0).toFixed(2)}.`);
  }

  const reservationId = createRewardReservationId();
  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  let failureCode = '';
  let failureMessage = '';

  const transactionResult = await runTransaction(accountRef, (currentValue) => {
    const account = normalizeStoreRewardAccount(currentValue, cleanUserKey);
    const balanceBefore = account.pointsBalance;

    if (account.holds?.[reservationId]) {
      return account;
    }

    if (balanceBefore < hydratedReward.pointsRequired) {
      failureCode = 'INSUFFICIENT_POINTS';
      failureMessage = `Te faltan ${hydratedReward.pointsRequired - balanceBefore} puntos para reclamar este premio.`;
      return;
    }

    if (roundMoney(cartAmount) < roundMoney(hydratedReward.minPurchaseAmount || 0)) {
      failureCode = 'MIN_PURCHASE_REQUIRED';
      failureMessage = `Este premio requiere una compra minima de C$ ${Number(hydratedReward.minPurchaseAmount || 0).toFixed(2)}.`;
      return;
    }

    const now = Date.now();

    return {
      ...account,
      customerId: cleanUserKey,
      pointsBalance: Math.max(0, balanceBefore - hydratedReward.pointsRequired),
      holds: {
        ...(account.holds || {}),
        [reservationId]: {
          rewardId: hydratedReward.id,
          rewardName: hydratedReward.name,
          points: hydratedReward.pointsRequired,
          minPurchaseAmount: roundMoney(hydratedReward.minPurchaseAmount || 0),
          requestedAt: now,
        },
      },
      pendingReservationId: reservationId,
      updatedAt: now,
      createdAt: account.createdAt || now,
    };
  });

  if (!transactionResult.committed) {
    const error = new Error(failureMessage || 'No se pudo reservar el premio.');
    error.code = failureCode || 'REWARD_RESERVE_FAILED';
    throw error;
  }

  const nextAccount = normalizeStoreRewardAccount(transactionResult.snapshot.val(), cleanUserKey);
  const balanceAfter = nextAccount.pointsBalance;
  const balanceBefore = balanceAfter + hydratedReward.pointsRequired;
  const rewardSnapshot = buildStoreRewardRedemptionSnapshot(hydratedReward, { ...selection, reservationId }, catalog);
  const transactionKey = getStoreRewardTransactionKey(reservationId);

  await set(
    ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${transactionKey}`),
    createAccountTransactionRecord({
      customerId: cleanUserKey,
      rewardId: hydratedReward.id,
      rewardName: hydratedReward.name,
      type: STORE_REWARD_TRANSACTION_TYPES.REDEEMED,
      status: 'reserved',
      points: hydratedReward.pointsRequired,
      signedPoints: -hydratedReward.pointsRequired,
      balanceBefore,
      balanceAfter,
      note: 'Premio reservado para el siguiente pedido.',
      rewardSnapshot,
    })
  );

  return {
    reservationId,
    transactionKey,
    rewardSnapshot,
    balanceBefore,
    balanceAfter,
  };
}

export async function releaseStoreRewardReservation({
  userKey,
  reservationId,
  orderKey = '',
  note = 'Premio liberado.',
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  const cleanReservationId = String(reservationId || '').trim();

  if (!cleanUserKey || !cleanReservationId) {
    return {
      restored: false,
      reason: 'missing_input',
    };
  }

  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  let releasedHold = null;
  let alreadySettled = false;

  const transactionResult = await runTransaction(accountRef, (currentValue) => {
    const account = normalizeStoreRewardAccount(currentValue, cleanUserKey);
    const hold = account.holds?.[cleanReservationId] || null;

    if (!hold) {
      alreadySettled = Boolean(account.settledReservationIds?.[cleanReservationId]);
      return account;
    }

    releasedHold = hold;
    const nextHolds = { ...(account.holds || {}) };
    delete nextHolds[cleanReservationId];
    const balanceBefore = account.pointsBalance;

    return {
      ...account,
      pointsBalance: Math.max(0, balanceBefore + roundPoints(hold.points || 0)),
      holds: nextHolds,
      pendingReservationId:
        String(account.pendingReservationId || '').trim() === cleanReservationId
          ? ''
          : String(account.pendingReservationId || '').trim(),
      updatedAt: Date.now(),
    };
  });

  if (!transactionResult.committed) {
    return {
      restored: false,
      reason: 'not_committed',
    };
  }

  if (!releasedHold) {
    return {
      restored: false,
      reason: alreadySettled ? 'already_settled' : 'hold_missing',
    };
  }

  const nextAccount = normalizeStoreRewardAccount(transactionResult.snapshot.val(), cleanUserKey);
  const refundPoints = roundPoints(releasedHold.points || 0);
  const balanceAfter = nextAccount.pointsBalance;
  const balanceBefore = Math.max(0, balanceAfter - refundPoints);
  const transactionKey = getStoreRewardTransactionKey(`reverse_${cleanReservationId}`);

  await update(ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${getStoreRewardTransactionKey(cleanReservationId)}`), {
    status: 'reversed',
    orderKey: String(orderKey || '').trim(),
    reversedAt: Date.now(),
  }).catch(() => {});

  await set(
    ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${transactionKey}`),
    createAccountTransactionRecord({
      customerId: cleanUserKey,
      orderKey,
      rewardId: String(releasedHold.rewardId || '').trim(),
      rewardName: String(releasedHold.rewardName || '').trim(),
      type: STORE_REWARD_TRANSACTION_TYPES.REVERSED,
      status: 'applied',
      points: refundPoints,
      signedPoints: refundPoints,
      balanceBefore,
      balanceAfter,
      note,
    })
  );

  return {
    restored: true,
    refundedPoints: refundPoints,
    balanceAfter,
  };
}

export async function settleStoreRewardReservation({
  userKey,
  reservationId,
  orderKey = '',
  note = 'Premio aplicado en pedido completado.',
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  const cleanReservationId = String(reservationId || '').trim();

  if (!cleanUserKey || !cleanReservationId) {
    return {
      settled: false,
      reason: 'missing_input',
    };
  }

  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  let settledHold = null;

  const transactionResult = await runTransaction(accountRef, (currentValue) => {
    const account = normalizeStoreRewardAccount(currentValue, cleanUserKey);

    if (account.settledReservationIds?.[cleanReservationId]) {
      return account;
    }

    const hold = account.holds?.[cleanReservationId] || null;
    if (!hold) {
      return account;
    }

    settledHold = hold;
    const nextHolds = { ...(account.holds || {}) };
    delete nextHolds[cleanReservationId];

    return {
      ...account,
      holds: nextHolds,
      pendingReservationId:
        String(account.pendingReservationId || '').trim() === cleanReservationId
          ? ''
          : String(account.pendingReservationId || '').trim(),
      lifetimePointsRedeemed: Math.max(
        0,
        roundPoints(account.lifetimePointsRedeemed || 0) + roundPoints(hold.points || 0)
      ),
      settledReservationIds: {
        ...(account.settledReservationIds || {}),
        [cleanReservationId]: {
          points: roundPoints(hold.points || 0),
          orderKey: String(orderKey || '').trim(),
          settledAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
    };
  });

  if (!transactionResult.committed || !settledHold) {
    return {
      settled: false,
      reason: settledHold ? 'not_committed' : 'hold_missing',
    };
  }

  await update(ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${getStoreRewardTransactionKey(cleanReservationId)}`), {
    status: 'settled',
    orderKey: String(orderKey || '').trim(),
    settledAt: Date.now(),
    note: String(note || '').trim(),
  }).catch(() => {});

  return {
    settled: true,
    redeemedPoints: roundPoints(settledHold.points || 0),
  };
}

export async function applyStoreRewardEarnedPoints({
  userKey,
  orderKey,
  points,
  note = 'Puntos acreditados por pedido completado.',
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  const cleanOrderKey = String(orderKey || '').trim();
  const safePoints = roundPoints(points);

  if (!cleanUserKey || !cleanOrderKey || safePoints <= 0) {
    return {
      applied: false,
      reason: 'missing_input',
    };
  }

  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  let alreadyApplied = false;
  let balanceBefore = 0;
  let balanceAfter = 0;

  const transactionResult = await runTransaction(accountRef, (currentValue) => {
    const account = normalizeStoreRewardAccount(currentValue, cleanUserKey);

    if (account.earnedOrderPoints?.[cleanOrderKey]) {
      alreadyApplied = true;
      return account;
    }

    balanceBefore = account.pointsBalance;
    balanceAfter = balanceBefore + safePoints;

    return {
      ...account,
      pointsBalance: balanceAfter,
      lifetimePointsEarned: Math.max(0, roundPoints(account.lifetimePointsEarned || 0) + safePoints),
      earnedOrderPoints: {
        ...(account.earnedOrderPoints || {}),
        [cleanOrderKey]: {
          points: safePoints,
          awardedAt: Date.now(),
        },
      },
      updatedAt: Date.now(),
      createdAt: account.createdAt || Date.now(),
    };
  });

  if (!transactionResult.committed || alreadyApplied) {
    return {
      applied: false,
      reason: alreadyApplied ? 'already_applied' : 'not_committed',
    };
  }

  const transactionKey = getStoreRewardTransactionKey(`earned_${cleanOrderKey}`);
  await set(
    ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${transactionKey}`),
    createAccountTransactionRecord({
      customerId: cleanUserKey,
      orderKey: cleanOrderKey,
      type: STORE_REWARD_TRANSACTION_TYPES.EARNED,
      status: 'applied',
      points: safePoints,
      signedPoints: safePoints,
      balanceBefore,
      balanceAfter,
      note,
    })
  );

  return {
    applied: true,
    transactionKey,
    balanceAfter,
  };
}

export async function reverseStoreRewardEarnedPoints({
  userKey,
  orderKey,
  note = 'Puntos revertidos por pedido cancelado.',
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  const cleanOrderKey = String(orderKey || '').trim();

  if (!cleanUserKey || !cleanOrderKey) {
    return {
      reversed: false,
      reason: 'missing_input',
    };
  }

  const accountRef = ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`);
  let reversedPoints = 0;
  let balanceBefore = 0;
  let balanceAfter = 0;

  const transactionResult = await runTransaction(accountRef, (currentValue) => {
    const account = normalizeStoreRewardAccount(currentValue, cleanUserKey);
    const earnedRecord = account.earnedOrderPoints?.[cleanOrderKey];

    if (!earnedRecord) {
      return account;
    }

    reversedPoints = roundPoints(earnedRecord.points || 0);
    balanceBefore = account.pointsBalance;
    balanceAfter = Math.max(0, balanceBefore - reversedPoints);
    const nextEarnedOrders = { ...(account.earnedOrderPoints || {}) };
    delete nextEarnedOrders[cleanOrderKey];

    return {
      ...account,
      pointsBalance: balanceAfter,
      lifetimePointsEarned: Math.max(0, roundPoints(account.lifetimePointsEarned || 0) - reversedPoints),
      earnedOrderPoints: nextEarnedOrders,
      updatedAt: Date.now(),
    };
  });

  if (!transactionResult.committed || reversedPoints <= 0) {
    return {
      reversed: false,
      reason: reversedPoints > 0 ? 'not_committed' : 'not_found',
    };
  }

  const transactionKey = getStoreRewardTransactionKey(`reversed_${cleanOrderKey}`);
  await set(
    ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${transactionKey}`),
    createAccountTransactionRecord({
      customerId: cleanUserKey,
      orderKey: cleanOrderKey,
      type: STORE_REWARD_TRANSACTION_TYPES.REVERSED,
      status: 'applied',
      points: reversedPoints,
      signedPoints: -reversedPoints,
      balanceBefore,
      balanceAfter,
      note,
    })
  );

  return {
    reversed: true,
    transactionKey,
    points: reversedPoints,
  };
}

export async function linkRewardReservationToOrder({
  userKey,
  reservationId,
  orderKey,
  orderNumber = 0,
  databaseInstance = database,
}) {
  const cleanUserKey = String(userKey || '').trim();
  const cleanReservationId = String(reservationId || '').trim();
  const cleanOrderKey = String(orderKey || '').trim();

  if (!cleanUserKey || !cleanReservationId || !cleanOrderKey) {
    return;
  }

  await update(
    ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}/${getStoreRewardTransactionKey(cleanReservationId)}`),
    {
      orderKey: cleanOrderKey,
      orderNumber: Number(orderNumber || 0),
      status: 'linked',
      linkedAt: Date.now(),
    }
  ).catch(() => {});
}

export const buildCustomerRewardSummary = (rewards = [], pointsBalance = 0, cartAmount = 0, settings = DEFAULT_STORE_REWARD_SETTINGS) => {
  const sortedRewards = [...(Array.isArray(rewards) ? rewards : [])].sort(
    (left, right) => Number(left.pointsRequired || 0) - Number(right.pointsRequired || 0)
  );

  const availableRewards = sortedRewards.filter(
    (reward) => getRewardDisplayStatus(reward, pointsBalance, cartAmount, settings).status === 'available'
  );
  const upcomingRewards = sortedRewards.filter(
    (reward) => getRewardDisplayStatus(reward, pointsBalance, cartAmount, settings).status !== 'available'
  );
  const closestReward = upcomingRewards[0] || availableRewards[availableRewards.length - 1] || null;

  return {
    availableRewards,
    upcomingRewards,
    closestReward,
    bestReward: availableRewards[availableRewards.length - 1] || null,
  };
};

export const subscribeStoreRewardSettings = (onData, onError, databaseInstance = database) =>
  onValue(
    ref(databaseInstance, STORE_REWARD_SETTINGS_PATH),
    (snapshot) => {
      onData(normalizeStoreRewardSettings(snapshot.val(), DEFAULT_STORE_REWARD_SETTINGS));
    },
    onError
  );

export const subscribeStoreRewards = (onData, onError, databaseInstance = database) =>
  onValue(
    ref(databaseInstance, STORE_REWARDS_PATH),
    (snapshot) => {
      onData(snapshot.val() || {});
    },
    onError
  );

export const subscribeStoreRewardAccount = (userKey, onData, onError, databaseInstance = database) => {
  const cleanUserKey = String(userKey || '').trim();
  if (!cleanUserKey) {
    onData(normalizeStoreRewardAccount({}, ''));
    return () => {};
  }

  return onValue(
    ref(databaseInstance, `${STORE_REWARD_ACCOUNTS_PATH}/${cleanUserKey}`),
    (snapshot) => {
      onData(normalizeStoreRewardAccount(snapshot.val(), cleanUserKey));
    },
    onError
  );
};

export const subscribeStoreRewardTransactions = (
  userKey,
  onData,
  onError,
  limit = 30,
  databaseInstance = database
) => {
  const cleanUserKey = String(userKey || '').trim();
  const safeLimit = Math.max(1, roundPoints(limit || 30));

  if (!cleanUserKey) {
    onData([]);
    return () => {};
  }

  return onValue(
    query(
      ref(databaseInstance, `${STORE_REWARD_TRANSACTIONS_PATH}/${cleanUserKey}`),
      orderByChild('createdAt'),
      limitToLast(safeLimit)
    ),
    (snapshot) => {
      const transactions = Object.entries(snapshot.val() || {})
        .map(([id, value]) => ({
          id,
          ...(value || {}),
        }))
        .sort((left, right) => Number(right.createdAt || 0) - Number(left.createdAt || 0));

      onData(transactions);
    },
    onError
  );
};

export async function saveStoreRewardSettings(settings, options = {}) {
  const databaseInstance = options.databaseInstance || database;
  const normalized = normalizeStoreRewardSettings(settings, DEFAULT_STORE_REWARD_SETTINGS);
  const payload = {
    ...normalized,
    updatedAt: Date.now(),
  };

  await set(ref(databaseInstance, STORE_REWARD_SETTINGS_PATH), payload);
  return payload;
}

export async function saveStoreReward(reward, options = {}) {
  const databaseInstance = options.databaseInstance || database;
  const normalized = normalizeStoreReward(reward);
  if (!normalized.id || !normalized.name || normalized.pointsRequired <= 0) {
    throw new Error('Premio incompleto.');
  }

  const now = Date.now();
  const payload = {
    ...normalized,
    createdAt: normalized.createdAt || now,
    updatedAt: now,
    deleted: false,
  };

  await set(ref(databaseInstance, `${STORE_REWARDS_PATH}/${getStoreRewardKey(payload.id)}`), payload);
  return payload;
}

export async function updateStoreReward(rewardId, patch = {}, options = {}) {
  const databaseInstance = options.databaseInstance || database;
  const rewardKey = getStoreRewardKey(rewardId);
  if (!rewardKey) {
    throw new Error('Premio invalido.');
  }

  await update(ref(databaseInstance, `${STORE_REWARDS_PATH}/${rewardKey}`), {
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function deleteStoreReward(rewardId, options = {}) {
  const databaseInstance = options.databaseInstance || database;
  const rewardKey = getStoreRewardKey(rewardId);
  if (!rewardKey) {
    throw new Error('Premio invalido.');
  }

  await set(ref(databaseInstance, `${STORE_REWARDS_PATH}/${rewardKey}`), {
    id: sanitizeRewardId(rewardId),
    deleted: true,
    active: false,
    available: false,
    updatedAt: Date.now(),
  });
}

export const buildDefaultStoreRewardsSeed = () => [
  {
    id: 'nivel_1_torta_casera',
    name: 'Paquete Torta Casera, 2 unidades',
    description: 'Premio de entrada para empezar a disfrutar el Club San Martin.',
    pointsRequired: 400,
    internalCost: 39,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 10,
    rewardType: STORE_REWARD_TYPES.SINGLE_PRODUCT,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.tortaCasera,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaCasera,
        quantity: 1,
        internalCost: 39,
      },
    ],
  },
  {
    id: 'nivel_2_torta_sabor',
    name: 'Torta Sabor Jalapeno o Torta Sabor Chimichurri',
    description: 'Elige tu sabor favorito al reclamar este premio.',
    pointsRequired: 750,
    internalCost: 120,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 20,
    rewardType: STORE_REWARD_TYPES.CHOICE,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.tortaJalapeno,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaJalapeno,
        quantity: 1,
        internalCost: 120,
        isChoiceOption: true,
        choiceGroup: 'torta_sabor',
        choiceLabel: 'Torta Sabor Jalapeno',
        sortOrder: 10,
      },
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaChimichurri,
        quantity: 1,
        internalCost: 120,
        isChoiceOption: true,
        choiceGroup: 'torta_sabor',
        choiceLabel: 'Torta Sabor Chimichurri',
        sortOrder: 20,
      },
    ],
  },
  {
    id: 'nivel_3_new_york',
    name: '1 New York Steak 12 oz gratis',
    description: 'Corte premium ideal para seguir subiendo de nivel.',
    pointsRequired: 1000,
    internalCost: 150,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 30,
    rewardType: STORE_REWARD_TYPES.SINGLE_PRODUCT,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.newYork,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.newYork,
        quantity: 1,
        internalCost: 150,
      },
    ],
  },
  {
    id: 'nivel_4_t_bone',
    name: '1 T-Bone 18 oz gratis',
    description: 'Mas puntos, mas parrilla.',
    pointsRequired: 1500,
    internalCost: 195,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 40,
    rewardType: STORE_REWARD_TYPES.SINGLE_PRODUCT,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.tBone,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tBone,
        quantity: 1,
        internalCost: 195,
      },
    ],
  },
  {
    id: 'nivel_5_rib_eye',
    name: '1 Rib Eye Steak 12 oz gratis',
    description: 'Uno de los premios mas deseados del Club San Martin.',
    pointsRequired: 1750,
    internalCost: 180,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 50,
    rewardType: STORE_REWARD_TYPES.SINGLE_PRODUCT,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.ribEye,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.ribEye,
        quantity: 1,
        internalCost: 180,
      },
    ],
  },
  {
    id: 'nivel_6_combo_premium',
    name: 'Combo Premium San Martin',
    description: 'Canjea el combo grande del Club San Martin.',
    pointsRequired: 2500,
    internalCost: 489,
    minPurchaseAmount: 0,
    active: true,
    available: true,
    displayOrder: 60,
    rewardType: STORE_REWARD_TYPES.COMBO,
    imageProductCode: REWARD_SEED_PRODUCT_CODES.ribEye,
    items: [
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaCasera,
        quantity: 1,
        internalCost: 39,
        sortOrder: 10,
      },
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaJalapeno,
        quantity: 1,
        internalCost: 120,
        isChoiceOption: true,
        choiceGroup: 'combo_torta_sabor',
        choiceLabel: 'Torta Sabor Jalapeno',
        sortOrder: 20,
      },
      {
        productCode: REWARD_SEED_PRODUCT_CODES.tortaChimichurri,
        quantity: 1,
        internalCost: 120,
        isChoiceOption: true,
        choiceGroup: 'combo_torta_sabor',
        choiceLabel: 'Torta Sabor Chimichurri',
        sortOrder: 30,
      },
      {
        productCode: REWARD_SEED_PRODUCT_CODES.newYork,
        quantity: 1,
        internalCost: 150,
        sortOrder: 40,
      },
      {
        productCode: REWARD_SEED_PRODUCT_CODES.ribEye,
        quantity: 1,
        internalCost: 180,
        sortOrder: 50,
      },
    ],
  },
];

export async function seedDefaultStoreRewardsProgramIfEmpty(options = {}) {
  const databaseInstance = options.databaseInstance || database;
  const [settingsSnapshot, rewardsSnapshot] = await Promise.all([
    get(ref(databaseInstance, STORE_REWARD_SETTINGS_PATH)),
    get(ref(databaseInstance, STORE_REWARDS_PATH)),
  ]);

  let seededSettings = false;
  let seededRewards = false;

  if (!settingsSnapshot.exists()) {
    await saveStoreRewardSettings(DEFAULT_STORE_REWARD_SETTINGS, { databaseInstance });
    seededSettings = true;
  }

  if (!rewardsSnapshot.exists()) {
    const now = Date.now();
    const updates = {};
    buildDefaultStoreRewardsSeed().forEach((reward) => {
      const normalized = normalizeStoreReward(reward);
      updates[getStoreRewardKey(normalized.id)] = {
        ...normalized,
        createdAt: now,
        updatedAt: now,
      };
    });

    await set(ref(databaseInstance, STORE_REWARDS_PATH), updates);
    seededRewards = true;
  }

  return {
    seededSettings,
    seededRewards,
  };
}
