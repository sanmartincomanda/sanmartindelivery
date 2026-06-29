import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  equalTo,
  get,
  onChildAdded,
  onChildChanged,
  orderByChild,
  query,
  ref,
  startAt,
  update,
} from 'firebase/database';
import {
  ensureAuthenticatedFirebaseSession,
  getAuthenticatedFirebaseDatabase,
} from './firebaseScriptAuth.mjs';

const CLIENTS_PATH = 'clients';
const STORE_USERS_PATH = 'storeUsers';
const STORE_USER_CODE_PREFIX = 'TV-';
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const FULL_SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
const UPDATE_BATCH_SIZE = 400;

const normalizeText = (value = '') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeEmail = (value = '') => String(value ?? '').trim().toLowerCase();
const normalizeCode = (value = '') => String(value ?? '').trim();
const normalizeNumber = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const isNumericCode = (value = '') => /^\d+$/.test(normalizeCode(value));
const isStoreUserCode = (value = '') => normalizeCode(value).toUpperCase().startsWith(STORE_USER_CODE_PREFIX);
const sqlEscape = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const getDeterministicClientKey = (code) => `sicar_${normalizeCode(code).replace(/[.#$/[\]]/g, '_')}`;

const splitIntoBatches = (entries = [], size = UPDATE_BATCH_SIZE) => {
  const batches = [];
  const source = Array.isArray(entries) ? entries : [];
  const batchSize = Math.max(1, Number(size || UPDATE_BATCH_SIZE));

  for (let index = 0; index < source.length; index += batchSize) {
    batches.push(source.slice(index, index + batchSize));
  }

  return batches;
};

const toComparableValue = (value) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const appendPatchToUpdates = (updates, basePath, patch) => {
  Object.entries(patch).forEach(([field, value]) => {
    updates[`${basePath}/${field}`] = value;
  });
};

const buildSicarClientFromRow = (line = '') => {
  const parts = String(line || '').split('\t');
  const cliId = normalizeNumber(parts[0], 0);

  return {
    cliId,
    code: String(cliId > 0 ? cliId : '').trim(),
    clave: normalizeCode(parts[1]),
    name: normalizeText(parts[2]),
    address: normalizeText(parts[3]),
    phone: normalizeText(parts[4]),
    mobile: normalizeText(parts[5]),
    email: normalizeEmail(parts[6]),
    rfc: normalizeText(parts[7]),
    status: normalizeNumber(parts[8], 0),
  };
};

const normalizeFirebaseClientRecord = (firebaseKey, value = {}) => ({
  ...value,
  firebaseKey,
  codigo: normalizeCode(value?.codigo),
  nombre: normalizeText(value?.nombre),
  direccion: normalizeText(value?.direccion),
  telefono: normalizeText(value?.telefono),
  celular: normalizeText(value?.celular),
  mail: normalizeEmail(value?.mail || value?.email),
  rfc: normalizeText(value?.rfc),
  origen: normalizeText(value?.origen).toLowerCase(),
  sicarCliId: normalizeNumber(value?.sicarCliId, 0),
});

const normalizeStoreUserRecord = (firebaseKey, value = {}) => ({
  ...value,
  firebaseKey,
  clientKey: normalizeCode(value?.clientKey),
  codigo: normalizeCode(value?.codigo),
  nombre: normalizeText(value?.nombre),
  telefono: normalizeText(value?.telefono),
  direccion: normalizeText(value?.direccion),
  referencia: normalizeText(value?.referencia),
  mail: normalizeEmail(value?.mail || value?.email),
  sicarCliId: normalizeNumber(value?.sicarCliId, 0),
  sicarClave: normalizeCode(value?.sicarClave),
  updatedAt: Math.max(normalizeNumber(value?.updatedAt, 0), normalizeNumber(value?.createdAt, 0)),
});

const buildStoreUserFullAddress = (storeUser) => {
  const baseAddress = normalizeText(storeUser?.direccion);
  const reference = normalizeText(storeUser?.referencia);
  return reference ? `${baseAddress} | Ref: ${reference}` : baseAddress;
};

