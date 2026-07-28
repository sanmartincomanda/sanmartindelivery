import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSicarClientSyncManager } from './sicarClientSync.mjs';
import { createOrderArchiveManager } from './orderArchiveManager.mjs';
import { createSicarQuoteSyncManager } from './sicarQuoteSync.mjs';
import { createStoreRewardsSyncManager } from './storeRewardsSync.mjs';
import { createStoreWelcomeCouponSyncManager } from './storeWelcomeCouponSync.mjs';
import { getCrmDashboardSnapshot } from './crmAnalytics.mjs';
import {
  SICAR_MIN_OVERALL_SHARE_PCT,
  SICAR_SPECIAL_SKU_OVERRIDES,
  SICAR_SYNC_DEPARTMENTS,
  SICAR_SYNC_THRESHOLD_PCT,
  getSicarDepartmentConfig,
} from '../src/data/sicarCatalogRules.js';
import {
  getForcedSicarSubcategories,
  normalizeStoreSubcategory,
} from '../src/data/storeSubcategoryRules.js';

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(scriptPath, '..', '..');
const cwd = process.cwd();
const localConfigCandidates = [
  resolve(repoRoot, 'sicar.local.json'),
  resolve(cwd, 'sicar.local.json'),
];
const localConfigPath = localConfigCandidates.find((candidate) => existsSync(candidate)) || '';
const localConfig = localConfigPath
  ? JSON.parse(readFileSync(localConfigPath, 'utf8'))
  : {};

const bridgeConfig = {
  branchId: String(process.env.SICAR_BRANCH_ID || localConfig.branchId || 'granada').trim().toLowerCase(),
  host: process.env.SICAR_MYSQL_HOST || localConfig.host || '127.0.0.1',
  port: Number(process.env.SICAR_MYSQL_PORT || localConfig.port || 3307),
  database: process.env.SICAR_MYSQL_DATABASE || localConfig.database || 'sicar',
  user: process.env.SICAR_MYSQL_USER || localConfig.user || 'root',
  password: process.env.SICAR_MYSQL_PASSWORD || localConfig.password || '',
  mysqlExePath:
    process.env.SICAR_MYSQL_EXE_PATH ||
    localConfig.mysqlExePath ||
    'C:\\Program Files (x86)\\SICAR-S-131AB\\MySQL\\MySQL Server 5.6\\bin\\mysql.exe',
  bridgePort: Number(process.env.SICAR_BRIDGE_PORT || localConfig.bridgePort || 3077),
  bindHost: String(process.env.SICAR_BRIDGE_BIND_HOST || localConfig.bindHost || '127.0.0.1').trim(),
  apiKey: String(process.env.SICAR_API_KEY || localConfig.apiKey || '').trim(),
  enableClientSync:
    String(process.env.SICAR_ENABLE_CLIENT_SYNC ?? localConfig.enableClientSync ?? 'true')
      .trim()
      .toLowerCase() !== 'false',
  enableBackgroundSync:
    String(process.env.SICAR_ENABLE_BACKGROUND_SYNC ?? localConfig.enableBackgroundSync ?? 'true')
      .trim()
      .toLowerCase() !== 'false',
  enableQuoteSync:
    String(process.env.SICAR_ENABLE_QUOTE_SYNC ?? localConfig.enableQuoteSync ?? 'true')
      .trim()
      .toLowerCase() !== 'false',
};

const ENABLE_SICAR_QUOTE_SYNC = bridgeConfig.enableBackgroundSync && bridgeConfig.enableQuoteSync;
const IS_PRIMARY_GLOBAL_SYNC_BRANCH = bridgeConfig.branchId === 'granada';
const TRUSTED_PUBLIC_BRIDGE_HOSTS = ['sanmartinsr.com', 'verdant-youtiao-5cd9d3.netlify.app'];

const sqlEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const isLocalBridgeHostname = (hostname = '') => {
  const cleanHost = String(hostname || '').trim().toLowerCase();

  if (!cleanHost) {
    return false;
  }

  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '::1') {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(cleanHost)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(cleanHost)) {
    return true;
  }

  const match = cleanHost.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (match) {
    const secondOctet = Number(match[1] || 0);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
};

const isTrustedPublicBridgeHostname = (hostname = '') => {
  const cleanHost = String(hostname || '').trim().toLowerCase();
  if (!cleanHost) {
    return false;
  }

  return TRUSTED_PUBLIC_BRIDGE_HOSTS.some(
    (trustedHost) => cleanHost === trustedHost || cleanHost.endsWith(`.${trustedHost}`)
  );
};

