import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/firstOrderRewards.css';

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

function GiftIcon({ size = 22 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M20 12v9H4v-9" />
      <path d="M2 7h20v5H2z" />
      <path d="M12 7v14" />
      <path d="M12 7H7.5a2.5 2.5 0 1 1 2.2-3.7L12 7Zm0 0h4.5a2.5 2.5 0 1 0-2.2-3.7L12 7Z" />
    </svg>
  );
}

export function FirstOrderRewardProgress({ progress, selectedItem, onOpen }) {
  if (!progress?.targetTier && !progress?.currentTier) {
    return null;
  }

  const hasUnlocked = Boolean(progress.currentTier);
  const isPremium = Boolean(progress.premium);
  const heading = selectedItem
    ? `Tu regalo: ${selectedItem.name}`
    : isPremium
      ? 'Desbloqueaste nuestra seleccion especial'
      : hasUnlocked
        ? 'Ya desbloqueaste tu regalo'
        : 'Tu primera compra tiene regalo';
  const detail = progress.nextTier
    ? `Agrega ${formatCurrency(progress.missingAmount)} y desbloquea nuevas opciones.`
    : hasUnlocked
      ? 'Elige tu favorito antes de finalizar el pedido.'
      : `Faltan ${formatCurrency(progress.missingAmount)} para elegir tu regalo.`;

  return (
    <section className={`first-reward-progress ${isPremium ? 'is-premium' : ''}`} aria-label="Regalo de primera compra">
      <div className="first-reward-progress__top">
        <span className="first-reward-progress__icon"><GiftIcon /></span>
        <div>
          <strong>{heading}</strong>
          <span>{detail}</span>
        </div>
        {hasUnlocked && (
          <button type="button" onClick={onOpen}>
            {selectedItem ? 'Cambiar' : 'Elegir'}
          </button>
        )}
      </div>
      <div className="first-reward-progress__track" aria-hidden="true">
        <span style={{ transform: `scaleX(${Math.max(0, Math.min(100, Number(progress.progress || 0))) / 100})` }} />
      </div>
      <div className="first-reward-progress__amounts">
        <span>{formatCurrency(progress.amount)}</span>
        <span>{progress.nextTier || !hasUnlocked ? `Meta ${formatCurrency(progress.targetAmount)}` : 'Seleccion especial'}</span>
      </div>
    </section>
  );
}

export function FirstOrderRewardCheckoutCard({ eligible, selectedItem, message, onOpen }) {
  if (!eligible) {
    return null;
  }

  return (
    <section className={`first-reward-checkout ${selectedItem ? 'has-selection' : ''}`}>
      <span className="first-reward-checkout__icon"><GiftIcon size={24} /></span>
      <div>
        <small>TU REGALO</small>
        <strong>{selectedItem?.name || 'Todavia no has elegido tu regalo'}</strong>
        <span>{message || (selectedItem ? 'Regalia de bienvenida · C$0.00' : 'Ya lo desbloqueaste. Elige uno antes de terminar.')}</span>
      </div>
      <button type="button" onClick={onOpen}>{selectedItem ? 'Cambiar' : 'Elegir'}</button>
    </section>
  );
}

export function FirstOrderRewardLine({ item }) {
  if (!item) {
    return null;
  }
  return (
    <div className="first-reward-order-line">
      <img src={item.image || '/tienda/branding/product-placeholder.svg'} alt={item.name} />
      <div>
        <small>REGALIA DE BIENVENIDA</small>
        <strong>{item.name}</strong>
      </div>
      <span>C$0.00</span>
    </div>
  );
}

export function FirstOrderRewardSelector({
  open,
  items = [],
  selectedItem,
  premium = false,
  notice = '',
  celebrate = false,
  onSelect,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const title = premium
    ? 'Desbloqueaste nuestra seleccion especial'
    : 'Tu primera compra tiene regalo';
  const content = (
    <div className="first-reward-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className={`first-reward-sheet ${premium ? 'is-premium' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-reward-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button type="button" className="first-reward-sheet__close" aria-label="Cerrar selector de regalos" onClick={onClose}>×</button>
        {celebrate && (
          <div className="first-reward-confetti" aria-hidden="true">
            {Array.from({ length: 8 }, (_, index) => <i key={index} />)}
          </div>
        )}
        <header className="first-reward-sheet__header">
          <span><GiftIcon size={28} /></span>
          <small>{premium ? 'SELECCION ESPECIAL' : 'GRACIAS POR ESTRENAR NUESTRA APP'}</small>
          <h2 id="first-reward-title">{title}</h2>
          <p>Elige el que mas te guste. Nosotros lo agregamos gratis a tu pedido.</p>
        </header>
        {notice && <div className="first-reward-sheet__notice" role="status">{notice}</div>}
        <div className="first-reward-options">
          {items.map((item) => {
            const selected = selectedItem?.id === item.id;
            return (
              <article key={item.id} className={`first-reward-option ${selected ? 'is-selected' : ''}`}>
                <div className="first-reward-option__media">
                  <img src={item.image || '/tienda/branding/product-placeholder.svg'} alt={item.name} loading="lazy" />
                  <span>GRATIS</span>
                </div>
                <div className="first-reward-option__copy">
                  <strong>{item.name}</strong>
                  {item.description && <p>{item.description}</p>}
                </div>
                <button type="button" aria-pressed={selected} onClick={() => onSelect?.(item)}>
                  {selected ? 'SELECCIONADO' : 'ELEGIR'}
                </button>
              </article>
            );
          })}
        </div>
        {items.length === 0 && (
          <div className="first-reward-empty">
            Las opciones de este regalo se agotaron por el momento.
          </div>
        )}
        <button type="button" className="first-reward-sheet__continue" onClick={onClose}>
          {selectedItem ? 'Continuar con mi pedido' : 'Seguir comprando'}
        </button>
      </section>
    </div>
  );

  return typeof document === 'undefined' ? content : createPortal(content, document.body);
}
