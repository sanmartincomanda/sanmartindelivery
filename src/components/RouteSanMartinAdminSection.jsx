import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { subscribeStoreBranches } from '../services/storeBranches';
import { requestRouteAction } from '../services/routeSanMartinApi';
import { getRouteSanMartinQuote, getRouteSanMartinSlots } from '../services/routeSanMartin';
import { getRouteZones, routeDaysLabel, routePoint, validateRouteZones, ROUTE_WEEKDAYS,
  ROUTE_MAX_ZONES, ROUTE_MAX_VERTICES, ROUTE_MAX_RADIUS_KM } from '../services/routeSanMartinZones';
import RouteCoverageMap from './RouteCoverageMap';
import '../styles/routeSanMartinAdmin.css';

export default function RouteSanMartinAdminSection() {
  const [branch, setBranch] = useState(null), [error, setError] = useState('');
  useEffect(() => subscribeStoreBranches((branches) => {
    setBranch(branches.find((item) => item.id === 'granada')); setError('');
  }, () => setError('No se pudo cargar Ruta. Revisa tu conexión y vuelve a abrir esta pestaña.')), []);
  return error ? <p className="route-admin-notice" role="alert">{error}</p>
    : branch ? <RouteSanMartinSettingsEditor branch={branch} onAction={async (action, data) => {
      const result = await requestRouteAction(action, data); setBranch(result.branch); return result;
    }} /> : <section className="route-admin" aria-busy="true"><h2>Ruta San Martín</h2><p>Cargando configuración…</p></section>;
}

