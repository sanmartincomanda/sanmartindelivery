import React, { useMemo, useState } from 'react';
import {
  buildCustomerRewardSummary,
  calculateStoreRewardRequiredSpend,
  getRewardDisplayStatus,
  getStoreRewardChoiceGroups,
  getStoreRewardFixedItems,
} from '../services/storeRewards';

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

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

function RewardsProgressCard({ settings, pointsBalance, closestReward }) {
  const targetPoints = Math.max(Number(closestReward?.pointsRequired || 0), 1);
  const progressPct = Math.max(0, Math.min(100, Math.round((Number(pointsBalance || 0) / targetPoints) * 100)));
  const remainingPoints = Math.max(0, targetPoints - Number(pointsBalance || 0));

  return (
    <section
      style={{
        borderRadius: 28,
        padding: 22,
        background: 'linear-gradient(160deg, #0f7a61 0%, #11a58a 58%, #1fd1a6 100%)',
        color: '#ffffff',
        boxShadow: '0 24px 50px rgba(7, 94, 74, 0.28)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.92, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {settings?.programName || 'Club San Martin'}
          </div>
          <h2 style={{ margin: '8px 0 0', fontSize: 30, lineHeight: 1.05 }}>Compra, acumula y reclama premios.</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, opacity: 0.82 }}>Puntos actuales</div>
          <div style={{ fontSize: 34, fontWeight: 900 }}>{Number(pointsBalance || 0)} pts</div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.22)',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <strong style={{ fontSize: 19 }}>{closestReward?.name || 'Sigue acumulando'}</strong>
            <div style={{ marginTop: 4, opacity: 0.92 }}>
              {closestReward
                ? remainingPoints > 0
                  ? `Te faltan ${remainingPoints} puntos para desbloquearlo.`
                  : 'Ya puedes reclamar este premio.'
                : 'Todavia no hay premios configurados.'}
            </div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 90 }}>
            <div style={{ fontSize: 13, opacity: 0.82 }}>Meta</div>
            <strong style={{ fontSize: 18 }}>{targetPoints} pts</strong>
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            height: 16,
            borderRadius: 999,
            background: 'rgba(3, 56, 46, 0.28)',
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: '100%',
              borderRadius: 999,
              background: 'linear-gradient(90deg, #d9ff4d 0%, #53ff7b 100%)',
              boxShadow: '0 10px 22px rgba(217, 255, 77, 0.35)',
              transition: 'width 240ms ease',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: 700, fontSize: 13 }}>
          <span>{Number(pointsBalance || 0)} pts</span>
          <span>{formatCurrency(calculateStoreRewardRequiredSpend(closestReward?.pointsRequired || 0, settings))} en compra acumulada</span>
        </div>
      </div>
    </section>
  );
}

