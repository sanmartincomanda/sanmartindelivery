import React, { useState, useEffect, useRef } from 'react';
import { ref, onValue, update } from 'firebase/database';
import { database } from '../firebase';
import pedidoSound from '../pedido.mp3';
import { hoyISO } from './Utils';

// Iconos SVG inline
const Icons = {
  chef: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12M6 4v16a2 2 0 002 2h8a2 2 0 002-2V4M6 4L4 2m16 2l2-2M12 14v6m-4-4l4 4 4-4"/></svg>,
  clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
  check: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
  fire: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 002.5 2.5z"/></svg>,
  user: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  mapPin: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>,
  edit: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  cancel: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6m0-6l6 6"/></svg>,
  undo: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/></svg>,
  delivery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>,
  route: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
};

const STATUS_CONFIG = {
  'Pendiente': {
    color: '#3b82f6',
    bg: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
    border: '#60a5fa',
    icon: Icons.clock,
    label: 'Nuevo Pedido',
    pulse: true,
    shadow: '0 20px 40px -10px rgba(59, 130, 246, 0.3)'
  },
  'En preparación': {
    color: '#f59e0b',
    bg: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
    border: '#fbbf24',
    icon: Icons.fire,
    label: 'En Preparación',
    pulse: false,
    shadow: '0 20px 40px -10px rgba(245, 158, 11, 0.3)'
  },
  'Preparado': {
    color: '#10b981',
    bg: 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)',
    border: '#34d399',
    icon: Icons.check,
    label: 'Listo para Entregar',
    pulse: false,
    shadow: '0 20px 40px -10px rgba(16, 185, 129, 0.3)'
  },
  'Cancelado': {
    color: '#ef4444',
    bg: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
    border: '#f87171',
    icon: Icons.cancel,
    label: 'Cancelado',
    pulse: false,
    shadow: '0 20px 40px -10px rgba(239, 68, 68, 0.3)'
  }
};

