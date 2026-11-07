export const BOX_IMAGE_MAX_EDGE = 1200;
export const BOX_IMAGE_TARGET_BYTES = 300 * 1024;
export const BOX_IMAGE_QUALITIES = [0.86, 0.82, 0.8];

export function fitBoxImage(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width * height > 32000000) {
    throw new Error('La foto no es valida o supera los 32 megapixeles. Usa una imagen mas pequena.');
  }
  const scale = Math.min(1, BOX_IMAGE_MAX_EDGE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function imageDataUrlBytes(value) {
  const base64 = String(value).split(',')[1] || '';
  return Math.floor(base64.length * 3 / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const timer = setTimeout(() => finish(new Error('La foto tardo demasiado en abrir. Intenta con otra imagen.')), 15000);
    const finish = error => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (error) { image.src = ''; reject(error); } else resolve(image);
    };
    image.onload = () => finish();
    image.onerror = () => finish(new Error('No se pudo abrir la foto. Usa un JPG, PNG o WebP valido.'));
    image.src = source;
  });
}

const encode = (canvas, type, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo optimizar la foto. Intenta nuevamente.')), type, quality);
});

const asDataUrl = blob => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('No se pudo leer la foto optimizada.'));
  reader.readAsDataURL(blob);
});

export async function optimizeBoxImage(source) {
  if (!String(source).startsWith('data:')) return source;
  if (!/^data:image\/(jpeg|png|webp);base64,/i.test(source)) throw new Error('Usa una foto JPG, PNG o WebP.');
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  try {
    const size = fitBoxImage(image.naturalWidth, image.naturalHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador no puede optimizar fotos. Intenta con un navegador actualizado.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, size.width, size.height);
    let type = 'image/webp';
    let best = await encode(canvas, type, BOX_IMAGE_QUALITIES[0]);
    if (best.type !== type) {
      // Some browsers encode PNG when WebP encoding is unavailable. Never flatten alpha.
      const pixels = context.getImageData(0, 0, size.width, size.height).data;
      let transparent = false;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) { transparent = true; break; }
      type = transparent ? 'image/png' : 'image/jpeg';
      best = await encode(canvas, type, BOX_IMAGE_QUALITIES[0]);
    }
    if (type !== 'image/png') {
      for (const quality of BOX_IMAGE_QUALITIES.slice(1)) {
        if (best.size <= BOX_IMAGE_TARGET_BYTES) break;
        const candidate = await encode(canvas, type, quality);
        if (candidate.size < best.size) best = candidate;
      }
    }
    // Already-small photos stay untouched rather than becoming larger or repeatedly lossy.
    return best.size < imageDataUrlBytes(source) ? await asDataUrl(best) : source;
  } finally {
    image.src = '';
    canvas.width = canvas.height = 0;
  }
}
