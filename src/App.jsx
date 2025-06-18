import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, push, onValue, update } from 'firebase/database';
import logo from './logo.svg';

const preparadores = [
  'Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 'Maria Gomez', 'Daniel Cruz', 'Jose Orozco', 'Otro'
];

function OrderForm({ onAddOrder }) {
  const [cliente, setCliente] = useState('');
  const [pedido, setPedido] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cliente.trim() || !pedido.trim()) return;
    const fecha = new Date().toISOString().slice(0, 10);
    const timestamp = new Date().toISOString();
    onAddOrder({ cliente, pedido, fecha, timestamp });
    setCliente('');
    setPedido('');
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <input
        type="text"
        placeholder="Nombre del cliente"
        value={cliente}
        onChange={(e) => setCliente(e.target.value)}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10 }}
        required
      />
      <textarea
        rows={5}
        placeholder="Escribí el pedido aquí"
        value={pedido}
        onChange={(e) => setPedido(e.target.value)}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10, resize: 'vertical' }}
        required
      />
      <button type="submit" style={{ padding: '10px 20px', fontSize: 16 }}>
        Agregar Pedido
      </button>
    </form>
  );
}

function getColors(estado) {
  switch (estado) {
    case 'Pendiente': return { background: '#d1ecf1', border: '#0c5460' };
    case 'En preparación': return { background: '#fff3cd', border: '#856404' };
    case 'Preparado': return { background: '#d4edda', border: '#155724' };
    case 'Cancelado': return { background: '#f8d7da', border: '#721c24' };
    default: return { background: '#f8f9fa', border: '#6c757d' };
  }
}

function KitchenView({ orders, isActive }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audio = new Audio('/notificacion.mp3');

  useEffect(() => {
    if (isActive && orders.length > 0) {
      audio.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.length]);

  const updateCampo = (firebaseKey, campo, valor) => {
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, { [campo]: valor });
  };

  const handleAsignar = (firebaseKey, persona) => {
    const ts = new Date().toISOString();
    update(ref(database, `orders/${firebaseKey}`), {
      preparador: persona,
      estado: 'En preparación',
      timestampPreparacion: ts
    });
  };

  const handleEstadoFinalizado = (order) => {
    if (order.estado === 'En preparación') {
      const ts = new Date().toISOString();
      updateCampo(order.firebaseKey, 'estado', 'Preparado');
      updateCampo(order.firebaseKey, 'timestampPreparado', ts);
    }
  };

  const cancelar = (order) => updateCampo(order.firebaseKey, 'estado', 'Cancelado');
  const deshacer = (order) => updateCampo(order.firebaseKey, 'estado', 'Pendiente');

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos en Cocina</h2>
      {orders.length === 0 ? <p>No hay pedidos para hoy</p> : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {orders.map(order => {
            const { background, border } = getColors(order.estado);
            return (
              <li key={order.firebaseKey} style={{ backgroundColor: background, border: `2px solid ${border}`, marginBottom: 10, padding: 15, borderRadius: 8 }}>
                <strong>#{order.numeroDelDia} - Cliente:</strong> {order.cliente}<br />
                <strong>Pedido:</strong>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 18 }}>{order.pedido}</pre>
                <div style={{ marginTop: 10 }}>
                  <label><strong>Preparador:</strong></label>
                  <select onChange={(e) => handleAsignar(order.firebaseKey, e.target.value)} value={order.preparador || ''}>
                    <option value="">Seleccionar</option>
                    {preparadores.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div style={{ marginTop: 8 }}>
                  <strong>Estado:</strong> {order.estado}
                  {order.estado === 'En preparación' && (
                    <button onClick={() => handleEstadoFinalizado(order)} style={{ marginLeft: 10 }}>Marcar como Preparado</button>
                  )}
                  {order.estado !== 'Cancelado' && (
                    <button onClick={() => cancelar(order)} style={{ marginLeft: 10, color: 'white', background: 'red' }}>Cancelar</button>
                  )}
                  {order.estado === 'Cancelado' && (
                    <button onClick={() => deshacer(order)} style={{ marginLeft: 10, color: 'white', background: 'blue' }}>Deshacer</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('ingreso');
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return setOrders([]);

      const arr = Object.entries(data).map(([key, value]) => ({ firebaseKey: key, ...value }));

      const todayOrders = arr
        .filter(o => o.fecha === today)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .map((o, i) => ({ ...o, numeroDelDia: i + 1 }));

      const others = arr.filter(o => o.fecha !== today);
      setOrders([...todayOrders, ...others]);
    });
  }, [today]);

  const addOrder = ({ cliente, pedido, fecha, timestamp }) => {
    push(ref(database, 'orders'), {
      cliente, pedido, estado: 'Pendiente', fecha, timestamp
    });
  };

  const todayOrders = orders.filter(o => o.fecha === today);
  const previousOrders = orders.filter(o => o.fecha !== today);

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 20 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Logo" style={{ width: 50, height: 50 }} />
          <h1>Servicio Delivery</h1>
        </div>
        <div>
          <button onClick={() => setView('ingreso')}>Ingreso</button>
          <button onClick={() => setView('cocina')}>Cocina</button>
          <button onClick={() => setView('anteriores')}>Anteriores</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} />}
      {view === 'cocina' && <KitchenView orders={todayOrders} isActive={view === 'cocina'} />}
      {view === 'anteriores' && (
        <div style={{ padding: 20 }}>
          <h2>Pedidos Anteriores</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Cliente</th><th>Pedido</th><th>Estado</th><th>Fecha</th><th>Ingreso</th><th>Preparación</th><th>Preparado</th><th>Preparador</th>
              </tr>
            </thead>
            <tbody>
              {previousOrders.map((o, idx) => (
                <tr key={o.firebaseKey}>
                  <td>{o.cliente}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>{o.pedido}</td>
                  <td>{o.estado}</td>
                  <td>{o.fecha}</td>
                  <td>{o.timestamp}</td>
                  <td>{o.timestampPreparacion || '-'}</td>
                  <td>{o.timestampPreparado || '-'}</td>
                  <td>{o.preparador || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;

