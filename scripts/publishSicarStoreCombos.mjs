import { get, ref, update } from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const SICAR_BRIDGE_URL = String(
  process.env.SICAR_BRIDGE_URL || 'http://127.0.0.1:3077'
).replace(/\/$/, '');
const COMBO_IMAGE = '/tienda/categorias/combos-stock-v3.webp';
const COMBO_CATEGORY_ID = 'promociones';
const COMBO_CATEGORY_LABEL = 'Promociones';
const COMBO_SUBCATEGORY = 'Combos';

const COMBOS = {
  CASERO2: {
    name: 'PAQUETE CASERO 2 - FAJITAS + CUBOS DE RES',
    description: 'Paquete con fajitas y cubos de res.',
  },
  CASERO3: {
    name: 'PAQUETE CASERO 3 - CUBOS + FAJITAS + SALPICON',
    description: 'Paquete con cubos de res, fajitas y salpicon.',
  },
  CASERO4: {
    name: 'PAQUETE CASERO 4 - CUBOS + FAJITA + BIRRIA + SALPICON',
    description: 'Paquete con cubos de res, fajita, birria y salpicon.',
  },
};

const roundPrice = (value) => Number(Number(value || 0).toFixed(2));

const getSicarProducts = async () => {
  const response = await fetch(`${SICAR_BRIDGE_URL}/api/sicar/prices`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ codes: Object.keys(COMBOS) }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.products)) {
    throw new Error(payload?.error || `SICAR respondio HTTP ${response.status}.`);
  }

  const productsByCode = new Map(
    payload.products.map((product) => [String(product?.code || '').trim(), product])
  );
  const missingCodes = Object.keys(COMBOS).filter((code) => !productsByCode.has(code));

  if (missingCodes.length > 0) {
    throw new Error(`SICAR no devolvio: ${missingCodes.join(', ')}.`);
  }

  return Object.keys(COMBOS).map((code) => productsByCode.get(code));
};

const buildProduct = ({ definition, existing = {}, sicarProduct, nowIso }) => {
  const existingSync = existing.sync || {};
  const price = roundPrice(sicarProduct.price);

  if (price <= 0) {
    throw new Error(`El precio SICAR de ${sicarProduct.code} no es valido.`);
  }

  return {
    ...existing,
    active: true,
    category: COMBO_CATEGORY_ID,
    categoryLabel: COMBO_CATEGORY_LABEL,
    code: sicarProduct.code,
    description: String(existing.description || definition.description).trim(),
    image: String(existing.image || COMBO_IMAGE).trim(),
    imageStoragePath: String(existing.imageStoragePath || '').trim(),
    minQuantity: 1,
    name: String(existing.name || definition.name).trim(),
    price,
    promo: false,
    quantityStep: 1,
    subcategory: COMBO_SUBCATEGORY,
    unit: 'unidad',
    sync: {
      ...existingSync,
      source: 'sicar',
      managedAt: String(existingSync.managedAt || nowIso).trim(),
      syncedAt: nowIso,
      sicarArtId: Number(sicarProduct?.sicar?.artId || 0),
      sicarDepartment: String(sicarProduct?.sicar?.department || '').trim(),
      sicarCategory: String(sicarProduct?.sicar?.category || '').trim(),
      sicarName: String(sicarProduct.name || '').trim(),
      sicarPrice: price,
      sicarImage: null,
      sicarImageUrl: String(existingSync.sicarImageUrl || '').trim(),
      sicarImageHash: String(existingSync.sicarImageHash || '').trim(),
      taxRatePct: Number(sicarProduct?.sicar?.taxRatePct || 0),
      basePrice: roundPrice(sicarProduct?.sicar?.basePrice || price),
      overrides: {
        name: true,
        price: false,
        image: true,
      },
    },
  };
};

const main = async () => {
  const sicarProducts = await getSicarProducts();
  await ensureAuthenticatedFirebaseSession();

  const database = getAuthenticatedFirebaseDatabase();
  const [catalogSnapshot, categorySnapshot] = await Promise.all([
    get(ref(database, 'storeCatalog')),
    get(ref(database, `storeCategories/${COMBO_CATEGORY_ID}`)),
  ]);
  const currentCatalog = catalogSnapshot.val() || {};
  const currentCategory = categorySnapshot.val() || {};
  const now = new Date();
  const nowIso = now.toISOString();
  const updates = {};

  sicarProducts.forEach((sicarProduct) => {
    const code = String(sicarProduct.code || '').trim();
    updates[`storeCatalog/${code}`] = buildProduct({
      definition: COMBOS[code],
      existing: currentCatalog[code] || {},
      sicarProduct,
      nowIso,
    });
  });

  const currentSubcategories = Array.isArray(currentCategory.subcategories)
    ? currentCategory.subcategories
    : [];
  updates[`storeCategories/${COMBO_CATEGORY_ID}`] = {
    ...currentCategory,
    active: true,
    id: COMBO_CATEGORY_ID,
    label: COMBO_CATEGORY_LABEL,
    sortOrder: Number(currentCategory.sortOrder ?? 60),
    subcategories: Array.from(new Set([...currentSubcategories, COMBO_SUBCATEGORY])),
  };
  updates['storeCatalogMeta/updatedAt'] = now.getTime();
  updates['storeCatalogMeta/updatedAtIso'] = nowIso;

  await update(ref(database), updates);

  console.log(
    JSON.stringify(
      {
        ok: true,
        category: COMBO_SUBCATEGORY,
        products: sicarProducts.map((product) => ({
          code: product.code,
          name: COMBOS[product.code].name,
          price: roundPrice(product.price),
        })),
      },
      null,
      2
    )
  );
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`No se pudieron publicar los combos: ${error.message}`);
    process.exit(1);
  });
