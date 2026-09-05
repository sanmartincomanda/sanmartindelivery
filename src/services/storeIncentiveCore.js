export const STORE_INCENTIVES_ROOT = 'storeIncentives';
export const FIRST_ORDER_REWARD_CAMPAIGN_ID = 'welcome_app_first_order_2026';
export const FIRST_ORDER_REWARD_CAMPAIGN_TYPE = 'first_purchase';

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

export const sanitizeIncentiveId = (value = '') =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export const normalizeIncentiveDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const parsed = value instanceof Date ? value : new Date(String(value).trim());
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

export const normalizeIncentiveBranches = (value) => {
  const source = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).filter(([, enabled]) => enabled !== false).map(([key]) => key)
      : String(value || '').split(',');

  return Array.from(
    new Set(source.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))
  );
};

export const normalizeIncentiveCampaign = (value = {}, fallback = {}) => {
  const source = value || {};
  const backup = fallback || {};
  const name = String(source.name ?? backup.name ?? '').trim();
  const id = sanitizeIncentiveId(source.id || backup.id || name);

  return {
    id,
    name: name || id,
    internalName: String(source.internalName ?? backup.internalName ?? name ?? '').trim(),
    type: String(
      source.type ?? backup.type ?? FIRST_ORDER_REWARD_CAMPAIGN_TYPE
    ).trim().toLowerCase(),
    active: source.active ?? backup.active ?? false,
    deleted: source.deleted ?? backup.deleted ?? false,
    startsAt: normalizeIncentiveDate(source.startsAt ?? backup.startsAt),
    endsAt: normalizeIncentiveDate(source.endsAt ?? backup.endsAt),
    branchIds: normalizeIncentiveBranches(source.branchIds ?? backup.branchIds),
    maxRewardsPerOrder: Math.max(1, Math.trunc(Number(source.maxRewardsPerOrder ?? backup.maxRewardsPerOrder ?? 1))),
    createdAt: Math.max(0, Number(source.createdAt ?? backup.createdAt ?? 0)),
    updatedAt: Math.max(0, Number(source.updatedAt ?? backup.updatedAt ?? 0)),
  };
};

export const normalizeIncentiveTier = (value = {}, fallback = {}, index = 0) => {
  const source = value || {};
  const backup = fallback || {};
  const internalName = String(source.internalName ?? backup.internalName ?? '').trim();
  const id = sanitizeIncentiveId(source.id || backup.id || internalName);
  const minAmount = Math.max(0, roundMoney(source.minAmount ?? backup.minAmount ?? 0));
  const rawMaximum = source.maxAmount ?? backup.maxAmount;
  const maxAmount = rawMaximum === '' || rawMaximum === null || rawMaximum === undefined
    ? 0
    : Math.max(0, roundMoney(rawMaximum));

  return {
    id,
    campaignId: sanitizeIncentiveId(source.campaignId ?? backup.campaignId),
    internalName: internalName || id,
    minAmount,
    maxAmount,
    premium: source.premium ?? backup.premium ?? false,
    active: source.active ?? backup.active ?? true,
    displayOrder: Number(source.displayOrder ?? backup.displayOrder ?? (index + 1) * 10),
    createdAt: Math.max(0, Number(source.createdAt ?? backup.createdAt ?? 0)),
    updatedAt: Math.max(0, Number(source.updatedAt ?? backup.updatedAt ?? 0)),
  };
};

export const normalizeIncentiveItem = (value = {}, fallback = {}, index = 0) => {
  const source = value || {};
  const backup = fallback || {};
  const name = String(source.name ?? backup.name ?? '').trim();
  const sku = String(source.sku ?? backup.sku ?? '').trim();
  const id = sanitizeIncentiveId(source.id || backup.id || sku || name);

  return {
    id,
    campaignId: sanitizeIncentiveId(source.campaignId ?? backup.campaignId),
    tierId: sanitizeIncentiveId(source.tierId ?? backup.tierId),
    name: name || id,
    description: String(source.description ?? backup.description ?? '').trim(),
    sku,
    provider: String(source.provider ?? backup.provider ?? '').trim(),
    image: String(source.image ?? backup.image ?? '').trim(),
    imageStoragePath: String(source.imageStoragePath ?? backup.imageStoragePath ?? '').trim(),
    stockAvailable: Math.max(0, Math.trunc(Number(source.stockAvailable ?? backup.stockAvailable ?? 0))),
    stockReserved: Math.max(0, Math.trunc(Number(source.stockReserved ?? backup.stockReserved ?? 0))),
    unitCost: Math.max(0, roundMoney(source.unitCost ?? backup.unitCost ?? 0)),
    active: source.active ?? backup.active ?? true,
    branchIds: normalizeIncentiveBranches(source.branchIds ?? backup.branchIds),
    displayOrder: Number(source.displayOrder ?? backup.displayOrder ?? (index + 1) * 10),
    startsAt: normalizeIncentiveDate(source.startsAt ?? backup.startsAt),
    endsAt: normalizeIncentiveDate(source.endsAt ?? backup.endsAt),
    createdAt: Math.max(0, Number(source.createdAt ?? backup.createdAt ?? 0)),
    updatedAt: Math.max(0, Number(source.updatedAt ?? backup.updatedAt ?? 0)),
  };
};