const choosePreferredFirebaseRecord = (records = [], targetCode = '') => {
  if (!Array.isArray(records) || records.length === 0) {
    return null;
  }

  return [...records].sort((left, right) => {
    const leftScore = [
      String(left?.sicarCliId || '') === String(targetCode) ? 0 : 1,
      String(left?.origen || '').trim().toLowerCase() === 'sicar' ? 0 : 1,
      String(left?.codigo || '') === String(targetCode) ? 0 : 1,
      String(left?.firebaseKey || ''),
    ];
    const rightScore = [
      String(right?.sicarCliId || '') === String(targetCode) ? 0 : 1,
      String(right?.origen || '').trim().toLowerCase() === 'sicar' ? 0 : 1,
      String(right?.codigo || '') === String(targetCode) ? 0 : 1,
      String(right?.firebaseKey || ''),
    ];
    return leftScore.join('|').localeCompare(rightScore.join('|'));
  })[0];
};

const buildFirebaseClientPatchFromSicar = (client, syncedAt) => ({
  codigo: client.code,
  nombre: client.name,
  direccion: client.address,
  telefono: client.phone,
  celular: client.mobile,
  mail: client.email,
  email: client.email,
  rfc: client.rfc,
  origen: 'sicar',
  sicarCliId: client.cliId,
  sicarClave: client.clave,
  sicarStatus: 1,
  sicarLastSyncedAt: syncedAt,
});

const getChangedPatch = (existingRecord = {}, desiredPatch = {}) => {
  const changedPatch = {};

  Object.entries(desiredPatch).forEach(([field, value]) => {
    if (toComparableValue(existingRecord?.[field]) !== toComparableValue(value)) {
      changedPatch[field] = value;
    }
  });

  if (!Object.keys(changedPatch).length) {
    return {};
  }

  if (!Object.prototype.hasOwnProperty.call(changedPatch, 'sicarLastSyncedAt') && desiredPatch.sicarLastSyncedAt) {
    changedPatch.sicarLastSyncedAt = desiredPatch.sicarLastSyncedAt;
  }

  return changedPatch;
};

const buildFirebaseIndexes = (clientsSnapshotValue = {}) => {
  const byCode = new Map();
  const swappedByNumericName = new Map();
  let firebaseClientCount = 0;
  let ignoredStoreUsers = 0;

  Object.entries(clientsSnapshotValue || {}).forEach(([firebaseKey, value]) => {
    if (!value || typeof value !== 'object') {
      return;
    }

    const record = normalizeFirebaseClientRecord(firebaseKey, value);

    if (isStoreUserCode(record.codigo) || record.origen === 'tienda_virtual') {
      ignoredStoreUsers += 1;
      return;
    }

    firebaseClientCount += 1;

    if (record.codigo) {
      if (!byCode.has(record.codigo)) {
        byCode.set(record.codigo, []);
      }
      byCode.get(record.codigo).push(record);
    }

    if (!isNumericCode(record.codigo) && isNumericCode(record.nombre)) {
      if (!swappedByNumericName.has(record.nombre)) {
        swappedByNumericName.set(record.nombre, []);
      }
      swappedByNumericName.get(record.nombre).push(record);
    }
  });

  return {
    byCode,
    swappedByNumericName,
    firebaseClientCount,
    ignoredStoreUsers,
  };
};

