import React, { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatOrderNumber } from '../../services/orders';
import {
  buildOrderTraceSummary,
  buildOrderTraceTimeline,
  filterOrderTraceHistory,
  getOrderTraceBranchName,
  getOrderTraceBranchOptions,
  getOrderTraceChannel,
  getOrderTraceChannelLabel,
  getOrderTraceStatusKey,
  getOrderTraceStatusLabel,
  ORDER_TRACE_STATUS_OPTIONS,
} from '../../services/orderTraceability';

const moneyFormatter = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('es-NI', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const formatDate = (value = '') => {
  const date = new Date(`${String(value || '').trim()}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value || '-' : dateFormatter.format(date);
};

const formatDateTime = (value) => {
  const numericValue = Number(value || 0);
  if (!numericValue || numericValue < 1_000_000_000) return String(value || 'Sin registro');
  const date = new Date(numericValue);
  return Number.isNaN(date.getTime()) ? String(value || 'Sin registro') : dateTimeFormatter.format(date);
};

const formatEventTime = (value, orderDate) => {
  const numericValue = Number(value || 0);
  if (numericValue >= 1_000_000_000) return dateTimeFormatter.format(new Date(numericValue));
  if (value) return `${formatDate(orderDate)} · ${value}`;
  return 'Sin registro';
};

const orderKey = (order = {}) =>
  String(order?.firebaseKey || `${order?.fecha || 'pedido'}-${order?.id || 'sin-numero'}`);

function TraceIcon({ name }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="2.5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
    filter: <path d="M4 5h16l-6 7v6l-4 2v-8Z" />,
    user: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    store: <><path d="M4 9h16l-1.5-5h-13Z" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    kitchen: <><path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4" /></>,
    truck: <><path d="M3 6h11v10H3ZM14 10h4l3 3v3h-7Z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
    receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6M9 12h6" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.history}
    </svg>
  );
}

function StatusPill({ order }) {
  const statusKey = getOrderTraceStatusKey(order);
  return <span className={`trace-status trace-status-${statusKey}`}>{getOrderTraceStatusLabel(order)}</span>;
}

function SummaryCard({ icon, label, value, helper, tone }) {
  return (
    <article className={`trace-summary-card trace-summary-${tone}`}>
      <span><TraceIcon name={icon} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
    </article>
  );
}

function HistorySkeleton() {
  return (
    <div className="trace-skeleton" aria-label="Cargando historial">
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}

function DetailField({ label, value, wide = false }) {
  return (
    <div className={`trace-detail-field${wide ? ' trace-detail-field-wide' : ''}`}>
      <span>{label}</span>
      <strong>{value || 'Sin registro'}</strong>
    </div>
  );
}

function OrderTraceModal({ order, onClose }) {
  const timeline = useMemo(() => buildOrderTraceTimeline(order), [order]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="trace-modal-backdrop admin-viewport-dialog"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="trace-modal admin-viewport-dialog__panel" role="dialog" aria-modal="true" aria-labelledby="trace-modal-title">
        <header className="trace-modal-header">
          <div>
            <span>EXPEDIENTE OPERATIVO</span>
            <div className="trace-modal-title-row">
              <h2 id="trace-modal-title">Pedido #{formatOrderNumber(order)}</h2>
              <StatusPill order={order} />
            </div>
            <p>{formatDate(order.fecha)} · Ingreso {order.timestampIngreso || formatDateTime(order.timestampIngresoMs)}</p>
          </div>
          <button type="button" className="trace-modal-close" onClick={onClose} aria-label="Cerrar trazabilidad">
            <TraceIcon name="close" />
          </button>
        </header>

        <div className="trace-modal-body">
          <div className="trace-modal-main">
            <section className="trace-detail-panel">
              <div className="trace-detail-heading"><TraceIcon name="user" /><h3>Pedido y cliente</h3></div>
              <div className="trace-detail-grid">
                <DetailField label="Cliente" value={order.cliente || 'Cliente sin nombre'} />
                <DetailField label="Telefono" value={order.telefono} />
                <DetailField label="Canal" value={getOrderTraceChannelLabel(order)} />
                <DetailField label="Sucursal" value={getOrderTraceBranchName(order)} />
                <DetailField label="Metodo de pago" value={order.metodoPago || 'Efectivo'} />
                <DetailField label="Total" value={moneyFormatter.format(Number(order.total || 0))} />
                <DetailField label="Direccion" value={order.direccion} wide />
                <DetailField label="Referencia" value={order.referencia} wide />
              </div>
            </section>

            <section className="trace-detail-panel">
              <div className="trace-detail-heading"><TraceIcon name="receipt" /><h3>Detalle registrado</h3></div>
              <pre className="trace-order-copy">{order.pedido || 'Este pedido no tiene detalle textual guardado.'}</pre>
              {order.observaciones ? <p className="trace-order-notes"><strong>Observaciones:</strong> {order.observaciones}</p> : null}
            </section>

            <section className="trace-detail-panel trace-internal-panel">
              <div className="trace-detail-heading"><TraceIcon name="history" /><h3>Registro interno</h3></div>
              <div className="trace-detail-grid">
                <DetailField label="Clave en base de datos" value={order.firebaseKey} wide />
                <DetailField label="Ultima actualizacion" value={formatDateTime(order.timestamp)} />
                <DetailField label="Fuente archivada" value={order.archivedSource || 'Pedidos activos'} />
              </div>
            </section>
          </div>

          <aside className="trace-timeline-panel">
            <div className="trace-detail-heading"><TraceIcon name="history" /><h3>Trazabilidad</h3></div>
            <p className="trace-timeline-intro">Horas y responsables guardados durante la operacion.</p>
            <ol className="trace-timeline">
              {timeline.map((event) => (
                <li key={event.id} className={`${event.recorded ? 'recorded' : 'missing'} event-${event.id}`}>
                  <span className="trace-timeline-marker" />
                  <div>
                    <strong>{event.label}</strong>
                    <time>{formatEventTime(event.time, order.fecha)}</time>
                    <small>{event.actor ? `${event.actorLabel}: ${event.actor}` : `${event.actorLabel}: Sin registro`}</small>
                  </div>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </div>
  );
}

function MobileOrderCard({ order, onOpen }) {
  const kitchen = String(order?.cocinero || '').trim();
  const driver = String(order?.repartidorPublico || order?.repartidor || order?.entregadoPor || '').trim();

  return (
    <article className="trace-mobile-card">
      <div className="trace-mobile-card-top">
        <div><small>PEDIDO</small><strong>#{formatOrderNumber(order)}</strong></div>
        <StatusPill order={order} />
      </div>
      <h3>{order.cliente || 'Cliente sin nombre'}</h3>
      <p>{formatDate(order.fecha)} · {order.timestampIngreso || 'Sin hora de ingreso'}</p>
      <div className="trace-mobile-meta">
        <span><TraceIcon name="store" />{getOrderTraceChannelLabel(order)}</span>
        <span><TraceIcon name="kitchen" />{kitchen || 'Cocina sin asignar'}</span>
        <span><TraceIcon name="truck" />{driver || 'Driver sin asignar'}</span>
      </div>
      <button type="button" onClick={onOpen}><TraceIcon name="eye" />Ver trazabilidad</button>
    </article>
  );
}

export default function OrderHistoryReport({
  orders = [],
  loading = false,
  error = '',
  warning = '',
  availableDateFrom = '',
  availableDateTo = '',
  lastUpdated = null,
  onRefresh,
}) {
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState(availableDateFrom);
  const [dateTo, setDateTo] = useState(availableDateTo);
  const [status, setStatus] = useState('all');
  const [channel, setChannel] = useState('all');
  const [branchId, setBranchId] = useState('all');
  const [visibleCount, setVisibleCount] = useState(30);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (availableDateFrom) setDateFrom((current) => current || availableDateFrom);
    if (availableDateTo) setDateTo((current) => current || availableDateTo);
  }, [availableDateFrom, availableDateTo]);

  const branchOptions = useMemo(() => getOrderTraceBranchOptions(orders), [orders]);
  const filteredOrders = useMemo(
    () => filterOrderTraceHistory(orders, { search: deferredSearch, dateFrom, dateTo, status, channel, branchId }),
    [branchId, channel, dateFrom, dateTo, deferredSearch, orders, status]
  );
  const summary = useMemo(() => buildOrderTraceSummary(filteredOrders), [filteredOrders]);
  const visibleOrders = filteredOrders.slice(0, visibleCount);
  const hasFilters = Boolean(search || status !== 'all' || channel !== 'all' || branchId !== 'all' || dateFrom !== availableDateFrom || dateTo !== availableDateTo);

  useEffect(() => setVisibleCount(30), [branchId, channel, dateFrom, dateTo, deferredSearch, status]);

  const resetFilters = () => {
    setSearch('');
    setDateFrom(availableDateFrom);
    setDateTo(availableDateTo);
    setStatus('all');
    setChannel('all');
    setBranchId('all');
  };

  if (loading) return <HistorySkeleton />;

  if (error) {
    return (
      <div className="reports-error trace-history-error" role="alert">
        <strong>No se pudo cargar el historial</strong>
        <span>{error}</span>
        <button type="button" onClick={onRefresh}>Reintentar</button>
      </div>
    );
  }

  return (
    <main className="reports-content trace-history-content">
      <section className="trace-history-intro">
        <div>
          <span className="reports-panel-kicker">Base de datos operativa</span>
          <h2>Historial de pedidos</h2>
          <p>Consulta cada pedido y revisa responsables, horas y recorrido completo.</p>
        </div>
        <div className="trace-history-actions">
          {lastUpdated ? <small>Actualizado {new Date(lastUpdated).toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}</small> : null}
          <button type="button" className="reports-refresh" onClick={onRefresh}>
            <TraceIcon name="refresh" /><span>Actualizar</span>
          </button>
        </div>
      </section>

      <div className="trace-retention-note">
        <TraceIcon name="history" />
        <div>
          <strong>Historial disponible: {formatDate(availableDateFrom)} al {formatDate(availableDateTo)}</strong>
          <span>Incluye pedidos activos y archivados que conserva actualmente el sistema.</span>
        </div>
      </div>

      {warning ? <div className="reports-warning" role="status">{warning}</div> : null}

      <section className="trace-summary-grid" aria-label="Resumen del historial filtrado">
        <SummaryCard icon="receipt" label="Pedidos encontrados" value={summary.total} helper="Segun filtros actuales" tone="navy" />
        <SummaryCard icon="store" label="Tienda Virtual" value={summary.store} helper="Pedidos originados online" tone="blue" />
        <SummaryCard icon="history" label="Ingreso manual" value={summary.manual} helper="Pedidos registrados por el equipo" tone="gold" />
        <SummaryCard icon="truck" label="Entregados" value={summary.delivered} helper="Con estado final entregado" tone="green" />
      </section>

      <section className="trace-filter-panel">
        <div className="trace-search-field">
          <TraceIcon name="search" />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              const value = event.target.value;
              startTransition(() => setSearch(value));
            }}
            placeholder="Buscar pedido, cliente, telefono, cocinero o driver"
            aria-label="Buscar en historial"
          />
        </div>
        <label><span>Desde</span><input type="date" min={availableDateFrom} max={dateTo || availableDateTo} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label><span>Hasta</span><input type="date" min={dateFrom || availableDateFrom} max={availableDateTo} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
        <label><span>Estado</span><select value={status} onChange={(event) => setStatus(event.target.value)}>{ORDER_TRACE_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span>Canal</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option value="all">Todos los canales</option><option value="store">Tienda Virtual</option><option value="manual">Ingreso manual</option></select></label>
        <label><span>Sucursal</span><select value={branchId} onChange={(event) => setBranchId(event.target.value)}><option value="all">Todas</option>{branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <button type="button" className="trace-clear-filters" onClick={resetFilters} disabled={!hasFilters}><TraceIcon name="filter" />Limpiar</button>
      </section>

      {filteredOrders.length === 0 ? (
        <div className="reports-empty trace-history-empty">
          <span><TraceIcon name="search" /></span>
          <strong>No encontramos pedidos</strong>
          <p>Amplia las fechas o limpia los filtros para consultar otros registros.</p>
        </div>
      ) : (
        <section className="trace-results-panel">
          <div className="trace-results-heading">
            <div><strong>{filteredOrders.length} pedidos</strong><span>Mostrando {visibleOrders.length}</span></div>
            <small>Selecciona un pedido para abrir su expediente.</small>
          </div>

          <div className="trace-table-wrap">
            <table className="trace-table">
              <thead><tr><th>Pedido</th><th>Fecha y cliente</th><th>Canal</th><th>Estado</th><th>Cocina</th><th>Entrega</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                {visibleOrders.map((order) => {
                  const kitchen = String(order?.cocinero || '').trim();
                  const driver = String(order?.repartidorPublico || order?.repartidor || order?.entregadoPor || '').trim();
                  return (
                    <tr key={orderKey(order)}>
                      <td><strong>#{formatOrderNumber(order)}</strong><small>{order.timestampIngreso || 'Sin hora'}</small></td>
                      <td><strong>{order.cliente || 'Cliente sin nombre'}</strong><small>{formatDate(order.fecha)} · {getOrderTraceBranchName(order)}</small></td>
                      <td><span className={`trace-channel trace-channel-${getOrderTraceChannel(order)}`}>{getOrderTraceChannelLabel(order)}</span></td>
                      <td><StatusPill order={order} /></td>
                      <td><strong>{kitchen || 'Sin asignar'}</strong><small>{order.timestampPreparacion || 'Sin hora'}</small></td>
                      <td><strong>{driver || 'Sin asignar'}</strong><small>{order.timestampEntregado || order.timestampEnviado || 'Sin hora'}</small></td>
                      <td><button type="button" className="trace-open-button" onClick={() => setSelectedOrder(order)} aria-label={`Ver trazabilidad del pedido ${formatOrderNumber(order)}`}><TraceIcon name="eye" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="trace-mobile-list">
            {visibleOrders.map((order) => <MobileOrderCard key={orderKey(order)} order={order} onOpen={() => setSelectedOrder(order)} />)}
          </div>

          {visibleOrders.length < filteredOrders.length ? (
            <button type="button" className="trace-load-more" onClick={() => setVisibleCount((value) => value + 30)}>Cargar 30 pedidos mas</button>
          ) : null}
        </section>
      )}

      {selectedOrder
        ? createPortal(
            <OrderTraceModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />,
            document.body
          )
        : null}
    </main>
  );
}