function RewardCard({
  reward,
  settings,
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
      choiceGroups.map((group) => [
        group.choiceGroup,
        String(group.items?.[0]?.productCode || '').trim(),
      ])
    )
  );

  const missingPoints = Math.max(0, Number(reward.pointsRequired || 0) - Number(pointsBalance || 0));
  const minPurchaseGap = Math.max(0, Number(reward.minPurchaseAmount || 0) - Number(cartAmount || 0));
  const isSelected = selectedReward?.rewardId === reward.id;
  const canRedeem = status.status === 'available';
  const rewardSpend = calculateStoreRewardRequiredSpend(reward.pointsRequired, settings);

  const statusMeta = (() => {
    if (isSelected) {
      return { label: 'Seleccionado', tone: '#166534', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.22)' };
    }
    if (status.status === 'available') {
      return { label: 'Disponible', tone: '#166534', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.22)' };
    }
    if (status.status === 'unavailable') {
      return { label: 'Sin disponibilidad', tone: '#991b1b', bg: 'rgba(239, 68, 68, 0.12)', border: 'rgba(239, 68, 68, 0.22)' };
    }
    if (status.status === 'min_purchase') {
      return { label: `Compra minima ${formatCurrency(reward.minPurchaseAmount)}`, tone: '#9a3412', bg: 'rgba(249, 115, 22, 0.12)', border: 'rgba(249, 115, 22, 0.22)' };
    }
    return { label: `Te faltan ${missingPoints} puntos`, tone: '#92400e', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.22)' };
  })();

  const helperMessage =
    status.status === 'available'
      ? 'Puedes canjearlo ahora o seguir acumulando por uno mejor.'
      : status.status === 'min_purchase'
        ? `Agrega ${formatCurrency(minPurchaseGap)} mas para usar este premio.`
        : status.status === 'unavailable'
          ? 'Este premio esta sujeto a disponibilidad.'
          : `Te faltan ${missingPoints} puntos para reclamarlo.`;

  return (
    <article
      style={{
        display: 'grid',
        gridTemplateColumns: reward.image ? '112px minmax(0, 1fr)' : '1fr',
        gap: 16,
        padding: 18,
        borderRadius: 24,
        background: '#ffffff',
        border: isSelected ? '2px solid rgba(34, 197, 94, 0.28)' : '1px solid rgba(148, 163, 184, 0.24)',
        boxShadow: isSelected ? '0 22px 44px rgba(22, 163, 74, 0.12)' : '0 18px 36px rgba(15, 23, 42, 0.06)',
      }}
    >
      {reward.image && (
        <div
          style={{
            height: 112,
            width: 112,
            borderRadius: 24,
            overflow: 'hidden',
            background: '#f8fafc',
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
            <strong style={{ display: 'block', fontSize: 21, color: '#0f172a' }}>{reward.name}</strong>
            <span style={{ color: '#64748b', fontWeight: 700 }}>{Number(reward.pointsRequired || 0)} puntos</span>
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

        {reward.description && (
          <p style={{ margin: 0, color: '#475569', lineHeight: 1.55 }}>{reward.description}</p>
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', color: '#334155', fontWeight: 700, fontSize: 13 }}>
          <span>Compra acumulada: {formatCurrency(rewardSpend)}</span>
          <span>Peso: {Number(reward.rewardWeightPercent || 0).toFixed(2)}%</span>
        </div>

        {fixedItems.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Incluye
            </span>
            {fixedItems.map((item) => (
              <div key={item.id} style={{ color: '#0f172a', fontWeight: 700 }}>
                {Number(item.quantity || 1)} x {item.productName || item.productCode}
              </div>
            ))}
          </div>
        )}

        {choiceGroups.map((group) => (
          <div key={group.choiceGroup} style={{ display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
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
                      border: active ? '2px solid #0f766e' : '1px solid #cbd5e1',
                      background: active ? 'rgba(15, 118, 110, 0.12)' : '#ffffff',
                      color: active ? '#0f766e' : '#334155',
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

        <div
          style={{
            padding: '12px 14px',
            borderRadius: 16,
            background: '#f8fafc',
            color: '#475569',
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          {helperMessage}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {isSelected ? (
            <button
              type="button"
              onClick={onClearSelectedReward}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
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
                background: canRedeem ? 'linear-gradient(135deg, #9f1239 0%, #ef4444 100%)' : '#e2e8f0',
                color: canRedeem ? '#ffffff' : '#64748b',
                borderRadius: 999,
                padding: '12px 18px',
                fontWeight: 900,
                cursor: canRedeem && !busy ? 'pointer' : 'not-allowed',
                boxShadow: canRedeem ? '0 16px 30px rgba(239, 68, 68, 0.22)' : 'none',
              }}
            >
              {canRedeem ? 'Canjear premio' : status.status === 'min_purchase' ? 'Aun no aplica' : `Te faltan ${missingPoints} puntos`}
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
        background: '#ffffff',
        border: '1px solid rgba(148, 163, 184, 0.22)',
        boxShadow: '0 20px 38px rgba(15, 23, 42, 0.07)',
      }}
    >
      <h2 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>Club San Martin Granada</h2>
      <p style={{ margin: '10px 0 0', color: '#475569', lineHeight: 1.6 }}>
        Inicia sesion para acumular puntos, ver tus premios y canjear uno en tu proximo pedido.
      </p>
      <button
        type="button"
        onClick={onOpenAuth}
        style={{
          marginTop: 18,
          border: 0,
          borderRadius: 999,
          background: 'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)',
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
}) {
  const pointsBalance = Number(account?.pointsBalance || 0);
  const rewardSummary = buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings);

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
          borderRadius: 26,
          padding: 18,
          background: selectedReward
            ? 'linear-gradient(135deg, rgba(22, 163, 74, 0.12) 0%, rgba(15, 118, 110, 0.1) 100%)'
            : 'linear-gradient(135deg, rgba(159, 18, 57, 0.08) 0%, rgba(239, 68, 68, 0.08) 100%)',
          border: selectedReward ? '1px solid rgba(22, 163, 74, 0.18)' : '1px solid rgba(239, 68, 68, 0.14)',
          boxShadow: '0 16px 34px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#9f1239', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Club San Martin Granada
            </div>
            <strong style={{ display: 'block', marginTop: 6, fontSize: 22, color: '#0f172a' }}>
              {currentUser ? `Tienes ${pointsBalance} puntos disponibles.` : 'Mis puntos y recompensas'}
            </strong>
            <span style={{ marginTop: 6, display: 'block', color: '#475569', fontWeight: 700 }}>
              {selectedReward
                ? `Premio seleccionado: ${selectedReward.rewardName}`
                : rewardSummary.bestReward
                  ? `Ya puedes reclamar: ${rewardSummary.bestReward.name}`
                  : rewardSummary.closestReward
                    ? `Siguiente premio: ${rewardSummary.closestReward.name}`
                    : 'Abre el Club San Martin para ver tus recompensas.'}
            </span>
          </div>
          <span
            style={{
              padding: '10px 14px',
              borderRadius: 999,
              background: '#ffffff',
              color: '#0f172a',
              fontWeight: 900,
              boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
            }}
          >
            {currentUser ? 'Ver recompensas' : 'Mis puntos'}
          </span>
        </div>
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
  const pointsBalance = Number(account?.pointsBalance || 0);
  const rewardSummary = useMemo(
    () => buildCustomerRewardSummary(rewards, pointsBalance, cartAmount, settings),
    [rewards, pointsBalance, cartAmount, settings]
  );
  const renderRewardCards = (rewardList = []) =>
    rewardList.map((reward) => {
      const status = getRewardDisplayStatus(reward, pointsBalance, cartAmount, settings);
      return (
        <RewardCard
          key={reward.id}
          reward={reward}
          settings={settings}
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
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 130,
        background: 'rgba(7, 12, 20, 0.58)',
        backdropFilter: 'blur(18px)',
        padding: 'clamp(14px, 3vw, 28px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(1080px, 100%)',
          maxHeight: 'min(92vh, 920px)',
          overflowY: 'auto',
          borderRadius: 34,
          background: 'linear-gradient(180deg, #f8fffc 0%, #f8fafc 100%)',
          padding: 'clamp(16px, 3vw, 28px)',
          boxShadow: '0 34px 80px rgba(15, 23, 42, 0.3)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Club San Martin Granada
            </div>
            <h1 style={{ margin: '8px 0 0', fontSize: 34, color: '#0f172a', lineHeight: 1.05 }}>
              Compra, acumula puntos y reclama premios.
            </h1>
            <p style={{ margin: '10px 0 0', color: '#475569', lineHeight: 1.6 }}>
              Puedes canjear tu premio actual o seguir acumulando para reclamar uno mejor.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: 0,
              borderRadius: 999,
              background: '#ffffff',
              color: '#0f172a',
              width: 46,
              height: 46,
              fontSize: 24,
              cursor: 'pointer',
              boxShadow: '0 12px 26px rgba(15, 23, 42, 0.08)',
            }}
          >
            ×
          </button>
        </div>

        {!currentUser ? (
          <GuestRewardsPrompt onOpenAuth={onOpenAuth} />
        ) : (
          <div style={{ display: 'grid', gap: 18 }}>
            <RewardsProgressCard
              settings={settings}
              pointsBalance={pointsBalance}
              closestReward={rewardSummary.closestReward}
            />

            <section
              style={{
                borderRadius: 28,
                background: '#ffffff',
                padding: 22,
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 20px 38px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 26, color: '#0f172a' }}>Mis premios</strong>
                  <span style={{ color: '#475569', fontWeight: 700 }}>
                    {rewardSummary.availableRewards.length > 0
                      ? `Tienes ${rewardSummary.availableRewards.length} premio(s) disponibles.`
                      : 'Sigue acumulando para desbloquear tu siguiente premio.'}
                  </span>
                </div>
                {selectedReward && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: 18,
                      background: 'rgba(22, 163, 74, 0.1)',
                      color: '#166534',
                      fontWeight: 900,
                    }}
                  >
                    Premio listo para tu proximo pedido: {selectedReward.rewardName}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
                {rewardSummary.availableRewards.length > 0 && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: 18, color: '#0f172a' }}>Ya puedes reclamar</strong>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>
                        Elige el premio que quieres usar en tu siguiente pedido.
                      </span>
                    </div>
                    {renderRewardCards(rewardSummary.availableRewards)}
                  </div>
                )}

                {rewardSummary.upcomingRewards.length > 0 && (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                      <strong style={{ display: 'block', fontSize: 18, color: '#0f172a' }}>Sigue acumulando</strong>
                      <span style={{ color: '#64748b', fontWeight: 700 }}>
                        Estos son los premios que puedes desbloquear mas adelante.
                      </span>
                    </div>
                    {renderRewardCards(rewardSummary.upcomingRewards)}
                  </div>
                )}

                {rewardSummary.availableRewards.length === 0 && rewardSummary.upcomingRewards.length === 0 && (
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 18,
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 700,
                    }}
                  >
                    Todavia no hay premios configurados.
                  </div>
                )}
              </div>
            </section>

            <section
              style={{
                borderRadius: 28,
                background: '#ffffff',
                padding: 22,
                border: '1px solid rgba(148, 163, 184, 0.18)',
                boxShadow: '0 20px 38px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <strong style={{ display: 'block', fontSize: 24, color: '#0f172a' }}>Movimientos de puntos</strong>
                  <span style={{ color: '#475569', fontWeight: 700 }}>
                    Historial de puntos ganados, canjeados y reversados.
                  </span>
                </div>
                <div style={{ color: '#0f172a', fontWeight: 900 }}>
                  Saldo actual: {pointsBalance} pts
                </div>
              </div>

              <div style={{ display: 'grid', gap: 10, marginTop: 18 }}>
                {(Array.isArray(transactions) ? transactions : []).length === 0 ? (
                  <div
                    style={{
                      padding: 18,
                      borderRadius: 18,
                      background: '#f8fafc',
                      color: '#64748b',
                      fontWeight: 700,
                    }}
                  >
                    Todavia no tienes movimientos de puntos.
                  </div>
                ) : (
                  transactions.map((transaction) => (
                    <div
                      key={transaction.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                        padding: '14px 16px',
                        borderRadius: 18,
                        background: '#f8fafc',
                      }}
                    >
                      <div>
                        <strong style={{ color: '#0f172a' }}>
                          {transaction.rewardName || transaction.orderKey || formatTransactionType(transaction)}
                        </strong>
                        <div style={{ marginTop: 4, color: '#475569' }}>{formatTransactionDate(transaction.createdAt)}</div>
                        <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                          {transaction.note || formatTransactionType(transaction)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <strong
                          style={{
                            display: 'block',
                            fontSize: 22,
                            color: Number(transaction.signedPoints || 0) >= 0 ? '#16a34a' : '#dc2626',
                          }}
                        >
                          {formatSignedPoints(transaction)}
                        </strong>
                        <span style={{ color: '#475569', fontWeight: 700 }}>{formatTransactionType(transaction)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