export const isIncentiveCampaignActive = (campaign = {}, now = Date.now()) => {
  const normalized = normalizeIncentiveCampaign(campaign);
  const currentTime = Number(now || Date.now());
  const startsAt = normalized.startsAt ? Date.parse(normalized.startsAt) : 0;
  const endsAt = normalized.endsAt ? Date.parse(normalized.endsAt) : 0;

  return Boolean(
    normalized.id &&
      normalized.active !== false &&
      normalized.deleted !== true &&
      (!startsAt || currentTime >= startsAt) &&
      (!endsAt || currentTime < endsAt)
  );
};

export const campaignAppliesToBranch = (campaign = {}, branchId = '') => {
  const branches = normalizeIncentiveBranches(campaign.branchIds);
  const cleanBranchId = String(branchId || '').trim().toLowerCase();
  return branches.length === 0 || branches.includes(cleanBranchId);
};

export const resolveIncentiveTier = (tiers = [], amount = 0) => {
  const eligibleAmount = Math.max(0, roundMoney(amount));
  return [...(Array.isArray(tiers) ? tiers : [])]
    .map((tier, index) => normalizeIncentiveTier(tier, {}, index))
    .filter((tier) => tier.id && tier.active !== false)
    .sort((left, right) => left.minAmount - right.minAmount || left.displayOrder - right.displayOrder)
    .find(
      (tier) =>
        eligibleAmount >= tier.minAmount &&
        (tier.maxAmount <= 0 || eligibleAmount <= tier.maxAmount)
    ) || null;
};

export const resolveNextIncentiveTier = (tiers = [], amount = 0) => {
  const eligibleAmount = Math.max(0, roundMoney(amount));
  return [...(Array.isArray(tiers) ? tiers : [])]
    .map((tier, index) => normalizeIncentiveTier(tier, {}, index))
    .filter((tier) => tier.id && tier.active !== false && tier.minAmount > eligibleAmount)
    .sort((left, right) => left.minAmount - right.minAmount || left.displayOrder - right.displayOrder)[0] || null;
};

export const isIncentiveItemAvailable = (item = {}, options = {}) => {
  const normalized = normalizeIncentiveItem(item);
  const now = Number(options.now || Date.now());
  const startsAt = normalized.startsAt ? Date.parse(normalized.startsAt) : 0;
  const endsAt = normalized.endsAt ? Date.parse(normalized.endsAt) : 0;
  const branchId = String(options.branchId || '').trim().toLowerCase();
  const appliesToBranch =
    normalized.branchIds.length === 0 || !branchId || normalized.branchIds.includes(branchId);

  return Boolean(
    normalized.id &&
      normalized.sku &&
      normalized.active !== false &&
      normalized.stockAvailable > 0 &&
      appliesToBranch &&
      (!startsAt || now >= startsAt) &&
      (!endsAt || now < endsAt)
  );
};

export const getAvailableIncentiveItems = (items = [], tierId = '', options = {}) =>
  (Array.isArray(items) ? items : [])
    .map((item, index) => normalizeIncentiveItem(item, {}, index))
    .filter(
      (item) =>
        item.tierId === sanitizeIncentiveId(tierId) &&
        isIncentiveItemAvailable(item, options)
    )
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder || left.name.localeCompare(right.name)
    );

