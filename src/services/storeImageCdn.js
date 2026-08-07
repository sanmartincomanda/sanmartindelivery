export const getStoreImageUrl = (source) => String(source || '').trim();

const resolveImageUrl = (source) => {
  const cleanSource = String(source || '').trim();
  if (!cleanSource) return '';

  try {
    return new URL(cleanSource, document.baseURI).href;
  } catch {
    return cleanSource;
  }
};

export const applyStoreImageFallback = (event, originalSource, fallbackSource) => {
  const image = event?.currentTarget;
  if (!image) return;

  const cleanOriginal = String(originalSource || '').trim();
  const resolvedOriginal = resolveImageUrl(cleanOriginal);
  const currentSource = String(image.currentSrc || image.src || '').trim();

  if (
    cleanOriginal
    && resolvedOriginal !== currentSource
    && image.dataset.originalFallbackApplied !== 'true'
  ) {
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
