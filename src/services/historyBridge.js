import { sortOrdersByDateAndNumberDesc } from './orderArchive';

const LOCAL_BRIDGE_ORIGIN = 'http://127.0.0.1:3077';
const TRUSTED_PUBLIC_BRIDGE_HOSTS = ['sanmartinsr.com', 'verdant-youtiao-5cd9d3.netlify.app'];

export const isLocalHostname = (hostname = '') => {
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

export const canUseLocalBridgeHistory = () =>
  typeof window !== 'undefined' &&
  (isLocalHostname(window.location.hostname) || isTrustedPublicBridgeHostname(window.location.hostname));

export async function fetchArchivedOrdersFromBridge(dateFrom, dateTo) {
  const cleanDateFrom = String(dateFrom || '').trim();
  const cleanDateTo = String(dateTo || '').trim();

  const search = new URLSearchParams();
  if (cleanDateFrom) {
    search.set('dateFrom', cleanDateFrom);
  }
  if (cleanDateTo) {
    search.set('dateTo', cleanDateTo);
  }

  const response = await fetch(`${LOCAL_BRIDGE_ORIGIN}/api/orders/history?${search.toString()}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'No se pudo cargar el historial archivado.');
  }

  const payload = await response.json();
  return sortOrdersByDateAndNumberDesc(payload?.orders || []);
}
