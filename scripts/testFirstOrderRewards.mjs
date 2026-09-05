import assert from 'node:assert/strict';
import {
  buildDefaultFirstOrderRewardConfig,
  buildIncentiveProgress,
  getAvailableIncentiveItems,
  normalizeFirstOrderRewardSnapshot,
  normalizeIncentiveItem,
  resolveIncentiveTier,
} from '../src/services/storeIncentiveCore.js';

const defaults = buildDefaultFirstOrderRewardConfig(Date.parse('2026-09-04T12:00:00Z'));
const campaignId = Object.keys(defaults.campaigns)[0];
const tiers = Object.values(defaults.tiers[campaignId]);

assert.equal(resolveIncentiveTier(tiers, 499.99), null);
assert.equal(resolveIncentiveTier(tiers, 500)?.id, 'welcome_500');
assert.equal(resolveIncentiveTier(tiers, 999.99)?.id, 'welcome_500');
assert.equal(resolveIncentiveTier(tiers, 1000)?.id, 'welcome_1000');
assert.equal(resolveIncentiveTier(tiers, 1499.99)?.id, 'welcome_1000');
assert.equal(resolveIncentiveTier(tiers, 1500)?.id, 'welcome_premium');
assert.equal(resolveIncentiveTier(tiers, 2500)?.id, 'welcome_premium');

const progress = buildIncentiveProgress(tiers, 865);
assert.equal(progress.currentTier?.id, 'welcome_500');
assert.equal(progress.nextTier?.id, 'welcome_1000');
assert.equal(progress.missingAmount, 135);

const availableItem = normalizeIncentiveItem({
  campaignId,
  tierId: 'welcome_500',
  name: 'Producto de prueba',
  sku: 'SKU-001',
  stockAvailable: 2,
  branchIds: ['granada'],
});
assert.equal(availableItem.id, 'sku_001');
assert.equal(
  getAvailableIncentiveItems([availableItem], 'welcome_500', { branchId: 'granada' }).length,
  1
);
assert.equal(
  getAvailableIncentiveItems([availableItem], 'welcome_500', { branchId: 'masaya' }).length,
  0
);
assert.equal(
  getAvailableIncentiveItems([{ ...availableItem, stockAvailable: 0 }], 'welcome_500', { branchId: 'granada' }).length,
  0
);

const rewardSnapshot = normalizeFirstOrderRewardSnapshot({
  reservationId: 'fir_test',
  campaignId,
  tierId: 'welcome_500',
  itemId: availableItem.id,
  itemName: availableItem.name,
  sku: availableItem.sku,
  eligibleSubtotal: 500,
  branchId: 'granada',
});
assert.equal(rewardSnapshot?.subtotal, 0);
assert.equal(rewardSnapshot?.quantity, 1);
assert.equal(rewardSnapshot?.eligibleSubtotal, 500);

const legacyReservationSnapshot = normalizeFirstOrderRewardSnapshot({
  ...rewardSnapshot,
  reservationId: undefined,
  id: 'fir_legacy_reservation',
});
assert.equal(legacyReservationSnapshot?.reservationId, 'fir_legacy_reservation');

console.log('Regalo de primera compra: limites, progreso, stock y snapshot correctos.');
