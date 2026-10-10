import { getFirebaseAdmin, jsonResponse, verifyFirebaseRequest } from './_shared/poket.mjs';
import { getRouteSanMartinQuote, getRouteSanMartinSchedule, getRouteSanMartinShortfall,
  isRouteSanMartinEnabled, ROUTE_SAN_MARTIN_PAUSED_MESSAGE } from '../../src/services/routeSanMartin.js';
import { getRouteZones, routePoint, validateRouteZones } from '../../src/services/routeSanMartinZones.js';

const fail = (message, statusCode = 409, code = 'ROUTE_UNAVAILABLE') => {
  throw Object.assign(new Error(message), { statusCode, code });
};
const cors = (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const allowed = ['https://tienda.sanmartinsr.com', 'https://admintv.sanmartinsr.com', 'https://cocina.sanmartinsr.com',
    'https://localhost', 'capacitor://localhost', 'https://tiendavirtual-2ced1.web.app'];
  return { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', Vary: 'Origin' };
};

export const validateRouteAuthorization = (branch, body, now = Date.now()) => {
  if (!isRouteSanMartinEnabled(branch)) fail(ROUTE_SAN_MARTIN_PAUSED_MESSAGE, 409, 'ROUTE_PAUSED');
  if (body.branchId !== 'granada') fail('Ruta sale unicamente desde Granada.');
  const location = routePoint(body.location);
  const context = { branch, destination: location };
  if (!getRouteSanMartinQuote(context).available) fail('Esta direccion no pertenece a una zona activa de Ruta.');
  const schedule = body.slotId && getRouteSanMartinSchedule(new Date(now), body.slotId, context);
  if (!schedule?.slotId) fail('La zona no tiene entrega en ese dia u horario. Elegi otra franja.', 409, 'ROUTE_SLOT_CHANGED');
  const amount = Number(body.eligibleSubtotal);
  if (!Number.isFinite(amount) || getRouteSanMartinShortfall(amount) > 0) fail('Ruta requiere C$1,000 en productos despues de descuentos.');
  if (!/^\d{4}-\d{2}-\d{2}[-_]RS[-_]\d+$/.test(String(body.orderKey || ''))) fail('Identificador de pedido invalido.', 400);
  return { location, slotId: schedule.slotId, deliveryDate: schedule.deliveryDate,
    earliestAt: schedule.earliestAt, windowEndAt: schedule.windowEndAt,
    zoneId: schedule.zoneId, zoneName: schedule.zoneName,
    revision: Number(branch.routeSanMartin?.revision || 0), eligibleSubtotal: amount, expiresAt: now + 5 * 60 * 1000 };
};

export const handler = async (event) => {
  const headers = cors(event);
  if (event.httpMethod === 'OPTIONS') return jsonResponse(204, {}, headers);
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Metodo no permitido.' }, headers);
  try {
    if (String(event.body || '').length > 100000) fail('La configuracion es demasiado grande.', 413);
    const decoded = await verifyFirebaseRequest(event);
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { fail('Solicitud invalida.', 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Solicitud invalida.', 400);
    const { database } = getFirebaseAdmin();
    const role = (await database.ref(`userRoles/${decoded.uid}`).get()).val() || {};
    const branchRef = database.ref('storeBranches/granada');
    const branch = { ...(await branchRef.get()).val(), id: 'granada' };
    if (body.action === 'authorize') {
      if (!['client', 'admin', 'operator', 'kitchen'].includes(role.role) && !(role.role === 'branch_admin' && role.branchId === 'granada')) fail('No autorizado.', 403);
      const authorization = validateRouteAuthorization(branch, body);
      if ((await database.ref(`orders/${body.orderKey}`).get()).exists()) fail('Este pedido ya existe.');
      const proofRef = database.ref(`routeSanMartinAuthorizations/${body.orderKey}`);
      const proof = { ...authorization, uid: decoded.uid };
      const result = await proofRef.transaction((current) => current && current.uid !== decoded.uid ? undefined : proof);
      if (!result.committed) fail('No se pudo validar este pedido.');
      return jsonResponse(200, { authorization }, headers);
    }
    if (role.role !== 'admin') fail('Solo un administrador puede configurar Ruta.', 403);
    if (!['save', 'set-enabled'].includes(body.action)) fail('Accion invalida.', 400);
    const expected = Number(body.expectedRevision);
    if (!Number.isSafeInteger(expected) || expected < 0) fail('Recarga la configuracion antes de guardar.', 409, 'ROUTE_CONFLICT');
    if (body.action === 'save') {
      const error = validateRouteZones(body.zones, isRouteSanMartinEnabled(branch));
      if (error) fail(error, 400, 'ROUTE_CONFIG_INVALID');
    } else if (typeof body.enabled !== 'boolean') fail('Estado invalido.', 400);
    // Keep the snapshot cached while the transaction runs; its first callback can
    // otherwise receive null even though the branch exists on the server.
    const keepAlive = () => {};
    branchRef.on('value', keepAlive);
    let result;
    try {
      await branchRef.once('value');
      result = await branchRef.transaction((current) => {
        if (!current || Number(current.routeSanMartin?.revision || 0) !== expected) return;
        const zones = body.action === 'save' ? body.zones : getRouteZones(current);
        const enabled = body.action === 'set-enabled' ? body.enabled : current.routeSanMartinEnabled === true;
        // Pausing must always work, even if an old zone needs repair.
        if (enabled && validateRouteZones(zones, true)) return;
        return { ...current, routeSanMartinEnabled: enabled, routeSanMartin: {
          schemaVersion: 1, revision: expected + 1, updatedAt: Date.now(), updatedBy: decoded.uid,
          zones: Object.fromEntries(zones.map((zone) => [zone.id, { id: zone.id, name: zone.name.trim(),
            type: zone.type, active: zone.active, deliveryDays: [...new Set(zone.deliveryDays)],
            ...(zone.type === 'radius' ? { radiusKm: Number(zone.radiusKm) } : { vertices: zone.vertices.map(routePoint) }),
          }])),
        } };
      });
    } finally { branchRef.off('value', keepAlive); }
    if (!result.committed) fail('La configuracion cambio o no tiene zonas validas. Recarga antes de continuar.', 409, 'ROUTE_CONFLICT');
    return jsonResponse(200, { branch: { ...result.snapshot.val(), id: 'granada' } }, headers);
  } catch (error) {
    const status = error.statusCode || (String(error.code || '').startsWith('auth/') ? 401 : 500);
    if (status === 500) console.error('Ruta configuration request failed:', error.code || error.message);
    return jsonResponse(status, { error: status === 500 ? 'No se pudo guardar o validar Ruta. Intenta nuevamente.' : error.message,
      code: error.code || 'ROUTE_ERROR' }, headers);
  }
};
