// App.js
import React, { useState, useEffect, useRef } from 'react';
import { database } from './firebase';
import { ref, push, onValue, update } from 'firebase/database';
import logo from './logo.svg';
import pedidoSound from './pedido.mp3';
import './App.css';

function OrderForm({ onAddOrder, nextOrderId }) {
  const [cliente, setCliente] = useState('');
  const [pedido, setPedido] = useState('');
  const [customId, setCustomId] = useState(nextOrderId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cliente.trim() || !pedido.trim()) return;
    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString();
    onAddOrder({ cliente, pedido, fecha, hora, id: customId });
    setCliente('');
    setPedido('');
    setCustomId((prev) => Math.min(prev + 1, 100));
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <label>Número de pedido:</label>
      <input
        type="number"
        value={customId}
        onChange={(e) => setCustomId(parseInt(e.target.value))}
        min={1}
        max={100}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10 }}
      />
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
    case 'Enviado': return { background: 'rgba(40, 167, 69, 0.7)', border: '#155724' };
    case 'Cancelado': return { background: '#f8d7da', border: '#721c24' };
    default: return { background: '#f8f9fa', border: '#6c757d' };
  }
}

function ListaPedidos({ pedidos, onEnviarPedido }) {
  return (
    <div style={{ padding: 20 }}>
      <h2>Lista de Pedidos de Hoy</h2>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {pedidos.map(({ id, cliente, estado, cocinero, repartidor }) => {
          const { background, border } = getColors(estado);
          const parpadeo = estado === 'Preparado' ? 'parpadeo' : '';
          return (
            <li key={id} className={parpadeo} style={{ padding: 10, borderBottom: '1px solid #ccc', backgroundColor: background, border: `2px solid ${border}`, borderRadius: 6, marginBottom: 8 }}>
              <strong>#{id}</strong> - {cliente} - <em>{estado}</em>
              {estado === 'En preparación' && cocinero && (
                <> (Cocinero: <strong>{cocinero}</strong>)</>
              )}
              {estado === 'Preparado' && (
                <div style={{ marginTop: 8 }}>
                  <label>Enviar pedido con:</label>
                  <select onChange={(e) => onEnviarPedido(id, e.target.value)} defaultValue="">
                    <option value="" disabled>Seleccionar...</option>
                    <option>Carlos Mora</option>
                    <option>Noel Hernadez</option>
                    <option>Noel Bendaña</option>
                    <option>Jose Orozco</option>
                    <option>Daniel Cruz</option>
                    <option>Otros</option>
                  </select>
                </div>
              )}
              {estado === 'Enviado' && repartidor && (
                <div style={{ marginTop: 5 }}>
                  <small>Enviado con: <strong>{repartidor}</strong></small>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function KitchenView({ orders }) {
  
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audioRef = useRef(null);

  const updateCampo = (firebaseKey, campo, valor) => {
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, { [campo]: valor });
  };

  const handleSelectCocinero = (firebaseKey, valor) => {
    if (!valor) return;
    const now = new Date().toLocaleTimeString();
    update(ref(database, `orders/${firebaseKey}`), {
      cocinero: valor,
      estado: 'En preparación',
      timestampPreparacion: now
    });
  };

  const marcarPreparado = (firebaseKey) => {
    const now = new Date().toLocaleTimeString();
    update(ref(database, `orders/${firebaseKey}`), {
      estado: 'Preparado',
      timestampPreparado: now
    });
  };

  useEffect(() => {
    if (audioRef.current && orders.length > 0) {
      const latestOrder = orders[orders.length - 1];
      const now = new Date().toISOString().slice(0, 10);
      if (latestOrder.fecha === now && latestOrder.justAdded) {
        audioRef.current.play();
      }
    }
  }, [orders]);

  const cocineros = ['Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 'Maria Gomez', 'Daniel Cruz', 'Jose Orozco', 'Otro'];

  const pedidosFiltrados = orders.filter(o => o.estado !== 'Enviado');

  return (
    <div style={{ padding: 20, fontSize: '20px' }}>
      <h2>Pedidos en Cocina</h2>
      <audio ref={audioRef} src={pedidoSound} preload="auto" />
      {pedidosFiltrados.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {[...pedidosFiltrados].sort((a, b) => a.id - b.id).map(({ id, cliente, pedido, estado = 'Pendiente', firebaseKey, cocinero }) => {
            const isEditing = editingId === firebaseKey;
            const textStyle = estado === 'Cancelado' ? { textDecoration: 'line-through' } : {};
            const { background, border } = getColors(estado);

            return (
              <li key={firebaseKey} style={{ backgroundColor: background, border: `2px solid ${border}`, marginBottom: 10, padding: 15, borderRadius: 8 }}>
                <div><strong>#{id} - Cliente:</strong> {cliente}</div>
                <div style={{ marginTop: 5 }}>
                  <strong>Pedido:</strong>
                  <pre style={{ whiteSpace: 'pre-wrap', marginTop: 5 }}>{pedido}</pre>

                </div>
                {estado === 'Pendiente' && (
                  <div style={{ marginTop: 8 }}>
                    <label>Seleccionar cocinero:</label>
                    <select onChange={(e) => handleSelectCocinero(firebaseKey, e.target.value)} defaultValue="">
                      <option value="" disabled>Seleccionar...</option>
                      {cocineros.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )}
                {estado === 'En preparación' && (
                  <div style={{ marginTop: 10 }}>
                    <strong>Cocinero: {cocinero}</strong>
                    <button onClick={() => marcarPreparado(firebaseKey)} style={{ marginLeft: 10 }}>✅ Marcar como Preparado</button>
                  </div>
                )}
                <div style={{ marginTop: 10 }}>
  {estado !== 'Cancelado' && (
    <button
      onClick={() => updateCampo(firebaseKey, 'estado', 'Cancelado')}
      style={{ backgroundColor: '#dc3545', color: 'white', padding: '4px 10px', borderRadius: 4, border: 'none' }}
    >
      ❌ Cancelar
    </button>
  )}
  {estado === 'Cancelado' && (
    <button
      onClick={() => updateCampo(firebaseKey, 'estado', 'Pendiente')}
      style={{ backgroundColor: '#007bff', color: 'white', padding: '4px 10px', borderRadius: 4, border: 'none' }}
    >
      ↩️ Deshacer cancelación
    </button>
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
function Anteriores({ pedidos }) {
  const [filtroFecha, setFiltroFecha] = useState('');

  const pedidosFiltrados = pedidos
    .filter(p => p.estado !== 'Cancelado')
    .filter(p => (filtroFecha ? p.fecha.includes(filtroFecha) : true));

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos Anteriores</h2>

      <div style={{ marginBottom: 10 }}>
        <label>Filtrar por fecha:</label>
        <input
          type="date"
          value={filtroFecha}
          onChange={(e) => setFiltroFecha(e.target.value)}
          style={{ marginLeft: 10, padding: 5 }}
        />
        <button
          onClick={() => exportarAExcel(pedidosFiltrados)}
          style={{ marginLeft: 20, padding: '6px 12px', fontSize: '14px' }}
        >
          Descargar como Excel
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} border="1">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>#</th>
            <th>Cliente</th>
            <th>Pedido</th>
            <th>Estado</th>
            <th>Ingreso</th>
            <th>Preparación</th>
            <th>Preparado</th>
            <th>Enviado</th>
            <th>Cocinero</th>
            <th>Repartidor</th>
          </tr>
        </thead>
        <tbody>
          {pedidosFiltrados.map(({ id, cliente, pedido, estado, cocinero, repartidor, timestampIngreso, timestampPreparacion, timestampPreparado, timestampEnviado, fecha }) => (
            <tr key={`${fecha}-${id}`}>
              <td>{fecha}</td>
              <td>{id}</td>
              <td>{cliente}</td>
              <td style={{ whiteSpace: 'pre-wrap' }}>{pedido}</td>
              <td>{estado}</td>
              <td>{timestampIngreso || '-'}</td>
              <td>{timestampPreparacion || '-'}</td>
              <td>{timestampPreparado || '-'}</td>
              <td>{timestampEnviado || '-'}</td>
              <td>{cocinero || '-'}</td>
              <td>{repartidor || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function App() {
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('ingreso');

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const grouped = Object.entries(data).reduce((acc, [key, val]) => {
          const fecha = val.fecha;
          if (!acc[fecha]) acc[fecha] = [];
          acc[fecha].push({ firebaseKey: key, ...val });
          return acc;
        }, {});

        const pedidosHoy = (grouped[today] || []).sort((a, b) => a.id - b.id);
        const anteriores = Object.entries(grouped)
          .filter(([fecha]) => fecha !== today)
          .flatMap(([fecha, arr]) => arr.map((p, idx) => ({ ...p, fecha, id: p.id || idx + 1 })));

        setOrders({ hoy: pedidosHoy, anteriores });
      } else {
        setOrders({ hoy: [], anteriores: [] });
      }
    });
  }, []);

  const getNextOrderId = () => {
    const maxId = orders.hoy?.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0;
    return maxId + 1;
  };

  const addOrder = ({ cliente, pedido, fecha, hora, id }) => {
    const timestamp = new Date().toLocaleTimeString();
    push(ref(database, 'orders'), {
      cliente,
      pedido,
      estado: 'Pendiente',
      fecha,
      id,
      timestampIngreso: timestamp,
      justAdded: true
    });
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.hoy.find(o => o.id === orderId);
    if (order) {
      update(ref(database, `orders/${order.firebaseKey}`), {
        estado: 'Enviado',
        repartidor,
        timestampEnviado: new Date().toLocaleTimeString()
      });
    }
  };

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 20, fontFamily: 'Arial, sans-serif', backgroundColor: '#f0f8ff', borderRadius: 10 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Logo" style={{ width: 50, height: 50 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Servicio Delivery</h1>
        </div>
        <div>
          <button onClick={() => setView('ingreso')} disabled={view === 'ingreso'} style={{ marginRight: 8 }}>Ingresar</button>
          <button onClick={() => setView('cocina')} disabled={view === 'cocina'} style={{ marginRight: 8 }}>Cocina</button>
          <button onClick={() => setView('lista')} disabled={view === 'lista'} style={{ marginRight: 8 }}>Lista de pedidos</button>
          <button onClick={() => setView('anteriores')} disabled={view === 'anteriores'}>Anteriores</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} nextOrderId={getNextOrderId()} />}
      {view === 'cocina' && <KitchenView orders={orders.hoy || []} />}
      {view === 'lista' && <ListaPedidos pedidos={orders.hoy || []} onEnviarPedido={handleEnviarPedido} />}
      {view === 'anteriores' && <Anteriores pedidos={orders.anteriores || []} />}

    </div>
  );
}

export default App;