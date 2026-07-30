const GOOGLE_MAPS_SCRIPT_ID = 'sanmartin-google-maps-api';
const GOOGLE_MAPS_CALLBACK = '__sanMartinGoogleMapsReady';

let googleMapsPromise = null;

const cleanApiKey = (value = '') => String(value || '').trim();

export const getGoogleMapsApiKey = () => {
  const runtimeKey =
    typeof window !== 'undefined'
      ? cleanApiKey(window.__SANMARTIN_GOOGLE_MAPS_API_KEY__)
      : '';

  return runtimeKey || cleanApiKey(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
};

export const hasGoogleMapsApiKey = () => Boolean(getGoogleMapsApiKey());

export const loadGoogleMapsApi = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Google Maps solo esta disponible en el navegador.'));
  }

  if (window.google?.maps?.importLibrary) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    const error = new Error('Falta configurar VITE_GOOGLE_MAPS_API_KEY.');
    error.code = 'GOOGLE_MAPS_KEY_MISSING';
    return Promise.reject(error);
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const clearCallback = () => {
      try {
        delete window[GOOGLE_MAPS_CALLBACK];
      } catch {
        window[GOOGLE_MAPS_CALLBACK] = undefined;
      }
    };

    window[GOOGLE_MAPS_CALLBACK] = () => {
      clearCallback();
      if (window.google?.maps?.importLibrary) {
        resolve(window.google.maps);
        return;
      }

      googleMapsPromise = null;
      reject(new Error('Google Maps no termino de cargar correctamente.'));
    };

    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => {
          clearCallback();
          googleMapsPromise = null;
          reject(new Error('No se pudo cargar Google Maps.'));
        },
        { once: true }
      );
      return;
    }

    const params = new URLSearchParams({
      key: apiKey,
      loading: 'async',
      libraries: 'places',
      language: 'es',
      region: 'NI',
      v: 'weekly',
      callback: GOOGLE_MAPS_CALLBACK,
      auth_referrer_policy: 'origin',
    });
    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.onerror = () => {
      clearCallback();
      googleMapsPromise = null;
      reject(new Error('No se pudo cargar Google Maps.'));
    };
    document.head.appendChild(script);
  });

  return googleMapsPromise;
};

export const importGoogleMapsLibrary = async (libraryName) => {
  const maps = await loadGoogleMapsApi();
  return maps.importLibrary(libraryName);
};
