import React, { useEffect, useMemo, useState } from 'react';
import {
  buildCustomerRewardSummary,
  getRewardDisplayStatus,
  getStoreRewardChoiceGroups,
  getStoreRewardFixedItems,
} from '../services/storeRewards';

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;
const CLUB_DISPLAY_NAME = 'Miembro Gold San Martin Granada';
const CLUB_THEME = {
  gold: '#d4af37',
  goldSoft: '#f0d78a',
  goldMuted: '#b89b45',
  bg: '#0f0f10',
  bgAlt: '#171718',
  panel: '#1b1b1c',
  panelSoft: '#242426',
  panelElevated: '#2b2b2e',
  border: 'rgba(212, 175, 55, 0.22)',
  borderStrong: 'rgba(212, 175, 55, 0.4)',
  text: '#f6f1e3',
  textSoft: '#decfa8',
  textMuted: '#b7aa88',
  shadow: 'rgba(0, 0, 0, 0.38)',
  overlay: 'rgba(6, 6, 7, 0.78)',
};

const formatSignedPoints = (transaction = {}) => {
  const signedPoints = Number(transaction?.signedPoints || 0);
  if (signedPoints > 0) {
    return `+${signedPoints}`;
  }
  if (signedPoints < 0) {
    return `${signedPoints}`;
  }
  return String(Number(transaction?.points || 0));
};

const formatTransactionType = (transaction = {}) => {
  const type = String(transaction?.type || '').trim().toLowerCase();
  if (type === 'earned') return 'Acumulaste';
  if (type === 'redeemed') return 'Canjeaste';
  if (type === 'reversed') return Number(transaction?.signedPoints || 0) >= 0 ? 'Te devolvimos' : 'Revertimos';
  return 'Movimiento';
};

