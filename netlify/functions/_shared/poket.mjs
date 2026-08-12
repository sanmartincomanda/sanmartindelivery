import crypto from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';

export const POKET_API_BASE = 'https://poket-api.lafise.com';

const parseServiceAccount = () => {
  const rawValue = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!rawValue) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no esta configurado');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(rawValue);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON no contiene JSON valido');
  }

  if (serviceAccount.private_key) {
    serviceAccount.private_key = String(serviceAccount.private_key).replace(/\\n/g, '\n');
  }

  return serviceAccount;
};

export const getFirebaseAdmin = () => {
  const databaseURL = String(process.env.FIREBASE_DATABASE_URL || '').trim();
  if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL no esta configurado');
  }

  const app = getApps()[0] || initializeApp({
    credential: cert(parseServiceAccount()),
    databaseURL,
  });

  return {
    auth: getAuth(app),
    database: getDatabase(app),
  };
};

export const getPoketConfig = () => {
  const config = {
    accessToken: String(process.env.POKET_ACCESS_TOKEN || '').trim(),
    merchantId: String(process.env.POKET_MERCHANT_ID || '').trim(),
    terminalId: String(process.env.POKET_TERMINAL_ID || '').trim(),
    callbackUrl: String(
      process.env.POKET_CALLBACK_URL || 'https://tienda.sanmartinsr.com/?poket=return'
    ).trim(),
    ttlMinutes: Math.max(10, Number(process.env.POKET_PAYLINK_TTL_MINUTES || 1440)),
  };

  const missing = Object.entries(config)
    .filter(([key, value]) => key !== 'ttlMinutes' && !value)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`Configuracion Poket incompleta: ${missing.join(', ')}`);
  }

  return config;
};

export const jsonResponse = (statusCode, payload, extraHeaders = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
  },
  body: JSON.stringify(payload),
});

const configuredOrigins = () => new Set([
  'https://tienda.sanmartinsr.com',
  'https://localhost',
  'capacitor://localhost',
  ...String(process.env.POKET_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
]);

export const corsHeaders = (event) => {
  const origin = String(event?.headers?.origin || event?.headers?.Origin || '').trim();
  const allowed = configuredOrigins();
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://tienda.sanmartinsr.com',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
};

export const verifyFirebaseRequest = async (event) => {
  const authorization = String(
    event?.headers?.authorization || event?.headers?.Authorization || ''
  ).trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Sesion requerida');
    error.statusCode = 401;
    throw error;
  }

  const { auth } = getFirebaseAdmin();
  return auth.verifyIdToken(match[1], true);
};

export const poketRequest = async (path, { method = 'GET', body } = {}) => {
  const { accessToken } = getPoketConfig();
  const response = await fetch(`${POKET_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: accessToken,
      'Content-Type': 'application/json',
      'x-platform': 'SanMartinDelivery',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const rawBody = await response.text();
  let data = {};
  try {
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = { message: rawBody };
  }

  if (!response.ok) {
    const error = new Error(
      data?.message || data?.detail || data?.error || `Poket respondio HTTP ${response.status}`
    );
    error.statusCode = response.status;
    error.providerResponse = data;
    throw error;
  }

  return data;
};

export const normalizePaymentMethod = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const isPoketPaymentMethod = (value) => normalizePaymentMethod(value).includes('LINK');

export const roundCurrency = (value) => Number(Number(value || 0).toFixed(2));

export const extractExternalLinkId = (permanentLink) => {
  try {
    const url = new URL(String(permanentLink || ''));
    return url.pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return '';
  }
};

export const isSafeFirebaseKey = (value) =>
  /^[A-Za-z0-9_-]{1,180}$/.test(String(value || '').trim());

export const secureEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

export const acquireOrderLock = async (database, orderKey) => {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const lockRef = database.ref(`poketPaylinkLocks/${orderKey}`);
  const result = await lockRef.transaction((current) => {
    if (current?.expiresAt && Number(current.expiresAt) > now) {
      return;
    }
    return { owner, expiresAt: now + 45_000 };
  }, undefined, false);

  if (!result.committed || result.snapshot.val()?.owner !== owner) {
    const error = new Error('El enlace de pago ya se esta preparando. Intenta nuevamente.');
    error.statusCode = 409;
    throw error;
  }

  return async () => {
    const snapshot = await lockRef.get();
    if (snapshot.val()?.owner === owner) {
      await lockRef.remove();
    }
  };
};

export const buildWebhookAuthentication = () => ({
  username: String(process.env.POKET_WEBHOOK_USERNAME || '').trim(),
  password: String(process.env.POKET_WEBHOOK_PASSWORD || '').trim(),
});

