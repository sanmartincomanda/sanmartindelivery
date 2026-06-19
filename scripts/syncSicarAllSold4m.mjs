import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getDatabase, get, ref, update } from 'firebase/database';
import { getDownloadURL, getStorage, ref as storageRef, uploadString } from 'firebase/storage';
import { getSicarDepartmentConfig, SICAR_SPECIAL_SKU_OVERRIDES, SICAR_SYNC_DEPARTMENTS } from '../src/data/sicarCatalogRules.js';
import { normalizeStoreSubcategory, normalizeSubcategoryKey } from '../src/data/storeSubcategoryRules.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA6LKWFpuIUH4g6owCzIbMbqOzNwV_UIro',
  authDomain: 'comanda-digital-ac1ec.firebaseapp.com',
  databaseURL: 'https://comanda-digital-ac1ec-default-rtdb.firebaseio.com',
  projectId: 'comanda-digital-ac1ec',
  storageBucket: 'comanda-digital-ac1ec.firebasestorage.app',
  messagingSenderId: '41323183250',
  appId: '1:41323183250:web:aa1d7ea9cbbc353a917a4b',
};

const STORE_CATALOG_PATH = 'storeCatalog';
const STORE_CATEGORIES_PATH = 'storeCategories';
const STORE_CATALOG_META_PATH = 'storeCatalogMeta';
const SICAR_SYNC_SOURCE = 'sicar';
const BATCH_SIZE = 25;
const IMAGE_UPLOAD_CONCURRENCY = 3;
const STORAGE_UPLOAD_TIMEOUT_MS = 20000;
const MONTHS_WINDOW = 4;
const cwd = process.cwd();
const localConfigPath = resolve(cwd, 'sicar.local.json');
const localConfig = existsSync(localConfigPath)
  ? JSON.parse(readFileSync(localConfigPath, 'utf8'))
  : {};

const sicarConfig = {
  host: process.env.SICAR_MYSQL_HOST || localConfig.host || '127.0.0.1',
  port: Number(process.env.SICAR_MYSQL_PORT || localConfig.port || 3307),
  database: process.env.SICAR_MYSQL_DATABASE || localConfig.database || 'sicar',
  user: process.env.SICAR_MYSQL_USER || localConfig.user || 'root',
  password: process.env.SICAR_MYSQL_PASSWORD || localConfig.password || '',
  mysqlExePath:
    process.env.SICAR_MYSQL_EXE_PATH ||
    localConfig.mysqlExePath ||
    'C:\\Program Files (x86)\\SICAR-S-131AB\\MySQL\\MySQL Server 5.6\\bin\\mysql.exe',
};

const FALLBACK_SUBCATEGORY_BY_CATEGORY = {
  res: 'Otros',
  pollo: 'Otros',
  cerdo: 'Otros',
  abarroteria: 'Z - Otros',
  congelados: 'Otros Congelados',
  refrigerados: 'Otros Refrigerados',
};

const DEFAULT_CATEGORY_SORT_ORDER = {
  res: 0,
  pollo: 10,
  cerdo: 20,
  abarroteria: 30,
  congelados: 40,
  refrigerados: 50,
};

const pad = (value) => String(value).padStart(2, '0');

const formatDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const formatStamp = (date) =>
  `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

const roundPrice = (value) => Number(Number(value || 0).toFixed(2));

const roundQuantityRule = (value) => Number(Number(value || 0).toFixed(3));

const sqlEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const getWindowDates = (monthsBack = MONTHS_WINDOW) => {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - monthsBack);
  const endExclusive = new Date(now);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    startDate: formatDate(start),
    endInclusiveDate: formatDate(now),
    endExclusiveDate: formatDate(endExclusive),
  };
};

const normalizeStoreUnit = (value = '') => {
  const unit = String(value || '').trim().toUpperCase();
  if (unit.includes('LB')) {
    return 'lb';
  }
  return 'unidad';
};

const getDefaultProductMinQuantity = (unit = 'lb') =>
  String(unit || '').trim().toLowerCase() === 'unidad' ? 1 : 0.5;

const getDefaultProductQuantityStep = (unit = 'lb') =>
  String(unit || '').trim().toLowerCase() === 'unidad' ? 1 : 0.5;

const normalizePositiveQuantityRule = (value, fallback) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return roundQuantityRule(numeric);
  }

  return roundQuantityRule(fallback);
};

const getCatalogProductKey = (code) => String(code || '').trim().replace(/[.#$/[\]]/g, '_');

const cleanCatalogCode = (code) =>
  String(code || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

const inferImageExtension = (dataUrl = '') => {
  const normalized = String(dataUrl || '').trim().toLowerCase();
  if (normalized.startsWith('data:image/png')) {
    return 'png';
  }
  if (normalized.startsWith('data:image/webp')) {
    return 'webp';
  }
  if (normalized.startsWith('data:image/gif')) {
    return 'gif';
  }
  return 'jpg';
};

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => rejectPromise(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolvePromise(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        rejectPromise(error);
      });
  });

const isPrintableCode = (value) => {
  const cleanValue = String(value || '').trim();
  return Boolean(cleanValue) && !cleanValue.includes('\uFFFD');
};

const getMimeTypeFromHex = (hex = '') => {
  const signature = String(hex || '').toUpperCase();
  if (signature.startsWith('89504E47')) {
    return 'image/png';
  }
  if (signature.startsWith('FFD8FF')) {
    return 'image/jpeg';
  }
  if (signature.startsWith('47494638')) {
    return 'image/gif';
  }
  if (signature.startsWith('52494646')) {
    return 'image/webp';
  }
  return 'application/octet-stream';
};

const app = initializeApp(FIREBASE_CONFIG);
const database = getDatabase(app);
const storage = getStorage(app);

const runMysqlQuery = (query) =>
  new Promise((resolvePromise, rejectPromise) => {
    if (!existsSync(sicarConfig.mysqlExePath)) {
      rejectPromise(new Error(`No se encontro mysql.exe en ${sicarConfig.mysqlExePath}`));
      return;
    }

    const args = [
      '-B',
      '-N',
      '--default-character-set=latin1',
      '-h',
      sicarConfig.host,
      '-P',
      String(sicarConfig.port),
      '-u',
      sicarConfig.user,
      `-p${sicarConfig.password}`,
      '-D',
      sicarConfig.database,
      '-e',
      query,
    ];

    const child = spawn(sicarConfig.mysqlExePath, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('latin1');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('latin1');
    });

    child.on('error', (error) => rejectPromise(error));

    child.on('close', (code) => {
      if (code !== 0) {
        rejectPromise(new Error(stderr || `mysql.exe finalizo con codigo ${code}`));
        return;
      }

      resolvePromise(
        stdout
          .split(/\r?\n/)
          .filter((line) => line.trim() && !line.startsWith('Warning:'))
      );
    });
  });

const getSoldRows = async ({ startDate, endExclusiveDate }) => {
  const departmentNames = SICAR_SYNC_DEPARTMENTS.map((entry) => `'${sqlEscape(entry.sicarDepartment)}'`).join(', ');
  const rows = await runMysqlQuery(`
    SELECT
      COALESCE(d.nombre, ''),
      COALESCE(c.nombre, ''),
      a.art_id,
      a.clave,
      a.descripcion,
      UPPER(TRIM(COALESCE(MAX(NULLIF(dv.unidad, '')), u.nombre, 'PZA'))),
      ROUND(SUM(dv.cantidad), 4),
      ROUND(SUM(dv.importeCon), 2),
      COUNT(DISTINCT dv.ven_id),
      ROUND(MAX(a.precio1), 6),
      ROUND(MAX(a.precio1) * (1 + COALESCE(MAX(tax.taxRatePct), 0) / 100), 6),
      COALESCE(MAX(tax.taxRatePct), 0),
      COALESCE(img.img_id, 0),
      COALESCE(i.md5, '')
    FROM detallev dv
    INNER JOIN venta v ON v.ven_id = dv.ven_id
    INNER JOIN articulo a ON a.art_id = dv.art_id
    LEFT JOIN categoria c ON c.cat_id = a.cat_id
    LEFT JOIN departamento d ON d.dep_id = c.dep_id
    LEFT JOIN unidad u ON u.uni_id = a.unidadVenta
    LEFT JOIN (
      SELECT
        art_id,
        COALESCE(MAX(CASE WHEN seleccionada = 1 THEN img_id ELSE NULL END), MIN(img_id)) AS img_id
      FROM articuloimagen
      GROUP BY art_id
    ) img ON img.art_id = a.art_id
    LEFT JOIN (
      SELECT
        ai.art_id,
        ROUND(
          SUM(
            CASE
              WHEN COALESCE(imp.status, 1) = 1
                AND COALESCE(imp.tras, 0) = 1
                AND UPPER(COALESCE(imp.tipoFactor, 'Tasa')) = 'TASA'
              THEN COALESCE(imp.impuesto, 0)
              ELSE 0
            END
          ),
          6
        ) AS taxRatePct
      FROM articuloimpuesto ai
      INNER JOIN impuesto imp ON imp.imp_id = ai.imp_id
      GROUP BY ai.art_id
    ) tax ON tax.art_id = a.art_id
    LEFT JOIN imagen i ON i.img_id = img.img_id
    WHERE v.fecha >= '${sqlEscape(startDate)}'
      AND v.fecha < '${sqlEscape(endExclusiveDate)}'
      AND v.status = 1
      AND a.status = 1
      AND a.servicio = 0
      AND d.nombre IN (${departmentNames})
    GROUP BY
      d.nombre,
      c.nombre,
      a.art_id,
      a.clave,
      a.descripcion,
      tax.taxRatePct,
      img.img_id,
      i.md5
    HAVING SUM(dv.cantidad) > 0
      AND MAX(a.precio1) > 0
    ORDER BY d.nombre, SUM(dv.cantidad) DESC, a.descripcion ASC;
  `);

  return rows
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 14)
    .map((parts) => ({
      sicarDepartment: String(parts[0] || '').trim(),
      sicarCategory: String(parts[1] || '').trim(),
      artId: Number(parts[2] || 0),
      code: String(parts[3] || '').trim(),
      name: String(parts[4] || '').trim(),
      unit: String(parts[5] || '').trim(),
      quantitySold: Number(parts[6] || 0),
      amountSold: Number(parts[7] || 0),
      tickets: Number(parts[8] || 0),
      basePrice: Number(parts[9] || 0),
      price: Number(parts[10] || 0),
      taxRatePct: Number(parts[11] || 0),
      imageId: Number(parts[12] || 0),
      imageHash: String(parts[13] || '').trim(),
    }))
    .filter((row) => row.artId > 0 && row.name && row.price > 0 && row.quantitySold > 0);
};

const getImageForSku = async (code) => {
  const rows = await runMysqlQuery(`
    SELECT
      a.clave,
      img.img_id,
      UPPER(HEX(SUBSTRING(i.imagen, 1, 12))),
      HEX(i.imagen)
    FROM articulo a
    INNER JOIN (
      SELECT
        art_id,
        COALESCE(MAX(CASE WHEN seleccionada = 1 THEN img_id ELSE NULL END), MIN(img_id)) AS img_id
      FROM articuloimagen
      GROUP BY art_id
    ) img ON img.art_id = a.art_id
    INNER JOIN imagen i ON i.img_id = img.img_id
    WHERE a.clave = '${sqlEscape(code)}'
    LIMIT 1;
  `);

  if (!rows.length) {
    return null;
  }

  const parts = rows[0].split('\t');
  if (parts.length < 4) {
    return null;
  }

  const imageHex = String(parts[3] || '').trim();
  if (!imageHex) {
    return null;
  }

  const mimeType = getMimeTypeFromHex(parts[2]);
  return {
    code: String(parts[0] || '').trim(),
    imageId: Number(parts[1] || 0),
    mimeType,
    dataUrl: `data:${mimeType};base64,${Buffer.from(imageHex, 'hex').toString('base64')}`,
  };
};

const resolveCategorySortOrder = (category = {}) => {
  const categoryId = String(category.id || '').trim();
  const explicitSortOrder = category.sortOrder;
  if (explicitSortOrder !== undefined && explicitSortOrder !== null && explicitSortOrder !== '') {
    const numeric = Number(explicitSortOrder);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }

  return Number(DEFAULT_CATEGORY_SORT_ORDER[categoryId] ?? 999);
};

const normalizeCurrentCategory = (category = {}) => ({
  id: String(category.id || '').trim(),
  label: String(category.label || category.id || '').trim(),
  subcategories: Array.isArray(category.subcategories)
    ? category.subcategories.map((item) => String(item || '').trim()).filter(Boolean)
    : [],
  active: category.active !== false,
  sortOrder: resolveCategorySortOrder(category),
});

const buildCategorySubcategoryMap = (category = {}) => {
  const byKey = new Map();
  (category.subcategories || []).forEach((label) => {
    const normalized = normalizeSubcategoryKey(label);
    if (normalized && !byKey.has(normalized)) {
      byKey.set(normalized, label);
    }
  });
  return byKey;
};

const resolveFallbackSubcategory = (categoryId, category = {}) => {
  const existingMap = buildCategorySubcategoryMap(category);
  const preferred = String(FALLBACK_SUBCATEGORY_BY_CATEGORY[categoryId] || 'Otros').trim();
  const preferredKey = normalizeSubcategoryKey(preferred);

  if (preferredKey && existingMap.has(preferredKey)) {
    return existingMap.get(preferredKey);
  }

  const existingOther = (category.subcategories || []).find((label) =>
    normalizeSubcategoryKey(label).includes('otros')
  );

  return existingOther || preferred || 'Otros';
};

const resolveStoreSubcategoryForRow = (row, categoryId, currentCategory = {}) => {
  const existingMap = buildCategorySubcategoryMap(currentCategory);
  const candidates = [
    normalizeStoreSubcategory(row.sicarCategory, categoryId),
    String(row.sicarCategory || '').trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const key = normalizeSubcategoryKey(candidate);
    if (key && existingMap.has(key)) {
      return existingMap.get(key);
    }
  }

  return resolveFallbackSubcategory(categoryId, currentCategory);
};

const buildCurrentCatalogIndexes = (currentMap = {}) => {
  const byCodeKey = new Map();
  const byArtId = new Map();

  Object.entries(currentMap || {}).forEach(([pathKey, product]) => {
    const codeKey = getCatalogProductKey(product?.code || '');
    if (codeKey && !byCodeKey.has(codeKey)) {
      byCodeKey.set(codeKey, { pathKey, product });
    }

    const artId = Number(product?.sync?.sicarArtId || 0);
    if (artId > 0 && !byArtId.has(artId)) {
      byArtId.set(artId, { pathKey, product });
    }
  });

  return {
    byCodeKey,
    byArtId,
  };
};

const createImageHash = (value = '', hashHint = '') => {
  const cleanHint = String(hashHint || '').trim();
  if (cleanHint) {
    return cleanHint;
  }

  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
};

const uploadCatalogImage = async ({ code, dataUrl, hashHint = '' }) => {
  if (!dataUrl) {
    return {
      image: '',
      imageStoragePath: '',
      imageHash: String(hashHint || '').trim(),
    };
  }

  const cleanCode = cleanCatalogCode(code) || 'sku';
  const imageHash = createImageHash(dataUrl, hashHint);
  const extension = inferImageExtension(dataUrl);
  const imageStoragePath = `store/catalog/${cleanCode}/${imageHash || Date.now()}.${extension}`;
  const imageRef = storageRef(storage, imageStoragePath);

  try {
    await withTimeout(
      uploadString(imageRef, dataUrl, 'data_url'),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'La subida de la foto a Firebase Storage tardo demasiado.'
    );

    return {
      image: await withTimeout(
        getDownloadURL(imageRef),
        STORAGE_UPLOAD_TIMEOUT_MS,
        'No se pudo obtener la URL publica de la foto en Firebase Storage.'
      ),
      imageStoragePath,
      imageHash,
    };
  } catch (error) {
    console.warn(`No se pudo subir la imagen de ${code} a Firebase Storage: ${error.message}`);
    return {
      image: '',
      imageStoragePath: '',
      imageHash,
    };
  }
};

const mapWithConcurrency = async (items, limit, iterator) => {
  const list = Array.isArray(items) ? items : [];
  const results = new Array(list.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, list.length || 1)) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= list.length) {
        return;
      }

      results[index] = await iterator(list[index], index);
    }
  });

  await Promise.all(workers);
  return results;
};

const touchCatalogMeta = async () => {
  await update(ref(database, STORE_CATALOG_META_PATH), {
    updatedAt: Date.now(),
    updatedAtIso: new Date().toISOString(),
  });
};

const buildExistingManagedProduct = ({ row, existingProduct, resolvedCategory, resolvedSubcategory, imageInfo, nowIso }) => {
  const existing = existingProduct || {};
  const previousSync = existing.sync || {};
  const unit = String(existing.unit || normalizeStoreUnit(row.unit) || 'unidad').trim() || 'unidad';

  return {
    ...existing,
    code: row.code,
    price: roundPrice(row.price),
    unit,
    minQuantity: normalizePositiveQuantityRule(
      existing.minQuantity,
      getDefaultProductMinQuantity(unit)
    ),
    quantityStep: normalizePositiveQuantityRule(
      existing.quantityStep,
      getDefaultProductQuantityStep(unit)
    ),
    sync: {
      source: SICAR_SYNC_SOURCE,
      managedAt: String(previousSync.managedAt || nowIso).trim() || nowIso,
      syncedAt: nowIso,
      windowMonths: MONTHS_WINDOW,
      sicarArtId: row.artId,
      sicarDepartment: row.sicarDepartment,
      sicarCategory: row.sicarCategory,
      sicarName: row.name,
      sicarPrice: roundPrice(row.price),
      sicarImageUrl: String(previousSync.sicarImageUrl || existing.image || '').trim(),
      sicarImageHash: String(previousSync.sicarImageHash || imageInfo.imageHash || row.imageHash || '').trim(),
      quantitySold90d: Number(row.quantitySold.toFixed(4)),
      amountSold90d: roundPrice(row.amountSold),
      tickets90d: row.tickets,
      taxRatePct: Number(row.taxRatePct.toFixed(4)),
      basePrice: Number(row.basePrice.toFixed(4)),
      overrides: {
        name: true,
        price: false,
        image: true,
      },
    },
    ...(existing.category ? {} : { category: resolvedCategory.id }),
    ...(existing.categoryLabel ? {} : { categoryLabel: resolvedCategory.label }),
    ...(existing.subcategory ? {} : { subcategory: resolvedSubcategory }),
  };
};

const buildNewManagedProduct = ({ row, resolvedCategory, resolvedSubcategory, imageInfo, nowIso }) => {
  const unit = normalizeStoreUnit(row.unit);

  return {
    code: row.code,
    name: row.name,
    price: roundPrice(row.price),
    unit,
    category: resolvedCategory.id,
    categoryLabel: resolvedCategory.label,
    subcategory: resolvedSubcategory,
    minQuantity: normalizePositiveQuantityRule(undefined, getDefaultProductMinQuantity(unit)),
    quantityStep: normalizePositiveQuantityRule(undefined, getDefaultProductQuantityStep(unit)),
    active: true,
    promo: false,
    description: '',
    image: imageInfo.image,
    imageStoragePath: imageInfo.imageStoragePath,
    sync: {
      source: SICAR_SYNC_SOURCE,
      managedAt: nowIso,
      syncedAt: nowIso,
      windowMonths: MONTHS_WINDOW,
      sicarArtId: row.artId,
      sicarDepartment: row.sicarDepartment,
      sicarCategory: row.sicarCategory,
      sicarName: row.name,
      sicarPrice: roundPrice(row.price),
      sicarImageUrl: imageInfo.image,
      sicarImageHash: String(imageInfo.imageHash || row.imageHash || '').trim(),
      quantitySold90d: Number(row.quantitySold.toFixed(4)),
      amountSold90d: roundPrice(row.amountSold),
      tickets90d: row.tickets,
      taxRatePct: Number(row.taxRatePct.toFixed(4)),
      basePrice: Number(row.basePrice.toFixed(4)),
      overrides: {
        name: false,
        price: false,
        image: false,
      },
    },
  };
};

const chunkEntries = (entries, size) => {
  const chunks = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks;
};

const main = async () => {
  const now = new Date();
  const nowIso = now.toISOString();
  const backupDir = resolve(cwd, 'sync-backups');
  mkdirSync(backupDir, { recursive: true });

  const [{ startDate, endInclusiveDate, endExclusiveDate }, catalogSnapshot, categoriesSnapshot] = await Promise.all([
    Promise.resolve(getWindowDates(MONTHS_WINDOW)),
    get(ref(database, STORE_CATALOG_PATH)),
    get(ref(database, STORE_CATEGORIES_PATH)),
  ]);

  const currentCatalog = catalogSnapshot.val() || {};
  const currentCategories = categoriesSnapshot.val() || {};
  const backupStamp = formatStamp(now);

  writeFileSync(
    resolve(backupDir, `store-categories-before-sicar-4m-${backupStamp}.json`),
    JSON.stringify(currentCategories, null, 2),
    'utf8'
  );
  writeFileSync(
    resolve(backupDir, `store-catalog-before-sicar-4m-${backupStamp}.json`),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(currentCatalog).map(([key, product]) => [
          key,
          {
            code: product?.code || '',
            name: product?.name || '',
            price: product?.price || 0,
            category: product?.category || '',
            subcategory: product?.subcategory || '',
            sync: product?.sync || null,
          },
        ])
      ),
      null,
      2
    ),
    'utf8'
  );

  console.log(`Backup local creado en ${backupDir}`);
  console.log(`Leyendo ventas SICAR desde ${startDate} hasta ${endInclusiveDate}...`);

  const soldRows = await getSoldRows({ startDate, endExclusiveDate });
  const categoryState = new Map(
    Object.entries(currentCategories).map(([pathKey, category]) => {
      const normalized = normalizeCurrentCategory(category);
      return [normalized.id, { pathKey, ...normalized }];
    })
  );
  const catalogIndexes = buildCurrentCatalogIndexes(currentCatalog);
  const categoryUpdates = {};
  const productPlans = [];
  const skipped = [];
  const movedKeys = {};

  soldRows.forEach((rawRow) => {
    const override = SICAR_SPECIAL_SKU_OVERRIDES[rawRow.code] || null;
    const departmentName = override?.sicarDepartment || rawRow.sicarDepartment;
    const departmentConfig = getSicarDepartmentConfig(departmentName);

    if (!departmentConfig) {
      skipped.push({
        reason: 'department_not_mapped',
        artId: rawRow.artId,
        code: rawRow.code,
        department: rawRow.sicarDepartment,
      });
      return;
    }

    const row = {
      ...rawRow,
      code: String(rawRow.code || '').trim(),
      name: String(rawRow.name || '').trim(),
      sicarDepartment: departmentName,
      sicarCategory: String(override?.sicarCategory || rawRow.sicarCategory || '').trim(),
    };

    if (!isPrintableCode(row.code)) {
      skipped.push({
        reason: 'invalid_code',
        artId: row.artId,
        code: row.code,
        name: row.name,
      });
      return;
    }

    const targetCategory =
      categoryState.get(departmentConfig.storeCategoryId) || {
        pathKey: departmentConfig.storeCategoryId,
        id: departmentConfig.storeCategoryId,
        label: departmentConfig.storeCategoryLabel,
        subcategories: [],
        active: true,
        sortOrder: departmentConfig.sortOrder,
      };
    const resolvedSubcategory = resolveStoreSubcategoryForRow(row, targetCategory.id, targetCategory);
    const currentSubcategories = Array.isArray(targetCategory.subcategories)
      ? [...targetCategory.subcategories]
      : [];
    const resolvedSubcategoryKey = normalizeSubcategoryKey(resolvedSubcategory);

    if (
      resolvedSubcategoryKey &&
      !currentSubcategories.some((label) => normalizeSubcategoryKey(label) === resolvedSubcategoryKey)
    ) {
      currentSubcategories.push(resolvedSubcategory);
      targetCategory.subcategories = currentSubcategories;
      categoryState.set(targetCategory.id, targetCategory);
      categoryUpdates[targetCategory.pathKey] = {
        id: targetCategory.id,
        label: targetCategory.label,
        active: targetCategory.active,
        sortOrder: targetCategory.sortOrder,
        subcategories: currentSubcategories,
      };
    }

    const desiredPathKey = getCatalogProductKey(row.code);
    const exactMatch = catalogIndexes.byCodeKey.get(desiredPathKey) || null;
    const artIdMatch = exactMatch ? null : catalogIndexes.byArtId.get(row.artId) || null;
    const matched = exactMatch || artIdMatch;

    if (matched?.pathKey && matched.pathKey !== desiredPathKey) {
      movedKeys[matched.pathKey] = null;
    }

    productPlans.push({
      row,
      resolvedCategory: targetCategory,
      resolvedSubcategory,
      desiredPathKey,
      existingPathKey: matched?.pathKey || '',
      existingProduct: matched?.product || null,
      requiresImage: !matched?.product?.code && row.imageId > 0,
    });
  });

  console.log(`SICAR devolvio ${soldRows.length} filas vendidas. Preparando ${productPlans.length} SKUs para tienda...`);

  const imagePlans = productPlans.filter((plan) => plan.requiresImage);
  let importedImages = 0;

  const imageResults = await mapWithConcurrency(imagePlans, IMAGE_UPLOAD_CONCURRENCY, async (plan, index) => {
    try {
      const image = await getImageForSku(plan.row.code);
      if (!image?.dataUrl) {
        return { code: plan.row.code, image: '', imageStoragePath: '', imageHash: String(plan.row.imageHash || '').trim() };
      }

      const uploaded = await uploadCatalogImage({
        code: plan.row.code,
        dataUrl: image.dataUrl,
        hashHint: plan.row.imageHash || image.imageId,
      });
      if (uploaded.image) {
        importedImages += 1;
      }
      console.log(`Foto ${index + 1}/${imagePlans.length}: ${plan.row.code} ${uploaded.image ? 'OK' : 'sin URL'}`);
      return {
        code: plan.row.code,
        image: uploaded.image,
        imageStoragePath: uploaded.imageStoragePath,
        imageHash: uploaded.imageHash,
      };
    } catch (error) {
      console.warn(`No se pudo importar la foto de ${plan.row.code}: ${error.message}`);
      return {
        code: plan.row.code,
        image: '',
        imageStoragePath: '',
        imageHash: String(plan.row.imageHash || '').trim(),
      };
    }
  });

  const imageByCode = new Map(imageResults.map((item) => [item.code, item]));
  const updates = {};
  let newProducts = 0;
  let existingProducts = 0;
  let movedProducts = 0;

  productPlans.forEach((plan) => {
    const imageInfo = imageByCode.get(plan.row.code) || {
      code: plan.row.code,
      image: '',
      imageStoragePath: '',
      imageHash: String(plan.row.imageHash || '').trim(),
    };

    const nextProduct = plan.existingProduct?.code
      ? buildExistingManagedProduct({
          row: plan.row,
          existingProduct: plan.existingProduct,
          resolvedCategory: plan.resolvedCategory,
          resolvedSubcategory: plan.resolvedSubcategory,
          imageInfo,
          nowIso,
        })
      : buildNewManagedProduct({
          row: plan.row,
          resolvedCategory: plan.resolvedCategory,
          resolvedSubcategory: plan.resolvedSubcategory,
          imageInfo,
          nowIso,
        });

    updates[plan.desiredPathKey] = nextProduct;

    if (plan.existingProduct?.code) {
      existingProducts += 1;
      if (plan.existingPathKey && plan.existingPathKey !== plan.desiredPathKey) {
        movedProducts += 1;
      }
    } else {
      newProducts += 1;
    }
  });

  Object.entries(movedKeys).forEach(([pathKey, value]) => {
    if (!(pathKey in updates)) {
      updates[pathKey] = value;
    }
  });

  const updateEntries = Object.entries(updates);
  const chunks = chunkEntries(updateEntries, BATCH_SIZE);

  console.log(`Guardando ${productPlans.length} SKUs en Firebase en ${chunks.length} lotes...`);

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    await update(ref(database, STORE_CATALOG_PATH), Object.fromEntries(chunk));
    console.log(`Lote ${index + 1}/${chunks.length} aplicado (${Math.min((index + 1) * BATCH_SIZE, productPlans.length)}/${productPlans.length}).`);
  }

  if (Object.keys(categoryUpdates).length > 0) {
    await update(ref(database, STORE_CATEGORIES_PATH), categoryUpdates);
    console.log(`Categorias actualizadas: ${Object.keys(categoryUpdates).length}`);
  }

  await touchCatalogMeta();

  const report = {
    generatedAt: nowIso,
    dateWindow: {
      startDate,
      endInclusiveDate,
      endExclusiveDate,
      months: MONTHS_WINDOW,
    },
    counts: {
      soldRows: soldRows.length,
      appliedProducts: productPlans.length,
      newProducts,
      existingProducts,
      movedProducts,
      importedImages,
      categoryUpdates: Object.keys(categoryUpdates).length,
      skipped: skipped.length,
    },
    categoryCounts: Array.from(categoryState.values()).map((category) => ({
      id: category.id,
      label: category.label,
      subcategories: category.subcategories.length,
    })),
    skipped,
  };

  const reportPath = resolve(backupDir, `sicar-sync-all-sold-4m-report-${backupStamp}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log('Sincronizacion completada.');
  console.log(`Productos aplicados: ${productPlans.length}`);
  console.log(`Nuevos: ${newProducts}`);
  console.log(`Existentes actualizados sin duplicar: ${existingProducts}`);
  console.log(`Registros movidos por coincidencia de artId: ${movedProducts}`);
  console.log(`Fotos importadas a Storage: ${importedImages}`);
  console.log(`Reporte: ${reportPath}`);
};

main().catch((error) => {
  console.error('Fallo la sincronizacion SICAR 4 meses:', error);
  process.exit(1);
});