const loadPersistedState = (stateFilePath) => {
  if (!existsSync(stateFilePath)) {
    return {};
  }

  try {
    const raw = readFileSync(stateFilePath, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const persistState = (stateFilePath, state) => {
  mkdirSync(dirname(stateFilePath), { recursive: true });
  writeFileSync(
    stateFilePath,
    JSON.stringify(
      {
        lastSeenCliId: normalizeNumber(state.lastSeenCliId, 0),
        lastFullSyncAt: state.lastFullSyncAt || '',
        lastIncrementalSyncAt: state.lastIncrementalSyncAt || '',
        lastStoreUserSeenUpdatedAt: normalizeNumber(state.lastStoreUserSeenUpdatedAt, 0),
        lastStoreUserFullSyncAt: state.lastStoreUserFullSyncAt || '',
        lastStoreUserIncrementalSyncAt: state.lastStoreUserIncrementalSyncAt || '',
      },
      null,
      2
    ),
    'utf8'
  );
};

const isPastSyncStale = (value, maxAgeMs = FULL_SYNC_INTERVAL_MS) => {
  const timestamp = Date.parse(String(value || '').trim());
  if (!timestamp) {
    return true;
  }

  return Date.now() - timestamp >= Math.max(60 * 1000, normalizeNumber(maxAgeMs, FULL_SYNC_INTERVAL_MS));
};

const writeLatestReport = (reportFilePath, report) => {
  mkdirSync(dirname(reportFilePath), { recursive: true });
  writeFileSync(reportFilePath, JSON.stringify(report, null, 2), 'utf8');
};

export function createSicarClientSyncManager({ runMysqlQuery, repoRoot }) {
  const database = getAuthenticatedFirebaseDatabase();
  const backupDir = resolve(repoRoot, '..', 'sicar-backups');
  const stateFilePath = resolve(backupDir, 'sicar-client-sync-state.json');
  const reportFilePath = resolve(backupDir, 'sicar-client-sync-report-latest.json');
  const persistedState = loadPersistedState(stateFilePath);

  const state = {
    listening: false,
    reconciling: false,
    polling: false,
    syncingStoreUsers: false,
    lastError: '',
    lastRunAt: '',
    lastFullSyncAt: persistedState.lastFullSyncAt || '',
    lastIncrementalSyncAt: persistedState.lastIncrementalSyncAt || '',
    lastSeenCliId: normalizeNumber(persistedState.lastSeenCliId, 0),
    lastCreatedCount: 0,
    lastUpdatedCount: 0,
    lastScannedActiveCount: 0,
    lastNewClientsDetected: 0,
    lastProcessedCliId: 0,
    duplicateCodeGroups: 0,
    ignoredStoreUsers: 0,
    lastStoreUserSeenUpdatedAt: normalizeNumber(persistedState.lastStoreUserSeenUpdatedAt, 0),
    lastStoreUserFullSyncAt: persistedState.lastStoreUserFullSyncAt || '',
    lastStoreUserIncrementalSyncAt: persistedState.lastStoreUserIncrementalSyncAt || '',
    lastStoreUsersProcessed: 0,
    lastStoreUsersCreatedInSicar: 0,
    lastStoreUsersUpdatedInSicar: 0,
    reportFilePath,
  };

  let pollTimer = null;
  let reconcilePromise = null;
  let storeUsersSyncPromise = null;
  let storeUsersRealtimeListenerStarted = false;
  let unsubscribeStoreUserAdded = null;
  let unsubscribeStoreUserChanged = null;
  let storeUsersRealtimeTimer = null;
  let storeUsersRealtimeSyncRequested = false;

  const flushRootUpdates = async (rootUpdates) => {
    const entries = Object.entries(rootUpdates || {});
    const batches = splitIntoBatches(entries, UPDATE_BATCH_SIZE);

    for (const batch of batches) {
      await update(ref(database), Object.fromEntries(batch));
    }
  };

  const readActiveSicarClients = async (minCliId = 0) => {
    const filterClause = normalizeNumber(minCliId, 0) > 0 ? `AND cli_id > ${normalizeNumber(minCliId, 0)}` : '';
    const rows = await runMysqlQuery(`
      SELECT
        cli_id,
        COALESCE(clave, ''),
        COALESCE(nombre, ''),
        COALESCE(domicilio, ''),
        COALESCE(telefono, ''),
        COALESCE(celular, ''),
        COALESCE(mail, ''),
        COALESCE(rfc, ''),
        COALESCE(status, 0)
      FROM cliente
      WHERE status = 1
        ${filterClause}
      ORDER BY cli_id ASC;
    `);

    return rows
      .map((line) => buildSicarClientFromRow(line))
      .filter((client) => client.cliId > 0 && client.status === 1 && client.code);
  };

  const getSicarClientByClave = async (clave) => {
    const cleanClave = normalizeCode(clave);
    if (!cleanClave) {
      return null;
    }

    const rows = await runMysqlQuery(`
      SELECT
        cli_id,
        COALESCE(clave, ''),
        COALESCE(nombre, ''),
        COALESCE(domicilio, ''),
        COALESCE(telefono, ''),
        COALESCE(celular, ''),
        COALESCE(mail, ''),
        COALESCE(rfc, ''),
        COALESCE(status, 0)
      FROM cliente
      WHERE clave = '${sqlEscape(cleanClave)}'
      LIMIT 1;
    `);

    return rows.length ? buildSicarClientFromRow(rows[0]) : null;
  };

  const findFirebaseClientsByCode = async (code) => {
    const cleanCode = normalizeCode(code);
    if (!cleanCode) {
      return [];
    }

    const stringSnapshot = await get(
      query(ref(database, CLIENTS_PATH), orderByChild('codigo'), equalTo(cleanCode))
    );
    const stringMatches = stringSnapshot.val() || {};
    const normalizedStringMatches = Object.entries(stringMatches)
      .map(([firebaseKey, value]) => normalizeFirebaseClientRecord(firebaseKey, value))
      .filter((record) => !isStoreUserCode(record.codigo) && record.origen !== 'tienda_virtual');

    if (normalizedStringMatches.length || !isNumericCode(cleanCode)) {
      return normalizedStringMatches;
    }

    const numericSnapshot = await get(
      query(ref(database, CLIENTS_PATH), orderByChild('codigo'), equalTo(Number(cleanCode)))
    );
    const numericMatches = numericSnapshot.val() || {};

    return Object.entries(numericMatches)
      .map(([firebaseKey, value]) => normalizeFirebaseClientRecord(firebaseKey, value))
      .filter((record) => !isStoreUserCode(record.codigo) && record.origen !== 'tienda_virtual');
  };

  const readAllStoreUsers = async () => {
    const snapshot = await get(ref(database, STORE_USERS_PATH));
    return Object.entries(snapshot.val() || {})
      .map(([firebaseKey, value]) => normalizeStoreUserRecord(firebaseKey, value))
      .filter(
        (storeUser) =>
          isStoreUserCode(storeUser.codigo) &&
          storeUser.nombre &&
          buildStoreUserFullAddress(storeUser)
      )
      .sort((left, right) => left.updatedAt - right.updatedAt);
  };

  const readChangedStoreUsers = async (sinceUpdatedAt = 0) => {
    const cleanSince = Math.max(0, normalizeNumber(sinceUpdatedAt, 0));
    const snapshot = await get(
      query(ref(database, STORE_USERS_PATH), orderByChild('updatedAt'), startAt(cleanSince > 0 ? cleanSince + 1 : 0))
    );

    return Object.entries(snapshot.val() || {})
      .map(([firebaseKey, value]) => normalizeStoreUserRecord(firebaseKey, value))
      .filter(
        (storeUser) =>
          isStoreUserCode(storeUser.codigo) &&
          storeUser.nombre &&
          buildStoreUserFullAddress(storeUser)
      )
      .sort((left, right) => left.updatedAt - right.updatedAt);
  };

  const upsertStoreUserIntoSicar = async (storeUser) => {
    const code = normalizeCode(storeUser.codigo);
    const name = normalizeText(storeUser.nombre);
    const address = buildStoreUserFullAddress(storeUser);
    const phone = normalizeText(storeUser.telefono);
    const email = normalizeEmail(storeUser.mail);

    if (!code || !name || !address) {
      return { action: 'skipped', cliId: 0 };
    }

    const existing = await getSicarClientByClave(code);
    const comment = 'Cliente tienda virtual';

    if (!existing) {
      await runMysqlQuery(`
        INSERT INTO cliente (
          nombre,
          domicilio,
          noExt,
          noInt,
          localidad,
          ciudad,
          estado,
          pais,
          codigoPostal,
          colonia,
          rfc,
          curp,
          telefono,
          celular,
          mail,
          comentario,
          status,
          limite,
          precio,
          diasCredito,
          retener,
          desglosarIEPS,
          notificar,
          clave
        ) VALUES (
          '${sqlEscape(name)}',
          '${sqlEscape(address)}',
          '',
          '',
          '',
          '',
          '',
          'NICARAGUA',
          '',
          '',
          '',
          '',
          '${sqlEscape(phone)}',
          '${sqlEscape(phone)}',
          '${sqlEscape(email)}',
          '${sqlEscape(comment)}',
          1,
          0,
          1,
          0,
          0,
          0,
          1,
          '${sqlEscape(code)}'
        );
      `);

      const inserted = await getSicarClientByClave(code);
      return {
        action: 'created',
        cliId: normalizeNumber(inserted?.cliId, 0),
        status: normalizeNumber(inserted?.status, 0),
      };
    }

    const desiredPatch = {
      nombre: name,
      domicilio: address,
      telefono: phone,
      celular: phone,
      mail: email,
      comentario: comment,
      status: 1,
      notificar: 1,
      clave: code,
    };

    const comparableExisting = {
      nombre: existing.name,
      domicilio: existing.address,
      telefono: existing.phone,
      celular: existing.mobile,
      mail: existing.email,
      comentario: comment,
      status: existing.status,
      notificar: 1,
      clave: existing.clave,
    };

    const changedFields = Object.entries(desiredPatch).filter(
      ([field, value]) => toComparableValue(comparableExisting[field]) !== toComparableValue(value)
    );

    if (!changedFields.length) {
      return {
        action: 'unchanged',
        cliId: normalizeNumber(existing.cliId, 0),
        status: normalizeNumber(existing.status, 0),
      };
    }

    const assignments = changedFields
      .map(([field, value]) => `${field} = ${typeof value === 'number' ? Number(value) : `'${sqlEscape(value)}'`}`)
      .join(', ');

    await runMysqlQuery(`
      UPDATE cliente
      SET ${assignments}
      WHERE cli_id = ${normalizeNumber(existing.cliId, 0)}
      LIMIT 1;
    `);

    return {
      action: 'updated',
      cliId: normalizeNumber(existing.cliId, 0),
      status: 1,
    };
  };

  const syncStoreUserBackToFirebase = async (storeUser, syncResult, syncedAt) => {
    const updates = {};
    const desiredSyncPatch = {
      sicarCliId: normalizeNumber(syncResult.cliId, 0),
      sicarClave: normalizeCode(storeUser.codigo),
      sicarStatus: normalizeNumber(syncResult.status, 0) || 1,
      sicarLastSyncedAt: syncedAt,
    };

    const storeUserPatch = getChangedPatch(storeUser, desiredSyncPatch);
    if (Object.keys(storeUserPatch).length) {
      appendPatchToUpdates(updates, `${STORE_USERS_PATH}/${storeUser.firebaseKey}`, storeUserPatch);
    }

    if (storeUser.clientKey && Object.keys(storeUserPatch).length) {
      appendPatchToUpdates(updates, `${CLIENTS_PATH}/${storeUser.clientKey}`, desiredSyncPatch);
    }

    if (Object.keys(updates).length) {
      await flushRootUpdates(updates);
    }
  };

  const reconcileActiveClients = async () => {
    if (reconcilePromise) {
      return reconcilePromise;
    }

    reconcilePromise = (async () => {
      await ensureAuthenticatedFirebaseSession();

      state.reconciling = true;
      state.lastRunAt = new Date().toISOString();
      state.lastError = '';

      try {
        const [sicarClients, firebaseSnapshot] = await Promise.all([
          readActiveSicarClients(0),
          get(ref(database, CLIENTS_PATH)),
        ]);

        const firebaseIndexes = buildFirebaseIndexes(firebaseSnapshot.val() || {});
        const updates = {};
        const syncedAt = new Date().toISOString();
        const duplicateCodes = new Set();
        let createdCount = 0;
        let updatedCount = 0;
        let lastSeenCliId = 0;

        sicarClients.forEach((client) => {
          lastSeenCliId = Math.max(lastSeenCliId, normalizeNumber(client.cliId, 0));

          const exactMatches = firebaseIndexes.byCode.get(client.code) || [];
          const swappedMatches = exactMatches.length ? [] : firebaseIndexes.swappedByNumericName.get(client.code) || [];
          const candidate = choosePreferredFirebaseRecord(
            exactMatches.length ? exactMatches : swappedMatches,
            client.code
          );

          if (exactMatches.length > 1) {
            duplicateCodes.add(client.code);
          }

          const desiredPatch = buildFirebaseClientPatchFromSicar(client, syncedAt);

          if (!candidate) {
            appendPatchToUpdates(updates, `${CLIENTS_PATH}/${getDeterministicClientKey(client.code)}`, desiredPatch);
            createdCount += 1;
            return;
          }

          const changedPatch = getChangedPatch(candidate, desiredPatch);
          if (Object.keys(changedPatch).length) {
            appendPatchToUpdates(updates, `${CLIENTS_PATH}/${candidate.firebaseKey}`, changedPatch);
            updatedCount += 1;
          }
        });

        if (Object.keys(updates).length) {
          await flushRootUpdates(updates);
        }

        state.lastSeenCliId = lastSeenCliId;
        state.lastFullSyncAt = new Date().toISOString();
        state.lastCreatedCount = createdCount;
        state.lastUpdatedCount = updatedCount;
        state.lastScannedActiveCount = sicarClients.length;
        state.lastProcessedCliId = lastSeenCliId;
        state.duplicateCodeGroups = duplicateCodes.size;
        state.ignoredStoreUsers = firebaseIndexes.ignoredStoreUsers;

        persistState(stateFilePath, state);
        writeLatestReport(reportFilePath, {
          generatedAt: state.lastFullSyncAt,
          mode: 'sicar-to-firebase-full',
          activeSicarClients: sicarClients.length,
          firebaseClientsReviewed: firebaseIndexes.firebaseClientCount,
          ignoredStoreUsers: firebaseIndexes.ignoredStoreUsers,
          createdCount,
          updatedCount,
          duplicateCodeGroups: [...duplicateCodes],
          lastSeenCliId,
          inactiveClientsExcluded: true,
        });

        return {
          ok: true,
          createdCount,
          updatedCount,
          activeSicarClients: sicarClients.length,
          lastSeenCliId,
        };
      } catch (error) {
        state.lastError = String(error?.message || error || 'No se pudo conciliar clientes SICAR.');
        throw error;
      } finally {
        state.reconciling = false;
        reconcilePromise = null;
      }
    })();

    return reconcilePromise;
  };

  const pollNewActiveSicarClientsOnce = async () => {
    await ensureAuthenticatedFirebaseSession();

    const sicarClients = await readActiveSicarClients(state.lastSeenCliId);
    const syncedAt = new Date().toISOString();
    let createdCount = 0;
    let updatedCount = 0;
    let maxCliId = normalizeNumber(state.lastSeenCliId, 0);

    for (const client of sicarClients) {
      maxCliId = Math.max(maxCliId, normalizeNumber(client.cliId, 0));

      const matches = await findFirebaseClientsByCode(client.code);
      const candidate = choosePreferredFirebaseRecord(matches, client.code);
      const desiredPatch = buildFirebaseClientPatchFromSicar(client, syncedAt);

      if (!candidate) {
        const rootUpdates = {};
        appendPatchToUpdates(rootUpdates, `${CLIENTS_PATH}/${getDeterministicClientKey(client.code)}`, desiredPatch);
        await flushRootUpdates(rootUpdates);
        createdCount += 1;
        continue;
      }

      const changedPatch = getChangedPatch(candidate, desiredPatch);
      if (Object.keys(changedPatch).length) {
        const rootUpdates = {};
        appendPatchToUpdates(rootUpdates, `${CLIENTS_PATH}/${candidate.firebaseKey}`, changedPatch);
        await flushRootUpdates(rootUpdates);
        updatedCount += 1;
      }
    }

    state.lastSeenCliId = maxCliId;
    state.lastIncrementalSyncAt = new Date().toISOString();
    state.lastCreatedCount = createdCount;
    state.lastUpdatedCount = updatedCount;
    state.lastNewClientsDetected = sicarClients.length;
    state.lastProcessedCliId = maxCliId;
    persistState(stateFilePath, state);

    return {
      ok: true,
      newClientsDetected: sicarClients.length,
      createdCount,
      updatedCount,
      lastSeenCliId: maxCliId,
    };
  };

  const syncStoreUsersToSicar = async ({ incremental = false } = {}) => {
    if (storeUsersSyncPromise) {
      return storeUsersSyncPromise;
    }

    storeUsersSyncPromise = (async () => {
      await ensureAuthenticatedFirebaseSession();

      state.syncingStoreUsers = true;
      state.lastError = '';

      try {
        const storeUsers = incremental
          ? await readChangedStoreUsers(state.lastStoreUserSeenUpdatedAt)
          : await readAllStoreUsers();

        let processed = 0;
        let createdInSicar = 0;
        let updatedInSicar = 0;
        let maxUpdatedAt = normalizeNumber(state.lastStoreUserSeenUpdatedAt, 0);

        for (const storeUser of storeUsers) {
          maxUpdatedAt = Math.max(maxUpdatedAt, normalizeNumber(storeUser.updatedAt, 0));
          const syncResult = await upsertStoreUserIntoSicar(storeUser);

          if (syncResult.action === 'skipped') {
            continue;
          }

          processed += 1;
          if (syncResult.action === 'created') {
            createdInSicar += 1;
          }
          if (syncResult.action === 'updated') {
            updatedInSicar += 1;
          }

          await syncStoreUserBackToFirebase(storeUser, syncResult, new Date().toISOString());
        }

        state.lastStoreUserSeenUpdatedAt = maxUpdatedAt;
        state.lastStoreUsersProcessed = processed;
        state.lastStoreUsersCreatedInSicar = createdInSicar;
        state.lastStoreUsersUpdatedInSicar = updatedInSicar;

        if (incremental) {
          state.lastStoreUserIncrementalSyncAt = new Date().toISOString();
        } else {
          state.lastStoreUserFullSyncAt = new Date().toISOString();
        }

        persistState(stateFilePath, state);
        writeLatestReport(reportFilePath, {
          generatedAt: incremental ? state.lastStoreUserIncrementalSyncAt : state.lastStoreUserFullSyncAt,
          mode: incremental ? 'firebase-store-users-to-sicar-incremental' : 'firebase-store-users-to-sicar-full',
          processed,
          createdInSicar,
          updatedInSicar,
          lastStoreUserSeenUpdatedAt: maxUpdatedAt,
        });

        return {
          ok: true,
          processed,
          createdInSicar,
          updatedInSicar,
        };
      } catch (error) {
        state.lastError = String(error?.message || error || 'No se pudo sincronizar clientes TV hacia SICAR.');
        throw error;
      } finally {
        state.syncingStoreUsers = false;
        storeUsersSyncPromise = null;
      }
    })();

    return storeUsersSyncPromise;
  };

  const scheduleStoreUsersRealtimeSync = () => {
    storeUsersRealtimeSyncRequested = true;

    if (storeUsersRealtimeTimer) {
      return;
    }

    storeUsersRealtimeTimer = setTimeout(() => {
      storeUsersRealtimeTimer = null;

      if (!state.listening || !storeUsersRealtimeSyncRequested) {
        return;
      }

      storeUsersRealtimeSyncRequested = false;
      syncStoreUsersToSicar({ incremental: true }).catch((error) => {
        state.lastError = String(
          error?.message || error || 'No se pudo sincronizar en tiempo real los clientes de tienda virtual hacia SICAR.'
        );
      });
    }, 250);
  };

  const startStoreUsersRealtimeSync = () => {
    if (storeUsersRealtimeListenerStarted) {
      return;
    }

    const sinceUpdatedAt = Math.max(0, normalizeNumber(state.lastStoreUserSeenUpdatedAt, 0));
    const realtimeQuery = query(
      ref(database, STORE_USERS_PATH),
      orderByChild('updatedAt'),
      startAt(sinceUpdatedAt > 0 ? sinceUpdatedAt + 1 : 0)
    );

    const handleStoreUserRealtimeSnapshot = (snapshot) => {
      const storeUser = normalizeStoreUserRecord(snapshot?.key, snapshot?.val());
      if (
        !isStoreUserCode(storeUser.codigo) ||
        !storeUser.nombre ||
        !buildStoreUserFullAddress(storeUser)
      ) {
        return;
      }

      scheduleStoreUsersRealtimeSync();
    };

    const handleStoreUsersRealtimeError = (error) => {
      state.lastError = String(
        error?.message || error || 'No se pudo escuchar en tiempo real los clientes de tienda virtual.'
      );
    };

    unsubscribeStoreUserAdded = onChildAdded(
      realtimeQuery,
      handleStoreUserRealtimeSnapshot,
      handleStoreUsersRealtimeError
    );
    unsubscribeStoreUserChanged = onChildChanged(
      realtimeQuery,
      handleStoreUserRealtimeSnapshot,
      handleStoreUsersRealtimeError
    );
    storeUsersRealtimeListenerStarted = true;
  };

  const stopStoreUsersRealtimeSync = () => {
    if (typeof unsubscribeStoreUserAdded === 'function') {
      unsubscribeStoreUserAdded();
    }

    if (typeof unsubscribeStoreUserChanged === 'function') {
      unsubscribeStoreUserChanged();
    }

    unsubscribeStoreUserAdded = null;
    unsubscribeStoreUserChanged = null;
    storeUsersRealtimeListenerStarted = false;
    storeUsersRealtimeSyncRequested = false;

    if (storeUsersRealtimeTimer) {
      clearTimeout(storeUsersRealtimeTimer);
      storeUsersRealtimeTimer = null;
    }
  };

  const pollOnce = async () => {
    state.polling = true;
    state.lastError = '';

    try {
      await pollNewActiveSicarClientsOnce();
      await syncStoreUsersToSicar({ incremental: true });
    } finally {
      state.polling = false;
    }
  };

  const scheduleNextPoll = (delayMs = POLL_INTERVAL_MS) => {
    if (!state.listening) {
      return;
    }

    if (pollTimer) {
      clearTimeout(pollTimer);
    }

    pollTimer = setTimeout(() => {
      pollOnce()
        .catch(() => {})
        .finally(() => {
          scheduleNextPoll(POLL_INTERVAL_MS);
        });
    }, Math.max(5000, normalizeNumber(delayMs, POLL_INTERVAL_MS)));
  };

  const initAutoSync = () => {
    if (state.listening) {
      return;
    }

    state.listening = true;
    const needsFullClientSync =
      !state.lastSeenCliId ||
      !state.lastFullSyncAt ||
      isPastSyncStale(state.lastFullSyncAt);
    const needsFullStoreUserSync =
      !state.lastStoreUserFullSyncAt ||
      isPastSyncStale(state.lastStoreUserFullSyncAt);

    Promise.resolve()
      .then(() => ensureAuthenticatedFirebaseSession())
      .then(() => (needsFullClientSync ? reconcileActiveClients() : pollNewActiveSicarClientsOnce()))
      .then(() =>
        needsFullStoreUserSync
          ? syncStoreUsersToSicar({ incremental: false })
          : syncStoreUsersToSicar({ incremental: true })
      )
      .catch(() => {})
      .finally(() => {
        startStoreUsersRealtimeSync();
        scheduleNextPoll(5000);
      });
  };

  const stopAutoSync = () => {
    state.listening = false;
    stopStoreUsersRealtimeSync();
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  return {
    state,
    initAutoSync,
    stopAutoSync,
    reconcileActiveClients,
    pollOnce,
    pollNewActiveSicarClientsOnce,
    syncStoreUsersToSicar,
  };
}
