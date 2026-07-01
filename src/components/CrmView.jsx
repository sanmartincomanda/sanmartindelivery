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

const CHANNEL_LABELS = {
  online: 'Tienda en linea',
  sicar: 'Cartera SICAR',
};

const VIEW_LABELS = {
  overview: 'Vista general',
  behavior: 'Analisis comportamiento de clientes',
};

const moneyFormatter = new Intl.NumberFormat('es-NI', {
  style: 'currency',
  currency: 'NIO',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('es-NI');

const STATUS_STYLES = {
  red: {
    background: 'rgba(220, 38, 38, 0.14)',
    borderColor: 'rgba(220, 38, 38, 0.26)',
    color: '#b42318',
  },
  amber: {
    background: 'rgba(209, 172, 63, 0.16)',
    borderColor: 'rgba(209, 172, 63, 0.28)',
    color: '#8a6610',
  },
  orange: {
    background: 'rgba(245, 158, 11, 0.16)',
    borderColor: 'rgba(245, 158, 11, 0.28)',
    color: '#b45309',
  },
  teal: {
    background: 'rgba(13, 148, 136, 0.14)',
    borderColor: 'rgba(13, 148, 136, 0.26)',
    color: '#0f766e',
  },
  blue: {
    background: 'rgba(29, 116, 199, 0.14)',
    borderColor: 'rgba(29, 116, 199, 0.26)',
    color: THEME.blueDeep,
  },
  indigo: {
    background: 'rgba(79, 70, 229, 0.14)',
    borderColor: 'rgba(79, 70, 229, 0.24)',
    color: '#4338ca',
  },
  green: {
    background: 'rgba(22, 163, 74, 0.14)',
    borderColor: 'rgba(22, 163, 74, 0.24)',
    color: '#15803d',
  },
  sky: {
    background: 'rgba(14, 165, 233, 0.14)',
    borderColor: 'rgba(14, 165, 233, 0.24)',
    color: '#0369a1',
  },
  slate: {
    background: 'rgba(71, 85, 105, 0.12)',
    borderColor: 'rgba(71, 85, 105, 0.2)',
    color: '#475569',
  },
};

const formatMoney = (value) => moneyFormatter.format(Number(value || 0));
const formatNumber = (value) => numberFormatter.format(Number(value || 0));
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;
const formatSignedPercent = (value) => `${Number(value || 0) > 0 ? '+' : ''}${Number(value || 0).toFixed(1)}%`;
const formatSignedMoney = (value) => `${Number(value || 0) > 0 ? '+' : ''}${formatMoney(value)}`;

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

const normalizeSearch = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const BEHAVIOR_FILTERS = [
  { key: 'all', label: 'Todos', tone: 'blue' },
  { key: 'lost', label: 'Perdidos', tone: 'red' },
  { key: 'atRisk', label: 'En riesgo', tone: 'amber' },
  { key: 'declining', label: 'En caida', tone: 'orange' },
  { key: 'reactivated', label: 'Reactivados', tone: 'teal' },
  { key: 'publicoGeneral', label: 'Publico general', tone: 'indigo' },
];

const BEHAVIOR_FILTER_META = {
  all: {
    description: 'Toda la cartera disponible para esta ventana.',
    rateKey: null,
    countKey: 'totalProfiles',
  },
  lost: {
    description: 'Compraron en la ventana anterior y en esta ya no aparecen.',
    rateKey: 'lostRatePct',
    countKey: 'lostCustomersCount',
  },
  atRisk: {
    description: 'Clientes valiosos sin compra reciente segun su ritmo habitual.',
    rateKey: 'atRiskRatePct',
    countKey: 'atRiskCustomersCount',
  },
  declining: {
    description: 'Siguen activos, pero estan comprando menos que antes.',
    rateKey: 'decliningRatePct',
    countKey: 'decliningCustomersCount',
  },
  reactivated: {
    description: 'Volvieron a comprar despues de ausentarse en la ventana anterior.',
    rateKey: 'reactivatedRatePct',
    countKey: 'reactivatedCount',
  },
  publicoGeneral: {
    description: 'Perfil Publico general para revisar el comportamiento que cae alli.',
    rateKey: 'publicoGeneralRatePct',
    countKey: 'publicoGeneralCount',
  },
};

const matchesBehaviorFilter = (customer, filterKey) => {
  if (!customer) {
    return false;
  }

  switch (filterKey) {
    case 'lost':
      return customer.isLost;
    case 'atRisk':
      return customer.isAtRisk;
    case 'declining':
      return customer.isDeclining;
    case 'reactivated':
      return customer.isReactivated;
    case 'publicoGeneral':
      return customer.isPublicoGeneral;
    case 'all':
    default:
      return true;
  }
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
        .crm-channel-pill,
        .crm-refresh-button,
        .crm-row-button {
          transition: transform 140ms ease, box-shadow 140ms ease, background 140ms ease, border-color 140ms ease, color 140ms ease;
        }

        .crm-period-pill:hover,
        .crm-channel-pill:hover,
        .crm-refresh-button:hover,
        .crm-row-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 14px 28px rgba(10, 42, 78, 0.12);
        }

        @media (max-width: 1180px) {
          .crm-hero-grid,
          .crm-channel-grid,
          .crm-customer-grid,
          .crm-list-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 960px) {
          .crm-grid-two,
          .crm-grid-three,
          .crm-grid-four,
          .crm-grid-five,
          .crm-signal-grid {
            grid-template-columns: 1fr !important;
          }

          .crm-header,
          .crm-section-actions {
            flex-direction: column;
            align-items: flex-start !important;
          }
        }
      `}</style>
      <div style={{ maxWidth: 1520, margin: '0 auto' }}>{children}</div>
    </div>
  );
}

function SectionCard({ title, subtitle, actions = null, children, dark = false }) {
  return (
    <section
      style={{
        background: dark ? THEME.darkPanelGradient : 'white',
        color: dark ? 'white' : THEME.text,
        borderRadius: 28,
        border: dark ? 'none' : `1px solid ${THEME.border}`,
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
          <h2 style={{ margin: 0, fontSize: 24, color: dark ? 'white' : THEME.text }}>{title}</h2>
          {subtitle ? (
            <p
              style={{
                margin: '6px 0 0',
                color: dark ? 'rgba(255,255,255,0.8)' : THEME.textSoft,
                fontWeight: 700,
              }}
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function StatusPill({ label, tone = 'blue', compact = false }) {
  const palette = STATUS_STYLES[tone] || STATUS_STYLES.blue;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: compact ? 28 : 34,
        padding: compact ? '0 10px' : '0 12px',
        borderRadius: 999,
        border: `1px solid ${palette.borderColor}`,
        background: palette.background,
        color: palette.color,
        fontSize: compact ? 12 : 13,
        fontWeight: 900,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function HeroMetric({ label, value, helper }) {
  return (
    <div
      style={{
        borderRadius: 22,
        padding: 18,
        background: 'rgba(255,255,255,0.12)',
        border: '1px solid rgba(255,255,255,0.16)',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.74)' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color: 'white' }}>{value}</div>
      {helper ? <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>{helper}</div> : null}
    </div>
  );
}

function StatCard({ label, value, accent, helper }) {
  return (
    <div
      style={{
        borderRadius: 22,
        padding: 20,
        background: 'white',
        border: `1px solid ${THEME.border}`,
        boxShadow: `0 12px 26px ${THEME.shadow}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: THEME.textSoft, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {label}
          </div>
          <div style={{ marginTop: 8, fontSize: 30, fontWeight: 900, color: accent || THEME.text }}>{value}</div>
        </div>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: accent || THEME.blue,
            boxShadow: `0 0 0 8px ${(accent || THEME.blue)}18`,
            marginTop: 4,
          }}
        />
      </div>
      {helper ? <div style={{ marginTop: 12, color: THEME.textSoft, fontWeight: 700, lineHeight: 1.45 }}>{helper}</div> : null}
    </div>
  );
}