export default function KitchenView({ orders }) {
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const audioRef = useRef(null);
  const [kitchenTab, setKitchenTab] = useState('delivery');
  const [rutaOrders, setRutaOrders] = useState([]);
  const [animatingCards, setAnimatingCards] = useState(new Set());

  useEffect(() => {
    const today = hoyISO();
    const rutaRef = ref(database, 'rutaOrders');
    return onValue(rutaRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setRutaOrders([]); return; }
      const arr = Object.entries(data)
        .map(([key, val]) => ({ firebaseKey: key, ...val }))
        .filter((p) => p.fecha === today)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setRutaOrders(arr);
    });
  }, []);

  const getBasePath = (tab) => (tab === 'ruta' ? 'rutaOrders' : 'orders');
  
  const updateCampo = (firebaseKey, campo, valor, tab = kitchenTab) => {
    const basePath = getBasePath(tab);
    update(ref(database, `${basePath}/${firebaseKey}`), { [campo]: valor });
  };

  const handleSelectCocinero = (firebaseKey, valor, tab = kitchenTab) => {
    if (!valor) return;
    const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const basePath = getBasePath(tab);
    
    setAnimatingCards(prev => new Set([...prev, firebaseKey]));
    setTimeout(() => setAnimatingCards(prev => {
      const next = new Set(prev);
      next.delete(firebaseKey);
      return next;
    }), 300);

    update(ref(database, `${basePath}/${firebaseKey}`), {
      cocinero: valor,
      estado: 'En preparación',
      timestampPreparacion: now,
      timestamp: Date.now()
    });
  };

  const marcarPreparado = (firebaseKey, tab = kitchenTab) => {
    const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const basePath = getBasePath(tab);
    
    setAnimatingCards(prev => new Set([...prev, firebaseKey]));
    setTimeout(() => setAnimatingCards(prev => {
      const next = new Set(prev);
      next.delete(firebaseKey);
      return next;
    }), 300);

    update(ref(database, `${basePath}/${firebaseKey}`), {
      estado: 'Preparado',
      timestampPreparado: now,
      timestamp: Date.now()
    });
  };

  useEffect(() => {
    if (kitchenTab !== 'delivery') return;
    if (audioRef.current && orders.length > 0) {
      const latestOrder = orders[orders.length - 1];
      const now = hoyISO();
      if (latestOrder.fecha === now && latestOrder.justAdded) {
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
    }
  }, [orders, kitchenTab]);

  const cocineros = [
    'Noel Hernandez', 'Julio Amador', 'Roberto Centeno', 
    'Michael Perez', 'Maria Gomez', 'Daniel Cruz', 
    'Noel Bendaña', 'Harvey Mora', 'Encargado Logistica', 'Otro'
  ];

  const currentOrdersRaw = kitchenTab === 'ruta' ? rutaOrders : orders;
  const pedidosFiltrados = [...currentOrdersRaw]
    .filter(o => o.estado !== 'Enviado')
    .sort((a, b) => {
      const order = { 'Pendiente': 0, 'En preparación': 1, 'Preparado': 2, 'Cancelado': 3 };
      return (order[a.estado] || 0) - (order[b.estado] || 0) || (b.timestamp || 0) - (a.timestamp || 0);
    });

  const stats = {
    pendientes: pedidosFiltrados.filter(p => (p.estado || 'Pendiente') === 'Pendiente').length,
    preparando: pedidosFiltrados.filter(p => p.estado === 'En preparación').length,
    preparados: pedidosFiltrados.filter(p => p.estado === 'Preparado').length,
    cancelados: pedidosFiltrados.filter(p => p.estado === 'Cancelado').length
  };

  const getTimeElapsed = (timestamp) => {
    if (!timestamp) return '';
    const diff = Math.floor((Date.now() - timestamp) / 60000);
    if (diff < 1) return 'Ahora';
    if (diff < 60) return `${diff}m`;
    return `${Math.floor(diff / 60)}h ${diff % 60}m`;
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
        @keyframes pulse-ring {
          0% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 0; }
          100% { transform: scale(1); opacity: 0.5; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes shake {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-5deg); }
          75% { transform: rotate(5deg); }
        }
        @keyframes highlight {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .card-enter {
          animation: slideIn 0.4s ease-out forwards;
        }
        .pulse-bg {
          animation: pulse-ring 2s ease-in-out infinite;
        }
        .shake-icon {
          animation: shake 0.5s ease-in-out infinite;
        }
        .btn-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.2);
        }
        .btn-active:active {
          transform: translateY(0);
        }
        .card-transition {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-transition:hover {
          transform: translateY(-4px);
        }
        .pedido-text {
          font-size: 22px !important;
          line-height: 1.6 !important;
          font-weight: 700 !important;
        }
        @media (min-width: 1400px) {
          .pedido-text {
            font-size: 26px !important;
          }
        }
      `}</style>

      <audio ref={audioRef} src={pedidoSound} preload="auto" />
      
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px',
        animation: 'slideIn 0.5s ease-out'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 10px 25px -5px rgba(245, 158, 11, 0.4)',
            color: 'white'
          }}>
            {Icons.chef}
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 800, letterSpacing: '-0.5px' }}>
              Cocina
            </h1>
            <p style={{ margin: 0, opacity: 0.6, fontSize: '14px', fontWeight: 500 }}>
              {new Date().toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          background: 'rgba(255,255,255,0.05)',
          padding: '6px',
          borderRadius: '16px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          {['delivery', 'ruta'].map((tab) => (
            <button
              key={tab}
              onClick={() => setKitchenTab(tab)}
              className="btn-hover btn-active"
              style={{
                padding: '12px 24px',
                borderRadius: '12px',
                border: 'none',
                background: kitchenTab === tab 
                  ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' 
                  : 'transparent',
                color: kitchenTab === tab ? 'white' : 'rgba(255,255,255,0.6)',
                fontWeight: 700,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.3s ease'
              }}
            >
              {tab === 'delivery' ? Icons.delivery : Icons.route}
              {tab === 'delivery' ? 'Delivery' : 'Ruta'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
        animation: 'slideIn 0.5s ease-out 0.1s both'
      }}>
        {[
          { label: 'Nuevos', value: stats.pendientes, color: '#3b82f6', icon: Icons.clock },
          { label: 'En Preparación', value: stats.preparando, color: '#f59e0b', icon: Icons.fire },
          { label: 'Listos', value: stats.preparados, color: '#10b981', icon: Icons.check },
          { label: 'Cancelados', value: stats.cancelados, color: '#ef4444', icon: Icons.cancel }
        ].map((stat, idx) => (
          <div
            key={stat.label}
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              padding: '20px',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              animation: `slideIn 0.5s ease-out ${0.1 + idx * 0.05}s both`
            }}
          >
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: `${stat.color}20`,
              color: stat.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {stat.icon}
            </div>
            <div>
              <div style={{ fontSize: '32px', fontWeight: 800, color: stat.color, lineHeight: 1 }}>
                {stat.value}
              </div>
              <div style={{ fontSize: '13px', opacity: 0.6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {stat.label}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Orders Grid */}
      {pedidosFiltrados.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          opacity: 0.5,
          animation: 'slideIn 0.5s ease-out'
        }}>
          <div style={{ fontSize: '64px', marginBottom: '16px' }}>👨‍🍳</div>
          <h3 style={{ fontSize: '24px', margin: 0 }}>No hay pedidos activos</h3>
          <p>Los nuevos pedidos aparecerán aquí automáticamente</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(450px, 1fr))',
          gap: '24px'
        }}>
          {pedidosFiltrados.map((pedido, index) => {
            const status = pedido.estado || 'Pendiente';
            const config = STATUS_CONFIG[status];
            const isEditing = editingId === pedido.firebaseKey;
            const isAnimating = animatingCards.has(pedido.firebaseKey);
            
            return (
              <div
                key={pedido.firebaseKey}
                className={`card-enter card-transition ${isAnimating ? 'card-transition' : ''}`}
                style={{
                  background: config.bg,
                  borderRadius: '28px',
                  border: `4px solid ${config.border}`,
                  overflow: 'hidden',
                  position: 'relative',
                  boxShadow: config.shadow,
                  transform: isAnimating ? 'scale(0.98)' : 'scale(1)',
                  opacity: isAnimating ? 0.8 : 1,
                  animationDelay: `${index * 0.05}s`
                }}
              >
                {/* Pulse animation for new orders */}
                {config.pulse && (
                  <div
                    className="pulse-bg"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: config.color,
                      opacity: 0.15,
                      pointerEvents: 'none'
                    }}
                  />
                )}

                <div style={{ padding: '28px', position: 'relative' }}>
                  {/* Header Compacto */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '16px',
                    borderBottom: `2px solid ${config.border}40`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div 
                        className={config.pulse ? 'shake-icon' : ''}
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '14px',
                          background: 'white',
                          color: config.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                        }}
                      >
                        {config.icon}
                      </div>
                      <div>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 14px',
                          borderRadius: '20px',
                          background: 'white',
                          color: config.color,
                          fontSize: '13px',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                        }}>
                          {config.label}
                        </div>
                        <div style={{ fontSize: '14px', opacity: 0.7, fontWeight: 600, marginTop: '4px' }}>
                          #{pedido.id} · {getTimeElapsed(pedido.timestamp)}
                          {pedido.cocinero && ` · 👨‍🍳 ${pedido.cocinero}`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cliente Info Minimalista */}
                  <div style={{ 
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap'
                  }}>
                    <span style={{ 
                      fontSize: '18px', 
                      fontWeight: 800,
                      color: '#1e293b'
                    }}>
                      {pedido.cliente}
                    </span>
                    <span style={{ 
                      fontSize: '13px', 
                      color: '#64748b',
                      fontWeight: 600,
                      background: 'rgba(255,255,255,0.6)',
                      padding: '4px 10px',
                      borderRadius: '8px'
                    }}>
                      {pedido.clienteCodigo || 'Sin código'}
                    </span>
                    {pedido.direccion && (
                      <span style={{ 
                        fontSize: '13px', 
                        color: '#475569',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {Icons.mapPin}
                        {pedido.direccion}
                      </span>
                    )}
                  </div>

                  {/* PEDIDO - LO MÁS IMPORTANTE - GRANDE Y VISIBLE */}
                  <div style={{
                    background: 'white',
                    borderRadius: '20px',
                    padding: '24px',
                    marginBottom: '20px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
                    border: `3px solid ${config.border}60`,
                    position: 'relative'
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '-12px',
                      left: '20px',
                      background: config.color,
                      color: 'white',
                      padding: '6px 16px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                    }}>
                      📝 Pedido
                    </div>
                    
                    {isEditing ? (
                      <div style={{ marginTop: '10px' }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            width: '100%',
                            minHeight: '150px',
                            border: '3px solid #e2e8f0',
                            borderRadius: '12px',
                            padding: '16px',
                            fontSize: '18px',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            marginBottom: '16px',
                            outline: 'none',
                            fontWeight: '600',
                            lineHeight: '1.6'
                          }}
                          onFocus={(e) => e.target.style.borderColor = config.color}
                          onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
                        />
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => {
                              updateCampo(pedido.firebaseKey, 'pedido', editText);
                              setEditingId(null);
                            }}
                            className="btn-hover btn-active"
                            style={{
                              flex: 1,
                              padding: '14px',
                              borderRadius: '12px',
                              border: 'none',
                              background: config.color,
                              color: 'white',
                              fontWeight: 800,
                              fontSize: '16px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            ✅ Guardar Cambios
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="btn-hover btn-active"
                            style={{
                              padding: '14px 24px',
                              borderRadius: '12px',
                              border: 'none',
                              background: '#e2e8f0',
                              color: '#475569',
                              fontWeight: 700,
                              fontSize: '16px',
                              cursor: 'pointer',
                              transition: 'all 0.2s'
                            }}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginTop: '10px' }}>
                        <pre 
                          className="pedido-text"
                          style={{
                            margin: 0,
                            fontFamily: "'Segoe UI', system-ui, sans-serif",
                            color: '#0f172a',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            letterSpacing: '-0.2px'
                          }}
                        >
                          {pedido.pedido}
                        </pre>
                        <button
                          onClick={() => {
                            setEditingId(pedido.firebaseKey);
                            setEditText(pedido.pedido || '');
                          }}
                          className="btn-hover btn-active"
                          style={{
                            marginTop: '16px',
                            padding: '10px 18px',
                            borderRadius: '10px',
                            border: '2px solid #e2e8f0',
                            background: 'white',
                            color: '#64748b',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                          }}
                        >
                          {Icons.edit}
                          Editar Pedido
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {status === 'Pendiente' && (
                      <>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <select
                            onChange={(e) => handleSelectCocinero(pedido.firebaseKey, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '16px 18px',
                              borderRadius: '14px',
                              border: '3px solid rgba(255,255,255,0.9)',
                              background: 'white',
                              fontSize: '15px',
                              fontWeight: 700,
                              color: '#475569',
                              cursor: 'pointer',
                              appearance: 'none',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat',
                              backgroundPosition: 'right 14px center',
                              backgroundSize: '20px',
                              outline: 'none',
                              transition: 'all 0.2s',
                              boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                            }}
                            onFocus={(e) => e.target.style.borderColor = '#f59e0b'}
                            onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.9)'}
                          >
                            <option value="">👨‍🍳 Seleccionar cocinero...</option>
                            {cocineros.map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <button
                          onClick={() => updateCampo(pedido.firebaseKey, 'estado', 'Cancelado')}
                          className="btn-hover btn-active"
                          style={{
                            padding: '16px 20px',
                            borderRadius: '14px',
                            border: 'none',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s',
                            fontSize: '15px'
                          }}
                        >
                          {Icons.cancel}
                          Cancelar
                        </button>
                      </>
                    )}

                    {status === 'En preparación' && (
                      <>
                        <button
                          onClick={() => marcarPreparado(pedido.firebaseKey)}
                          className="btn-hover btn-active"
                          style={{
                            flex: 1,
                            padding: '18px',
                            borderRadius: '14px',
                            border: 'none',
                            background: '#10b981',
                            color: 'white',
                            fontWeight: 800,
                            fontSize: '17px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            boxShadow: '0 6px 20px rgba(16, 185, 129, 0.4)',
                            transition: 'all 0.2s'
                          }}
                        >
                          {Icons.check}
                          Pedido Listo
                        </button>
                        <button
                          onClick={() => updateCampo(pedido.firebaseKey, 'estado', 'Cancelado')}
                          className="btn-hover btn-active"
                          style={{
                            padding: '16px 20px',
                            borderRadius: '14px',
                            border: 'none',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '15px'
                          }}
                        >
                          {Icons.cancel}
                        </button>
                      </>
                    )}

                    {status === 'Preparado' && (
                      <>
                        <button
                          onClick={() => updateCampo(pedido.firebaseKey, 'estado', 'Pendiente')}
                          className="btn-hover btn-active"
                          style={{
                            flex: 1,
                            padding: '16px',
                            borderRadius: '14px',
                            border: '3px solid #e2e8f0',
                            background: 'white',
                            color: '#475569',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                            fontSize: '15px'
                          }}
                        >
                          {Icons.undo}
                          Volver a Preparar
                        </button>
                        <button
                          onClick={() => updateCampo(pedido.firebaseKey, 'estado', 'Cancelado')}
                          className="btn-hover btn-active"
                          style={{
                            padding: '16px 20px',
                            borderRadius: '14px',
                            border: 'none',
                            background: '#fee2e2',
                            color: '#dc2626',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            fontSize: '15px'
                          }}
                        >
                          {Icons.cancel}
                        </button>
                      </>
                    )}

                    {status === 'Cancelado' && (
                      <button
                        onClick={() => updateCampo(pedido.firebaseKey, 'estado', 'Pendiente')}
                        className="btn-hover btn-active"
                        style={{
                          width: '100%',
                          padding: '16px',
                          borderRadius: '14px',
                          border: 'none',
                          background: '#3b82f6',
                          color: 'white',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          transition: 'all 0.2s',
                          fontSize: '16px'
                        }}
                      >
                        {Icons.undo}
                        Reactivar Pedido
                      </button>
                    )}
                  </div>

                  {/* Timestamps */}
                  {(pedido.timestampPreparacion || pedido.timestampPreparado) && (
                    <div style={{
                      marginTop: '20px',
                      paddingTop: '16px',
                      borderTop: `2px dashed ${config.border}50`,
                      display: 'flex',
                      gap: '20px',
                      fontSize: '13px',
                      color: '#64748b',
                      fontWeight: 600
                    }}>
                      {pedido.timestampPreparacion && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '16px' }}>🕐</span>
                          Inicio: {pedido.timestampPreparacion}
                        </div>
                      )}
                      {pedido.timestampPreparado && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '16px' }}>✅</span>
                          Terminado: {pedido.timestampPreparado}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}