import { getDistanceKm } from './geo.js';

export const ROUTE_WEEKDAYS = [
  { value: 1, label: 'Lunes', short: 'Lun' }, { value: 2, label: 'Martes', short: 'Mar' },
  { value: 3, label: 'Miércoles', short: 'Mié' }, { value: 4, label: 'Jueves', short: 'Jue' },
  { value: 5, label: 'Viernes', short: 'Vie' }, { value: 6, label: 'Sábado', short: 'Sáb' },
  { value: 0, label: 'Domingo', short: 'Dom' },
];
export const ROUTE_MAX_ZONES = 20;
export const ROUTE_MAX_VERTICES = 60;
export const ROUTE_MAX_RADIUS_KM = 200;
const values = (value) => value && typeof value === 'object' ? Object.values(value) : [];

export const routePoint = (point) => {
  if (!point || point.lat === '' || point.lng === '' || point.lat == null || point.lng == null) return null;
  const lat = Number(point.lat), lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 85 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
};
const cross = (a, b, c) => (b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < 1e-10 &&
  p.lat >= Math.min(a.lat, b.lat) - 1e-10 && p.lat <= Math.max(a.lat, b.lat) + 1e-10 &&
  p.lng >= Math.min(a.lng, b.lng) - 1e-10 && p.lng <= Math.max(a.lng, b.lng) + 1e-10;
const intersects = (a, b, c, d) =>
  (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) ||
  onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);

export const validRoutePolygon = (vertices) => {
  if (!Array.isArray(vertices) || vertices.length < 3 || vertices.length > ROUTE_MAX_VERTICES || vertices.some((p) => !routePoint(p))) return false;
  const points = vertices.map(routePoint);
  if (new Set(points.map((p) => `${p.lat},${p.lng}`)).size !== points.length) return false;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    area += a.lng * b.lat - b.lng * a.lat;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (intersects(a, b, points[j], points[(j + 1) % points.length])) return false;
    }
  }
  return Math.abs(area) > 1e-8;
};

export const pointInRoutePolygon = (point, vertices) => {
  const target = routePoint(point);
  if (!target || !validRoutePolygon(vertices)) return false;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i], b = vertices[j];
    if (onSegment(target, a, b)) return true;
    if ((a.lat > target.lat) !== (b.lat > target.lat) &&
      target.lng < (b.lng - a.lng) * (target.lat - a.lat) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
};

export const defaultRouteZones = (branch) => [{
  id: 'granada-radio', name: 'Granada y alrededores', type: 'radius', active: true,
  radiusKm: Math.min(40, Math.max(0.1, Number(branch?.routeSanMartinRadiusKm) || 40)),
  vertices: [], deliveryDays: [1, 2, 3, 4, 5, 6, 0],
}];

export const getRouteZones = (branch) => {
  const source = branch?.routeSanMartin?.schemaVersion === 1
    ? values(branch.routeSanMartin.zones) : defaultRouteZones(branch);
  return source.map((zone) => ({
    id: String(zone?.id || ''), name: String(zone?.name || ''), type: zone?.type,
    active: zone?.active === true, radiusKm: Number(zone?.radiusKm) || 0,
    vertices: values(zone?.vertices).map((point) => routePoint(point) || { lat: NaN, lng: NaN }),
    deliveryDays: [...new Set(values(zone?.deliveryDays).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))],
  }));
};

export const validateRouteZones = (zones, enabled = false) => {
  if (!Array.isArray(zones) || zones.length > ROUTE_MAX_ZONES) return `Podés guardar hasta ${ROUTE_MAX_ZONES} zonas.`;
  if (zones.some((zone) => !zone || typeof zone !== 'object' || Array.isArray(zone))) return 'La lista de zonas no es válida.';
  if (enabled && !zones.some((zone) => zone.active)) return 'Agregá al menos una zona activa antes de habilitar Ruta.';
  if (new Set(zones.map((zone) => zone.id)).size !== zones.length) return 'Cada zona debe tener un identificador único.';
  for (const zone of zones) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(zone.id) || !String(zone.name || '').trim() || String(zone.name).length > 80) return 'Cada zona necesita un nombre (máximo 80 caracteres).';
    if (typeof zone.active !== 'boolean') return 'Revisá el estado de las zonas.';
    if (!Array.isArray(zone.deliveryDays) || zone.deliveryDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || (zone.active && !zone.deliveryDays.length)) return `${zone.name}: elegí al menos un día de entrega.`;
    if (zone.type === 'radius') {
      if (!Number.isFinite(Number(zone.radiusKm)) || Number(zone.radiusKm) < 0.1 || Number(zone.radiusKm) > ROUTE_MAX_RADIUS_KM) return `${zone.name}: el radio debe ser de 0.1 a ${ROUTE_MAX_RADIUS_KM} km.`;
    } else if (zone.type !== 'polygon' || !validRoutePolygon(zone.vertices)) return `${zone.name}: marcá entre 3 y ${ROUTE_MAX_VERTICES} puntos sin cruzar los bordes del polígono.`;
  }
  return '';
};

export const matchingRouteZones = (branch, destination) => {
  const target = routePoint(destination), origin = routePoint(branch?.storeLocation);
  if (!origin || !target) return [];
  return getRouteZones(branch).filter((zone) => zone.active && zone.deliveryDays.length &&
    (zone.type === 'radius'
      ? Number.isFinite(zone.radiusKm) && zone.radiusKm >= 0.1 && zone.radiusKm <= ROUTE_MAX_RADIUS_KM && getDistanceKm(origin, target) <= zone.radiusKm + 1e-8
      : zone.type === 'polygon' && pointInRoutePolygon(target, zone.vertices)));
};

export const routeDaysLabel = (days = []) => ROUTE_WEEKDAYS.filter((day) => days.includes(day.value)).map((day) => day.short).join(' · ');
