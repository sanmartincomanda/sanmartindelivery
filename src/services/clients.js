import { endAt, get, limitToFirst, orderByChild, query, ref, startAt } from 'firebase/database';
import { database } from '../firebase.js';
import {
  buildClientIndexFields,
  buildClientRecordForWrite,
  CLIENTS_PATH,
  hydrateClientRecord,
  normalizeClientCode,
  normalizeClientPhoneDigits,
  normalizeClientSearchText,
} from './clientModel.js';

const DEFAULT_SEARCH_LIMIT = 6;
const SEARCH_RESULT_WINDOW = 12;
const MIN_TEXT_QUERY_LENGTH = 2;
const MIN_PHONE_QUERY_LENGTH = 3;

export const sortClientsByName = (clients = []) =>
  [...clients].sort(
    (left, right) =>
      String(left?.nombre || '').localeCompare(String(right?.nombre || '')) ||
      String(left?.codigo || '').localeCompare(String(right?.codigo || ''))
  );

const fetchClientsByPrefix = async (field, prefix, limit = SEARCH_RESULT_WINDOW) => {
  const cleanPrefix = String(prefix || '').trim();
  if (!field || !cleanPrefix) {
    return [];
  }

  const snapshot = await get(
    query(
      ref(database, CLIENTS_PATH),
      orderByChild(field),
      startAt(cleanPrefix),
      endAt(`${cleanPrefix}\uf8ff`),
      limitToFirst(Math.max(1, Number(limit || SEARCH_RESULT_WINDOW)))
    )
  );

  return Object.entries(snapshot.val() || {}).map(([firebaseKey, value]) =>
    hydrateClientRecord(firebaseKey, value)
  );
};

const getClientSearchScore = (client, { textQuery, codeQuery, phoneQuery }) => {
  const name = String(client?.nombreLower || '').trim();
  const address = normalizeClientSearchText(client?.direccion);
  const code = String(client?.codigoUpper || '').trim();
  const phone = String(client?.telefonoDigits || '').trim();
  const mobile = String(client?.celularDigits || '').trim();

  let score = 100;

  if (codeQuery) {
    if (code === codeQuery) {
      score = Math.min(score, 0);
    } else if (code.startsWith(codeQuery)) {
      score = Math.min(score, 2);
    }
  }

  if (phoneQuery) {
    if (phone === phoneQuery || mobile === phoneQuery) {
      score = Math.min(score, 0);
    } else if (phone.startsWith(phoneQuery) || mobile.startsWith(phoneQuery)) {
      score = Math.min(score, 1);
    }
  }

  if (textQuery) {
    if (name === textQuery) {
      score = Math.min(score, 1);
    } else if (name.startsWith(textQuery)) {
      score = Math.min(score, 3);
    } else if (name.includes(textQuery)) {
      score = Math.min(score, 4);
    } else if (address.includes(textQuery)) {
      score = Math.min(score, 5);
    }
  }

  return score;
};

export async function searchClients(searchText, limit = DEFAULT_SEARCH_LIMIT) {
  const textQuery = normalizeClientSearchText(searchText);
  const codeQuery = normalizeClientCode(searchText);
  const phoneQuery = normalizeClientPhoneDigits(searchText);
  const searchLimit = Math.max(1, Number(limit || DEFAULT_SEARCH_LIMIT));
  const queryTasks = [];

  if (textQuery.length >= MIN_TEXT_QUERY_LENGTH) {
    queryTasks.push(fetchClientsByPrefix('nombreLower', textQuery));
  }

  if (codeQuery.length >= MIN_TEXT_QUERY_LENGTH) {
    queryTasks.push(fetchClientsByPrefix('codigoUpper', codeQuery));
  }

  if (phoneQuery.length >= MIN_PHONE_QUERY_LENGTH) {
    queryTasks.push(fetchClientsByPrefix('telefonoDigits', phoneQuery));
    queryTasks.push(fetchClientsByPrefix('celularDigits', phoneQuery));
  }

  if (!queryTasks.length) {
    return [];
  }

  const groups = await Promise.all(queryTasks);
  const mergedClients = new Map();

  groups.flat().forEach((client) => {
    if (!client?.firebaseKey) {
      return;
    }

    mergedClients.set(client.firebaseKey, client);
  });

  return [...mergedClients.values()]
    .sort((left, right) => {
      const leftScore = getClientSearchScore(left, { textQuery, codeQuery, phoneQuery });
      const rightScore = getClientSearchScore(right, { textQuery, codeQuery, phoneQuery });

      if (leftScore !== rightScore) {
        return leftScore - rightScore;
      }

      const updatedAtDiff = Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
      if (updatedAtDiff !== 0) {
        return updatedAtDiff;
      }

      return String(left.nombre || '').localeCompare(String(right.nombre || ''));
    })
    .slice(0, searchLimit);
}

export async function fetchAllClients() {
  const snapshot = await get(ref(database, CLIENTS_PATH));

  return sortClientsByName(
    Object.entries(snapshot.val() || {}).map(([firebaseKey, value]) =>
      hydrateClientRecord(firebaseKey, value)
    )
  );
}

export {
  buildClientIndexFields,
  buildClientRecordForWrite,
  CLIENTS_PATH,
  hydrateClientRecord,
  normalizeClientCode,
  normalizeClientPhoneDigits,
  normalizeClientSearchText,
};
