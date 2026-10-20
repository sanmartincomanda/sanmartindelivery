import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { promotionSharePages, promotionShareExpired, promotionShareFilename, renderPromotionShare } from './promotionShare';
import './promotionShare.css';

export default function PromotionShareButton({ title, products, branchName, endsAt, compact = false }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const close = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
  };
  return <>
    <button type="button" className={`promotion-share-trigger${compact ? ' is-compact' : ''}`}
      ref={trigger} aria-label={`Compartir ${title}`} onClick={() => setOpen(true)}>
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
        <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
      </svg>
      {compact ? 'Compartir' : 'Compartir promoción'}
    </button>
    {open && createPortal(<PromotionShareSheet title={title} products={products} branchName={branchName}
      endsAt={endsAt} onClose={close} />, document.body)}
  </>;
}

function PromotionShareSheet({ title, products, branchName, endsAt, onClose }) {
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const [sharing, setSharing] = useState(false);
  const pages = promotionSharePages(products);
  const selectedPage = Math.min(page, Math.max(0, pages.length - 1));
  const spec = JSON.stringify({ title, products: pages[selectedPage] || [], branchName, endsAt, page: selectedPage, pageCount: pages.length });
  const ready = result?.spec === spec ? result : null;
  const expired = promotionShareExpired(endsAt);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // The storefront's useRetailFocusLayers owns focus, Escape and inert siblings.
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let url;
    setError(''); setStatus('');
    renderPromotionShare(JSON.parse(spec)).then(blob => {
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setResult({ spec, blob, url });
    }).catch(cause => { if (!cancelled) setError(cause.message || 'No pudimos preparar la imagen. Intentá nuevamente.'); });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [spec, retry]);

  const canShare = ready && typeof File !== 'undefined' && typeof navigator.share === 'function'
    && navigator.canShare?.({ files: [new File([ready.blob], promotionShareFilename(title, selectedPage), { type: 'image/png' })] });
  const checkCurrent = () => {
    if (promotionShareExpired(endsAt)) { setError('Esta promoción ya finalizó. Cerrá esta vista para consultar las ofertas vigentes.'); return false; }
    return Boolean(ready);
  };
  const share = async () => {
    if (!checkCurrent()) return;
    setSharing(true); setError(''); setStatus('');
    try {
      // The PNG is prepared before this click, preserving the browser user gesture.
      await navigator.share({ files: [new File([ready.blob], promotionShareFilename(title, selectedPage), { type: 'image/png' })],
        title: `${title} | Carnes San Martín`, text: `${title} · ${branchName || 'Carnes San Martín'}\nhttps://tienda.sanmartinsr.com` });
    } catch (cause) {
      if (cause.name !== 'AbortError') setError('No se pudo compartir directamente. Podés descargar la imagen y adjuntarla.');
    } finally { setSharing(false); }
  };
  const download = () => {
    if (!checkCurrent()) return;
    const link = document.createElement('a');
    link.href = ready.url;
    link.download = promotionShareFilename(title, selectedPage);
    document.body.appendChild(link); link.click(); link.remove();
    setStatus('Descarga solicitada. Si tu app no permite guardarla, abrí la tienda en tu navegador.');
  };
  return <div className="promotion-share-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="promotion-share-sheet" role="dialog" aria-modal="true" aria-labelledby="promotion-share-title">
      <div className="promotion-share-handle" aria-hidden="true" />
      <header><div><span>CARNES SAN MARTÍN</span><h2 id="promotion-share-title">Compartí un preciazo</h2></div>
        <button type="button" onClick={onClose} aria-label="Cerrar vista previa">×</button></header>
      <div className="promotion-share-body">
        {ready ? <img className="promotion-share-preview" src={ready.url} alt={`${title}. Imagen promocional con ${pages[selectedPage].map(p => p.name).join(', ')}. Precios y sucursal incluidos.`} width="1080" height="1350" />
          : !error && <div className="promotion-share-loading" role="status">Preparando fotos y precios…</div>}
        {error && <div className="promotion-share-error" role="alert">{error}{!ready && !expired && <button type="button" onClick={() => setRetry(value => value + 1)}>Reintentar</button>}</div>}
        {pages.length > 1 && <nav aria-label="Imágenes de la promoción" className="promotion-share-pages">
          <button type="button" disabled={selectedPage === 0 || sharing} onClick={() => setPage(selectedPage - 1)} aria-label="Imagen anterior">←</button>
          <span aria-live="polite">Imagen {selectedPage + 1} de {pages.length}</span>
          <button type="button" disabled={selectedPage === pages.length - 1 || sharing} onClick={() => setPage(selectedPage + 1)} aria-label="Imagen siguiente">→</button>
        </nav>}
        <p className="promotion-share-note">Lista para enviar por WhatsApp o publicar en tus redes. {pages.length > 1 ? 'Compartí o descargá cada imagen.' : 'Sin iniciar sesión.'}</p>
      </div>
      <footer>
        {canShare && <button type="button" className="promotion-share-primary" disabled={sharing || expired} onClick={share}>{sharing ? 'Compartiendo…' : 'Compartir imagen'}</button>}
        <button type="button" className={canShare ? 'promotion-share-secondary' : 'promotion-share-primary'} disabled={!ready || sharing || expired} onClick={download}>Descargar imagen</button>
        <span role="status">{status}</span>
      </footer>
    </section>
  </div>;
}
