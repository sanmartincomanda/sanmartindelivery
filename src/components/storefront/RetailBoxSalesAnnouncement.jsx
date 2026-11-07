import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import '../../styles/storefrontBoxSales.css';

function CutPreview({ product }) {
  const [failed, setFailed] = useState(false);
  return <li>
    <div className="retail-box-preview-photo">
      <img src={failed ? '/tienda/categorias/icons/cajas.svg' : product.image} alt={product.name}
        width="240" height="200" decoding="async" onError={() => setFailed(true)} />
    </div>
    <strong>{product.name}</strong>
    <span>{product.boxSale.poundsPerBox} lb por caja</span>
  </li>;
}

export default function RetailBoxSalesAnnouncement({ products, onClose, onAction }) {
  if (!products.length) return null;
  return createPortal(
    <div className="retail-box-announcement-backdrop" onClick={onClose}>
      <section className="retail-box-announcement" role="dialog" aria-modal="true"
        aria-labelledby="box-announcement-title" onClick={event => event.stopPropagation()}>
        <header>
          <span className="retail-box-announcement-eyebrow">Disponible ahora:</span>
          <button type="button" className="retail-box-announcement-close" aria-label="Cerrar anuncio de cajas" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
          <h2 id="box-announcement-title">Ventas por caja</h2>
          <p>Tus cortes, ahora en cajas completas.</p>
        </header>
        <ul className="retail-box-previews" data-count={Math.min(3, products.length)}>
          {products.slice(0, 3).map(product => <CutPreview key={product.code} product={product} />)}
        </ul>
        <footer>
          <button type="button" className="retail-box-announcement-cta" onClick={onAction}>
            Ir a comprar <span aria-hidden="true">→</span>
          </button>
        </footer>
      </section>
    </div>, document.body,
  );
}