export const buildIncentiveProgress = (tiers = [], amount = 0) => {
  const eligibleAmount = Math.max(0, roundMoney(amount));
  const currentTier = resolveIncentiveTier(tiers, eligibleAmount);
  const nextTier = resolveNextIncentiveTier(tiers, eligibleAmount);
  const orderedTiers = [...(Array.isArray(tiers) ? tiers : [])]
    .map((tier, index) => normalizeIncentiveTier(tier, {}, index))
    .filter((tier) => tier.id && tier.active !== false)
    .sort((left, right) => left.minAmount - right.minAmount);
  const firstTier = orderedTiers[0] || null;
  const targetTier = currentTier ? nextTier : firstTier;
  const targetAmount = Number(targetTier?.minAmount || currentTier?.minAmount || 0);
  const baseAmount = Number(currentTier?.minAmount || 0);
  const range = Math.max(1, targetAmount - baseAmount || targetAmount || 1);
  const progress = currentTier && !nextTier
    ? 100
    : Math.min(100, Math.max(0, ((eligibleAmount - baseAmount) / range) * 100));

  return {
    amount: eligibleAmount,
    currentTier,
    nextTier,
    targetTier,
    targetAmount,
    missingAmount: Math.max(0, roundMoney(targetAmount - eligibleAmount)),
    progress: Number(progress.toFixed(2)),
    unlocked: Boolean(currentTier),
    premium: Boolean(currentTier?.premium),
  };
};

export const normalizeFirstOrderRewardSnapshot = (value = null) => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const reservationId = String(value.reservationId || value.id || '').trim();
  const campaignId = sanitizeIncentiveId(value.campaignId);
  const tierId = sanitizeIncentiveId(value.tierId);
  const itemId = sanitizeIncentiveId(value.itemId);
  const sku = String(value.sku || '').trim();
  const itemName = String(value.itemName || '').trim();

  if (!reservationId || !campaignId || !tierId || !itemId || !sku || !itemName) {
    return null;
  }

  return {
    reservationId,
    campaignId,
    campaignName: String(value.campaignName || '').trim(),
    tierId,
    tierName: String(value.tierName || '').trim(),
    itemId,
    itemName,
    sku,
    image: String(value.image || '').trim(),
    quantity: 1,
    unitPrice: 0,
    subtotal: 0,
    eligibleSubtotal: Math.max(0, roundMoney(value.eligibleSubtotal || 0)),
    branchId: String(value.branchId || '').trim().toLowerCase(),
    status: String(value.status || 'reserved').trim().toLowerCase(),
    reservedAt: Math.max(0, Number(value.reservedAt || 0)),
  };
};

export const buildFirstOrderRewardTextLines = (value = null) => {
  const reward = normalizeFirstOrderRewardSnapshot(value);
  if (!reward) {
    return [];
  }
  return [
    'REGALIA PRIMERA COMPRA (100% DESCUENTO)',
    `- 1 unidad ${reward.itemName} [${reward.sku}] | C$0.00`,
  ];
};

export const buildDefaultFirstOrderRewardConfig = (now = Date.now()) => {
  const campaignId = FIRST_ORDER_REWARD_CAMPAIGN_ID;
  const createdAt = Number(now || Date.now());
  const tiers = [
    {
      id: 'welcome_500',
      campaignId,
      internalName: 'Nivel 1',
      minAmount: 500,
      maxAmount: 999.99,
      premium: false,
      active: true,
      displayOrder: 10,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'welcome_1000',
      campaignId,
      internalName: 'Nivel 2',
      minAmount: 1000,
      maxAmount: 1499.99,
      premium: false,
      active: true,
      displayOrder: 20,
      createdAt,
      updatedAt: createdAt,
    },
    {
      id: 'welcome_premium',
      campaignId,
      internalName: 'Premium',
      minAmount: 1500,
      maxAmount: 0,
      premium: true,
      active: true,
      displayOrder: 30,
      createdAt,
      updatedAt: createdAt,
    },
  ];

  return {
    campaigns: {
      [campaignId]: normalizeIncentiveCampaign({
        id: campaignId,
        name: 'Regalo de Bienvenida App San Martin',
        internalName: 'Regalo Primera Compra',
        type: FIRST_ORDER_REWARD_CAMPAIGN_TYPE,
        active: false,
        branchIds: ['granada', 'nindiri'],
        startsAt: new Date(createdAt).toISOString(),
        endsAt: '',
        maxRewardsPerOrder: 1,
        createdAt,
        updatedAt: createdAt,
      }),
    },
    tiers: {
      [campaignId]: Object.fromEntries(tiers.map((tier) => [tier.id, normalizeIncentiveTier(tier)])),
    },
    items: {
      [campaignId]: {},
    },
  };
};
