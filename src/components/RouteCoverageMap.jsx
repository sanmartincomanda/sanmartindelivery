import React, { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { routePoint, ROUTE_MAX_VERTICES } from '../services/routeSanMartinZones';

export default function RouteCoverageMap({ zone, origin, onVerticesChange, onTestPoint, testPoint, disabled }) {
  const host = useRef(null), mapRef = useRef(null), library = useRef(null), layers = useRef(null);
  const latest = useRef({ zone, onVerticesChange, onTestPoint, disabled });
  latest.current = { zone, onVerticesChange, onTestPoint, disabled };
  const [ready, setReady] = useState(false), [failed, setFailed] = useState(false);
  const [mode, setMode] = useState('navigate');
  const modeRef = useRef(mode); modeRef.current = mode;
  useEffect(() => {
    let disposed = false, observer;
    import('leaflet').then((module) => {
      if (disposed) return;
      const L = module.default;
      library.current = L;
      const map = L.map(host.current, { scrollWheelZoom: false, minZoom: 6, maxZoom: 18,
        attributionControl: true, zoomAnimation: !matchMedia('(prefers-reduced-motion: reduce)').matches });
      map.setView(routePoint(origin) || { lat: 11.9299, lng: -85.956 }, 10);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18, updateWhenIdle: true, keepBuffer: 1,
        referrerPolicy: 'strict-origin-when-cross-origin',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).on('tileerror', () => setFailed(true)).addTo(map);
      layers.current = L.layerGroup().addTo(map);
      map.on('click', ({ latlng }) => {
        const { zone: current, onVerticesChange: change, onTestPoint: test, disabled: busy } = latest.current;
        if (busy) return;
        const point = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
        if (modeRef.current === 'test') test(point);
        if (modeRef.current === 'draw' && current?.type === 'polygon' && current.vertices.length < ROUTE_MAX_VERTICES) change([...current.vertices, point]);
      });
      mapRef.current = map;
      observer = new ResizeObserver(() => map.invalidateSize()); observer.observe(host.current);
      setReady(true);
    }).catch(() => setFailed(true));
    return () => { disposed = true; observer?.disconnect(); mapRef.current?.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const L = library.current, group = layers.current;
    group.clearLayers();
    const base = routePoint(origin);
    if (base) L.circleMarker(base, { radius: 6, color: '#ff000c', fillOpacity: 1 }).bindTooltip('Base: Granada').addTo(group);
    if (zone?.type === 'radius' && base && Number(zone.radiusKm) > 0) {
      L.circle(base, { radius: Math.min(Number(zone.radiusKm), 200) * 1000, color: '#0044c5', weight: 2, fillOpacity: .09 }).addTo(group);
    } else if (zone?.type === 'polygon') {
      const vertices = zone.vertices.map((point, index) => ({ point: routePoint(point), index })).filter(({ point }) => point);
      if (vertices.length > 1) L.polygon(vertices.map(({ point }) => point), { color: '#0044c5', weight: 2, fillOpacity: .12 }).addTo(group);
      vertices.forEach(({ point, index }) => {
        L.marker(point, { draggable: !disabled && mode === 'draw',
          icon: L.divIcon({ className: 'route-map-vertex', html: String(index + 1), iconSize: [28, 28], iconAnchor: [14, 14] }),
          title: `Punto ${index + 1}`, keyboard: true,
        }).on('dragend', (event) => {
          const next = event.target.getLatLng();
          onVerticesChange(zone.vertices.map((p, i) => i === index ? { lat: Number(next.lat.toFixed(6)), lng: Number(next.lng.toFixed(6)) } : p));
        }).addTo(group);
      });
    }
    if (routePoint(testPoint)) L.circleMarker(testPoint, { radius: 8, color: '#a96000', fillColor: '#fff', fillOpacity: 1 }).bindTooltip('Dirección de prueba').addTo(group);
  }, [ready, zone, origin, testPoint, disabled, mode, onVerticesChange]);
  const fit = () => {
    const L = library.current;
    if (!L || !mapRef.current) return;
    const base = routePoint(origin);
    if (zone?.type === 'polygon' && zone.vertices.filter(routePoint).length > 1) mapRef.current.fitBounds(L.latLngBounds(zone.vertices.filter(routePoint)), { padding: [30, 30], maxZoom: 14 });
    else if (base) mapRef.current.fitBounds(L.latLng(base).toBounds(Math.max(1, Number(zone?.radiusKm) || 40) * 2000), { padding: [20, 20], maxZoom: 14 });
  };
  useEffect(() => { setMode('navigate'); if (ready) fit(); }, [zone?.id, zone?.type, ready]);
  return <section className="route-map-wrap" aria-label="Editor de cobertura en mapa">
    <div className="route-map-tools">
      <button type="button" aria-pressed={mode === 'navigate'} onClick={() => setMode('navigate')}>Mover mapa</button>
      {zone?.type === 'polygon' && <button type="button" disabled={disabled} aria-pressed={mode === 'draw'} onClick={() => setMode('draw')}>Dibujar zona</button>}
      <button type="button" disabled={disabled} aria-pressed={mode === 'test'} onClick={() => setMode('test')}>Probar dirección</button>
      <button type="button" onClick={fit} disabled={!ready}>Ver zona</button>
    </div>
    <div className={`route-coverage-map mode-${mode}`} ref={host} aria-label="Mapa de Granada y cobertura" />
    <p className="route-map-hint">{mode === 'draw' ? 'Tocá el mapa para agregar puntos. Arrastrá los puntos para ajustar el borde.' : mode === 'test' ? 'Tocá una dirección para consultar sus días de entrega.' : 'Arrastrá para moverte. Usá + y − para acercar el mapa.'}</p>
    {failed && <p className="route-admin-notice" role="status">No se pudo cargar parte del mapa. Podés editar y probar coordenadas abajo; no se perdieron tus cambios.</p>}
  </section>;
}
