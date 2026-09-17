import assert from 'node:assert/strict';
import { isStoreRewardCreditReadyOrder } from '../src/services/storeRewards.js';
import { hasPendingStoreRewardSettlement } from '../src/services/orderArchive.js';

assert.equal(isStoreRewardCreditReadyOrder({ estado: 'Enviado', fecha: '2026-09-16' }), true);
assert.equal(isStoreRewardCreditReadyOrder({ estado: 'Enviado', fecha: '2026-09-15' }), false);
assert.equal(isStoreRewardCreditReadyOrder({ estado: 'Entregado', fecha: '2026-09-15' }), true);
assert.equal(isStoreRewardCreditReadyOrder({ estado: 'Preparado', fecha: '2026-09-16' }), false);
assert.equal(isStoreRewardCreditReadyOrder({ estado: 'Cancelado', fecha: '2026-09-16' }), false);

const pendingSentOrder = {
  canal: 'tienda_virtual',
  storeUserKey: 'customer-1',
  estado: 'Enviado',
  fecha: '2026-09-16',
  rewardPoints: { status: 'pending', estimatedPoints: 10 },
};

assert.equal(hasPendingStoreRewardSettlement(pendingSentOrder), true);
assert.equal(
  hasPendingStoreRewardSettlement({
    ...pendingSentOrder,
    rewardPoints: { status: 'awarded', awarded: true, points: 10 },
  }),
  false
);
assert.equal(hasPendingStoreRewardSettlement({ ...pendingSentOrder, canal: 'manual' }), false);

console.log('Store reward status tests passed.');
