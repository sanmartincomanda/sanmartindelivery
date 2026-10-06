import { normalizeLocation } from './geo.js';
import {
  ROUTE_SAN_MARTIN_FULFILLMENT,
  ROUTE_SAN_MARTIN_ORIGIN_BRANCH_ID,
  getRouteSanMartinQuote,
  getRouteSanMartinSchedule,
  getRouteSanMartinShortfall,
} from './routeSanMartin.js';

export const normalizeManualRouteLocation = (latitude, longitude) => {
  if (!String(latitude ?? '').trim() || !String(longitude ?? '').trim()) return null;
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return normalizeLocation({ lat, lng });
};

const routeError = (message) => Object.assign(new Error(message), { code: 'MANUAL_ROUTE_INVALID' });

// Adapt the manual form to the same coverage, minimum and schedule used by the store.
// createOrder revalidates the schedule and assigns the global RS sequence when saving.
export const prepareManualRouteOrder = ({
  branch, destination, subtotal, itemCount, slotId, now = new Date(),
}) => {
  if (branch?.id !== ROUTE_SAN_MARTIN_ORIGIN_BRANCH_ID || branch?.active === false) {
    throw routeError('Ruta San Martin sale unicamente desde la sucursal Granada activa.');
  }
  if (!normalizeLocation(destination)) {
    throw routeError('Agrega el pin de la direccion del cliente para validar la cobertura de Ruta.');
  }
  const quote = getRouteSanMartinQuote({ branch, destination });
  if (!quote.available) {
    throw routeError(`La direccion esta fuera de la cobertura de Ruta San Martin (${quote.coverageRadiusKm} km desde Granada).`);
  }
  if (!itemCount || getRouteSanMartinShortfall(subtotal) > 0) {
    throw routeError('Ruta San Martin requiere un minimo de C$1,000 en productos del catalogo. Las notas no cuentan para el minimo.');
  }
  const schedule = slotId ? getRouteSanMartinSchedule(now, slotId) : null;
  if (!schedule?.slotId) {
    throw routeError('Selecciona una franja disponible para Ruta San Martin. Los horarios se actualizan segun la hora de ingreso.');
  }
  return {
    fulfillmentType: ROUTE_SAN_MARTIN_FULFILLMENT,
    routeSlotId: schedule.slotId,
    storeTenantId: branch.tenantId || 'sanmartinsr',
    storeBranchId: branch.id,
    storeBranchCode: branch.branchCode || branch.id,
    storeBranchName: branch.name || 'Carnes San Martin Granada',
    storeBranchShortName: branch.shortName || 'Granada',
    storeBranchCity: branch.city || 'Granada',
    storeBranchAddress: branch.address || '',
    storeBranchPhone: branch.phone || '',
    storeBranchWhatsapp: branch.whatsapp || '',
    storeBranchLocation: normalizeLocation(branch.storeLocation),
    deliveryMode: 'perfil',
    deliveryManualWithoutPin: false,
    deliveryFeePending: false,
    deliveryDistanceKm: quote.distanceKm,
    coverageRadiusKm: quote.coverageRadiusKm,
    deliveryFee: 0,
    deliveryFeeOriginal: 0,
    deliveryFeeBase: 0,
    deliveryFeeTax: 0,
    deliveryFeeBaseOriginal: 0,
    deliveryFeeTaxOriginal: 0,
    deliveryFeeBracket: ROUTE_SAN_MARTIN_FULFILLMENT,
    deliveryFree: true,
    deliveryPromotionLabel: 'Ruta San Martin - envio gratis',
    deliveryPromotionType: ROUTE_SAN_MARTIN_FULFILLMENT,
    deliveryPromotionDate: schedule.deliveryDate,
  };
};
