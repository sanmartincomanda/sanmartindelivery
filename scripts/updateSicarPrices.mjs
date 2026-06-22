import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { initializeApp } from 'firebase/app';
import { getDatabase, get, ref, update } from 'firebase/database';

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
const STORE_CATALOG_META_PATH = 'storeCatalogMeta';
const SICAR_SYNC_SOURCE = 'sicar';
const SICAR_CATALOG_SYNC_BATCH_SIZE = 25;
const MYSQL_CHUNK_SIZE = 250;

const app = initializeApp(FIREBASE_CONFIG);
const database = getDatabase(app);

const roundPrice = (value) => Number(Number(value || 0).toFixed(2));

const sqlEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const splitIntoChunks = (items = [], size = 1) => {
  const source = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, Number(size || 1));
  const chunks = [];

  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }

  return chunks;
};

const normalizeStoreUnit = (value = '') => {
  const unit = String(value || '').trim().toUpperCase();
  if (unit.includes('LB')) {
    return 'lb';
  }
  return 'unidad';
};

const getCatalogProductKey = (code) => String(code || '').trim().replace(/[.#$/[\]]/g, '_');

const splitIntoBatches = (entries = [], size = 1) => {
  const batchSize = Math.max(1, Number(size || 1));
  const source = Array.isArray(entries) ? entries : [];
  const chunks = [];

  for (let index = 0; index < source.length; index += batchSize) {
    chunks.push(source.slice(index, index + batchSize));
  }

  return chunks;
};

const normalizeSyncMetadata = (sync = {}) => ({
  source: String(sync?.source || '').trim().toLowerCase(),
  managedAt: String(sync?.managedAt || '').trim(),
  syncedAt: String(sync?.syncedAt || '').trim(),
  sicarArtId: Number(sync?.sicarArtId || 0),
  sicarDepartment: String(sync?.sicarDepartment || '').trim(),
  sicarCategory: String(sync?.sicarCategory || '').trim(),
  sicarName: String(sync?.sicarName || '').trim(),
  sicarPrice: roundPrice(sync?.sicarPrice || 0),
  sicarImageUrl: String(sync?.sicarImageUrl || sync?.sicarImage || '').trim(),
  sicarImageHash: String(sync?.sicarImageHash || '').trim(),
  quantitySold90d: Number(sync?.quantitySold90d || 0),
  amountSold90d: roundPrice(sync?.amountSold90d || 0),
  tickets90d: Number(sync?.tickets90d || 0),
  departmentRank: Number(sync?.departmentRank || 0),
  cumulativeDepartmentPct: Number(sync?.cumulativeDepartmentPct || 0),
  overallDepartmentSharePct: Number(sync?.overallDepartmentSharePct || 0),
  overrides: {
    name: Boolean(sync?.overrides?.name),
    price: Boolean(sync?.overrides?.price),
    image: Boolean(sync?.overrides?.image),
  },
});

const buildCatalogMetaPayload = () => ({
  updatedAt: Date.now(),
  updatedAtIso: new Date().toISOString(),
});

const getCurrentCatalogMap = async () => {
  const snapshot = await get(ref(database, STORE_CATALOG_PATH));
  return snapshot.val() || {};
};

const touchCatalogMeta = async () => {
  await update(ref(database, STORE_CATALOG_META_PATH), buildCatalogMetaPayload());
};

const applySicarPriceUpdates = async (priceProducts = [], currentCatalogMap = {}) => {
  const catalog = Array.isArray(priceProducts) ? priceProducts : [];
  const updates = {};
  const missingCodes = [];

  catalog.forEach((product) => {
    const code = String(product?.code || '').trim();
    if (!code) {
      return;
    }

    const productKey = getCatalogProductKey(code);
    const existing = currentCatalogMap[productKey] || null;

    if (!existing?.code) {
      missingCodes.push(code);
      return;
    }

    const previousSync = normalizeSyncMetadata(existing?.sync || {});
    const finalPrice = roundPrice(product?.price || existing?.price || 0);

    updates[productKey] = {
      ...existing,
      price: finalPrice,
      sync: {
        source: SICAR_SYNC_SOURCE,
        managedAt: previousSync.managedAt || new Date().toISOString(),
        syncedAt: new Date().toISOString(),
        sicarArtId: Number(product?.sicar?.artId || previousSync.sicarArtId || 0),
        sicarDepartment: String(product?.sicar?.department || previousSync.sicarDepartment || '').trim(),
        sicarCategory: String(product?.sicar?.category || previousSync.sicarCategory || '').trim(),
        sicarName: String(product?.name || previousSync.sicarName || existing?.name || '').trim(),
        sicarPrice: finalPrice,
        sicarImage: null,
        sicarImageUrl: previousSync.sicarImageUrl,
        sicarImageHash: previousSync.sicarImageHash,
        quantitySold90d: previousSync.quantitySold90d,
        amountSold90d: previousSync.amountSold90d,
        tickets90d: previousSync.tickets90d,
        departmentRank: previousSync.departmentRank,
        cumulativeDepartmentPct: previousSync.cumulativeDepartmentPct,
        overallDepartmentSharePct: previousSync.overallDepartmentSharePct,
        overrides: {
          name: true,
          price: false,
          image: true,
        },
      },
    };
  });

  const entries = Object.entries(updates);
  const batches = splitIntoBatches(entries, SICAR_CATALOG_SYNC_BATCH_SIZE);
  let processed = 0;

  for (const batch of batches) {
    await update(ref(database, STORE_CATALOG_PATH), Object.fromEntries(batch));
    processed += batch.length;
    console.log(`Progreso: ${processed}/${entries.length} precios actualizados.`);
  }

  if (entries.length > 0) {
    await touchCatalogMeta();
  }

  return {
    appliedCount: entries.length,
    missingCodes,
  };
};

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

const getSicarProductsByCodes = async (codes = []) => {
  const uniqueCodes = Array.from(
    new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || '').trim())
        .filter(Boolean)
    )
  );

  if (uniqueCodes.length === 0) {
    return [];
  }

  const chunks = splitIntoChunks(uniqueCodes, MYSQL_CHUNK_SIZE);
  const matches = [];

  for (const chunk of chunks) {
    const codeList = chunk.map((code) => `'${sqlEscape(code)}'`).join(', ');
    const rows = await runMysqlQuery(`
      SELECT
        a.art_id,
        a.clave,
        a.descripcion,
        UPPER(TRIM(COALESCE(u.nombre, 'PZA'))),
        ROUND(MAX(a.precio1) * (1 + COALESCE(MAX(tax.taxRatePct), 0) / 100), 6),
        COALESCE(MAX(tax.taxRatePct), 0),
        COALESCE(d.nombre, ''),
        COALESCE(c.nombre, '')
      FROM articulo a
      LEFT JOIN categoria c ON c.cat_id = a.cat_id
      LEFT JOIN departamento d ON d.dep_id = c.dep_id
      LEFT JOIN unidad u ON u.uni_id = a.unidadVenta
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
      WHERE a.status = 1
        AND a.servicio = 0
        AND a.clave IN (${codeList})
      GROUP BY
        a.art_id,
        a.clave,
        a.descripcion,
        u.nombre,
        d.nombre,
        c.nombre
      ORDER BY a.clave ASC;
    `);

    rows.forEach((row) => {
      const [artId, code, name, unitName, priceWithTax, taxRatePct, department, category] = row.split('\t');
      matches.push({
        code: String(code || '').trim(),
        name: String(name || '').trim(),
        price: roundPrice(priceWithTax),
        unit: normalizeStoreUnit(unitName),
        sicar: {
          artId: Number(artId || 0),
          department: String(department || '').trim(),
          category: String(category || '').trim(),
          taxRatePct: Number(taxRatePct || 0),
        },
      });
    });
  }

  return matches;
};

