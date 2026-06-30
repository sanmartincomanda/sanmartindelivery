export const CRM_PROJECT_CONFIG = Object.freeze({
  apiKey: 'AIzaSyDDQKmyKHmbV9PKSwXkE6iz20Qq8-V3620',
  authDomain: 'crm-sanmartin-granada.firebaseapp.com',
  projectId: 'crm-sanmartin-granada',
  storageBucket: 'crm-sanmartin-granada.firebasestorage.app',
  messagingSenderId: '563904702605',
  appId: '1:563904702605:web:11574d4af789d5da2ddac4',
  measurementId: 'G-B2C9614GSN',
});

export const CRM_PUBLIC_SNAPSHOT_ROOT = 'crm';
export const CRM_PUBLIC_SNAPSHOT_NAMES = Object.freeze({
  dashboard: 'dashboard',
});

export const getCrmSnapshotPath = (snapshotName) =>
  `${CRM_PUBLIC_SNAPSHOT_ROOT}/${String(snapshotName || '').trim()}.json`;

export const buildCrmSnapshotUrl = (snapshotName) =>
  `https://firebasestorage.googleapis.com/v0/b/${CRM_PROJECT_CONFIG.storageBucket}/o/${encodeURIComponent(
    getCrmSnapshotPath(snapshotName)
  )}?alt=media`;

export async function fetchCrmSnapshot(snapshotName) {
  const response = await fetch(buildCrmSnapshotUrl(snapshotName), {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`El snapshot CRM ${snapshotName} respondio con ${response.status}.`);
  }

  return response.json();
}

export async function fetchEmbeddedCrmSnapshot(snapshotName) {
  const response = await fetch(`/${getCrmSnapshotPath(snapshotName)}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`El snapshot embebido CRM ${snapshotName} respondio con ${response.status}.`);
  }

  return response.json();
}
