import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase';
import {
  applySicarBranchPriceUpdates,
  mergeCatalogProducts,
  resolveCatalogProductForBranch,
  saveCatalogProductBranchSettings,
  STORE_CATALOG_PATH,
} from '../services/storeCatalog';
import { fetchSicarPricesByCodes, getSicarBridgeHealth } from '../services/sicarCatalog';

const money = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

export default function BranchStoreAdminView({ branchId, branchName, username = '' }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form, setForm] = useState({ active: true, price: '', inventory: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    const unsubscribe = onValue(
      ref(database, STORE_CATALOG_PATH),
      (snapshot) => {
        setCatalog(mergeCatalogProducts(snapshot.val() || {}));
        setLoading(false);
      },
      (error) => {
        setMessage(error?.message || 'No se pudo cargar el catalogo.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const scopedProducts = useMemo(
    () => catalog.map((product) => resolveCatalogProductForBranch(product, branchId)),
    [branchId, catalog]
  );
  const filteredProducts = useMemo(() => {
    const token = String(deferredSearch || '').trim().toLowerCase();
    if (!token) return scopedProducts;
    return scopedProducts.filter((product) =>
      [product.code, product.name, product.category, product.subcategory]
        .join(' ')
        .toLowerCase()
        .includes(token)
    );
  }, [deferredSearch, scopedProducts]);
  const activeCount = scopedProducts.filter((product) => product.active !== false).length;
  const customPriceCount = scopedProducts.filter(
    (product) => Number(product?.branchSettings?.[branchId]?.price || 0) > 0
  ).length;

  const openProduct = (product) => {
    const branchSettings = product?.branchSettings?.[branchId] || {};
    setSelectedProduct(product);
    setForm({
      active: product.active !== false,
      price: Number(branchSettings.price || product.price || 0).toFixed(2),
      inventory:
        branchSettings.inventory === null || branchSettings.inventory === undefined
          ? ''
          : String(branchSettings.inventory),
    });
    setMessage('');
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    if (!selectedProduct) return;
    setSaving(true);
    try {
      await saveCatalogProductBranchSettings(selectedProduct.code, branchId, form, username);
      setMessage(`${selectedProduct.name} actualizado para ${branchName}.`);
      setSelectedProduct(null);
    } catch (error) {
      setMessage(error?.message || 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const updatePrices = async () => {
    setSyncing(true);
    setMessage('Conectando con SICAR de esta sucursal...');
    try {
      const health = await getSicarBridgeHealth();
      const apiBranchId = String(health?.branchId || 'granada').trim().toLowerCase();
      if (apiBranchId !== branchId) {
        throw new Error(`Este servidor esta configurado para ${apiBranchId}, no para ${branchId}.`);
      }
      const codes = scopedProducts.map((product) => product.code).filter(Boolean);
      const payload = await fetchSicarPricesByCodes(codes);
      const result = await applySicarBranchPriceUpdates(payload?.products || [], branchId, `sicar:${username}`);
      setMessage(
        `${result.appliedCount} precios actualizados para ${branchName}. ${result.missingCodes.length} codigos no encontrados.`
      );
    } catch (error) {
      setMessage(error?.message || 'No se pudo actualizar desde SICAR.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="branch-admin">
      <style>{`
        .branch-admin{padding:28px;display:grid;gap:20px;color:#102a4a;font-family:'Trebuchet MS','Segoe UI',sans-serif}
        .branch-admin__hero{border-radius:24px;padding:24px;color:white;background:linear-gradient(135deg,#071d38,#155ea8);box-shadow:0 18px 44px rgba(7,29,56,.2);display:flex;justify-content:space-between;gap:18px;align-items:center}
        .branch-admin__hero h1{margin:5px 0;font-size:28px}.branch-admin__hero p{margin:0;opacity:.8}.branch-admin__tag{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#9bc8ff}
        .branch-admin__sync{border:0;border-radius:999px;padding:13px 18px;background:#fff;color:#0d4f91;font-weight:900;cursor:pointer;white-space:nowrap}.branch-admin__sync:disabled{opacity:.6;cursor:wait}
        .branch-admin__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.branch-admin__stat{background:white;border:1px solid #dbe7f4;border-radius:18px;padding:16px}.branch-admin__stat small{color:#64809d;font-weight:800}.branch-admin__stat strong{display:block;font-size:25px;margin-top:5px}
        .branch-admin__toolbar{display:flex;gap:12px;align-items:center}.branch-admin__toolbar input{flex:1;min-height:48px;border:1px solid #cbdced;border-radius:15px;padding:0 16px;font:inherit}.branch-admin__message{border-radius:14px;padding:12px 15px;background:#eaf4ff;color:#124f87;font-weight:800}
        .branch-admin__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.branch-product{background:#fff;border:1px solid #dbe7f4;border-radius:20px;padding:12px;display:grid;grid-template-columns:72px 1fr;gap:12px;text-align:left;cursor:pointer;transition:.15s transform,.15s box-shadow}.branch-product:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(7,29,56,.1)}
        .branch-product img{width:72px;height:72px;object-fit:contain;border-radius:14px;background:#f6f9fc}.branch-product h3{margin:3px 0 6px;font-size:14px;line-height:1.2}.branch-product p{margin:0;font-weight:900;color:#0e5fae}.branch-product small{display:block;color:#6a7c91}.branch-product__off{opacity:.55}
        .branch-admin__modal{position:fixed;inset:0;z-index:5000;background:rgba(4,17,34,.68);display:grid;place-items:center;padding:18px}.branch-admin__form{width:min(480px,100%);background:white;border-radius:24px;padding:24px;display:grid;gap:14px}.branch-admin__form h2{margin:0}.branch-admin__form label{display:grid;gap:7px;font-weight:900}.branch-admin__form input{min-height:46px;border:1px solid #cbdced;border-radius:13px;padding:0 13px;font:inherit}.branch-admin__actions{display:flex;gap:10px}.branch-admin__actions button{flex:1;min-height:46px;border:0;border-radius:999px;font-weight:900;cursor:pointer}.branch-admin__cancel{background:#edf3f8;color:#17324f}.branch-admin__save{background:linear-gradient(90deg,#0e5fae,#43a5f5);color:white}
        @media(max-width:700px){.branch-admin{padding:16px}.branch-admin__hero{align-items:flex-start;flex-direction:column}.branch-admin__stats{grid-template-columns:1fr}.branch-admin__grid{grid-template-columns:1fr 1fr}.branch-product{grid-template-columns:1fr}.branch-product img{width:100%;height:110px}}
      `}</style>

      <section className="branch-admin__hero">
        <div>
          <div className="branch-admin__tag">Administrador de sucursal</div>
          <h1>{branchName}</h1>
          <p>Configura disponibilidad, inventario y precios propios sin alterar otras tiendas.</p>
        </div>
        <button className="branch-admin__sync" type="button" onClick={updatePrices} disabled={syncing}>
          {syncing ? 'Actualizando...' : 'Actualizar precios SICAR'}
        </button>
      </section>

      <section className="branch-admin__stats">
        <div className="branch-admin__stat"><small>Catalogo maestro</small><strong>{scopedProducts.length}</strong></div>
        <div className="branch-admin__stat"><small>Activos en sucursal</small><strong>{activeCount}</strong></div>
        <div className="branch-admin__stat"><small>Precios propios</small><strong>{customPriceCount}</strong></div>
      </section>

      {message && <div className="branch-admin__message">{message}</div>}
      <div className="branch-admin__toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar codigo, producto o categoria" />
        <strong>{loading ? 'Cargando...' : `${filteredProducts.length} productos`}</strong>
      </div>

      <section className="branch-admin__grid">
        {filteredProducts.map((product) => (
          <button
            key={product.code}
            type="button"
            className={`branch-product ${product.active === false ? 'branch-product__off' : ''}`}
            onClick={() => openProduct(product)}
          >
            <img src={product.image || '/tienda/branding/logo-mark.svg'} alt="" />
            <span>
              <small>{product.code} - {product.subcategory || product.category}</small>
              <h3>{product.name}</h3>
              <p>{money(product.price)}</p>
              <small>{product.active === false ? 'Pausado en esta sucursal' : 'Disponible'}</small>
            </span>
          </button>
        ))}
      </section>

      {selectedProduct && (
        <div className="branch-admin__modal" role="presentation" onMouseDown={() => setSelectedProduct(null)}>
          <form className="branch-admin__form" onSubmit={saveProduct} onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <small>{selectedProduct.code}</small>
              <h2>{selectedProduct.name}</h2>
            </div>
            <label>
              <span>Precio en {branchName}</span>
              <input type="number" min="0.01" step="0.01" value={form.price} onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))} required />
            </label>
            <label>
              <span>Inventario opcional</span>
              <input type="number" min="0" step="0.001" value={form.inventory} onChange={(event) => setForm((current) => ({ ...current, inventory: event.target.value }))} placeholder="Sin control de inventario" />
            </label>
            <label style={{ display: 'flex', gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
              <input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} style={{ minHeight: 20, width: 20 }} />
              <span>Disponible para pedidos en esta sucursal</span>
            </label>
            <div className="branch-admin__actions">
              <button type="button" className="branch-admin__cancel" onClick={() => setSelectedProduct(null)}>Cancelar</button>
              <button type="submit" className="branch-admin__save" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
