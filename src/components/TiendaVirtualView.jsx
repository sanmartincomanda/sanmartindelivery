import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from '../firebase';
import {
  QUICK_WEIGHTS,
  STORE_CATEGORIES,
  STORE_PAYMENT_OPTIONS,
  STORE_PROMOTIONS,
} from '../data/tiendaVirtual';
import { mergeCatalogProducts, STORE_CATALOG_PATH } from '../services/storeCatalog';
import { cleanStorePhone, ensureStoreUser } from '../services/storeUsers';
import { formatOrderNumber, formatWeight, STORE_CHANNEL } from '../services/orders';

const LOGO_PATH = '/tienda/branding/logo.png';

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const clampQuantity = (value) => {
  const rounded = Math.round(Number(value || 0) * 2) / 2;
  if (rounded <= 0) {
    return 0;
  }

  return Number(rounded.toFixed(1));
};

const getProductCategoryTokens = (product) =>
  [product.category, product.subcategory, product.name, product.code]
    .join(' ')
    .toLowerCase();

export default function TiendaVirtualView({
  onCreateOrder,
  mode = 'public',
  publicStoreUrl = '#tienda',
}) {
  const [catalog, setCatalog] = useState(() => mergeCatalogProducts());
  const [cart, setCart] = useState({});
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('todos');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [statusPhone, setStatusPhone] = useState('');
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customer, setCustomer] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    referencia: '',
    metodoPago: STORE_PAYMENT_OPTIONS[0],
  });
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);

  const deferredQuery = useDeferredValue(query);
  const isDashboard = mode === 'dashboard';

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATALOG_PATH), (snapshot) => {
      setCatalog(mergeCatalogProducts(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const cleanPhone = cleanStorePhone(statusPhone);
    if (!cleanPhone) {
      setCustomerOrders([]);
      return undefined;
    }

    const unsubscribe = onValue(ref(database, 'orders'), (snapshot) => {
      const data = snapshot.val() || {};
      const orders = Object.entries(data)
        .map(([firebaseKey, order]) => ({ firebaseKey, ...order }))
        .filter((order) => cleanStorePhone(order.telefono) === cleanPhone)
        .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
        .slice(0, 10);

      setCustomerOrders(orders);
    });

    return () => unsubscribe();
  }, [statusPhone]);

  const activeProducts = useMemo(
    () => catalog.filter((product) => product.active !== false),
    [catalog]
  );

  const categoryOptions = useMemo(() => {
    const subcategories = Array.from(
      new Set(activeProducts.map((product) => product.subcategory).filter(Boolean))
    ).map((subcategory) => ({
      id: subcategory.toLowerCase(),
      label: subcategory,
    }));

    return [...STORE_CATEGORIES, ...subcategories].filter(
      (category, index, all) => all.findIndex((item) => item.id === category.id) === index
    );
  }, [activeProducts]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return activeProducts.filter((product) => {
      const productTokens = getProductCategoryTokens(product);
      const matchesCategory =
        activeCategory === 'todos' ||
        productTokens.includes(activeCategory.toLowerCase()) ||
        (activeCategory === 'promociones' && product.promo);

      const matchesSearch =
        !normalizedQuery ||
        [product.code, product.name, product.description, product.subcategory]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesSearch;
    });
  }, [activeCategory, activeProducts, deferredQuery]);

  const cartItems = useMemo(
    () =>
      activeProducts
        .filter((product) => Number(cart[product.code] || 0) > 0)
        .map((product) => {
          const cantidad = Number(cart[product.code] || 0);
          return {
            codigo: product.code,
            nombre: product.name,
            unidad: product.unit,
            cantidad,
            precioUnitario: product.price,
            subtotal: Number((cantidad * product.price).toFixed(2)),
            image: product.image,
          };
        }),
    [activeProducts, cart]
  );

  const totalAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cartItems]
  );

  const cartCount = cartItems.reduce((sum, item) => sum + Number(item.cantidad || 0), 0);

  const updateQuantity = (code, nextValue) => {
    setCart((current) => ({
      ...current,
      [code]: clampQuantity(nextValue),
    }));
  };

  const updateCustomer = (field, value) => {
    setCustomer((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openProduct = (product) => {
    setSelectedProduct(product);
  };

  const copyPublicLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      alert('Enlace copiado.');
    } catch (error) {
      console.error('No se pudo copiar el enlace:', error);
      alert(publicStoreUrl);
    }
  };

  const submitOrder = async (event) => {
    event.preventDefault();

    if (cartItems.length === 0) {
      alert('Agrega al menos un producto.');
      return;
    }

    if (!customer.nombre.trim() || !customer.telefono.trim() || !customer.direccion.trim()) {
      alert('Completa nombre, telefono y direccion.');
      return;
    }

    setSubmitting(true);

    try {
      const storeUser = await ensureStoreUser(customer);
      const fullAddress = storeUser.referencia
        ? `${storeUser.direccion} | Ref: ${storeUser.referencia}`
        : storeUser.direccion;

      const order = await onCreateOrder(
        {
          cliente: storeUser.nombre,
          clienteCodigo: storeUser.codigo,
          clienteFirebaseKey: storeUser.clientKey,
          storeUserKey: storeUser.key,
          direccion: fullAddress,
          telefono: storeUser.telefono,
          referencia: storeUser.referencia,
          items: cartItems,
          total: totalAmount,
          observaciones: notes.trim(),
          metodoPago: customer.metodoPago,
        },
        { channel: STORE_CHANNEL }
      );

      setCreatedOrder(order);
      setStatusPhone(storeUser.telefono);
      setCart({});
      setNotes('');
      setCheckoutOpen(false);
      setOrdersOpen(true);
    } catch (error) {
      console.error('Error creando pedido virtual:', error);
      if (error.code === 'ORDER_LIMIT_REACHED') {
        alert('Hoy ya no quedan numeros disponibles.');
      } else {
        alert('No se pudo enviar el pedido.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="store-shell">
      <style>{`
        .store-shell {
          min-height: ${isDashboard ? 'calc(100vh - 64px)' : '100vh'};
          background: #f7f7f8;
          color: #111827;
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }
        .store-shell * {
          box-sizing: border-box;
        }
        .store-page {
          max-width: 1180px;
          margin: 0 auto;
          padding: ${isDashboard ? '18px' : '12px'} 18px 108px;
        }
        .store-admin-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
          padding: 12px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
        }
        .store-top {
          position: sticky;
          top: ${isDashboard ? '64px' : '0'};
          z-index: 80;
          background: rgba(247, 247, 248, 0.96);
          backdrop-filter: blur(12px);
          padding: 10px 0 14px;
        }
        .store-brand-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 10px;
        }
        .store-logo {
          width: 42px;
          height: 42px;
          border-radius: 8px;
          object-fit: contain;
          background: #ffffff;
        }
        .store-title {
          font-size: 18px;
          font-weight: 900;
          line-height: 1.1;
        }
        .store-actions {
          margin-left: auto;
          display: flex;
          gap: 8px;
        }
        .store-icon-button,
        .store-button,
        .store-chip,
        .store-back,
        .store-add {
          border: 0;
          cursor: pointer;
          font-family: inherit;
          transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
        }
        .store-icon-button:hover,
        .store-button:hover,
        .store-chip:hover,
        .store-back:hover,
        .store-add:hover {
          transform: translateY(-1px);
        }
        .store-icon-button {
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          color: #111827;
          font-size: 18px;
          font-weight: 900;
        }
        .store-search-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 0 14px;
          height: 48px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.05);
        }
        .store-search {
          width: 100%;
          border: 0;
          outline: 0;
          font-size: 15px;
          background: transparent;
        }
        .store-tabs {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 12px 0 2px;
        }
        .store-chip {
          flex: 0 0 auto;
          padding: 10px 16px;
          border-radius: 999px;
          background: #ffffff;
          color: #374151;
          border: 1px solid #e5e7eb;
          font-size: 14px;
          font-weight: 800;
        }
        .store-chip.active {
          background: #111827;
          color: #ffffff;
          border-color: #111827;
        }
        .store-promo {
          margin: 12px 0 18px;
        }
        .store-section-title {
          font-size: 18px;
          font-weight: 900;
          margin: 0 0 10px;
        }
        .store-promo-track {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(128px, 168px);
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .store-promo-card {
          height: 198px;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .store-promo-card img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          background: #111827;
        }
        .store-product-head {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .store-count {
          margin: 0;
          font-size: 26px;
          line-height: 1;
          font-weight: 900;
        }
        .store-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 18px;
        }
        .store-product {
          position: relative;
          min-width: 0;
        }
        .store-product-image {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 8px;
          background: #ffffff;
          border: 1px solid #eef0f3;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
        }
        .store-product-image img {
          width: 92%;
          height: 92%;
          object-fit: contain;
        }
        .store-add {
          position: absolute;
          top: calc(100% - 68px);
          right: 10px;
          width: 42px;
          height: 42px;
          border-radius: 999px;
          background: #ffffff;
          color: #111827;
          font-size: 25px;
          line-height: 1;
          box-shadow: 0 10px 22px rgba(15, 23, 42, 0.12);
          border: 1px solid #e5e7eb;
        }
        .store-product-name {
          margin: 10px 0 4px;
          min-height: 42px;
          color: #6b7280;
          font-size: 15px;
          line-height: 1.35;
          cursor: pointer;
        }
        .store-price {
          margin: 0;
          font-size: 17px;
          font-weight: 900;
          color: #111827;
        }
        .store-unit {
          margin: 3px 0 0;
          color: #9ca3af;
          font-size: 13px;
          font-weight: 700;
        }
        .store-empty {
          padding: 34px;
          border: 1px dashed #d1d5db;
          border-radius: 8px;
          color: #6b7280;
          text-align: center;
        }
        .store-cart-bar {
          position: fixed;
          left: ${isDashboard ? 'calc(50% + 130px)' : '50%'};
          bottom: 18px;
          z-index: 110;
          width: min(720px, calc(100vw - 28px));
          transform: translateX(-50%);
          border-radius: 999px;
          background: #111827;
          color: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 14px 12px 18px;
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.24);
        }
        .store-button {
          border-radius: 999px;
          padding: 12px 18px;
          background: #ef4444;
          color: #ffffff;
          font-weight: 900;
          font-size: 14px;
        }
        .store-button.secondary {
          background: #ffffff;
          color: #111827;
          border: 1px solid #e5e7eb;
        }
        .store-sheet-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(17, 24, 39, 0.38);
          display: flex;
          align-items: end;
          justify-content: center;
        }
        .store-sheet {
          width: min(720px, 100%);
          max-height: calc(100vh - 28px);
          overflow: auto;
          background: #ffffff;
          border-radius: 18px 18px 0 0;
          padding: 16px;
          box-shadow: 0 -18px 42px rgba(15, 23, 42, 0.18);
        }
        .store-sheet.full {
          width: min(980px, 100%);
        }
        .store-back {
          width: 40px;
          height: 40px;
          border-radius: 999px;
          background: #f3f4f6;
          color: #111827;
          font-size: 22px;
        }
        .store-sheet-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 14px;
        }
        .store-detail-grid {
          display: grid;
          grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
          gap: 18px;
          align-items: start;
        }
        .store-detail-image {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 8px;
          background: #f7f7f8;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #e5e7eb;
        }
        .store-detail-image img {
          width: 94%;
          height: 94%;
          object-fit: contain;
        }
        .store-qty-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin: 16px 0;
        }
        .store-stepper {
          display: grid;
          grid-template-columns: 48px 1fr 48px;
          gap: 8px;
          align-items: center;
          margin-bottom: 14px;
        }
        .store-stepper button {
          height: 46px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          font-size: 24px;
          font-weight: 900;
          cursor: pointer;
        }
        .store-stepper strong {
          height: 46px;
          border-radius: 999px;
          background: #f3f4f6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .store-form {
          display: grid;
          gap: 10px;
        }
        .store-field,
        .store-textarea,
        .store-select {
          width: 100%;
          min-height: 46px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          outline: 0;
          font: inherit;
          background: #ffffff;
        }
        .store-textarea {
          min-height: 88px;
          resize: vertical;
        }
        .store-order-line {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #f1f2f4;
        }
        .store-order-line img {
          width: 52px;
          height: 52px;
          border-radius: 8px;
          object-fit: contain;
          background: #f7f7f8;
        }
        .store-status-card {
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 12px;
          margin-top: 10px;
        }
        .store-status-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 6px 10px;
          background: #f3f4f6;
          font-size: 12px;
          font-weight: 900;
        }
        @media (max-width: 980px) {
          .store-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 720px) {
          .store-page {
            padding-left: 14px;
            padding-right: 14px;
          }
          .store-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px 14px;
          }
          .store-promo-track {
            grid-auto-columns: minmax(128px, 146px);
          }
          .store-promo-card {
            height: 184px;
          }
          .store-detail-grid {
            grid-template-columns: 1fr;
          }
          .store-product-name {
            font-size: 14px;
          }
          .store-cart-bar {
            left: 50%;
          }
        }
      `}</style>

      <div className="store-page">
        {isDashboard && (
          <div className="store-admin-bar">
            <strong>Tienda Virtual Carnes San Martin Granada</strong>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="store-button secondary" onClick={copyPublicLink}>
                Copiar enlace
              </button>
              <button
                type="button"
                className="store-button"
                onClick={() => window.open(publicStoreUrl, '_blank', 'noopener,noreferrer')}
              >
                Abrir tienda
              </button>
            </div>
          </div>
        )}

        <header className="store-top">
          <div className="store-brand-row">
            <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
            <div className="store-title">Tienda Virtual Carnes San Martin Granada</div>
            <div className="store-actions">
              <button
                type="button"
                className="store-icon-button"
                title="Mis pedidos"
                onClick={() => setOrdersOpen(true)}
              >
                #
              </button>
              <button
                type="button"
                className="store-icon-button"
                title="Carrito"
                onClick={() => setCheckoutOpen(true)}
              >
                {cartItems.length || '+'}
              </button>
            </div>
          </div>

          <label className="store-search-wrap">
            <span style={{ fontWeight: 900 }}>Buscar</span>
            <input
              className="store-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar en Carnes San Martin Granada"
            />
          </label>

          <nav className="store-tabs">
            {categoryOptions.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`store-chip ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(category.id)}
              >
                {category.label}
              </button>
            ))}
          </nav>
        </header>

        <section className="store-promo">
          <h2 className="store-section-title">Promociones activas</h2>
          <div className="store-promo-track">
            {STORE_PROMOTIONS.map((promotion) => (
              <div key={promotion.id} className="store-promo-card">
                <img src={promotion.image} alt={promotion.title} />
              </div>
            ))}
          </div>
        </section>

        <main>
          <div className="store-product-head">
            <h2 className="store-count">{filteredProducts.length} productos</h2>
            <button
              type="button"
              className="store-button secondary"
              onClick={() => {
                setQuery('');
                setActiveCategory('todos');
              }}
            >
              Limpiar
            </button>
          </div>

          {filteredProducts.length === 0 ? (
            <div className="store-empty">No encontramos productos con esa busqueda.</div>
          ) : (
            <div className="store-grid">
              {filteredProducts.map((product) => {
                const quantity = Number(cart[product.code] || 0);
                return (
                  <article key={product.code} className="store-product">
                    <button
                      type="button"
                      className="store-product-image"
                      onClick={() => openProduct(product)}
                    >
                      <img src={product.image || LOGO_PATH} alt={product.name} />
                    </button>
                    <button
                      type="button"
                      className="store-add"
                      title="Agregar"
                      onClick={() => updateQuantity(product.code, quantity + 0.5)}
                    >
                      +
                    </button>
                    <h3 className="store-product-name" onClick={() => openProduct(product)}>
                      {product.name}
                    </h3>
                    <p className="store-price">{formatCurrency(product.price)}</p>
                    <p className="store-unit">
                      {quantity > 0
                        ? `${formatWeight(quantity)} ${product.unit} en carrito`
                        : `C$ ${Number(product.price || 0).toFixed(2)}/${product.unit}`}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {cartItems.length > 0 && (
        <div className="store-cart-bar">
          <div>
            <strong>{formatWeight(cartCount)} lb</strong>
            <div style={{ fontSize: 13, opacity: 0.78 }}>{formatCurrency(totalAmount)}</div>
          </div>
          <button type="button" className="store-button" onClick={() => setCheckoutOpen(true)}>
            Ver pedido
          </button>
        </div>
      )}

      {selectedProduct && (
        <ProductSheet
          product={selectedProduct}
          quantity={Number(cart[selectedProduct.code] || 0)}
          onClose={() => setSelectedProduct(null)}
          onQuantityChange={(nextQuantity) => updateQuantity(selectedProduct.code, nextQuantity)}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          cartItems={cartItems}
          customer={customer}
          notes={notes}
          submitting={submitting}
          totalAmount={totalAmount}
          onClose={() => setCheckoutOpen(false)}
          onCustomerChange={updateCustomer}
          onNotesChange={setNotes}
          onSubmit={submitOrder}
        />
      )}

      {ordersOpen && (
        <OrdersSheet
          statusPhone={statusPhone || customer.telefono}
          orders={customerOrders}
          createdOrder={createdOrder}
          onPhoneChange={setStatusPhone}
          onClose={() => setOrdersOpen(false)}
        />
      )}
    </div>
  );
}

function ProductSheet({ product, quantity, onClose, onQuantityChange }) {
  const subtotal = Number(quantity || 0) * Number(product.price || 0);

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet full">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>{product.code}</strong>
        </div>

        <div className="store-detail-grid">
          <div className="store-detail-image">
            <img src={product.image || LOGO_PATH} alt={product.name} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 28, lineHeight: 1.08 }}>{product.name}</h2>
            <p className="store-price" style={{ fontSize: 24 }}>
              {formatCurrency(product.price)}
            </p>
            <p className="store-unit">{product.description || `Precio por ${product.unit}`}</p>

            <div className="store-qty-row">
              {QUICK_WEIGHTS.map((weight) => (
                <button
                  key={weight}
                  type="button"
                  className={`store-chip ${quantity === weight ? 'active' : ''}`}
                  onClick={() => onQuantityChange(weight)}
                >
                  {formatWeight(weight)} {product.unit}
                </button>
              ))}
            </div>

            <div className="store-stepper">
              <button type="button" onClick={() => onQuantityChange(quantity - 0.5)}>
                -
              </button>
              <strong>{formatWeight(quantity)} {product.unit}</strong>
              <button type="button" onClick={() => onQuantityChange(quantity + 0.5)}>
                +
              </button>
            </div>

            <button
              type="button"
              className="store-button"
              style={{ width: '100%' }}
              onClick={onClose}
            >
              {quantity > 0 ? `Agregar ${formatCurrency(subtotal)}` : 'Agregar al pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckoutSheet({
  cartItems,
  customer,
  notes,
  submitting,
  totalAmount,
  onClose,
  onCustomerChange,
  onNotesChange,
  onSubmit,
}) {
  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>Tu pedido</strong>
        </div>

        {cartItems.map((item) => (
          <div key={item.codigo} className="store-order-line">
            <img src={item.image || LOGO_PATH} alt={item.nombre} />
            <div>
              <strong>{item.nombre}</strong>
              <div style={{ color: '#6b7280', fontSize: 13 }}>
                {formatWeight(item.cantidad)} {item.unidad} x {formatCurrency(item.precioUnitario)}
              </div>
            </div>
            <strong>{formatCurrency(item.subtotal)}</strong>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 16px' }}>
          <strong>Total</strong>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>

        <form className="store-form" onSubmit={onSubmit}>
          <input
            className="store-field"
            value={customer.nombre}
            onChange={(event) => onCustomerChange('nombre', event.target.value)}
            placeholder="Nombre completo"
          />
          <input
            className="store-field"
            value={customer.telefono}
            onChange={(event) => onCustomerChange('telefono', event.target.value)}
            placeholder="Telefono o WhatsApp"
          />
          <input
            className="store-field"
            value={customer.direccion}
            onChange={(event) => onCustomerChange('direccion', event.target.value)}
            placeholder="Direccion"
          />
          <input
            className="store-field"
            value={customer.referencia}
            onChange={(event) => onCustomerChange('referencia', event.target.value)}
            placeholder="Referencia"
          />
          <select
            className="store-select"
            value={customer.metodoPago}
            onChange={(event) => onCustomerChange('metodoPago', event.target.value)}
          >
            {STORE_PAYMENT_OPTIONS.map((payment) => (
              <option key={payment} value={payment}>
                {payment}
              </option>
            ))}
          </select>
          <textarea
            className="store-textarea"
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder="Observaciones"
          />
          <button type="submit" className="store-button" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Crear usuario y enviar'}
          </button>
        </form>
      </div>
    </div>
  );
}

function OrdersSheet({ statusPhone, orders, createdOrder, onPhoneChange, onClose }) {
  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>Estado de pedido</strong>
        </div>

        {createdOrder && (
          <div className="store-status-card" style={{ borderColor: '#ef4444' }}>
            <div className="store-status-pill">Pedido #{formatOrderNumber(createdOrder.id)}</div>
            <h3 style={{ margin: '10px 0 4px' }}>{createdOrder.estado}</h3>
            <div style={{ color: '#6b7280' }}>{formatCurrency(createdOrder.total)}</div>
          </div>
        )}

        <input
          className="store-field"
          style={{ marginTop: 12 }}
          value={statusPhone}
          onChange={(event) => onPhoneChange(event.target.value)}
          placeholder="Telefono para consultar"
        />

        {orders.length === 0 ? (
          <div className="store-empty" style={{ marginTop: 12 }}>
            Ingresa tu telefono para ver tus pedidos.
          </div>
        ) : (
          orders.map((order) => (
            <div key={order.firebaseKey} className="store-status-card">
              <div className="store-status-pill">Pedido #{formatOrderNumber(order.id)}</div>
              <h3 style={{ margin: '10px 0 4px' }}>{order.estado || 'Pendiente'}</h3>
              <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
                {order.fecha} - {order.timestampIngreso || ''}
                <br />
                {formatCurrency(order.total)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
