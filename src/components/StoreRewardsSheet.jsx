import React, { useEffect, useMemo, useState } from 'react';
import {
  buildCustomerRewardSummary,
  getRewardDisplayStatus,
  getStoreRewardChoiceGroups,
} from '../services/storeRewards';
import { useRef } from 'react';
import SanMartinCrownIcon from './SanMartinCrownIcon';
import { SAN_MARTIN_THEME } from '../styles/sanMartinTheme';

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

function RewardsProgressCard({
  settings,
  pointsBalance,
  closestReward,
  availableReward,
  displayName = CLUB_DISPLAY_NAME,
  onOpenRewards,
}) {
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
              {displayName}
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
                alt={featuredReward.name || displayName}
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
  const [choices, setChoices] = useState(() =>
    Object.fromEntries(
      choiceGroups.map((group) => [group.choiceGroup, String(group.items?.[0]?.productCode || '').trim()])
    )
  );

  const missingPoints = Math.max(0, Number(reward.pointsRequired || 0) - Number(pointsBalance || 0));
  const isSelected = selectedReward?.rewardId === reward.id;
  const canRedeem = status.status === 'available';

  const statusLabel = isSelected
    ? 'Elegido'
    : canRedeem
      ? 'Disponible'
      : status.status === 'unavailable'
        ? 'Agotado'
        : status.status === 'min_purchase'
          ? 'En tu pedido'
          : `${missingPoints} pts`;

  return (
    <article
      className={`sm-gold-reward-card${canRedeem ? ' is-unlocked' : ' is-locked'}${isSelected ? ' is-selected' : ''}`}
    >
      <div className="sm-gold-reward-image">
        {reward.image ? (
          <img
            src={reward.image}
            alt={reward.name}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ClubSanMartinIcon size={58} />
        )}
        <span className="sm-gold-reward-state">
          {canRedeem ? <ClubTrophyIcon size={15} /> : null}
          {statusLabel}
        </span>
      </div>

      <div className="sm-gold-reward-copy">
        <strong>{reward.name}</strong>
        <span>{Number(reward.pointsRequired || 0)} pts</span>

        {canRedeem && choiceGroups.map((group) => (
          <div key={group.choiceGroup} className="sm-gold-reward-choices">
            <small>Elige uno</small>
            <div>
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
                    className={active ? 'is-active' : ''}
                  >
                    {item.choiceLabel || item.productName || item.productCode}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {(canRedeem || isSelected) && (
          <div className="sm-gold-reward-actions">
          {isSelected ? (
            <button
              type="button"
              onClick={onClearSelectedReward}
              className="sm-gold-reward-button is-secondary"
            >
              Quitar premio
            </button>
          ) : (
            <button
              type="button"
              className="sm-gold-reward-button"
              disabled={busy}
              onClick={() => onSelectReward(reward, { choices })}
            >
              <span>Canjear</span>
            </button>
          )}
          </div>
        )}
      </div>
    </article>
  );
}

function GuestRewardsPrompt({ displayName = CLUB_DISPLAY_NAME, onOpenAuth }) {
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
      <h2 style={{ margin: 0, fontSize: 28, color: CLUB_THEME.blueDeep }}>{displayName}</h2>
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
  displayName = CLUB_DISPLAY_NAME,
  onOpen,
  compact = false,
}) {
  const pointsBalance = Number(account?.pointsBalance || 0);
  const summary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const hasAvailableReward = Boolean(currentUser && summary.availableRewards.length > 0);
  const compactTitle = compact ? 'Miembro Gold' : displayName;
  const compactSubtitle = displayName.replace(/^Miembro Gold\s+/i, '') || 'San Martin';

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
  displayName = CLUB_DISPLAY_NAME,
  rewardActionBusy = false,
  onSelectReward,
  onClearSelectedReward,
  onClose,
  onOpenAuth,
}) {
  const [activeView, setActiveView] = useState('rewards');
  const screenScrollRef = useRef(null);
  const pointsBalance = Number(account?.pointsBalance || 0);
  const rewardSummary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const rewardList = useMemo(
    () =>
      [...(Array.isArray(rewards) ? rewards : [])].sort(
        (left, right) => Number(left?.pointsRequired || 0) - Number(right?.pointsRequired || 0)
      ),
    [rewards]
  );
  const transactionList = useMemo(
    () =>
      [...(Array.isArray(transactions) ? transactions : [])].sort(
        (left, right) => Number(right?.createdAt || 0) - Number(left?.createdAt || 0)
      ),
    [transactions]
  );
  const nextReward = rewardSummary.closestReward;
  const nextRewardPoints = Math.max(1, Number(nextReward?.pointsRequired || 1));
  const progressPct = Math.max(0, Math.min(100, (pointsBalance / nextRewardPoints) * 100));

  useEffect(() => {
    if (!open) {
      return;
    }

    setActiveView('rewards');
  }, [open]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    screenScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeView]);

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

  if (!open) {
    return null;
  }

  return (
    <div className="sm-gold-screen">
      <header className="sm-gold-screen-nav">
        <button
          type="button"
          className="sm-gold-back-button"
          onClick={activeView === 'transactions' ? () => setActiveView('rewards') : onClose}
        >
          <ClubBackIcon size={20} />
          <span>{activeView === 'transactions' ? 'Premios' : 'Tienda'}</span>
        </button>
        <strong>{activeView === 'transactions' ? 'Movimientos' : 'Miembro Gold'}</strong>
        <button type="button" className="sm-gold-close-button" onClick={onClose} aria-label="Cerrar Miembro Gold">
          <ClubCloseIcon />
        </button>
      </header>

      <div ref={screenScrollRef} className="sm-gold-screen-scroll">
        <main className={`sm-gold-screen-content view-${activeView}`}>
          {!currentUser ? (
            <GuestRewardsPrompt displayName={displayName} onOpenAuth={onOpenAuth} />
          ) : (
            <>
              <section className="sm-gold-hero">
                <div className="sm-gold-hero-topline">
                  <div className="sm-gold-identity">
                    <ClubSanMartinIcon size={44} />
                    <div>
                      <span>Miembro Gold</span>
                      <strong>{pointsBalance} pts</strong>
                    </div>
                  </div>
                  <button type="button" className="sm-gold-history-button" onClick={() => setActiveView('transactions')}>
                    <ClubTransactionsIcon size={18} color="#ffffff" />
                    <span>Movimientos</span>
                  </button>
                </div>

                <div className="sm-gold-progress-track" aria-label={`Progreso ${Math.round(progressPct)}%`}>
                  <span style={{ width: `${progressPct}%` }} />
                </div>
                <div className="sm-gold-progress-labels">
                  <span>{nextReward?.name || 'Todos los premios desbloqueados'}</span>
                  <strong>{nextReward ? `${nextRewardPoints} pts` : `${pointsBalance} pts`}</strong>
                </div>
              </section>

              {activeView === 'rewards' ? (
                <section className="sm-gold-rewards-section">
                  <div className="sm-gold-section-heading">
                    <h1>Premios</h1>
                    {rewardSummary.availableRewards.length > 0 ? (
                      <span>{rewardSummary.availableRewards.length} disponible{rewardSummary.availableRewards.length === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                  {rewardList.length > 0 ? (
                    <div className="sm-gold-rewards-grid">{renderRewardCards(rewardList)}</div>
                  ) : (
                    <div className="sm-gold-empty-state">Todavia no hay premios.</div>
                  )}
                </section>
              ) : (
                <section className="sm-gold-transactions-section">
                  <div className="sm-gold-section-heading">
                    <h1>Movimientos</h1>
                    <span>{pointsBalance} pts</span>
                  </div>
                  {transactionList.length > 0 ? (
                    <div className="sm-gold-transactions-list">
                      {transactionList.map((transaction) => (
                        <TransactionPreviewItem key={transaction.id} transaction={transaction} />
                      ))}
                    </div>
                  ) : (
                    <div className="sm-gold-empty-state">Todavia no tienes movimientos.</div>
                  )}
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

