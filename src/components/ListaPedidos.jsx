import React, { useState } from 'react';

export default function ListaPedidos({ pedidos = [], onEnviarPedido }) {
 const [filtro, setFiltro] = React.useState('por_enviar');
  const isPorEnviar = (p) => p.estado !== 'Enviado' && p.estado !== 'Cancelado';
  const isEnviado = (p) => p.estado === 'Enviado';
  const isCancelado = (p) => p.estado === 'Cancelado';

  const porEnviarCount = pedidos.filter(isPorEnviar).length;
  const enviadosCount = pedidos.filter(isEnviado).length;
  const canceladosCount = pedidos.filter(isCancelado).length;

  const filtrar = (arr) => {
    if (filtro === 'enviados') return arr.filter(isEnviado);
    if (filtro === 'cancelados') return arr.filter(isCancelado);
    if (filtro === 'por_enviar') return arr.filter(isPorEnviar);
    return arr;
  };

  const stateTone = (estado = 'Pendiente') => {
    if (estado === 'En preparación') return 'warn';
    if (estado === 'Preparado') return 'ok';
    if (estado === 'Cancelado') return 'danger';
    if (estado === 'Enviado') return 'sent';
    return 'info';
  };

  const ui = {
    page: { padding: 18, color: '#0b1220' },
    headerRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap', marginBottom: 14
    },
    title: { margin: 0, fontSize: 22, fontWeight: 900, letterSpacing: 0.2 },
    pills: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
    pill: (tone, active) => ({
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '9px 12px', borderRadius: 999, fontSize: 13, fontWeight: 900,
      cursor: 'pointer',
      background: active ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.85)',
      color: active ? 'white' : '#0b1220',
      border: active ? '1px solid rgba(15,23,42,0.92)' : '1px solid rgba(15,23,42,0.10)',
      boxShadow: active ? '0 14px 26px rgba(15,23,42,0.18)' : '0 8px 18px rgba(15,23,42,0.05)',
      userSelect: 'none',
    }),
    dot: (tone, active) => ({
      width: 8, height: 8, borderRadius: 999,
      background:
        tone === 'ok' ? (active ? 'rgba(34,197,94,1)' : 'rgba(34,197,94,0.95)') :
        tone === 'sent' ? (active ? 'rgba(99,102,241,1)' : 'rgba(99,102,241,0.95)') :
        tone === 'danger' ? (active ? 'rgba(244,63,94,1)' : 'rgba(244,63,94,0.95)') :
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
      display: 'flex', justifyContent: 'space-between', gap: 10,
      flexWrap: 'wrap', alignItems: 'baseline', position: 'relative', marginBottom: 6
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
    empty: {
      padding: 18,
      borderRadius: 16,
      background: 'rgba(15,23,42,0.04)',
      border: '1px dashed rgba(15,23,42,0.18)',
      fontWeight: 800
    }
  };

  const Pill = ({ label, value, tone, active, onClick }) => (
    <span style={ui.pill(tone, active)} onClick={onClick}>
      <span style={ui.dot(tone, active)} />
      {label}: <span style={{ fontWeight: 900 }}>{value}</span>
    </span>
  );

  const pedidosOrdenados = [...filtrar(pedidos)].sort((a, b) => (a.id || 0) - (b.id || 0));

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={ui.title}>Lista de Pedidos de Hoy</h2>
        <div style={ui.pills}>
          <Pill label="Por enviar" value={porEnviarCount} tone="ok" active={filtro === 'por_enviar'} onClick={() => setFiltro('por_enviar')} />
          <Pill label="Enviados" value={enviadosCount} tone="sent" active={filtro === 'enviados'} onClick={() => setFiltro('enviados')} />
          <Pill label="Cancelados" value={canceladosCount} tone="danger" active={filtro === 'cancelados'} onClick={() => setFiltro('cancelados')} />
          <Pill label="Todos" value={pedidos.length} tone="info" active={filtro === 'todos'} onClick={() => setFiltro('todos')} />
        </div>
      </div>

      {pedidosOrdenados.length === 0 ? (
        <div style={ui.empty}>No hay pedidos en este filtro.</div>
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
                  <p style={ui.cliente}>{p.cliente} <span style={{ fontSize: 12, opacity: 0.7 }}>({p.clienteCodigo || '-'})</span></p>
                  {p.direccion && <div style={ui.sub}><strong>Dir:</strong> {p.direccion || '-'}</div>}
                  <div style={ui.metaGrid}>
                    <div style={ui.metaItem}><strong>Método de pago:</strong><br />{p.metodoPago || '-'}</div>
                    <div style={ui.metaItem}><strong>Quién lo hizo (Cocinero):</strong><br />{p.cocinero || '-'}</div>
                    <div style={ui.metaItem}><strong>Enviado con (Repartidor):</strong><br />{p.repartidor || '-'}</div>
                    <div style={ui.metaItem}>
                      <strong>Tiempos:</strong><br />
                      Ingreso: {p.timestampIngreso || '-'} · Prep: {p.timestampPreparacion || '-'}<br />
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
                        <option>Jordin Gomez</option>
                        <option>Harvey Mora</option>
                        <option>Daniel Cruz</option>
                        <option>Local</option>
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