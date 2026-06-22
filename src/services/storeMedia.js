import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { storage } from '../firebase';

const STORE_MEDIA_ROOT = 'store';
const STORE_CATALOG_MEDIA_ROOT = `${STORE_MEDIA_ROOT}/catalog`;
const STORE_PROMOTION_MEDIA_ROOT = `${STORE_MEDIA_ROOT}/promotions`;
const STORAGE_UPLOAD_TIMEOUT_MS = 20000;

const cleanStorageSegment = (value) =>
  String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_');

const inferImageExtension = (dataUrl = '') => {
  const normalized = String(dataUrl || '').trim().toLowerCase();
  if (normalized.startsWith('data:image/png')) {
    return 'png';
  }

  if (normalized.startsWith('data:image/webp')) {
    return 'webp';
  }

  return 'jpg';
};

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const fallbackHashString = (value = '') => {
  let hash = 0;
  const source = String(value || '');

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }

  return `fallback-${Math.abs(hash)}`;
};

export const isDataUrlImage = (value = '') => /^data:image\/[a-z0-9.+-]+;base64,/i.test(String(value || '').trim());

const withTimeout = (promise, timeoutMs, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    Promise.resolve(promise)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });

export async function createImageHash(value = '', hashHint = '') {
  const cleanHint = String(hashHint || '').trim();
  if (cleanHint) {
    return cleanHint;
  }

  const cleanValue = String(value || '').trim();
  if (!cleanValue) {
    return '';
  }

  if (globalThis.crypto?.subtle && typeof TextEncoder !== 'undefined') {
    const encoded = new TextEncoder().encode(cleanValue);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded);
    return toHex(digest).slice(0, 24);
  }

  return fallbackHashString(cleanValue);
}

export async function uploadStoreImage({
  root = STORE_CATALOG_MEDIA_ROOT,
  entityId,
  image,
  hashHint = '',
  allowInlineFallback = false,
}) {
  const imageData = String(image || '').trim();
  if (!isDataUrlImage(imageData)) {
    return {
      url: imageData,
      path: '',
      hash: String(hashHint || '').trim(),
      storedInline: false,
    };
  }

  const cleanId = cleanStorageSegment(entityId) || 'item';
  const hash = await createImageHash(imageData, hashHint);
  const extension = inferImageExtension(imageData);
  const path = `${String(root || STORE_CATALOG_MEDIA_ROOT).replace(/\/+$/, '')}/${cleanId}/${hash || Date.now()}.${extension}`;
  const imageRef = storageRef(storage, path);

  try {
    await withTimeout(
      uploadString(imageRef, imageData, 'data_url'),
      STORAGE_UPLOAD_TIMEOUT_MS,
      'La subida de la foto a Firebase Storage tardo demasiado.'
    );

    return {
      url: await withTimeout(
        getDownloadURL(imageRef),
        STORAGE_UPLOAD_TIMEOUT_MS,
        'No se pudo obtener la URL publica de la foto en Firebase Storage.'
      ),
      path,
      hash,
      storedInline: false,
    };
  } catch (error) {
    console.warn('No se pudo subir la foto a Firebase Storage.', error);

    if (!allowInlineFallback) {
      throw new Error(
        'No se pudo subir la foto a Firebase Storage. Intenta nuevamente cuando la conexion este estable.'
      );
    }

    return {
      url: imageData,
      path: '',
      hash,
      storedInline: true,
    };
  }
}

export async function uploadCatalogImage({
  code,
  image,
  hashHint = '',
  allowInlineFallback = false,
}) {
  return uploadStoreImage({
    root: STORE_CATALOG_MEDIA_ROOT,
    entityId: code,
    image,
    hashHint,
    allowInlineFallback,
  });
}

export async function uploadPromotionImage({
  id,
  image,
  hashHint = '',
  allowInlineFallback = false,
}) {
  return uploadStoreImage({
    root: STORE_PROMOTION_MEDIA_ROOT,
    entityId: id,
    image,
    hashHint,
    allowInlineFallback,
  });
}