function MetricMiniCard({ label, value, helper = '', emphasis = 'default' }) {
  const accents = {
    default: THEME.text,
    blue: THEME.blueDeep,
    gold: THEME.gold,
    red: THEME.red,
    teal: '#0f766e',
  };

  return (
    <div
      style={{
        borderRadius: 18,
        padding: 18,
        background: 'rgba(247, 251, 255, 0.94)',
        border: `1px solid ${THEME.border}`,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 900, color: THEME.textSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: 24, fontWeight: 900, color: accents[emphasis] || accents.default }}>{value}</div>
      {helper ? <div style={{ marginTop: 6, color: THEME.textMuted, fontWeight: 700, lineHeight: 1.45 }}>{helper}</div> : null}
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

function PeriodSelector({ periodOrder, selectedPeriod, onSelectPeriod }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {periodOrder.map((periodKey) => {
        const active = periodKey === selectedPeriod;
        return (
          <button
            key={periodKey}
            type="button"
            className="crm-period-pill"
            onClick={() => onSelectPeriod(periodKey)}
            style={{
              border: active ? 'none' : '1px solid rgba(255,255,255,0.18)',
              background: active ? 'white' : 'rgba(255,255,255,0.08)',
              color: active ? THEME.blueDeep : 'white',
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
  );
}

function ViewSelector({ value, onChange }) {
  return (
    <div className="crm-section-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {Object.entries(VIEW_LABELS).map(([viewKey, label]) => {
        const active = value === viewKey;
        return (
          <button
            key={viewKey}
            type="button"
            className="crm-channel-pill"
            onClick={() => onChange(viewKey)}
            style={{
              border: active ? 'none' : `1px solid ${THEME.borderStrong}`,
              background: active ? THEME.primaryGradient : 'white',
              color: active ? 'white' : THEME.text,
              minHeight: 40,
              padding: '0 16px',
              borderRadius: 999,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ChannelSelector({ value, onChange }) {
  return (
    <div className="crm-section-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      {['sicar', 'online'].map((channelKey) => {
        const active = channelKey === value;
        return (
          <button
            key={channelKey}
            type="button"
            className="crm-channel-pill"
            onClick={() => onChange(channelKey)}
            style={{
              border: active ? 'none' : `1px solid ${THEME.borderStrong}`,
              background: active ? THEME.primaryGradient : 'white',
              color: active ? 'white' : THEME.text,
              minHeight: 40,
              padding: '0 16px',
              borderRadius: 999,
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            {CHANNEL_LABELS[channelKey]}
          </button>
        );
      })}
    </div>
  );
}

function BehaviorFilterSelector({ value, onChange, summary = {} }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {BEHAVIOR_FILTERS.map((filter) => {
        const active = value === filter.key;
        const countKey = BEHAVIOR_FILTER_META[filter.key]?.countKey;
        const countValue = countKey ? Number(summary?.[countKey] || 0) : 0;

        return (
          <button
            key={filter.key}
            type="button"
            className="crm-channel-pill"
            onClick={() => onChange(filter.key)}
            style={{
              border: active ? 'none' : `1px solid ${THEME.borderStrong}`,
              background: active ? THEME.primaryGradient : 'white',
              color: active ? 'white' : THEME.text,
              minHeight: 42,
              padding: '0 16px',
              borderRadius: 999,
              fontWeight: 900,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span>{filter.label}</span>
            <span
              style={{
                minWidth: 28,
                height: 28,
                padding: '0 8px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: active ? 'rgba(255,255,255,0.18)' : STATUS_STYLES[filter.tone]?.background || 'rgba(29, 116, 199, 0.12)',
                color: active ? 'white' : STATUS_STYLES[filter.tone]?.color || THEME.blueDeep,
                border: active ? '1px solid rgba(255,255,255,0.18)' : `1px solid ${STATUS_STYLES[filter.tone]?.borderColor || THEME.border}`,
                fontSize: 12,
                fontWeight: 900,
              }}
            >
              {formatNumber(countValue)}
            </span>
          </button>
        );
      })}
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
              background: 'rgba(247, 251, 255, 0.92)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <strong style={{ color: THEME.text }}>{item.name}</strong>
                <div style={{ color: THEME.textSoft, fontWeight: 700, marginTop: 4 }}>{formatNumber(item.count || 0)} operaciones</div>
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

function RankedList({ title, items = [], renderMetric, emptyLabel, subtitleResolver = null, onSelectCustomer = null }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <h3 style={{ margin: 0, fontSize: 18, color: THEME.text }}>{title}</h3>
      {items.length === 0 ? (
        <EmptyList label={emptyLabel} />
      ) : (
        items.map((item, index) => (
          <button
            key={`${title}-${item.code || item.key || item.name || index}`}
            type="button"
            onClick={() => onSelectCustomer?.(item)}
            className="crm-row-button"
            style={{
              display: 'grid',
              gridTemplateColumns: '44px minmax(0, 1fr) auto',
              gap: 14,
              alignItems: 'center',
              padding: '14px 16px',
              borderRadius: 18,
              background: 'rgba(247, 251, 255, 0.94)',
              border: `1px solid ${THEME.border}`,
              textAlign: 'left',
              cursor: onSelectCustomer ? 'pointer' : 'default',
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
                {subtitleResolver ? subtitleResolver(item) : item.code ? `${item.code}` : 'Sin codigo'}
              </div>
            </div>
            <div style={{ textAlign: 'right', fontWeight: 900, color: THEME.blueDeep }}>{renderMetric(item)}</div>
          </button>
        ))
      )}
    </div>
  );
}

function SignalPanel({ title, subtitle, count, tone, items = [], emptyLabel, renderMetric, renderHelper, onSelectCustomer }) {
  return (
    <div
      style={{
        borderRadius: 24,
        padding: 20,
        background: 'rgba(247, 251, 255, 0.96)',
        border: `1px solid ${THEME.border}`,
        display: 'grid',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: THEME.text }}>{title}</div>
          <div style={{ marginTop: 6, color: THEME.textSoft, fontWeight: 700, lineHeight: 1.45 }}>{subtitle}</div>
        </div>
        <StatusPill label={formatNumber(count)} tone={tone} />
      </div>

      {items.length === 0 ? (
        <EmptyList label={emptyLabel} />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {items.slice(0, 5).map((item) => (
            <button
              key={`${title}-${item.key}`}
              type="button"
              onClick={() => onSelectCustomer?.(item)}
              className="crm-row-button"
              style={{
                borderRadius: 18,
                border: `1px solid ${THEME.border}`,
                background: 'white',
                padding: 14,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </div>
                  <div style={{ marginTop: 4, color: THEME.textMuted, fontWeight: 700 }}>
                    {item.code ? `${item.code} | ` : ''}
                    {item.status}
                  </div>
                </div>
                <div style={{ fontWeight: 900, color: THEME.blueDeep, textAlign: 'right' }}>{renderMetric(item)}</div>
              </div>
              <div style={{ color: THEME.textSoft, fontWeight: 700 }}>{renderHelper(item)}</div>
            </button>
          ))}
        </div>
      )}
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

  const maxValue = Math.max(...rows.flatMap((row) => [row.onlineRevenue, row.sicarRevenue]), 1);

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
                height: 170,
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
                  height: `${Math.max(6, (row.onlineRevenue / maxValue) * 170)}px`,
                  borderRadius: 999,
                  background: THEME.blue,
                }}
              />
              <div
                title={`SICAR ${formatShortDate(row.date)}: ${formatMoney(row.sicarRevenue)}`}
                style={{
                  width: 16,
                  height: `${Math.max(6, (row.sicarRevenue / maxValue) * 170)}px`,
                  borderRadius: 999,
                  background: THEME.gold,
                }}
              />
            </div>
            <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 800, color: THEME.textSoft }}>{formatShortDate(row.date)}</div>
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
            background: 'rgba(247, 251, 255, 0.92)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 900, color: THEME.text }}>{type === 'online' ? `Pedido #${item.orderNumber}` : `Venta #${item.saleId}`}</div>
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
              {formatDateTime(item.dateTime)} | {item.payment || 'Sin metodo'}
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

function CustomerDirectory({ customers = [], selectedKey, onSelectCustomer, query, onQueryChange, emptyLabel = 'No hay clientes para esta vista todavia.', maxHeight = 720 }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          borderRadius: 18,
          border: `1px solid ${THEME.border}`,
          background: 'rgba(247, 251, 255, 0.92)',
          padding: 14,
        }}
      >
        <input
          type="text"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por cliente, codigo o estado..."
          style={{
            width: '100%',
            minHeight: 46,
            borderRadius: 14,
            border: `1px solid ${THEME.borderStrong}`,
            padding: '0 14px',
            fontSize: 14,
            fontWeight: 700,
            color: THEME.text,
            background: 'white',
            outline: 'none',
          }}
        />
      </div>

      {!customers.length ? (
        <EmptyList label={emptyLabel} />
      ) : (
        <div style={{ display: 'grid', gap: 10, maxHeight, overflowY: 'auto', paddingRight: 4 }}>
          {customers.map((customer) => {
            const selected = customer.key === selectedKey;
            return (
              <button
                key={customer.key}
                type="button"
                className="crm-row-button"
                onClick={() => onSelectCustomer(customer)}
                style={{
                  borderRadius: 18,
                  padding: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  background: selected ? 'rgba(29, 116, 199, 0.08)' : 'white',
                  border: selected ? `1px solid ${THEME.blue}` : `1px solid ${THEME.border}`,
                  display: 'grid',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {customer.name}
                    </div>
                    <div style={{ marginTop: 4, color: THEME.textMuted, fontWeight: 700 }}>
                      {customer.code ? `${customer.code} | ` : ''}
                      Ultima compra {formatShortDate(customer.lastPurchaseDate)}
                    </div>
                  </div>
                  <StatusPill label={customer.status} tone={customer.tone} compact />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: THEME.textSoft, fontWeight: 800 }}>
                  <span>{formatMoney(customer.currentRevenue || customer.previousRevenue || customer.lifetimeRevenue)}</span>
                  <span>{formatNumber(customer.currentOrders || customer.previousOrders || customer.lifetimeOrders)} ops</span>
                  <span>{formatSignedPercent(customer.revenueChangePct)}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerDetailPanel({ customer, channel }) {
  if (!customer) {
    return <EmptyList label="Selecciona un cliente para abrir su radiografia comercial." />;
  }

  const tone = STATUS_STYLES[customer.tone] || STATUS_STYLES.blue;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div
        style={{
          borderRadius: 24,
          padding: 22,
          background: `linear-gradient(135deg, ${tone.background} 0%, rgba(255,255,255,0.96) 100%)`,
          border: `1px solid ${tone.borderColor}`,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: THEME.textSoft, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {CHANNEL_LABELS[channel]}
            </div>
            <h3 style={{ margin: '8px 0 0', fontSize: 28, color: THEME.text }}>{customer.name}</h3>
            <div style={{ marginTop: 8, color: THEME.textSoft, fontWeight: 800 }}>
              {customer.code ? `${customer.code} | ` : ''}
              Primera compra {formatShortDate(customer.firstPurchaseDate)}
            </div>
          </div>
          <StatusPill label={customer.status} tone={customer.tone} />
        </div>

        <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginTop: 20 }}>
          <MetricMiniCard label="Venta actual" value={formatMoney(customer.currentRevenue)} helper={`${formatNumber(customer.currentOrders)} operaciones`} emphasis="blue" />
          <MetricMiniCard label="Venta anterior" value={formatMoney(customer.previousRevenue)} helper={`${formatNumber(customer.previousOrders)} operaciones`} emphasis="default" />
          <MetricMiniCard label="Variacion" value={formatSignedMoney(customer.revenueDelta)} helper={formatSignedPercent(customer.revenueChangePct)} emphasis={customer.revenueDelta < 0 ? 'red' : customer.revenueDelta > 0 ? 'teal' : 'default'} />
          <MetricMiniCard label="Ultima compra" value={formatShortDate(customer.lastPurchaseDate)} helper={`${formatNumber(customer.daysSinceLastPurchase)} dias`} emphasis="gold" />
        </div>
      </div>

      <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <MetricMiniCard label="Valor historico" value={formatMoney(customer.lifetimeRevenue)} helper={`Share actual ${formatPercent(customer.currentRevenueSharePct)}`} emphasis="blue" />
        <MetricMiniCard label="Operacion historica" value={formatNumber(customer.lifetimeOrders)} helper={`Ticket actual ${formatMoney(customer.currentTicket)}`} />
        <MetricMiniCard label="Ritmo promedio" value={`${formatNumber(customer.averageGapDays)} dias`} helper={`Pago habitual ${customer.preferredPayment || 'Sin metodo'}`} />
        <MetricMiniCard
          label={channel === 'online' ? 'Cupon / premio' : 'Mov. relativa'}
          value={channel === 'online' ? `${formatNumber(customer.couponOrders)} / ${formatNumber(customer.rewardOrders)}` : formatSignedPercent(customer.ordersChangePct)}
          helper={channel === 'online' ? 'Pedidos con cupon / recompensa en la ventana' : `Cambio en operaciones ${customer.ordersDelta > 0 ? '+' : ''}${formatNumber(customer.ordersDelta)}`}
          emphasis={channel === 'online' ? 'default' : customer.ordersDelta < 0 ? 'red' : customer.ordersDelta > 0 ? 'teal' : 'default'}
        />
      </div>

      <div
        style={{
          borderRadius: 20,
          padding: 18,
          border: `1px solid ${THEME.border}`,
          background: 'rgba(247, 251, 255, 0.94)',
          color: THEME.text,
          fontWeight: 800,
          lineHeight: 1.6,
        }}
      >
        {customer.summaryNote}
      </div>
    </div>
  );
}

export default function CrmView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [activeView, setActiveView] = useState('overview');
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedCustomerChannel, setSelectedCustomerChannel] = useState('sicar');
  const [behaviorFilter, setBehaviorFilter] = useState('all');
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('');

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
  const customerIntelligence = currentPeriod?.customerIntelligence?.[selectedCustomerChannel] || null;
  const customerSummary = customerIntelligence?.summary || {};
  const directory = Array.isArray(customerIntelligence?.customerDirectory) ? customerIntelligence.customerDirectory : [];
  const behaviorMeta = BEHAVIOR_FILTER_META[behaviorFilter] || BEHAVIOR_FILTER_META.all;

  const customersScopedByBehavior = useMemo(() => {
    if (behaviorFilter === 'all') {
      return directory;
    }

    return directory.filter((customer) => matchesBehaviorFilter(customer, behaviorFilter));
  }, [behaviorFilter, directory]);

  const filteredCustomers = useMemo(() => {
    const search = normalizeSearch(customerQuery);
    const baseCustomers = activeView === 'behavior' ? customersScopedByBehavior : directory;

    if (!search) {
      return baseCustomers;
    }

    return baseCustomers.filter((customer) => {
      const haystack = [customer.name, customer.code, customer.status].map(normalizeSearch).join(' ');
      return haystack.includes(search);
    });
  }, [activeView, customerQuery, customersScopedByBehavior, directory]);

  const customerBaseList = activeView === 'behavior' ? customersScopedByBehavior : directory;

  const selectedCustomer = useMemo(
    () =>
      filteredCustomers.find((customer) => customer.key === selectedCustomerKey) ||
      customerBaseList.find((customer) => customer.key === selectedCustomerKey) ||
      filteredCustomers[0] ||
      customerBaseList[0] ||
      null,
    [customerBaseList, filteredCustomers, selectedCustomerKey]
  );

  useEffect(() => {
    if (selectedCustomer?.key && selectedCustomer.key !== selectedCustomerKey) {
      setSelectedCustomerKey(selectedCustomer.key);
    }
  }, [selectedCustomer, selectedCustomerKey]);

  useEffect(() => {
    setCustomerQuery('');
    setSelectedCustomerKey('');
  }, [selectedCustomerChannel, selectedPeriod, behaviorFilter, activeView]);

  if (loading) {
    return (
      <DashboardShell>
        <SectionCard title="CRM Corporativo San Martin" subtitle="Unificando ventas web y SICAR en una sola radiografia comercial." dark>
          <div style={{ padding: '12px 0', color: 'rgba(255,255,255,0.82)', fontWeight: 800 }}>
            Cargando analitica ejecutiva, cartera, productos y actividad reciente...
          </div>
        </SectionCard>
      </DashboardShell>
    );
  }

  if (error || !dashboard || !currentPeriod) {
    return (
      <DashboardShell>
        <SectionCard title="CRM Corporativo San Martin" subtitle="No se pudo cargar el dashboard todavia.">
          <div style={{ display: 'grid', gap: 16 }}>
            <EmptyList label={error || 'No existe un snapshot publico del CRM ni fue posible usar el bridge local.'} />
            <div style={{ color: THEME.textSoft, fontWeight: 700, lineHeight: 1.6 }}>
              Para dejarlo estable en produccion, publica el snapshot del CRM y confirma las credenciales del proyecto dedicado.
            </div>
          </div>
        </SectionCard>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ display: 'grid', gap: 22 }}>
        <div className="crm-hero-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(320px, 0.9fr)', gap: 22 }}>
          <SectionCard
            dark
            title="CRM Corporativo San Martin"
            subtitle="Vista ejecutiva de ingresos, clientes, retencion y oportunidad comercial."
            actions={
              <div style={{ display: 'grid', gap: 10 }}>
                <PeriodSelector periodOrder={periodOrder} selectedPeriod={selectedPeriod} onSelectPeriod={setSelectedPeriod} />
                <ViewSelector value={activeView} onChange={setActiveView} />
              </div>
            }
          >
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', color: 'rgba(255,255,255,0.78)', fontWeight: 800 }}>
                <span>
                  Ventana activa: {currentPeriod.dateFrom} al {currentPeriod.dateTo}
                </span>
                <span>Generado {formatDateTime(dashboard.generatedAt)}</span>
              </div>

              <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                <HeroMetric label="Venta online" value={formatMoney(onlineSummary.revenue)} helper={`${formatNumber(onlineSummary.deliveredCount || 0)} pedidos entregados`} />
                <HeroMetric label="Venta SICAR" value={formatMoney(sicarSummary.revenue)} helper={`${formatNumber(sicarSummary.saleCount || 0)} transacciones`} />
                <HeroMetric label="Share online" value={formatPercent(comparison.onlineRevenueSharePct)} helper="Peso del canal digital vs la venta real del periodo." />
                <HeroMetric label="Ticket web" value={formatMoney(onlineSummary.averageTicket)} helper={`Equivale al ${formatPercent(comparison.onlineTicketVsSicarPct)} del ticket SICAR`} />
              </div>
            </div>
          </SectionCard>

          <div style={{ display: 'grid', gap: 22 }}>
            <SectionCard
              title="Radar inmediato"
              subtitle="Alertas para tomar accion hoy."
              actions={
                <div className="crm-section-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <StatusPill label={source === 'bridge' ? 'Bridge local' : 'Snapshot CRM'} tone={source === 'bridge' ? 'amber' : 'blue'} />
                  <button
                    type="button"
                    className="crm-refresh-button"
                    onClick={() => setRefreshTick((value) => value + 1)}
                    style={{
                      border: `1px solid ${THEME.borderStrong}`,
                      background: 'white',
                      color: THEME.text,
                      minHeight: 42,
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
              <div className="crm-grid-two" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <MetricMiniCard label="Perdidos" value={formatNumber(customerSummary.lostCustomersCount)} helper={CHANNEL_LABELS[selectedCustomerChannel]} emphasis="red" />
                <MetricMiniCard label="En riesgo" value={formatNumber(customerSummary.atRiskCustomersCount)} helper="Inactivos valiosos" emphasis="gold" />
                <MetricMiniCard label="En caida" value={formatNumber(customerSummary.decliningCustomersCount)} helper="Siguen comprando, pero menos" emphasis="red" />
                <MetricMiniCard label="Reactivados" value={formatNumber(customerSummary.reactivatedCount)} helper="Volvieron a comprar" emphasis="teal" />
              </div>
            </SectionCard>

            <SectionCard title="Cobertura digital" subtitle="Comparativo entre canal web y negocio total.">
              <div className="crm-grid-three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                <MetricMiniCard label="Alcance clientes" value={formatPercent(comparison.onlineCustomerReachPct)} helper="Clientes web vs clientes SICAR" emphasis="blue" />
                <MetricMiniCard label="Ticket web / SICAR" value={formatPercent(comparison.onlineTicketVsSicarPct)} helper="Relacion de ticket promedio" emphasis="gold" />
                <MetricMiniCard label="Top 10 share" value={formatPercent(customerSummary.top10RevenueSharePct)} helper={CHANNEL_LABELS[selectedCustomerChannel]} emphasis="default" />
              </div>
            </SectionCard>
          </div>
        </div>

        <SectionCard
          title="Pulso ejecutivo"
          subtitle="KPIs que normalmente usan CRMs serios para retencion, valor y concentracion."
        >
          <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
            <StatCard label="Pedidos web" value={formatNumber(onlineSummary.orderCount)} accent={THEME.blue} helper={`${formatNumber(onlineSummary.pendingCount || 0)} pendientes | ${formatNumber(onlineSummary.canceledCount || 0)} cancelados`} />
            <StatCard label="Clientes activos" value={formatNumber(customerSummary.activeCustomers)} accent={THEME.blueDeep} helper={CHANNEL_LABELS[selectedCustomerChannel]} />
            <StatCard label="Retencion" value={formatPercent(customerSummary.retentionRatePct)} accent="#0f766e" helper={`${formatNumber(customerSummary.retainedCustomers)} de ${formatNumber(customerSummary.previousActiveCustomers)} clientes volvieron`} />
            <StatCard label="Repeat rate" value={formatPercent(customerSummary.repeatPurchaseRatePct)} accent={THEME.gold} helper="Clientes activos que ya habian comprado antes." />
            <StatCard label="Churn ventana" value={formatPercent(customerSummary.churnRatePct)} accent={THEME.red} helper="Clientes de la ventana anterior que no regresaron." />
            <StatCard label="Ingreso por activo" value={formatMoney(customerSummary.revenuePerActiveCustomer)} accent={THEME.blue} helper="Revenue promedio por cliente activo." />
            <StatCard label="Promedio entre compras" value={`${formatNumber(customerSummary.averageGapDays)} dias`} accent={THEME.blueDeep} helper="Ritmo historico promedio de recompra." />
            <StatCard label="Concentracion top 5" value={formatPercent(customerSummary.top5RevenueSharePct)} accent={THEME.red} helper="Cuanto dependen las ventas de los 5 clientes mas fuertes." />
          </div>
        </SectionCard>

        {activeView === 'behavior' ? (
          <SectionCard
            title="Analisis comportamiento de clientes"
            subtitle="Segmenta toda la cartera por riesgo, caida, perdida, reactivacion y Publico general dentro de la ventana elegida."
            actions={
              <div style={{ display: 'grid', gap: 10 }}>
                <ChannelSelector value={selectedCustomerChannel} onChange={setSelectedCustomerChannel} />
                <BehaviorFilterSelector value={behaviorFilter} onChange={setBehaviorFilter} summary={customerSummary} />
              </div>
            }
          >
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="crm-grid-three" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
                <MetricMiniCard label="Perdidos" value={formatNumber(customerSummary.lostCustomersCount)} helper={`${formatPercent(customerSummary.lostRatePct)} de la cartera previa`} emphasis="red" />
                <MetricMiniCard label="En riesgo" value={formatNumber(customerSummary.atRiskCustomersCount)} helper={`${formatPercent(customerSummary.atRiskRatePct)} del universo analizado`} emphasis="gold" />
                <MetricMiniCard label="En caida" value={formatNumber(customerSummary.decliningCustomersCount)} helper={`${formatPercent(customerSummary.decliningRatePct)} de los clientes activos`} emphasis="red" />
                <MetricMiniCard label="Reactivados" value={formatNumber(customerSummary.reactivatedCount)} helper={`${formatPercent(customerSummary.reactivatedRatePct)} de los clientes activos`} emphasis="teal" />
                <MetricMiniCard label="Publico general" value={formatNumber(customerSummary.publicoGeneralCount)} helper={`${formatPercent(customerSummary.publicoGeneralRatePct)} del universo analizado`} emphasis="blue" />
                <MetricMiniCard label="Base analizada" value={formatNumber(customerSummary.totalProfiles)} helper={`${CHANNEL_LABELS[selectedCustomerChannel]} | ${currentPeriod.dateFrom} al ${currentPeriod.dateTo}`} emphasis="default" />
              </div>

              <div
                style={{
                  borderRadius: 20,
                  padding: 18,
                  border: `1px solid ${THEME.border}`,
                  background: 'rgba(247, 251, 255, 0.94)',
                  color: THEME.text,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 900 }}>
                  {behaviorFilter === 'all' ? 'Mostrando toda la cartera analizada' : `Filtro activo: ${BEHAVIOR_FILTERS.find((item) => item.key === behaviorFilter)?.label || 'Todos'}`}
                </div>
                <div style={{ color: THEME.textSoft, fontWeight: 700, lineHeight: 1.55 }}>
                  {behaviorMeta.description} Resultado actual: {formatNumber(filteredCustomers.length)} cliente{filteredCustomers.length === 1 ? '' : 's'} visibles.
                </div>
              </div>

              <div className="crm-customer-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.92fr) minmax(0, 1.08fr)', gap: 20 }}>
                <SectionCard
                  title="Listado filtrado"
                  subtitle="Aqui puedes revisar a toditos los clientes del filtro elegido y buscarlos por nombre, codigo o estado."
                >
                  <CustomerDirectory
                    customers={filteredCustomers}
                    selectedKey={selectedCustomer?.key || ''}
                    onSelectCustomer={(customer) => setSelectedCustomerKey(customer.key)}
                    query={customerQuery}
                    onQueryChange={setCustomerQuery}
                    emptyLabel="No hay clientes para este filtro en la ventana actual."
                    maxHeight={900}
                  />
                </SectionCard>

                <SectionCard title="Detalle del cliente" subtitle="Ficha comercial completa para diagnosticar la cuenta elegida.">
                  <CustomerDetailPanel customer={selectedCustomer} channel={selectedCustomerChannel} />
                </SectionCard>
              </div>

              <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <SectionCard title="Clientes VIP activos" subtitle="La cartera mas fuerte para proteger y desarrollar.">
                  <RankedList
                    title="Mayor valor actual"
                    items={customerIntelligence?.vipCustomers || []}
                    emptyLabel="Todavia no hay clientes VIP activos en esta ventana."
                    subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.currentOrders)} ops | ${item.preferredPayment}`}
                    renderMetric={(item) => formatMoney(item.currentRevenue)}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                </SectionCard>

                <SectionCard title="Clientes en crecimiento" subtitle="Cuentas que vienen acelerando respecto al periodo anterior.">
                  <RankedList
                    title="Mayor crecimiento"
                    items={customerIntelligence?.growingCustomers || []}
                    emptyLabel="No hay crecimientos fuertes en esta ventana."
                    subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatMoney(item.previousRevenue)} antes`}
                    renderMetric={(item) => formatSignedMoney(item.revenueDelta)}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                </SectionCard>
              </div>
            </div>
          </SectionCard>
        ) : (
          <>
            <SectionCard
              title="Inteligencia de clientes"
              subtitle="Aqui esta el verdadero valor del CRM: riesgo, caida, recuperacion y detalle accionable por cliente."
              actions={<ChannelSelector value={selectedCustomerChannel} onChange={setSelectedCustomerChannel} />}
            >
              <div style={{ display: 'grid', gap: 18 }}>
                <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                  <MetricMiniCard label="Activos" value={formatNumber(customerSummary.activeCustomers)} helper={`${formatMoney(customerSummary.currentRevenue)} en la ventana`} emphasis="blue" />
                  <MetricMiniCard label="Nuevos" value={formatNumber(customerSummary.newCustomersCount)} helper="Primera compra en el historial analizado" emphasis="teal" />
                  <MetricMiniCard label="VIP activos" value={formatNumber(customerSummary.vipCustomersCount)} helper="Clientes de alto valor actualmente comprando" emphasis="gold" />
                  <MetricMiniCard label="Ordenes por activo" value={formatNumber(customerSummary.averageOrdersPerActiveCustomer)} helper={`${formatNumber(customerSummary.averageDaysSinceLastPurchase)} dias desde ultima compra`} emphasis="default" />
                </div>

                <div className="crm-signal-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16 }}>
                  <SignalPanel
                    title="Clientes perdidos"
                    subtitle="Compraron en la ventana anterior y en esta ya no."
                    count={customerSummary.lostCustomersCount}
                    tone="red"
                    items={customerIntelligence?.lostCustomers || []}
                    emptyLabel="No hay clientes perdidos en esta ventana."
                    renderMetric={(item) => formatMoney(item.previousRevenue)}
                    renderHelper={(item) => `Ultima compra ${formatShortDate(item.lastPurchaseDate)} | Caida ${formatSignedMoney(item.revenueDelta)}`}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                  <SignalPanel
                    title="Clientes en riesgo"
                    subtitle="Clientes valiosos sin compra reciente."
                    count={customerSummary.atRiskCustomersCount}
                    tone="amber"
                    items={customerIntelligence?.atRiskCustomers || []}
                    emptyLabel="No hay clientes en riesgo ahora mismo."
                    renderMetric={(item) => formatMoney(item.lifetimeRevenue)}
                    renderHelper={(item) => `${formatNumber(item.daysSinceLastPurchase)} dias sin comprar | ticket ${formatMoney(item.currentTicket || item.previousTicket)}`}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                  <SignalPanel
                    title="Clientes en caida"
                    subtitle="Siguen activos, pero con compra menor al periodo anterior."
                    count={customerSummary.decliningCustomersCount}
                    tone="orange"
                    items={customerIntelligence?.decliningCustomers || []}
                    emptyLabel="No hay clientes con caida relevante en esta ventana."
                    renderMetric={(item) => formatSignedMoney(item.revenueDelta)}
                    renderHelper={(item) => `${formatMoney(item.previousRevenue)} antes | ${formatMoney(item.currentRevenue)} ahora`}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                  <SignalPanel
                    title="Clientes reactivados"
                    subtitle="Volvieron despues de ausentarse en la ventana anterior."
                    count={customerSummary.reactivatedCount}
                    tone="teal"
                    items={customerIntelligence?.reactivatedCustomers || []}
                    emptyLabel="No hay reactivaciones en esta ventana."
                    renderMetric={(item) => formatMoney(item.currentRevenue)}
                    renderHelper={(item) => `Volvio con ${formatNumber(item.currentOrders)} operaciones | ${item.preferredPayment}`}
                    onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                  />
                </div>

                <div className="crm-customer-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.92fr) minmax(0, 1.08fr)', gap: 20 }}>
                  <SectionCard title="Directorio accionable" subtitle="Busca un cliente especifico y abre su radiografia completa.">
                    <CustomerDirectory
                      customers={filteredCustomers}
                      selectedKey={selectedCustomer?.key || ''}
                      onSelectCustomer={(customer) => setSelectedCustomerKey(customer.key)}
                      query={customerQuery}
                      onQueryChange={setCustomerQuery}
                    />
                  </SectionCard>

                  <SectionCard title="Detalle del cliente" subtitle="Lectura rapida para vender mas, recuperar o proteger la cuenta.">
                    <CustomerDetailPanel customer={selectedCustomer} channel={selectedCustomerChannel} />
                  </SectionCard>
                </div>

                <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <SectionCard title="Clientes VIP activos" subtitle="La cartera que mas peso tiene hoy en esta ventana.">
                    <RankedList
                      title="Mayor valor actual"
                      items={customerIntelligence?.vipCustomers || []}
                      emptyLabel="Todavia no hay clientes VIP activos en esta ventana."
                      subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.currentOrders)} ops | ${item.preferredPayment}`}
                      renderMetric={(item) => formatMoney(item.currentRevenue)}
                      onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                    />
                  </SectionCard>

                  <SectionCard title="Clientes en crecimiento" subtitle="Cuentas que aceleraron respecto a la ventana anterior.">
                    <RankedList
                      title="Mayor crecimiento"
                      items={customerIntelligence?.growingCustomers || []}
                      emptyLabel="No hay crecimientos fuertes en esta ventana."
                      subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatMoney(item.previousRevenue)} antes`}
                      renderMetric={(item) => formatSignedMoney(item.revenueDelta)}
                      onSelectCustomer={(item) => setSelectedCustomerKey(item.key)}
                    />
                  </SectionCard>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Tendencia diaria" subtitle="Ultimos 14 puntos para ver ritmo y despegues entre web y SICAR.">
              <DailyTrend online={currentPeriod.online?.daily} sicar={currentPeriod.sicar?.daily} />
            </SectionCard>

            <div className="crm-channel-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <SectionCard title="Tienda en linea" subtitle="Conversion digital, fulfillment y mezcla comercial del canal web.">
                <div style={{ display: 'grid', gap: 18 }}>
                  <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                    <MetricMiniCard label="Venta final" value={formatMoney(onlineSummary.revenue)} helper={`${formatMoney(onlineSummary.projectedRevenue)} proyectado activo`} emphasis="blue" />
                    <MetricMiniCard label="Clientes web" value={formatNumber(onlineSummary.uniqueCustomers)} helper={`${formatNumber(onlineSummary.deliveryCount || 0)} delivery | ${formatNumber(onlineSummary.pickupCount || 0)} pickup`} emphasis="default" />
                    <MetricMiniCard label="Promos" value={`${formatNumber(onlineSummary.rewardOrders || 0)} / ${formatNumber(onlineSummary.couponOrders || 0)}`} helper="Recompensas / cupones usados" emphasis="gold" />
                    <MetricMiniCard label="Ticket" value={formatMoney(onlineSummary.averageTicket)} helper={`${formatNumber(onlineSummary.orderCount || 0)} pedidos no cancelados`} emphasis="blue" />
                  </div>
                  <PaymentList items={currentPeriod.online?.paymentMethods || []} emptyLabel="Sin metodos de pago web en esta ventana." />
                </div>
              </SectionCard>

              <SectionCard title="SICAR" subtitle="Venta consolidada real del negocio central.">
                <div style={{ display: 'grid', gap: 18 }}>
                  <div className="crm-grid-four" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
                    <MetricMiniCard label="Ingreso total" value={formatMoney(sicarSummary.revenue)} helper={`${formatNumber(sicarSummary.saleCount || 0)} transacciones`} emphasis="gold" />
                    <MetricMiniCard label="Clientes" value={formatNumber(sicarSummary.uniqueCustomers)} helper="Clientes unicos facturados" emphasis="default" />
                    <MetricMiniCard label="Ticket promedio" value={formatMoney(sicarSummary.averageTicket)} helper="Venta real consolidada" emphasis="blue" />
                    <MetricMiniCard label="Canal web share" value={formatPercent(comparison.onlineRevenueSharePct)} helper="Peso del canal digital dentro del negocio total" emphasis="blue" />
                  </div>
                  <PaymentList items={currentPeriod.sicar?.paymentMethods || []} emptyLabel="Sin metodos de pago SICAR en esta ventana." />
                </div>
              </SectionCard>
            </div>

            <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <SectionCard title="Top productos web" subtitle="Los cortes y articulos que mas mueven la tienda.">
                <RankedList
                  title="Mas vendidos por tienda"
                  items={currentPeriod.online?.topProducts || []}
                  emptyLabel="Todavia no hay productos web entregados en esta ventana."
                  subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.quantity)} uds | ${formatNumber(item.ordersCount)} pedidos`}
                  renderMetric={(item) => formatMoney(item.revenue)}
                />
              </SectionCard>

              <SectionCard title="Top productos SICAR" subtitle="Lo que realmente mas factura en el sistema central.">
                <RankedList
                  title="Mas vendidos por SICAR"
                  items={currentPeriod.sicar?.topProducts || []}
                  emptyLabel="Todavia no hay productos SICAR en esta ventana."
                  subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.quantity)} uds | ${formatNumber(item.salesCount)} ventas`}
                  renderMetric={(item) => formatMoney(item.revenue)}
                />
              </SectionCard>
            </div>

            <div className="crm-list-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
              <SectionCard title="Top clientes web" subtitle="Quienes mas compran dentro del canal digital.">
                <RankedList
                  title="Clientes de tienda"
                  items={currentPeriod.online?.topCustomers || []}
                  emptyLabel="Todavia no hay clientes web con compras entregadas."
                  subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.ordersCount)} pedidos`}
                  renderMetric={(item) => formatMoney(item.revenue)}
                />
              </SectionCard>

              <SectionCard title="Top clientes SICAR" subtitle="Quienes mas pesan en la venta total del negocio.">
                <RankedList
                  title="Clientes de SICAR"
                  items={currentPeriod.sicar?.topCustomers || []}
                  emptyLabel="Todavia no hay clientes SICAR en esta ventana."
                  subtitleResolver={(item) => `${item.code ? `${item.code} | ` : ''}${formatNumber(item.ordersCount)} ventas`}
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
          </>
        )}
      </div>
    </DashboardShell>
  );
}
