import { imageDataUrlBytes } from './storeBoxImage.js';

export const PROFILE_PHOTO_MAX_BYTES = 18 * 1024;
export const PROFILE_PHOTO_MAX_FILE_BYTES = 12 * 1024 * 1024;

export function validateProfilePhoto(value) {
  if (value === '') return value;
  if (typeof value !== 'string' || value.length > 25000 ||
      !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(value) ||
      imageDataUrlBytes(value) > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error('La foto no es valida. Elegi otra imagen.');
  }
  return value;
}

export function getProfilePhoto(user) {
  try { return validateProfilePhoto(user?.profilePhoto || ''); } catch { return ''; }
}

export function createProfilePhotoSaver({ getAuthUser, writePhoto, now = Date.now }) {
  return async (user, photo) => {
    const uid = getAuthUser()?.uid;
    if (!uid || uid !== user?.key) throw new Error('Inicia sesion nuevamente para cambiar tu foto.');
    validateProfilePhoto(photo);
    const patch = { profilePhoto: photo, profilePhotoUpdatedAt: now() };
    await writePhoto(uid, patch);
    return patch;
  };
}

export async function prepareProfilePhoto(file) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) {
    throw new Error('Elegi una foto JPG, PNG o WebP de tu galeria.');
  }
  if (file.size > PROFILE_PHOTO_MAX_FILE_BYTES) throw new Error('La foto pesa mas de 12 MB. Elegi una mas pequena.');
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('La foto tardo demasiado en abrir. Intenta con otra.')), 15000);
      image.onload = resolve;
      image.onerror = () => reject(new Error('No se pudo abrir la foto. Proba con una version JPG.'));
      image.src = url;
    });
    clearTimeout(timer);
    const { naturalWidth: width, naturalHeight: height } = image;
    if (!width || !height || width * height > 32000000) throw new Error('Usa una foto de hasta 32 megapixeles.');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar la foto en este dispositivo.');
    const crop = Math.min(width, height);
    // Re-encoding strips metadata; only a small private avatar is persisted.
    for (const edge of [256, 192]) {
      canvas.width = canvas.height = Math.min(edge, crop);
      context.fillStyle = '#fffdf8';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, (width - crop) / 2, (height - crop) / 2, crop, crop, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.74, 0.6]) {
        const photo = canvas.toDataURL('image/jpeg', quality);
        if (imageDataUrlBytes(photo) <= PROFILE_PHOTO_MAX_BYTES) return validateProfilePhoto(photo);
      }
    }
    throw new Error('No se pudo reducir la foto. Proba con otra imagen.');
  } finally {
    clearTimeout(timer);
    image.onload = image.onerror = null;
    image.src = '';
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
