import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SICAR_MIN_OVERALL_SHARE_PCT,
  SICAR_SPECIAL_SKU_OVERRIDES,
  SICAR_SYNC_DEPARTMENTS,
  SICAR_SYNC_THRESHOLD_PCT,
  getSicarDepartmentConfig,
} from '../src/data/sicarCatalogRules.js';

const cwd = process.cwd();
const localConfigPath = resolve(cwd, 'sicar.local.json');
const localConfig = existsSync(localConfigPath)
  ? JSON.parse(readFileSync(localConfigPath, 'utf8'))
  : {};

const bridgeConfig = {
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
};

const sqlEscape = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const json = (statusCode, payload) => ({
  statusCode,
  body: JSON.stringify(payload, null, 2),
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  },
});

const text = (statusCode, payload) => ({
  statusCode,
  body: payload,
  headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  },
});

const writeResponse = (response, result) => {
  response.writeHead(result.statusCode, result.headers);
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

const normalizeSubcategory = (category, fallbackLabel) => {
  const cleanCategory = String(category || '').trim();
  const normalizedCategory = cleanCategory.toUpperCase();

  if (normalizedCategory === 'PRODUCTO GOLD' || normalizedCategory === 'PRODUCTOS GOLD') {
    return 'Linea Gold';
  }

  if (cleanCategory) {
    return cleanCategory;
  }
  return String(fallbackLabel || '').trim() || 'General';
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
      `-p${bridgeConfig.password}`,
      '-D',
      bridgeConfig.database,
      '-e',
      query,
    ];

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

const buildCatalogSelection = async () => {
  const { startDate, endExclusiveDate, endInclusiveDate } = getWindowDates();
  const totalOverallQuantity = await getOverallQuantityTotal(startDate, endExclusiveDate);
  const rawRows = await getSicarCatalogRows(startDate, endExclusiveDate);

  const normalizedRows = rawRows
    .map((row) => {
      const resolved = resolveRowDepartment(row);
      if (!resolved) {
        return null;
      }

      const storeSubcategory =
        resolved.override?.storeSubcategory ||
        normalizeSubcategory(row.sicarCategory || resolved.override?.sicarCategory, resolved.departmentConfig.storeCategoryLabel);

      return {
        ...row,
        sicarDepartment: resolved.departmentName,
        sicarCategory: resolved.override?.sicarCategory || row.sicarCategory,
        storeCategory: resolved.departmentConfig.storeCategoryId,
        storeCategoryLabel: resolved.departmentConfig.storeCategoryLabel,
        storeSubcategory,
        sortOrder: resolved.departmentConfig.sortOrder,
        hasImage: row.imageId > 0,
      };
    })
    .filter(Boolean);

  const byDepartment = new Map();
  normalizedRows.forEach((row) => {
    if (!byDepartment.has(row.sicarDepartment)) {
      byDepartment.set(row.sicarDepartment, []);
    }
    byDepartment.get(row.sicarDepartment).push(row);
  });

  const summary = [];
  const selectedProducts = [];

  Array.from(byDepartment.entries())
    .sort((left, right) => {
      const leftConfig = getSicarDepartmentConfig(left[0]);
      const rightConfig = getSicarDepartmentConfig(right[0]);
      return Number(leftConfig?.sortOrder || 999) - Number(rightConfig?.sortOrder || 999);
    })
    .forEach(([departmentName, rows]) => {
      const departmentTotal = rows.reduce((sum, row) => sum + Number(row.quantitySold || 0), 0);
      const departmentShare = totalOverallQuantity > 0 ? (departmentTotal / totalOverallQuantity) * 100 : 0;
      if (departmentTotal <= 0 || departmentShare < SICAR_MIN_OVERALL_SHARE_PCT) {
        return;
      }

      const sortedRows = [...rows].sort((left, right) => {
        if (right.quantitySold !== left.quantitySold) {
          return right.quantitySold - left.quantitySold;
        }
        return String(left.name || '').localeCompare(String(right.name || ''));
      });

      let cumulativeQuantity = 0;
      const selectedRows = [];

      sortedRows.forEach((row) => {
        if (selectedRows.length > 0 && cumulativeQuantity / departmentTotal >= SICAR_SYNC_THRESHOLD_PCT / 100) {
          return;
        }

        cumulativeQuantity += Number(row.quantitySold || 0);
        selectedRows.push({
          ...row,
          cumulativeDepartmentPct: Number(((cumulativeQuantity / departmentTotal) * 100).toFixed(2)),
        });
      });

      const subcategories = Array.from(
        new Set(selectedRows.map((row) => String(row.storeSubcategory || '').trim()).filter(Boolean))
      );

      summary.push({
        sicarDepartment: departmentName,
        storeCategory: selectedRows[0]?.storeCategory || '',
        storeCategoryLabel: selectedRows[0]?.storeCategoryLabel || departmentName,
        totalQuantity: Number(departmentTotal.toFixed(4)),
        overallSharePct: Number(departmentShare.toFixed(2)),
        soldSkuCount: sortedRows.length,
        selectedSkuCount: selectedRows.length,
        subcategories,
      });

      selectedRows.forEach((row, index) => {
        selectedProducts.push({
          code: row.code,
          name: row.name,
          price: Number(row.price.toFixed(2)),
          unit: normalizeStoreUnit(row.unit),
          category: row.storeCategory,
          categoryLabel: row.storeCategoryLabel,
          subcategory: row.storeSubcategory,
          active: true,
          promo: false,
          description: '',
          sicar: {
            artId: row.artId,
            department: departmentName,
            category: row.sicarCategory,
            basePrice: Number(row.basePrice.toFixed(4)),
            taxRatePct: Number(row.taxRatePct.toFixed(4)),
            quantitySold90d: Number(row.quantitySold.toFixed(4)),
            amountSold90d: Number(row.amountSold.toFixed(2)),
            tickets90d: row.tickets,
            overallDepartmentSharePct: Number(departmentShare.toFixed(2)),
            departmentRank: index + 1,
            cumulativeDepartmentPct: row.cumulativeDepartmentPct,
            imageId: row.imageId,
            imageHash: row.imageHash,
            hasImage: row.hasImage,
          },
        });
      });
    });

  const categories = summary.map((item) => ({
    id: item.storeCategory,
    label: item.storeCategoryLabel,
    subcategories: item.subcategories,
    active: true,
    sortOrder: getSicarDepartmentConfig(item.sicarDepartment)?.sortOrder || 999,
  }));

  return {
    generatedAt: new Date().toISOString(),
    dateWindow: {
      startDate,
      endInclusiveDate,
      endExclusiveDate,
    },
    rules: {
      thresholdPct: SICAR_SYNC_THRESHOLD_PCT,
      minOverallSharePct: SICAR_MIN_OVERALL_SHARE_PCT,
    },
    totalOverallQuantity: Number(totalOverallQuantity.toFixed(4)),
    summary,
    categories,
    products: selectedProducts,
  };
};

const getImageForSku = async (code) => {
  const safeCode = sqlEscape(code);
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
    WHERE a.clave = '${safeCode}'
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
  const base64 = Buffer.from(imageHex, 'hex').toString('base64');

  return {
    code: String(parts[0] || '').trim(),
    imageId: Number(parts[1] || 0),
    mimeType,
    dataUrl: `data:${mimeType};base64,${base64}`,
  };
};

const routeRequest = async (requestUrl) => {
  if (requestUrl.pathname === '/api/sicar/health') {
    return json(200, {
      ok: true,
      bridgePort: bridgeConfig.bridgePort,
      mysqlExePath: bridgeConfig.mysqlExePath,
      database: bridgeConfig.database,
      host: bridgeConfig.host,
      departments: SICAR_SYNC_DEPARTMENTS.map((entry) => entry.sicarDepartment),
    });
  }

  if (requestUrl.pathname === '/api/sicar/catalog') {
    const payload = await buildCatalogSelection();
    return json(200, payload);
  }

  if (requestUrl.pathname === '/api/sicar/image') {
    const code = String(requestUrl.searchParams.get('code') || '').trim();
    if (!code) {
      return json(400, { ok: false, error: 'Falta el codigo del SKU.' });
    }

    const image = await getImageForSku(code);
    if (!image) {
      return json(404, { ok: false, error: 'No se encontro imagen para ese SKU.' });
    }

    return json(200, image);
  }

  return text(404, 'SICAR bridge activo');
};

const server = createServer(async (request, response) => {
  if (!request.url) {
    writeResponse(response, json(400, { ok: false, error: 'Solicitud invalida.' }));
    return;
  }

  if (request.method === 'OPTIONS') {
    writeResponse(response, json(204, {}));
    return;
  }

  if (request.method !== 'GET') {
    writeResponse(response, json(405, { ok: false, error: 'Metodo no permitido.' }));
    return;
  }

  try {
    const requestUrl = new URL(request.url, `http://127.0.0.1:${bridgeConfig.bridgePort}`);
    const result = await routeRequest(requestUrl);
    writeResponse(response, result);
  } catch (error) {
    writeResponse(
      response,
      json(500, {
        ok: false,
        error: error?.message || 'Fallo interno en SICAR bridge.',
      })
    );
  }
});

server.listen(bridgeConfig.bridgePort, '127.0.0.1', () => {
  console.log(`SICAR bridge escuchando en http://127.0.0.1:${bridgeConfig.bridgePort}`);
});
