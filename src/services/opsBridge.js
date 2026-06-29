const LOCAL_BRIDGE_ORIGIN = 'http://127.0.0.1:3077';
const TRUSTED_PUBLIC_BRIDGE_HOSTS = [
  'tienda.sanmartinsr.com',
  'admintv.sanmartinsr.com',
  'cocina.sanmartinsr.com',
  'driver.sanmartinsr.com',
  'verdant-youtiao-5cd9d3.netlify.app',
];

export const isLocalOpsHostname = (hostname = '') => {
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

export const canUseLocalOpsBridge = () =>
  typeof window !== 'undefined' &&
  (isLocalOpsHostname(window.location.hostname) ||
    isTrustedPublicBridgeHostname(window.location.hostname));

const fetchOpsBridge = async (path) => {
  const response = await fetch(`${LOCAL_BRIDGE_ORIGIN}${path}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'No se pudo consultar el puente operativo local.');
  }

  return response.json();
};

export const fetchLiveOpsOrders = async (date, source = 'orders') => {
  const search = new URLSearchParams({
    date: String(date || '').trim(),
    source: String(source || 'orders').trim(),
    mode: 'full',
  });

  return fetchOpsBridge(`/api/ops/live/orders?${search.toString()}`);
};

export const fetchLiveOpsOrdersMeta = async (date, source = 'orders') => {
  const search = new URLSearchParams({
    date: String(date || '').trim(),
    source: String(source || 'orders').trim(),
    mode: 'meta',
  });

  return fetchOpsBridge(`/api/ops/live/orders?${search.toString()}`);
};
