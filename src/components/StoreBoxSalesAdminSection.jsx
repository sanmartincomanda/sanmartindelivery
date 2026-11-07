import React, { useRef, useState } from 'react';
import { buildBoxCatalogProduct, isBoxProduct } from '../services/storeBoxSales';
import { saveCatalogProduct } from '../services/storeCatalog';
import '../styles/storeBoxSales.css';

const freshForm = () => ({ sourceCode: '', name: '', image: '', description: '', poundsPerBox: 30, pricePerPound: '', active: false, branchIds: ['granada', 'nindiri'] });
const money = value => Number(value || 0).toLocaleString('es-NI', { style: 'currency', currency: 'NIO' });
const branches = [['granada', 'Granada'], ['nindiri', 'Nindirí'], ['masaya', 'Masaya']];

export default function StoreBoxSalesAdminSection({ products = [], loading = false, onSave = saveCatalogProduct }) {
  const [form, setForm] = useState(freshForm);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const formRef = useRef(null);
  const fileRef = useRef(null);
  const boxes = products.filter(isBoxProduct);
  const sources = products.filter(product => !isBoxProduct(product) && product.unit === 'lb');
  const filtered = sources.filter(product => product.code === form.sourceCode ||
    `${product.code} ${product.name}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const update = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const reset = () => { setForm(freshForm()); setEditing(null); setSearch(''); if (fileRef.current) fileRef.current.value = ''; };
  const edit = product => {
    setEditing(product); setError(''); setMessage('');
    setForm({ ...product, ...product.boxSale, branchIds: branches.filter(([id]) => product.branchSettings?.[id]?.active !== false).map(([id]) => id) });
    if (fileRef.current) fileRef.current.value = '';
    formRef.current?.scrollIntoView({ block: 'start' });
    formRef.current?.querySelector('input[name="boxName"]')?.focus({ preventScroll: true });
  };
  const upload = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      setError('Usá una imagen JPG, PNG o WebP de hasta 4 MB.'); return;
    }
    setError(''); setBusy(true);
    try {
      const image = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se pudo leer la imagen.')); reader.readAsDataURL(file); });
      update('image', image);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const product = buildBoxCatalogProduct(form, sources.find(p => p.code === form.sourceCode), editing, editing ? '' : crypto.randomUUID());
      setBusy(true);
      await onSave(product, editing);
      setMessage(product.active ? 'Presentación guardada y activa.' : 'Presentación guardada como inactiva.');
      reset();
    } catch (err) { setError(err.message || 'No se pudo guardar. Intentá nuevamente.'); }
    finally { setBusy(false); }
  };
  const total = Number(form.poundsPerBox) * Number(form.pricePerPound);
  return <section className="box-sales-admin">
    <header><div><span className="box-sales-kicker">CATÁLOGO MAESTRO</span><h2>Venta por cajas</h2>
      <p>Una ficha propia en la tienda. El mismo artículo y código de SICAR.</p></div>
      <strong>{boxes.length} presentaciones</strong></header>
    {message && <p role="status" className="box-sales-notice">{message}</p>}
    {error && <p role="alert" className="box-sales-error">{error}</p>}
    <div className="box-sales-layout">
      <form ref={formRef} onSubmit={save} className="cfg-section-card">
        <h3>{editing ? 'Editar presentación' : 'Nueva presentación'}</h3>
        <fieldset disabled={busy || loading}>
          <label>Buscar artículo original<input className="cfg-input" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nombre del corte o código SICAR" /></label>
          <label>Artículo de SICAR<select className="cfg-select" required value={form.sourceCode} disabled={Boolean(editing)} onChange={e => {
            const source = sources.find(p => p.code === e.target.value);
            setForm(current => ({ ...current, sourceCode: e.target.value, name: source ? `${source.name} por caja` : '' }));
          }}><option value="">Seleccioná un corte por libra</option>{filtered.map(p => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}</select></label>
          <label>Nombre en la tienda<input name="boxName" className="cfg-input" required maxLength={120} value={form.name} onChange={e => update('name', e.target.value)} /></label>
          <div className="box-sales-fields">
            <label>Libras por caja<input className="cfg-input" type="number" inputMode="decimal" required min="0.5" max="10000" step="0.5" value={form.poundsPerBox} onChange={e => update('poundsPerBox', e.target.value)} /></label>
            <label>Precio por libra (C$)<input className="cfg-input" type="number" inputMode="decimal" required min="0.01" max="100000" step="0.01" value={form.pricePerPound} onChange={e => update('pricePerPound', e.target.value)} /></label>
          </div>
          <div className="box-sales-total" aria-live="polite"><span>Precio de una caja</span><strong>{money(total)}</strong><small>2 cajas: {Number(form.poundsPerBox || 0) * 2} lb · {money(total * 2)}</small></div>
          <label>Foto de esta presentación<input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} /></label>
          <small>La foto se optimiza al guardar, sin recortes y conservando sus proporciones.</small>
          {form.image && <img className="box-sales-preview" src={form.image} alt="Vista previa de la caja" />}
          <label>Descripción opcional<textarea className="cfg-input" rows={2} maxLength={400} value={form.description} onChange={e => update('description', e.target.value)} /></label>
          <div className="box-sales-branches" role="group" aria-label="Sucursales">{branches.map(([id, name]) =>
            <label key={id}><input type="checkbox" checked={form.branchIds.includes(id)} onChange={e => update('branchIds', e.target.checked ? [...form.branchIds, id] : form.branchIds.filter(b => b !== id))} />{name}</label>)}</div>
          <label className="box-sales-active"><input type="checkbox" checked={form.active} onChange={e => update('active', e.target.checked)} />Activa en la tienda</label>
          <small>El inventario se toma del artículo original. El precio por caja no acumula otras promociones de artículo.</small>
          <footer><button className="cfg-button" type="submit">{busy ? 'Guardando…' : 'Guardar presentación'}</button>{editing && <button className="cfg-button secondary" type="button" onClick={reset}>Cancelar edición</button>}</footer>
        </fieldset>
      </form>
      <div className="box-sales-list">
        <h3>Presentaciones guardadas</h3>
        {loading ? <p role="status">Cargando catálogo…</p> : !boxes.length ? <p>Creá la primera caja seleccionando un corte, su peso y su precio especial.</p> : boxes.map(product =>
          <article key={product.code}>
            <img src={product.image} alt="" loading="lazy" width="72" height="72" />
            <div><strong>{product.name}</strong><span>{product.boxSale.poundsPerBox} lb · {money(product.boxSale.pricePerPound)} / lb</span><span>{money(product.price)} / caja</span>
              <small>SICAR {product.boxSale.sourceCode} · {product.active ? 'Activa' : 'Inactiva'}</small></div>
            <button className="cfg-button secondary" type="button" disabled={busy} onClick={() => edit(product)} aria-label={`Editar ${product.name}`}>Editar</button>
          </article>)}
      </div>
    </div>
  </section>;
}