const resolveCorsHeaders = (request) => {
  const origin = String(request?.headers?.origin || '').trim();

  if (!origin) {
    return {};
  }

  try {
    const originUrl = new URL(origin);
    if (!['http:', 'https:'].includes(originUrl.protocol)) {
      return null;
    }

    if (!isLocalBridgeHostname(originUrl.hostname) && !isTrustedPublicBridgeHostname(originUrl.hostname)) {
      return null;
    }

    return {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SanMartin-Api-Key',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
  } catch (error) {
    return null;
  }
};

const json = (statusCode, payload) => ({
  statusCode,
  body: JSON.stringify(payload, null, 2),
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

const text = (statusCode, payload) => ({
  statusCode,
  body: payload,
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

const writeResponse = (request, response, result) => {
  const corsHeaders = resolveCorsHeaders(request);

  if (corsHeaders === null) {
    response.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    response.end(
      JSON.stringify(
        {
          ok: false,
          error: 'Origen no permitido para usar el puente local de SICAR.',
        },
        null,
        2
      )
    );
    return;
  }

  response.writeHead(result.statusCode, {
    ...result.headers,
    ...corsHeaders,
  });
  response.end(result.body);
};

const pad = (value) => String(value).padStart(2, '0');

const formatDate = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const getWindowDates = () => {
  const now = new Date();
  const start = new Date(now);
  start.setMonth(start.getMonth() - 3);
  const endExclusive = new Date(now);
  endExclusive.setDate(endExclusive.getDate() + 1);
  return {
    startDate: formatDate(start),
    endExclusiveDate: formatDate(endExclusive),
    endInclusiveDate: formatDate(now),
  };
};

const getRecentDaysWindowDates = (daysBack = 30) => {
  const safeDays = Math.max(1, Number(daysBack || 30));
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - safeDays);
  const endExclusive = new Date(now);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    daysBack: safeDays,
    startDate: formatDate(start),
    endExclusiveDate: formatDate(endExclusive),
    endInclusiveDate: formatDate(now),
  };
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

const normalizeStoreUnit = (value = '') => {
  const unit = String(value || '').trim().toUpperCase();
  if (unit.includes('LB')) {
    return 'lb';
  }
  return 'unidad';
};

const splitIntoChunks = (items = [], size = 1) => {
  const source = Array.isArray(items) ? items : [];
  const chunkSize = Math.max(1, Number(size || 1));
  const chunks = [];

  for (let index = 0; index < source.length; index += chunkSize) {
    chunks.push(source.slice(index, index + chunkSize));
  }

  return chunks;
};

const resolveRowDepartment = (row) => {
  const override = SICAR_SPECIAL_SKU_OVERRIDES[row.code] || null;
  const departmentName = override?.sicarDepartment || row.sicarDepartment;
  const departmentConfig = getSicarDepartmentConfig(departmentName);
  if (!departmentConfig) {
    return null;
  }

  return {
    override,
    departmentName,
    departmentConfig,
  };
};

const runMysqlQuery = (query) =>
  new Promise((resolvePromise, rejectPromise) => {
    if (!existsSync(bridgeConfig.mysqlExePath)) {
      rejectPromise(new Error(`No se encontro mysql.exe en ${bridgeConfig.mysqlExePath}`));
      return;
    }

    const args = [
      '-B',
      '-N',
      '-h',
      bridgeConfig.host,
      '-P',
      String(bridgeConfig.port),
      '-u',
      bridgeConfig.user,
      '-D',
      bridgeConfig.database,
      '-e',
      query,
    ];

    if (String(bridgeConfig.password || '') !== '') {
      args.splice(args.indexOf('-D'), 0, `--password=${bridgeConfig.password}`);
    }

    const child = spawn(bridgeConfig.mysqlExePath, args, {
      cwd,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => rejectPromise(error));

    const queryTimeout = setTimeout(() => {
      child.kill();
      rejectPromise(new Error('mysql.exe excedio el tiempo de espera de 30 segundos.'));
    }, 30000);

    child.on('close', (code) => {
      clearTimeout(queryTimeout);
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

const sicarQuoteSync = createSicarQuoteSyncManager({
  runMysqlQuery,
  sqlEscape,
  branchId: bridgeConfig.branchId,
});

const sicarClientSync = createSicarClientSyncManager({
  runMysqlQuery,
  repoRoot,
});

const orderArchive = createOrderArchiveManager({
  repoRoot,
});
const storeRewardsSync = createStoreRewardsSyncManager({
  onArchivedOrderUpdated: orderArchive.patchLocalArchivedOrder,
});
const storeWelcomeCouponSync = createStoreWelcomeCouponSyncManager();

const getOverallQuantityTotal = async (startDate, endExclusiveDate) => {
  const rows = await runMysqlQuery(`
    SELECT ROUND(COALESCE(SUM(dv.cantidad), 0), 4)
    FROM detallev dv
    INNER JOIN venta v ON v.ven_id = dv.ven_id
    INNER JOIN articulo a ON a.art_id = dv.art_id
    WHERE v.fecha >= '${sqlEscape(startDate)}'
      AND v.fecha < '${sqlEscape(endExclusiveDate)}'
      AND v.status = 1
      AND a.status = 1
      AND a.servicio = 0;
  `);

  return Number(rows[0] || 0);
};

const getSicarCatalogRows = async (startDate, endExclusiveDate) => {
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
    HAVING MAX(a.precio1) > 0
    ORDER BY d.nombre, SUM(dv.cantidad) DESC, a.descripcion ASC;
  `);

  return rows
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length >= 14)
    .map((parts) => ({
      sicarDepartment: parts[0],
      sicarCategory: parts[1],
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
    .filter((row) => row.code && row.name && row.price > 0 && row.quantitySold > 0);
};

const getSicarPriceRowsByCodes = async (codes = []) => {
  const uniqueCodes = Array.from(new Set(codes.map((code) => String(code || '').trim()).filter(Boolean)));
  if (uniqueCodes.length === 0) {
    return [];
  }

  const rows = [];

  for (const codeChunk of splitIntoChunks(uniqueCodes, 200)) {
    const codeList = codeChunk.map((code) => `'${sqlEscape(code)}'`).join(', ');
    const chunkRows = await runMysqlQuery(`
      SELECT
        a.art_id,
        a.clave,
        a.descripcion,
        COALESCE(d.nombre, ''),
        COALESCE(c.nombre, ''),
        UPPER(TRIM(COALESCE(u.nombre, 'PZA'))),
        ROUND(a.precio1, 6),
        ROUND(a.precio1 * (1 + COALESCE(tax.taxRatePct, 0) / 100), 6),
        COALESCE(tax.taxRatePct, 0)
      FROM articulo a
      LEFT JOIN categoria c ON c.cat_id = a.cat_id
      LEFT JOIN departamento d ON d.dep_id = c.dep_id
      LEFT JOIN ×Þ¼¶‰žËkºwµçl4(4(€€€€€É…¹­•‘M•±•Ñ•‘I½ÝÌ¹™½É…  ¡É½Ü°¥¹‘•à¤€ôøì4(€€€€€€€Í•±•Ñ•‘AÉ½‘ÕÑÌ¹ÁÕÍ ¡ì4(€€€€€€€€€½‘”èÉ½Ü¹½‘”°4(€€€€€€€€€¹…µ”èÉ½Ü¹¹…µ”°4(€€€€€€€€€ÁÉ¥”è9Õµ‰•È¡É½Ü¹ÁÉ¥”¹Ñ½¥á• È¤¤°4(€€€€€€€€€Õ¹¥Ðè¹½Éµ…±¥é•MÑ½É•U¹¥Ð¡É½Ü¹Õ¹¥Ð¤°4(€€€€€€€€€…Ñ•½ÉäèÉ½Ü¹ÍÑ½É•…Ñ•½Éä°4(€€€€€€€€€…Ñ•½Éå1…‰•°èÉ½Ü¹ÍÑ½É•…Ñ•½Éå1…‰•°°4(€€€€€€€€€ÍÕ‰…Ñ•½ÉäèÉ½Ü¹ÍÑ½É•MÕ‰…Ñ•½Éä°4(€€€€€€€€€…Ñ¥Ù”èÑÉÕ”°4(€€€€€€€€€ÁÉ½µ¼è™…±Í”°4(€€€€€€€€€‘•ÍÉ¥ÁÑ¥½¸è€œœ°4(€€€€€€€€€Í¥…Èèì4(€€€€€€€€€€€…ÉÑ%èÉ½Ü¹…ÉÑ%°4(€€€€€€€€€€€‘•Á…ÉÑµ•¹Ðè‘•Á…ÉÑµ•¹Ñ9…µ”°4(€€€€€€€€€€€…Ñ•½ÉäèÉ½Ü¹Í¥…É…Ñ•½Éä°4(€€€€€€€€€€€‰…Í•AÉ¥”è9Õµ‰•È¡É½Ü¹‰…Í•AÉ¥”¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€€€Ñ…áI…Ñ•AÐè9Õµ‰•È¡É½Ü¹Ñ…áI…Ñ•AÐ¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€€€ÅÕ…¹Ñ¥ÑåM½±äÁè9Õµ‰•È¡É½Ü¹ÅÕ…¹Ñ¥ÑåM½±¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€€€…µ½Õ¹ÑM½±äÁè9Õµ‰•È¡É½Ü¹…µ½Õ¹ÑM½±¹Ñ½¥á• È¤¤°4(€€€€€€€€€€€Ñ¥­•ÑÌäÁèÉ½Ü¹Ñ¥­•ÑÌ°4(€€€€€€€€€€€½Ù•É…±±•Á…ÉÑµ•¹ÑM¡…É•AÐè9Õµ‰•È¡‘•Á…ÉÑµ•¹ÑM¡…É”¹Ñ½¥á• È¤¤°4(€€€€€€€€€€€‘•Á…ÉÑµ•¹ÑI…¹¬è¥¹‘•à€¬€Ä°4(€€€€€€€€€€€ÕµÕ±…Ñ¥Ù••Á…ÉÑµ•¹ÑAÐèÉ½Ü¹ÕµÕ±…Ñ¥Ù••Á…ÉÑµ•¹ÑAÐ°4(€€€€€€€€€€€¥µ…•%èÉ½Ü¹¥µ…•%°4(€€€€€€€€€€€¥µ…•!…Í èÉ½Ü¹¥µ…•!…Í °4(€€€€€€€€€€€¡…Í%µ…”èÉ½Ü¹¡…Í%µ…”°4(€€€€€€€€€ô°4(€€€€€€€ô¤ì4(€€€€€ô¤ì4(€€€ô¤ì4(4(€½¹ÍÐ…Ñ•½É¥•Ì€ôÍÕµµ…Éä¹µ…À ¡¥Ñ•´¤€ôø€¡ì4(€€€¥è¥Ñ•´¹ÍÑ½É•…Ñ•½Éä°4(€€€±…‰•°è¥Ñ•´¹ÍÑ½É•…Ñ•½Éå1…‰•°°4(€€€ÍÕ‰…Ñ•½É¥•Ìè¥Ñ•´¹ÍÕ‰…Ñ•½É¥•Ì°4(€€€…Ñ¥Ù”èÑÉÕ”°4(€€€Í½ÉÑ=É‘•Èè•ÑM¥…É•Á…ÉÑµ•¹Ñ½¹™¥œ¡¥Ñ•´¹Í¥…É•Á…ÉÑµ•¹Ð¤ü¹Í½ÉÑ=É‘•Èñð€äää°4(€ô¤¤ì4(4(€É•ÑÕÉ¸ì4(€€€•¹•É…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€‘…Ñ•]¥¹‘½Üèì4(€€€€€ÍÑ…ÉÑ…Ñ”°4(€€€€€•¹‘%¹±ÕÍ¥Ù•…Ñ”°4(€€€€€•¹‘á±ÕÍ¥Ù•…Ñ”°4(€€€ô°4(€€€ÉÕ±•Ìèì4(€€€€€Ñ¡É•Í¡½±‘AÐèM%I}Me9}Q!IM!=1}AP°4(€€€€€µ¥¹=Ù•É…±±M¡…É•AÐèM%I}5%9}=YI11}M!I}AP°4(€€€ô°4(€€€Ñ½Ñ…±=Ù•É…±±EÕ…¹Ñ¥Ñäè9Õµ‰•È¡Ñ½Ñ…±=Ù•É…±±EÕ…¹Ñ¥Ñä¹Ñ½¥á• Ð¤¤°4(€€€ÍÕµµ…Éä°4(€€€…Ñ•½É¥•Ì°4(€€€ÁÉ½‘ÕÑÌèÍ•±•Ñ•‘AÉ½‘ÕÑÌ°4(€ôì4)ôì4(4)½¹ÍÐ‰Õ¥±‘I••¹ÑM½±‘…Ñ…±½M•±•Ñ¥½¸€ô…Íå¹Œ€¡‘…åÍ	…¬€ô€ÌÀ¤€ôøì4(€½¹ÍÐìÍÑ…ÉÑ…Ñ”°•¹‘á±ÕÍ¥Ù•…Ñ”°•¹‘%¹±ÕÍ¥Ù•…Ñ”°‘…åÍ	…¬èÉ•Í½±Ù•‘…åÍ	…¬ô€ô4(€€€•ÑI••¹Ñ…åÍ]¥¹‘½Ý…Ñ•Ì¡‘…åÍ	…¬¤ì4(€½¹ÍÐÉ…ÝI½ÝÌ€ô…Ý…¥Ð•ÑM¥…É…Ñ…±½I½ÝÌ¡ÍÑ…ÉÑ…Ñ”°•¹‘á±ÕÍ¥Ù•…Ñ”¤ì4(4(€½¹ÍÐÁÉ½‘ÕÑÌ€ôÉ…ÝI½ÝÌ4(€€€€¹µ…À ¡É½Ü¤€ôøì4(€€€€€½¹ÍÐÉ•Í½±Ù•€ôÉ•Í½±Ù•I½Ý•Á…ÉÑµ•¹Ð¡É½Ü¤ì4(€€€€€¥˜€ …É•Í½±Ù•¤ì4(€€€€€€€É•ÑÕÉ¸¹Õ±°ì4(€€€€€ô4(4(€€€€€½¹ÍÐÍÑ½É•MÕ‰…Ñ•½Éä€ô4(€€€€€€€É•Í½±Ù•¹½Ù•ÉÉ¥‘”ü¹ÍÑ½É•MÕ‰…Ñ•½Éäñð4(€€€€€€€¹½Éµ…±¥é•MÑ½É•MÕ‰…Ñ•½Éä 4(€€€€€€€€€É½Ü¹Í¥…É…Ñ•½ÉäñðÉ•Í½±Ù•¹½Ù•ÉÉ¥‘”ü¹Í¥…É…Ñ•½Éä°4(€€€€€€€€€É•Í½±Ù•¹‘•Á…ÉÑµ•¹Ñ½¹™¥œ¹ÍÑ½É•…Ñ•½Éå%4(€€€€€€€€¤ñð4(€€€€€€€€=ÑÉ½Ìœì4(4(€€€€€É•ÑÕÉ¸ì4(€€€€€€€½‘”èÉ½Ü¹½‘”°4(€€€€€€€¹…µ”èÉ½Ü¹¹…µ”°4(€€€€€€€ÁÉ¥”è9Õµ‰•È¡É½Ü¹ÁÉ¥”¹Ñ½¥á• È¤¤°4(€€€€€€€Õ¹¥Ðè¹½Éµ…±¥é•MÑ½É•U¹¥Ð¡É½Ü¹Õ¹¥Ð¤°4(€€€€€€€…Ñ•½ÉäèÉ•Í½±Ù•¹‘•Á…ÉÑµ•¹Ñ½¹™¥œ¹ÍÑ½É•…Ñ•½Éå%°4(€€€€€€€…Ñ•½Éå1…‰•°èÉ•Í½±Ù•¹‘•Á…ÉÑµ•¹Ñ½¹™¥œ¹ÍÑ½É•…Ñ•½Éå1…‰•°°4(€€€€€€€ÍÕ‰…Ñ•½ÉäèÍÑ½É•MÕ‰…Ñ•½Éä°4(€€€€€€€…Ñ¥Ù”èÑÉÕ”°4(€€€€€€€ÁÉ½µ¼è™…±Í”°4(€€€€€€€‘•ÍÉ¥ÁÑ¥½¸è€œœ°4(€€€€€€€Í¥…Èèì4(€€€€€€€€€…ÉÑ%èÉ½Ü¹…ÉÑ%°4(€€€€€€€€€‘•Á…ÉÑµ•¹ÐèÉ•Í½±Ù•¹‘•Á…ÉÑµ•¹Ñ9…µ”°4(€€€€€€€€€…Ñ•½ÉäèÉ•Í½±Ù•¹½Ù•ÉÉ¥‘”ü¹Í¥…É…Ñ•½ÉäñðÉ½Ü¹Í¥…É…Ñ•½Éä°4(€€€€€€€€€‰…Í•AÉ¥”è9Õµ‰•È¡É½Ü¹‰…Í•AÉ¥”¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€Ñ…áI…Ñ•AÐè9Õµ‰•È¡É½Ü¹Ñ…áI…Ñ•AÐ¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€ÅÕ…¹Ñ¥ÑåM½±ÌÁè9Õµ‰•È¡É½Ü¹ÅÕ…¹Ñ¥ÑåM½±¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€…µ½Õ¹ÑM½±ÌÁè9Õµ‰•È¡É½Ü¹…µ½Õ¹ÑM½±¹Ñ½¥á• È¤¤°4(€€€€€€€€€Ñ¥­•ÑÌÌÁèÉ½Ü¹Ñ¥­•ÑÌ°4(€€€€€€€€€¥µ…•%èÉ½Ü¹¥µ…•%°4(€€€€€€€€€¥µ…•!…Í èÉ½Ü¹¥µ…•!…Í °4(€€€€€€€€€¡…Í%µ…”èÉ½Ü¹¥µ…•%€ø€À°4(€€€€€€€ô°4(€€€€€ôì4(€€€ô¤4(€€€€¹™¥±Ñ•È¡	½½±•…¸¤4(€€€€¹Í½ÉÐ ¡±•™Ð°É¥¡Ð¤€ôøì4(€€€€€½¹ÍÐ±•™ÑEÑä€ô9Õµ‰•È¡±•™Ðü¹Í¥…Èü¹ÅÕ…¹Ñ¥ÑåM½±ÌÁñð€À¤ì4(€€€€€½¹ÍÐÉ¥¡ÑEÑä€ô9Õµ‰•È¡É¥¡Ðü¹Í¥…Èü¹ÅÕ…¹Ñ¥ÑåM½±ÌÁñð€À¤ì4(€€€€€¥˜€¡É¥¡ÑEÑä€„ôô±•™ÑEÑä¤ì4(€€€€€€€É•ÑÕÉ¸É¥¡ÑEÑä€´±•™ÑEÑäì4(€€€€€ô4(4(€€€€€É•ÑÕÉ¸MÑÉ¥¹œ¡±•™Ðü¹¹…µ”ñð€œœ¤¹±½…±•½µÁ…É”¡MÑÉ¥¹œ¡É¥¡Ðü¹¹…µ”ñð€œœ¤°€•Ìœ°ì4(€€€€€€€Í•¹Í¥Ñ¥Ù¥Ñäè€‰…Í”œ°4(€€€€€ô¤ì4(€€€ô¤ì4(4(€É•ÑÕÉ¸ì4(€€€•¹•É…Ñ•‘Ðè¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤°4(€€€‘…Ñ•]¥¹‘½Üèì4(€€€€€ÍÑ…ÉÑ…Ñ”°4(€€€€€•¹‘%¹±ÕÍ¥Ù•…Ñ”°4(€€€€€•¹‘á±ÕÍ¥Ù•…Ñ”°4(€€€ô°4(€€€‘…åÍ	…¬èÉ•Í½±Ù•‘…åÍ	…¬°4(€€€ÁÉ½‘ÕÑÌ°4(€ôì4)ôì4(4)½¹ÍÐ•Ñ%µ…•½ÉM­Ô€ô…Íå¹Œ€¡½‘”¤€ôøì4(€½¹ÍÐÍ…™•½‘”€ôÍÅ±Í…Á”¡½‘”¤ì4(€½¹ÍÐÉ½ÝÌ€ô…Ý…¥ÐÉÕ¹5åÍÅ±EÕ•Éä¡€4(€€€M1P4(€€€€€„¹±…Ù”°4(€€€€€¥µœ¹¥µ}¥°4(€€€€€UAAH¡!`¡MU	MQI%9¡¤¹¥µ…•¸°€Ä°€ÄÈ¤¤¤°4(€€€€€!`¡¤¹¥µ…•¸¤4(€€€I=4…ÉÑ¥Õ±¼„4(€€€%99H)=%8€ 4(€€€€€M1P4(€€€€€€€…ÉÑ}¥°4(€€€€€€€=1M¡5`¡M]!8Í•±•¥½¹…‘„€ô€ÄQ!8¥µ}¥1M9U109¤°5%8¡¥µ}¥¤¤L¥µ}¥4(€€€€€I=4…ÉÑ¥Õ±½¥µ…•¸4(€€€€€I=U@	d…ÉÑ}¥4(€€€€¤¥µœ=8¥µœ¹…ÉÑ}¥€ô„¹…ÉÑ}¥4(€€€%99H)=%8¥µ…•¸¤=8¤¹¥µ}¥€ô¥µœ¹¥µ}¥4(€€€]!I„¹±…Ù”€ô€œ‘íÍ…™•½‘•ôœ4(€€€1%5%P€Äì4(€€¤ì4(4(€¥˜€ …É½ÝÌ¹±•¹Ñ ¤ì4(€€€É•ÑÕÉ¸¹Õ±°ì4(€ô4(4(€½¹ÍÐÁ…ÉÑÌ€ôÉ½ÝÍlÁt¹ÍÁ±¥Ð qÐœ¤ì4(€¥˜€¡Á…ÉÑÌ¹±•¹Ñ €ð€Ð¤ì4(€€€É•ÑÕÉ¸¹Õ±°ì4(€ô4(4(€½¹ÍÐ¥µ…•!•à€ôMÑÉ¥¹œ¡Á…ÉÑÍlÍtñð€œœ¤¹ÑÉ¥´ ¤ì4(€¥˜€ …¥µ…•!•à¤ì4(€€€É•ÑÕÉ¸¹Õ±°ì4(€ô4(4(€½¹ÍÐµ¥µ•QåÁ”€ô•Ñ5¥µ•QåÁ•É½µ!•à¡Á…ÉÑÍlÉt¤ì4(€½¹ÍÐ‰…Í”ØÐ€ô	Õ™™•È¹™É½´¡¥µ…•!•à°€¡•àœ¤¹Ñ½MÑÉ¥¹œ ‰…Í”ØÐœ¤ì4(4(€É•ÑÕÉ¸ì4(€€€½‘”èMÑÉ¥¹œ¡Á…ÉÑÍlÁtñð€œœ¤¹ÑÉ¥´ ¤°4(€€€¥µ…•%è9Õµ‰•È¡Á…ÉÑÍlÅtñð€À¤°4(€€€µ¥µ•QåÁ”°4(€€€‘…Ñ…UÉ°è‘…Ñ„è‘íµ¥µ•QåÁ•ôí‰…Í”ØÐ°‘í‰…Í”ØÑõ€°4(€ôì4)ôì4(4)½¹ÍÐ¥ÍY•ÉÍ¥½¹•‘Á¥A…Ñ €ô€¡Á…Ñ¡¹…µ”€ô€œœ¤€ôøMÑÉ¥¹œ¡Á…Ñ¡¹…µ”ñð€œœ¤¹ÍÑ…ÉÑÍ]¥Ñ  œ½…Á¤½ØÄ½Í¥…È¼œ¤ì4)½¹ÍÐÉ•…‘Á¥-•ä€ô€¡É•ÅÕ•ÍÐ¤€ôøì4(€½¹ÍÐ‘¥É•Ñ-•ä€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÐü¹¡•…‘•ÉÌü¹làµÍ…¹µ…ÉÑ¥¸µ…Á¤µ­•ätñð€œœ¤¹ÑÉ¥´ ¤ì4(€¥˜€¡‘¥É•Ñ-•ä¤É•ÑÕÉ¸‘¥É•Ñ-•äì4(€½¹ÍÐ…ÕÑ¡½É¥é…Ñ¥½¸€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÐü¹¡•…‘•ÉÌü¹…ÕÑ¡½É¥é…Ñ¥½¸ñð€œœ¤¹ÑÉ¥´ ¤ì4(€É•ÑÕÉ¸…ÕÑ¡½É¥é…Ñ¥½¸¹Ñ½1½Ý•É…Í” ¤¹ÍÑ…ÉÑÍ]¥Ñ  ‰•…É•È€œ¤€ü…ÕÑ¡½É¥é…Ñ¥½¸¹Í±¥” Ü¤¹ÑÉ¥´ ¤€è€œœì4)ôì4)½¹ÍÐ¡…ÍÁ¥•ÍÌ€ô€¡É•ÅÕ•ÍÐ°Á…Ñ¡¹…µ”¤€ôøì4(€¥˜€ …¥ÍY•ÉÍ¥½¹•‘Á¥A…Ñ ¡Á…Ñ¡¹…µ”¤¤É•ÑÕÉ¸ÑÉÕ”ì4(€¥˜€ …‰É¥‘•½¹™¥œ¹…Á¥-•ä¤É•ÑÕÉ¸¥Í1½…±	É¥‘•!½ÍÑ¹…µ”¡‰É¥‘•½¹™¥œ¹‰¥¹‘!½ÍÐ¤ì4(€É•ÑÕÉ¸É•…‘Á¥-•ä¡É•ÅÕ•ÍÐ¤€ôôô‰É¥‘•½¹™¥œ¹…Á¥-•äì4)ôì4)½¹ÍÐÉ½ÕÑ•5…Ñ¡•Ì€ô€¡Á…Ñ¡¹…µ”°€¸¸¹É½ÕÑ•Ì¤€ôøÉ½ÕÑ•Ì¹¥¹±Õ‘•Ì¡Á…Ñ¡¹…µ”¤ì4)½¹ÍÐÝ¥Ñ¡	É…¹ €ô€¡Á…å±½…€ôíô¤€ôø€¡ì4(€€¸¸¹Á…å±½…°4(€‰É…¹¡%è‰É¥‘•½¹™¥œ¹‰É…¹¡%°4)ô¤ì4(4)½¹ÍÐÉ½ÕÑ•I•ÅÕ•ÍÐ€ô…Íå¹Œ€¡É•ÅÕ•ÍÐ°É•ÅÕ•ÍÑUÉ°°É•ÅÕ•ÍÑ	½‘ä€ô¹Õ±°¤€ôøì4(€¥˜€ …¡…ÍÁ¥•ÍÌ¡É•ÅÕ•ÍÐ°É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”¤¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÐÀÄ°ì½¬è™…±Í”°•ÉÉ½Èè€É•‘•¹¥…°‘”¥¹Ñ•É…¥½¸¥¹Ù…±¥‘„¸œô¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½¡•…±Ñ œ°€œ½…Á¤½ØÄ½Í¥…È½¡•…±Ñ œ¤¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°ì4(€€€€€½¬èÑÉÕ”°4(€€€€€…Á¥Y•ÉÍ¥½¸è€ØÄœ°4(€€€€€‰É…¹¡%è‰É¥‘•½¹™¥œ¹‰É…¹¡%°4(€€€€€‰É¥‘•A½ÉÐè‰É¥‘•½¹™¥œ¹‰É¥‘•A½ÉÐ°4(€€€€€‰¥¹‘!½ÍÐè‰É¥‘•½¹™¥œ¹‰¥¹‘!½ÍÐ°4(€€€€€…Á¥-•å½¹™¥ÕÉ•è	½½±•…¸¡‰É¥‘•½¹™¥œ¹…Á¥-•ä¤°4(€€€€€½¹™¥A…Ñ è±½…±½¹™¥A…Ñ ñð€•¹Øµ½¹±äœ°4(€€€€€Ý°4(€€€€€É•Á½I½½Ð°4(€€€€€µåÍÅ±á•A…Ñ è‰É¥‘•½¹™¥œ¹µåÍÅ±á•A…Ñ °4(€€€€€‘…Ñ…‰…Í”è‰É¥‘•½¹™¥œ¹‘…Ñ…‰…Í”°4(€€€€€¡½ÍÐè‰É¥‘•½¹™¥œ¹¡½ÍÐ°4(€€€€€‘•Á…ÉÑµ•¹ÑÌèM%I}Me9}AIQ59QL¹µ…À ¡•¹ÑÉä¤€ôø•¹ÑÉä¹Í¥…É•Á…ÉÑµ•¹Ð¤°4(€€€€€ÅÕ½Ñ•Må¹¹…‰±•è9	1}M%I}EU=Q}Me9°4(€€€€€‰…­É½Õ¹‘Må¹¹…‰±•è‰É¥‘•½¹™¥œ¹•¹…‰±•	…­É½Õ¹‘Må¹Œ°4(€€€€€ÅÕ½Ñ•Må¹ŒèÍ¥…ÉEÕ½Ñ•Må¹Œ¹ÍÑ…Ñ”°4(€€€€€±¥•¹ÑMå¹ŒèÍ¥…É±¥•¹ÑMå¹Œ¹ÍÑ…Ñ”°4(€€€€€É•Ý…É‘ÍMå¹ŒèÍÑ½É•I•Ý…É‘ÍMå¹Œ¹ÍÑ…Ñ”°4(€€€€€Ý•±½µ•½ÕÁ½¹Må¹ŒèÍÑ½É•]•±½µ•½ÕÁ½¹Må¹Œ¹ÍÑ…Ñ”°4(€€€€€½É‘•ÉÉ¡¥Ù”è½É‘•ÉÉ¡¥Ù”¹ÍÑ…Ñ”°4(€€€ô¤ì4(€ô4(4(€¥˜€¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”€ôôô€œ½…Á¤½½É‘•ÉÌ½¡¥ÍÑ½Éäœ¤ì4(€€€½¹ÍÐ‘…Ñ•É½´€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÑUÉ°¹Í•…É¡A…É…µÌ¹•Ð ‘…Ñ•É½´œ¤ñð€œœ¤¹ÑÉ¥´ ¤ì4(€€€½¹ÍÐ‘…Ñ•Q¼€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÑUÉ°¹Í•…É¡A…É…µÌ¹•Ð ‘…Ñ•Q¼œ¤ñð€œœ¤¹ÑÉ¥´ ¤ì4(4(€€€¥˜€ …‘…Ñ•É½´ñð€…‘…Ñ•Q¼¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÀ°ì4(€€€€€€€½¬è™…±Í”°4(€€€€€€€•ÉÉ½Èè€•‰•Ì•¹Ù¥…È‘…Ñ•É½´ä‘…Ñ•Q¼•¸™½Éµ…Ñ¼eeedµ54µ¸œ°4(€€€€€ô¤ì4(€€€ô4(4(€€€½¹ÍÐ½É‘•ÉÌ€ô…Ý…¥Ð½É‘•ÉÉ¡¥Ù”¹™•Ñ¡!¥ÍÑ½Éå	å…Ñ•I…¹”¡‘…Ñ•É½´°‘…Ñ•Q¼¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°ì4(€€€€€½¬èÑÉÕ”°4(€€€€€‘…Ñ•É½´°4(€€€€€‘…Ñ•Q¼°4(€€€€€½Õ¹Ðè½É‘•ÉÌ¹±•¹Ñ °4(€€€€€½É‘•ÉÌ°4(€€€ô¤ì4(€ô4(4(€¥˜€¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”€ôôô€œ½…Á¤½ÍÑ½É”½É•Ý…É‘Ì½É•½¹¥±”µ¡¥ÍÑ½Éäœ¤ì4(€€€½¹ÍÐÁ…å±½…€ô…Ý…¥ÐÍÑ½É•I•Ý…É‘ÍMå¹Œ¹É•½¹¥±•É¡¥Ù•‘I•Ý…É‘Ì ¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Á…å±½…¤ì4(€ô4(4(€¥˜€¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”€ôôô€œ½…Á¤½É´½‘…Í¡‰½…Éœ¤ì4(€€€½¹ÍÐÁ…å±½…€ô…Ý…¥Ð•ÑÉµ…Í¡‰½…É‘M¹…ÁÍ¡½Ð¡ì4(€€€€€™½É”è4(€€€€€€€MÑÉ¥¹œ¡É•ÅÕ•ÍÑUÉ°¹Í•…É¡A…É…µÌ¹•Ð ™½É”œ¤ñð€œœ¤4(€€€€€€€€€€¹ÑÉ¥´ ¤4(€€€€€€€€€€¹Ñ½1½Ý•É…Í” ¤€ôôô€ÑÉÕ”œ°4(€€€ô¤ì4(4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Á…å±½…¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½…Ñ…±½œœ°€œ½…Á¤½ØÄ½Í¥…È½…Ñ…±½œœ¤¤ì4(€€€½¹ÍÐÁ…å±½…€ô…Ý…¥Ð‰Õ¥±‘…Ñ…±½M•±•Ñ¥½¸ ¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Ý¥Ñ¡	É…¹ ¡Á…å±½…¤¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½…Ñ…±½œµÉ••¹Ðœ°€œ½…Á¤½ØÄ½Í¥…È½…Ñ…±½œ½É••¹Ðœ¤¤ì4(€€€½¹ÍÐ‘…åÌ€ô9Õµ‰•È¡É•ÅÕ•ÍÑUÉ°¹Í•…É¡A…É…µÌ¹•Ð ‘…åÌœ¤ñð€ÌÀ¤ì4(€€€½¹ÍÐÁ…å±½…€ô…Ý…¥Ð‰Õ¥±‘I••¹ÑM½±‘…Ñ…±½M•±•Ñ¥½¸¡‘…åÌ¤ì4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Ý¥Ñ¡	É…¹ ¡Á…å±½…¤¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½¥µ…”œ°€œ½…Á¤½ØÄ½Í¥…È½¥µ…”œ¤¤ì4(€€€½¹ÍÐ½‘”€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÑUÉ°¹Í•…É¡A…É…µÌ¹•Ð ½‘”œ¤ñð€œœ¤¹ÑÉ¥´ ¤ì4(€€€¥˜€ …½‘”¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÀ°ì½¬è™…±Í”°•ÉÉ½Èè€…±Ñ„•°½‘¥¼‘•°M-T¸œô¤ì4(€€€ô4(4(€€€½¹ÍÐ¥µ…”€ô…Ý…¥Ð•Ñ%µ…•½ÉM­Ô¡½‘”¤ì4(€€€¥˜€ …¥µ…”¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÐ°ì½¬è™…±Í”°•ÉÉ½Èè€9¼Í”•¹½¹ÑÉ¼¥µ…•¸Á…É„•Í”M-T¸œô¤ì4(€€€ô4(4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Ý¥Ñ¡	É…¹ ¡¥µ…”¤¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½ÁÉ¥•Ìœ°€œ½…Á¤½ØÄ½Í¥…È½ÁÉ¥•Ìœ¤¤ì4(€€€¥˜€¡MÑÉ¥¹œ¡É•ÅÕ•ÍÐ¹µ•Ñ¡½ñð€œœ¤¹Ñ½UÁÁ•É…Í” ¤€„ôô€A=MPœ¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÔ°ì½¬è™…±Í”°•ÉÉ½Èè€5•Ñ½‘¼¹¼Á•Éµ¥Ñ¥‘¼¸œô¤ì4(€€€ô4(4(€€€½¹ÍÐÉ•ÅÕ•ÍÑ•‘½‘•Ì€ôÉÉ…ä¹¥ÍÉÉ…ä¡É•ÅÕ•ÍÑ	½‘äü¹½‘•Ì¤€üÉ•ÅÕ•ÍÑ	½‘ä¹½‘•Ì€èmtì4(€€€½¹ÍÐÁÉ½‘ÕÑÌ€ô…Ý…¥Ð•ÑM¥…ÉAÉ¥•I½ÝÍ	å½‘•Ì¡É•ÅÕ•ÍÑ•‘½‘•Ì¤ì4(4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Ý¥Ñ¡	É…¹ ¡ì4(€€€€€½¬èÑÉÕ”°4(€€€€€É•ÅÕ•ÍÑ•‘½‘•ÌèÉÉ…ä¹™É½´¡¹•ÜM•Ð¡É•ÅÕ•ÍÑ•‘½‘•Ì¹µ…À ¡½‘”¤€ôøMÑÉ¥¹œ¡½‘”ñð€œœ¤¹ÑÉ¥´ ¤¤¹™¥±Ñ•È¡	½½±•…¸¤¤¤¹±•¹Ñ °4(€€€€€µ…Ñ¡•‘½‘•ÌèÁÉ½‘ÕÑÌ¹±•¹Ñ °4(€€€€€ÁÉ½‘ÕÑÌèÁÉ½‘ÕÑÌ¹µ…À ¡É½Ü¤€ôø€¡ì4(€€€€€€€½‘”èÉ½Ü¹½‘”°4(€€€€€€€¹…µ”èÉ½Ü¹¹…µ”°4(€€€€€€€ÁÉ¥”è9Õµ‰•È¡É½Ü¹ÁÉ¥”¹Ñ½¥á• È¤¤°4(€€€€€€€Õ¹¥Ðè¹½Éµ…±¥é•MÑ½É•U¹¥Ð¡É½Ü¹Õ¹¥Ð¤°4(€€€€€€€Í¥…Èèì4(€€€€€€€€€…ÉÑ%èÉ½Ü¹…ÉÑ%°4(€€€€€€€€€‘•Á…ÉÑµ•¹ÐèÉ½Ü¹Í¥…É•Á…ÉÑµ•¹Ð°4(€€€€€€€€€…Ñ•½ÉäèÉ½Ü¹Í¥…É…Ñ•½Éä°4(€€€€€€€€€‰…Í•AÉ¥”è9Õµ‰•È¡É½Ü¹‰…Í•AÉ¥”¹Ñ½¥á• Ð¤¤°4(€€€€€€€€€Ñ…áI…Ñ•AÐè9Õµ‰•È¡É½Ü¹Ñ…áI…Ñ•AÐ¹Ñ½¥á• Ð¤¤°4(€€€€€€€ô°4(€€€€€ô¤¤°4(€€€ô¤¤ì4(€ô4(4(€¥˜€¡É½ÕÑ•5…Ñ¡•Ì¡É•ÅÕ•ÍÑUÉ°¹Á…Ñ¡¹…µ”°€œ½…Á¤½Í¥…È½ÅÕ½Ñ”œ°€œ½…Á¤½ØÄ½Í¥…È½ÅÕ½Ñ”œ¤¤ì4(€€€¥˜€¡MÑÉ¥¹œ¡É•ÅÕ•ÍÐ¹µ•Ñ¡½ñð€œœ¤¹Ñ½UÁÁ•É…Í” ¤€„ôô€A=MPœ¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÔ°ì½¬è™…±Í”°•ÉÉ½Èè€5•Ñ½‘¼¹¼Á•Éµ¥Ñ¥‘¼¸œô¤ì4(€€€ô4(4(€€€¥˜€ …9	1}M%I}EU=Q}Me9¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÔÀÌ°ì4(€€€€€€€½¬è™…±Í”°4(€€€€€€€•ÉÉ½Èè€1„É•…¥½¸‘”½Ñ¥é…¥½¹•ÌM%H•ÍÑ„‘•Í…Ñ¥Ù…‘„Ñ•µÁ½É…±µ•¹Ñ”µ¥•¹ÑÉ…ÌÉ•Ù¥Í…µ½Ì±„•ÍÑÉÕÑÕÉ„½ÉÉ•Ñ„¸œ°4(€€€€€ô¤ì4(€€€ô4(4(€€€½¹ÍÐ½É‘•É-•ä€ôMÑÉ¥¹œ¡É•ÅÕ•ÍÑ	½‘äü¹½É‘•É-•äñð€œœ¤¹ÑÉ¥´ ¤ì4(€€€¥˜€ …½É‘•É-•ä¤ì4(€€€€€É•ÑÕÉ¸©Í½¸ ÐÀÀ°ì½¬è™…±Í”°•ÉÉ½Èè€…±Ñ„•°½É‘•É-•ä‘•°Á•‘¥‘¼¸œô¤ì4(€€€ô4(4(€€€½¹ÍÐ…ÁÁ±åQ½¥É•‰…Í”€ô4(€€€€€É•ÅÕ•ÍÑ	½‘äü¹…ÁÁ±åQ½¥É•‰…Í”€ôôôÑÉÕ”ñð4(€€€€€MÑÉ¥¹œ¡É•ÅÕ•ÍÑ	½‘äü¹…ÁÁ±åQ½¥É•‰…Í”ñð€œœ¤¹ÑÉ¥´ ¤¹Ñ½1½Ý•É…Í” ¤€ôôô€ÑÉÕ”œì4(4(€€€½¹ÍÐÁ…å±½…€ô…Ý…¥ÐÍ¥…ÉEÕ½Ñ•Må¹Œ¹Íå¹=É‘•ÉEÕ½Ñ”¡½É‘•É-•ä°ì4(€€€€€…ÁÁ±åQ½¥É•‰…Í”°4(€€€ô¤ì4(4(€€€É•ÑÕÉ¸©Í½¸ ÈÀÀ°Ý¥Ñ¡	É…¹ ¡ì4(€€€€€½¬èÑÉÕ”°4(€€€€€½É‘•É-•äèÁ…å±½…¹½É‘•É-•ä°4(€€€€€…ÁÁ±åQ½¥É•‰…Í”°4(€€€€€É•…Ñ•‘EÕ½Ñ”èÁ…å±½…¹É•…Ñ•‘EÕ½Ñ”°4(€€€€€µ¥ÍÍ¥¹½‘•ÌèÁ…å±½…¹µ¥ÍÍ¥¹½‘•Ì°4(€€€€€ÕÍÑ½µ•ÉA¡½¹”èÁ…å±½…¹ÕÍÑ½µ•ÉA¡½¹”°4(€€€€€ÕÍÑ½µ•É9…µ”èÁ…å±½…¹ÕÍÑ½µ•É9…µ”°4(€€€€€Ý¡…ÑÍ…ÁÁ5•ÍÍ…”èÁ…å±½…¹Ý¡…ÑÍ…ÁÁ5•ÍÍ…”°4(€€€€€ÅÕ½Ñ”èÁ…å±½…¹ÅÕ½Ñ”°4(€€€ô¤¤ì4(€ô4(4(€É•ÑÕÉ¸Ñ•áÐ ÐÀÐ°€M%H‰É¥‘”…Ñ¥Ù¼œ¤ì4)ôì4(4)½¹ÍÐÉ•…‘)Í½¹	½‘ä€ô€¡É•ÅÕ•ÍÐ¤€ôø4(€¹•ÜAÉ½µ¥Í” ¡É•Í½±Ù•AÉ½µ¥Í”°É•©•ÑAÉ½µ¥Í”¤€ôøì4(€€€±•ÐÉ…Ý	½‘ä€ô€œœì4(4(€€€É•ÅÕ•ÍÐ¹½¸ ‘…Ñ„œ°€¡¡Õ¹¬¤€ôøì4(€€€€€É…Ý	½‘ä€¬ô¡Õ¹¬¹Ñ½MÑÉ¥¹œ ÕÑ˜àœ¤ì4(€€€€€¥˜€¡É…Ý	½‘ä¹±•¹Ñ €ø€ÄÀÈÐ€¨€ÄÀÈÐ€¨€È¤ì4(€€€€€€€É•©•ÑAÉ½µ¥Í”¡¹•ÜÉÉ½È °Õ•ÉÁ¼‘”±„Í½±¥¥ÑÕ•Ì‘•µ…Í¥…‘¼É…¹‘”¸œ¤¤ì4(€€€€€€€É•ÅÕ•ÍÐ¹‘•ÍÑÉ½ä ¤ì4(€€€€€ô4(€€€ô¤ì4(4(€€€É•ÅÕ•ÍÐ¹½¸ •¹œ°€ ¤€ôøì4(€€€€€½¹ÍÐ±•…¹	½‘ä€ôÉ…Ý	½‘ä¹ÑÉ¥´ ¤ì4(€€€€€¥˜€ …±•…¹	½‘ä¤ì4(€€€€€€€É•Í½±Ù•AÉ½µ¥Í”¡íô¤ì4(€€€€€€€É•ÑÕÉ¸ì4(€€€€€ô4(4(€€€€€ÑÉäì4(€€€€€€€É•Í½±Ù•AÉ½µ¥Í”¡)M=8¹Á…ÉÍ”¡±•…¹	½‘ä¤¤ì4(€€€€€ô…Ñ €¡•ÉÉ½È¤ì4(€€€€€€€É•©•ÑAÉ½µ¥Í”¡¹•ÜÉÉ½È °Õ•ÉÁ¼)M=8‘”±„Í½±¥¥ÑÕ¹¼•ÌÙ…±¥‘¼¸œ¤¤ì4(€€€€€ô4(€€€ô¤ì4(4(€€€É•ÅÕ•ÍÐ¹½¸ •ÉÉ½Èœ°€¡•ÉÉ½È¤€ôøÉ•©•ÑAÉ½µ¥Í”¡•ÉÉ½È¤¤ì4(€ô¤ì4(4)½¹ÍÐÍ•ÉÙ•È€ôÉ•…Ñ•M•ÉÙ•È¡…Íå¹Œ€¡É•ÅÕ•ÍÐ°É•ÍÁ½¹Í”¤€ôøì4(€¥˜€ …É•ÅÕ•ÍÐ¹ÕÉ°¤ì4(€€€ÝÉ¥Ñ•I•ÍÁ½¹Í”¡É•ÅÕ•ÍÐ°É•ÍÁ½¹Í”°©Í½¸ ÐÀÀ°ì½¬è™…±Í”°•ÉÉ½Èè€M½±¥¥ÑÕ¥¹Ù…±¥‘„¸œô¤¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€¥˜€¡É•ÅÕ•ÍÐ¹µ•Ñ¡½€ôôô€=AQ%=9Lœ¤ì4(€€€ÝÉ¥Ñ•I•ÍÁ½¹Í”¡É•ÅÕ•ÍÐ°É•ÍÁ½¹Í”°©Í½¸ ÈÀÐ°íô¤¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€¥˜€ …lPœ°€A=MPt¹¥¹±Õ‘•Ì¡MÑÉ¥¹œ¡É•ÅÕ•ÍÐ¹µ•Ñ¡½ñð€œœ¤¹Ñ½UÁÁ•É…Í” ¤¤¤ì4(€€€ÝÉ¥Ñ•I•ÍÁ½¹Í”¡É•ÅÕ•ÍÐ°É•ÍÁ½¹Í”°©Í½¸ ÐÀÔ°ì½¬è™…±Í”°•ÉÉ½Èè€5•Ñ½‘¼¹¼Á•Éµ¥Ñ¥‘¼¸œô¤¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(4(€ÑÉäì4(€€€½¹ÍÐÉ•ÅÕ•ÍÑUÉ°€ô¹•ÜUI0¡É•ÅÕ•ÍÐ¹ÕÉ°°¡ÑÑÀè¼¼ÄÈÜ¸À¸À¸Äè‘í‰É¥‘•½¹™¥œ¹‰É¥‘•A½ÉÑõ€¤ì4(€€€½¹ÍÐÉ•ÅÕ•ÍÑ	½‘ä€ôÉ•ÅÕ•ÍÐ¹µ•Ñ¡½€ôôô€A=MPœ€ü…Ý…¥ÐÉ•…‘)Í½¹	½‘ä¡É•ÅÕ•ÍÐ¤€è¹Õ±°ì4(€€€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÉ½ÕÑ•I•ÅÕ•ÍÐ¡É•ÅÕ•ÍÐ°É•ÅÕ•ÍÑUÉ°°É•ÅÕ•ÍÑ	½‘ä¤ì4(€€€ÝÉ¥Ñ•I•ÍÁ½¹Í”¡É•ÅÕ•ÍÐ°É•ÍÁ½¹Í”°É•ÍÕ±Ð¤ì4(€ô…Ñ €¡•ÉÉ½È¤ì4(€€€ÝÉ¥Ñ•I•ÍÁ½¹Í” 4(€€€€€É•ÅÕ•ÍÐ°4(€€€€€É•ÍÁ½¹Í”°4(€€€€€©Í½¸ ÔÀÀ°ì4(€€€€€€€½¬è™…±Í”°4(€€€€€€€•ÉÉ½Èè•ÉÉ½Èü¹µ•ÍÍ…”ñð€…±±¼¥¹Ñ•É¹¼•¸M%H‰É¥‘”¸œ°4(€€€€€ô¤4(€€€€¤ì4(€ô4)ô¤ì4(4)Í•ÉÙ•È¹±¥ÍÑ•¸¡‰É¥‘•½¹™¥œ¹‰É¥‘•A½ÉÐ°‰É¥‘•½¹™¥œ¹‰¥¹‘!½ÍÐ°€ ¤€ôøì4(€½¹Í½±”¹±½œ 4(€€€M%H‰É¥‘”€‘í‰É¥‘•½¹™¥œ¹‰É…¹¡%‘ô•ÍÕ¡…¹‘¼•¸¡ÑÑÀè¼¼‘í‰É¥‘•½¹™¥œ¹‰¥¹‘!½ÍÑôè‘í‰É¥‘•½¹™¥œ¹‰É¥‘•A½ÉÑõ€4(€€¤ì4(€¥˜€ …‰É¥‘•½¹™¥œ¹•¹…‰±•	…­É½Õ¹‘Må¹Œ¤ì4(€€€½¹Í½±”¹±½œ¡M¥¹É½¹¥é…¥½¹•Ì‘”™½¹‘¼‘•Í…Ñ¥Ù…‘…ÌÁ…É„€‘í‰É¥‘•½¹™¥œ¹‰É…¹¡%‘ô¹€¤ì4(€€€É•ÑÕÉ¸ì4(€ô4(€¥˜€¡%M}AI%5Ie}1=	1}Me9}	I9 ¤ì4(€€€¥˜€¡‰É¥‘•½¹™¥œ¹•¹…‰±•±¥•¹ÑMå¹Œ¤ì4(€€€€€Í¥…É±¥•¹ÑMå¹Œ¹¥¹¥ÑÕÑ½Må¹Œ ¤ì4(€€€ô•±Í”ì4(€€€€€½¹Í½±”¹±½œ¡M¥¹É½¹¥é…¥½¸•¹•É…°‘”±¥•¹Ñ•Ì‘•Í…Ñ¥Ù…‘„Á…É„€‘í‰É¥‘•½¹™¥œ¹‰É…¹¡%‘ô¹€¤ì4(€€€ô4(€€€ÍÑ½É•I•Ý…É‘ÍMå¹Œ¹¥¹¥ÑÕÑ½Må¹Œ ¤4(€€€€€€¹…Ñ  ¡•ÉÉ½È¤€ôøì4(€€€€€€€½¹Í½±”¹•ÉÉ½È 9¼Í”ÁÕ‘¼¥¹¥¥…È±„Í¥¹É½¹¥é…¥½¸‘”É•½µÁ•¹Í…Ìèœ°•ÉÉ½È¤ì4(€€€€€ô¤4(€€€€€€¹™¥¹…±±ä  ¤€ôøì4(€€€€€€€½É‘•ÉÉ¡¥Ù”¹¥¹¥ÑÕÑ½É¡¥Ù” ¤ì4(€€€€€ô¤ì4(€€€ÍÑ½É•]•±½µ•½ÕÁ½¹Må¹Œ¹¥¹¥ÑÕÑ½Må¹Œ ¤¹…Ñ  ¡•ÉÉ½È¤€ôøì4(€€€€€½¹Í½±”¹•ÉÉ½È 9¼Í”ÁÕ‘¼¥¹¥¥…È±„Í¥¹É½¹¥é…¥½¸‘•°ÕÁ½¸‘”‰¥•¹Ù•¹¥‘„èœ°•ÉÉ½È¤ì4(€€€ô¤ì4(€ô•±Í”ì4(€€€½¹Í½±”¹±½œ 4(€€€€€AÉ½•Í½Ì±½‰…±•Ì‘”±¥•¹Ñ•Ì°É•½µÁ•¹Í…Ì°ÕÁ½¹•Ìä…É¡¥Ù¼É•Í•ÉÙ…‘½ÌÁ…É„É…¹…‘„ì€‘í‰É¥‘•½¹™¥œ¹‰É…¹¡%‘ô•©•ÕÑ„Í½±¼½Ñ¥é…¥½¹•ÌM%H¹€4(€€€€¤ì4(€ô4(€¥˜€¡9	1}M%I}EU=Q}Me9¤ì4(€€€Í¥…ÉEÕ½Ñ•Må¹Œ¹¥¹¥ÑÕÑ½Må¹Œ ¤ì4(€ô•±Í”ì4(€€€½¹Í½±”¹±½œ ½Ñ¥é…¥½¹•ÌM%H‘•Í…Ñ¥Ù…‘…ÌÑ•µÁ½É…±µ•¹Ñ”¸œ¤ì4(€ô4)ô¤ì4(