async function main() {
  console.log('Leyendo catalogo actual desde Firebase...');
  const currentCatalogMap = await getCurrentCatalogMap();
  const catalogCodes = Array.from(
    new Set(
      Object.values(currentCatalogMap || {})
        .map((product) => String(product?.code || '').trim())
        .filter(Boolean)
    )
  );

  if (catalogCodes.length === 0) {
    console.log('No hay SKUs con codigo en el catalogo actual.');
    return;
  }

  console.log(`Consultando ${catalogCodes.length} SKUs en SICAR...`);
  const matchedProducts = await getSicarProductsByCodes(catalogCodes);
  const matchedCodeSet = new Set(matchedProducts.map((product) => String(product?.code || '').trim()).filter(Boolean));
  const missingCodes = catalogCodes.filter((code) => !matchedCodeSet.has(code));

  if (matchedProducts.length === 0) {
    console.log('SICAR no devolvio coincidencias por clave.');
    return;
  }

  console.log(`Actualizando ${matchedProducts.length} SKUs en Firebase...`);
  const result = await applySicarPriceUpdates(matchedProducts, currentCatalogMap);

  console.log(
    `Proceso listo. ${result.appliedCount} SKUs actualizados por clave y ${missingCodes.length} sin coincidencia en SICAR.`
  );

  if (missingCodes.length > 0) {
    console.log(`Codigos sin coincidencia: ${missingCodes.join(', ')}`);
  }
}

main().catch((error) => {
  console.error('No se pudieron actualizar los precios SICAR desde script.');
  console.error(error);
  process.exitCode = 1;
});
