const NETLIFY_IMAGE_HOSTS = /(^|\.)(sanmartinsr\.com|netlify\.app)$/i;
const OPTIMIZABLE_IMAGE_HOSTS = new Set([
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
]);

const canUseNetlifyImageCdn = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.protocol === 'https:' && NETLIFY_IMAGE_HOSTS.test(window.location.hostname);
};

export const getStoreImageUrl = (source, { width = 520, quality = 75 } = {}) => {
  const cleanSource = String(source || '').trim();
  if (!cleanSource || !canUseNetlifyImageCdn()) {
    return cleanSource;
  }

  try {
    const sourceUrl = new URL(cleanSource);
    if (!OPTIMIZABLE_IMAGE_HOSTS.has(sourceUrl.hostname)) {
      return cleanSource;
    }

    const params = new URLSearchParams({
      url: cleanSource,
      w: String(Math.max(64, Math.round(Number(width) || 520))),
      q: String(Math.min(100, Math.max(1, Math.round(Number(quality) || 75)))),
      fm: 'webp',
    });

    return `/.netlify/images?${params.toString()}`;
  } catch {
    return cleanSource;
  }
};

export const applyStoreImageFallback = (event, originalSource, fallbackSource) => {
  const image = event?.currentTarget;
  if (!image) {
    return;
  }

  const cleanOriginal = String(originalSource || '').trim();
  if (cleanOriginal && image.dataset.originalFallbackApplied !== 'true') {
    image.dataset.originalFallbackApplied = 'true';
    image.src = cleanOriginal;
    return;
  }

  const cleanFallback = String(fallbackSource || '').trim();
  if (cleanFallback && image.dataset.fallbackApplied !== 'true') {
    image.dataset.fallbackApplied = 'true';
    image.src = cleanFallback;
  }
};
