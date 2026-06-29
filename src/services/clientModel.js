import { normalizar } from '../components/Utils.js';

export const CLIENTS_PATH = 'clients';

const cleanText = (value = '') =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const toOptionalLowerEmail = (value = '') => {
  const cleanValue = cleanText(value);
  return cleanValue ? cleanValue.toLowerCase() : '';
};

const toPositiveTimestamp = (value, fallback = Date.now()) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
};

const stripFirebaseKey = (value = {}) => {
  const source = value && typeof value === 'object' ? value : {};
  const { firebaseKey, ...rest } = source;
  return rest;
};

export const normalizeClientSearchText = (value = '') => normalizar(cleanText(value));
export const normalizeClientCode = (value = '') => cleanText(value).toUpperCase();
export const normalizeClientPhoneDigits = (value = '') => String(value ?? '').replace(/\D/g, '');

export const resolveClientUpdatedAt = (client = {}, options = {}) => {
  const source = stripFirebaseKey(client);
  const touchUpdatedAt = options.touchUpdatedAt !== false;
  const fallbackUpdatedAt = toPositiveTimestamp(
    options.fallbackUpdatedAt ?? source.createdAt ?? source.timestamp,
    Date.now()
  );

  if (touchUpdatedAt) {
    return toPositiveTimestamp(options.now, Date.now());
  }

  return toPositiveTimestamp(source.updatedAt, fallbackUpdatedAt);
};

export const buildClientIndexFields = (client = {}, options = {}) => {
  const source = stripFirebaseKey(client);
  return {
    nombreLower: normalizeClientSearchText(source.nombre),
    codigoUpper: normalizeClientCode(source.codigo),
    telefonoDigits: normalizeClientPhoneDigits(source.telefono),
    celularDigits: normalizeClientPhoneDigits(source.celular),
    updatedAt: resolveClientUpdatedAt(source, options),
  };
};

export const buildClientRecordForWrite = (client = {}, options = {}) => {
  const source = stripFirebaseKey(client);

  return {
    ...source,
    nombre: cleanText(source.nombre),
    codigo: cleanText(source.codigo),
    direccion: cleanText(source.direccion),
    telefono: cleanText(source.telefono),
    celular: cleanText(source.celular),
    referencia: cleanText(source.referencia),
    origen: cleanText(source.origen),
    mail: toOptionalLowerEmail(source.mail),
    email: toOptionalLowerEmail(source.email),
    ...buildClientIndexFields(source, options),
  };
};

export const hydrateClientRecord = (firebaseKey, value = {}) => {
  const source = stripFirebaseKey(value);
  return {
    firebaseKey,
    ...source,
    nombre: cleanText(source.nombre),
    codigo: cleanText(source.codigo),
    direccion: cleanText(source.direccion),
    telefono: cleanText(source.telefono),
    celular: cleanText(source.celular),
    nombreLower: normalizeClientSearchText(source.nombreLower || source.nombre),
    codigoUpper: normalizeClientCode(source.codigoUpper || source.codigo),
    telefonoDigits: normalizeClientPhoneDigits(source.telefonoDigits || source.telefono),
    celularDigits: normalizeClientPhoneDigits(source.celularDigits || source.celular),
    updatedAt: resolveClientUpdatedAt(source, {
      touchUpdatedAt: false,
      fallbackUpdatedAt: source.createdAt ?? source.timestamp ?? 0,
    }),
  };
};
