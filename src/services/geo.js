export const normalizeLocation = (location = {}) => {
  const source = location || {};
  const lat = Number(source.lat ?? source.latitude);
  const lng = Number(source.lng ?? source.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    label: String(source.label || source.address || '').trim(),
    placeId: String(source.placeId || source.place_id || '').trim(),
    mapsUrl: buildGoogleMapsPlaceUrlFromCoords(lat, lng),
    updatedAt: Number(source.updatedAt || Date.now()),
  };
};

export const hasLocation = (location) => Boolean(normalizeLocation(location));

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';
const DEFAULT_COUNTRY_CODE = 'ni';
const SEARCH_LANGUAGE = 'es-NI,es;q=0.9,en;q=0.6';

const buildGeoHeaders = () => ({
  Accept: 'application/json',
  'Accept-Language': SEARCH_LANGUAGE,
});

const buildGoogleMapsSearchUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const buildGoogleMapsPlaceUrlFromCoords = (lat, lng) =>
  buildGoogleMapsSearchUrl(`${lat},${lng}`);

export const buildGoogleMapsPlaceUrl = (location) => {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return '';
  }

  return buildGoogleMapsPlaceUrlFromCoords(normalized.lat, normalized.lng);
};

export const buildGoogleMapsAddressUrl = (address) => {
  const cleanAddress = String(address || '').trim();
  if (!cleanAddress || cleanAddress === '-') {
    return '';
  }

  return buildGoogleMapsSearchUrl(cleanAddress);
};

export const buildGoogleMapsEmbedUrl = (location) => {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return '';
  }

  return `https://www.google.com/maps?q=${normalized.lat},${normalized.lng}&z=17&output=embed`;
};

export const getBrowserLocation = () =>
  new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalizacion no disponible'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve(
          normalizeLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            updatedAt: Date.now(),
          })
        );
      },
      reject,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  });

const parseNominatimResult = (result = {}) => {
  const normalized = normalizeLocation({
    lat: result.lat,
    lng: result.lon,
    label: result.display_name || result.name || '',
    placeId: result.place_id,
    updatedAt: Date.now(),
  });

  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    shortLabel: String(
      result.name ||
        result.display_name?.split(',').slice(0, 2).join(',') ||
        normalized.label
    ).trim(),
    provider: 'nominatim',
  };
};

const runNominatimSearch = async ({ query, limit, countryCode }) => {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    namedetails: '1',
    extratags: '1',
    limit: String(limit),
    dedupe: '1',
  });

  const cleanCountryCode = String(countryCode || '').trim().toLowerCase();
  if (cleanCountryCode) {
    params.set('countrycodes', cleanCountryCode);
  }

  const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params.toString()}`, {
    headers: buildGeoHeaders(),
  });

  if (!response.ok) {
    throw new Error('No se pudo buscar la direccion');
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload.map(parseNominatimResult).filter(Boolean) : [];
};

export const searchLocationCandidates = async (query, options = {}) => {
  const cleanQuery = String(query || '').trim();
  if (cleanQuery.length < 3) {
    return [];
  }

  const limit = Math.max(1, Math.min(Number(options.limit || 10), 12));
  const countryCode = String(options.countryCode || DEFAULT_COUNTRY_CODE).toLowerCase();
  const broadSearch = Boolean(options.broad);
  const queryVariants = broadSearch
    ? Array.from(new Set([
        cleanQuery,
        `${cleanQuery}, Granada, Nicaragua`,
        `${cleanQuery}, Nicaragua`,
      ]))
    : [cleanQuery];
  const byKey = new Map();

  const collectResults = (results = []) => {
    results.forEach((result) => {
      const key = result.placeId || `${Number(result.lat).toFixed(6)},${Number(result.lng).toFixed(6)}`;
      if (!byKey.has(key)) {
        byKey.set(key, result);
      }
    });
  };

  for (const variant of queryVariants) {
    if (byKey.size >= limit) {
      break;
    }

    collectResults(await runNominatimSearch({ query: variant, limit, countryCode }));
  }

  if (broadSearch && byKey.size < Math.min(6, limit)) {
    for (const variant of queryVariants) {
      if (byKey.size >= limit) {
        break;
      }

      collectResults(await runNominatimSearch({ query: variant, limit, countryCode: '' }));
    }
  }

  return Array.from(byKey.values()).slice(0, limit);
};

export const reverseGeocodeLocation = async (location, options = {}) => {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return null;
  }

  const params = new URLSearchParams({
    lat: String(normalized.lat),
    lon: String(normalized.lng),
    format: 'jsonv2',
    addressdetails: '1',
    zoom: String(Math.max(12, Math.min(Number(options.zoom || 18), 18))),
  });

  const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${params.toString()}`, {
    headers: buildGeoHeaders(),
  });

  if (!response.ok) {
    throw new Error('No se pudo resolver la direccion del punto');
  }

  const payload = await response.json();
  const resolved = parseNominatimResult(payload);

  return (
    resolved || {
      ...normalized,
      label:
        normalized.label || `${normalized.lat.toFixed(6)}, ${normalized.lng.toFixed(6)}`,
    }
  );
};

const toRadians = (value) => (Number(value) * Math.PI) / 180;

export const getDistanceKm = (from, to) => {
  const start = normalizeLocation(from);
  const end = normalizeLocation(to);

  if (!start || !end) {
    return Number.POSITIVE_INFINITY;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(end.lat - start.lat);
  const dLng = toRadians(end.lng - start.lng);
  const lat1 = toRadians(start.lat);
  const lat2 = toRadians(end.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const compareRouteOrderPriority = (left = {}, right = {}) => {
  const dateDiff = String(left.fecha || '').localeCompare(String(right.fecha || ''));
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return Number(left.id || 0) - Number(right.id || 0);
};

export const optimizeStopsByNearest = (orders = [], origin = null) => {
  const withLocation = orders.filter((order) => normalizeLocation(order.ubicacion));
  const withoutLocation = orders
    .filter((order) => !normalizeLocation(order.ubicacion))
    .sort(compareRouteOrderPriority);
  const remaining = [...withLocation];
  const optimized = [];
  let currentLocation = normalizeLocation(origin) || normalizeLocation(remaining[0]?.ubicacion);

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((order, index) => {
      const distance = getDistanceKm(currentLocation, order.ubicacion);
      const currentBest = remaining[bestIndex];
      const shouldReplace =
        distance < bestDistance - 0.05 ||
        (Math.abs(distance - bestDistance) <= 0.05 &&
          compareRouteOrderPriority(order, currentBest) < 0);

      if (shouldReplace) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    const [nextOrder] = remaining.splice(bestIndex, 1);
    optimized.push(nextOrder);
    currentLocation = normalizeLocation(nextOrder.ubicacion);
  }

  return [...optimized, ...withoutLocation];
};

export const buildGoogleMapsRouteUrl = (orders = [], origin = null) => {
  const stops = orders
    .map((order) => normalizeLocation(order.ubicacion))
    .filter(Boolean);

  if (stops.length === 0) {
    return '';
  }

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const originLocation = normalizeLocation(origin);
  const originParam = originLocation ? `${originLocation.lat},${originLocation.lng}` : 'My Location';
  const waypointStops = stops.length > 1 ? stops.slice(0, -1) : [];
  const waypoints = waypointStops.map((stop) => `${stop.lat},${stop.lng}`).join('|');
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    origin: originParam,
    destination: `${lastStop.lat},${lastStop.lng}`,
  });

  if (waypoints) {
    params.set('waypoints', waypoints);
  } else if (!originLocation) {
    params.set('destination', `${firstStop.lat},${firstStop.lng}`);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
};
