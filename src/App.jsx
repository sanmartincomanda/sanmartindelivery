// src/App.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getApp } from 'firebase/app';
import { ref, push, onValue, update, set, remove } from 'firebase/database';
import { database } from './firebase';
import logo from './logo.svg';
import pedidoSound from './pedido.mp3';
import './App.css';

// Importamos los componentes
import { hoyISO } from './components/Utils';
import OrderForm from './components/OrderForm';
import KitchenView from './components/KitchenView';
import ListaPedidos from './components/ListaPedidos';
import BaseDatosView from './components/BaseDatosView';

/******************** EXPORTAR A EXCEL ********************/
function exportarAExcel(pedidos) {
  const rows = pedidos.filter(p => p.estado !== 'Cancelado').map(p => [p.fecha, p.id, p.cliente, p.clienteCodigo || '-', p.direccion || '-', (p.pedido || '').replace(/\n/g, ' '), p.estado, p.timestampIngreso || '-', p.timestampPreparacion || '-', p.timestampPreparado || '-', p.timestampEnviado || '-', p.cocinero || '-', p.repartidor || '-']);
  const header = ['Fecha', '#', 'Cliente', 'Código Cliente', 'Dirección', 'Pedido', 'Estado', 'Ingreso', 'Preparación', 'Preparado', 'Enviado', 'Cocinero', 'Repartidor'];
  let htmlContent = '<table border="1"><tr>' + header.map(col => `<th>${col}</th>`).join('') + '</tr>';
  rows.forEach(r => { htmlContent += '<tr>' + r.map(val => `<td>${val}</td>`).join('') + '</tr>'; });
  htmlContent += '</table>';
  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'historial_pedidos.xls';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/******************** CLIENTES ********************/
function ClientesManager({ clientes }) {
  const [editBuffer, setEditBuffer] = useState({});
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);

  const normalize = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const splitLine = (line, delim) => {
    const out = []; let cur = ''; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = !inQuotes; } }
      else if (ch === delim && !inQuotes) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur); return out.map(s => s.trim());
  };

  const cargarCSV = async () => {
    if (!csvFile) { alert('Primero seleccioná un archivo CSV.'); return; }
    setUploading(true);
    try {
      const textRaw = await csvFile.text();
      const text = textRaw.charCodeAt(0) === 0xfeff ? textRaw.slice(1) : textRaw;
      const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
      if (!lines.length) return;
      const first = lines[0]; const delim = ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) ? ';' : ',';
      const header = splitLine(first, delim).map(h => normalize(h));
      const idxNombre = header.findIndex(h => ['nombre','cliente','razon'].some(k => h.includes(k)));
      const idxCodigo = header.findIndex(h => ['codigo','cod','id'].some(k => h.includes(k)));
      const idxDireccion = header.findIndex(h => ['direccion','domicilio','address'].some(k => h.includes(k)));
      let start = (idxNombre !== -1 || idxCodigo !== -1 || idxDireccion !== -1) ? 1 : 0;
      let map = { nombre: idxNombre === -1 ? 0 : idxNombre, codigo: idxCodigo === -1 ? 1 : idxCodigo, direccion: idxDireccion === -1 ? 2 : idxDireccion };
      let ok = 0;
      for (let i = start; i < lines.length; i++) {
        const parts = splitLine(lines[i], delim).map(s => s.replace(/^"|"$/g, ''));
        const nombre = (parts[map.nombre] || '').trim(); const codigo = (parts[map.codigo] || '').trim(); const direccion = (parts[map.direccion] || '').trim();
        if (nombre && codigo && direccion) {
          const nuevoRef = push(ref(database, 'clients'));
          await set(nuevoRef, { nombre, codigo, direccion });
          ok++;
        }
      }
      alert(`Carga masiva: ${ok} agregados.`); setCsvFile(null);
    } catch (err) { alert('Error leyendo CSV'); } finally { setUploading(false); }
  };

  const handleChange = (key, field, value) => { setEditBuffer(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } })); };
  const handleSave = async (c) => {
    const payload = editBuffer[c.firebaseKey] || { nombre: c.nombre, codigo: c.codigo, direccion: c.direccion };
    await update(ref(database, `clients/${c.firebaseKey}`), payload);
    setEditBuffer(prev => { const cp = { ...prev }; delete cp[c.firebaseKey]; return cp; });
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Clientes</h2>
      <input type="file" accept=".csv,text/csv,.txt" onChange={(e) => setCsvFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} />
      <button type="button" onClick={cargarCSV} disabled={uploading || !csvFile} style={{ marginLeft: 8 }}>{uploading ? 'Cargando…' : 'Cargar CSV'}</button>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }} border="1">
        <thead><tr><th>Nombre</th><th>Código</th><th>Dirección</th><th>Acciones</th></tr></thead>
        <tbody>{clientes.map(c => (
          <tr key={c.firebaseKey}>
            <td><input defaultValue={c.nombre} onChange={(e) => handleChange(c.firebaseKey, 'nombre', e.target.value)} /></td>
            <td><input defaultValue={c.codigo} onChange={(e) => handleChange(c.firebaseKey, 'codigo', e.target.value)} /></td>
            <td><input defaultValue={c.direccion} onChange={(e) => handleChange(c.firebaseKey, 'direccion', e.target.value)} style={{ width: '100%' }} /></td>
            <td><button onClick={() => handleSave(c)}>Guardar</button></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
/******************** BASE DE DATOS VIEW ********************/
/******************** APP ********************/
function App() {
  const [orders, setOrders] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [view, setView] = useState('ingreso');

  useEffect(() => {
    const today = hoyISO();
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const grouped = Object.entries(data).reduce((acc, [key, val]) => {
          const f = val.fecha; if (!acc[f]) acc[f] = [];
          acc[f].push({ firebaseKey: key, ...val }); return acc;
        }, {});
        setOrders((grouped[today] || []).sort((a, b) => (a.id || 0) - (b.id || 0)));
        setAnteriores(Object.entries(grouped).filter(([f]) => f !== today).flatMap(([f, arr]) => arr.map((p, idx) => ({ ...p, fecha: f, id: p.id || idx + 1 }))));
      } else { setOrders([]); setAnteriores([]); }
    });
  }, []);

  useEffect(() => {
    const clientsRef = ref(database, 'clients');
    onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setClientes([]); return; }
      const arr = Object.entries(data).map(([key, val]) => ({ firebaseKey: key, ...val }));
      arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setClientes(arr);
    });
  }, []);

  const getNextOrderId = () => (orders.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0) + 1;

  const addOrder = ({ cliente, clienteCodigo, direccion, pedido, fecha, id, metodoPago }) => {
    push(ref(database, 'orders'), { cliente, clienteCodigo, direccion, pedido, estado: 'Pendiente', metodoPago: metodoPago || 'Efectivo', fecha, id, timestampIngreso: new Date().toLocaleTimeString(), justAdded: true });
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find(o => o.id === orderId);
    if (order) update(ref(database, `orders/${order.firebaseKey}`), { estado: 'Enviado', repartidor, timestampEnviado: new Date().toLocaleTimeString() });
  };

  return (
    <div style={{ maxWidth: 1000, margin: '20px auto', padding: 20, fontFamily: 'Arial, sans-serif', backgroundColor: '#f0f8ff', borderRadius: 10 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Logo" style={{ width: 50, height: 50 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Servicio Delivery</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => setView('ingreso')} disabled={view === 'ingreso'}>Ingresar</button>
          <button onClick={() => setView('cocina')} disabled={view === 'cocina'}>Cocina</button>
          <button onClick={() => setView('lista')} disabled={view === 'lista'}>Lista de pedidos</button>
          <button onClick={() => setView('basedatos')} disabled={view === 'basedatos'}>Base de datos</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} nextOrderId={getNextOrderId()} clientes={clientes} />}
      {view === 'cocina' && <KitchenView orders={orders} />}
      {view === 'lista' && <ListaPedidos pedidos={orders} onEnviarPedido={handleEnviarPedido} />}
      {view === 'basedatos' && <BaseDatosView clientes={clientes} anteriores={anteriores} />}
    </div>
  );
}

export default App;