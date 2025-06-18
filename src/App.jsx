import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, push, onValue, update } from 'firebase/database';
import logo from './logo.svg';

const preparadores = [
  'Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 'Maria Gomez', 'Daniel Cruz', 'Jose Orozco', 'Otro'
];

const handleSubmit = (e) => {
    e.preventDefault();
    if (!cliente.trim() || !pedido.trim()) return;
    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString();
    onAddOrder({ cliente, pedido, fecha, hora });
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

function KitchenView({ orders }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audioRef = useRef(null);

  const updateCampo = (firebaseKey, campo, valor) => {
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, { [campo]: valor });
  };

  const handleSelectCocinero = (firebaseKey, valor) => {
    const now = new Date().toLocaleTimeString();
    const updates = {
      cocinero: valor,
      estado: 'En preparación',
      timestampPreparacion: now
    };
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, updates);
  };

  const startEdit = (firebaseKey, currentText) => {
    setEditingId(firebaseKey);
    setEditText(currentText);
  };

  const saveEdit = (firebaseKey) => {
    if (editText.trim()) updateCampo(firebaseKey, 'pedido', editText.trim());
    setEditingId(null);
    setEditText('');
  };

  const handleClickEstado = (order) => {
    if (editingId === order.firebaseKey || order.estado === 'Cancelado') return;
    const now = new Date().toLocaleTimeString();
    if (order.estado === 'Pendiente') update(ref(database, `orders/${order.firebaseKey}`), { estado: 'En preparación', timestampPreparacion: now });
    else if (order.estado === 'En preparación') update(ref(database, `orders/${order.firebaseKey}`), { estado: 'Preparado', timestampPreparado: now });
  };

  const handleDoubleClickEstado = (order) => {
    if (order.estado === 'Preparado') updateCampo(order.firebaseKey, 'estado', 'Pendiente');
  };

  const handleCancelar = (e, order) => {
    e.stopPropagation();
    updateCampo(order.firebaseKey, 'estado', 'Cancelado');
  };

  const handleDeshacer = (e, order) => {
    e.stopPropagation();
    updateCampo(order.firebaseKey, 'estado', 'Pendiente');
  };

  useEffect(() => {
    if (audioRef.current && orders.length > 0) {
      const latestOrder = orders[0];
      const now = new Date().toISOString().slice(0, 10);
      if (latestOrder.fecha === now && latestOrder.justAdded) {
        audioRef.current.play();
      }
    }
  }, [orders]);

  const cocineros = [
    'Noel Hernandez', 'Julio Amador', 'Roberto Centeno',
    'Maria Gomez', 'Daniel Cruz', 'Jose Orozco', 'Otro'
  ];

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos en Cocina</h2>
      <audio ref={audioRef} src={pedidoSound} preload="auto" />
      {orders.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {orders.map(({ id, cliente, pedido, estado = 'Pendiente', firebaseKey, cocinero }) => {
            const { background, border } = getColors(estado);
            const isEditing = editingId === firebaseKey;
            const textStyle = estado === 'Cancelado' ? { textDecoration: 'line-through' } : {};

            return (
              <li
                key={firebaseKey}
                style={{ backgroundColor: background, border: `2px solid ${border}`, marginBottom: 10, padding: 15, borderRadius: 8, cursor: isEditing ? 'default' : estado === 'Cancelado' ? 'not-allowed' : 'pointer', userSelect: isEditing ? 'text' : 'none', display: 'flex', flexDirection: 'column', position: 'relative' }}
                onClick={() => handleClickEstado({ firebaseKey, estado })}
                onDoubleClick={() => handleDoubleClickEstado({ firebaseKey, estado })}
              >
                <div>
                  <strong style={textStyle}>#{id} - Cliente:</strong> <span style={textStyle}>{cliente}</span>
                </div>
                <div style={{ marginTop: 5 }}>
                  <strong style={textStyle}>Pedido:</strong>{' '}
                  {isEditing ? (
                    <>
                      <textarea rows={3} value={editText} onChange={(e) => setEditText(e.target.value)} style={{ width: '100%', resize: 'vertical', fontSize: '20px' }} />
                      <div style={{ marginTop: 6 }}>
                        <button onClick={() => saveEdit(firebaseKey)}>Guardar</button>
                        <button onClick={() => setEditingId(null)} style={{ marginLeft: 8 }}>Cancelar</button>
                      </div>
                    </>
                  ) : (
                    <pre style={{ whiteSpace: 'pre-wrap', margin: '5px 0', display: 'inline-block', fontSize: '20px', ...textStyle }}>{pedido}</pre>
                  )}
                  {!isEditing && (
                    <button
                      onClick={(e) => { e.stopPropagation(); startEdit(firebaseKey, pedido); }}
                      style={{ marginLeft: 8, padding: '2px 6px' }}
                    >✏️ Editar</button>
                  )}
                </div>
                {estado === 'Pendiente' && (
                  <div style={{ marginTop: 8 }}>
                    <label><strong>Seleccionar cocinero:</strong></label>
                    <select onChange={(e) => handleSelectCocinero(firebaseKey, e.target.value)} defaultValue="">
                      <option value="" disabled>Seleccionar...</option>
                      {cocineros.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 15, userSelect: 'none' }}>
                  <strong>Estado:</strong>
                  <span>{estado}</span>
                  {estado !== 'Cancelado' && (
                    <button onClick={(e) => handleCancelar(e, { firebaseKey, estado })} style={{ marginLeft: 'auto', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>Cancelar</button>
                  )}
                  {estado === 'Cancelado' && (
                    <button onClick={(e) => handleDeshacer(e, { firebaseKey, estado })} style={{ marginLeft: 'auto', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer' }}>Deshacer</button>
                  )}
                </div>
                <small style={{ marginTop: 5, color: '#666', fontSize: 12 }}>(clic para cambiar, doble clic para volver de "Preparado")</small>
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

        const pedidosHoy = (grouped[today] || []).sort((a, b) => b.timestampIngreso?.localeCompare(a.timestampIngreso));
        pedidosHoy.forEach((pedido, idx) => pedido.id = pedidosHoy.length - idx);
        const anteriores = Object.entries(grouped)
          .filter(([fecha]) => fecha !== today)
          .flatMap(([fecha, arr]) => arr.map((p, idx) => ({ ...p, fecha, id: idx + 1 })));

        setOrders({ hoy: pedidosHoy, anteriores });
      } else {
        setOrders({ hoy: [], anteriores: [] });
      }
    });
  }, []);

  const addOrder = ({ cliente, pedido, fecha, hora }) => {
    push(ref(database, 'orders'), {
      cliente,
      pedido,
      estado: 'Pendiente',
      fecha,
      timestampIngreso: new Date().toLocaleTimeString(),
      justAdded: true
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: '20px auto', padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src={logo} alt="Logo" style={{ width: 50, height: 50 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>Servicio Delivery</h1>
        </div>
        <div>
          <button onClick={() => setView('ingreso')} disabled={view === 'ingreso'} style={{ marginRight: 8 }}>Ingresar</button>
          <button onClick={() => setView('cocina')} disabled={view === 'cocina'} style={{ marginRight: 8 }}>Cocina</button>
          <button onClick={() => setView('anteriores')} disabled={view === 'anteriores'}>Anteriores</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} />}
      {view === 'cocina' && <KitchenView orders={orders.hoy || []} />}
      {view === 'anteriores' && <KitchenView orders={orders.anteriores || []} />}
    </div>
  );
}

export default App;
