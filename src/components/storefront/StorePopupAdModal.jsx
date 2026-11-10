import React from 'react';
import { createPortal } from 'react-dom';
import '../../styles/storePopupAd.css';

export default function StorePopupAdModal({ popupAd, onClose, onAction }) {
  if (!popupAd || typeof document === 'undefined') return null;
  return createPortal(
    <div className="store-promo-backdrop" onClick={onClose}>
      <section className="store-promo-dialog" role="dialog" aria-modal="true"
        aria-label={popupAd.title || 'Anuncio especial'} onClick={event => event.stopPropagation()}>
        <button type="button" className="store-promo-close" aria-label="Cerrar anuncio" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
        <img className="store-promo-image" src={popupAd.image} alt={popupAd.title || 'Anuncio especial'} decoding="async" />
        {popupAd.ctaLabel && <footer className="store-promo-footer">
          <button type="button" className="store-promo-cta" onClick={onAction}>{popupAd.ctaLabel}</button>
        </footer>}
      </section>
    </div>, document.body,
  );
}
