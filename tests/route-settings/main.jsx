import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { RouteSanMartinSettingsEditor } from '../../src/components/RouteSanMartinAdminSection';
import '../../src/styles/storeAdmin2026.css';

function Fixture() {
  const [branch, setBranch] = useState({ id: 'granada', active: true, routeSanMartinEnabled: false,
    storeLocation: { lat: 11.9299, lng: -85.956 }, routeSanMartin: { schemaVersion: 1, revision: 0,
      zones: { centro: { id: 'centro', name: 'Granada y alrededores', type: 'radius', radiusKm: 40, active: true, deliveryDays: [1, 2, 3, 4, 5, 6, 0] } } } });
  const [action, setAction] = useState('');
  return <main className="cfg-page--store" style={{ margin: 'auto', maxWidth: 1480 }}>
    <style>{`body{margin:0;font-family:'Segoe UI',sans-serif}.cfg-button{font:inherit;font-size:14px;font-weight:650;border:1px solid #0044c5;border-radius:8px;background:#0044c5;color:white;min-height:44px;padding:12px 18px;cursor:pointer}.cfg-button.secondary{background:white;color:#0044c5}.cfg-input{padding:10px;border:1px solid #dbe6f2;border-radius:7px;color:#102a4a} `}</style>
    <p>Prueba aislada: no escribe en Firebase ni crea pedidos.</p>
    <RouteSanMartinSettingsEditor branch={branch} onAction={async (type, data) => {
      if (new URLSearchParams(location.search).has('error')) throw new Error('Error de prueba. Tus cambios se conservan.');
      const updated = { ...branch, routeSanMartinEnabled: type === 'set-enabled' ? data.enabled : branch.routeSanMartinEnabled,
        routeSanMartin: { ...branch.routeSanMartin, revision: branch.routeSanMartin.revision + 1,
          zones: type === 'save' ? Object.fromEntries(data.zones.map((zone) => [zone.id, zone])) : branch.routeSanMartin.zones } };
      setBranch(updated); setAction(type); return { branch: updated };
    }} />
    <output aria-label="Resultado de prueba">{JSON.stringify({ action, enabled: branch.routeSanMartinEnabled, revision: branch.routeSanMartin.revision })}</output>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
