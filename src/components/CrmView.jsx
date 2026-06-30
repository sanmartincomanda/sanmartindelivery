import React, { useEffect, useMemo, useState } from 'react';
import { fetchCrmDashboardWithFallback } from '../services/crmBridge';
import { SAN_MARTIN_THEME } from '../styles/sanMartinTheme';

const THEME = SAN_MARTIN_THEME;

const PERIOD_LABELS = {
  today: 'Hoy',
  week: '7 dias',
  month: '30 dias',
  mtd: 'Mes actual',
  quarter: '90 dias',
};

const moneyFormatter = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-NI');

const formatMoney = (value) => moneyFormatter.format(Number(value || 0));
const formatNumber = (value) => numberFormatter.format(Number(value || 0));
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const formatDateTime = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value || '-');
  }

  return date.toLocaleString('es-NI', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatShortDate = (value) => {
  if (!value) {
    return '-';
  }

  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    return String(value || '-');
  }

  return date.toLocaleDateString('es-NI', {
    day: '2-digit',
    month: 'short',
  });
};

function DashboardShell({ children }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: THEME.softGradient,
        padding: '24px',
      }}
    >
      <style>{`
        .crm-period-pill,
        .crm-refresh-button {
          transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease, border-color 140ms ease;
        }

        .crm-period-pill:hover,
        .crm-refresh-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(10, 42, 78, 0.12);
        }

        @media (max-width: 920px) {
          .crm-grid-two,
          .crm-grid-three,
          .crm-grid-four,
          .crm-dual-panels,
          .crm-list-grid {
            grid-template-columns: 1fr !important;
          }

          .crm-header {
            flex-direction: column;
            align-items: flex-start !important;
          }
        }
      `}</style>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, actions = null, children }) {
  return (
    <section
      style={{
        background: 'white',
        borderRadius: 28,
        border: `1px solid ${THEME.border}`,
        boxShadow: `0 18px 46px ${THEME.shadow}`,
        padding: 24,
      }}
    >
      <div
        className="crm-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 24, color: THEME.text }}>{title}</h2>
          {subtitle ? (
            <p style={{ margin: '6px 0 0', color: THEME.textSoft, fontWeight: 700 }}>{subtitle}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function StatCard({ label, value, accent, helper, muted = false }) {
  return (
    <div
      style={{
        borderRadius: 22,
        padding: 20,
        background: muted ? 'rgba(247, 251, 255, 0.9)' : 'white',
        border: `1px solid ${THEME.border}`,
        boxShadow: `0 14px 30px ${THEME.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: THEME.textSoft,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {label}
          </div>
          <div style={{ marginTop: 8, fontSize: 32, fontWeight: 900, color: accent || THEME.text }}>{value}</div>
        </div>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: accent || THEME.blue,
            boxShadow: `0 0 0 8px ${accent || THEME.blue}18`,
            marginTop: 4,
          }}
        />
      </div>
      {helper ? (
        <div style={{ marginTop: 12, color: THEME.textSoft, fontWeight: 700, lineHeight: 1.45 }}>{helper}</div>
      ) : null}
    </div>
  );
}

function MetricMiniCard({ label, value, helper = '' }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        background: 'rgba(247, 251, 255, 0.86)',
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: THEME.textSoft, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: THEME.text }}>{value}</div>
      {helper ? <div style={{ marginTop: 6, color: THEME.textMuted, fontWeight: 700 }}>{helper}</div> : null}
    </div>
  );
}

function EmptyList({ label }) {
  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        border: `1px dashed ${THEME.borderStrong}`,
        color: THEME.textMuted,
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}

function RankedList({ title, items = [], renderMetric, emptyLabel }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 18, color: THEME.text }}>{title}</h3>
      {items.length === 0 ? (
        <EmptyList label={emptyLabel} />
      ) : (
        items.map((item, index) => (
          <div
            key={`${title}-${item.code || item.key || item.name || index}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px minmax(0, 1fr) auto',
              gap: 14,
              alignItems: 'center',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(247, 251, 255, 0.9)',
              border: `1px solid ${THEME.border}`,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 14,
                background: THEME.primaryGradient,
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              {index + 1}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 900, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.name || item.description || item.label || 'Sin nombre'}
              </div>
              <div style={{ color: THEME.textSoft, fontWeight: 700, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.code ? `${item.code} · ` : ''}
                {item.ordersCount ? `${formatNumber(item.ordersCount)} pedidos` : item.salesCount ? `${formatNumber(item.salesCount)} ventas` : ''}
                {item.quantity ? `${item.ordersCount || item.salesCount ? ' · ' : ''}${formatNumber(item.quantity)} uds` : ''}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontWeight: 900, color: THEME.blueDeep }}>{renderMetric(item)}</div>
          </div>
        ))
      )}
    </div>
  );
}

