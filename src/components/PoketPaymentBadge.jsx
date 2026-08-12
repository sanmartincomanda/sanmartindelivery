import React from 'react';
import { isPoketPaymentConfirmed } from '../services/poketPaylinks';

const formatNio = (value) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

export function PoketLogo({ size = 44, inverted = true }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        display: 'inline-grid',
        placeItems: 'center',
        flex: '0 0 auto',
        borderRadius: Math.max(12, Math.round(size * 0.28)),
        background: inverted ? 'rgba(255,255,255,0.16)' : 'linear-gradient(145deg, #173bc5, #18a7c4)',
        boxShadow: inverted ? 'inset 0 0 0 1px rgba(255,255,255,0.2)' : '0 10px 24px rgba(23,59,197,0.24)',
        overflow: 'hidden',
      }}
    >
      <img
        src="/tienda/branding/poket-logo.png"
        alt=""
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </span>
  );
}

export default function PoketPaymentBadge({ order, compact = false, className = '' }) {
  if (!isPoketPaymentConfirmed(order)) return null;

  const amount = Number(order?.poketPayment?.receivedAmount || order?.poketPayment?.amount || order?.total || 0);
  const reference = String(order?.poketPayment?.reference || '').trim();

  return (
    <div
      className={className}
      role="status"
      aria-label={`Pagado con Poket por ${formatNio(amount)}`}
      style={{
        width: compact ? 'auto' : '100%',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: compact ? 8 : 16,
        padding: compact ? '8px 11px' : '14px 18px',
        borderRadius: compact ? 14 : 20,
        color: '#fff',
        background: 'linear-gradient(135deg, #173bc5 0%, #1d5bd7 52%, #16a7bd 100%)',
        border: '1px solid rgba(255,255,255,0.24)',
        boxShadow: compact ? '0 8px 18px rgba(23,59,197,0.2)' : '0 18px 36px rgba(23,59,197,0.28)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 8 : 13, minWidth: 0 }}>
        <PoketLogo size={compact ? 34 : 52} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? 10 : 12, fontWeight: 800, opacity: 0.86, letterSpacing: '0.08em' }}>
            PAGO CONFIRMADO
          </div>
          <div style={{ fontSize: compact ? 14 : 22, fontWeight: 950, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
            PAGADO CON POKET
          </div>
        </div>
      </div>
      {!compact && (
        <div style={{ textAlign: 'right', flex: '0 0 auto' }}>
          <div style={{ fontSize: 20, fontWeight: 950 }}>{formatNio(amount)}</div>
          {reference && <div style={{ marginTop: 2, fontSize: 10, fontWeight: 750, opacity: 0.8 }}>REF. {reference}</div>}
        </div>
      )}
    </div>
  );
}
