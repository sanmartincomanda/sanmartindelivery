const DEFAULT_SICAR_BRIDGE_URL = import.meta.env.VITE_SICAR_BRIDGE_URL || 'http://127.0.0.1:3077';

const parseJsonResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `SICAR bridge devolvio ${response.status}`);
  }
  return payload;
};

export const getSicarBridgeUrl = () => DEFAULT_SICAR_BRIDGE_URL.replace(/\/+$/, '');

const isHttpsPageUsingHttpBridge = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const bridgeUrl = new URL(getSicarBridgeUrl());
    return window.location.protocol === 'https:' && bridgeUrl.protocol === 'http:';
  } catch (error) {
    return false;
  }
};

const buildSicarBridgeFetchError = (error) => {
  const bridgeUrl = getSicarBridgeUrl();

  if (isHttpsPageUsingHttpBridge()) {
    return new Error(
      `El navegador esta bloqueando el puente local ${bridgeUrl} porque esta app fue abierta en HTTPS. Para usar SICAR abre el administrador local en http://127.0.0.1:5173 y deja activo "npm run sicar:bridge".`
    );
  }

  return new Error(
    `No se pudo conectar al puente local ${bridgeUrl}. Verifica que siga activo con "npm run sicar:bridge".`
  );
};

const fetchSicarBridge = async (path, options = {}) => {
  try {
    return await fetch(`${getSicarBridgeUrl()}${path}`, options);
  } catch (error) {
    throw buildSicarBridgeFetchError(error);
  }
};

export async function getSicarBridgeHealth() {
  const response = await fetchSicarBridge('/api/sicar/health', {
    headers: {
      Accept: 'application/json',
    },
  });

  return parseJsonResponse(response);
}

export async function fetchSicarCatalogSelection() {
  const response = await fetchSicarBridge('/api/sicar/catalog', {
    headers: {
      Accept: 'application/json',
    },
  });

  const payload = await parseJsonResponse(response);
  if (!Array.isArray(payload?.products)) {
    throw new Error('La respuesta de SICAR no trae productos.');
  }

  return payload;
}

export async function fetchSicarProductImage(code) {
  const safeCode = encodeURIComponent(String(code || '').trim());
  const response = await fetchSicarBridge(`/api/sicar/image?code=${safeCode}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  return parseJsonResponse(response);
}

export async function fetchSicarPricesByCodes(codes = []) {
  const uniqueCodes = Array.from(
    new Set(
      (Array.isArray(codes) ? codes : [])
        .map((code) => String(code || '').trim())
        .filter(Boolean)
    )
  );

  if (uniqueCodes.length === 0) {
    return {
      ok: true,
      requestedCodes: 0,
      matchedCodes: 0,
      products: [],
    };
  }

  const response = await fetchSicarBridge('/api/sicar/prices', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      codes: uniqueCodes,
    }),
  });

  const payload = await parseJsonResponse(response);
  if (!Array.isArray(payload?.products)) {
    throw new Error('La respuesta de SICAR no trae precios.');
  }

  return payload;
}

export async function syncSicarQuoteForOrder(orderKey, options = {}) {
  const cleanOrderKey = String(orderKey || '').trim();
  if (!cleanOrderKey) {
    throw new Error('Falta el identificador del pedido.');
  }

  const response = await fetchSicarBridge('/api/sicar/quote', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderKey: cleanOrderKey,
      applyToFirebase: options.applyToFirebase === true,
    }),
  });

  const payload = await parseJsonResponse(response);
  if (!payload?.quote || !Array.isArray(payload.quote.items)) {
    throw new Error('La respuesta de la cotizacion SICAR no trae detalle valido.');
  }

  return payload;
}

const loadImageElement = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
    image.src = src;
  });

export async function compressImportedCatalogImage(dataUrl) {
  if (!dataUrl || typeof document === 'undefined') {
    return dataUrl || '';
  }

  try {
    const image = await loadImageElement(dataUrl);
    const maxSide = 720;
    const ratio = Math.min(1, maxSide / Math.max(image.width || 1, image.height || 1));
    const width = Math.max(1, Math.round((image.width || 1) * ratio));
    const height = Math.max(1, Math.round((image.height || 1) * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');

    if (!context) {
      return dataUrl;
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL('image/jpeg', 0.82);
  } catch (error) {
    console.error('No se pudo comprimir la imagen importada desde SICAR:', error);
    return dataUrl;
  }
}
