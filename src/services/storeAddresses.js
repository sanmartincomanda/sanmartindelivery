import { hasLocation, normalizeLocation } from './geo.js';

const DEFAULT_ADDRESS_NAME = 'Casa';

const cleanAddressId = (value = '') =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 80);

const cleanAddressName = (value = '') =>
  String(value || DEFAULT_ADDRESS_NAME)
    .trim()
    .slice(0, 40) || DEFAULT_ADDRESS_NAME;

export const createStoreAddressId = () =>
  `dir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export const normalizeStoreAddress = (source = {}, fallbackId = '') => {
  const location = normalizeLocation(source?.ubicacion);
  const address = String(source?.direccion || '').trim();
  const id = cleanAddressId(source?.id || fallbackId) || createStoreAddressId();

  if (!address && !hasLocation(location)) {
    return null;
  }

  return {
    id,
    nombre: cleanAddressName(source?.nombre || source?.nombreDireccion),
    direccion: address || String(location?.label || 'Ubicacion seleccionada en el mapa').trim(),
    referencia: String(source?.referencia || '').trim(),
    ubicacion: location,
    predeterminada: source?.predeterminada === true,
    createdAt: Number(source?.createdAt || 0) || Date.now(),
    updatedAt: Number(source?.updatedAt || 0) || Date.now(),
  };
};

const readAddressEntries = (value) => {
  if (Array.isArray(value)) {
    return value.map((address, index) => [address?.id || `direccion_${index + 1}`, address]);
  }

  if (value && typeof value === 'object') {
    return Object.entries(value);
  }

  return [];
};

export const normalizeStoreAddresses = (user = {}) => {
  const rawAddresses = readAddressEntries(user?.direccionesGuardadas);
  const addresses = rawAddresses
    .map(([key, address]) => normalizeStoreAddress(address, key))
    .filter(Boolean);

  if (addresses.length === 0) {
    const legacyAddress = normalizeStoreAddress(
      {
        nombre: user?.nombreDireccion || DEFAULT_ADDRESS_NAME,
        direccion: user?.direccion,
        referencia: user?.referencia,
        ubicacion: user?.ubicacion,
        predeterminada: true,
        createdAt: user?.createdAt,
        updatedAt: user?.updatedAt,
      },
      'direccion_principal'
    );

    if (legacyAddress) {
      addresses.push(legacyAddress);
    }
  }

  const defaultIndex = Math.max(
    0,
    addresses.findIndex((address) => address.predeterminada)
  );

  return addresses.map((address, index) => ({
    ...address,
    predeterminada: index === defaultIndex,
  }));
};

export const getDefaultStoreAddress = (user = {}) => {
  const addresses = normalizeStoreAddresses(user);
  return addresses.find((address) => address.predeterminada) || addresses[0] || null;
};

export const serializeStoreAddresses = (addresses = []) =>
  normalizeStoreAddresses({ direccionesGuardadas: addresses }).reduce((result, address) => {
    result[address.id] = address;
    return result;
  }, {});

export const createStoreAddressDraft = (source = {}) => ({
  id: cleanAddressId(source?.id) || createStoreAddressId(),
  nombre: cleanAddressName(source?.nombre || source?.nombreDireccion),
  direccion: String(source?.direccion || '').trim(),
  referencia: String(source?.referencia || '').trim(),
  ubicacion: normalizeLocation(source?.ubicacion),
  predeterminada: source?.predeterminada === true,
  createdAt: Number(source?.createdAt || 0) || Date.now(),
  updatedAt: Date.now(),
});
