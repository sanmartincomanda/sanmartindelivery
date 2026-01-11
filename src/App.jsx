// src/App.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { getApp } from 'firebase/app';
import { ref, push, onValue, update, set, remove } from 'firebase/database';
import { database } from './firebase';
import logo from './logo.svg';
import PedidosRuta from "./PedidosRuta";
import pedidoSound from './pedido.mp3';
import './App.css';

/******************** UTIL ********************/
const normalizar = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const hoyISO = () => new Date().toISOString().slice(0, 10);

/******************** ORDER FORM ********************/
function OrderForm({ onAddOrder, nextOrderId, clientes }) {
  const [clienteInput, setClienteInput] = useState('');
  const [pedido, setPedido] = useState('');
  const [customId, setCustomId] = useState(nextOrderId);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', codigo: '', direccion: '' });
  const [savingClient, setSavingClient] = useState(false);

  useEffect(() => setCustomId(nextOrderId), [nextOrderId]);

  useEffect(() => {
    try {
      console.log('Firebase projectId:', getApp().options.projectId);
      console.log('Realtime DB root:', ref(database).toString());
    } catch (e) {
      console.error('No pude leer config de Firebase:', e);
    }
  }, []);

  const sugerencias = clientes
    .filter(c => normalizar(c.nombre || '').includes(normalizar(clienteInput)))
    .slice(0, 8);

  const handleSelectCliente = (c) => {
    setSelectedClient(c);
    setClienteInput(c.nombre);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!pedido.trim()) return;

    if (!selectedClient) {
      alert('Seleccioná un cliente de la lista (o agregá uno nuevo).');
      return;
    }

    const fecha = hoyISO();
    const hora = new Date().toLocaleTimeString();

    onAddOrder({
      cliente: selectedClient.nombre,
      clienteCodigo: selectedClient.codigo || '-',
      direccion: selectedClient.direccion || '-',
      pedido,
      fecha,
      hora,
      id: customId
    });

    setClienteInput('');
    setSelectedClient(null);
    setPedido('');
    setCustomId((prev) => Math.min(prev + 1, 100));
  };

  const guardarNuevoCliente = async () => {
    const { nombre, codigo, direccion } = nuevoCliente;
    if (!nombre.trim() || !codigo.trim() || !direccion.trim()) {
      alert('Completá nombre, código y dirección para crear el cliente.');
      return;
    }
    try {
      setSavingClient(true);
      const nuevoRef = push(ref(database, 'clients'));
      const data = {
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        direccion: direccion.trim(),
      };
      await set(nuevoRef, data);
      setShowNewClient(false);
      setNuevoCliente({ nombre: '', codigo: '', direccion: '' });
      setSelectedClient({ firebaseKey: nuevoRef.key, ...data });
      setClienteInput(data.nombre);
    } catch (err) {
      console.error('Error guardando cliente:', err);
      alert('No se pudo guardar el cliente. Detalle: ' + (err?.code || err?.message || String(err)));
    } finally {
      setSavingClient(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ marginBottom: 20 }}>
      <label>Número de pedido:</label>
      <input
        type="number"
        value={customId}
        onChange={(e) => setCustomId(parseInt(e.target.value || '1', 10))}
        min={1}
        max={100}
        style={{ width: '100%', padding: 8, fontSize: 16, marginBottom: 10 }}
      />

      <label>Cliente:</label>
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <input
          type="text"
          placeholder="Escribí y elegí de la lista"
          value={clienteInput}
          onChange={(e) => {
            setClienteInput(e.target.value);
            setSelectedClient(null);
          }}
          style={{ width: '100%', padding: 8, fontSize: 16 }}
          required
          autoComplete="off"
        />

        {clienteInput && !selectedClient && sugerencias.length > 0 && (
          <ul style={{
            position: 'absolute', top: '100%', left: 0, right: 0,
            background: 'white', border: '1px solid #ddd', borderRadius: 6,
            listStyle: 'none', margin: 0, padding: 0, zIndex: 10, maxHeight: 220, overflowY: 'auto'
          }}>
            {sugerencias.map((c) => (
              <li
                key={c.firebaseKey}
                onClick={() => handleSelectCliente(c)}
                style={{ padding: '8px 10px', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                <small>Código: {c.codigo} · Dirección: {c.direccion}</small>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedClient && (
        <div style={{
          background: '#f6f9ff', border: '1px solid #cfe2ff', padding: 10,
          borderRadius: 8, marginBottom: 10
        }}>
          <div><strong>Cliente seleccionado:</strong> {selectedClient.nombre}</div>
          <div><strong>Código:</strong> {selectedClient.codigo}</div>
          <div><strong>Dirección:</strong> {selectedClient.direccion}</div>
          <button type="button" onClick={() => { setSelectedClient(null); setClienteInput(''); }}>Cambiar</button>
        </div>
      )}

      {!selectedClient && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" onClick={() => setShowNewClient(v => !v)}>
            {showNewClient ? 'Cancelar nuevo cliente' : '➕ Agregar cliente nuevo'}
          </button>
        </div>
      )}

      {showNewClient && (
        <div style={{ background: '#fffaf0', border: '1px solid #ffe8a1', padding: 10, borderRadius: 8, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 8 }}>
            <input
              placeholder="Nombre"
              value={nuevoCliente.nombre}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
              style={{ padding: 8, fontSize: 14 }}
            />
            <input
              placeholder="Código"
              value={nuevoCliente.codigo}
              onChange={(e) => setNuevoCliente({ ...nuevoCliente, codigo: e.target.value })}
              style={{ padding: 8, fontSize: 14 }}
            />
          </div>
          <input
            placeholder="Dirección"
            value={nuevoCliente.direccion}
            onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
            style={{ marginTop: 8, padding: 8, width: '100%', fontSize: 14 }}
          />
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={guardarNuevoCliente} disabled={savingClient}>
              {savingClient ? 'Guardando…' : 'Guardar cliente'}
            </button>
          </div>
        </div>
      )}

      <label>Pedido:</label>
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

/******************** COLORES POR ESTADO ********************/
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

/******************** LISTA (ENVÍO) ********************/
// REEMPLAZÁ COMPLETO: function ListaPedidos({ pedidos, onEnviarPedido }) { ... }
// - Estilo futurista tipo Cocina (cards con halo por estado)
// - Pedido grande (lo más importante)
// - Contadores arriba: Por enviar / Enviados / Cancelados
// - Muestra: cocinero (quién lo hizo), repartidor (enviado con), dirección, tiempos
function ListaPedidos({ pedidos = [], onEnviarPedido }) {
  const stateTone = (estado = 'Pendiente') => {
    if (estado === 'En preparación') return 'warn';
    if (estado === 'Preparado') return 'ok';        // listo para enviar
    if (estado === 'Cancelado') return 'danger';
    if (estado === 'Enviado') return 'sent';
    return 'info';
  };

  const ui = {
    page: { padding: 18, color: '#0b1220' },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 14,
    },
    title: { margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
    pills: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
    pill: (tone) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 900,
      background: 'rgba(255,255,255,0.85)',
      border: '1px solid rgba(15,23,42,0.10)',
      boxShadow: '0 8px 18px rgba(15,23,42,0.05)',
    }),
    dot: (tone) => ({
      width: 8,
      height: 8,
      borderRadius: 999,
      background:
        tone === 'ok' ? 'rgba(34,197,94,0.95)' :
        tone === 'sent' ? 'rgba(99,102,241,0.95)' :
        tone === 'danger' ? 'rgba(244,63,94,0.95)' :
        'rgba(34,211,238,0.95)',
    }),

    list: { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 },

    card: (tone) => ({
      borderRadius: 18,
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'rgba(255,255,255,0.92)',
      padding: 12,
      position: 'relative',
      overflow: 'hidden',
      boxShadow:
        tone === 'ok' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(34,197,94,0.22)' :
        tone === 'sent' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(99,102,241,0.22)' :
        tone === 'danger' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(244,63,94,0.22)' :
        '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(34,211,238,0.22)',
    }),

    glow: (tone) => ({
      position: 'absolute',
      inset: -80,
      background:
        tone === 'ok' ? 'radial-gradient(circle at 20% 10%, rgba(34,197,94,0.20), transparent 55%)' :
        tone === 'sent' ? 'radial-gradient(circle at 20% 10%, rgba(99,102,241,0.20), transparent 55%)' :
        tone === 'danger' ? 'radial-gradient(circle at 20% 10%, rgba(244,63,94,0.18), transparent 55%)' :
        'radial-gradient(circle at 20% 10%, rgba(34,211,238,0.22), transparent 55%)',
      pointerEvents: 'none',
      filter: 'blur(2px)',
    }),

    topRow: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'baseline',
      position: 'relative',
      marginBottom: 6,
    },
    id: { fontSize: 13, fontWeight: 900, opacity: 0.85 },
    estado: { fontSize: 12, fontWeight: 900, opacity: 0.8 },

    cliente: { margin: 0, fontSize: 15, fontWeight: 900 },
    sub: { fontSize: 12, opacity: 0.86, marginTop: 4, fontWeight: 700 },

    metaGrid: {
      marginTop: 8,
      display: 'grid',
      gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))',
      gap: 8,
    },
    metaItem: {
      background: 'rgba(15,23,42,0.04)',
      border: '1px solid rgba(15,23,42,0.08)',
      borderRadius: 12,
      padding: 10,
      fontSize: 13,
      fontWeight: 700,
    },

    pedidoBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(34,211,238,0.08))',
      boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.10)',
    },
    pedidoLabel: {
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      opacity: 0.8,
      marginBottom: 6,
    },
    pedidoText: (cancelado) => ({
      whiteSpace: 'pre-wrap',
      margin: 0,
      fontSize: 19,
      lineHeight: 1.35,
      fontWeight: 900,
      letterSpacing: 0.2,
      ...(cancelado ? { textDecoration: 'line-through', opacity: 0.65 } : {}),
    }),

    enviarWrap: { marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
    select: {
      padding: '8px 10px',
      borderRadius: 12,
      border: '1px solid rgba(15,23,42,0.14)',
      background: 'rgba(255,255,255,0.95)',
      fontWeight: 900,
      fontSize: 12,
    },
  };

  // Contadores
  const porEnviar = pedidos.filter(p => p.estado !== 'Enviado' && p.estado !== 'Cancelado').length;
  const enviados = pedidos.filter(p => p.estado === 'Enviado').length;
  const cancelados = pedidos.filter(p => p.estado === 'Cancelado').length;

  const Pill = ({ label, value, tone }) => (
    <span style={ui.pill(tone)}>
      <span style={ui.dot(tone)} />
      {label}: <span style={{ fontWeight: 900 }}>{value}</span>
    </span>
  );

  // Mostrar todos (incluye enviados), pero el contador aclara
  const pedidosOrdenados = [...pedidos].sort((a, b) => (a.id || 0) - (b.id || 0));

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={ui.title}>Lista de Pedidos de Hoy</h2>
        <div style={ui.pills}>
          <Pill label="Por enviar" value={porEnviar} tone="ok" />
          <Pill label="Enviados" value={enviados} tone="sent" />
          <Pill label="Cancelados" value={cancelados} tone="danger" />
        </div>
      </div>

      {pedidosOrdenados.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={ui.list}>
          {pedidosOrdenados.map((p) => {
            const tone = stateTone(p.estado || 'Pendiente');
            const cancelado = p.estado === 'Cancelado';

            return (
              <li key={p.firebaseKey || `${p.fecha || 'hoy'}-${p.id}`} style={ui.card(tone)}>
                <div style={ui.glow(tone)} />

                <div style={{ position: 'relative' }}>
                  <div style={ui.topRow}>
                    <div style={ui.id}>#{p.id}</div>
                    <div style={ui.estado}>{p.estado || 'Pendiente'}</div>
                  </div>

                  <p style={ui.cliente}>
                    {p.cliente} <span style={{ fontSize: 12, opacity: 0.7 }}>({p.clienteCodigo || '-'})</span>
                  </p>

                  {p.direccion && (
                    <div style={ui.sub}><strong>Dir:</strong> {p.direccion}</div>
                  )}

                  <div style={ui.metaGrid}>
                    <div style={ui.metaItem}>
                      <strong>Quién lo hizo (Cocinero):</strong><br />
                      {p.cocinero || '-'}
                    </div>

                    <div style={ui.metaItem}>
                      <strong>Enviado con (Repartidor):</strong><br />
                      {p.repartidor || '-'}
                    </div>

                    <div style={ui.metaItem}>
                      <strong>Tiempos:</strong><br />
                      Ingreso: {p.timestampIngreso || '-'} · Prep: {p.timestampPreparacion || '-'}
                    </div>

                    <div style={ui.metaItem}>
                      <strong>Tiempos:</strong><br />
                      Listo: {p.timestampPreparado || '-'} · Enviado: {p.timestampEnviado || '-'}
                    </div>
                  </div>

                  <div style={ui.pedidoBox}>
                    <div style={ui.pedidoLabel}>Pedido</div>
                    <pre style={ui.pedidoText(cancelado)}>{p.pedido || ''}</pre>
                  </div>

                  {p.estado === 'Preparado' && (
                    <div style={ui.enviarWrap}>
                      <label style={{ fontWeight: 900 }}>Enviar pedido con:</label>
                      <select style={ui.select} onChange={(e) => onEnviarPedido(p.id, e.target.value)} defaultValue="">
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


/******************** COCINA ********************/
/******************** COCINA (UI FUTURISTA) ********************/
// REEMPLAZÁ SOLO KitchenView por esta versión:
// - Misma idea de "lista única" (no columnas por estado)
// - Estilo futurista
// - El PEDIDO es lo que más resalta (grande)
// - Color/halo cambia según estado (como antes, pero moderno)
// - Mantiene: seleccionar cocinero, listo, cancelar, deshacer, editar
function KitchenView({ orders }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audioRef = useRef(null);

  const [kitchenTab, setKitchenTab] = useState('delivery'); // 'delivery' | 'ruta'
  const [rutaOrders, setRutaOrders] = useState([]);

  useEffect(() => {
    const today = hoyISO();
    const rutaRef = ref(database, 'rutaOrders');

    return onValue(
      rutaRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) { setRutaOrders([]); return; }
        const arr = Object.entries(data)
          .map(([key, val]) => ({ firebaseKey: key, ...val }))
          .filter((p) => p.fecha === today)
          .sort((a, b) => (a.id || 0) - (b.id || 0));
        setRutaOrders(arr);
      },
      (error) => console.error('Error leyendo rutaOrders (cocina):', error)
    );
  }, []);

  const getBasePath = (tab) => (tab === 'ruta' ? 'rutaOrders' : 'orders');

  const updateCampo = (firebaseKey, campo, valor, tab = kitchenTab) => {
    const basePath = getBasePath(tab);
    update(ref(database, `${basePath}/${firebaseKey}`), { [campo]: valor });
  };

  const handleSelectCocinero = (firebaseKey, valor, tab = kitchenTab) => {
    if (!valor) return;
    const now = new Date().toLocaleTimeString();
    const basePath = getBasePath(tab);

    update(ref(database, `${basePath}/${firebaseKey}`), {
      cocinero: valor,
      estado: 'En preparación',
      timestampPreparacion: now
    });
  };

  const marcarPreparado = (firebaseKey, tab = kitchenTab) => {
    const now = new Date().toLocaleTimeString();
    const basePath = getBasePath(tab);

    update(ref(database, `${basePath}/${firebaseKey}`), {
      estado: 'Preparado',
      timestampPreparado: now
    });
  };

  // Sonido SOLO delivery
  useEffect(() => {
    if (kitchenTab !== 'delivery') return;

    if (audioRef.current && orders.length > 0) {
      const latestOrder = orders[orders.length - 1];
      const now = hoyISO();
      if (latestOrder.fecha === now && latestOrder.justAdded) {
        audioRef.current.play();
      }
    }
  }, [orders, kitchenTab]);

  const cocineros = ['Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 'Maria Gomez', 'Daniel Cruz', 'Noel Bendaña', 'Otro'];

  const currentOrdersRaw = kitchenTab === 'ruta' ? rutaOrders : orders;

  // Misma regla: excluir enviados, y mantener orden por id
  const pedidosFiltrados = [...currentOrdersRaw]
    .filter(o => o.estado !== 'Enviado')
    .sort((a, b) => (a.id || 0) - (b.id || 0));

  // ====== estilos futuristas (lista) ======
  const stateTone = (estado = 'Pendiente') => {
    if (estado === 'En preparación') return 'warn';
    if (estado === 'Preparado') return 'ok';
    if (estado === 'Cancelado') return 'danger';
    return 'info';
  };

  const ui = {
    page: { padding: 18, color: '#0b1220' },
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
      marginBottom: 14,
    },
    title: { margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
    tabWrap: {
      display: 'flex',
      background: 'rgba(255,255,255,0.85)',
      border: '1px solid rgba(15,23,42,0.12)',
      borderRadius: 14,
      padding: 4,
      boxShadow: '0 8px 24px rgba(15,23,42,0.06)',
      backdropFilter: 'blur(8px)',
    },
    tabBtn: (active) => ({
      padding: '10px 14px',
      borderRadius: 12,
      border: 'none',
      cursor: active ? 'default' : 'pointer',
      background: active ? 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(34,211,238,0.18))' : 'transparent',
      fontWeight: 900,
    }),
    pills: {
      display: 'flex',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    pill: (tone) => ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      borderRadius: 999,
      fontSize: 13,
      fontWeight: 900,
      background: 'rgba(255,255,255,0.85)',
      border: '1px solid rgba(15,23,42,0.10)',
      boxShadow: '0 8px 18px rgba(15,23,42,0.05)',
    }),
    dot: (tone) => ({
      width: 8, height: 8, borderRadius: 999,
      background:
        tone === 'info' ? 'rgba(34,211,238,0.9)' :
        tone === 'warn' ? 'rgba(245,158,11,0.95)' :
        tone === 'ok' ? 'rgba(34,197,94,0.9)' :
        'rgba(244,63,94,0.9)'
    }),
    list: {
      listStyle: 'none',
      padding: 0,
      margin: 0,
      display: 'grid',
      gap: 10,
    },
    card: (tone) => ({
      borderRadius: 18,
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'rgba(255,255,255,0.9)',
      boxShadow: '0 10px 22px rgba(15,23,42,0.08)',
      padding: 12,
      position: 'relative',
      overflow: 'hidden',

      // borde/halo por estado (equivale a "cambiar color", pero moderno)
      boxShadow:
        tone === 'info' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(34,211,238,0.22)' :
        tone === 'warn' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(245,158,11,0.22)' :
        tone === 'ok' ? '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(34,197,94,0.22)' :
        '0 10px 22px rgba(15,23,42,0.08), 0 0 0 1px rgba(244,63,94,0.22)',
    }),
    glow: (tone) => ({
      position: 'absolute',
      inset: -80,
      background:
        tone === 'info' ? 'radial-gradient(circle at 20% 10%, rgba(34,211,238,0.22), transparent 55%)' :
        tone === 'warn' ? 'radial-gradient(circle at 20% 10%, rgba(245,158,11,0.24), transparent 55%)' :
        tone === 'ok' ? 'radial-gradient(circle at 20% 10%, rgba(34,197,94,0.20), transparent 55%)' :
        'radial-gradient(circle at 20% 10%, rgba(244,63,94,0.18), transparent 55%)',
      pointerEvents: 'none',
      filter: 'blur(2px)'
    }),
    topRow: {
      display: 'flex',
      justifyContent: 'space-between',
      gap: 10,
      flexWrap: 'wrap',
      alignItems: 'baseline',
      position: 'relative',
      marginBottom: 6,
    },
    id: { fontSize: 13, fontWeight: 900, opacity: 0.85 },
    meta: { fontSize: 12, fontWeight: 900, opacity: 0.75 },
    name: { fontSize: 15, fontWeight: 900, margin: 0 },
    sub: { fontSize: 12, opacity: 0.86, marginTop: 4, fontWeight: 700 },

    // ✅ PEDIDO DOMINANTE
    pedidoBox: {
      marginTop: 10,
      padding: 12,
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.10), rgba(34,211,238,0.08))',
      boxShadow: 'inset 0 0 0 1px rgba(99,102,241,0.10)',
    },
    pedidoLabel: {
      fontSize: 12,
      fontWeight: 900,
      letterSpacing: 0.7,
      textTransform: 'uppercase',
      opacity: 0.8,
      marginBottom: 6
    },
    pedidoText: (isCancelado) => ({
      whiteSpace: 'pre-wrap',
      margin: 0,
      fontSize: 19,
      lineHeight: 1.35,
      fontWeight: 900,
      letterSpacing: 0.2,
      ...(isCancelado ? { textDecoration: 'line-through', opacity: 0.65 } : {}),
    }),
    textarea: {
      width: '100%',
      borderRadius: 12,
      border: '1px solid rgba(15,23,42,0.14)',
      padding: 10,
      fontSize: 15,
      fontWeight: 800,
      resize: 'vertical',
      background: 'rgba(255,255,255,0.98)',
    },
    actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' },
    btn: (variant) => ({
      border: '1px solid rgba(15,23,42,0.12)',
      background:
        variant === 'primary' ? 'linear-gradient(135deg, rgba(99,102,241,0.25), rgba(34,211,238,0.20))' :
        variant === 'danger' ? 'linear-gradient(135deg, rgba(244,63,94,0.20), rgba(251,113,133,0.14))' :
        'rgba(255,255,255,0.92)',
      padding: '8px 10px',
      borderRadius: 12,
      cursor: 'pointer',
      fontWeight: 900,
      fontSize: 12,
      boxShadow: '0 8px 18px rgba(15,23,42,0.06)',
    }),
    select: {
      padding: '8px 10px',
      borderRadius: 12,
      border: '1px solid rgba(15,23,42,0.14)',
      background: 'rgba(255,255,255,0.95)',
      fontWeight: 900,
      fontSize: 12,
    },
  };

  const Pill = ({ label, value, tone }) => (
    <span style={ui.pill(tone)}>
      <span style={ui.dot(tone)} />
      {label}: <span style={{ fontWeight: 900 }}>{value}</span>
    </span>
  );

  const pendientesCount = pedidosFiltrados.filter(p => (p.estado || 'Pendiente') === 'Pendiente').length;
  const preparandoCount = pedidosFiltrados.filter(p => p.estado === 'En preparación').length;
  const preparadosCount = pedidosFiltrados.filter(p => p.estado === 'Preparado').length;
  const canceladosCount = pedidosFiltrados.filter(p => p.estado === 'Cancelado').length;

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={ui.title}>Cocina</h2>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={ui.tabWrap}>
            <button style={ui.tabBtn(kitchenTab === 'delivery')} onClick={() => setKitchenTab('delivery')}>Delivery</button>
            <button style={ui.tabBtn(kitchenTab === 'ruta')} onClick={() => setKitchenTab('ruta')}>Ruta</button>
          </div>

          <div style={ui.pills}>
            <Pill label="Pendientes" value={pendientesCount} tone="info" />
            <Pill label="En preparación" value={preparandoCount} tone="warn" />
            <Pill label="Preparados" value={preparadosCount} tone="ok" />
            <Pill label="Cancelados" value={canceladosCount} tone="danger" />
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={pedidoSound} preload="auto" />

      {pedidosFiltrados.length === 0 ? (
        <p>No hay pedidos para hoy</p>
      ) : (
        <ul style={ui.list}>
          {pedidosFiltrados.map((p) => {
            const tone = stateTone(p.estado || 'Pendiente');
            const isEditing = editingId === p.firebaseKey;

            return (
              <li key={p.firebaseKey} style={ui.card(tone)}>
                <div style={ui.glow(tone)} />
                <div style={{ position: 'relative' }}>
                  <div style={ui.topRow}>
                    <div style={ui.id}>#{p.id}</div>
                    <div style={ui.meta}>
                      {kitchenTab === 'ruta' ? `Ruta: ${p.ruta || 'Sin ruta'}` : 'Delivery'} · {p.estado || 'Pendiente'}
                      {p.cocinero ? ` · ${p.cocinero}` : ''}
                    </div>
                  </div>

                  <p style={ui.name}>
                    {p.cliente} <span style={{ fontSize: 12, opacity: 0.7 }}>({p.clienteCodigo || '-'})</span>
                  </p>

                  {p.direccion && (
                    <div style={ui.sub}><strong>Dir:</strong> {p.direccion}</div>
                  )}

                  {/* PEDIDO GRANDE */}
                  <div style={ui.pedidoBox}>
                    <div style={ui.pedidoLabel}>Pedido</div>

                    {isEditing ? (
                      <>
                        <textarea
                          rows={4}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={ui.textarea}
                        />
                        <div style={ui.actions}>
                          <button
                            style={ui.btn('primary')}
                            onClick={() => { updateCampo(p.firebaseKey, 'pedido', editText); setEditingId(null); }}
                          >
                            Guardar
                          </button>
                          <button
                            style={ui.btn()}
                            onClick={() => setEditingId(null)}
                          >
                            Cancelar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <pre style={ui.pedidoText((p.estado || '') === 'Cancelado')}>{p.pedido}</pre>
                        <div style={ui.actions}>
                          <button style={ui.btn()} onClick={() => { setEditingId(p.firebaseKey); setEditText(p.pedido || ''); }}>
                            ✏️ Editar
                          </button>

                          {(p.estado || 'Pendiente') === 'Pendiente' && (
                            <>
                              <select style={ui.select} onChange={(e) => handleSelectCocinero(p.firebaseKey, e.target.value)} defaultValue="">
                                <option value="" disabled>Seleccionar cocinero...</option>
                                {cocineros.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                              <button style={ui.btn('danger')} onClick={() => updateCampo(p.firebaseKey, 'estado', 'Cancelado')}>
                                ❌ Cancelar
                              </button>
                            </>
                          )}

                          {p.estado === 'En preparación' && (
                            <>
                              <button style={ui.btn('primary')} onClick={() => marcarPreparado(p.firebaseKey)}>
                                ✅ Listo
                              </button>
                              <button style={ui.btn('danger')} onClick={() => updateCampo(p.firebaseKey, 'estado', 'Cancelado')}>
                                ❌ Cancelar
                              </button>
                            </>
                          )}

                          {p.estado === 'Preparado' && (
                            <>
                              <button style={ui.btn()} onClick={() => updateCampo(p.firebaseKey, 'estado', 'Pendiente')}>
                                ↩️ Deshacer
                              </button>
                              <button style={ui.btn('danger')} onClick={() => updateCampo(p.firebaseKey, 'estado', 'Cancelado')}>
                                ❌ Cancelar
                              </button>
                            </>
                          )}

                          {p.estado === 'Cancelado' && (
                            <button style={ui.btn('primary')} onClick={() => updateCampo(p.firebaseKey, 'estado', 'Pendiente')}>
                              ↩️ Deshacer cancelación
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


/******************** EXPORTAR A EXCEL ********************/
function exportarAExcel(pedidos) {
  const rows = pedidos
    .filter(p => p.estado !== 'Cancelado')
    .map(p => [
      p.fecha,
      p.id,
      p.cliente,
      p.clienteCodigo || '-',
      p.direccion || '-',
      (p.pedido || '').replace(/\n/g, ' '),
      p.estado,
      p.timestampIngreso || '-',
      p.timestampPreparacion || '-',
      p.timestampPreparado || '-',
      p.timestampEnviado || '-',
      p.cocinero || '-',
      p.repartidor || '-'
    ]);

  const header = [
    'Fecha', '#', 'Cliente', 'Código Cliente', 'Dirección', 'Pedido', 'Estado',
    'Ingreso', 'Preparación', 'Preparado', 'Enviado',
    'Cocinero', 'Repartidor'
  ];

  let htmlContent = '<table border="1"><tr>' + header.map(col => `<th>${col}</th>`).join('') + '</tr>';

  rows.forEach(r => {
    htmlContent += '<tr>' + r.map(val => `<td>${val}</td>`).join('') + '</tr>';
  });
  htmlContent += '</table>';

  const blob = new Blob([htmlContent], { type: 'application/vnd.ms-excel' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'historial_pedidos.xls';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/******************** ANTERIORES ********************/
function Anteriores({ pedidos }) {
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const pedidosFiltrados = pedidos
    .filter(p => p.estado !== 'Cancelado')
    .filter(p => {
      if (!fechaInicio && !fechaFin) return true;
      const fechaPedido = new Date(p.fecha);
      const inicio = fechaInicio ? new Date(fechaInicio) : null;
      const fin = fechaFin ? new Date(fechaFin) : null;
      return (!inicio || fechaPedido >= inicio) && (!fin || fechaPedido <= fin);
    });

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos Anteriores</h2>

      <div style={{ marginBottom: 10 }}>
        <label>Desde:</label>
        <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ margin: '0 10px', padding: 5 }} />
        <label>Hasta:</label>
        <input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} style={{ margin: '0 10px', padding: 5 }} />
        <button onClick={() => exportarAExcel(pedidosFiltrados)} style={{ marginLeft: 20, padding: '6px 12px', fontSize: '14px' }}>
          Descargar como Excel
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }} border="1">
        <thead>
          <tr>
            <th>Fecha</th><th>#</th><th>Cliente</th><th>Código</th><th>Dirección</th><th>Pedido</th><th>Estado</th>
            <th>Ingreso</th><th>Preparación</th><th>Preparado</th><th>Enviado</th><th>Cocinero</th><th>Repartidor</th>
          </tr>
        </thead>
        <tbody>
          {pedidosFiltrados.map(({ id, cliente, clienteCodigo, direccion, pedido, estado, cocinero, repartidor, timestampIngreso, timestampPreparacion, timestampPreparado, timestampEnviado, fecha }) => (
            <tr key={`${fecha}-${id}`}>
              <td>{fecha}</td>
              <td>{id}</td>
              <td>{cliente}</td>
              <td>{clienteCodigo || '-'}</td>
              <td>{direccion || '-'}</td>
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

/******************** CLIENTES: CARGA MASIVA + EDICIÓN ********************/
function ClientesManager({ clientes }) {
  const [editBuffer, setEditBuffer] = useState({});
  const [uploading, setUploading] = useState(false);
  const [csvFile, setCsvFile] = useState(null);

  const stripBOM = (s = '') => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);
  const normalize = (s = '') => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

  const splitLine = (line, delim) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delim && !inQuotes) { out.push(cur); cur = ''; }
      else { cur += ch; }
    }
    out.push(cur);
    return out.map(s => s.trim());
  };

  const cargarCSV = async () => {
    if (!csvFile) { alert('Primero seleccioná un archivo CSV.'); return; }
    setUploading(true);
    try {
      const textRaw = await csvFile.text();
      const text = stripBOM(textRaw);
      const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim().length > 0);
      if (!lines.length) { alert('El archivo está vacío.'); return; }

      const first = lines[0];
      const delim = ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) ? ';' : ',';

      const header = splitLine(first, delim).map(h => normalize(h));
      const idxNombre = header.findIndex(h => ['nombre','cliente','cliente nombre','nombre cliente','razon social','razon','name'].some(k => h.includes(k)));
      const idxCodigo = header.findIndex(h => ['codigo','código','cod','id','codigo cliente','código cliente','client code'].some(k => h.includes(k)));
      const idxDireccion = header.findIndex(h => ['direccion','dirección','domicilio','direccion cliente','address','addr'].some(k => h.includes(k)));

      let start = 1;
      let map = { nombre: 0, codigo: 1, direccion: 2 };
      const hasHeader = idxNombre !== -1 || idxCodigo !== -1 || idxDireccion !== -1;
      if (hasHeader) {
        if (idxNombre !== -1) map.nombre = idxNombre;
        if (idxCodigo !== -1) map.codigo = idxCodigo;
        if (idxDireccion !== -1) map.direccion = idxDireccion;
      } else {
        start = 0;
      }

      let ok = 0, omitidos = 0;
      for (let i = start; i < lines.length; i++) {
        const parts = splitLine(lines[i], delim).map(s => s.replace(/^"|"$/g, ''));
        const nombre = (parts[map.nombre] || '').trim();
        const codigo = (parts[map.codigo] || '').trim();
        const direccion = (parts[map.direccion] || '').trim();
        if (!nombre || !codigo || !direccion) { omitidos++; continue; }

        try {
          const nuevoRef = push(ref(database, 'clients'));
          await set(nuevoRef, { nombre, codigo, direccion });
          ok++;
        } catch (innerErr) {
          console.error('Error en fila', i + 1, innerErr);
          omitidos++;
        }
      }

      alert(`Carga masiva: ${ok} agregados, ${omitidos} omitidos.`);
      setCsvFile(null);
    } catch (err) {
      console.error('Error leyendo CSV:', err);
      alert('Error leyendo CSV: ' + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (key, field, value) => {
    setEditBuffer(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const handleSave = async (c) => {
    const payload = editBuffer[c.firebaseKey] || { nombre: c.nombre, codigo: c.codigo, direccion: c.direccion };
    await update(ref(database, `clients/${c.firebaseKey}`), payload);
    setEditBuffer(prev => { const cp = { ...prev }; delete cp[c.firebaseKey]; return cp; });
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Clientes</h2>
      <p>Subí un CSV (nombre,codigo,direccion). Elegí archivo y luego hacé clic en “Cargar CSV”.</p>
      <input
        type="file"
        accept=".csv,text/csv,.txt"
        onChange={(e) => setCsvFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
      />
      <button type="button" onClick={cargarCSV} disabled={uploading || !csvFile} style={{ marginLeft: 8 }}>
        {uploading ? 'Cargando…' : 'Cargar CSV'}
      </button>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, marginTop: 12 }} border="1">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Código</th>
            <th>Dirección</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map(c => {
            return (
              <tr key={c.firebaseKey}>
                <td>
                  <input
                    defaultValue={c.nombre}
                    onChange={(e) => handleChange(c.firebaseKey, 'nombre', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    defaultValue={c.codigo}
                    onChange={(e) => handleChange(c.firebaseKey, 'codigo', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    defaultValue={c.direccion}
                    onChange={(e) => handleChange(c.firebaseKey, 'direccion', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </td>
                <td>
                  <button onClick={() => handleSave(c)}>Guardar</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/******************** BASE DE DATOS: Pedidos Ruta (Admin) ********************/
function PedidosRutaDBAdmin() {
  const [fecha, setFecha] = useState(hoyISO());
  const [data, setData] = useState([]);
  const [editingKey, setEditingKey] = useState(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    const rutaRef = ref(database, 'rutaOrders');

    return onValue(
      rutaRef,
      (snapshot) => {
        const raw = snapshot.val();
        if (!raw) { setData([]); return; }

        const arr = Object.entries(raw)
          .map(([key, val]) => ({ firebaseKey: key, ...val }))
          .filter((p) => p.fecha === fecha)
          .sort((a, b) => (a.id || 0) - (b.id || 0));

        setData(arr);
      },
      (err) => console.error('Error leyendo rutaOrders admin:', err)
    );
  }, [fecha]);

  const guardarPedido = async (firebaseKey) => {
    await update(ref(database, `rutaOrders/${firebaseKey}`), { pedido: editText });
    setEditingKey(null);
    setEditText('');
  };

  const eliminarPedido = async (p) => {
    const ok = window.confirm(`¿Eliminar pedido Ruta #${p.id}?`);
    if (!ok) return;
    await remove(ref(database, `rutaOrders/${p.firebaseKey}`));
  };

  const borrarOrden = async (p) => {
    await update(ref(database, `rutaOrders/${p.firebaseKey}`), { ordenRuta: 0 });
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Pedidos Ruta (Base de datos)</h2>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <label>Fecha:</label>
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <span style={{ fontSize: 12, color: '#666' }}>Total: <strong>{data.length}</strong></span>
      </div>

      {data.length === 0 ? (
        <p>No hay pedidos Ruta en esa fecha.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {data.map((p) => {
            const isEditing = editingKey === p.firebaseKey;
            return (
              <li key={p.firebaseKey} style={{ background: 'white', border: '1px solid #ddd', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      #{p.id} — {p.cliente} — {p.clienteCodigo || '-'}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <strong>Ruta:</strong> {p.ruta || 'Sin ruta'} · <strong>Orden:</strong> {p.ordenRuta || 0} · <strong>Estado:</strong> {p.estado || 'Pendiente'}
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <strong>Dirección:</strong> {p.direccion || '-'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => borrarOrden(p)}>Borrar orden</button>
                    <button
                      type="button"
                      onClick={() => eliminarPedido(p)}
                      style={{ backgroundColor: '#ffe5e5', border: '1px solid #ffb3b3' }}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <strong>Pedido:</strong>
                  {isEditing ? (
                    <>
                      <textarea
                        rows={3}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{ width: '100%', marginTop: 6 }}
                      />
                      <div style={{ marginTop: 6 }}>
                        <button type="button" onClick={() => guardarPedido(p.firebaseKey)}>Guardar</button>
                        <button type="button" onClick={() => { setEditingKey(null); setEditText(''); }} style={{ marginLeft: 8 }}>
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{p.pedido}</pre>
                      <button type="button" onClick={() => { setEditingKey(p.firebaseKey); setEditText(p.pedido || ''); }}>
                        ✏️ Editar
                      </button>
                    </>
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

/******************** BASE DE DATOS VIEW ********************/
function BaseDatosView({ clientes, anteriores }) {
  const [section, setSection] = useState('clientes'); // clientes | anteriores | ruta

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, padding: 0 }}>
      <div style={{ border: '1px solid #ddd', borderRadius: 10, padding: 12, background: 'white', height: 'calc(100vh - 210px)', overflow: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Base de datos</h3>
        <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setSection('clientes')} disabled={section === 'clientes'}>
          Clientes
        </button>
        <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setSection('anteriores')} disabled={section === 'anteriores'}>
          Anteriores
        </button>
        <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setSection('ruta')} disabled={section === 'ruta'}>
          Pedidos Ruta
        </button>
      </div>

      <div style={{ border: '1px solid #ddd', borderRadius: 10, background: 'white', height: 'calc(100vh - 210px)', overflow: 'auto' }}>
        {section === 'clientes' && <ClientesManager clientes={clientes} />}
        {section === 'anteriores' && <Anteriores pedidos={anteriores} />}
        {section === 'ruta' && <PedidosRutaDBAdmin />}
      </div>
    </div>
  );
}

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
          const fecha = val.fecha;
          if (!acc[fecha]) acc[fecha] = [];
          acc[fecha].push({ firebaseKey: key, ...val });
          return acc;
        }, {});

        const pedidosHoy = (grouped[today] || []).sort((a, b) => (a.id || 0) - (b.id || 0));
        const prev = Object.entries(grouped)
          .filter(([fecha]) => fecha !== today)
          .flatMap(([fecha, arr]) => arr.map((p, idx) => ({ ...p, fecha, id: p.id || idx + 1 })));

        setOrders(pedidosHoy);
        setAnteriores(prev);
      } else {
        setOrders([]);
        setAnteriores([]);
      }
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

  const getNextOrderId = () => {
    const maxId = orders.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0;
    return maxId + 1;
  };

  const addOrder = ({ cliente, clienteCodigo, direccion, pedido, fecha, hora, id }) => {
    const timestamp = new Date().toLocaleTimeString();
    push(ref(database, 'orders'), {
      cliente,
      clienteCodigo,
      direccion,
      pedido,
      estado: 'Pendiente',
      fecha,
      id,
      timestampIngreso: timestamp,
      justAdded: true
    });
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      update(ref(database, `orders/${order.firebaseKey}`), {
        estado: 'Enviado',
        repartidor,
        timestampEnviado: new Date().toLocaleTimeString()
      });
    }
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

          {/* Nuevo: Base de datos contiene Clientes + Anteriores + Ruta */}
          <button onClick={() => setView('basedatos')} disabled={view === 'basedatos'}>Base de datos</button>

          {/* Opcional: mantener acceso directo a Pedidos Ruta (módulo operativo) */}
          <button onClick={() => setView('ruta')} disabled={view === 'ruta'}>Pedidos Ruta</button>
        </div>
      </header>

      {view === 'ingreso' && <OrderForm onAddOrder={addOrder} nextOrderId={getNextOrderId()} clientes={clientes} />}
      {view === 'cocina' && <KitchenView orders={orders} />}
      {view === 'lista' && <ListaPedidos pedidos={orders} onEnviarPedido={handleEnviarPedido} />}

      {view === 'basedatos' && <BaseDatosView clientes={clientes} anteriores={anteriores} />}

      {view === 'ruta' && <PedidosRuta clientes={clientes} />}
    </div>
  );
}

export default App;
