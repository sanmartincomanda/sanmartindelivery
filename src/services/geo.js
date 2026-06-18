export const normalizeLocation = (location = {}) => {
  const lat = Number(location.lat ?? location.latitude);
  const lng = Number(location.lng ?? location.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    lat,
    lng,
    label: String(location.label || location.address || '').trim(),
    mapsUrl: buildGoogleMapsPlaceUrlFromCoords(lat, lng),
    updatedAt: Number(location.updatedAt || Date.now()),
  };
};

export const hasLocation = (location) => Boolean(normalizeLocation(location));

const buildGoogleMapsPlaceUrlFromCoords = (lat, lng) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export const buildGoogleMapsPlaceUrl = (location) => {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return '';
  }

  return buildGoogleMapsPlaceUrlFromCoords(normalized.lat, normalized.lng);
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

export const optimizeStopsByNearest = (orders = [], origin = null) => {
  const withLocation = orders.filter((order) => normalizeLocation(order.ubicacion));
  const withoutLocation = orders.filter((order) => !normalizeLocation(order.ubicacion));
  const remaining = [...withLocation];
  const optimized = [];
  let currentLocation = normalizeLocation(origin) || normalizeLocation(remaining[0]?.ubicacion);

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    remaining.forEach((order, index) => {
      const distance = getDistanceKm(currentLocation, order.ubicacion);
      if (distance < bestDistance) {
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
