import React, { startTransition, useEffect, useMemo, useState } from 'react';
import {
  fetchCloudOrderHistoryByDateRange,
  mergeOrderHistoryRecords,
} from '../services/orderHistoryCloud';
import { fetchOrdersByDateRange } from '../services/orders';
import {
  buildAdminSalesReport,
  formatReportDateKey,
  getReportBranchOptions,
  getReportDateRange,
  REPORT_PERIOD_OPTIONS,
} from '../services/adminReports';
import { getOrderHistoryRetentionStartDate } from '../services/orderArchive';
import OrderHistoryReport from './reports/OrderHistoryReport';
import '../styles/adminReports2026.css';

const moneyFormatter = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-NI');

const formatMoney = (value) => moneyFormatter.format(Number(value || 0));
const formatNumber = (value) => numberFormatter.format(Number(value || 0));

const formatDateLabel = (value, includeYear = false) => {
  if (!value) return '-';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString('es-NI', {
    day: 'numeric',
    month: 'short',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
};

const formatUpdatedAt = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('es-NI', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

function ReportIcon({ name }) {
  const paths = {
    sales: <path d="M4 19V9m6 10V5m6 14v-7m4 7H2" />,
    orders: <><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
    store: <><path d="M4 9h16l-1.5-5h-13z" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    ticket: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>,
    truck: <><path d="M3 6h11v10H3zM14 10h4l3 3v3h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
    driver: <><circle cx="12" cy="8" r="4" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    branch: <><path d="M4 21V7l8-4 8 4v14" /><path d="M8 10h1m6 0h1m-8 4h1m6 0h1m-5 7v-4h2v4" /></>,
  };

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.orders}
    </svg>
  );
}

function TrendBadge({ value, inverse = false }) {
  if (value === null || value === undefined) {
    return <span className="reports-trend neutral">Sin base anterior</span>;
  }

  const positive = inverse ? value <= 0 : value >= 0;
  return (
    <span className={`reports-trend ${positive ? 'positive' : 'negative'}`}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  );
}

function KpiCard({ icon, label, value, helper, trend, tone = 'blue' }) {
  return (
    <article className={`reports-kpi reports-kpi-${tone}`}>
      <div className="reports-kpi-top">
        <span className="reports-kpi-icon"><ReportIcon name={icon} /></span>
        {trend !== undefined ? <TrendBadge value={trend} /> : null}
      </div>
      <span className="reports-kpi-label">{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function ReportSkeleton() {
  return (
    <div className="reports-loading" aria-label="Cargando reportes">
      <div className="reports-skeleton reports-skeleton-kpis" />
      <div className="reports-skeleton reports-skeleton-chart" />
      <div className="reports-skeleton reports-skeleton-table" />
    </div>
  );
}

function EmptyReport({ title, message }) {
  return (
    <div className="reports-empty">
      <span><ReportIcon name="orders" /></span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}

export default function CrmView() {
  const [activeSection, setActiveSection] = useState('performance');
  const [periodDays, setPeriodDays] = useState(7);
  const [branchId, setBranchId] = useState('all');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [partialWarning, setPartialWarning] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyWarning, setHistoryWarning] = useState('');
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState(null);
  const [historyReloadKey, setHistoryReloadKey] = useState(0);
  const [historyLoadedKey, setHistoryLoadedKey] = useState(-1);

  const range = useMemo(() => getReportDateRange(periodDays), [periodDays]);
  const historyRange = useMemo(
    () => ({
      dateFrom: getOrderHistoryRetentionStartDate(),
      dateTo: formatReportDateKey(),
    }),
    []
  );

  useEffect(() => {
    let cancelled = false;

    const loadReportOrders = async () => {
      setLoading(true);
      setError('');
      setPartialWarning('');

      const [cloudResult, liveResult] = await Promise.allSettled([
        fetchCloudOrderHistoryByDateRange(range.previousDateFrom, range.dateTo),
        fetchOrdersByDateRange(range.previousDateFrom, range.dateTo),
      ]);

      if (cancelled) return;

      const cloudOrders = cloudResult.status === 'fulfilled' ? cloudResult.value : [];
      const liveOrders = liveResult.status === 'fulfilled' ? liveResult.value : [];

      if (cloudResult.status === 'rejected' && liveResult.status === 'rejected') {
        console.error('No se pudieron cargar los pedidos para reportes:', {
          cloud: cloudResult.reason,
          live: liveResult.reason,
        });
        setError('No pudimos cargar los pedidos. Revisa la conexion e intenta nuevamente.');
        setLoading(false);
        return;
      }

      if (cloudResult.status === 'rejected') {
        console.warn('Reportes cargados sin historial cloud:', cloudResult.reason);
        setPartialWarning('Mostrando los pedidos disponibles actualmente. Parte del historial podria faltar.');
      } else if (liveResult.status === 'rejected') {
        console.warn('Reportes cargados sin pedidos activos:', liveResult.reason);
        setPartialWarning('Mostrando el historial guardado. Los pedidos mas recientes podrian tardar en aparecer.');
      }

      startTransition(() => {
        setOrders(mergeOrderHistoryRecords(cloudOrders, liveOrders));
        setLastUpdated(Date.now());
        setLoading(false);
      });
    };

    loadReportOrders();
    return () => {
      cancelled = true;
    };
  }, [range.dateTo, range.previousDateFrom, reloadKey]);

  useEffect(() => {
    if (activeSection !== 'history' || historyLoadedKey === historyReloadKey) return undefined;

    let cancelled = false;
    const loadHistoryOrders = async () => {
      setHistoryLoading(true);
      setHistoryError('');
      setHistoryWarning('');

      const [cloudResult, liveResult] = await Promise.allSettled([
        fetchCloudOrderHistoryByDateRange(historyRange.dateFrom, historyRange.dateTo),
        fetchOrdersByDateRange(historyRange.dateFrom, historyRange.dateTo),
      ]);

      if (cancelled) return;

      const cloudOrders = cloudResult.status === 'fulfilled' ? cloudResult.value : [];
      const liveOrders = liveResult.status === 'fulfilled' ? liveResult.value : [];

      if (cloudResult.status === 'rejected' && liveResult.status === 'rejected') {
        console.error('No se pudo cargar el historial de reportes:', {
          cloud: cloudResult.reason,
          live: liveResult.reason,
        });
        setHistoryError('No pudimos consultar los pedidos archivados ni los pedidos activos.');
        setHistoryLoadedKey(historyReloadKey);
        setHistoryLoading(false);
        return;
      }

      if (cloudResult.status === 'rejected') {
        console.warn('Historial de reportes cargado sin archivo cloud:', cloudResult.reason);
        setHistoryWarning('Se muestran los pedidos activos; parte del historial archivado podria faltar.');
      } else if (liveResult.status === 'rejected') {
        console.warn('Historial de reportes cargado sin pedidos activos:', liveResult.reason);
        setHistoryWarning('Se muestra el archivo historico; los pedidos mas recientes podrian tardar en aparecer.');
      }

      startTransition(() => {
        setHistoryOrders(mergeOrderHistoryRecords(cloudOrders, liveOrders));
        setHistoryUpdatedAt(Date.now());
        setHistoryLoadedKey(historyReloadKey);
        setHistoryLoading(false);
      });
    };

    loadHistoryOrders();
    return () => {
      cancelled = true;
    };
  }, [activeSection, historyLoadedKey, historyRange, historyReloadKey]);

  const branchOptions = useMemo(() => getReportBranchOptions(orders), [orders]);

  useEffect(() => {
    if (branchId !== 'all' && !branchOptions.some((branch) => branch.id === branchId)) {
      setBranchId('all');
    }
  }, [branchId, branchOptions]);

  const report = useMemo(
    () => buildAdminSalesReport(orders, { ...range, branchId }),
    [branchId, orders, range]
  );

  const maxDailyOrders = Math.max(1, ...report.daily.map((row) => row.totalOrders));
  const maxStatusCount = Math.max(1, ...report.statuses.map((row) => row.count));
  const hasCurrentOrders = report.current.totalOrders > 0;

  return (
    <div className="admin-reports-page">
      <header className="reports-page-header">
        <div>
          <span className="reports-eyebrow">Administracion operativa</span>
          <h1>Reportes</h1>
          <p>
            {activeSection === 'performance'
              ? `Rendimiento comercial y entregas del ${formatDateLabel(range.dateFrom)} al ${formatDateLabel(range.dateTo, true)}.`
              : 'Consulta todos los pedidos disponibles y revisa su trazabilidad operativa.'}
          </p>
        </div>

        {activeSection === 'performance' ? <div className="reports-toolbar">
          <label className="reports-branch-select">
            <span>Sucursal</span>
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="all">Todas las sucursales</option>
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>

          <div className="reports-period" aria-label="Periodo del reporte">
            {REPORT_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={periodDays === option.value ? 'active' : ''}
                aria-pressed={periodDays === option.value}
                onClick={() => setPeriodDays(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="reports-refresh"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading}
          >
            <ReportIcon name="refresh" />
            <span>{loading ? 'Actualizando' : 'Actualizar'}</span>
          </button>
        </div> : null}
      </header>

      <nav className="reports-section-tabs" aria-label="Apartados de reportes">
        <button
          type="button"
          className={activeSection === 'performance' ? 'active' : ''}
          aria-current={activeSection === 'performance' ? 'page' : undefined}
          onClick={() => setActiveSection('performance')}
        >
          <ReportIcon name="sales" />
          <span><strong>Rendimiento</strong><small>Ventas, pedidos y drivers</small></span>
        </button>
        <button
          type="button"
          className={activeSection === 'history' ? 'active' : ''}
          aria-current={activeSection === 'history' ? 'page' : undefined}
          onClick={() => setActiveSection('history')}
        >
          <ReportIcon name="orders" />
          <span><strong>Historial y trazabilidad</strong><small>Base de datos de pedidos</small></span>
        </button>
      </nav>

      {activeSection === 'history' ? (
        <OrderHistoryReport
          orders={historyOrders}
          loading={historyLoading}
          error={historyError}
          warning={historyWarning}
          availableDateFrom={historyRange.dateFrom}
          availableDateTo={historyRange.dateTo}
          lastUpdated={historyUpdatedAt}
          onRefresh={() => setHistoryReloadKey((value) => value + 1)}
        />
      ) : (
        <>

      <div className="reports-scope-note">
        <ReportIcon name="info" />
        <div>
          <strong>Ventas exclusivamente de Tienda Virtual</strong>
          <span>Los pedidos manuales aparecen solo en el volumen de pedidos por dia. No se suman a ventas, ticket, estados ni rendimiento de drivers.</span>
        </div>
        {lastUpdated ? <small>Actualizado {formatUpdatedAt(lastUpdated)}</small> : null}
      </div>

      {partialWarning ? <div className="reports-warning" role="status">{partialWarning}</div> : null}

      {error ? (
        <div className="reports-error" role="alert">
          <strong>No se pudo abrir el reporte</strong>
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Reintentar</button>
        </div>
      ) : loading ? (
        <ReportSkeleton />
      ) : (
        <main className="reports-content">
          <section className="reports-kpi-grid" aria-label="Indicadores principales">
            <KpiCard
              icon="sales"
              label="Ventas online"
              value={formatMoney(report.current.sales)}
              helper="Pedidos de tienda no cancelados"
              trend={report.trends.sales}
              tone="blue"
            />
            <KpiCard
              icon="orders"
              label="Pedidos totales"
              value={formatNumber(report.current.totalOrders)}
              helper={`${formatNumber(report.current.manualOrders)} manuales incluidos solo aqui`}
              tone="navy"
            />
            <KpiCard
              icon="store"
              label="Pedidos de tienda"
              value={formatNumber(report.current.validStoreOrders)}
              helper={`${formatNumber(report.current.canceledStoreOrders)} cancelados no suman ventas`}
              trend={report.trends.storeOrders}
              tone="red"
            />
            <KpiCard
              icon="ticket"
              label="Ticket promedio"
              value={formatMoney(report.current.averageTicket)}
              helper="Promedio de pedidos online validos"
              trend={report.trends.averageTicket}
              tone="gold"
            />
            <KpiCard
              icon="truck"
              label="Entregas completadas"
              value={`${formatNumber(report.current.deliveredOrders)} / ${formatNumber(report.current.deliveryOrders)}`}
              helper={`${report.current.deliveryCompletionRate.toFixed(1)}% de pedidos delivery online`}
              tone="green"
            />
          </section>

          <section className="reports-performance-strip" aria-label="Rendimiento del periodo">
            <div>
              <span>Ventas vs. periodo anterior</span>
              <strong><TrendBadge value={report.trends.sales} /></strong>
            </div>
            <div>
              <span>Pedidos online vs. anterior</span>
              <strong><TrendBadge value={report.trends.storeOrders} /></strong>
            </div>
            <div>
              <span>Cancelacion online</span>
              <strong>{report.current.cancellationRate.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Tiempo promedio de entrega</span>
              <strong>{report.current.averageDeliveryMinutes ? `${report.current.averageDeliveryMinutes} min` : 'Sin datos'}</strong>
            </div>
          </section>

          {!hasCurrentOrders ? (
            <EmptyReport
              title="No hay pedidos en este periodo"
              message="Cambia el periodo o la sucursal para consultar otra ventana de operacion."
            />
          ) : (
            <>
              <div className="reports-main-grid">
                <section className="reports-panel reports-daily-panel">
                  <div className="reports-panel-heading">
                    <div>
                      <span className="reports-panel-kicker">Volumen operativo</span>
                      <h2>Pedidos por dia</h2>
                      <p>Online y manuales se muestran separados. El monto corresponde solo a Tienda Virtual.</p>
                    </div>
                    <span className="reports-panel-total">{formatNumber(report.current.totalOrders)} pedidos</span>
                  </div>

                  <div className="reports-chart-legend" aria-hidden="true">
                    <span><i className="online" />Tienda Virtual</span>
                    <span><i className="manual" />Ingreso manual</span>
                  </div>

                  <div className="reports-daily-list">
                    {report.daily.map((row) => {
                      const onlineWidth = (row.storeOrders / maxDailyOrders) * 100;
                      const manualWidth = (row.manualOrders / maxDailyOrders) * 100;
                      return (
                        <div className="reports-day-row" key={row.date}>
                          <time dateTime={row.date}>{formatDateLabel(row.date)}</time>
                          <div className="reports-day-bar" aria-label={`${row.totalOrders} pedidos`}>
                            <span className="online" style={{ width: `${onlineWidth}%` }} />
                            <span className="manual" style={{ width: `${manualWidth}%` }} />
                          </div>
                          <div className="reports-day-count">
                            <strong>{row.totalOrders}</strong>
                            <small>{row.storeOrders} online · {row.manualOrders} manual</small>
                          </div>
                          <strong className="reports-day-sales">{formatMoney(row.sales)}</strong>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <aside className="reports-side-column">
                  <section className="reports-panel">
                    <div className="reports-panel-heading compact">
                      <div>
                        <span className="reports-panel-kicker">Flujo online</span>
                        <h2>Estado de pedidos</h2>
                      </div>
                    </div>
                    <div className="reports-status-list">
                      {report.statuses.map((row) => (
                        <div className="reports-status-row" key={row.status}>
                          <div><span>{row.status}</span><strong>{row.count}</strong></div>
                          <div><span style={{ width: `${(row.count / maxStatusCount) * 100}%` }} /></div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="reports-panel">
                    <div className="reports-panel-heading compact">
                      <div>
                        <span className="reports-panel-kicker">Tienda Virtual</span>
                        <h2>Por sucursal</h2>
                      </div>
                    </div>
                    {report.branches.length ? (
                      <div className="reports-branch-list">
                        {report.branches.map((branch) => (
                          <div key={branch.id}>
                            <span className="reports-branch-icon"><ReportIcon name="branch" /></span>
                            <span><strong>{branch.name}</strong><small>{branch.orders} pedidos online</small></span>
                            <strong>{formatMoney(branch.sales)}</strong>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="reports-inline-empty">Sin ventas online para mostrar.</p>
                    )}
                  </section>
                </aside>
              </div>

              <section className="reports-panel reports-drivers-panel">
                <div className="reports-panel-heading">
                  <div>
                    <span className="reports-panel-kicker">Delivery online</span>
                    <h2>Rendimiento de drivers</h2>
                    <p>Solo considera pedidos originados en la Tienda Virtual y excluye retiros y cancelados.</p>
                  </div>
                  <span className="reports-panel-total">{report.drivers.length} drivers</span>
                </div>

                {report.drivers.length ? (
                  <div className="reports-table-wrap">
                    <table className="reports-table">
                      <thead>
                        <tr>
                          <th>Driver</th>
                          <th>Asignados</th>
                          <th>Entregados</th>
                          <th>Cumplimiento</th>
                          <th>Tiempo promedio</th>
                          <th>Ventas atendidas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.drivers.map((driver) => (
                          <tr key={driver.key}>
                            <td><span className="reports-driver-avatar"><ReportIcon name="driver" /></span><strong>{driver.name}</strong></td>
                            <td>{driver.assigned}</td>
                            <td>{driver.delivered}</td>
                            <td><span className="reports-completion"><i style={{ width: `${driver.completionRate}%` }} /></span><strong>{driver.completionRate.toFixed(1)}%</strong></td>
                            <td>{driver.averageMinutes ? `${driver.averageMinutes} min` : 'Sin datos'}</td>
                            <td><strong>{formatMoney(driver.sales)}</strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyReport
                    title="Sin entregas asignadas"
                    message="Los drivers apareceran cuando tengan pedidos online asignados en este periodo."
                  />
                )}
              </section>
            </>
          )}
        </main>
      )}
        </>
      )}
    </div>
  );
}
