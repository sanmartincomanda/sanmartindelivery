import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { get, ref, update } from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
  getAuthenticatedFirebaseStorage,
} from './firebaseScriptAuth.mjs';

const POPUP_ID = 'combos_caseros_aug_2026';
const POPUP_STORAGE_PATH = 'store/promotions/popup_combos_caseros_aug_2026/combos-caseros-2026-08.jpg';

const getArgument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
};

const getContentType = (filePath) => {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
};

const main = async () => {
  const imageArgument = getArgument('--image');
  const imagePath = resolve(imageArgument || '');

  if (!imageArgument || !existsSync(imagePath)) {
    throw new Error('Indica una imagen valida con --image <ruta>.');
  }

  await ensureAuthenticatedFirebaseSession();

  const database = getAuthenticatedFirebaseDatabase();
  const storage = getAuthenticatedFirebaseStorage();
  const imageBytes = readFileSync(imagePath);
  const imageRef = storageRef(storage, POPUP_STORAGE_PATH);

  await uploadBytes(imageRef, imageBytes, {
    contentType: getContentType(imagePath),
    cacheControl: 'public,max-age=31536000,immutable',
  });
  const imageUrl = await getDownloadURL(imageRef);

  const popupAdsSnapshot = await get(ref(database, 'storePopupAds'));
  const popupAds = popupAdsSnapshot.val() || {};
  const updates = {};

  Object.entries(popupAds).forEach(([key, popupAd]) => {
    if (key !== POPUP_ID && popupAd?.active !== false) {
      updates[`storePopupAds/${key}/active`] = false;
    }
  });

  updates[`storePopupAds/${POPUP_ID}`] = {
    id: POPUP_ID,
    title: 'Combos Caseros listos para cocinar',
    image: imageUrl,
    imageStoragePath: POPUP_STORAGE_PATH,
    active: true,
    deleted: false,
    sortOrder: 1,
    maxViewsPerUser: 2,
    startsAt: '',
    endsAt: '',
    ctaLabel: 'Comprar Combos',
    targetCategory: 'promociones',
    targetSubcategory: 'Combos',
  };

  await update(ref(database), updates);

  console.log(
    JSON.stringify(
      {
        ok: true,
        popupId: POPUP_ID,
        image: imageUrl,
        ctaLabel: 'Comprar Combos',
        target: 'Promociones > Combos',
      },
      null,
      2
    )
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`No se pudo publicar el popup: ${error.message}`);
    process.exit(1);
  });
