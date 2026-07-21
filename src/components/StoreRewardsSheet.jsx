import React, { useEffect, useMemo, useState } from 'react';
import {
  buildCustomerRewardSummary,
  getRewardDisplayStatus,
  getStoreRewardChoiceGroups,
  getStoreRewardFixedItems,
} from '../services/storeRewards';
import { useRef } from 'react';
import SanMartinCrownIcon from './SanMartinCrownIcon';
import { SAN_MARTIN_THEME } from '../styles/sanMartinTheme';

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;
const CLUB_DISPLAY_NAME = 'Miembro Gold San Martin Granada';
const CLUB_THEME = {
  ...SAN_MARTIN_THEME,
  panel: '#ffffff',
  panelSoft: '#f0f7ff',
  panelElevated: '#ffffff',
  overlay: 'rgba(8, 42, 79, 0.34)',
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
  return <SanMartinCrownIcon size={size} color={CLUB_THEME.red} />;
}

function ClubChevronIcon({ size = 16, color = CLUB_THEME.blueDeep }) {
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

function ClubRewardsIcon({ size = 22, color = CLUB_THEME.blueDeep }) {
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

function ClubTransactionsIcon({ size = 22, color = CLUB_THEME.blueDeep }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="4" stroke={color} strokeWidth="1.8" />
      <path d="M8 10h8M8 14h5" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ClubTrophyIcon({ size = 22, color = '#ffffff' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8v3.5c0 3.1-1.8 5.5-4 5.5s-4-2.4-4-5.5V4z" fill={color} />
      <path d="M8 6H5v1.5C5 10 6.6 11 9 11M16 6h3v1.5C19 10 17.4 11 15 11M12 13v4M8.5 20h7M9.5 17h5" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ClubSparkleIcon({ size = 16, color = '#f7d96b' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.8c.7 4.8 2.4 6.5 7.2 7.2-4.8.7-6.5 2.4-7.2 7.2-.7-4.8-2.4-6.5-7.2-7.2 4.8-.7 6.5-2.4 7.2-7.2z" fill={color} />
      <path d="M19 15.5c.3 2.1 1.1 2.9 3.2 3.2-2.1.3-2.9 1.1-3.2 3.2-.3-2.1-1.1-2.9-3.2-3.2 2.1-.3 2.9-1.1 3.2-3.2z" fill={color} opacity="0.8" />
    </svg>
  );
}

function RewardsProgressCard({ settings, pointsBalance, closestReward, availableReward, onOpenRewards }) {
  void settings;
  const rawTargetPoints = Math.max(0, Number(closestReward?.pointsRequired || 0));
  const targetPoints = Math.max(rawTargetPoints, 1);
  const progressPct = Math.max(0, Math.min(100, Math.round((Number(pointsBalance || 0) / targetPoints) * 100)));
  const hasUnlockedReward = Boolean(availableReward?.id);
  const featuredReward = availableReward || closestReward;

  return (
    <section
      className={`sm-rewards-progress-card${hasUnlockedReward ? ' sm-rewards-progress-card--winner' : ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 28,
        padding: 18,
        background: hasUnlockedReward
          ? 'linear-gradient(145deg, #082b51 0%, #0e5fa8 46%, #237fd0 72%, #b98b19 140%)'
          : 'linear-gradient(160deg, #0e4d88 0%, #1d74c7 58%, #5caaf4 100%)',
        color: '#ffffff',
        border: hasUnlockedReward ? '1px solid rgba(247, 217, 107, 0.72)' : `1px solid ${CLUB_THEME.borderStrong}`,
        boxShadow: hasUnlockedReward
          ? '0 26px 58px rgba(8, 43, 81, 0.28), 0 0 0 1px rgba(247, 217, 107, 0.16)'
          : `0 24px 50px ${CLUB_THEME.shadow}`,
      }}
    >
      {hasUnlockedReward && (
        <div className="sm-reward-confetti" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{ marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.05, color: '#ffffff' }}>
              {CLUB_DISPLAY_NAME}
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {hasUnlockedReward ? 'Tu constancia ya tiene premio.' : "\u00A1Acumula puntos para obtener los mejores cortes!"}
            </div>
          </div>

          {hasUnlockedReward && (
            <div className="sm-reward-winner-pill">
              <ClubTrophyIcon size={18} />
              <span>Premio ganado</span>
              <ClubSparkleIcon size={14} />
            </div>
          )}
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
            className={hasUnlockedReward ? 'sm-reward-featured-image sm-reward-featured-image--winner' : 'sm-reward-featured-image'}
            style={{
              width: 84,
              height: 84,
              borderRadius: 24,
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.18)',
              border: '1px solid rgba(255,255,255,0.18)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {featuredReward?.image ? (
              <img
                src={featuredReward.image}
                alt={featuredReward.name || CLUB_DISPLAY_NAME}
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
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.86)', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Puntos actuales
                </div>
                <div style={{ marginTop: 4, fontSize: 34, fontWeight: 900, lineHeight: 1, color: '#ffffff' }}>
                  {Number(pointsBalance || 0)} pts
                </div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  fontSize: 13,
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  color: '#ffffff',
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
              background: 'rgba(255,255,255,0.16)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            <div
              className={hasUnlockedReward ? 'sm-reward-progress-fill sm-reward-progress-fill--winner' : 'sm-reward-progress-fill'}
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

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 800, fontSize: 12.5, color: 'rgba(255,255,255,0.92)' }}>
            <span>{Number(pointsBalance || 0)} pts</span>
            <span>Meta: {rawTargetPoints} pts</span>
          </div>
        </div>

        {hasUnlockedReward && (
          <button type="button" className="sm-reward-victory-card" onClick={onOpenRewards}>
            <span className="sm-reward-victory-icon"><ClubTrophyIcon size={24} /></span>
            <span className="sm-reward-victory-copy">
              <span className="sm-reward-victory-kicker">¡Lo lograste!</span>
              <strong>{availableReward.name}</strong>
              <span>Tu premio está listo para canjear.</span>
            </span>
            <span className="sm-reward-victory-action">Ver premio <ClubChevronIcon size={14} color="#082b51" /></span>
          </button>
        )}
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
      return { label: 'Seleccionado', tone: CLUB_THEME.blueDeep, bg: 'rgba(29, 116, 199, 0.12)', border: CLUB_THEME.borderStrong };
    }
    if (status.status === 'available') {
      return { label: 'Disponible', tone: CLUB_THEME.blueDeep, bg: 'rgba(29, 116, 199, 0.12)', border: CLUB_THEME.borderStrong };
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
      className={`sm-reward-detail-card${canRedeem ? ' sm-reward-detail-card--available' : ''}${isSelected ? ' sm-reward-detail-card--selected' : ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: reward.image ? '112px minmax(0, 1fr)' : '1fr',
        gap: 16,
        padding: 18,
        borderRadius: 24,
        background: canRedeem
          ? 'linear-gradient(135deg, #fffdf4 0%, #ffffff 46%, #eef7ff 100%)'
          : CLUB_THEME.panelElevated,
        border: canRedeem
          ? '2px solid rgba(209, 172, 63, 0.72)'
          : isSelected
            ? `2px solid ${CLUB_THEME.borderStrong}`
            : `1px solid ${CLUB_THEME.border}`,
        boxShadow: canRedeem
          ? '0 22px 46px rgba(154, 116, 18, 0.18), 0 0 0 4px rgba(232, 199, 108, 0.1)'
          : isSelected
            ? '0 22px 44px rgba(29, 116, 199, 0.16)'
            : '0 18px 36px rgba(24, 93, 160, 0.12)',
      }}
    >
      {reward.image && (
        <div
          className={canRedeem ? 'sm-reward-detail-image sm-reward-detail-image--available' : 'sm-reward-detail-image'}
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
        {canRedeem && (
          <div className="sm-reward-card-unlocked-label">
            <ClubTrophyIcon size={17} />
            <span>¡Premio desbloqueado!</span>
            <ClubSparkleIcon size={14} />
          </div>
        )}

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
                      background: active ? 'rgba(29, 116, 199, 0.12)' : CLUB_THEME.panelElevated,
                      color: active ? CLUB_THEME.blueDeep : CLUB_THEME.textSoft,
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
              className={canRedeem ? 'sm-reward-redeem-button' : ''}
              disabled={!canRedeem || busy}
              onClick={() => onSelectReward(reward, { choices })}
              style={{
                border: 0,
                background: canRedeem ? 'linear-gradient(135deg, #0e4d88 0%, #1d74c7 58%, #5caaf4 100%)' : 'rgba(29, 116, 199, 0.08)',
                color: canRedeem ? '#ffffff' : CLUB_THEME.textMuted,
                borderRadius: 999,
                padding: '12px 18px',
                fontWeight: 900,
                cursor: canRedeem && !busy ? 'pointer' : 'not-allowed',
                boxShadow: canRedeem ? '0 16px 30px rgba(24, 93, 160, 0.22)' : 'none',
              }}
            >
              {canRedeem && <ClubTrophyIcon size={18} />}
              <span>{actionLabel}</span>
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
        background: 'linear-gradient(180deg, #ffffff 0%, #f2f8ff 100%)',
        border: `1px solid ${CLUB_THEME.border}`,
        boxShadow: '0 20px 38px rgba(24, 93, 160, 0.12)',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 28, color: CLUB_THEME.blueDeep }}>{CLUB_DISPLAY_NAME}</h2>
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
          background: 'linear-gradient(135deg, #0e4d88 0%, #1d74c7 58%, #5caaf4 100%)',
          color: '#ffffff',
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
  compact = false,
}) {
  const pointsBalance = Number(account?.pointsBalance || 0);
  const summary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const hasAvailableReward = Boolean(currentUser && summary.availableRewards.length > 0);
  const compactTitle = compact ? 'Miembro Gold' : CLUB_DISPLAY_NAME;
  const compactSubtitle = 'San Martin Granada';

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
        className={hasAvailableReward ? 'sm-reward-summary-card sm-reward-summary-card--winner' : 'sm-reward-summary-card'}
        style={{
          borderRadius: compact ? 20 : 24,
          padding: compact ? '10px 12px 10px 12px' : '14px 14px 14px 16px',
          background: hasAvailableReward
            ? 'linear-gradient(135deg, #fff8d8 0%, #ffffff 46%, #e8f4ff 100%)'
            : selectedReward
            ? 'linear-gradient(135deg, rgba(29, 116, 199, 0.14) 0%, rgba(232, 199, 108, 0.18) 100%)'
            : 'linear-gradient(135deg, #ffffff 0%, #eef7ff 100%)',
          border: hasAvailableReward
            ? '1px solid rgba(209, 172, 63, 0.74)'
            : selectedReward
              ? `1px solid ${CLUB_THEME.borderStrong}`
              : `1px solid ${CLUB_THEME.border}`,
          boxShadow: hasAvailableReward
            ? '0 16px 32px rgba(154, 116, 18, 0.17)'
            : '0 16px 30px rgba(24, 93, 160, 0.12)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: compact ? 'auto minmax(0, 1fr) auto auto' : 'auto minmax(0, 1fr) auto auto',
            gap: compact ? 9 : 12,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: compact ? 44 : 56,
              height: compact ? 44 : 56,
              borderRadius: compact ? 14 : 16,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.98) 0%, rgba(237,246,255,0.92) 100%)',
              border: `1px solid ${CLUB_THEME.border}`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.8)',
            }}
          >
            <ClubSanMartinIcon size={compact ? 32 : 44} />
          </div>

          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: CLUB_THEME.blueDeep,
                fontSize: compact ? 14 : 20,
                fontWeight: 900,
                lineHeight: 1.05,
              }}
            >
              {compactTitle}
            </div>
            {compact && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9.5,
                  color: CLUB_THEME.textMuted,
                  lineHeight: 1.1,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  fontWeight: 900,
                }}
              >
                {compactSubtitle}
              </div>
            )}
            {compact && (
              <div
                style={{
                  marginTop: 3,
                  fontSize: 9.5,
                  color: CLUB_THEME.textSoft,
                  lineHeight: 1.1,
                  fontWeight: 800,
                }}
              >
                {hasAvailableReward ? '¡Premio listo!' : currentUser ? 'Puntos disponibles' : 'Acceso al club'}
              </div>
            )}
            {!compact && (
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
                {hasAvailableReward ? '¡Premio listo para canjear!' : currentUser ? 'Puntos disponibles' : 'Acceso al club'}
              </div>
            )}
          </div>

          <div style={{ display: 'grid', justifyItems: 'end' }}>
            {currentUser ? (
              <div
                style={{
                  minWidth: compact ? 72 : 92,
                  padding: compact ? '8px 10px' : '10px 12px',
                  borderRadius: 999,
                  background: 'linear-gradient(135deg, #0e4d88 0%, #1d74c7 58%, #5caaf4 100%)',
                  border: '1px solid rgba(255,255,255,0.18)',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: compact ? 12 : 15,
                  textAlign: 'center',
                  boxShadow: '0 8px 18px rgba(24, 93, 160, 0.18)',
                }}
              >
                {pointsBalance} pts
              </div>
            ) : (
              <div
                style={{
                  minWidth: compact ? 72 : 92,
                  padding: compact ? '8px 10px' : '10px 12px',
                  borderRadius: 999,
                  background: CLUB_THEME.panelElevated,
                  border: `1px solid ${CLUB_THEME.border}`,
                  color: CLUB_THEME.blueDeep,
                  fontWeight: 900,
                  fontSize: compact ? 12 : 13,
                  textAlign: 'center',
                  boxShadow: '0 8px 18px rgba(24, 93, 160, 0.12)',
                }}
              >
                Entrar
              </div>
            )}
          </div>

          <div
            style={{
              width: compact ? 28 : 34,
              height: compact ? 28 : 34,
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
        boxShadow: '0 10px 24px rgba(24, 93, 160, 0.12)',
      }}
    >
      {children}
    </button>
  );
}

