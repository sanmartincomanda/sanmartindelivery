import React, { useRef, useState } from 'react';
import { getBrowserStorage, normalizeRecentSearches, readRecentSearches, saveRecentSearches } from './retailInteractionState';

export default function RetailSearchBox({ value, onChange, onFocusChange, enhanced = true }) {
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const [recent, setRecent] = useState(() => enhanced ? readRecentSearches(getBrowserStorage('localStorage')) : []);
  const focusChanged = (next) => { setFocused(next); onFocusChange(next); };
  const search = (text) => {
    const clean = String(text || '').trim();
    onChange(clean);
    if (enhanced && clean.length > 1) {
      setRecent(saveRecentSearches(getBrowserStorage('localStorage'), normalizeRecentSearches([clean, ...recent])));
    }
    focusChanged(false);
    input.current?.blur();
  };
  return <div className="store-search-wrap retail-search-box" onBlurCapture={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) focusChanged(false);
  }}>
    <form role="search" onSubmit={(event) => { event.preventDefault(); search(value); }}>
      <span className="store-search-tag" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" /><path d="m16 16 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
      <input ref={input} className="store-search" value={value}
        onChange={(event) => onChange(event.target.value)} onFocus={() => focusChanged(true)}
        onKeyDown={(event) => { if (event.key === 'Escape') { focusChanged(false); input.current?.blur(); } }}
        placeholder="Buscar carnes, cortes y productos" aria-label="Buscar carnes, cortes y productos"
        type="search" enterKeyHint="search" autoComplete="off" />
      {value && enhanced && <button type="button" className="retail-search-clear" aria-label="Limpiar búsqueda" onClick={() => { onChange(''); input.current?.focus(); }}>×</button>}
    </form>
    {enhanced && focused && !value && recent.length > 0 && <section className="retail-recent-searches" aria-label="Búsquedas recientes">
      <div><strong>Buscaste recientemente</strong><button type="button" onClick={() => setRecent(saveRecentSearches(getBrowserStorage('localStorage'), []))}>Borrar</button></div>
      {recent.map(text => <button key={text} type="button" onClick={() => search(text)}><span aria-hidden="true">↗</span>{text}</button>)}
    </section>}
  </div>;
}
