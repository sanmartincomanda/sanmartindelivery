import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import {
  CRM_DASHBOARD_STORAGE_PATH,
  getCrmEmbeddedSnapshotPath,
  CRM_PROJECT_ID,
  CRM_STORAGE_BUCKET,
  getCrmDashboardSnapshot,
  getCrmLocalBackupPath,
} from './crmAnalytics.mjs';

const KEYS_ROOT = 'C:\\Users\\Microsoft Windows 11\\Documents\\APLICACIONES\\claves';

const findCrmServiceAccountPath = () => {
  const explicitPath = String(process.env.CRM_FIREBASE_ADMIN_PATH || '').trim();
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  if (!existsSync(KEYS_ROOT)) {
    return '';
  }

  const matchedFile = readdirSync(KEYS_ROOT).find((fileName) =>
    fileName.toLowerCase().includes('crm-sanmartin-granada') && fileName.toLowerCase().endsWith('.json')
  );

  return matchedFile ? resolve(KEYS_ROOT, matchedFile) : '';
};

const getAdminStorageBucket = (serviceAccountPath) => {
  if (!serviceAccountPath || !existsSync(serviceAccountPath)) {
    return null;
  }

  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  if (serviceAccount.project_id !== CRM_PROJECT_ID) {
    throw new Error(
      `El SDK admin encontrado pertenece a ${serviceAccount.project_id || 'desconocido'}, pero el CRM esta configurado para ${CRM_PROJECT_ID}.`
    );
  }

  const appName = 'crm-analytics-admin';
  const existingApp = getApps().find((app) => app.name === appName);
  const app =
    existingApp ||
    initializeApp(
      {
        credential: cert(serviceAccount),
        storageBucket: CRM_STORAGE_BUCKET,
      },
      appName
    );

  return getStorage(app).bucket(CRM_STORAGE_BUCKET);
};

const publishSnapshot = async (payload) => {
  const serviceAccountPath = findCrmServiceAccountPath();
  if (!serviceAccountPath) {
    return {
      published: false,
      reason: 'missing-admin-sdk',
      message:
        'No se encontro un SDK admin para crm-sanmartin-granada. Se genero solo el respaldo local del dashboard.',
    };
  }

  const bucket = getAdminStorageBucket(serviceAccountPath);
  await bucket.file(CRM_DASHBOARD_STORAGE_PATH).save(JSON.stringify(payload, null, 2), {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: {
      cacheControl: 'public,max-age=60',
    },
  });

  return {
    published: true,
    serviceAccountPath,
    bucket: CRM_STORAGE_BUCKET,
    objectPath: CRM_DASHBOARD_STORAGE_PATH,
  };
};

const main = async () => {
  const payload = await getCrmDashboardSnapshot({ force: true });
  let publishResult;

  try {
    publishResult = await publishSnapshot(payload);
  } catch (error) {
    publishResult = {
      published: false,
      reason: 'storage-unavailable',
      message: String(
        error?.message ||
          'No se pudo publicar al bucket del CRM. Se genero el snapshot embebido para el deploy web.'
      ).trim(),
    };
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        generatedAt: payload.generatedAt,
        localBackupPath: getCrmLocalBackupPath(),
        embeddedSnapshotPath: getCrmEmbeddedSnapshotPath(),
        publishResult,
      },
      null,
      2
    )
  );
};

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
