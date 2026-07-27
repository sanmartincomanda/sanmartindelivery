import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase';
import {
  applySicarBranchPriceUpdates,
  inactivateBranchProductsWithoutRecentSales,
  mergeCatalogProducts,
  resolveCatalogProductForBranch,
  saveCatalogProductBranchSettings,
  STORE_CATALOG_PATH,
} from '../services/storeCatalog';
import {
  fetchSicarPricesByCodes,
  fetchSicarRecentSoldProducts,
  getSicarBridgeHealth,
} from '../services/sicarCatalog';

const money = (value) => `C$ ${Number(value || 0).toFixed(2)}`;
const CATALOG_PAGE_SIZE = 24;
const CATEGORY_PRIORITY = ['res', 'pollo', 'cerdo', 'abarroteria', 'congelados', 'refrigerados', 'combos', 'promociones', 'otros'];
const CATEGORY_LABELS = {
  res: 'Res',
  pollo: 'Pollo',
  cerdo: 'Cerdo',
  abarroteria: 'Abarroteria',
  congelados: 'Congelados',
  refrigerados: 'Refrigerados',
  combos: 'Combos',
  promociones: 'Promociones',
  otros: 'Otros',
};
const normalizeSearchText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
const getCategoryId = (product = {}) => normalizeSearchText(product.category || 'otros') || 'otros';
const getCategoryLabel = (categoryId = '', products = []) => {
  const categoryProduct = products.find((product) => getCategoryId(product) === categoryId);
  return String(categoryProduct?.categoryLabel || CATEGORY_LABELS[categoryId] || categoryId).trim();
};
const getCategoryPriority = (categoryId = '') => {
  const index = CATEGORY_PRIORITY.indexOf(categoryId);
  return index >= 0 ? index : CATEGORY_PRIORITY.length;
};

