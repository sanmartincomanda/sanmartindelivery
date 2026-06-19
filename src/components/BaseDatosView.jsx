import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { push, ref, remove, update } from 'firebase/database';
import { database } from '../firebase';
import { buildGoogleMapsPlaceUrl, getBrowserLocation, hasLocation, normalizeLocation } from '../services/geo';
import { fetchOrdersByDateRange } from '../services/orders';
import { hoyISO, normalizar } from './Utils';

const Icons = {
  users: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87" />
      <path d="M16 3.13a4 4 0 010 7.75" />
    </svg>
  ),
  history: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  search: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  upload: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  download: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  refresh: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0114.13-3.36L23 10" />
      <path d="M20.49 15a9 9 0 01-14.13 3.36L1 14" />
    </svg>
  ),
  filter: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  eye: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  close: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  user: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  truck: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  ),
  creditCard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  ),
  mapPin: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  phone: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.86 19.86 0 01-8.63-3.07A19.5 19.5 0 015.15 12.8 19.86 19.86 0 012.08 4.09 2 2 0 014.06 1.9h3a2 2 0 012 1.72l.38 3.05a2 2 0 01-.57 1.72l-1.3 1.3a16 16 0 006.74 6.74l1.3-1.3a2 2 0 011.72-.57l3.05.38A2 2 0 0122 16.92z" />
    </svg>
  ),
  notes: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  box: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <polyline points="7.5 4.21 12 6.81 16.5 4.21" />
      <polyline points="7.5 19.79 7.5 14.6 3 12" />
      <polyline points="21 12 16.5 14.6 16.5 19.79" />
      <polyline points="12 22.08 12 16.89 21 12" />
      <polyline points="12 16.89 3 12" />
      <line x1="12" y1="6.81" x2="12" y2="16.89" />
    </svg>
  ),
};

const STATUS_META = {
  Pendiente: { color: '#3b82f6', soft: 'rgba(59, 130, 246, 0.16)', label: 'Pendiente' },
  'En preparacion': { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)', label: 'En preparacion' },
  Preparado: { color: '#10b981', soft: 'rgba(16, 185, 129, 0.16)', label: 'Preparado' },
  Enviado: { color: '#6366f1', soft: 'rgba(99, 102, 241, 0.16)', label: 'Enviado' },
  Entregado: { color: '#16a34a', soft: 'rgba(22, 163, 74, 0.16)', label: 'Entregado' },
  Cancelado: { color: '#ef4444', soft: 'rgba(239, 68, 68, 0.16)', label: 'Cancelado' },
};

let xlsxModulePromise;

const loadXlsx = async () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import('xlsx');
  }

  return xlsxModulePromise;
};

const toLocalIsoDate = (date = new Date()) => {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() - nextDate.getTimezoneOffset());
  return nextDate.toISOString().slice(0, 10);
};

const shiftIsoDate = (baseIsoDate, days) => {
  const [year, month, day] = baseIsoDate.split('-').map(Number);
  const nextDate = new Date(year, (month || 1) - 1, day || 1);
  nextDate.setDate(nextDate.getDate() + days);
  return toLocalIsoDate(nextDate);
};

