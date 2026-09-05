import { get, onValue, ref, runTransaction, set, update } from 'firebase/database';
import { auth, database } from '../firebase';
import { isDataUrlImage, uploadPromotionImage } from './storeMedia';
import {
  FIRST_ORDER_REWARD_CAMPAIGN_ID,
  FIRST_ORDER_REWARD_CAMPAIGN_TYPE,
  STORE_INCENTIVES_ROOT,
  buildDefaultFirstOrderRewardConfig,
  campaignAppliesToBranch,
  isIncentiveCampaignActive,
  normalizeIncentiveCampaign,
  normalizeIncentiveItem,
  normalizeIncentiveTier,
  sanitizeIncentiveId,
} from './storeIncentiveCore';

export const STORE_INCENTIVE_CONFIG_PATH = `${STORE_INCENTIVES_ROOT}/config`;
export const STORE_INCENTIVE_RESERVATIONS_PATH = `${STORE_INCENTIVES_ROOT}/reservations`;

const INCENTIVE_FUNCTION_ORIGIN = String(
  import.meta.env.VITE_INCENTIVES_API_ORIGIN || 'https://tienda.sanmartinsr.com'
).replace(/\/$/, '');

const sortByDisplayOrder = (left, right) =>
  Number(left.displayOrder || 0) - Number(right.displayOrder || 0) ||
  String(left.name || left.internalName || '').localeCompare(
    String(right.name || right.internalName || '')
  );

export const normalizeStoreIncentiveConfig = (value = {}) => {
  const campaigns = Object.values(value?.campaigns || {})
    .map((campaign) => normalizeIncentiveCampaign(campaign))
    .filter((campaign) => campaign.id && campaign.deleted !== true)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  const tiers = [];
  const items = [];

  Object.entries(value?.tiers || {}).forEach(([campaignId, campaignTiers]) => {
    Object.values(campaignTiers || {}).forEach((tier, index) => {
      const normalized = normalizeIncentiveTier(
        { ...tier, campaignId: tier?.campaignId || campaignId },
        {},
        index
      );
      if (normalized.id) {
        tiers.push(normalized);
      }
    });
  });

  Object.entries(value?.items || {}).forEach(([campaignId, campaignItems]) => {
    Object.entries(campaignItems || {}).forEach(([tierId, tierItems]) => {
      Object.values(tierItems || {}).forEach((item, index) => {
        const normalized = normalizeIncentiveItem(
          {
            ...item,
            campaignId: item?.campaignId || campaignId,
            tierId: item?.tierId || tierId,
          },
          {},
          index
        );
        if (normalized.id) {
          items.push(normalized);
        }
      });
    });
  });

  return {
    campaigns,
    tiers: tiers.sort(sortByDisplayOrder),
    items: items.sort(sortByDisplayOrder),
  };
};

export const getFirstOrderRewardCampaign = (config = {}, branchId = '', now = Date.now()) =>
  (Array.isArray(config?.campaigns) ? config.campaigns : []).find(
    (campaign) =>
      campaign.type === FIRST_ORDER_REWARD_CAMPAIGN_TYPE &&
      isIncentiveCampaignActive(campaign, now) &&
      campaignAppliesToBranch(campaign, branchId)
  ) || null;

export const getCampaignTiers = (config = {}, campaignId = '') =>
  (Array.isArray(config?.tiers) ? config.tiers : [])
    .filter((tier) => tier.campaignId === sanitizeIncentiveId(campaignId))
    .sort(sortByDisplayOrder);

export const getCampaignItems = (config = {}, campaignId = '') =>
  (Array.isArray(config?.items) ? config.items : [])
    .filter((item) => item.campaignId === sanitizeIncentiveId(campaignId))
    .sort(sortByDisplayOrder);

export const subscribeStoreIncentiveConfig = (onData, onError) =>
  onValue(
    ref(database, STORE_INCENTIVE_CONFIG_PATH),
    (snapshot) => onData(normalizeStoreIncentiveConfig(snapshot.val() || {})),
    onError
  );

export const subscribeStoreIncentiveReservations = (onData, onError) =>
  onValue(
    ref(database, STORE_INCENTIVE_RESERVATIONS_PATH),
    (snapshot) => {
      const reservations = Object.entries(snapshot.val() || {})
        .map(([id, reservation]) => ({ id, ...(reservation || {}) }))
        .sort((left, right) => Number(right.reservedAt || 0) - Number(left.reservedAt || 0));
      onData(reservations);
    },
    onError
  );

