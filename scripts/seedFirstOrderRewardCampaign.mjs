import { get, ref, update } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';
import {
  FIRST_ORDER_REWARD_CAMPAIGN_ID,
  buildDefaultFirstOrderRewardConfig,
} from '../src/services/storeIncentiveCore.js';

await ensureAuthenticatedFirebaseSession();
const database = getAuthenticatedFirebaseDatabase();
const campaignRef = ref(
  database,
  `storeIncentives/config/campaigns/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`
);
const snapshot = await get(campaignRef);

if (snapshot.exists()) {
  console.log('La campaña de regalo de primera compra ya existe.');
  process.exit(0);
}

const defaults = buildDefaultFirstOrderRewardConfig();
await update(ref(database, 'storeIncentives/config'), {
  [`campaigns/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: defaults.campaigns[FIRST_ORDER_REWARD_CAMPAIGN_ID],
  [`tiers/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: defaults.tiers[FIRST_ORDER_REWARD_CAMPAIGN_ID],
  [`items/${FIRST_ORDER_REWARD_CAMPAIGN_ID}`]: {},
});

console.log('Campaña inicial creada en estado pausado, lista para cargar regalías y activar.');
