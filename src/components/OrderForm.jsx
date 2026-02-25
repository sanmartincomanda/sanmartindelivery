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
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => setCustomId(nextOrderId), [nextOrderId]);

  const sugerencias = clientes
    .filter(c => normalizar(c.nombre || '').includes(normalizar(clienteInput)))
    .slice(0, 6);

  const handleSelectCliente = (c) => {
    setSelectedClient(c);
    setClienteInput(c.nombre);
    setShowNewClient(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!pedido.trim()) return;

    if (!selectedClient) {
      alert('Seleccioná un cliente de la lista (o agregá uno nuevo).');
      return;
    }

    setIsSubmitting(true);

    const fecha = new Date().toISOString().slice(0, 10);
    const hora = new Date().toLocaleTimeString();

    await onAddOrder({
      cliente: selectedClient.nombre,
      clienteCodigo: selectedClient.codigo || '-',
      direccion: selectedClient.direccion || '-',
      pedido,
      fecha,
      hora,
      id: customId,
      metodoPago
    });

    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 2000);

    setClienteInput('');
    setSelectedClient(null);
    setPedido('');
    setMetodoPago('Efectivo');
    setCustomId((prev) => Math.min(prev + 1, 100));
    setIsSubmitting(false);
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
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      padding: '24px',
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      color: '#f8fafc'
    }}>
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-5px); }
          75% { transform: translateX(5px); }
        }
        @keyframes successPop {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-slideIn { animation: slideIn 0.5s ease-out; }
        .animate-slideUp { animation: slideUp 0.5s ease-out; }
        .animate-pulse { animation: pulse 2s infinite; }
        .animate-shake { animation: shake 0.5s ease-in-out; }
        .animate-success { animation: successPop 0.4s ease-out; }
        .btn-hover { transition: all 0.2s ease; }
        .btn-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .btn-hover:active { transform: translateY(0); }
        .input-focus { transition: all 0.2s ease; }
        .input-focus:focus { transform: scale(1.01); }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
      `}</style>

      {/* Header */}
      <div className="animate-slideIn" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 30px rgba(245, 158, 11, 0.4)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <img src={logo} alt="Logo" style={{ width: '44px', height: '44px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)',
              animation: 'slideIn 2s infinite'
            }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Nuevo Pedido
            </h1>
            <p style={{ margin: '4px 0 0 0', opacity: 0.6, fontSize: '15px', fontWeight: 500 }}>
              Sistema de gestión de delivery
            </p>
          </div>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 24px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <span style={{ fontSize: '14px', opacity: 0.6, fontWeight: 600 }}>Pedido #</span>
          <span style={{ 
            fontSize: '28px', 
            fontWeight: 900, 
            color: '#f59e0b',
            fontFamily: 'monospace'
          }}>
            {String(customId).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Success Message */}
      {showSuccess && (
        <div className="animate-success" style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          color: 'white',
          padding: '32px 48px',
          borderRadius: '24px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
          zIndex: 1000,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>✅</div>
          <div style={{ fontSize: '24px', fontWeight: 800 }}>¡Pedido Enviado!</div>
          <div style={{ fontSize: '16px', opacity: 0.9, marginTop: '8px' }}>
            Enviado a cocina exitosamente
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
        
        {/* Top Row - Order Info & Client */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
          gap: '20px'
        }}>
          {/* Order Info Card */}
          <div className="animate-slideUp card-hover" style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#f59e0b'
            }}>
              <span style={{ fontSize: '16px' }}>📋</span>
              Información del Pedido
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.6)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Número de Pedido
              </label>
              <input
                type="number"
                value={customId}
                onChange={(e) => setCustomId(parseInt(e.target.value || '1', 10))}
                min={1}
                max={100}
                className="input-focus"
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  borderRadius: '16px',
                  border: '2px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.2)',
                  color: 'white',
                  fontSize: '20px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
              />
              <div style={{ fontSize: '12px', opacity: 0.5, marginTop: '8px', fontWeight: 500 }}>
                Se asigna automáticamente al siguiente disponible
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 700,
                color: 'rgba(255,255,255,0.6)',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Método de Pago
              </label>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px'
              }}>
                {['Efectivo', 'POS BAC', 'POS BANPRO', 'POS LAFISE', 'LINK DE PAGO', 'TRANSFERENCIA', 'CREDITO'].map((metodo) => (
                  <button
                    key={metodo}
                    type="button"
                    onClick={() => setMetodoPago(metodo)}
                    className="btn-hover"
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid',
                      borderColor: metodoPago === metodo ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                      background: metodoPago === metodo ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: metodoPago === metodo ? '#f59e0b' : 'rgba(255,255,255,0.7)',
                      fontWeight: metodoPago === metodo ? 800 : 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {metodo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Client Card */}
          <div className="animate-slideUp card-hover" style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
            animationDelay: '0.1s'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#3b82f6'
            }}>
              <span style={{ fontSize: '16px' }}>👤</span>
              Cliente
            </div>

            {!selectedClient ? (
              <div>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder="Buscar cliente por nombre..."
                    value={clienteInput}
                    onChange={(e) => {
                      setClienteInput(e.target.value);
                      setSelectedClient(null);
                    }}
                    className="input-focus"
                    style={{
                      width: '100%',
                      padding: '16px 20px 16px 48px',
                      borderRadius: '16px',
                      border: '2px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.2)',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: 600,
                      outline: 'none'
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    left: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '20px',
                    opacity: 0.5
                  }}>🔍</span>
                  
                  {clienteInput && sugerencias.length > 0 && (
                    <div style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      left: 0,
                      right: 0,
                      background: '#1e293b',
                      borderRadius: '16px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                      zIndex: 50,
                      overflow: 'hidden'
                    }}>
                      {sugerencias.map((c, idx) => (
                        <div
                          key={c.firebaseKey}
                          onMouseEnter={() => setHoverIdx(idx)}
                          onMouseLeave={() => setHoverIdx(-1)}
                          onClick={() => handleSelectCliente(c)}
                          style={{
                            padding: '16px 20px',
                            cursor: 'pointer',
                            background: hoverIdx === idx ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                            {c.nombre}
                          </div>
                          <div style={{ fontSize: '13px', opacity: 0.6, fontWeight: 500 }}>
                            Código: {c.codigo} • {c.direccion}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewClient(v => !v)}
                  className="btn-hover"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    border: '2px dashed rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: showNewClient ? '#ef4444' : 'rgba(255,255,255,0.8)',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {showNewClient ? '❌ Cancelar' : '➕ Crear cliente nuevo'}
                </button>

                {showNewClient && (
                  <div className="animate-slideUp" style={{
                    marginTop: '16px',
                    padding: '20px',
                    background: 'rgba(0,0,0,0.2)',
                    borderRadius: '16px',
                    display: 'grid',
                    gap: '12px'
                  }}>
                    <input
                      placeholder="Nombre completo"
                      value={nuevoCliente.nombre}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, nombre: e.target.value })}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                    <input
                      placeholder="Código de cliente"
                      value={nuevoCliente.codigo}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, codigo: e.target.value })}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                    <input
                      placeholder="Dirección completa"
                      value={nuevoCliente.direccion}
                      onChange={(e) => setNuevoCliente({ ...nuevoCliente, direccion: e.target.value })}
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={guardarNuevoCliente}
                      disabled={savingClient}
                      className="btn-hover"
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: savingClient ? 'not-allowed' : 'pointer',
                        opacity: savingClient ? 0.7 : 1
                      }}
                    >
                      {savingClient ? '💾 Guardando...' : '✅ Guardar Cliente'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-success" style={{
                background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%)',
                borderRadius: '16px',
                padding: '20px',
                border: '2px solid rgba(34, 197, 94, 0.3)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: 600, marginBottom: '4px' }}>
                      CLIENTE SELECCIONADO
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#4ade80' }}>
                      {selectedClient.nombre}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedClient(null); setClienteInput(''); }}
                    className="btn-hover"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Cambiar
                  </button>
                </div>
                
                <div style={{ display: 'grid', gap: '8px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    <span style={{ opacity: 0.6 }}>Código:</span>
                    <span style={{ 
                      background: 'rgba(255,255,255,0.1)',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      fontFamily: 'monospace'
                    }}>
                      {selectedClient.codigo}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    fontSize: '14px',
                    fontWeight: 600
                  }}>
                    <span style={{ opacity: 0.6 }}>📍</span>
                    <span>{selectedClient.direccion}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Order Details - Full Width */}
        <div className="animate-slideUp card-hover" style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '24px',
          padding: '24px',
          border: '1px solid rgba(255,255,255,0.1)',
          backdropFilter: 'blur(10px)',
          animationDelay: '0.2s'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '20px',
            fontSize: '12px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: '#10b981'
          }}>
            <span style={{ fontSize: '16px' }}>📝</span>
            Detalle del Pedido
          </div>

          <textarea
            placeholder="Escribí el pedido aquí...
            
Ejemplo:
• 2 lb Lomo de res
• 1 lb Molida especial
• 3 lb Pechuga de pollo
• 1 Bolsa de hielo 5kg"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            className="input-focus"
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '24px',
              borderRadius: '20px',
              border: '2px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              color: 'white',
              fontSize: '20px',
              fontWeight: 600,
              lineHeight: '1.6',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit'
            }}
            required
          />

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '20px',
            flexWrap: 'wrap',
            gap: '16px'
          }}>
            <div style={{ fontSize: '14px', opacity: 0.6, fontWeight: 500 }}>
              💡 Tip: Usá viñetas para listar los productos claramente
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting || !selectedClient || !pedido.trim()}
              className="btn-hover"
              style={{
                padding: '20px 48px',
                borderRadius: '16px',
                border: 'none',
                background: isSubmitting 
                  ? 'rgba(255,255,255,0.1)' 
                  : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                fontWeight: 900,
                fontSize: '18px',
                cursor: (isSubmitting || !selectedClient || !pedido.trim()) ? 'not-allowed' : 'pointer',
                opacity: (isSubmitting || !selectedClient || !pedido.trim()) ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                boxShadow: isSubmitting ? 'none' : '0 10px 30px rgba(245, 158, 11, 0.4)'
              }}
            >
              {isSubmitting ? (
                <>
                  <span className="animate-pulse">⏳</span>
                  Enviando...
                </>
              ) : (
                <>
                  <span>🚀</span>
                  Enviar a Cocina
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}