import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import OrderForm from '../../src/components/OrderForm.jsx';
import { getRouteSanMartinSchedule, isRouteSanMartinOrder } from '../../src/services/routeSanMartin.js';
import '../../src/index.css';
import '../../src/App.css';
import '../../src/styles/adminMerchant2026.css';

const RealDate = Date;
let testTime = RealDate.parse('2026-10-06T15:00:00-06:00');
window.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [testTime])); }
  static now() { return testTime; }
};
const clients = [{ nombre: 'Cliente QA Granada', codigo: 'QA-C1', firebaseKey: 'qa-client', direccion: 'Direccion de prueba Granada', telefono: '88880000', ubicacion: { lat: 11.94, lng: -85.956 } }];

function Harness() {
  const [branch, setBranch] = useState('granada');
  const [result, setResult] = useState(null);
  const [attempts, setAttempts] = useState(0);
  const [failSave, setFailSave] = useState(false);
  return <div className="merchant-admin-shell" style={{ display: 'block', padding: 16 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
      <strong>QA LOCAL. No crea pedidos reales.</strong>
      <label>Hora de prueba <select aria-label="Hora de prueba" defaultValue="15:00:00" onChange={(event) => {
        testTime = RealDate.parse(`2026-10-06T${event.target.value}-06:00`);
        window.dispatchEvent(new Event('focus'));
      }}>{['08:30:00', '15:00:00', '21:59:59', '22:00:00'].map((time) => <option key={time}>{time}</option>)}</select></label>
      <label>Sucursal de prueba <select aria-label="Sucursal de prueba" value={branch} onChange={(event) => setBranch(event.target.value)}>
        <option value="granada">Granada</option><option value="nindiri">Nindiri</option>
      </select></label>
      <label><input type="checkbox" checked={failSave} onChange={(event) => setFailSave(event.target.checked)} />Simular error al guardar</label>
      <span role="status">Intentos: {attempts}</span>
    </div>
    <main className="merchant-module">
      <OrderForm branchId={branch} clientes={clients} onAddOrder={async (payload, options) => {
        setAttempts((value) => value + 1);
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (failSave) throw new Error('Selecciona una franja disponible para Ruta San Martin.');
        const schedule = isRouteSanMartinOrder(payload) ? getRouteSanMartinSchedule(new Date(), payload.routeSlotId) : null;
        const order = { ...payload, canal: options.channel, estado: 'Pendiente', orderNumber: schedule ? 'RS-0123' : 'GR-001',
          scheduledDeliveryDate: schedule?.deliveryDate || '', scheduledWindowLabel: schedule?.windowLabel || '' };
        setResult({ order, options });
        return order;
      }} />
    </main>
    <h2>Resultado local</h2><pre aria-label="Resultado local" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(result, null, 2)}</pre>
  </div>;
}
const root = import.meta.hot?.data.root || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.root = root;
root.render(<Harness />);