export function RouteSanMartinSettingsEditor({ branch, onAction }) {
  const [zones, setZones] = useState(() => getRouteZones(branch));
  const [revision, setRevision] = useState(Number(branch.routeSanMartin?.revision || 0));
  const [selectedId, setSelectedId] = useState(zones[0]?.id || '');
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [testPoint, setTestPoint] = useState(null), [pointDraft, setPointDraft] = useState({ lat: '', lng: '' });
  const [testDraft, setTestDraft] = useState({ lat: '', lng: '' });
  const messageRef = useRef(null);
  const confirmationRef = useRef(null);
  const enabled = branch.routeSanMartinEnabled === true;
  const liveRevision = Number(branch.routeSanMartin?.revision || 0);
  const conflict = dirty && revision !== liveRevision;
  useEffect(() => {
    if (!confirmation) return;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    confirmationRef.current?.querySelector('button')?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus?.(); };
  }, [confirmation]);
  useEffect(() => {
    if (!dirty) { setZones(getRouteZones(branch)); setRevision(liveRevision); }
  }, [branch, dirty, liveRevision]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const selected = zones.find((zone) => zone.id === selectedId) || zones[0];
  const changeZones = (next) => { setZones(next); setDirty(true); setError(''); setMessage(''); };
  const changeZone = (patch) => changeZones(zones.map((zone) => zone.id === selected.id ? { ...zone, ...patch } : zone));
  const reload = (confirmed = false) => {
    if (dirty && confirmed !== true) { setConfirmation({ type: 'reload', text: '¿Descartar los cambios sin guardar y cargar la configuración actual?' }); return; }
    setZones(getRouteZones(branch)); setRevision(liveRevision); setDirty(false); setError(''); setMessage('');
  };
  const save = async (event) => {
    event.preventDefault();
    const invalid = validateRouteZones(zones, enabled);
    if (invalid || conflict) { setError(invalid || 'Otra persona cambió Ruta. Recargá antes de guardar.'); messageRef.current?.focus(); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await onAction('save', { zones, expectedRevision: revision });
      setRevision(Number(result.branch.routeSanMartin.revision)); setZones(getRouteZones(result.branch)); setDirty(false);
      setMessage(result.branch.routeSanMartinEnabled ? 'Zonas y días guardados.' : 'Zonas y días guardados. El servicio sigue deshabilitado.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const toggleService = async (confirmed = false) => {
    if (!enabled && confirmed !== true) { setConfirmation({ type: 'activate', text: '¿Activar Ruta San Martín con las zonas y días guardados? Se podrán recibir nuevos pedidos.' }); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await onAction('set-enabled', { enabled: !enabled, expectedRevision: liveRevision });
      if (!dirty) setRevision(Number(result.branch.routeSanMartin.revision));
      setMessage(enabled ? 'Servicio deshabilitado. Los pedidos existentes se conservan.' : 'Servicio activo con la cobertura guardada.');
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const addZone = () => {
    const id = `zona-${crypto.randomUUID()}`;
    changeZones([...zones, { id, name: '', active: true, type: 'radius', radiusKm: 10, vertices: [], deliveryDays: [] }]);
    setSelectedId(id); setPointDraft({ lat: '', lng: '' });
  };
  const previewBranch = { ...branch, routeSanMartinEnabled: true,
    routeSanMartin: { schemaVersion: 1, zones: Object.fromEntries(zones.map((zone) => [zone.id, zone])) } };
  const preview = testPoint ? getRouteSanMartinQuote({ branch: previewBranch, destination: testPoint }) : null;
  const slots = testPoint ? getRouteSanMartinSlots(new Date(), 14, { branch: previewBranch, destination: testPoint }).slice(0, 4) : [];
  const test = (point) => { setTestPoint(point); setTestDraft(point); };
  return <section className="route-admin">
    <header className="route-admin-header"><div><p className="route-admin-eyebrow">TIENDA VIRTUAL / ENTREGA PROGRAMADA</p><h2>Ruta San Martín</h2><p>Zonas y días de entrega desde Granada.</p></div>
      <div className="route-admin-service"><span className={`route-status ${enabled ? 'is-active' : ''}`}><i />{enabled ? 'Servicio activo' : 'Servicio deshabilitado'}</span>
        <button type="button" className={`cfg-button ${enabled ? 'route-pause' : ''}`} disabled={busy || (!enabled && (dirty || conflict))} onClick={() => toggleService()}>{enabled ? 'Deshabilitar servicio' : 'Activar servicio'}</button></div></header>
    <div className="route-admin-facts"><span><b>Base</b> Granada</span><span><b>Mínimo</b> C$1,000</span><span><b>Envío</b> Gratis</span><span><b>Franjas</b> 9–12 / 13–17 h</span></div>
    {!enabled && <p className="route-admin-notice">No se aceptan nuevos pedidos de Ruta. Guardar zonas no activa el servicio. Los pedidos ya registrados siguen en cocina y reparto.</p>}
    <div ref={messageRef} tabIndex={-1} aria-live="polite">{message && <p className="route-admin-success" role="status">{message}</p>}{error && <p className="route-admin-error" role="alert">{error}</p>}
      {conflict && <p className="route-admin-error" role="alert">La configuración cambió en otra sesión. Tus cambios siguen aquí, pero necesitás recargar antes de guardar.</p>}</div>
    {confirmation && createPortal(<div className="route-confirm-backdrop"><section ref={confirmationRef} className="route-confirm-sheet" role="dialog" aria-modal="true" aria-label="Confirmar cambio en Ruta" onKeyDown={(event) => {
      if (event.key === 'Escape') setConfirmation(null);
      if (event.key === 'Tab') {
        const buttons = [...event.currentTarget.querySelectorAll('button')];
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus(); }
        if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus(); }
      }
    }}><h3>Confirmar cambio</h3><p>{confirmation.text}</p><div><button type="button" className="cfg-button secondary" onClick={() => setConfirmation(null)}>Cancelar</button><button type="button" className="cfg-button" onClick={() => {
      const next = confirmation; setConfirmation(null);
      if (next.type === 'activate') toggleService(true);
      else if (next.type === 'reload') reload(true);
      else changeZones(zones.filter((zone) => zone.id !== next.id));
    }}>Confirmar</button></div></section></div>, document.body)}
    <form onSubmit={save}>
      <fieldset disabled={busy} className="route-admin-fieldset">
        <div className="route-admin-layout">
          <aside className="route-zone-list"><div className="route-zone-list-heading"><h3>Zonas <small>{zones.length}</small></h3><button type="button" className="cfg-button secondary" disabled={zones.length >= ROUTE_MAX_ZONES} onClick={addZone}>Nueva zona</button></div>
            {zones.map((zone) => <button type="button" className={`route-zone ${selected?.id === zone.id ? 'selected' : ''}`} aria-pressed={selected?.id === zone.id} key={zone.id} onClick={() => { setSelectedId(zone.id); setPointDraft({ lat: '', lng: '' }); }}>
              <span className="route-zone-title">{zone.name || 'Zona sin nombre'}<small>{zone.active ? 'Activa' : 'Pausada'}</small></span><span>{zone.type === 'radius' ? `Radio · ${zone.radiusKm} km` : `Geofence · ${zone.vertices.length} puntos`}</span><small>{routeDaysLabel(zone.deliveryDays) || 'Sin días asignados'}</small></button>)}
            {!zones.length && <p>No hay zonas. Agregá una para definir la cobertura.</p>}
          </aside>
          {selected ? <div className="route-zone-editor">
            <div className="route-zone-heading"><label>Nombre de la zona<input className="cfg-input" value={selected.name} maxLength={80} onChange={(event) => changeZone({ name: event.target.value })} placeholder="Ej. Granada norte" required /></label>
              <label className="route-inline-check"><input type="checkbox" checked={selected.active} onChange={(event) => changeZone({ active: event.target.checked })} />Zona activa</label></div>
            <div className="route-type-select" role="group" aria-label="Tipo de cobertura"><button type="button" aria-pressed={selected.type === 'radius'} onClick={() => changeZone({ type: 'radius', radiusKm: selected.radiusKm || 10 })}>Por radio</button><button type="button" aria-pressed={selected.type === 'polygon'} onClick={() => changeZone({ type: 'polygon' })}>Geofence / polígono</button></div>
            {selected.type === 'radius' && <div className="route-radius-field"><label>Radio desde Granada (km)<input className="cfg-input" type="number" inputMode="decimal" min="0.1" max={ROUTE_MAX_RADIUS_KM} step="0.1" value={selected.radiusKm} onChange={(event) => changeZone({ radiusKm: event.target.value })} required /></label><p>Distancia en línea recta desde la sucursal. No cambia la cobertura del Delivery habitual.</p></div>}
            <fieldset className="route-days"><legend>Días de entrega en esta zona</legend><div>{ROUTE_WEEKDAYS.map((day) => <label key={day.value}><input type="checkbox" checked={selected.deliveryDays.includes(day.value)} onChange={(event) => changeZone({ deliveryDays: event.target.checked ? [...selected.deliveryDays, day.value] : selected.deliveryDays.filter((value) => value !== day.value) })} /><span>{day.short}</span></label>)}</div><p>Son días de entrega, no de compra. Si las zonas se superponen, se combinan sus días.</p></fieldset>
            <RouteCoverageMap zone={selected} origin={branch.storeLocation} onVerticesChange={(vertices) => changeZone({ vertices })} onTestPoint={test} testPoint={testPoint} disabled={busy} />
            {selected.type === 'polygon' && <details className="route-coordinates"><summary>Puntos del polígono · {selected.vertices.length} / {ROUTE_MAX_VERTICES}</summary><p>Podés ingresar coordenadas si preferís no dibujar.</p>
              {selected.vertices.map((point, index) => <div className="route-coordinate-row" key={index}><b>{index + 1}</b><label>Latitud<input className="cfg-input" type="number" step="any" value={point.lat} onChange={(event) => changeZone({ vertices: selected.vertices.map((p, i) => i === index ? { ...p, lat: event.target.value === '' ? '' : Number(event.target.value) } : p) })} /></label><label>Longitud<input className="cfg-input" type="number" step="any" value={point.lng} onChange={(event) => changeZone({ vertices: selected.vertices.map((p, i) => i === index ? { ...p, lng: event.target.value === '' ? '' : Number(event.target.value) } : p) })} /></label><button type="button" aria-label={`Quitar punto ${index + 1}`} onClick={() => changeZone({ vertices: selected.vertices.filter((_, i) => i !== index) })}>Quitar</button></div>)}
              <div className="route-coordinate-add"><label>Nueva latitud<input className="cfg-input" inputMode="decimal" value={pointDraft.lat} onChange={(event) => setPointDraft({ ...pointDraft, lat: event.target.value })} /></label><label>Nueva longitud<input className="cfg-input" inputMode="decimal" value={pointDraft.lng} onChange={(event) => setPointDraft({ ...pointDraft, lng: event.target.value })} /></label><button type="button" className="cfg-button secondary" disabled={!routePoint(pointDraft) || selected.vertices.length >= ROUTE_MAX_VERTICES} onClick={() => { changeZone({ vertices: [...selected.vertices, routePoint(pointDraft)] }); setPointDraft({ lat: '', lng: '' }); }}>Agregar punto</button></div>
            </details>}
            <section className="route-test"><h3>Probar una dirección</h3><p>Usa las zonas del borrador, sin activar el servicio ni crear pedidos.</p><div className="route-coordinate-add"><label>Latitud de prueba<input className="cfg-input" inputMode="decimal" value={testDraft.lat} onChange={(event) => setTestDraft({ ...testDraft, lat: event.target.value })} /></label><label>Longitud de prueba<input className="cfg-input" inputMode="decimal" value={testDraft.lng} onChange={(event) => setTestDraft({ ...testDraft, lng: event.target.value })} /></label><button type="button" className="cfg-button secondary" disabled={!routePoint(testDraft)} onClick={() => test(routePoint(testDraft))}>Consultar cobertura</button></div>
              {preview && <div className={preview.available ? 'route-admin-success' : 'route-admin-notice'} role="status"><strong>{preview.available ? 'Dentro de cobertura' : 'Fuera de las zonas activas'}</strong>{preview.zones.map((zone) => <p key={zone.id}>{zone.name} · {routeDaysLabel(zone.deliveryDays)}</p>)}{slots.length > 0 && <ul>{slots.map((slot) => <li key={slot.id}>{slot.dateLabel} · {slot.label}</li>)}</ul>}</div>}
            </section>
            <button type="button" className="route-remove" onClick={() => setConfirmation({ type: 'remove', id: selected.id, text: `¿Quitar la zona ${selected.name || 'sin nombre'} del borrador? Los pedidos existentes no cambian.` })}>Quitar zona</button>
          </div> : <div className="route-zone-empty"><h3>Definí dónde entregar</h3><p>Creá un radio desde Granada o dibujá una zona y asignale sus días.</p></div>}
        </div>
      </fieldset>
      <footer className="route-admin-save"><span>{dirty ? 'Cambios sin guardar' : 'Configuración guardada'}<small>La pausa del servicio se controla por separado.</small></span><button type="button" className="cfg-button secondary" onClick={reload} disabled={busy}>Recargar</button><button type="submit" className="cfg-button" disabled={busy || !dirty || conflict}>{busy ? 'Guardando…' : 'Guardar zonas y días'}</button></footer>
    </form>
  </section>;
}