export default function BranchStoreAdminView({ branchId, branchName, username = '' }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('todos');
  const [visibleCount, setVisibleCount] = useState(CATALOG_PAGE_SIZE);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [form, setForm] = useState({ active: true, price: '', inventory: '' });
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [checkingActivity, setCheckingActivity] = useState(false);
  const [applyingActivity, setApplyingActivity] = useState(false);
  const [inactivityPreview, setInactivityPreview] = useState(null);
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
  const categories = useMemo(() => {
    const counts = scopedProducts.reduce((result, product) => {
      const categoryId = getCategoryId(product);
      result[categoryId] = (result[categoryId] || 0) + 1;
      return result;
    }, {});

    return Object.entries(counts)
      .map(([id, count]) => ({ id, count, label: getCategoryLabel(id, scopedProducts) }))
      .sort((left, right) => {
        const priorityDifference = getCategoryPriority(left.id) - getCategoryPriority(right.id);
        return priorityDifference || left.label.localeCompare(right.label, 'es', { sensitivity: 'base' });
      });
  }, [scopedProducts]);
  const filteredProducts = useMemo(() => {
    const token = normalizeSearchText(deferredSearch);
    return scopedProducts
      .filter((product) => {
        if (token) {
          return normalizeSearchText(
            [product.code, product.name, product.categoryLabel, product.category, product.subcategory].join(' ')
          ).includes(token);
        }
        return selectedCategory === 'todos' || getCategoryId(product) === selectedCategory;
      })
      .sort((left, right) => {
        const categoryDifference = getCategoryPriority(getCategoryId(left)) - getCategoryPriority(getCategoryId(right));
        if (categoryDifference !== 0) return categoryDifference;
        const subcategoryDifference = String(left.subcategory || '').localeCompare(String(right.subcategory || ''), 'es', { sensitivity: 'base' });
        if (subcategoryDifference !== 0) return subcategoryDifference;
        return String(left.name || '').localeCompare(String(right.name || ''), 'es', { sensitivity: 'base' });
      });
  }, [deferredSearch, scopedProducts, selectedCategory]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount]
  );
  const hasMoreProducts = visibleProducts.length < filteredProducts.length;

  useEffect(() => {
    setVisibleCount(CATALOG_PAGE_SIZE);
  }, [deferredSearch, selectedCategory]);
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

  const verifyLocalBranch = async () => {
    const health = await getSicarBridgeHealth();
    const apiBranchId = String(health?.branchId || 'granada').trim().toLowerCase();
    if (apiBranchId !== branchId) {
      throw new Error(`Este servidor esta configurado para ${apiBranchId}, no para ${branchId}.`);
    }
    return health;
  };

  const previewInactiveProducts = async () => {
    setCheckingActivity(true);
    setMessage('Revisando las ventas de los ultimos 60 dias...');
    try {
      await verifyLocalBranch();
      const payload = await fetchSicarRecentSoldProducts(60);
      const soldProducts = Array.isArray(payload?.products) ? payload.products : [];
      const soldCodes = new Set(soldProducts.map((product) => String(product?.code || '').trim()).filter(Boolean));
      const candidates = scopedProducts.filter(
        (product) => product.active !== false && product.code && !soldCodes.has(String(product.code).trim())
      );
      const soldCatalogCount = scopedProducts.filter((product) => soldCodes.has(String(product.code || '').trim())).length;

      setInactivityPreview({
        soldProducts,
        candidates,
        soldCatalogCount,
        dateWindow: payload?.dateWindow || {},
      });
      setMessage('Revision de ventas completada. Confirma la vista previa antes de aplicar.');
    } catch (error) {
      setMessage(error?.message || 'No se pudieron revisar las ventas de SICAR.');
    } finally {
      setCheckingActivity(false);
    }
  };

  const applyInactiveProducts = async () => {
    if (!inactivityPreview) return;
    setApplyingActivity(true);
    try {
      await verifyLocalBranch();
      const result = await inactivateBranchProductsWithoutRecentSales(
        inactivityPreview.soldProducts,
        branchId,
        60,
        `sicar:${username}`
      );
      setMessage(
        `${result.inactivatedCount} productos sin ventas en 60 dias fueron pausados solamente en ${branchName}.`
      );
      setInactivityPreview(null);
    } catch (error) {
      setMessage(error?.message || 'No se pudieron pausar los productos sin ventas.');
    } finally {
      setApplyingActivity(false);
    }
  };

  return (
    <div className="branch-admin">
      <style>{`
        .branch-admin{padding:28px;display:grid;gap:20px;color:#102a4a;font-family:'Trebuchet MS','Segoe UI',sans-serif}
        .branch-admin__hero{border-radius:24px;padding:24px;color:white;background:linear-gradient(135deg,#071d38,#155ea8);box-shadow:0 18px 44px rgba(7,29,56,.2);display:flex;justify-content:space-between;gap:18px;align-items:center}
        .branch-admin__hero h1{margin:5px 0;font-size:28px}.branch-admin__hero p{margin:0;opacity:.8}.branch-admin__tag{font-size:12px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#9bc8ff}
        .branch-admin__hero-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.branch-admin__sync{border:0;border-radius:999px;padding:13px 18px;background:#fff;color:#0d4f91;font-weight:900;cursor:pointer;white-space:nowrap}.branch-admin__sync--warning{background:#fff3d8;color:#8a5200}.branch-admin__sync:disabled{opacity:.6;cursor:wait}
        .branch-admin__stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.branch-admin__stat{background:white;border:1px solid #dbe7f4;border-radius:18px;padding:16px}.branch-admin__stat small{color:#64809d;font-weight:800}.branch-admin__stat strong{display:block;font-size:25px;margin-top:5px}
        .branch-admin__catalog-tools{display:grid;gap:12px}.branch-admin__toolbar{display:flex;gap:12px;align-items:center}.branch-admin__toolbar input{flex:1;min-height:48px;border:1px solid #cbdced;border-radius:15px;padding:0 16px;font:inherit}.branch-admin__message{border-radius:14px;padding:12px 15px;background:#eaf4ff;color:#124f87;font-weight:800}
        .branch-admin__categories{display:flex;gap:9px;overflow-x:auto;padding:2px 2px 7px;scrollbar-width:thin}.branch-category{border:1px solid #cbdced;border-radius:999px;background:white;color:#254766;padding:10px 14px;display:flex;align-items:center;gap:8px;white-space:nowrap;font:inherit;font-size:13px;font-weight:900;cursor:pointer}.branch-category span{display:grid;place-items:center;min-width:24px;height:24px;border-radius:999px;background:#edf4fb;color:#54718d;font-size:11px}.branch-category--active{border-color:#1266b1;background:#0d4f91;color:white;box-shadow:0 8px 18px rgba(13,79,145,.18)}.branch-category--active span{background:rgba(255,255,255,.18);color:white}
        .branch-admin__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.branch-product{background:#fff;border:1px solid #dbe7f4;border-radius:20px;padding:12px;display:grid;grid-template-columns:72px 1fr;gap:12px;text-align:left;cursor:pointer;transition:.15s transform,.15s box-shadow}.branch-product:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(7,29,56,.1)}
        .branch-product img{width:72px;height:72px;object-fit:contain;border-radius:14px;background:#f6f9fc}.branch-product h3{margin:3px 0 6px;font-size:14px;line-height:1.2}.branch-product p{margin:0;font-weight:900;color:#0e5fae}.branch-product small{display:block;color:#6a7c91}.branch-product__off{opacity:.55}
        .branch-admin__load-more{justify-self:center;min-width:220px;border:1px solid #c5d9ec;border-radius:999px;background:white;color:#0d4f91;padding:13px 20px;font:inherit;font-weight:900;cursor:pointer}.branch-admin__empty{padding:34px;text-align:center;border:1px dashed #bfd2e5;border-radius:20px;background:#f8fbfe;color:#60788f}
        .branch-admin__modal{position:fixed;inset:0;z-index:5000;background:rgba(4,17,34,.68);display:grid;place-items:center;padding:18px}.branch-admin__form{width:min(480px,100%);background:white;border-radius:24px;padding:24px;display:grid;gap:14px}.branch-admin__form h2{margin:0}.branch-admin__form label{display:grid;gap:7px;font-weight:900}.branch-admin__form input{min-height:46px;border:1px solid #cbdced;border-radius:13px;padding:0 13px;font:inherit}.branch-admin__actions{display:flex;gap:10px}.branch-admin__actions button{flex:1;min-height:46px;border:0;border-radius:999px;font-weight:900;cursor:pointer}.branch-admin__cancel{background:#edf3f8;color:#17324f}.branch-admin__save{background:linear-gradient(90deg,#0e5fae,#43a5f5);color:white}
        .branch-sales-review{width:min(620px,100%);max-height:min(82vh,720px);overflow:auto;background:white;border-radius:24px;padding:24px;display:grid;gap:16px}.branch-sales-review h2,.branch-sales-review p{margin:0}.branch-sales-review__stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.branch-sales-review__stat{border-radius:16px;padding:14px;background:#edf6ff}.branch-sales-review__stat--warning{background:#fff3d8;color:#7a4900}.branch-sales-review__stat strong{display:block;font-size:25px}.branch-sales-review__list{display:grid;gap:7px;max-height:220px;overflow:auto}.branch-sales-review__item{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border:1px solid #dbe7f4;border-radius:12px;font-size:13px}.branch-sales-review__alert{padding:12px;border-radius:14px;background:#fff1f1;color:#982424;font-weight:800}
        @media(max-width:700px){.branch-admin{padding:16px}.branch-admin__hero{align-items:flex-start;flex-direction:column}.branch-admin__hero-actions{width:100%;justify-content:stretch}.branch-admin__sync{flex:1}.branch-admin__stats{grid-template-columns:1fr}.branch-admin__grid{grid-template-columns:1fr 1fr}.branch-product{grid-template-columns:1fr}.branch-product img{width:100%;height:110px}}
      `}</style>

      <section className="branch-admin__hero">
        <div>
          <div className="branch-admin__tag">Administrador de sucursal</div>
          <h1>{branchName}</h1>
          <p>Configura disponibilidad, inventario y precios propios sin alterar otras tiendas.</p>
        </div>
        <div className="branch-admin__hero-actions">
          <button className="branch-admin__sync" type="button" onClick={updatePrices} disabled={syncing || checkingActivity}>
            {syncing ? 'Actualizando...' : 'Actualizar precios SICAR'}
          </button>
          <button
            className="branch-admin__sync branch-admin__sync--warning"
            type="button"
            onClick={previewInactiveProducts}
            disabled={checkingActivity || syncing}
          >
            {checkingActivity ? 'Revisando ventas...' : 'Inactivar sin ventas 60 dias'}
          </button>
        </div>
      </section>

      <section className="branch-admin__stats">
        <div className="branch-admin__stat"><small>Catalogo maestro</small><strong>{scopedProducts.length}</strong></div>
        <div className="branch-admin__stat"><small>Activos en sucursal</small><strong>{activeCount}</strong></div>
        <div className="branch-admin__stat"><small>Precios propios</small><strong>{customPriceCount}</strong></div>
      </section>

      {message && <div className="branch-admin__message">{message}</div>}
      <div className="branch-admin__catalog-tools">
        <div className="branch-admin__toolbar">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nombre o clave SICAR"
          />
          <strong>
            {loading ? 'Cargando...' : `${visibleProducts.length} de ${filteredProducts.length}`}
          </strong>
        </div>
        <div className="branch-admin__categories" aria-label="Categorias del catalogo">
          <button
            type="button"
            className={`branch-category ${selectedCategory === 'todos' ? 'branch-category--active' : ''}`}
            onClick={() => {
              setSelectedCategory('todos');
              setSearch('');
            }}
          >
            Todos <span>{scopedProducts.length}</span>
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`branch-category ${selectedCategory === category.id ? 'branch-category--active' : ''}`}
              onClick={() => {
                setSelectedCategory(category.id);
                setSearch('');
              }}
            >
              {category.label} <span>{category.count}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="branch-admin__grid">
        {visibleProducts.map((product) => (
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
      {!loading && filteredProducts.length === 0 && (
        <div className="branch-admin__empty">No se encontraron productos con esa búsqueda.</div>
      )}
      {hasMoreProducts && (
        <button
          className="branch-admin__load-more"
          type="button"
          onClick={() => setVisibleCount((current) => current + CATALOG_PAGE_SIZE)}
        >
          Cargar {Math.min(CATALOG_PAGE_SIZE, filteredProducts.length - visibleProducts.length)} mas
        </button>
      )}

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

      {inactivityPreview && (
        <div className="branch-admin__modal" role="presentation" onMouseDown={() => setInactivityPreview(null)}>
          <section className="branch-sales-review" onMouseDown={(event) => event.stopPropagation()}>
            <div>
              <small>Vista previa SICAR - {branchName}</small>
              <h2>Productos sin ventas en 60 dias</h2>
            </div>
            <div className="branch-sales-review__stats">
              <div className="branch-sales-review__stat">
                <small>Con ventas</small>
                <strong>{inactivityPreview.soldCatalogCount}</strong>
              </div>
              <div className="branch-sales-review__stat branch-sales-review__stat--warning">
                <small>Se pausaran</small>
                <strong>{inactivityPreview.candidates.length}</strong>
              </div>
            </div>
            <p>
              Periodo: {inactivityPreview.dateWindow?.startDate || '-'} al{' '}
              {inactivityPreview.dateWindow?.endInclusiveDate || '-'}.
            </p>
            {inactivityPreview.soldProducts.length === 0 && (
              <div className="branch-sales-review__alert">
                SICAR no devolvio productos vendidos. Revisa cuidadosamente antes de pausar todo el catalogo.
              </div>
            )}
            <div className="branch-sales-review__list">
              {inactivityPreview.candidates.slice(0, 40).map((product) => (
                <div className="branch-sales-review__item" key={product.code}>
                  <strong>{product.name}</strong>
                  <span>{product.code}</span>
                </div>
              ))}
              {inactivityPreview.candidates.length > 40 && (
                <div className="branch-sales-review__item">
                  <strong>Y {inactivityPreview.candidates.length - 40} productos mas</strong>
                </div>
              )}
            </div>
            <p>Los productos no se eliminan; solamente dejaran de mostrarse en esta sucursal.</p>
            <div className="branch-admin__actions">
              <button type="button" className="branch-admin__cancel" onClick={() => setInactivityPreview(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="branch-admin__save"
                disabled={applyingActivity || inactivityPreview.candidates.length === 0}
                onClick={applyInactiveProducts}
              >
                {applyingActivity ? 'Aplicando...' : `Pausar ${inactivityPreview.candidates.length} productos`}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
