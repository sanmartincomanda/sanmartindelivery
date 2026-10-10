import assert from 'node:assert/strict';
import { getRouteSanMartinQuote, getRouteSanMartinSlots, getRouteSanMartinSchedule } from '../src/services/routeSanMartin.js';
import { getRouteZones, routePoint, validRoutePolygon, pointInRoutePolygon, validateRouteZones } from '../src/services/routeSanMartinZones.js';
import { validateRouteAuthorization } from '../netlify/functions/route-san-martin.mjs';

const origin = { lat: 11.93, lng: -85.956 };
const polygon = [{ lat: 11.9, lng: -86 }, { lat: 12, lng: -86 }, { lat: 12, lng: -85.9 }, { lat: 11.9, lng: -85.9 }];
const zone = { id: 'norte', name: 'Granada norte', type: 'polygon', vertices: polygon, active: true, deliveryDays: [1, 3, 5] };
const branch = { id: 'granada', active: true, routeSanMartinEnabled: true, storeLocation: origin,
  routeSanMartin: { schemaVersion: 1, revision: 3, zones: { norte: zone } } };
const context = { branch, destination: origin };
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
check(routePoint({ lat: '', lng: '' }), null);
check(routePoint({ lat: 91, lng: -85 }), null);
check(validRoutePolygon(polygon), true);
check(validRoutePolygon([...polygon].reverse()), true);
check(validRoutePolygon([polygon[0], polygon[2], polygon[1], polygon[3]]), false);
check(validRoutePolygon([polygon[0], polygon[1], polygon[1]]), false);
check(pointInRoutePolygon(origin, polygon), true);
check(pointInRoutePolygon(polygon[0], polygon), true);
check(pointInRoutePolygon({ lat: 11.95, lng: -86 }, polygon), true);
check(pointInRoutePolygon({ lat: 12.1, lng: -85.956 }, polygon), false);
check(getRouteSanMartinQuote(context).available, true);
check(getRouteSanMartinQuote(context).coverageRadiusKm, 0);
check(getRouteSanMartinQuote({ ...context, branch: { ...branch, routeSanMartinEnabled: false } }).available, false);
check(getRouteSanMartinQuote({ ...context, branch: { ...branch, routeSanMartin: { schemaVersion: 1 } } }).available, false);
check(validateRouteZones([{ ...zone, deliveryDays: [] }]).includes('día'), true);
check(validateRouteZones([{ ...zone, type: 'radius', radiusKm: 0 }]).includes('radio'), true);
check(validateRouteZones([{ ...zone, type: 'radius', radiusKm: 201 }]).includes('radio'), true);
check(validateRouteZones([zone, zone]).includes('único'), true);
check(validateRouteZones([], true).includes('activa'), true);
check(validateRouteZones([]), '');
check(validateRouteZones([null]).includes('válida'), true);
check(validateRouteZones([zone]), '');
check(getRouteZones(branch)[0].deliveryDays, [1, 3, 5]);
const monday = new Date('2026-10-12T20:00:00-06:00');
const slots = getRouteSanMartinSlots(monday, 14, context);
check(slots[0].id, '2026-10-14:morning');
for (const slot of slots) {
  check([1, 3, 5].includes(new Date(`${slot.deliveryDate}T12:00:00Z`).getUTCDay()), true);
  check(slot.zoneId, 'norte');
}
check(getRouteSanMartinSchedule(monday, '2026-10-13:afternoon', context), null);
const tueBranch = { ...branch, routeSanMartin: { ...branch.routeSanMartin,
  zones: { norte: { ...zone, deliveryDays: [2] } } } };
check(getRouteSanMartinSlots(monday, 14, { branch: tueBranch, destination: origin })[0].id, '2026-10-13:afternoon');
check(getRouteSanMartinSlots(new Date('2026-10-12T22:00:00-06:00'), 14, { branch: tueBranch, destination: origin })[0].id, '2026-10-20:morning');
const overlap = { ...branch, routeSanMartin: { schemaVersion: 1, zones: { norte: zone,
  radio: { ...zone, id: 'radio', type: 'radius', radiusKm: 25, deliveryDays: [2] } } } };
check(getRouteSanMartinQuote({ branch: overlap, destination: origin }).deliveryDays.sort(), [1, 2, 3, 5]);
check(getRouteSanMartinSlots(monday, 14, { branch: overlap, destination: origin })[0].zoneId, 'radio');
const body = { branchId: 'granada', orderKey: '2026-10-12-RS-0001', location: origin, slotId: slots[0].id, eligibleSubtotal: 1000 };
const proof = validateRouteAuthorization(branch, body, monday.getTime());
check(proof.zoneId, 'norte'); check(proof.revision, 3);
for (const change of [{ slotId: '2026-10-13:afternoon' }, { location: { lat: 13, lng: -86 } }, { eligibleSubtotal: 999.99 }, { branchId: 'nindiri' }, { orderKey: '../invalid' }]) {
  assert.throws(() => validateRouteAuthorization(branch, { ...body, ...change }, monday.getTime())); checks++;
}
assert.throws(() => validateRouteAuthorization({ ...branch, routeSanMartinEnabled: false }, body, monday.getTime()), /temporalmente/); checks++;
console.log(`Route zones and server validation: ${checks} checks passed.`);