const formatDateLabel = (isoDate) => {
  if (!isoDate) {
    return 'Sin fecha';
  }

  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(year, month - 1, day).toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTimeLabel = (value) => {
  if (!value) {
    return 'Sin registro';
  }

  const parsed = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return parsed.toLocaleString('es-NI', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeStatus = (status = 'Pendiente') => {
  const cleanStatus = normalizar(status);

  if (cleanStatus === 'en preparacion') {
    return 'En preparacion';
  }

  if (cleanStatus === 'preparado') {
    return 'Preparado';
  }

  if (cleanStatus === 'enviado') {
    return 'Enviado';
  }

  if (cleanStatus === 'entregado') {
    return 'Entregado';
  }

  if (cleanStatus === 'cancelado') {
    return 'Cancelado';
  }

  return 'Pendiente';
};

const getStatusMeta = (status) => STATUS_META[normalizeStatus(status)] || STATUS_META.Pendiente;

const getMetodoPagoTone = (metodo = 'Efectivo') => {
  const palette = {
    Efectivo: { color: '#10b981', soft: 'rgba(16, 185, 129, 0.16)' },
    'POS BAC': { color: '#3b82f6', soft: 'rgba(59, 130, 246, 0.16)' },
    'POS BANPRO': { color: '#2563eb', soft: 'rgba(37, 99, 235, 0.16)' },
    'POS LAFISE': { color: '#1d4ed8', soft: 'rgba(29, 78, 216, 0.16)' },
    'LINK DE PAGO': { color: '#8b5cf6', soft: 'rgba(139, 92, 246, 0.16)' },
    TRANSFERENCIA: { color: '#f59e0b', soft: 'rgba(245, 158, 11, 0.16)' },
    CREDITO: { color: '#ec4899', soft: 'rgba(236, 72, 153, 0.16)' },
  };

  return palette[metodo] || { color: '#94a3b8', soft: 'rgba(148, 163, 184, 0.16)' };
};

const sortOrders = (orders) =>
  [...orders].sort((left, right) => {
    const dateDiff = (right.fecha || '').localeCompare(left.fecha || '');
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const idDiff = (parseInt(right.id, 10) || 0) - (parseInt(left.id, 10) || 0);
    if (idDiff !== 0) {
      return idDiff;
    }

    return (right.timestamp || 0) - (left.timestamp || 0);
  });

const orderMatchesSearch = (order, normalizedTerm) => {
  if (!normalizedTerm) {
    return true;
  }

  return [
    order.id,
    order.fecha,
    order.cliente,
    order.clienteCodigo,
    order.telefono,
    order.direccion,
    order.referencia,
    order.pedido,
    order.observaciones,
    order.estado,
    order.metodoPago,
    order.canal,
    order.canalLabel,
    order.total,
    order.cocinero,
    order.repartidor,
    order.timestampIngreso,
    order.timestampPreparacion,
    order.timestampPreparado,
    order.timestampEnviado,
    order.timestampEntregado,
  ]
    .filter(Boolean)
    .some((value) => normalizar(String(value)).includes(normalizedTerm));
};

const truncateText = (value = '', maxLength = 180) => {
  const cleanValue = value.replace(/\s+/g, ' ').trim();
  if (cleanValue.length <= maxLength) {
    return cleanValue;
  }

  return `${cleanValue.slice(0, maxLength).trim()}...`;
};

const buildHistoryExportRows = (orders) =>
  orders.map((order) => ({
    Fecha: order.fecha || '-',
    Pedido: order.id || '-',
    Cliente: order.cliente || '-',
    Codigo: order.clienteCodigo || '-',
    Telefono: order.telefono || '-',
    Direccion: order.direccion || '-',
    Canal: order.canalLabel || order.canal || 'Manual',
    Total: order.total ?? '-',
    Estado: normalizeStatus(order.estado),
    'Metodo de pago': order.metodoPago || 'Efectivo',
    'Hora ingreso': order.timestampIngreso || '-',
    Cocinero: order.cocinero || '-',
    'Hora inicio cocina': order.timestampPreparacion || '-',
    'Hora preparado': order.timestampPreparado || '-',
    Repartidor: order.repartidor || '-',
    'Hora envio': order.timestampEnviado || '-',
    'Hora entrega': order.timestampEntregado || '-',
    'Entregado por': order.entregadoPor || '-',
    PedidoDetalle: (order.pedido || '').replace(/\n/g, ' '),
  }));

export default function BaseDatosView({ clientes = [] }) {
  const [section, setSection] = useState('clientes');
  const [toast, setToast] = useState(null);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySyncAt, setHistorySyncAt] = useState(null);
  const [historyRange, setHistoryRange] = useState(() => ({
    dateFrom: shiftIsoDate(hoyISO(), -7),
    dateTo: hoyISO(),
  }));

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timeoutId = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timeoutId);
  }, [toast]);

  const showToast = (message, type = 'success') => {
    setToast({ id: Date.now(), message, type });
  };

  const loadHistory = async (options = {}) => {
    const force = Boolean(options.force);
    const requestedRange = {
      dateFrom: String(options.range?.dateFrom || historyRange.dateFrom || '').trim(),
      dateTo: String(options.range?.dateTo || historyRange.dateTo || '').trim(),
    };

    const sameRange =
      requestedRange.dateFrom === historyRange.dateFrom &&
      requestedRange.dateTo === historyRange.dateTo;

    if (historyLoading || (historyLoaded && !force && sameRange)) {
      return;
    }

    setHistoryLoading(true);
    setHistoryRange(requestedRange);

    try {
      const nextOrders = sortOrders(
        await fetchOrdersByDateRange(requestedRange.dateFrom, requestedRange.dateTo)
      );

      setHistoryOrders(nextOrders);
      setHistoryLoaded(true);
      setHistorySyncAt(Date.now());

      if (force) {
        showToast('Historial actualizado');
      }
    } catch (error) {
      console.error('Error loading order history:', error);
      showToast('No se pudo cargar el historial de pedidos', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (section === 'historial' && !historyLoaded) {
      loadHistory({ force: true, range: historyRange });
    }
  }, [section, historyLoaded, historyRange]);

  const systemStats = useMemo(() => {
    const totalPedidos = historyLoaded ? historyOrders.length : '--';
    const enviados = historyLoaded
      ? historyOrders.filter((order) => normalizeStatus(order.estado) === 'Enviado').length
      : '--';

    return {
      clientes: clientes.length,
      pedidos: totalPedidos,
      enviados,
    };
  }, [clientes.length, historyLoaded, historyOrders]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(59, 130, 246, 0.2), transparent 26%), radial-gradient(circle at top right, rgba(16, 185, 129, 0.12), transparent 28%), linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '24px',
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: '#f8fafc',
      }}
    >
      <style>{`
        @keyframes bdFadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bdPulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }

        .bd-animate {
          animation: bdFadeUp 0.35s ease-out;
        }

        .bd-glass {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(14px);
        }

        .bd-button {
          transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
        }

        .bd-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 16px 32px rgba(15, 23, 42, 0.24);
        }

        .bd-input,
        .bd-select,
        .bd-textarea {
          width: 100%;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(15, 23, 42, 0.4);
          color: #f8fafc;
          border-radius: 14px;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.2s ease, background 0.2s ease;
        }

        .bd-input:focus,
        .bd-select:focus,
        .bd-textarea:focus {
          border-color: rgba(59, 130, 246, 0.8);
          background: rgba(15, 23, 42, 0.58);
        }

        .bd-select option {
          color: #0f172a;
        }

        .bd-sidebar-button {
          transition: background 0.2s ease, transform 0.2s ease, color 0.2s ease;
        }

        .bd-sidebar-button:hover {
          transform: translateX(2px);
        }

        .bd-history-card {
          transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
        }

        .bd-history-card:hover {
          transform: translateY(-3px);
          border-color: rgba(96, 165, 250, 0.5);
          box-shadow: 0 22px 38px rgba(15, 23, 42, 0.28);
        }

        .bd-saving-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          animation: bdPulse 1.4s ease-in-out infinite;
        }

        @media (max-width: 1120px) {
          .bd-layout {
            grid-template-columns: 1fr !important;
          }

          .bd-sidebar {
            position: static !important;
          }
        }

        @media (max-width: 860px) {
          .bd-history-grid,
          .bd-history-stats,
          .bd-history-filters,
          .bd-hero-grid,
          .bd-modal-grid,
          .bd-client-row,
          .bd-client-head {
            grid-template-columns: 1fr !important;
          }

          .bd-actions-row,
          .bd-clients-header,
          .bd-history-header {
            flex-direction: column !important;
            align-items: stretch !important;
          }

          .bd-modal-shell {
            width: calc(100vw - 24px) !important;
            max-height: calc(100vh - 24px) !important;
          }
        }
      `}</style>

      {toast && (
        <div
          className="bd-animate"
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 1600,
            padding: '14px 18px',
            borderRadius: '14px',
            fontWeight: 700,
            color: 'white',
            background:
              toast.type === 'error'
                ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 20px 40px rgba(15, 23, 42, 0.28)',
          }}
        >
          {toast.message}
        </div>
      )}

      <div className="bd-layout" style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '24px' }}>
        <aside
          className="bd-glass bd-sidebar bd-animate"
          style={{
            borderRadius: '28px',
            padding: '24px',
            position: 'sticky',
            top: '24px',
            height: 'fit-content',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 18px 34px rgba(59, 130, 246, 0.32)',
              }}
            >
              {Icons.box}
            </div>
            <div>
              <div style={{ fontSize: '21px', fontWeight: 900 }}>Base de Datos</div>
              <div style={{ fontSize: '13px', color: 'rgba(226, 232, 240, 0.68)' }}>
                Clientes e historial operativo
              </div>
            </div>
          </div>

          <nav style={{ display: 'grid', gap: '10px' }}>
            <SidebarButton
              active={section === 'clientes'}
              icon={Icons.users}
              label="Clientes"
              count={clientes.length}
              onClick={() => setSection('clientes')}
            />
            <SidebarButton
              active={section === 'historial'}
              icon={Icons.history}
              label="Historial"
              count={historyLoaded ? historyOrders.length : '...'}
              onClick={() => setSection('historial')}
            />
          </nav>

          <div
            style={{
              marginTop: '28px',
              paddingTop: '22px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'grid',
              gap: '12px',
            }}
          >
            <StatRow label="Total clientes" value={systemStats.clientes} color="#60a5fa" />
            <StatRow label="Pedidos cargados" value={systemStats.pedidos} color="#34d399" />
            <StatRow label="Pedidos enviados" value={systemStats.enviados} color="#818cf8" />
          </div>

          <div
            className="bd-glass"
            style={{
              marginTop: '24px',
              borderRadius: '20px',
              padding: '18px',
              background: 'rgba(15, 23, 42, 0.4)',
            }}
          >
            <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58 }}>
              ESTADO DEL MODULO
            </div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginTop: '10px', lineHeight: 1.5 }}>
              {section === 'clientes'
                ? 'Edicion rapida de clientes, importacion y respaldo.'
                : 'Busqueda avanzada de pedidos con detalle completo y exportacion.'}
            </div>
            <div style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(226, 232, 240, 0.58)' }}>
              {historySyncAt ? `Ultima sincronizacion: ${formatDateTimeLabel(historySyncAt)}` : 'Historial aun no sincronizado'}
            </div>
          </div>
        </aside>

        <main
          className="bd-glass bd-animate"
          style={{
            borderRadius: '30px',
            padding: '28px',
            minHeight: '680px',
            boxShadow: '0 28px 50px rgba(15, 23, 42, 0.22)',
          }}
        >
          <div className="bd-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: '18px', marginBottom: '26px' }}>
            <div
              style={{
                padding: '24px',
                borderRadius: '24px',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.72))',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.6 }}>
                MODULO RECREADO
              </div>
              <h2 style={{ margin: '10px 0 8px 0', fontSize: '30px', fontWeight: 900 }}>
                {section === 'clientes' ? 'Clientes mas ordenados y rapidos' : 'Historial pensado para buscar y revisar'}
              </h2>
              <p style={{ margin: 0, maxWidth: '760px', lineHeight: 1.65, color: 'rgba(226, 232, 240, 0.72)' }}>
                {section === 'clientes'
                  ? 'Se mantiene la logica de clientes, pero con una interfaz mas limpia, guardado discreto y herramientas de importacion o respaldo listas para usar.'
                  : 'El historial ahora carga solo cuando se necesita, tiene filtros mas comodos, tarjetas mas claras y un popup con toda la trazabilidad del pedido.'}
              </p>
            </div>

            <div
              className="bd-glass"
              style={{
                padding: '22px',
                borderRadius: '24px',
                background: 'rgba(15, 23, 42, 0.42)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.58 }}>
                HOY
              </div>
              <div style={{ marginTop: '10px', fontSize: '28px', fontWeight: 900 }}>{formatDateLabel(hoyISO())}</div>
              <div style={{ marginTop: '8px', fontSize: '14px', color: 'rgba(226, 232, 240, 0.68)' }}>
                {new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {section === 'clientes' ? (
            <ClientesManager clientes={clientes} onToast={showToast} />
          ) : (
            <HistorialPanel
              orders={historyOrders}
              loaded={historyLoaded}
              loading={historyLoading}
              onRefresh={(range) => loadHistory({ force: true, range: range || historyRange })}
              onToast={showToast}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarButton({ active, icon, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bd-sidebar-button"
      style={{
        width: '100%',
        border: 'none',
        cursor: 'pointer',
        borderRadius: '18px',
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        textAlign: 'left',
        color: active ? 'white' : 'rgba(226, 232, 240, 0.78)',
        background: active
          ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.94), rgba(37, 99, 235, 0.88))'
          : 'rgba(255, 255, 255, 0.03)',
        boxShadow: active ? '0 18px 32px rgba(37, 99, 235, 0.24)' : 'none',
      }}
    >
      <span style={{ opacity: active ? 1 : 0.72 }}>{icon}</span>
      <span style={{ flex: 1, fontWeight: active ? 800 : 700 }}>{label}</span>
      <span
        style={{
          minWidth: '38px',
          padding: '4px 10px',
          borderRadius: '999px',
          textAlign: 'center',
          background: active ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.08)',
          fontSize: '12px',
          fontWeight: 800,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function StatRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px' }}>
      <span style={{ fontSize: '14px', color: 'rgba(226, 232, 240, 0.72)' }}>{label}</span>
      <span style={{ fontSize: '18px', fontWeight: 900, color }}>{value}</span>
    </div>
  );
}

function ClientesManager({ clientes, onToast }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(60);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const fileInputRef = useRef(null);

  const deferredSearch = useDeferredValue(searchTerm);

  const orderedClients = useMemo(
    () => [...clientes].sort((left, right) => (left.nombre || '').localeCompare(right.nombre || '')),
    [clientes],
  );

  const filteredClients = useMemo(() => {
    const search = normalizar(deferredSearch);
    if (!search) {
      return orderedClients;
    }

    return orderedClients.filter((cliente) =>
      [cliente.nombre, cliente.codigo, cliente.direccion]
        .filter(Boolean)
        .some((value) => normalizar(String(value)).includes(search)),
    );
  }, [deferredSearch, orderedClients]);

  const visibleClients = filteredClients.slice(0, displayCount);
  const hasMoreClients = filteredClients.length > displayCount;

  useEffect(() => {
    setDisplayCount(60);
  }, [deferredSearch]);

  const handleSaveClient = async (firebaseKey, payload) => {
    try {
      await update(ref(database, `clients/${firebaseKey}`), payload);
      return true;
    } catch (error) {
      console.error('Error saving client:', error);
      onToast('No se pudo guardar el cliente', 'error');
      return false;
    }
  };

  const handleSaveClientLocation = async (firebaseKey, locationPayload) => {
    const location = normalizeLocation(locationPayload);
    if (!firebaseKey || !location) {
      onToast('Ubicacion invalida. Revisa latitud y longitud.', 'error');
      return false;
    }

    try {
      await update(ref(database, `clients/${firebaseKey}`), {
        ubicacion: location,
        ubicacionActualizadaAt: Date.now(),
      });
      onToast('Ubicacion del cliente guardada');
      return true;
    } catch (error) {
      console.error('Error saving client location:', error);
      onToast('No se pudo guardar la ubicacion del cliente', 'error');
      return false;
    }
  };

  const handleCaptureClientLocation = async (firebaseKey, label) => {
    try {
      const location = await getBrowserLocation();
      return handleSaveClientLocation(firebaseKey, {
        ...location,
        label: String(label || '').trim() || location.label,
      });
    } catch (error) {
      console.error('Error capturing client location:', error);
      onToast('No se pudo tomar la ubicacion actual. Revisa el permiso de GPS.', 'error');
      return false;
    }
  };

  const handleDeleteClient = async (firebaseKey) => {
    if (!window.confirm('Seguro que deseas eliminar este cliente?')) {
      return;
    }

    try {
      await remove(ref(database, `clients/${firebaseKey}`));
      onToast('Cliente eliminado');
    } catch (error) {
      console.error('Error deleting client:', error);
      onToast('No se pudo eliminar el cliente', 'error');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    setImporting(true);

    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      if (data.length < 2) {
        onToast('El archivo no tiene datos validos para importar', 'error');
        return;
      }

      const nextPreview = data
        .slice(1)
        .filter((row) => row[0] || row[1])
        .map((row, index) => ({
          id: index,
          codigo: String(row[0] || '').trim(),
          nombre: String(row[1] || '').trim(),
          direccion: String(row[2] || '').trim(),
        }))
        .filter((client) => client.codigo && client.nombre);

      if (nextPreview.length === 0) {
        onToast('No se encontraron filas con codigo y nombre', 'error');
        return;
      }

      setPreviewData(nextPreview);
    } catch (error) {
      console.error('Error importing clients:', error);
      onToast('No se pudo leer el archivo de clientes', 'error');
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    if (!previewData?.length) {
      return;
    }

    setActionLoading(true);

    try {
      const updates = {};

      previewData.forEach((client) => {
        const key = push(ref(database, 'clients')).key;
        updates[`clients/${key}`] = {
          codigo: client.codigo,
          nombre: client.nombre,
          direccion: client.direccion,
          timestamp: Date.now(),
        };
      });

      await update(ref(database), updates);
      setPreviewData(null);
      onToast(`${previewData.length} clientes importados`);
    } catch (error) {
      console.error('Error confirming client import:', error);
      onToast('No se pudieron importar los clientes', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const exportClients = async () => {
    setActionLoading(true);

    try {
      const XLSX = await loadXlsx();
      const sheet = XLSX.utils.json_to_sheet(
        orderedClients.map((client) => ({
          Clave: client.codigo || '',
          Nombre: client.nombre || '',
          Direccion: client.direccion || '',
        })),
      );

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Clientes');
      XLSX.writeFile(workbook, `clientes_backup_${hoyISO()}.xlsx`);
      onToast('Clientes exportados');
    } catch (error) {
      console.error('Error exporting clients:', error);
      onToast('No se pudo exportar el listado de clientes', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="bd-animate">
      <div className="bd-clients-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.6 }}>CLIENTES</div>
          <h3 style={{ margin: '8px 0 6px 0', fontSize: '28px', fontWeight: 900 }}>Gestion de clientes</h3>
          <p style={{ margin: 0, color: 'rgba(226, 232, 240, 0.7)', lineHeight: 1.6 }}>
            Conserva la misma logica operativa, con una presentacion mas clara y mas suave para editar.
          </p>
        </div>

        <div className="bd-actions-row" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xls,.xlsx"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing || actionLoading}
            className="bd-button"
            style={{
              border: '1px dashed rgba(245, 158, 11, 0.55)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#fbbf24',
              padding: '12px 16px',
              borderRadius: '14px',
              fontWeight: 800,
              cursor: importing || actionLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {Icons.upload}
            {importing ? 'Leyendo archivo...' : 'Importar Excel'}
          </button>

          <button
            type="button"
            onClick={exportClients}
            disabled={actionLoading}
            className="bd-button"
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '14px',
              fontWeight: 800,
              cursor: actionLoading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 14px 28px rgba(16, 185, 129, 0.22)',
            }}
          >
            {Icons.download}
            Exportar respaldo
          </button>
        </div>
      </div>

      <div className="bd-hero-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <SummaryCard label="Total clientes" value={clientes.length} color="#60a5fa" />
        <SummaryCard label="Filtrados" value={filteredClients.length} color="#34d399" />
        <SummaryCard label="Mostrados" value={visibleClients.length} color="#fbbf24" />
      </div>

      {previewData && (
        <div
          className="bd-glass bd-animate"
          style={{
            borderRadius: '22px',
            padding: '20px',
            marginBottom: '18px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.28)',
          }}
        >
          <div className="bd-clients-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, color: '#fbbf24' }}>Vista previa de importacion</div>
              <div style={{ marginTop: '4px', color: 'rgba(226, 232, 240, 0.72)' }}>
                Se encontraron {previewData.length} clientes listos para subir.
              </div>
            </div>

            <div className="bd-actions-row" style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                style={{
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  background: 'transparent',
                  color: 'white',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmImport}
                disabled={actionLoading}
                className="bd-button"
                style={{
                  border: 'none',
                  background: '#f59e0b',
                  color: '#0f172a',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  fontWeight: 900,
                  cursor: actionLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {actionLoading ? 'Importando...' : 'Confirmar importacion'}
              </button>
            </div>
          </div>

          <div
            style={{
              marginTop: '16px',
              borderRadius: '18px',
              overflow: 'hidden',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            {previewData.slice(0, 6).map((client) => (
              <div
                key={client.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 1.2fr',
                  gap: '14px',
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{client.codigo}</span>
                <span style={{ fontWeight: 700 }}>{client.nombre}</span>
                <span style={{ color: 'rgba(226, 232, 240, 0.74)' }}>{client.direccion || 'Sin direccion'}</span>
              </div>
            ))}
            {previewData.length > 6 && (
              <div style={{ padding: '12px 16px', textAlign: 'center', color: 'rgba(226, 232, 240, 0.66)' }}>
                ... y {previewData.length - 6} clientes mas
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className="bd-glass"
        style={{
          borderRadius: '22px',
          padding: '18px',
          marginBottom: '18px',
          background: 'rgba(15, 23, 42, 0.42)',
        }}
      >
        <div style={{ position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'rgba(226, 232, 240, 0.45)',
            }}
          >
            {Icons.search}
          </span>
          <input
            className="bd-input"
            type="text"
            value={searchTerm}
            placeholder="Buscar por nombre, codigo o direccion..."
            onChange={(event) => {
              const value = event.target.value;
              startTransition(() => setSearchTerm(value));
            }}
            style={{ padding: '14px 16px 14px 48px', fontSize: '15px' }}
          />
        </div>
      </div>

      <div
        className="bd-glass"
        style={{
          borderRadius: '24px',
          overflow: 'hidden',
          background: 'rgba(15, 23, 42, 0.42)',
        }}
      >
        <div
          className="bd-client-head"
          style={{
            display: 'grid',
            gridTemplateColumns: '140px minmax(180px, 1fr) minmax(220px, 1.1fr) minmax(260px, 0.9fr) 120px',
            gap: '16px',
            padding: '16px 18px',
            background: 'rgba(255, 255, 255, 0.05)',
            fontSize: '12px',
            fontWeight: 800,
            letterSpacing: '0.08em',
            color: 'rgba(226, 232, 240, 0.6)',
            textTransform: 'uppercase',
          }}
        >
          <div>Codigo</div>
          <div>Nombre</div>
          <div>Direccion</div>
          <div>Mapa</div>
          <div style={{ textAlign: 'center' }}>Accion</div>
        </div>

        <div style={{ maxHeight: '620px', overflow: 'auto' }}>
          {visibleClients.map((client) => (
            <ClienteRow
              key={client.firebaseKey}
              cliente={client}
              onSave={handleSaveClient}
              onSaveLocation={handleSaveClientLocation}
              onCaptureLocation={handleCaptureClientLocation}
              onDelete={handleDeleteClient}
            />
          ))}

          {visibleClients.length === 0 && (
            <EmptyState
              title="No hay clientes para mostrar"
              description={deferredSearch ? 'Prueba con otra busqueda para encontrar el cliente.' : 'Todavia no hay clientes registrados en la base.'}
            />
          )}
        </div>
      </div>

      {hasMoreClients && (
        <button
          type="button"
          onClick={() => setDisplayCount((current) => current + 60)}
          className="bd-button"
          style={{
            width: '100%',
            marginTop: '16px',
            border: '1px solid rgba(96, 165, 250, 0.24)',
            background: 'rgba(59, 130, 246, 0.08)',
            color: '#93c5fd',
            padding: '14px 16px',
            borderRadius: '16px',
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Cargar {Math.min(60, filteredClients.length - displayCount)} clientes mas
        </button>
      )}
    </div>
  );
}

function ClienteRow({ cliente, onSave, onSaveLocation, onCaptureLocation, onDelete }) {
  const [editData, setEditData] = useState({
    codigo: cliente.codigo || '',
    nombre: cliente.nombre || '',
    direccion: cliente.direccion || '',
  });
  const [locationDraft, setLocationDraft] = useState(() => {
    const location = normalizeLocation(cliente.ubicacion);
    return {
      lat: location ? String(location.lat) : '',
      lng: location ? String(location.lng) : '',
    };
  });
  const [saveState, setSaveState] = useState('idle');
  const [locationState, setLocationState] = useState('idle');

  useEffect(() => {
    setEditData({
      codigo: cliente.codigo || '',
      nombre: cliente.nombre || '',
      direccion: cliente.direccion || '',
    });
  }, [cliente.codigo, cliente.direccion, cliente.firebaseKey, cliente.nombre]);

  useEffect(() => {
    const location = normalizeLocation(cliente.ubicacion);
    setLocationDraft({
      lat: location ? String(location.lat) : '',
      lng: location ? String(location.lng) : '',
    });
  }, [cliente.firebaseKey, cliente.ubicacion]);

  useEffect(() => {
    const hasChanges =
      editData.codigo !== (cliente.codigo || '') ||
      editData.nombre !== (cliente.nombre || '') ||
      editData.direccion !== (cliente.direccion || '');

    if (!hasChanges) {
      return undefined;
    }

    if (!editData.nombre.trim()) {
      setSaveState('error');
      return undefined;
    }

    setSaveState('pending');

    const saveTimeout = setTimeout(async () => {
      setSaveState('saving');

      const wasSaved = await onSave(cliente.firebaseKey, {
        codigo: editData.codigo.trim(),
        nombre: editData.nombre.trim(),
        direccion: editData.direccion.trim(),
      });

      setSaveState(wasSaved ? 'saved' : 'error');
    }, 650);

    return () => clearTimeout(saveTimeout);
  }, [cliente.codigo, cliente.direccion, cliente.firebaseKey, cliente.nombre, editData, onSave]);

  useEffect(() => {
    if (saveState !== 'saved') {
      return undefined;
    }

    const clearStatusTimeout = setTimeout(() => setSaveState('idle'), 900);
    return () => clearTimeout(clearStatusTimeout);
  }, [saveState]);

  useEffect(() => {
    if (locationState !== 'saved' && locationState !== 'error') {
      return undefined;
    }

    const clearStatusTimeout = setTimeout(() => setLocationState('idle'), 1200);
    return () => clearTimeout(clearStatusTimeout);
  }, [locationState]);

  const savedLocation = normalizeLocation(cliente.ubicacion);
  const clientHasLocation = hasLocation(cliente.ubicacion);
  const mapUrl = savedLocation ? buildGoogleMapsPlaceUrl(savedLocation) : '';

  const handleManualLocationSave = async () => {
    setLocationState('saving');
    const location = normalizeLocation({
      lat: locationDraft.lat,
      lng: locationDraft.lng,
      label: editData.direccion || cliente.direccion || cliente.nombre,
    });

    if (!location) {
      setLocationState('error');
      return;
    }

    const wasSaved = await onSaveLocation(cliente.firebaseKey, location);
    setLocationState(wasSaved ? 'saved' : 'error');
  };

  const handleCurrentLocationSave = async () => {
    setLocationState('saving');
    const wasSaved = await onCaptureLocation(
      cliente.firebaseKey,
      editData.direccion || cliente.direccion || cliente.nombre
    );
    setLocationState(wasSaved ? 'saved' : 'error');
  };

  const saveLabel =
    saveState === 'saving'
      ? 'Guardando'
      : saveState === 'saved'
        ? 'Guardado'
        : saveState === 'error'
          ? 'Revisar'
          : 'Listo';

  const locationLabel =
    locationState === 'saving'
      ? 'Guardando pin'
      : locationState === 'saved'
        ? 'Pin guardado'
        : locationState === 'error'
          ? 'Revisar pin'
          : clientHasLocation
            ? 'Con pin'
            : 'Sin pin';

  const locationColor =
    locationState === 'saving'
      ? '#f59e0b'
      : locationState === 'saved' || clientHasLocation
        ? '#10b981'
        : locationState === 'error'
          ? '#ef4444'
          : '#94a3b8';

  const saveColor =
    saveState === 'saving'
      ? '#f59e0b'
      : saveState === 'saved'
        ? '#10b981'
        : saveState === 'error'
          ? '#ef4444'
          : '#94a3b8';

  return (
    <div
      className="bd-client-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '140px minmax(180px, 1fr) minmax(220px, 1.1fr) minmax(260px, 0.9fr) 120px',
        gap: '16px',
        alignItems: 'center',
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '6px' }}>Codigo</div>
        <input
          className="bd-input"
          value={editData.codigo}
          onChange={(event) => setEditData((current) => ({ ...current, codigo: event.target.value }))}
          style={{ padding: '12px 12px', fontFamily: 'monospace', fontSize: '14px' }}
        />
      </div>

      <div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '6px' }}>Nombre</div>
        <input
          className="bd-input"
          value={editData.nombre}
          onChange={(event) => setEditData((current) => ({ ...current, nombre: event.target.value }))}
          style={{ padding: '12px 12px', fontSize: '14px' }}
        />
      </div>

      <div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '6px' }}>Direccion</div>
        <input
          className="bd-input"
          value={editData.direccion}
          placeholder="Sin direccion"
          onChange={(event) => setEditData((current) => ({ ...current, direccion: event.target.value }))}
          style={{ padding: '12px 12px', fontSize: '14px' }}
        />
      </div>

      <div>
        <div style={{ fontSize: '11px', opacity: 0.5, marginBottom: '6px' }}>Mapa</div>
        <div style={{ display: 'grid', gap: '8px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <input
              className="bd-input"
              value={locationDraft.lat}
              placeholder="Lat"
              inputMode="decimal"
              onChange={(event) => setLocationDraft((current) => ({ ...current, lat: event.target.value }))}
              style={{ padding: '10px 10px', fontSize: '12px' }}
            />
            <input
              className="bd-input"
              value={locationDraft.lng}
              placeholder="Lng"
              inputMode="decimal"
              onChange={(event) => setLocationDraft((current) => ({ ...current, lng: event.target.value }))}
              style={{ padding: '10px 10px', fontSize: '12px' }}
            />
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button
              type="button"
              onClick={handleManualLocationSave}
              disabled={locationState === 'saving'}
              style={{
                border: 'none',
                background: 'rgba(245, 158, 11, 0.18)',
                color: '#fbbf24',
                borderRadius: '999px',
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: 900,
                cursor: locationState === 'saving' ? 'not-allowed' : 'pointer',
              }}
            >
              Guardar coords
            </button>
            <button
              type="button"
              onClick={handleCurrentLocationSave}
              disabled={locationState === 'saving'}
              style={{
                border: 'none',
                background: 'rgba(59, 130, 246, 0.18)',
                color: '#93c5fd',
                borderRadius: '999px',
                padding: '8px 10px',
                fontSize: '11px',
                fontWeight: 900,
                cursor: locationState === 'saving' ? 'not-allowed' : 'pointer',
              }}
            >
              Ubicacion actual
            </button>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: 'none',
                  background: 'rgba(16, 185, 129, 0.16)',
                  color: '#6ee7b7',
                  borderRadius: '999px',
                  padding: '8px 10px',
                  fontSize: '11px',
                  fontWeight: 900,
                  textDecoration: 'none',
                }}
              >
                Ver mapa
              </a>
            )}
          </div>

          <span style={{ color: locationColor, fontSize: '11px', fontWeight: 900 }}>{locationLabel}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '10px', justifyItems: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: saveColor,
            fontSize: '12px',
            fontWeight: 800,
          }}
        >
          <span className="bd-saving-dot" style={{ background: saveColor }} />
          {saveLabel}
        </div>

        <button
          type="button"
          onClick={() => onDelete(cliente.firebaseKey)}
          style={{
            border: 'none',
            background: 'rgba(239, 68, 68, 0.16)',
            color: '#f87171',
            borderRadius: '12px',
            padding: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Eliminar cliente"
        >
          {Icons.trash}
        </button>
      </div>
    </div>
  );
}

function HistorialPanel({ orders, loaded, loading, onRefresh, onToast }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState(shiftIsoDate(hoyISO(), -7));
  const [dateTo, setDateTo] = useState(hoyISO());
  const [statusFilter, setStatusFilter] = useState('todos');
  const [paymentFilter, setPaymentFilter] = useState('todos');
  const [visibleCount, setVisibleCount] = useState(24);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [exporting, setExporting] = useState(false);

  const deferredSearch = useDeferredValue(searchTerm);

  const paymentOptions = useMemo(() => {
    const nextOptions = new Set();
    orders.forEach((order) => {
      if (order.metodoPago) {
        nextOptions.add(order.metodoPago);
      }
    });
    return [...nextOptions].sort();
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = normalizar(deferredSearch);

    return sortOrders(
      orders.filter((order) => {
        const normalizedStatus = normalizeStatus(order.estado);
        const matchesStatus = statusFilter === 'todos' || normalizedStatus === statusFilter;
        const matchesPayment = paymentFilter === 'todos' || (order.metodoPago || 'Efectivo') === paymentFilter;
        const matchesStartDate = !dateFrom || (order.fecha || '') >= dateFrom;
        const matchesEndDate = !dateTo || (order.fecha || '') <= dateTo;

        return (
          matchesStatus &&
          matchesPayment &&
          matchesStartDate &&
          matchesEndDate &&
          orderMatchesSearch(order, normalizedSearch)
        );
      }),
    );
  }, [dateFrom, dateTo, deferredSearch, orders, paymentFilter, statusFilter]);

  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasMoreOrders = filteredOrders.length > visibleCount;

  const stats = useMemo(
    () => ({
      todos: filteredOrders.length,
      Pendiente: filteredOrders.filter((order) => normalizeStatus(order.estado) === 'Pendiente').length,
      'En preparacion': filteredOrders.filter((order) => normalizeStatus(order.estado) === 'En preparacion').length,
      Preparado: filteredOrders.filter((order) => normalizeStatus(order.estado) === 'Preparado').length,
      Enviado: filteredOrders.filter((order) => normalizeStatus(order.estado) === 'Enviado').length,
      Entregado: filteredOrders.filter((order) => normalizeStatus(order.estado) === 'Entregado').length,
    }),
    [filteredOrders],
  );

  useEffect(() => {
    setVisibleCount(24);
  }, [dateFrom, dateTo, deferredSearch, paymentFilter, statusFilter]);

  useEffect(() => {
    if (!loaded) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      onRefresh({ dateFrom, dateTo });
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [dateFrom, dateTo, loaded]);

  useEffect(() => {
    if (!selectedOrder) {
      return;
    }

    const nextOrder = orders.find((order) => order.firebaseKey === selectedOrder.firebaseKey);
    if (!nextOrder) {
      setSelectedOrder(null);
      return;
    }

    setSelectedOrder(nextOrder);
  }, [orders, selectedOrder]);

  const resetFilters = () => {
    setDateFrom(shiftIsoDate(hoyISO(), -7));
    setDateTo(hoyISO());
    setStatusFilter('todos');
    setPaymentFilter('todos');
    setSearchTerm('');
  };

  const exportHistory = async () => {
    if (!filteredOrders.length) {
      return;
    }

    setExporting(true);

    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.utils.book_new();
      const sheet = XLSX.utils.json_to_sheet(buildHistoryExportRows(filteredOrders));
      XLSX.utils.book_append_sheet(workbook, sheet, 'Historial');
      XLSX.writeFile(workbook, `historial_pedidos_${hoyISO()}.xlsx`);
      onToast('Historial exportado');
    } catch (error) {
      console.error('Error exporting order history:', error);
      onToast('No se pudo exportar el historial', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="bd-animate">
      <div className="bd-history-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', opacity: 0.6 }}>HISTORIAL</div>
          <h3 style={{ margin: '8px 0 6px 0', fontSize: '28px', fontWeight: 900 }}>Pedidos con filtro y detalle completo</h3>
          <p style={{ margin: 0, color: 'rgba(226, 232, 240, 0.72)', lineHeight: 1.6 }}>
            Busca por cliente, numero, direccion, pedido, cocinero o repartidor. Abre cualquier pedido para ver su trazabilidad.
          </p>
        </div>

        <div className="bd-actions-row" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <button
            type="button"
            onClick={() => onRefresh({ dateFrom, dateTo })}
            disabled={loading}
            className="bd-button"
            style={{
              border: '1px solid rgba(96, 165, 250, 0.3)',
              background: 'rgba(59, 130, 246, 0.12)',
              color: '#93c5fd',
              padding: '12px 16px',
              borderRadius: '14px',
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {Icons.refresh}
            {loading ? 'Actualizando...' : 'Actualizar'}
          </button>

          <button
            type="button"
            onClick={exportHistory}
            disabled={loading || exporting || !filteredOrders.length}
            className="bd-button"
            style={{
              border: 'none',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              color: 'white',
              padding: '12px 16px',
              borderRadius: '14px',
              fontWeight: 800,
              cursor: loading || exporting || !filteredOrders.length ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 14px 28px rgba(79, 70, 229, 0.24)',
            }}
          >
            {Icons.download}
            {exporting ? 'Exportando...' : 'Exportar filtro'}
          </button>
        </div>
      </div>

      <div className="bd-history-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '14px', marginBottom: '18px' }}>
        <HistoryStatCard
          active={statusFilter === 'todos'}
          label="Todos"
          value={stats.todos}
          color="#93c5fd"
          onClick={() => setStatusFilter('todos')}
        />
        <HistoryStatCard
          active={statusFilter === 'Pendiente'}
          label="Pendientes"
          value={stats.Pendiente}
          color="#60a5fa"
          onClick={() => setStatusFilter('Pendiente')}
        />
        <HistoryStatCard
          active={statusFilter === 'En preparacion'}
          label="En cocina"
          value={stats['En preparacion']}
          color="#fbbf24"
          onClick={() => setStatusFilter('En preparacion')}
        />
        <HistoryStatCard
          active={statusFilter === 'Preparado'}
          label="Preparados"
          value={stats.Preparado}
          color="#34d399"
          onClick={() => setStatusFilter('Preparado')}
        />
        <HistoryStatCard
          active={statusFilter === 'Enviado'}
          label="Enviados"
          value={stats.Enviado}
          color="#818cf8"
          onClick={() => setStatusFilter('Enviado')}
        />
        <HistoryStatCard
          active={statusFilter === 'Entregado'}
          label="Entregados"
          value={stats.Entregado}
          color="#22c55e"
          onClick={() => setStatusFilter('Entregado')}
        />
      </div>

      <div
        className="bd-glass"
        style={{
          borderRadius: '22px',
          padding: '18px',
          marginBottom: '18px',
          background: 'rgba(15, 23, 42, 0.42)',
        }}
      >
        <div className="bd-history-filters" style={{ display: 'grid', gridTemplateColumns: '1.4fr repeat(4, minmax(0, 1fr))', gap: '12px' }}>
          <div style={{ position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '16px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'rgba(226, 232, 240, 0.45)',
              }}
            >
              {Icons.search}
            </span>
            <input
              className="bd-input"
              type="text"
              value={searchTerm}
              placeholder="Buscar cliente, numero, pedido, cocinero..."
              onChange={(event) => {
                const value = event.target.value;
                startTransition(() => setSearchTerm(value));
              }}
              style={{ padding: '14px 16px 14px 48px', fontSize: '15px' }}
            />
          </div>

          <FilterField label="Desde" icon={Icons.calendar}>
            <input
              className="bd-input"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              style={{ padding: '14px 14px', fontSize: '14px' }}
            />
          </FilterField>

          <FilterField label="Hasta" icon={Icons.calendar}>
            <input
              className="bd-input"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              style={{ padding: '14px 14px', fontSize: '14px' }}
            />
          </FilterField>

          <FilterField label="Estado" icon={Icons.filter}>
            <select
              className="bd-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={{ padding: '14px 14px', fontSize: '14px' }}
            >
              <option value="todos">Todos</option>
              <option value="Pendiente">Pendiente</option>
              <option value="En preparacion">En preparacion</option>
              <option value="Preparado">Preparado</option>
              <option value="Enviado">Enviado</option>
              <option value="Entregado">Entregado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </FilterField>

          <FilterField label="Metodo" icon={Icons.creditCard}>
            <select
              className="bd-select"
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              style={{ padding: '14px 14px', fontSize: '14px' }}
            >
              <option value="todos">Todos</option>
              {paymentOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </FilterField>
        </div>

        <div className="bd-actions-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '14px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            <QuickFilterButton label="Hoy" onClick={() => { const today = hoyISO(); setDateFrom(today); setDateTo(today); }} />
            <QuickFilterButton label="Ultimos 7 dias" onClick={() => { setDateFrom(shiftIsoDate(hoyISO(), -7)); setDateTo(hoyISO()); }} />
            <QuickFilterButton label="Preparados" onClick={() => setStatusFilter('Preparado')} />
            <QuickFilterButton label="Enviados" onClick={() => setStatusFilter('Enviado')} />
            <QuickFilterButton label="Entregados" onClick={() => setStatusFilter('Entregado')} />
          </div>

          <button
            type="button"
            onClick={resetFilters}
            style={{
              border: 'none',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'white',
              padding: '12px 14px',
              borderRadius: '12px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Limpiar filtros
          </button>
        </div>
      </div>

      {loading && !loaded ? (
        <LoadingState />
      ) : !loaded ? (
        <EmptyState
          title="Historial aun no cargado"
          description="Abre esta seccion con conexion activa para sincronizar los pedidos registrados."
        />
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          title="No encontramos pedidos con esos filtros"
          description="Prueba ampliar el rango de fechas o limpiar la busqueda para ver mas resultados."
        />
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
              color: 'rgba(226, 232, 240, 0.72)',
            }}
          >
            <div>
              Mostrando <strong style={{ color: 'white' }}>{visibleOrders.length}</strong> de{' '}
              <strong style={{ color: 'white' }}>{filteredOrders.length}</strong> pedidos filtrados.
            </div>
            <div style={{ fontSize: '13px' }}>
              Rango: {formatDateLabel(dateFrom)} - {formatDateLabel(dateTo)}
            </div>
          </div>

          <div className="bd-history-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '16px' }}>
            {visibleOrders.map((order) => (
              <HistoryCard key={order.firebaseKey} order={order} onOpen={() => setSelectedOrder(order)} />
            ))}
          </div>

          {hasMoreOrders && (
            <button
              type="button"
              onClick={() => setVisibleCount((current) => current + 24)}
              className="bd-button"
              style={{
                width: '100%',
                marginTop: '18px',
                border: '1px solid rgba(129, 140, 248, 0.24)',
                background: 'rgba(99, 102, 241, 0.08)',
                color: '#c7d2fe',
                padding: '15px 16px',
                borderRadius: '16px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Cargar mas pedidos
            </button>
          )}
        </>
      )}

      {selectedOrder && <HistoryDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </div>
  );
}

function HistoryCard({ order, onOpen }) {
  const statusKey = normalizeStatus(order.estado);
  const statusMeta = getStatusMeta(statusKey);
  const paymentTone = getMetodoPagoTone(order.metodoPago || 'Efectivo');

  return (
    <button
      type="button"
      onClick={onOpen}
      className="bd-glass bd-history-card"
      style={{
        borderRadius: '24px',
        padding: '20px',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'inherit',
        background: 'rgba(15, 23, 42, 0.42)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '11px', opacity: 0.54, letterSpacing: '0.08em', fontWeight: 800 }}>PEDIDO</div>
          <div style={{ marginTop: '8px', fontSize: '28px', fontWeight: 900 }}>#{order.id || '--'}</div>
        </div>

        <span
          style={{
            padding: '8px 12px',
            borderRadius: '999px',
            background: statusMeta.soft,
            color: statusMeta.color,
            fontWeight: 900,
            fontSize: '12px',
          }}
        >
          {statusMeta.label}
        </span>
      </div>

      <div style={{ marginTop: '14px', fontSize: '20px', fontWeight: 800 }}>{order.cliente || 'Cliente sin nombre'}</div>
      <div style={{ marginTop: '6px', color: 'rgba(226, 232, 240, 0.7)', fontSize: '14px' }}>
        {order.direccion || 'Sin direccion registrada'}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '16px' }}>
        <MiniChip icon={Icons.calendar} label={formatDateLabel(order.fecha)} tone={{ color: '#93c5fd', soft: 'rgba(59, 130, 246, 0.12)' }} />
        <MiniChip icon={Icons.clock} label={order.timestampIngreso || 'Sin hora'} tone={{ color: '#f8fafc', soft: 'rgba(255, 255, 255, 0.08)' }} />
        <MiniChip icon={Icons.creditCard} label={order.metodoPago || 'Efectivo'} tone={paymentTone} />
        {order.canalLabel && (
          <MiniChip icon={Icons.box} label={order.canalLabel} tone={{ color: '#f97316', soft: 'rgba(249, 115, 22, 0.14)' }} />
        )}
        {order.telefono && (
          <MiniChip icon={Icons.phone} label={order.telefono} tone={{ color: '#34d399', soft: 'rgba(16, 185, 129, 0.12)' }} />
        )}
      </div>

      <div
        style={{
          marginTop: '16px',
          padding: '16px',
          borderRadius: '18px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          color: 'rgba(226, 232, 240, 0.85)',
          lineHeight: 1.6,
          minHeight: '92px',
        }}
      >
        {truncateText(order.pedido || 'Sin detalle de pedido', 150)}
      </div>

      <div className="bd-actions-row" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '18px', alignItems: 'center' }}>
        <div style={{ display: 'grid', gap: '8px' }}>
          <ResponsibleLine label="Cocina" value={order.cocinero || 'Sin asignar'} icon={Icons.user} />
          <ResponsibleLine label="Entrega" value={order.repartidor || 'Sin asignar'} icon={Icons.truck} />
        </div>

        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            color: '#c7d2fe',
            fontWeight: 900,
          }}
        >
          {Icons.eye}
          Ver detalle
        </span>
      </div>
    </button>
  );
}

function HistoryDetailModal({ order, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const statusKey = normalizeStatus(order.estado);
  const statusMeta = getStatusMeta(statusKey);
  const paymentTone = getMetodoPagoTone(order.metodoPago || 'Efectivo');

  return (
    <div
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1500,
        background: 'rgba(2, 6, 23, 0.78)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="bd-modal-shell bd-glass bd-animate"
        style={{
          width: 'min(1080px, 100%)',
          maxHeight: 'calc(100vh - 48px)',
          overflow: 'auto',
          borderRadius: '30px',
          padding: '26px',
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(30, 41, 59, 0.94))',
          boxShadow: '0 34px 70px rgba(2, 6, 23, 0.42)',
        }}
      >
        <div className="bd-history-header" style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '34px', fontWeight: 900 }}>Pedido #{order.id || '--'}</div>
              <span
                style={{
                  padding: '8px 12px',
                  borderRadius: '999px',
                  background: statusMeta.soft,
                  color: statusMeta.color,
                  fontWeight: 900,
                  fontSize: '12px',
                }}
              >
                {statusMeta.label}
              </span>
            </div>
            <div style={{ marginTop: '8px', color: 'rgba(226, 232, 240, 0.7)' }}>
              {formatDateLabel(order.fecha)} · Ingreso {order.timestampIngreso || 'Sin hora registrada'}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: 'none',
              background: 'rgba(255, 255, 255, 0.08)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Cerrar detalle"
          >
            {Icons.close}
          </button>
        </div>

        <div className="bd-modal-grid" style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.95fr', gap: '18px' }}>
          <div style={{ display: 'grid', gap: '18px' }}>
            <DetailPanel title="Cliente" icon={Icons.user}>
              <div className="bd-history-filters" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <DetailStat label="Nombre" value={order.cliente || 'Sin nombre'} />
                <DetailStat label="Codigo" value={order.clienteCodigo || '-'} />
                <DetailStat label="Telefono" value={order.telefono || 'Sin telefono'} />
                <DetailStat label="Metodo de pago" value={order.metodoPago || 'Efectivo'} accent={paymentTone.color} />
                <DetailStat label="Canal" value={order.canalLabel || order.canal || 'Manual'} accent="#f97316" />
                <DetailStat label="Direccion" value={order.direccion || 'Sin direccion'} />
                <DetailStat label="Total" value={order.total ? `C$${Number(order.total).toFixed(2)}` : 'Sin total'} />
              </div>
            </DetailPanel>

            <DetailPanel title="Detalle del pedido" icon={Icons.notes}>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: "'Segoe UI', system-ui, sans-serif",
                  fontSize: '16px',
                  lineHeight: 1.75,
                  color: '#e2e8f0',
                }}
              >
                {order.pedido || 'Sin detalle'}
              </pre>
            </DetailPanel>
          </div>

          <div style={{ display: 'grid', gap: '18px' }}>
            <DetailPanel title="Trazabilidad" icon={Icons.clock}>
              <TimelineItem label="Fecha del pedido" value={formatDateLabel(order.fecha)} accent="#93c5fd" />
              <TimelineItem label="Hora de ingreso" value={order.timestampIngreso || 'Sin registro'} accent="#38bdf8" />
              <TimelineItem label="Inicio en cocina" value={order.timestampPreparacion || 'Sin registro'} accent="#fbbf24" />
              <TimelineItem label="Pedido preparado" value={order.timestampPreparado || 'Sin registro'} accent="#34d399" />
              <TimelineItem label="Pedido enviado" value={order.timestampEnviado || 'Sin registro'} accent="#818cf8" />
              <TimelineItem label="Pedido entregado" value={order.timestampEntregado || 'Sin registro'} accent="#22c55e" />
              <TimelineItem label="Ultima actualizacion" value={formatDateTimeLabel(order.timestamp)} accent="#c084fc" />
            </DetailPanel>

            <DetailPanel title="Responsables" icon={Icons.user}>
              <DetailStat label="Cocinero" value={order.cocinero || 'Sin asignar'} />
              <DetailStat label="Repartidor" value={order.repartidor || 'Sin asignar'} />
              <DetailStat label="Estado actual" value={statusMeta.label} accent={statusMeta.color} />
              <DetailStat label="Clave interna" value={order.firebaseKey || '-'} />
            </DetailPanel>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ title, icon, children }) {
  return (
    <div
      className="bd-glass"
      style={{
        borderRadius: '24px',
        padding: '20px',
        background: 'rgba(255, 255, 255, 0.04)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <span style={{ color: '#93c5fd' }}>{icon}</span>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(226, 232, 240, 0.58)' }}>
          {title.toUpperCase()}
        </div>
      </div>
      {children}
    </div>
  );
}

function DetailStat({ label, value, accent = '#f8fafc' }) {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderRadius: '18px',
        background: 'rgba(15, 23, 42, 0.42)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
      }}
    >
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(226, 232, 240, 0.48)', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: '8px', fontSize: '15px', fontWeight: 800, color: accent, lineHeight: 1.6, overflowWrap: 'anywhere' }}>
        {value}
      </div>
    </div>
  );
}

function TimelineItem({ label, value, accent }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr',
        gap: '12px',
        alignItems: 'start',
        padding: '10px 0',
      }}
    >
      <span
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '999px',
          background: accent,
          marginTop: '6px',
          boxShadow: `0 0 0 6px ${accent}20`,
        }}
      />
      <div>
        <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(226, 232, 240, 0.48)', textTransform: 'uppercase' }}>
          {label}
        </div>
        <div style={{ marginTop: '6px', fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>{value}</div>
      </div>
    </div>
  );
}

function FilterField({ label, icon, children }) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '8px',
          fontSize: '12px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          color: 'rgba(226, 232, 240, 0.58)',
          textTransform: 'uppercase',
        }}
      >
        <span>{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function QuickFilterButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(255, 255, 255, 0.05)',
        color: '#e2e8f0',
        padding: '10px 12px',
        borderRadius: '999px',
        fontWeight: 800,
        fontSize: '13px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}

function HistoryStatCard({ active, label, value, color, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bd-button"
      style={{
        border: active ? `1px solid ${color}` : '1px solid rgba(255, 255, 255, 0.08)',
        background: active ? `${color}1f` : 'rgba(255, 255, 255, 0.04)',
        borderRadius: '20px',
        padding: '18px',
        textAlign: 'left',
        color: 'inherit',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(226, 232, 240, 0.58)' }}>{label.toUpperCase()}</div>
      <div style={{ marginTop: '10px', fontSize: '30px', fontWeight: 900, color }}>{value}</div>
    </button>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div
      className="bd-glass"
      style={{
        borderRadius: '22px',
        padding: '18px',
        background: 'rgba(255, 255, 255, 0.04)',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 800, letterSpacing: '0.08em', color: 'rgba(226, 232, 240, 0.56)' }}>
        {label.toUpperCase()}
      </div>
      <div style={{ marginTop: '10px', fontSize: '30px', fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

function MiniChip({ icon, label, tone }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px 12px',
        borderRadius: '999px',
        background: tone.soft,
        color: tone.color,
        fontWeight: 800,
        fontSize: '12px',
      }}
    >
      <span style={{ display: 'inline-flex' }}>{icon}</span>
      {label}
    </span>
  );
}

function ResponsibleLine({ label, value, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(226, 232, 240, 0.7)' }}>
      <span style={{ color: 'rgba(226, 232, 240, 0.48)' }}>{icon}</span>
      <span style={{ opacity: 0.72 }}>{label}:</span>
      <strong style={{ color: '#f8fafc' }}>{value}</strong>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className="bd-glass bd-animate"
      style={{
        borderRadius: '24px',
        padding: '40px 24px',
        textAlign: 'center',
        background: 'rgba(15, 23, 42, 0.42)',
      }}
    >
      <div style={{ fontSize: '20px', fontWeight: 900 }}>Cargando historial...</div>
      <div style={{ marginTop: '8px', color: 'rgba(226, 232, 240, 0.64)' }}>
        Estamos trayendo los pedidos para preparar los filtros y el detalle.
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div
      className="bd-glass bd-animate"
      style={{
        borderRadius: '24px',
        padding: '44px 24px',
        textAlign: 'center',
        background: 'rgba(15, 23, 42, 0.42)',
      }}
    >
      <div style={{ fontSize: '22px', fontWeight: 900 }}>{title}</div>
      <div style={{ marginTop: '8px', color: 'rgba(226, 232, 240, 0.66)', maxWidth: '520px', marginInline: 'auto', lineHeight: 1.6 }}>
        {description}
      </div>
    </div>
  );
}