function getRewardPreviewStatusLabel(status = {}, reward = {}) {
  if (status.status === 'available') {
    return 'Listo para canjear';
  }

  if (status.status === 'min_purchase') {
    return 'Requiere compra minima';
  }

  if (status.status === 'unavailable') {
    return 'Sin disponibilidad';
  }

  if (status.status === 'inactive' || status.status === 'disabled') {
    return 'No disponible';
  }

  if (Number(status.missingPoints || 0) > 0) {
    return `Te faltan ${Number(status.missingPoints || 0)} pts`;
  }

  return `${Number(reward?.pointsRequired || 0)} pts`;
}

function RewardPreviewCard({ reward, status }) {
  const statusLabel = getRewardPreviewStatusLabel(status, reward);
  const isAvailable = status.status === 'available';

  return (
    <div
      className={`sm-reward-preview-card${isAvailable ? ' sm-reward-preview-card--available' : ''}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: isAvailable ? '66px minmax(0, 1fr) auto' : '52px minmax(0, 1fr)',
        gap: isAvailable ? 14 : 12,
        alignItems: 'center',
        padding: isAvailable ? '13px 14px' : '10px 12px',
        borderRadius: isAvailable ? 22 : 18,
        border: isAvailable ? '2px solid rgba(209, 172, 63, 0.66)' : `1px solid ${CLUB_THEME.border}`,
        background:
          isAvailable
            ? 'linear-gradient(120deg, #fff9df 0%, #ffffff 44%, #eaf5ff 100%)'
            : CLUB_THEME.panelSoft,
        boxShadow: isAvailable ? '0 14px 28px rgba(167, 126, 22, 0.16)' : 'none',
      }}
    >
      <div
        className={isAvailable ? 'sm-reward-preview-image sm-reward-preview-image--available' : 'sm-reward-preview-image'}
        style={{
          width: isAvailable ? 66 : 52,
          height: isAvailable ? 66 : 52,
          borderRadius: isAvailable ? 20 : 16,
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(237,246,255,0.92) 100%)',
          border: `1px solid ${CLUB_THEME.border}`,
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
        }}
      >
        {reward.image ? (
          <img
            src={reward.image}
            alt={reward.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <ClubSanMartinIcon size={28} />
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        {isAvailable && (
          <div className="sm-reward-preview-winner-label">
            <ClubTrophyIcon size={14} />
            <span>¡Ganaste este premio!</span>
          </div>
        )}
        <strong
          style={{
            display: 'block',
            color: CLUB_THEME.text,
            fontSize: isAvailable ? 16 : 14,
            fontWeight: 900,
            lineHeight: 1.15,
            marginTop: isAvailable ? 5 : 0,
          }}
        >
          {reward.name}
        </strong>
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: CLUB_THEME.blueDeep, fontSize: 12, fontWeight: 900 }}>
            {Number(reward.pointsRequired || 0)} pts
          </span>
          {!isAvailable && (
            <span style={{ color: CLUB_THEME.textSoft, fontSize: 11.5, fontWeight: 800 }}>
              {statusLabel}
            </span>
          )}
        </div>
      </div>
      {isAvailable && (
        <div className="sm-reward-preview-action">
          <ClubSparkleIcon size={14} color="#ffffff" />
          <span>Canjear</span>
          <ClubChevronIcon size={13} color="#ffffff" />
        </div>
      )}
    </div>
  );
}

function TransactionPreviewItem({ transaction }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: 10,
        alignItems: 'center',
        padding: '10px 12px',
        borderRadius: 18,
        background: CLUB_THEME.panelSoft,
        border: `1px solid ${CLUB_THEME.border}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <strong
          style={{
            display: 'block',
            color: CLUB_THEME.text,
            fontSize: 14,
            fontWeight: 900,
            lineHeight: 1.15,
          }}
        >
          {transaction.rewardName || transaction.orderKey || formatTransactionType(transaction)}
        </strong>
        <div style={{ marginTop: 4, color: CLUB_THEME.textMuted, fontSize: 11.5, fontWeight: 700 }}>
          {formatTransactionDate(transaction.createdAt)}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <strong
          style={{
            display: 'block',
            color: Number(transaction.signedPoints || 0) >= 0 ? CLUB_THEME.blueDeep : '#d08b8b',
            fontSize: 16,
            fontWeight: 900,
          }}
        >
          {formatSignedPoints(transaction)}
        </strong>
        <span style={{ color: CLUB_THEME.textSoft, fontSize: 11.5, fontWeight: 800 }}>
          {formatTransactionType(transaction)}
        </span>
      </div>
    </div>
  );
}

function SheetSectionShortcut({
  title,
  icon,
  onClick,
  accent = CLUB_THEME.gold,
  subtitle = '',
  preview = null,
  badge = '',
}) {
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
        gap: 14,
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: '0 18px 34px rgba(24, 93, 160, 0.12)',
        transition: 'transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(29, 116, 199, 0.1)',
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
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
          {subtitle ? (
            <div style={{ marginTop: 4, color: CLUB_THEME.textSoft, fontSize: 13, fontWeight: 700 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {badge ? (
            <span
              style={{
                minHeight: 28,
                padding: '0 10px',
                borderRadius: 999,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(29, 116, 199, 0.08)',
                color: CLUB_THEME.blueDeep,
                fontSize: 12,
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              {badge}
            </span>
          ) : null}
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              display: 'grid',
              placeItems: 'center',
              background: CLUB_THEME.panelSoft,
              border: `1px solid ${CLUB_THEME.border}`,
              flexShrink: 0,
            }}
          >
            <ClubChevronIcon color={accent} />
          </div>
        </div>
      </div>
      {preview ? <div style={{ display: 'grid', gap: 10 }}>{preview}</div> : null}
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
  const homeScrollRef = useRef(null);
  const rewardsScrollRef = useRef(null);
  const transactionsScrollRef = useRef(null);
  const pointsBalance = Number(account?.pointsBalance || 0);
  const rewardSummary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const rewardList = Array.isArray(rewards) ? rewards : [];
  const transactionList = useMemo(
    () =>
      [...(Array.isArray(transactions) ? transactions : [])].sort(
        (left, right) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0)
      ),
    [transactions]
  );
  const rewardPreviewList = useMemo(() => {
    const previewItems = [...rewardSummary.availableRewards, ...rewardSummary.upcomingRewards];
    const uniqueItems = [];
    const seen = new Set();

    previewItems.forEach((reward) => {
      const rewardId = String(reward?.id || '').trim();
      if (!rewardId || seen.has(rewardId)) {
        return;
      }
      seen.add(rewardId);
      uniqueItems.push(reward);
    });

    return uniqueItems.slice(0, 3);
  }, [rewardSummary.availableRewards, rewardSummary.upcomingRewards]);
  const transactionPreviewList = transactionList.slice(0, 3);
  const viewOrder = ['home', 'rewards', 'transactions'];
  const activeViewIndex = Math.max(0, viewOrder.indexOf(activeView));

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveView('home');
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return undefined;
    }

    const scrollContainers = {
      home: homeScrollRef,
      rewards: rewardsScrollRef,
      transactions: transactionsScrollRef,
    };
    const frameId = window.requestAnimationFrame(() => {
      const scrollContainer = scrollContainers[activeView]?.current;
      if (scrollContainer) {
        scrollContainer.scrollTop = 0;
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeView, open]);

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
    boxShadow: '0 20px 38px rgba(24, 93, 160, 0.12)',
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
          background: 'linear-gradient(180deg, #f7fbff 0%, #edf6ff 100%)',
          padding: isCompactLayout ? '14px 14px 18px' : 'clamp(16px, 3vw, 28px)',
          boxShadow: '0 34px 80px rgba(24, 93, 160, 0.16)',
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
                boxShadow: '0 12px 28px rgba(24, 93, 160, 0.12)',
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(29, 116, 199, 0.1)',
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
              <div
                ref={homeScrollRef}
                style={{ height: '100%', overflowY: 'auto', display: 'grid', gap: 14, scrollBehavior: 'auto' }}
              >
                <RewardsProgressCard
                  settings={settings}
                  pointsBalance={pointsBalance}
                  closestReward={rewardSummary.closestReward}
                  availableReward={rewardSummary.bestReward}
                  onOpenRewards={() => openView('rewards')}
                />

                <SheetSectionShortcut
                  title="Premios"
                  icon={<ClubSanMartinIcon size={28} />}
                  subtitle={
                    rewardSummary.availableRewards.length > 0
                      ? '¡Tenés un premio esperando por vos!'
                      : 'Mira una vista previa y entra para verlos todos.'
                  }
                  badge={
                    rewardSummary.availableRewards.length > 0
                      ? `${rewardSummary.availableRewards.length} ${rewardSummary.availableRewards.length === 1 ? 'listo' : 'listos'}`
                      : `${rewardList.length} ${rewardList.length === 1 ? 'premio' : 'premios'}`
                  }
                  preview={
                    rewardPreviewList.length > 0 ? (
                      rewardPreviewList.map((reward) => (
                        <RewardPreviewCard
                          key={reward.id}
                          reward={reward}
                          status={getRewardDisplayStatus(reward, pointsBalance, cartAmount, settings)}
                        />
                      ))
                    ) : (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          background: CLUB_THEME.panelSoft,
                          color: CLUB_THEME.textSoft,
                          fontWeight: 700,
                        }}
                      >
                        Todavia no hay premios configurados.
                      </div>
                    )
                  }
                  onClick={() => openView('rewards')}
                />

                <SheetSectionShortcut
                  title="Movimientos recientes"
                  icon={<ClubTransactionsIcon />}
                  accent={CLUB_THEME.blueDeep}
                  subtitle="Tus ultimos movimientos antes de abrir el historial completo."
                  badge={transactionList.length > 0 ? `${transactionList.length} mov.` : ''}
                  preview={
                    transactionPreviewList.length > 0 ? (
                      transactionPreviewList.map((transaction) => (
                        <TransactionPreviewItem key={transaction.id} transaction={transaction} />
                      ))
                    ) : (
                      <div
                        style={{
                          padding: 14,
                          borderRadius: 18,
                          background: CLUB_THEME.panelSoft,
                          color: CLUB_THEME.textSoft,
                          fontWeight: 700,
                        }}
                      >
                        Todavia no tienes movimientos de puntos.
                      </div>
                    )
                  }
                  onClick={() => openView('transactions')}
                />
              </div>
            </div>

            <div style={getPaneStyle('rewards')}>
              <div ref={rewardsScrollRef} style={{ height: '100%', overflowY: 'auto', scrollBehavior: 'auto' }}>
                <section style={panelSurfaceStyle}>
                  <div style={{ marginBottom: 16 }}>
                    <RewardsProgressCard
                      settings={settings}
                      pointsBalance={pointsBalance}
                      closestReward={rewardSummary.closestReward}
                      availableReward={rewardSummary.bestReward}
                      onOpenRewards={() => openView('rewards')}
                    />
                  </div>

                  <strong style={{ display: 'block', fontSize: isCompactLayout ? 24 : 28, color: CLUB_THEME.blueDeep }}>
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
              <div ref={transactionsScrollRef} style={{ height: '100%', overflowY: 'auto', scrollBehavior: 'auto' }}>
                <section style={panelSurfaceStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ display: 'block', fontSize: isCompactLayout ? 24 : 28, color: CLUB_THEME.blueDeep }}>
                      Movimientos de puntos
                    </strong>
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 999,
                        background: CLUB_THEME.panelSoft,
                        color: CLUB_THEME.blueDeep,
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
                                color: Number(transaction.signedPoints || 0) >= 0 ? CLUB_THEME.blueDeep : '#d08b8b',
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

