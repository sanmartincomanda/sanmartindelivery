import React, { useState, useEffect } from 'react';
import { database } from './firebase';
import { ref, push, onValue, update } from 'firebase/database';
import logo from './logo.svg';

function OrderForm({ onAddOrder }) {
  const [cliente, setCliente] = useState('');
  const [pedido, setPedido] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!cliente.trim() || !pedido.trim()) return;
    const fecha = new Date().toISOString().slice(0, 10);
    onAddOrder({ cliente, pedido, fecha });
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

  const updateCampo = (firebaseKey, campo, valor) => {
    const orderRef = ref(database, `orders/${firebaseKey}`);
    update(orderRef, { [campo]: valor });
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
    if (order.estado === 'Pendiente') updateCampo(order.firebaseKey, 'estado', 'En preparación');
    else if (order.estado === 'En preparación') updateCampo(order.firebaseKey, 'estado', 'Preparado');
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

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos en Cocina</h2>
      {orders.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {orders.map(({ id, cliente, pedido, estado = 'Pendiente', firebaseKey }) => {
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

function ListView({ orders }) {
  return (
    <div style={{ padding: 20 }}>
      <h2>Lista de pedidos de hoy</h2>
      {orders.length === 0 ? (
        <p>No hay pedidos aún</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th>#</th><th>Cliente</th><th>Pedido</th><th>Estado</th><th>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(({ id, cliente, pedido, estado, fecha }) => {
              const { background, border } = getColors(estado);
              const textStyle = estado === 'Cancelado' ? { textDecoration: 'line-through' } : {};
              return (
                <tr key={`${fecha}-${id}`} style={{ backgroundColor: background, border: `2px solid ${border}` }}>
                  <td style={{ padding: '8px', ...textStyle }}>{id}</td>
                  <td style={{ padding: '8px', ...textStyle }}>{cliente}</td>
                  <td style={{ padding: '8px', whiteSpace: 'pre-wrap', ...textStyle }}>{pedido}</td>
                  <td style={{ padding: '8px', ...textStyle }}>{estado}</td>
                  <td style={{ padding: '8px', ...textStyle }}>{fecha}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function App() {
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('ingreso');
  const [todayOrders, setTodayOrders] = useState([]);
  const [previousOrders, setPreviousOrders] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const groupedByDate = {};
        Object.entries(data).forEach(([key, val]) => {
          const fecha = val.fecha || 'sin-fecha';
          if (!groupedByDate[fecha]) groupedByDate[fecha] = [];
          groupedByDate[fecha].push({ firebaseKey: key, ...val });
        });

        const fechasOrdenadas = Object.keys(groupedByDate).sort();
        let parsed = [];
        fechasOrdenadas.forEach((fecha) => {
          const pedidos = groupedByDate[fecha].sort((a, b) => a.firebaseKey.localeCompare(b.firebaseKey));
          pedidos.forEach((pedido, index) => {
            parsed.push({ id: index + 1, ...pedido, fecha });
          });
        });

        setOrders(parsed);
        setTodayOrders(parsed.filter((p) => p.fecha === today));
        setPreviousOrders(parsed.filter((p) => p.fecha !== today));
      } else {
        setOrders([]);
        setTodayOrders([]);
        setPreviousOrders([]);
      }
    });
  }, []);

  const addOrder = ({ cliente, pedido, fecha }) => {
    push(ref(database, 'orders'), { cliente, pedido, estado: 'Pendiente', fecha });
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
          <button onClick={() => setView('lista')} disabled={view === 'lista'} style={{ marginRight: 8 }}>Lista</button>
          <button onClick={() => setView('anteriores')} disabled={view === 'anteriores'}>Anteriores</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} />}
      {view === 'cocina' && <KitchenView orders={todayOrders} />}
      {view === 'lista' && <ListView orders={todayOrders} />}
      {view === 'anteriores' && <ListView orders={previousOrders} />}
    </div>
  );
}

export default App;