function PaymentList({ items = [], emptyLabel }) {
  if (!items.length) {
    return <EmptyList label={emptyLabel} />;
  }

  const maxTotal = Math.max(...items.map((item) => Number(item.total || 0)), 1);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((item) => {
        const widthPct = Math.max(8, (Number(item.total || 0) / maxTotal) * 100);
        return (
          <div
            key={`payment-${item.name}`}
            style={{
              borderRadius: 18,
              padding: 16,
              border: `1px solid ${THEME.border}`,
              background: 'rgba(247, 251, 255, 0.88)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <strong style={{ color: THEME.text }}>{item.name}</strong>
                <div style={{ color: THEME.textSoft, fontWeight: 700, marginTop: 4 }}>
                  {formatNumber(item.count || 0)} operaciones
                </div>
              </div>
              <div style={{ fontWeight: 900, color: THEME.blueDeep }}>{formatMoney(item.total)}</div>
            </div>
            <div
              style={{
                marginTop: 12,
                height: 10,
                borderRadius: 999,
                background: 'rgba(29, 116, 199, 0.1)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, widthPct)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: THEME.primaryGradient,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DailyTrend({ online = [], sicar = [] }) {
  const rows = useMemo(() => {
    const onlineMap = new Map((Array.isArray(online) ? online : []).map((item) => [item.date, item]));
    const sicarMap = new Map((Array.isArray(sicar) ? sicar : []).map((item) => [item.date, item]));
    const dates = Array.from(new Set([...onlineMap.keys(), ...sicarMap.keys()])).sort();
    return dates.slice(-14).map((date) => ({
      date,
      onlineRevenue: Number(onlineMap.get(date)?.revenue || 0),
      sicarRevenue: Number(sicarMap.get(date)?.revenue || 0),
    }));
  }, [online, sicar]);

  if (!rows.length) {
    return <EmptyList label="Aun no hay tendencia suficiente para mostrar." />;
  }

  const maxValue = Math.max(
    ...rows.flatMap((row) => [row.onlineRevenue, row.sicarRevenue]),
    1
  );

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <LegendDot color={THEME.blue} label="Tienda en linea" />
        <LegendDot color={THEME.gold} label="Ventas SICAR" />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`,
          gap: 10,
          alignItems: 'end',
          minHeight: 220,
        }}
      >
        {rows.map((row) => (
          <div key={row.date} style={{ display: 'grid', gap: 10 }}>
            <div
              style={{
                height: 160,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <div
                title={`Tienda ${formatShortDate(row.date)}: ${formatMoney(row.onlineRevenue)}`}
                style={{
                  width: 16,
                  height: `${Math.max(6, (row.onlineRevenue / maxValue) * 160)}px`,
                  borderRadius: 999,
                  background: THEME.blue,
                }}
              />
              <div
                title={`SICAR ${formatShortDate(row.date)}: ${formatMoney(row.sicarRevenue)}`}
                style={{
                  width: 16,
                  height: `${Math.max(6, (row.sicarRevenue / maxValue) * 160)}px`,
                  borderRadius: 999,
                  background: THEME.gold,
                }}
              />
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: THEME.textSoft }}>
              {formatShortDate(row.date)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LegendDot({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: THEME.text, fontWeight: 800 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
      {label}
    </div>
  );
}

function RecentList({ items = [], type = 'online' }) {
  if (!items.length) {
    return <EmptyList label="Aun no hay operaciones recientes en esta ventana." />;
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {items.map((item, index) => (
        <div
          key={`${type}-${item.orderKey || item.saleId || index}`}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 12,
            padding: '14px 16px',
            borderRadius: 18,
            border: `1px solid ${THEME.border}`,
            background: 'rgba(247, 251, 255, 0.88)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, color: THEME.text }}>
              {type === 'online' ? `Pedido #${item.orderNumber}` : `Venta #${item.saleId}`}
            </div>
            <div
              style={{
                marginTop: 4,
                color: THEME.textSoft,
                fontWeight: 700,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.customer || 'Cliente sin nombre'}
            </div>
            <div style={{ marginTop: 4, color: THEME.textMuted, fontWeight: 700 }}>
              {formatDateTime(item.dateTime)} · {item.payment || 'Sin metodo'}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 900, color: THEME.blueDeep }}>{formatMoney(item.total)}</div>
            <div style={{ marginTop: 4, color: THEME.textSoft, fontWeight: 700 }}>{item.status}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CrmView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      setLoading(true);
      setError('');

      try {
        const result = await fetchCrmDashboardWithFallback();
        if (cancelled) {
          return;
        }

        setDashboard(result.payload || null);
        setSource(result.source || '');
        const periodOrder = Array.isArray(result.payload?.periodOrder) ? result.payload.periodOrder : [];
        const preferredPeriod = String(result.payload?.defaultPeriod || '').trim();

        if (preferredPeriod && periodOrder.includes(preferredPeriod)) {
          setSelectedPeriod(preferredPeriod);
        } else if (!periodOrder.includes(selectedPeriod) && periodOrder[0]) {
          setSelectedPeriod(periodOrder[0]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || 'No se pudo cargar el CRM.');
          setDashboard(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  const periodOrder = useMemo(
    () => (Array.isArray(dashboard?.periodOrder) ? dashboard.periodOrder : Object.keys(dashboard?.periods || {})),
    [dashboard]
  );

  const currentPeriod = dashboard?.periods?.[selectedPeriod] || null;
  const onlineSummary = currentPeriod?.online?.summary || {};
  const sicarSummary = currentPeriod?.sicar?.summary || {};
  const comparison = currentPeriod?.comparison || {};

  if (loading) {
    return (
      <DashboardShell>
        <SectionCard title="CRM San Martin" subtitle="Cargando analitica de tienda y SICAR...">
          <div style={{ padding: '12px 0', color: THEME.textSoft, fontWeight: 800 }}>Unificando datos para el tablero.</div>
        </SectionCard>
      </DashboardShell>
    );
  }

  if (error || !dashboard || !currentPeriod) {
    return (
      <DashboardShell>
        <SectionCard title="CRM San Martin" subtitle="No se pudo cargar el dashboard todavia.">
          <div style={{ display: 'grid', gap: 16 }}>
            <EmptyList label={error || 'No existe un snapshot publico del CRM ni fue posible usar el bridge local.'} />
            <div style={{ color: THEME.textSoft, fontWeight: 700, lineHeight: 1.6 }}>
              Para habilitarlo por completo deja activo el puente local y publica el snapshot CRM cuando ya tengas la credencial admin del
              proyecto nuevo.
            </div>
          </div>
        </SectionCard>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ display: 'grid', gap: 22 }}>
        <SectionCard
          title="CRM San Martin"
          subtitle="Analitica cruzada de tienda en linea y ventas reales en SICAR."
          actions={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: 999,
                  background: source === 'bridge' ? 'rgba(209, 172, 63, 0.16)' : 'rgba(29, 116, 199, 0.12)',
                  color: source === 'bridge' ? '#8a6a11' : THEME.blueDeep,
                  fontWeight: 900,
                }}
              >
                {source === 'bridge' ? 'Bridge local' : 'Snapshot CRM'}
              </div>
              <button
                type="button"
                className="crm-refresh-button"
                onClick={() => setRefreshTick((value) => value + 1)}
                style={{
                  border: `1px solid ${THEME.borderStrong}`,
                  background: 'white',
                  color: THEME.text,
                  minHeight: 44,
                  padding: '0 18px',
                  borderRadius: 999,
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Actualizar
              </button>
            </div>
          }
        >
          <div style={{ display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {periodOrder.map((periodKey) => {
                const active = periodKey === selectedPeriod;
                return (
                  <button
                    key={periodKey}
                    type="button"
                    className="crm-period-pill"
                    onClick={() => setSelectedPeriod(periodKey)}
                    style={{
                      border: active ? 'none' : `1px solid ${THEME.borderStrong}`,
                      background: active ? THEME.primaryGradient : 'white',
                      color: active ? 'white' : THEME.text,
                      minHeight: 42,
                      padding: '0 18px',
                      borderRadius: 999,
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    {PERIOD_LABELS[periodKey] || periodKey}
                  </button>
                );
              })}
            </div>

            <div style={{ color: THEME.textSoft, fontWeight: 700 }}>
              Ventana activa: {currentPeriod.dateFrom} al {currentPeriod.dateTo} · Generado {formatDateTime(dashboard.generatedAt)}
            </div>

            <div
              className="crm-grid-four"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}
            >
              <StatCard
                label="Ventas online entregadas"
                value={formatMoney(onlineSummary.revenue)}
                accent={THEME.blue}
                helper={`${formatNumber(onlineSummary.deliveredCount || 0)} pedidos entregados`}
              />
              <StatCard
                label="Ventas SICAR"
                value={formatMoney(sicarSummary.revenue)}
                accent={THEME.gold}
                helper={`${formatNumber(sicarSummary.saleCount || 0)} transacciones reales`}
              />
              <StatCard
                label="Participacion online"
                value={formatPercent(comparison.onlineRevenueSharePct)}
                accent={THEME.red}
                helper="Porcentaje del ingreso web frente al total de SICAR en esta ventana."
              />
              <StatCard
                label="Ticket promedio web"
                value={formatMoney(onlineSummary.averageTicket)}
                accent={THEME.blueDeep}
                helper={`SICAR promedio ${formatMoney(sicarSummary.averageTicket)}`}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Resumen ejecutivo" subtitle="Lo mas importante para tomar decisiones rapidas.">
          <div className="crm-grid-three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            <MetricMiniCard label="Pedidos web" value={formatNumber(onlineSummary.orderCount)} helper={`${formatNumber(onlineSummary.pendingCount || 0)} pendientes · ${formatNumber(onlineSummary.canceledCount || 0)} cancelados`} />
            <MetricMiniCard label="Clientes web" value={formatNumber(onlineSummary.uniqueCustomers)} helper={`${formatNumber(onlineSummary.pickupCount || 0)} pickup · ${formatNumber(onlineSummary.deliveryCount || 0)} delivery`} />
            <MetricMiniCard label="Clientes SICAR" value={formatNumber(sicarSummary.uniqueCustomers)} helper={`${formatNumber(sicarSummary.saleCount || 0)} ventas efectivas`} />
          </div>
        </SectionCard>

        <SectionCard title="Tendencia diaria" subtitle="Ultimos 14 puntos de la ventana seleccionada.">
          <DailyTrend online={currentPeriod.online?.daily} sicar={currentPeriod.sicar?.daily} />
        </SectionCard>

        <div className="crm-dual-panels" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <SectionCard title="Tienda en linea" subtitle="Pedidos, conversion y mezcla comercial del canal web.">
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="crm-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <MetricMiniCard label="Venta final" value={formatMoney(onlineSummary.revenue)} helper={`${formatMoney(onlineSummary.projectedRevenue)} proyectado no cancelado`} />
                <MetricMiniCard label="Premios y cupones" value={`${formatNumber(onlineSummary.rewardOrders || 0)} / ${formatNumber(onlineSummary.couponOrders || 0)}`} helper="Pedidos con recompensa / pedidos con cupon" />
              </div>
              <PaymentList items={currentPeriod.online?.paymentMethods || []} emptyLabel="Sin metodos de pago web en esta ventana." />
            </div>
          </SectionCard>

          <SectionCard title="SICAR" subtitle="Venta consolidada real del punto de venta y facturacion.">
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="crm-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
                <MetricMiniCard label="Ingreso total" value={formatMoney(sicarSummary.revenue)} helper={`${formatNumber(sicarSummary.saleCount || 0)} transacciones`} />
                <MetricMiniCard label="Ticket promedio" value={formatMoney(sicarSummary.averageTicket)} helper={`${formatNumber(sicarSummary.uniqueCustomers || 0)} clientes distintos`} />
              </div>
              <PaymentList items={currentPeriod.sicar?.paymentMethods || []} emptyLabel="Sin metodos de pago SICAR en esta ventana." />
            </div>
          </SectionCard>
        </div>

        <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <SectionCard title="Top productos web" subtitle="Cortes y articulos mas fuertes del canal online.">
            <RankedList
              title="Mas vendidos por tienda"
              items={currentPeriod.online?.topProducts || []}
              emptyLabel="Todavia no hay productos web entregados en esta ventana."
              renderMetric={(item) => formatMoney(item.revenue)}
            />
          </SectionCard>

          <SectionCard title="Top productos SICAR" subtitle="Lo que mas factura el negocio en el sistema central.">
            <RankedList
              title="Mas vendidos por SICAR"
              items={currentPeriod.sicar?.topProducts || []}
              emptyLabel="Todavia no hay productos SICAR en esta ventana."
              renderMetric={(item) => formatMoney(item.revenue)}
            />
          </SectionCard>
        </div>

        <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <SectionCard title="Clientes web" subtitle="Quienes mas compran en tienda virtual.">
            <RankedList
              title="Top clientes de tienda"
              items={currentPeriod.online?.topCustomers || []}
              emptyLabel="Todavia no hay clientes web con compras entregadas."
              renderMetric={(item) => formatMoney(item.revenue)}
            />
          </SectionCard>

          <SectionCard title="Clientes SICAR" subtitle="Quienes mas pesan dentro de la venta total.">
            <RankedList
              title="Top clientes de SICAR"
              items={currentPeriod.sicar?.topCustomers || []}
              emptyLabel="Todavia no hay clientes SICAR en esta ventana."
              renderMetric={(item) => formatMoney(item.revenue)}
            />
          </SectionCard>
        </div>

        <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <SectionCard title="Actividad reciente web" subtitle="Ultimos pedidos que ya impactan la operacion digital.">
            <RecentList items={currentPeriod.online?.recentOrders || []} type="online" />
          </SectionCard>

          <SectionCard title="Actividad reciente SICAR" subtitle="Ultimas transacciones procesadas por el sistema central.">
            <RecentList items={currentPeriod.sicar?.recentSales || []} type="sicar" />
          </SectionCard>
        </div>
      </div>
    </DashboardShell>
  );
}