export async function seedDefaultFirstOrderRewardCampaignIfEmpty() {
  const campaignRef = ref(
    database,
    `${STORE_INCENTIVE_CONFIG_PATH}/campaigns/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`
  );
  const snapshot = await get(campaignRef);
  if (snapshot.exists()) {
    return false;
  }

  const defaults = buildDefaultFirstOrderRewardConfig();
  const campaign = defaults.campaigns[FIRST_ORDER_REWARD_CAMPAIGN_ID];
  const tiers = defaults.tiers[FIRST_ORDER_REWARD_CAMPAIGN_ID];
  await update(ref(database, STORE_INCENTIVE_CONFIG_PATH), {
    [`campaigns/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: campaign,
    [`tiers/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: tiers,
    [`items/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: {},
  });
  return true;
}

export async function saveStoreIncentiveCampaign(campaign, existingCampaign = null) {
  const now = Date.now();
  const normalized = normalizeIncentiveCampaign(campaign, existingCampaign || {});
  if (!normalized.id || !normalized.name) {
    throw new Error('La campana necesita un nombre.');
  }
  const nextCampaign = {
    ...normalized,
    createdAt: normalized.createdAt || now,
    updatedAt: now,
  };
  await set(
    ref(database, `${STORE_INCENTIVE_CONFIG_PATH}/campaigns/${normalized.id}`),
    nextCampaign
  );
  return nextCampaign;
}

export async function saveStoreIncentiveTier(tier, existingTier = null) {
  const now = Date.now();
  const normalized = normalizeIncentiveTier(tier, existingTier || {});
  if (!normalized.campaignId || !normalized.id || !normalized.internalName) {
    throw new Error('El intervalo necesita nombre y campana.');
  }
  if (normalized.maxAmount > 0 && normalized.maxAmount < normalized.minAmount) {
    throw new Error('El monto maximo debe ser mayor al minimo.');
  }
  const nextTier = {
    ...normalized,
    createdAt: normalized.createdAt || now,
    updatedAt: now,
  };
  await set(
    ref(
      database,
      `${STORE_INCENTIVE_CONFIG_PATH}/tiers/${normalized.campaignId}/${normalized.id}`
    ),
    nextTier
  );
  return nextTier;
}

export async function saveStoreIncentiveItem(item, existingItem = null) {
  const now = Date.now();
  const normalized = normalizeIncentiveItem(item, existingItem || {});
  if (!normalized.campaignId || !normalized.tierId || !normalized.id || !normalized.name || !normalized.sku) {
    throw new Error('La regalia necesita nombre, SKU, campana e intervalo.');
  }

  let nextItem = {
    ...normalized,
    createdAt: normalized.createdAt || now,
    updatedAt: now,
  };

  if (isDataUrlImage(normalized.image)) {
    const uploadedImage = await uploadPromotionImage({
      id: `incentive_${normalized.campaignId}_${normalized.id}`,
      image: normalized.image,
    });
    nextItem = {
      ...nextItem,
      image: uploadedImage.url,
      imageStoragePath: uploadedImage.path || '',
    };
  }

  const itemRef = ref(
    database,
    `${STORE_INCENTIVE_CONFIG_PATH}/items/${normalized.campaignId}/${normalized.tierId}/${normalized.id}`
  );
  const result = await runTransaction(itemRef, (currentItem) => {
    if (
      currentItem &&
      existingItem &&
      Number(currentItem.updatedAt || 0) > Number(existingItem.updatedAt || 0)
    ) {
      return;
    }
    return {
      ...nextItem,
      stockReserved: Math.max(
        0,
        Number(currentItem?.stockReserved ?? nextItem.stockReserved ?? 0)
      ),
      updatedAt: Date.now(),
    };
  }, { applyLocally: false });
  if (!result.committed) {
    throw new Error('El inventario cambió mientras editabas. Revisá el stock actualizado e intentá nuevamente.');
  }
  return normalizeIncentiveItem(result.snapshot.val());
}

export async function updateStoreIncentiveItem(item, patch = {}) {
  const campaignId = sanitizeIncentiveId(item?.campaignId);
  const tierId = sanitizeIncentiveId(item?.tierId);
  const itemId = sanitizeIncentiveId(item?.id);
  if (!campaignId || !tierId || !itemId) {
    throw new Error('Regalia invalida.');
  }
  await update(
    ref(database, `${STORE_INCENTIVE_CONFIG_PATH}/items/${campaignId}/${tierId}/${itemId}`),
    { ...patch, updatedAt: Date.now() }
  );
}

export async function deleteStoreIncentiveItem(item) {
  const campaignId = sanitizeIncentiveId(item?.campaignId);
  const tierId = sanitizeIncentiveId(item?.tierId);
  const itemId = sanitizeIncentiveId(item?.id);
  if (!campaignId || !tierId || !itemId) {
    throw new Error('Regalia invalida.');
  }
  await set(
    ref(database, `${STORE_INCENTIVE_CONFIG_PATH}/items/${campaignId}/${tierId}/${itemId}`),
    null
  );
}

const requestFirstOrderRewardAction = async (action, payload = {}) => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Inicia sesion para elegir tu regalo.');
  }
  const idToken = await user.getIdToken();
  const response = await fetch(
    `${INCENTIVE_FUNCTION_ORIGIN}/.netlify/functions/first-order-reward`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action, ...payload }),
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error || 'No pudimos procesar la regalia.');
    error.code = data?.code || `INCENTIVE_HTTP_${response.status}`;
    throw error;
  }
  return data;
};

export const checkFirstOrderRewardEligibility = (payload = {}) =>
  requestFirstOrderRewardAction('eligibility', payload);

export const reserveFirstOrderReward = (payload = {}) =>
  requestFirstOrderRewardAction('reserve', payload);

export const confirmFirstOrderReward = (payload = {}) =>
  requestFirstOrderRewardAction('confirm', payload);

export const releaseFirstOrderReward = (payload = {}) =>
  requestFirstOrderRewardAction('release', payload);

export const reconcileFirstOrderRewards = () =>
  requestFirstOrderRewardAction('reconcile');
