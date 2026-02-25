import React, { useState, useEffect } from 'react';
import { ref, update, push, set, onValue, remove } from 'firebase/database';
import { database } from '../firebase';
import { exportarAExcel, hoyISO } from './Utils';

export default function BaseDatosView({ clientes, anteriores }) {
  const [section, setSection] = useState('clientes');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12 }}>
      <div style={{ background: 'white', padding: 12, borderRadius: 10, border: '1px solid #ddd' }}>
        <h3>Admin</h3>
        <button onClick={() => setSection('clientes')} style={{ width: '100%', marginBottom: 5 }}>Clientes</button>
        <button onClick={() => setSection('anteriores')} style={{ width: '100%', marginBottom: 5 }}>Historial</button>
        <button onClick={() => setSection('ruta')} style={{ width: '100%' }}>Pedidos Ruta</button>
      </div>
      <div style={{ background: 'white', padding: 12, borderRadius: 10, border: '1px solid #ddd' }}>
        {section === 'clientes' && <ClientesManager clientes={clientes} />}
        {section === 'anteriores' && <Anteriores pedidos={anteriores} />}
        {section === 'ruta' && <PedidosRutaAdmin />}
      </div>
    </div>
  );
}

function ClientesManager({ clientes }) {
  const handleSave = async (c, field, val) => {
    update(ref(database, `clients/${c.firebaseKey}`), { [field]: val });
  };
  return (
    <div>
      <h4>Clientes ({clientes.length})</h4>
      <table border="1" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr><th>Nombre</th><th>Código</th><th>Acciones</th></tr></thead>
        <tbody>
          {clientes.map(c => (
            <tr key={c.firebaseKey}>
              <td><input defaultValue={c.nombre} onBlur={(e) => handleSave(c, 'nombre', e.target.value)} /></td>
              <td><input defaultValue={c.codigo} onBlur={(e) => handleSave(c, 'codigo', e.target.value)} /></td>
              <td><button onClick={() => window.confirm('¿Borrar?') && remove(ref(database, `clients/${c.firebaseKey}`))}>🗑️</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Anteriores({ pedidos }) {
  return (
    <div>
      <button onClick={() => exportarAExcel(pedidos)}>Exportar Excel</button>
      <div style={{ overflowX: 'auto', marginTop: 10 }}>
        <table border="1" style={{ width: '100%', fontSize: 12 }}>
          <thead><tr><th>Fecha</th><th>#</th><th>Cliente</th><th>Pedido</th></tr></thead>
          <tbody>
            {pedidos.slice(0, 50).map(p => (
              <tr key={p.firebaseKey}><td>{p.fecha}</td><td>{p.id}</td><td>{p.cliente}</td><td>{p.pedido}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PedidosRutaAdmin() {
  const [fecha, setFecha] = useState(hoyISO());
  const [data, setData] = useState([]);
  useEffect(() => {
    return onValue(ref(database, 'rutaOrders'), (snapshot) => {
      const raw = snapshot.val();
      if (!raw) { setData([]); return; }
      const arr = Object.entries(raw).map(([key, val]) => ({ firebaseKey: key, ...val })).filter(p => p.fecha === fecha);
      setData(arr);
    });
  }, [fecha]);
  return (
    <div>
      <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
      {data.map(p => <div key={p.firebaseKey} style={{ borderBottom: '1px solid #eee' }}>#{p.id} - {p.cliente}</div>)}
    </div>
  );
}