const formatTransactionDate = (value) => {
  const parsed = new Date(value || 0);
  if (Number.isNaN(parsed.getTime())) {
    return 'Sin fecha';
  }

  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

function ClubSanMartinIcon({ size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true">
      <rect x="7" y="14" width="68" height="50" rx="12" fill="#fb7185" />
      <path
        d="M43 14h8a3 3 0 0 1 3 3v1a3 3 0 0 0 3 3h4"
        stroke="#111827"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="27" cy="38" r="13" fill="#fff" stroke="#111827" strokeWidth="4" />
      <circle cx="27" cy="34" r="4.5" fill="#fed7aa" />
      <path d="M18 48c1.8-4.5 5.2-7 9-7s7.2 2.5 9 7" fill="#22d3ee" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
      <rect x="48" y="27" width="20" height="8" rx="2" fill="#fff" stroke="#111827" strokeWidth="4" />
      <path d="M49 43h18" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
      <path d="M49 51h9" stroke="#111827" strokeWidth="4" strokeLinecap="round" />
      <circle cx="66" cy="61" r="17" fill="#22d3ee" stroke="#111827" strokeWidth="4" />
      <path
        d="M66 50.5l2.8 5.7 6.2.9-4.5 4.3 1.1 6.1-5.6-3-5.6 3 1.1-6.1-4.5-4.3 6.2-.9 2.8-5.7z"
        fill="#facc15"
        stroke="#111827"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClubChevronIcon({ size = 16, color = CLUB_THEME.gold }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 6l6 6-6 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClubBackIcon({ size = 18, color = CLUB_THEME.text }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClubCloseIcon({ size = 18, color = CLUB_THEME.text }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function ClubRewardsIcon({ size = 22, color = CLUB_THEME.gold }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5l1.9 3.9 4.3.6-3.1 3 0.7 4.3-3.8-2-3.8 2 0.7-4.3-3.1-3 4.3-.6L12 5z"
        fill={color}
        opacity="0.92"
      />
      <path
        d="M12 5l1.9 3.9 4.3.6-3.1 3 0.7 4.3-3.8-2-3.8 2 0.7-4.3-3.1-3 4.3-.6L12 5z"
        stroke={color}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClubTransactionsIcon({ size = 22, color = CLUB_THEME.goldMuted }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="4" stroke={color} strokeWidth="1.8" />
      <path d="M8 10h8M8 14h5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function RewardsProgressCard({ settings, pointsBalance, closestReward }) {
  void settings;
  const rawTargetPoints = Math.max(0, Number(closestReward?.pointsRequired || 0));
  const targetPoints = Math.max(rawTargetPoints, 1);
  const progressPct = Math.max(0, Math.min(100, Math.round((Number(pointsBalance || 0) / targetPoints) * 100)));

  return (
    <section
      style={{
        borderRadius: 28,
        padding: 18,
        background: 'linear-gradient(155deg, #121214 0%, #1a1a1d 58%, #26221a 100%)',
        color: CLUB_THEME.text,
        border: `1px solid ${CLUB_THEME.borderStrong}`,
        boxShadow: `0 24px 50px ${CLUB_THEME.shadow}`,
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: CLUB_THEME.goldSoft }}>
          {CLUB_DISPLAY_NAME}
        </div>
        <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: CLUB_THEME.textSoft }}>
          {"\u00A1Acumula puntos para obtener los mejores cortes!"}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '84px minmax(0, 1fr)',
          gap: 14,
          alignItems: 'center',
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: 24,
            overflow: 'hidden',
            background: 'linear-gradient(160deg, rgba(212, 175, 55, 0.12) 0%, rgba(255,255,255,0.04) 100%)',
            border: `1px solid ${CLUB_THEME.borderStrong}`,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {closestReward?.image ? (
            <img
              src={closestReward.image}
              alt={closestReward.name || CLUB_DISPLAY_NAME}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <ClubSanMartinIcon size={56} />
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 13, color: CLUB_THEME.textSoft, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Puntos actuales
              </div>
              <div style={{ marginTop: 4, fontSize: 34, fontWeight: 900, lineHeight: 1, color: CLUB_THEME.text }}>
                {Number(pointsBalance || 0)} pts
              </div>
            </div>

            <div
              style={{
                padding: '8px 12px',
                borderRadius: 999,
                background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.18) 0%, rgba(97, 79, 20, 0.3) 100%)',
                border: `1px solid ${CLUB_THEME.borderStrong}`,
                fontSize: 13,
                fontWeight: 900,
                whiteSpace: 'nowrap',
                color: CLUB_THEME.goldSoft,
              }}
            >
              Meta: {rawTargetPoints} pts
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            height: 18,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.08)',
            border: `1px solid ${CLUB_THEME.border}`,
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #9c7a1f 0%, #d4af37 45%, #f0d78a 100%)',
              boxShadow: '0 10px 22px rgba(212, 175, 55, 0.34)',
              transition: 'width 180ms ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 800, fontSize: 12.5, color: CLUB_THEME.textSoft }}>
          <span>{Number(pointsBalance || 0)} pts</span>
          <span>Meta: {rawTargetPoints} pts</span>
        </div>
      </div>
    </section>
  );
}
function RewardCard({
  reward,
  status,
  pointsBalance,
  selectedReward,
  cartAmount,
  onSelectReward,
  onClearSelectedReward,
  busy,
}) {
  const choiceGroups = useMemo(() => getStoreRewardChoiceGroups(reward), [reward]);
  const fixedItems = useMemo(() => getStoreRewardFixedItems(reward), [reward]);
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(
      choiceGroups.map((group) => [group.choiceGroup, String(group.items?.[0]?.productCode || '').trim()])
    )
  );

  const missingPoints = Math.max(0, Number(reward.pointsRequired || 0) - Number(pointsBalance || 0));
  const isSelected = selectedReward?.rewardId === reward.id;
  const canRedeem = status.status === 'available';

  const statusMeta = (() => {
    if (isSelected) {
      return { label: 'Seleccionado', tone: CLUB_THEME.goldSoft, bg: 'rgba(212, 175, 55, 0.12)', border: CLUB_THEME.borderStrong };
    }
    if (status.status === 'available') {
      return { label: 'Disponible', tone: CLUB_THEME.goldSoft, bg: 'rgba(212, 175, 55, 0.12)', border: CLUB_THEME.borderStrong };
    }
    if (status.status === 'unavailable') {
      return { label: 'Sin disponibilidad', tone: CLUB_THEME.textMuted, bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.08)' };
    }
    if (status.status === 'min_purchase') {
      return { label: `Compra minima ${formatCurrency(reward.minPurchaseAmount)}`, tone: CLUB_THEME.goldSoft, bg: 'rgba(212, 175, 55, 0.1)', border: CLUB_THEME.border };
    }
    return { label: `${missingPoints} pts faltantes`, tone: CLUB_THEME.goldMuted, bg: 'rgba(212, 175, 55, 0.08)', border: CLUB_THEME.border };
  })();

  const actionLabel = canRedeem
    ? 'Canjear premio'
    : status.status === 'min_purchase'
      ? 'Aun no aplica'
      : status.status === 'unavailable'
        ? 'Sin disponibilidad'
        : `${missingPoints} pts faltantes`;

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: reward.image ? '112px minmax(0, 1fr)' : '1fr',
        gap: 16,
        padding: 18,
        borderRadius: 24,
        background: CLUB_THEME.panelElevated,
        border: isSelected ? `2px solid ${CLUB_THEME.borderStrong}` : `1px solid ${CLUB_THEME.border}`,
        boxShadow: isSelected ? '0 22px 44px rgba(212, 175, 55, 0.12)' : '0 18px 36px rgba(0, 0, 0, 0.22)',
      }}
    >
      {reward.image && (
        <div
          style={{
            height: 112,
            width: 112,
            borderRadius: 24,
            overflow: 'hidden',
            background: CLUB_THEME.panelSoft,
          }}
        >
          <img
            src={reward.image}
            alt={reward.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <strong style={{ display: 'block', fontSize: 21, color: CLUB_THEME.text }}>{reward.name}</strong>
            <span style={{ color: CLUB_THEME.textSoft, fontWeight: 700 }}>{Number(reward.pointsRequired || 0)} puntos</span>
          </div>
          <span
            style={{
              alignSelf: 'start',
              padding: '9px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 900,
              background: statusMeta.bg,
              color: statusMeta.tone,
              border: `1px solid ${statusMeta.border}`,
            }}
          >
            {statusMeta.label}
          </span>
        </div>

        {reward.description && <p style={{ margin: 0, color: CLUB_THEME.textMuted, lineHeight: 1.55 }}>{reward.description}</p>}

        {fixedItems.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: CLUB_THEME.goldMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Incluye
            </span>
            {fixedItems.map((item) => (
              <div key={item.id} style={{ color: CLUB_THEME.text, fontWeight: 700 }}>
                {Number(item.quantity || 1)} x {item.productName || item.productCode}
              </div>
            ))}
          </div>
        )}

        {choiceGroups.map((group) => (
          <div key={group.choiceGroup} style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: CLUB_THEME.goldMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Elige una opcion
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {group.items.map((item) => {
                const active = choices[group.choiceGroup] === item.productCode;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setChoices((current) => ({
                        ...current,
                        [group.choiceGroup]: item.productCode,
                      }))
                    }
                    style={{
                      borderRadius: 999,
                      border: active ? `2px solid ${CLUB_THEME.borderStrong}` : `1px solid ${CLUB_THEME.border}`,
                      background: active ? 'rgba(212, 175, 55, 0.14)' : CLUB_THEME.panelElevated,
                      color: active ? CLUB_THEME.goldSoft : CLUB_THEME.textSoft,
                      fontWeight: 800,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.choiceLabel || item.productName || item.productCode}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isSelected ? (
            <button
              type="button"
              onClick={onClearSelectedReward}
              style={{
                border: `1px solid ${CLUB_THEME.border}`,
                background: CLUB_THEME.panelElevated,
                color: CLUB_THEME.text,
                borderRadius: 999,
                padding: '12px 18px',
                fontWeight: 900,
                cursor: 'pointer',
              }}
            >
              Seguir acumulando
            </button>
          ) : (
            <button
              type="button"
              disabled={!canRedeem || busy}
              onClick={() => onSelectReward(reward, { choices })}
              style={{
                border: 0,
                background: canRedeem ? 'linear-gradient(135deg, #8c6b1e 0%, #d4af37 55%, #f0d78a 100%)' : 'rgba(255,255,255,0.08)',
                color: canRedeem ? '#151515' : CLUB_THEME.textMuted,
                borderRadius: 999,
                padding: '12px 18px',
                fontWeight: 900,
                cursor: canRedeem && !busy ? 'pointer' : 'not-allowed',
                boxShadow: canRedeem ? '0 16px 30px rgba(212, 175, 55, 0.24)' : 'none',
              }}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function GuestRewardsPrompt({ onOpenAuth }) {
  return (
    <div
      style={{
        borderRadius: 24,
        padding: 22,
        background: 'linear-gradient(180deg, #18181a 0%, #202023 100%)',
        border: `1px solid ${CLUB_THEME.border}`,
        boxShadow: '0 20px 38px rgba(0, 0, 0, 0.22)',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 28, color: CLUB_THEME.goldSoft }}>{CLUB_DISPLAY_NAME}</h2>
      <p style={{ margin: '10px 0 0', color: CLUB_THEME.textSoft, lineHeight: 1.6 }}>
        Inicia sesion para acumular puntos, ver tus premios y canjear uno en tu proximo pedido.
      </p>
      <button
        type="button"
        onClick={onOpenAuth}
        style={{
          marginTop: 18,
          border: 0,
          borderRadius: 999,
          background: 'linear-gradient(135deg, #8c6b1e 0%, #d4af37 55%, #f0d78a 100%)',
          color: '#151515',
          padding: '12px 18px',
          fontWeight: 900,
          cursor: 'pointer',
        }}
      >
        Inicia sesion para participar
      </button>
    </div>
  );
}
export function StoreRewardsSummaryCard({
  currentUser,
  settings,
  account,
  rewards,
  cartAmount = 0,
  selectedReward,
  onOpen,
}) {
  void settings;
  void rewards;
  void cartAmount;
  const pointsBalance = Number(account?.pointsBalance || 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{
        width: '100%',
        border: 0,
        padding: 0,
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          borderRadius: 24,
          padding: '14px 14px 14px 16px',
          background: selectedReward
            ? 'linear-gradient(135deg, rgba(212, 175, 55, 0.18) 0%, rgba(43, 43, 46, 0.96) 100%)'
            : 'linear-gradient(135deg, #151517 0%, #202023 100%)',
          border: selectedReward ? `1px solid ${CLUB_THEME.borderStrong}` : `1px solid ${CLUB_THEME.border}`,
          boxShadow: '0 16px 30px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto auto',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, rgba(212, 175, 55, 0.18) 0%, rgba(255,255,255,0.04) 100%)',
              border: `1px solid ${CLUB_THEME.border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <ClubSanMartinIcon size={44} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: CLUB_THEME.goldSoft,
                fontSize: 20,
                fontWeight: 900,
                lineHeight: 1.05,
              }}
            >
              {CLUB_DISPLAY_NAME}
            </div>
            <div
              style={{
                display: 'block',
                marginTop: 5,
                fontSize: 11,
                color: CLUB_THEME.textMuted,
                lineHeight: 1.1,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontWeight: 900,
              }}
            >
              {currentUser ? 'Puntos disponibles' : 'Acceso al club'}
            </div>
          </div>

          <div style={{ display: 'grid', justifyItems: 'end' }}>
            {currentUser ? (
              <div
                style={{
                  minWidth: 92,
                  padding: '10px 12px',
                  borderRadius: 999,
                  background: CLUB_THEME.panelElevated,
                  border: `1px solid ${CLUB_THEME.border}`,
                  color: CLUB_THEME.goldSoft,
                  fontWeight: 900,
                  fontSize: 15,
                  textAlign: 'center',
                  boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
                }}
              >
                {pointsBalance} pts
              </div>
            ) : (
              <div
                style={{
                  minWidth: 92,
                  padding: '10px 12px',
                  borderRadius: 999,
                  background: CLUB_THEME.panelElevated,
                  border: `1px solid ${CLUB_THEME.border}`,
                  color: CLUB_THEME.goldSoft,
                  fontWeight: 900,
                  fontSize: 13,
                  textAlign: 'center',
                  boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
                }}
              >
                Entrar
              </div>
            )}
          </div>

          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: CLUB_THEME.panelElevated,
              border: `1px solid ${CLUB_THEME.border}`,
            }}
          >
            <ClubChevronIcon />
          </div>
        </div>
      </div>
    </button>
  );
}
function SheetRoundButton({ onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        width: 42,
        height: 42,
        borderRadius: 999,
        border: `1px solid ${CLUB_THEME.border}`,
        background: CLUB_THEME.panelElevated,
        color: CLUB_THEME.text,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        boxShadow: '0 10px 24px rgba(0, 0, 0, 0.18)',
      }}
    >
      {children}
    </button>
  );
}

function SheetSectionShortcut({ title, icon, onClick, accent = CLUB_THEME.gold }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${CLUB_THEME.border}`,
        background: CLUB_THEME.panelElevated,
        borderRadius: 24,
        padding: '18px 18px',
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 14,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: '0 18px 34px rgba(0, 0, 0, 0.18)',
        transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 16,
          display: 'grid',
          placeItems: 'center',
          background: 'rgba(212, 175, 55, 0.12)',
        }}
      >
        {icon}
      </div>
      <div
        style={{
          color: CLUB_THEME.text,
          fontSize: 19,
          fontWeight: 900,
          lineHeight: 1.1,
        }}
      >
        {title}
      </div>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          display: 'grid',
          placeItems: 'center',
          background: CLUB_THEME.panelSoft,
          border: `1px solid ${CLUB_THEME.border}`,
        }}
      >
        <ClubChevronIcon color={accent} />
      </div>
    </button>
  );
}

export default function StoreRewardsSheet({
  open,
  currentUser,
  settings,
  rewards,
  account,
  transactions,
  cartAmount = 0,
  selectedReward,
  rewardActionBusy = false,
  onSelectReward,
  onClearSelectedReward,
  onClose,
  onOpenAuth,
}) {
  const [activeView, setActiveView] = useState('home');
  const [isCompactLayout, setIsCompactLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 860 : false
  );
  const pointsBalance = Number(account?.pointsBalance || 0);
  const rewardSummary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const rewardList = Array.isArray(rewards) ? rewards : [];
  const transactionList = Array.isArray(transactions) ? transactions : [];
  const viewOrder = ['home', 'rewards', 'transactions'];
  const activeViewIndex = Math.max(0, viewOrder.indexOf(activeView));

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveView('home');
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setIsCompactLayout(window.innerWidth <= 860);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderRewardCards = (items = []) =>
    items.map((reward) => {
      const status = getRewardDisplayStatus(reward, pointsBalance, cartAmount, settings);
      return (
        <RewardCard
          key={reward.id}
          reward={reward}
          status={status}
          pointsBalance={pointsBalance}
          selectedReward={selectedReward}
          cartAmount={cartAmount}
          busy={rewardActionBusy}
          onSelectReward={onSelectReward}
          onClearSelectedReward={onClearSelectedReward}
        />
      );
    });

  const openView = (view) => setActiveView(view);
  const goHome = () => setActiveView('home');

  const getPaneStyle = (view) => {
    const paneIndex = viewOrder.indexOf(view);
    const isActive = paneIndex === activeViewIndex;
    const offset = paneIndex < activeViewIndex ? -24 : 24;

    return {
      position: isActive ? 'relative' : 'absolute',
      inset: 0,
      opacity: isActive ? 1 : 0,
      transform: isActive ? 'translateX(0)' : `translateX(${offset}px)`,
      pointerEvents: isActive ? 'auto' : 'none',
      transition: 'opacity 160ms ease, transform 160ms ease',
      visibility: isActive ? 'visible' : 'hidden',
      height: '100%',
    };
  };

  const panelSurfaceStyle = {
    borderRadius: isCompactLayout ? 24 : 28,
    background: CLUB_THEME.panelElevated,
    padding: isCompactLayout ? 16 : 22,
    border: `1px solid ${CLUB_THEME.border}`,
    boxShadow: '0 20px 38px rgba(0, 0, 0, 0.22)',
  };

  if (!open) {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        background: CLUB_THEME.overlay,
        backdropFilter: 'blur(18px)',
        padding: isCompactLayout ? 0 : 'clamp(14px, 3vw, 28px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: isCompactLayout ? 'stretch' : 'center',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: isCompactLayout ? '100%' : 'min(1080px, 100%)',
          height: isCompactLayout ? '100dvh' : 'min(90vh, 920px)',
          maxHeight: isCompactLayout ? '100dvh' : 'min(90vh, 920px)',
          overflow: 'hidden',
          borderRadius: isCompactLayout ? 0 : 34,
          background: 'linear-gradient(180deg, #101011 0%, #18181a 100%)',
          padding: isCompactLayout ? '14px 14px 18px' : 'clamp(16px, 3vw, 28px)',
          boxShadow: '0 34px 80px rgba(0, 0, 0, 0.42)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: activeView === 'home' ? 'flex-end' : 'space-between',
            gap: 12,
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          {activeView !== 'home' && (
            <button
              type="button"
              onClick={goHome}
              style={{
                border: `1px solid ${CLUB_THEME.border}`,
                background: CLUB_THEME.panelElevated,
                color: CLUB_THEME.text,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px 10px 12px',
                borderRadius: 999,
                fontWeight: 900,
                fontSize: 17,
                cursor: 'pointer',
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18)',
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(212, 175, 55, 0.12)',
                }}
              >
                <ClubBackIcon />
              </span>
              <span>{activeView === 'rewards' ? 'Premios' : 'Movimientos'}</span>
            </button>
          )}

          <SheetRoundButton onClick={onClose} ariaLabel="Cerrar Miembro Gold San Martin">
            <ClubCloseIcon />
          </SheetRoundButton>
        </div>

        {!currentUser ? (
          <GuestRewardsPrompt onOpenAuth={onOpenAuth} />
        ) : (
          <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
            <div style={getPaneStyle('home')}>
              <div style={{ height: '100%', overflowY: 'auto', display: 'grid', gap: 14 }}>
                <RewardsProgressCard
                  settings={settings}
                  pointsBalance={pointsBalance}
                  closestReward={rewardSummary.closestReward}
                />

                <SheetSectionShortcut
                  title="Premios"
                  icon={<ClubRewardsIcon />}
                  onClick={() => openView('rewards')}
                />

                <SheetSectionShortcut
                  title="Movimientos de puntos"
                  icon={<ClubTransactionsIcon />}
                  accent={CLUB_THEME.goldMuted}
                  onClick={() => openView('transactions')}
                />
              </div>
            </div>

            <div style={getPaneStyle('rewards')}>
              <div style={{ height: '100%', overflowY: 'auto' }}>
                <section style={panelSurfaceStyle}>
                  <div style={{ marginBottom: 16 }}>
                    <RewardsProgressCard
                      settings={settings}
                      pointsBalance={pointsBalance}
                      closestReward={rewardSummary.closestReward}
                    />
                  </div>

                  <strong style={{ display: 'block', fontSize: isCompactLayout ? 24 : 28, color: CLUB_THEME.goldSoft }}>
                    Premios
                  </strong>

                  <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
                    {rewardList.length > 0 ? (
                      renderRewardCards(rewardList)
                    ) : (
                      <div
                        style={{
                          padding: 18,
                          borderRadius: 18,
                          background: CLUB_THEME.panelSoft,
                          color: CLUB_THEME.textSoft,
                          fontWeight: 700,
                        }}
                      >
                        Todavia no hay premios configurados.
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>

            <div style={getPaneStyle('transactions')}>
              <div style={{ height: '100%', overflowY: 'auto' }}>
                <section style={panelSurfaceStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ display: 'block', fontSize: isCompactLayout ? 24 : 28, color: CLUB_THEME.goldSoft }}>
                      Movimientos de puntos
                    </strong>
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: CLUB_THEME.panelSoft,
                        color: CLUB_THEME.goldSoft,
                        fontWeight: 900,
                      }}
                    >
                      {pointsBalance} pts
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
                    {transactionList.length === 0 ? (
                      <div
                        style={{
                          padding: 18,
                          borderRadius: 18,
                          background: CLUB_THEME.panelSoft,
                          color: CLUB_THEME.textSoft,
                          fontWeight: 700,
                        }}
                      >
                        Todavia no tienes movimientos de puntos.
                      </div>
                    ) : (
                      transactionList.map((transaction) => (
                        <div
                          key={transaction.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'minmax(0, 1fr) auto',
                            gap: 10,
                            alignItems: 'center',
                            padding: '14px 16px',
                            borderRadius: 18,
                            background: CLUB_THEME.panelSoft,
                          }}
                        >
                          <div>
                            <strong style={{ color: CLUB_THEME.text }}>
                              {transaction.rewardName || transaction.orderKey || formatTransactionType(transaction)}
                            </strong>
                            <div style={{ marginTop: 4, color: CLUB_THEME.textMuted }}>{formatTransactionDate(transaction.createdAt)}</div>
                            <div style={{ marginTop: 4, color: CLUB_THEME.textSoft, fontWeight: 700 }}>
                              {transaction.note || formatTransactionType(transaction)}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong
                              style={{
                                display: 'block',
                                fontSize: 22,
                                color: Number(transaction.signedPoints || 0) >= 0 ? CLUB_THEME.goldSoft : '#d08b8b',
                              }}
                            >
                              {formatSignedPoints(transaction)}
                            </strong>
                            <span style={{ color: CLUB_THEME.textMuted, fontWeight: 700 }}>{formatTransactionType(transaction)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

