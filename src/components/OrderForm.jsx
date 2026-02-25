import React, { useState, useEffect } from 'react';
import { ref, push, set } from 'firebase/database';
import { database } from '../firebase';
import logo from '../logo.svg';
import { normalizar } from './Utils';

export default function OrderForm({ onAddOrder, nextOrderId, clientes }) {
   const [clienteInput, setClienteInput] = useState('');
  const [pedido, setPedido] = useState('');
  const [customId, setCustomId] = useState(nextOrderId);
  const [selectedClient, setSelectedClient] = useState(null);

  const [showNewClient, setShowNewClient] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', codigo: '', direccion: '' });
  const [savingClient, setSavingClient] = useState(false);

  const [metodoPago, setMetodoPago] = useState('Efectivo');

  useEffect(() => setCustomId(nextOrderId), [nextOrderId]);

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

    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString();

    onAddOrder({
      cliente: selectedClient.nombre,
      clienteCodigo: selectedClient.codigo || '-',
      direccion: selectedClient.direccion || '-',
      pedido,
      fecha,
      hora,
      id: customId,
      metodoPago
    });

    setClienteInput('');
    setSelectedClient(null);
    setPedido('');
    setMetodoPago('Efectivo');
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

  const ui = {
    page: {
      borderRadius: 18,
      overflow: 'hidden',
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'linear-gradient(180deg, rgba(255,226,0,0.22), rgba(255,255,255,0.92) 40%, rgba(255,255,255,0.92))',
      boxShadow: '0 18px 50px rgba(15,23,42,0.10)',
    },
    hero: {
      padding: 18,
      background: 'linear-gradient(135deg, rgba(220,38,38,0.95), rgba(245,158,11,0.85))',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      flexWrap: 'wrap',
    },
    brand: { display: 'flex', alignItems: 'center', gap: 14 },
    logoWrap: {
      width: 84,
      height: 84,
      borderRadius: 20,
      background: 'rgba(255,255,255,0.16)',
      border: '1px solid rgba(255,255,255,0.30)',
      display: 'grid',
      placeItems: 'center',
      boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
    },
    logo: { width: 64, height: 64, objectFit: 'contain', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.25))' },
    h1: { margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
    subtitle: { margin: '4px 0 0 0', opacity: 0.92, fontWeight: 700, fontSize: 13 },
    body: { padding: 18 },
    grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
    card: {
      borderRadius: 16,
      border: '1px solid rgba(15,23,42,0.10)',
      background: 'rgba(255,255,255,0.92)',
      boxShadow: '0 10px 22px rgba(15,23,42,0.06)',
      padding: 14,
    },
    cardTitle: { margin: '0 0 10px 0', fontSize: 13, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.75 },
    label: { display: 'block', fontWeight: 900, fontSize: 12, letterSpacing: 0.4, opacity: 0.85, marginBottom: 6 },
    input: {
      width: '100%',
      padding: '12px 12px',
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.14)',
      background: 'rgba(255,255,255,0.98)',
      fontSize: 16,
      fontWeight: 800,
      outline: 'none',
    },
    textarea: {
      width: '100%',
      padding: 12,
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.14)',
      background: 'rgba(255,255,255,0.98)',
      fontSize: 16,
      fontWeight: 800,
      resize: 'vertical',
      outline: 'none',
    },
    select: {
      width: '100%',
      padding: '12px 12px',
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.14)',
      background: 'rgba(255,255,255,0.98)',
      fontSize: 16,
      fontWeight: 900,
      outline: 'none',
    },
    hint: { fontSize: 12, opacity: 0.7, marginTop: 6, fontWeight: 700 },
    bigBtn: {
      width: '100%',
      padding: '14px 14px',
      borderRadius: 16,
      border: 'none',
      cursor: 'pointer',
      fontSize: 16,
      fontWeight: 900,
      letterSpacing: 0.2,
      background: 'linear-gradient(135deg, rgba(220,38,38,1), rgba(245,158,11,0.95))',
      color: 'white',
      boxShadow: '0 16px 32px rgba(220,38,38,0.22)',
    },
    smallBtn: (variant) => ({
      padding: '10px 12px',
      borderRadius: 14,
      border: '1px solid rgba(15,23,42,0.14)',
      background:
        variant === 'danger' ? 'linear-gradient(135deg, rgba(244,63,94,0.18), rgba(251,113,133,0.12))' :
        variant === 'primary' ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.10))' :
        'rgba(255,255,255,0.95)',
      cursor: 'pointer',
      fontWeight: 900,
      fontSize: 13,
    }),
    dropdown: {
      position: 'absolute',
      top: '100%',
      left: 0,
      right: 0,
      background: 'white',
      border: '1px solid rgba(15,23,42,0.12)',
      borderRadius: 14,
      listStyle: 'none',
      margin: 0,
      padding: 6,
      zIndex: 50,
      maxHeight: 260,
      overflowY: 'auto',
      boxShadow: '0 18px 40px rgba(15,23,42,0.10)',
    },
    dropdownItem: {
      padding: '10px 10px',
      borderRadius: 12,
      cursor: 'pointer',
      border: '1px solid transparent',
    },
    dropdownItemHover: {
      background: 'rgba(245,158,11,0.12)',
      border: '1px solid rgba(245,158,11,0.25)',
    },
    selectedBox: {
      borderRadius: 16,
      border: '1px solid rgba(34,197,94,0.22)',
      background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(255,255,255,0.92))',
      padding: 12,
      marginTop: 10,
    },
    selectedTitle: { fontWeight: 900, marginBottom: 6 },
    kv: { fontSize: 13, fontWeight: 800, opacity: 0.9, lineHeight: 1.35 },
    full: { gridColumn: '1 / -1' }
  };

  const [hoverIdx, setHoverIdx] = useState(-1);

  return (
    <div style={ui.page}>
      <div style={ui.hero}>
        <div style={ui.brand}>
          <div style={ui.logoWrap}>
            <img src={logo} alt="Logo" style={ui.logo} />
          </div>
          <div>
            <h2 style={ui.h1}>Ingreso de Pedidos</h2>
            <div style={ui.subtitle}>Delivery · Rápido · Claro · Sin errores</div>
          </div>
        </div>
        <div style={{ fontWeight: 900, opacity: 0.95 }}>
          Pedido #{customId}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={ui.body}>
        <div style={ui.grid}>
          <div style={ui.card}>
            <div style={ui.cardTitle}>Pedido</div>
            <label style={ui.label}>Número de pedido</label>
            <input
              type="number"
              value={customId}
              onChange={(e) => setCustomId(parseInt(e.target.value || '1', 10))}
              min={1}
              max={100}
              style={ui.input}
            />
            <div style={ui.hint}>Recomendado: automático (siguiente número del día).</div>
            <div style={{ marginTop: 12 }}>
              <label style={ui.label}>Método de pago</label>
              <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} style={ui.select}>
                <option>Efectivo</option>
                <option>POS BAC</option>
                <option>POS BANPRO</option>
                <option>POS LAFISE</option>
                <option>LINK DE PAGO</option>
                <option>TRANSFERENCIA</option>
                <option>CREDITO</option>
              </select>
            </div>
          </div>

          <div style={ui.card}>
            <div style={ui.cardTitle}>Cliente</div>
            <label style={ui.label}>Buscar cliente</label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder="Escribí y elegí de la lista"
                value={clienteInput}
                onChange={(e) => {
                  setClienteInput(e.target.value);
                  setSelectedClient(null);
                }}
                style={ui.input}
                required
                autoComplete="off"
              />
              {clienteInput && !selectedClient && sugerencias.length > 0 && (
                <ul style={ui.dropdown}>
                  {sugerencias.map((c, idx) => (
                    <li
                      key={c.firebaseKey}
                      onMouseEnter={() => setHoverIdx(idx)}
                      onMouseLeave={() => setHoverIdx(-1)}
                      onClick={() => handleSelectCliente(c)}
                      style={{
                        ...ui.dropdownItem,
                        ...(hoverIdx === idx ? ui.dropdownItemHover : {})
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>{c.nombre}</div>
                      <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 700 }}>
                        Código: {c.codigo} · Dirección: {c.direccion}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedClient ? (
              <div style={ui.selectedBox}>
                <div style={ui.selectedTitle}>Cliente seleccionado</div>
                <div style={ui.kv}>Nombre: {selectedClient.nombre}</div>
                <div style={ui.kv}>Código: {selectedClient.codigo}</div>
                <div style={ui.kv}>Dirección: {selectedClient.direccion}</div>
                <div style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setSelectedClient(null); setClienteInput(''); }}
                    style={ui.smallBtn('danger')}
                  >
                    Cambiar cliente
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowNewClient(v => !v)}
                  style={ui.smallBtn(showNewClient ? 'danger' : 'primary')}
                >
                  {showNewClient ? 'Cancelar nuevo cliente' : '➕ Agregar cliente nuevo'}
                </button>

                {showNewClient && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    <input
                      placeholder="Nombre"
                      value={nuevoCliente.nombre}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
                      style={ui.input}
                    />
                    <input
                      placeholder="Código"
                      value={nuevoCliente.codigo}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, codigo: e.target.value })}
                      style={ui.input}
                    />
                    <input
                      placeholder="Dirección"
                      value={nuevoCliente.direccion}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
                      style={ui.input}
                    />
                    <button type="button" onClick={guardarNuevoCliente} disabled={savingClient} style={ui.smallBtn('primary')}>
                      {savingClient ? 'Guardando…' : 'Guardar cliente'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ ...ui.card, ...ui.full }}>
            <div style={ui.cardTitle}>Detalle del pedido</div>
            <label style={ui.label}>Pedido</label>
            <textarea
              rows={6}
              placeholder="Escribí el pedido aquí"
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              style={ui.textarea}
              required
            />
            <div style={{ marginTop: 12 }}>
              <button type="submit" style={ui.bigBtn}>
                ✅ Agregar Pedido
              </button>
            </div>
            <div style={ui.hint}>
              Tip: Escribí el pedido por líneas (ej: “2 lb lomo”, “1 lb molida”, “1 bolsa hielo”).
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}