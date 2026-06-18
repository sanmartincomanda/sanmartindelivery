import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  QUICK_WEIGHTS,
  STORE_FEATURES,
  STORE_FILTERS,
  STORE_PAYMENT_OPTIONS,
  STORE_PRODUCTS,
  STORE_PROMOTIONS,
} from '../data/tiendaVirtual';
import {
  formatOrderNumber,
  formatWeight,
  ORDER_LIMIT_PER_DAY,
  STORE_CHANNEL,
} from '../services/orders';

const LOGO_PATH = '/tienda/branding/logo.png';
const HERO_IMAGE = '/tienda/page/hero-table.jpg';

const formatCurrency = (value) => `C$${Number(value || 0).toFixed(2)}`;

const CATEGORY_BY_CODE = {
  '00393': 'parrilla',
  '00444': 'hogar',
  '00442': 'especiales',
};

const clampQuantity = (value) => {
  const rounded = Math.round(Number(value || 0) * 2) / 2;
  if (rounded <= 0) {
    return 0;
  }

  return Number(rounded.toFixed(1));
};

const sanitizePhone = (value) => String(value || '').replace(/[^\d+]/g, '').trim();

const buildClientCode = (phone) => {
  const lastDigits = sanitizePhone(phone).replace(/\D/g, '').slice(-4);
  return `TV-${lastDigits || 'WEB'}`;
};

export default function TiendaVirtualView({
  onCreateOrder,
  nextOrderNumber,
  remainingOrders,
  mode = 'public',
  publicStoreUrl = '#tienda',
}) {
  const [cart, setCart] = useState(() =>
    STORE_PRODUCTS.reduce((accumulator, product) => {
      accumulator[product.code] = 0;
      return accumulator;
    }, {})
  );
  const [customer, setCustomer] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    referencia: '',
    metodoPago: STORE_PAYMENT_OPTIONS[0],
  });
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('todos');
  const [activePromo, setActivePromo] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);

  const deferredSearch = useDeferredValue(search);
  const isEmbedded = mode === 'dashboard';
  const hasAvailability = remainingOrders > 0;
  const estimatedOrder = hasAvailability ? formatOrderNumber(nextOrderNumber) : 'MAX';

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      startTransition(() => {
        setActivePromo((current) => (current + 1) % STORE_PROMOTIONS.length);
      });
    }, 5200);

    return () => window.clearInterval(intervalId);
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedTerm = deferredSearch.trim().toLowerCase();

    return STORE_PRODUCTS.filter((product) => {
      const matchesFilter =
        activeFilter === 'todos' || CATEGORY_BY_CODE[product.code] === activeFilter;

      const searchableText = [
        product.code,
        product.name,
        product.description,
        product.badge,
      ]
        .join(' ')
        .toLowerCase();

      const matchesSearch = !normalizedTerm || searchableText.includes(normalizedTerm);
      return matchesFilter && matchesSearch;
    });
  }, [activeFilter, deferredSearch]);

  const cartItems = useMemo(
    () =>
      STORE_PRODUCTS.filter((product) => Number(cart[product.code] || 0) > 0).map((product) => {
        const cantidad = Number(cart[product.code] || 0);
        return {
          codigo: product.code,
          nombre: product.name,
          unidad: product.unit,
          cantidad,
          precioUnitario: product.price,
          subtotal: Number((cantidad * product.price).toFixed(2)),
        };
      }),
    [cart]
  );

  const totalWeight = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.cantidad || 0), 0),
    [cartItems]
  );

  const totalAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cartItems]
  );

  const activePromotion = STORE_PROMOTIONS[activePromo];

  const handleQuantityChange = (code, nextValue) => {
    setCart((current) => ({
      ...current,
      [code]: clampQuantity(nextValue),
    }));
  };

  const handleCustomerChange = (field, value) => {
    setCustomer((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
      alert('Enlace de la tienda copiado.');
    } catch (error) {
      console.error('No se pudo copiar el enlace:', error);
      alert(`Copiá este enlace manualmente: ${publicStoreUrl}`);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!hasAvailability) {
      alert('Hoy ya se alcanzo el limite de pedidos disponibles.');
      return;
    }

    if (cartItems.length === 0) {
      alert('Agrega al menos un producto al carrito.');
      return;
    }

    const cleanPhone = sanitizePhone(customer.telefono);
    if (!customer.nombre.trim() || !cleanPhone || !customer.direccion.trim()) {
      alert('Completá nombre, telefono y direccion para enviar el pedido.');
      return;
    }

    const direccionCompleta = customer.referencia.trim()
      ? `${customer.direccion.trim()} | Ref: ${customer.referencia.trim()}`
      : customer.direccion.trim();

    setSubmitting(true);

    try {
      const createdOrder = await onCreateOrder(
        {
          cliente: customer.nombre.trim(),
          clienteCodigo: buildClientCode(cleanPhone),
          direccion: direccionCompleta,
          telefono: cleanPhone,
          referencia: customer.referencia.trim(),
          items: cartItems,
          total: totalAmount,
          observaciones: notes.trim(),
          metodoPago: customer.metodoPago,
        },
        { channel: STORE_CHANNEL }
      );

      setSuccessOrder(createdOrder);
      window.setTimeout(() => setSuccessOrder(null), 3200);

      setCart(
        STORE_PRODUCTS.reduce((accumulator, product) => {
          accumulator[product.code] = 0;
          return accumulator;
        }, {})
      );
      setCustomer({
        nombre: '',
        telefono: '',
        direccion: '',
        referencia: '',
        metodoPago: STORE_PAYMENT_OPTIONS[0],
      });
      setNotes('');
    } catch (error) {
      console.error('Error creando pedido virtual:', error);
      if (error.code === 'ORDER_LIMIT_REACHED') {
        alert('Hoy ya no quedan numeros disponibles para seguir recibiendo pedidos.');
      } else {
        alert('No pudimos enviar el pedido. Intenta nuevamente.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="sv-shell"
      style={{
        minHeight: isEmbedded ? 'calc(100vh - 64px)' : '100vh',
        background:
          'radial-gradient(circle at top left, rgba(239, 68, 68, 0.22), transparent 32%), linear-gradient(180deg, #150607 0%, #22090b 28%, #0d1117 100%)',
        color: '#fff7ed',
        padding: isEmbedded ? '24px' : '0',
      }}
    >
      <style>{`
        .sv-shell {
          --sv-red: #ef4444;
          --sv-wine: #70161f;
          --sv-gold: #f59e0b;
          --sv-bone: #fff7ed;
          --sv-ink: #0f172a;
          --sv-panel: rgba(23, 23, 23, 0.74);
          --sv-line: rgba(255, 255, 255, 0.12);
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }
        .sv-shell * {
          box-sizing: border-box;
        }
        .sv-headline {
          font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
          letter-spacing: 0.02em;
        }
        .sv-glass {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          backdrop-filter: blur(14px);
        }
        .sv-button,
        .sv-thumb,
        .sv-card,
        .sv-qty-btn,
        .sv-filter-btn,
        .sv-pay-btn {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease, background 0.22s ease;
        }
        .sv-button:hover,
        .sv-thumb:hover,
        .sv-card:hover,
        .sv-qty-btn:hover,
        .sv-filter-btn:hover,
        .sv-pay-btn:hover {
          transform: translateY(-2px);
        }
        .sv-shell a {
          color: inherit;
          text-decoration: none;
        }
        .sv-root {
          width: min(1440px, 100%);
          margin: 0 auto;
        }
        .sv-hero {
          position: relative;
          overflow: hidden;
          border-radius: 0 0 36px 36px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          background-image:
            linear-gradient(115deg, rgba(14, 4, 6, 0.92) 8%, rgba(79, 13, 20, 0.84) 46%, rgba(11, 15, 20, 0.86) 100%),
            url('${HERO_IMAGE}');
          background-size: cover;
          background-position: center;
        }
        .sv-hero::after {
          content: "";
          position: absolute;
          inset: auto 0 0 0;
          height: 160px;
          background: linear-gradient(180deg, transparent, rgba(13, 17, 23, 0.9));
          pointer-events: none;
        }
        .sv-hero-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(320px, 430px);
          gap: 28px;
          align-items: center;
          padding: 28px;
        }
        .sv-badge-row,
        .sv-filter-row,
        .sv-cart-tags,
        .sv-quick-row,
        .sv-payment-grid,
        .sv-promo-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .sv-metrics {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }
        .sv-metric,
        .sv-feature,
        .sv-inline-card,
        .sv-cart-panel,
        .sv-section-card,
        .sv-promo-stage,
        .sv-card {
          border-radius: 24px;
        }
        .sv-metric {
          padding: 16px 18px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .sv-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(330px, 420px);
          gap: 24px;
          padding: 24px;
          align-items: start;
        }
        .sv-column {
          display: grid;
          gap: 24px;
        }
        .sv-section-card {
          padding: 22px;
        }
        .sv-section-head {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: end;
          margin-bottom: 18px;
        }
        .sv-promo-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          gap: 18px;
        }
        .sv-promo-stage {
          position: relative;
          min-height: 420px;
          overflow: hidden;
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .sv-promo-stage::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.82));
        }
        .sv-promo-copy {
          position: absolute;
          inset: auto 18px 18px 18px;
          z-index: 1;
        }
        .sv-thumb {
          width: 100%;
          border: 1px solid transparent;
          padding: 10px;
          text-align: left;
          cursor: pointer;
        }
        .sv-thumb.is-active {
          border-color: rgba(245, 158, 11, 0.66);
          box-shadow: 0 10px 30px rgba(245, 158, 11, 0.22);
        }
        .sv-thumb-image {
          width: 100%;
          aspect-ratio: 16 / 11;
          border-radius: 16px;
          background-size: cover;
          background-position: center;
          margin-bottom: 10px;
        }
        .sv-toolbar {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 16px;
        }
        .sv-filter-btn,
        .sv-pay-btn,
        .sv-quick-chip {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: #fff7ed;
          border-radius: 999px;
          padding: 10px 14px;
          cursor: pointer;
          font-weight: 700;
        }
        .sv-filter-btn.is-active,
        .sv-pay-btn.is-active,
        .sv-quick-chip.is-active {
          background: rgba(245, 158, 11, 0.18);
          border-color: rgba(245, 158, 11, 0.64);
          color: #fcd34d;
        }
        .sv-search {
          min-width: 260px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(6, 9, 15, 0.58);
          color: white;
          outline: none;
        }
        .sv-product-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }
        .sv-card {
          position: relative;
          overflow: hidden;
          min-height: 420px;
          display: flex;
          flex-direction: column;
          justify-content: end;
          padding: 18px;
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 44px rgba(0, 0, 0, 0.22);
        }
        .sv-card::before {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.08), rgba(15, 23, 42, 0.9) 78%);
        }
        .sv-card-content {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 14px;
        }
        .sv-card-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
        }
        .sv-card-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-size: 12px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .sv-stepper {
          display: grid;
          grid-template-columns: 48px 1fr 48px;
          gap: 10px;
          align-items: center;
        }
        .sv-qty-btn {
          height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.08);
          color: white;
          font-size: 24px;
          font-weight: 800;
          cursor: pointer;
        }
        .sv-qty-box {
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(8, 10, 15, 0.7);
          padding: 12px;
          text-align: center;
        }
        .sv-cart-panel {
          position: sticky;
          top: 88px;
          padding: 22px;
        }
        .sv-order-card {
          padding: 18px;
          border-radius: 22px;
          background: linear-gradient(145deg, rgba(239, 68, 68, 0.18), rgba(245, 158, 11, 0.1));
          border: 1px solid rgba(255, 255, 255, 0.12);
          margin-bottom: 18px;
        }
        .sv-cart-list {
          display: grid;
          gap: 12px;
          margin: 18px 0;
        }
        .sv-cart-item {
          display: grid;
          gap: 8px;
          padding: 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .sv-cart-summary {
          display: grid;
          gap: 10px;
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          margin-bottom: 18px;
        }
        .sv-form-grid {
          display: grid;
          gap: 12px;
        }
        .sv-field,
        .sv-textarea {
          width: 100%;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(9, 11, 16, 0.66);
          color: white;
          outline: none;
        }
        .sv-textarea {
          min-height: 110px;
          resize: vertical;
          font-family: inherit;
        }
        .sv-button {
          width: 100%;
          border: none;
          border-radius: 18px;
          padding: 18px;
          cursor: pointer;
          font-weight: 900;
          font-size: 16px;
          color: #fff7ed;
          background: linear-gradient(135deg, #ef4444 0%, #f59e0b 100%);
          box-shadow: 0 20px 36px rgba(239, 68, 68, 0.24);
        }
        .sv-inline-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 18px;
        }
        .sv-inline-card {
          padding: 14px 16px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .sv-admin-strip {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
          margin-bottom: 18px;
          padding: 18px 22px;
          border-radius: 26px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .sv-empty {
          padding: 28px;
          border-radius: 24px;
          border: 1px dashed rgba(255, 255, 255, 0.16);
          text-align: center;
          color: rgba(255, 247, 237, 0.72);
        }
        .sv-success-overlay {
          position: fixed;
          inset: 0;
          z-index: 1600;
          background: rgba(7, 10, 14, 0.58);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .sv-success-card {
          width: min(460px, 100%);
          padding: 28px;
          border-radius: 28px;
          text-align: center;
          background: linear-gradient(180deg, rgba(18, 25, 36, 0.98), rgba(61, 10, 14, 0.96));
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 26px 70px rgba(0, 0, 0, 0.4);
        }
        @media (max-width: 1180px) {
          .sv-hero-grid,
          .sv-main-grid,
          .sv-promo-layout {
            grid-template-columns: 1fr;
          }
          .sv-cart-panel {
            position: static;
          }
          .sv-product-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 760px) {
          .sv-hero {
            border-radius: 0 0 28px 28px;
          }
          .sv-hero-grid,
          .sv-main-grid,
          .sv-section-card {
            padding-left: 16px;
            padding-right: 16px;
          }
          .sv-hero-grid {
            padding-top: 22px;
            padding-bottom: 22px;
          }
          .sv-metrics {
            grid-template-columns: 1fr;
          }
          .sv-product-grid {
            grid-template-columns: 1fr;
          }
          .sv-toolbar {
            flex-direction: column;
          }
          .sv-search {
            min-width: 100%;
          }
        }
      `}</style>

      {successOrder && (
        <div className="sv-success-overlay">
          <div className="sv-success-card">
            <div style={{ fontSize: '58px', marginBottom: '14px' }}>🔥</div>
            <div className="sv-headline" style={{ fontSize: '44px', lineHeight: 0.95 }}>
              PEDIDO #{formatOrderNumber(successOrder.id)}
            </div>
            <div style={{ marginTop: '12px', fontSize: '18px', fontWeight: 800 }}>
              Entrando directo a cocina
            </div>
            <div style={{ marginTop: '10px', color: 'rgba(255, 247, 237, 0.76)', lineHeight: 1.6 }}>
              Cliente: {successOrder.cliente}
              <br />
              Total estimado: {formatCurrency(successOrder.total)}
            </div>
          </div>
        </div>
      )}

      <div className="sv-root">
        {isEmbedded && (
          <div className="sv-admin-strip">
            <div>
              <div style={{ fontSize: '12px', letterSpacing: '0.08em', opacity: 0.7, fontWeight: 800 }}>
                MODULO DE TIENDA VIRTUAL
              </div>
              <div style={{ fontSize: '28px', fontWeight: 900, marginTop: '4px' }}>
                Vista lista para compartir con clientes
              </div>
              <div style={{ marginTop: '6px', color: 'rgba(255, 247, 237, 0.72)' }}>
                Enlace publico sugerido: {publicStoreUrl}
              </div>
            </div>

            <div className="sv-inline-actions">
              <button type="button" onClick={handleCopyLink} className="sv-filter-btn">
                Copiar enlace
              </button>
              <button
                type="button"
                onClick={() => window.open(publicStoreUrl, '_blank', 'noopener,noreferrer')}
                className="sv-filter-btn is-active"
              >
                Abrir tienda publica
              </button>
            </div>
          </div>
        )}

        <section className="sv-hero">
          <div className="sv-hero-grid">
            <div>
              <div
                className="sv-glass"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '14px',
                  borderRadius: '999px',
                  padding: '10px 16px',
                }}
              >
                <img
                  src={LOGO_PATH}
                  alt="Carnes San Martin"
                  style={{
                    width: '56px',
                    height: '56px',
                    objectFit: 'contain',
                    borderRadius: '14px',
                    background: 'white',
                    padding: '6px',
                  }}
                />
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.72, letterSpacing: '0.08em', fontWeight: 800 }}>
                    CARNES SAN MARTIN GRANADA
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: 700 }}>
                    Pedido online conectado al flujo real de delivery
                  </div>
                </div>
              </div>

              <div
                className="sv-headline"
                style={{
                  marginTop: '22px',
                  fontSize: 'clamp(52px, 8vw, 108px)',
                  lineHeight: 0.88,
                  maxWidth: '860px',
                }}
              >
                LA CARNE
                <br />
                ENTRA DIRECTO
                <br />
                A COCINA
              </div>

              <p
                style={{
                  marginTop: '18px',
                  maxWidth: '720px',
                  fontSize: '18px',
                  lineHeight: 1.7,
                  color: 'rgba(255, 247, 237, 0.78)',
                }}
              >
                Esta tienda piloto usa codigos listos para SICAR, cantidades solo en libras y una
                numeracion unificada con el modulo manual para que los pedidos no choquen.
              </p>

              <div className="sv-badge-row" style={{ marginTop: '18px' }}>
                <span className="sv-filter-btn is-active">Desde 0.5 lb</span>
                <span className="sv-filter-btn">3 productos piloto</span>
                <span className="sv-filter-btn">Especiales de marca incluidos</span>
              </div>

              <div className="sv-inline-actions">
                <a href="#catalogo" className="sv-filter-btn is-active">
                  Elegir cortes
                </a>
                <a href="#promos" className="sv-filter-btn">
                  Ver promociones
                </a>
              </div>

              <div className="sv-metrics">
                <div className="sv-metric">
                  <div style={{ fontSize: '12px', opacity: 0.68, fontWeight: 800, letterSpacing: '0.08em' }}>
                    TURNO ESTIMADO
                  </div>
                  <div style={{ fontSize: '34px', fontWeight: 900, marginTop: '6px' }}>#{estimatedOrder}</div>
                </div>
                <div className="sv-metric">
                  <div style={{ fontSize: '12px', opacity: 0.68, fontWeight: 800, letterSpacing: '0.08em' }}>
                    DISPONIBLES HOY
                  </div>
                  <div style={{ fontSize: '34px', fontWeight: 900, marginTop: '6px' }}>{remainingOrders}</div>
                </div>
                <div className="sv-metric">
                  <div style={{ fontSize: '12px', opacity: 0.68, fontWeight: 800, letterSpacing: '0.08em' }}>
                    REGLA DE PESO
                  </div>
                  <div style={{ fontSize: '34px', fontWeight: 900, marginTop: '6px' }}>0.5 lb</div>
                </div>
              </div>
            </div>

            <div className="sv-glass" style={{ padding: '16px', borderRadius: '30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '12px', opacity: 0.68, letterSpacing: '0.08em', fontWeight: 800 }}>
                    ESPECIAL DESTACADO
                  </div>
                  <div className="sv-headline" style={{ fontSize: '36px', marginTop: '8px', lineHeight: 0.95 }}>
                    {activePromotion.title}
                  </div>
                </div>
                <span className="sv-filter-btn is-active">{activePromotion.tag}</span>
              </div>

              <div
                style={{
                  marginTop: '16px',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  aspectRatio: '4 / 5',
                  backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.04), rgba(15, 23, 42, 0.48)), url('${activePromotion.image}')`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  boxShadow: '0 24px 50px rgba(0, 0, 0, 0.26)',
                }}
              />

              <div style={{ marginTop: '14px', color: 'rgba(255, 247, 237, 0.78)', lineHeight: 1.65 }}>
                {activePromotion.subtitle}
              </div>

              <div className="sv-promo-grid" style={{ marginTop: '16px' }}>
                {STORE_PROMOTIONS.slice(0, 4).map((promotion, index) => (
                  <button
                    key={promotion.id}
                    type="button"
                    className={`sv-filter-btn ${activePromo === index ? 'is-active' : ''}`}
                    onClick={() => setActivePromo(index)}
                  >
                    {promotion.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="sv-main-grid">
          <div className="sv-column">
            <section id="promos" className="sv-section-card sv-glass">
              <div className="sv-section-head">
                <div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 800 }}>
                    ZONA DE PROMOCIONALES
                  </div>
                  <div className="sv-headline" style={{ fontSize: '44px', marginTop: '6px', lineHeight: 0.96 }}>
                    ESPECIALES
                    <br />
                    DE MARCA
                  </div>
                </div>
                <div style={{ maxWidth: '340px', color: 'rgba(255, 247, 237, 0.72)', lineHeight: 1.6 }}>
                  Estas piezas publicitarias viven separadas del catalogo para mantener una tienda clara y
                  visualmente potente.
                </div>
              </div>

              <div className="sv-promo-layout">
                <article
                  className="sv-promo-stage"
                  style={{ backgroundImage: `url('${activePromotion.image}')` }}
                >
                  <div className="sv-promo-copy">
                    <div className="sv-filter-btn is-active" style={{ display: 'inline-flex' }}>
                      {activePromotion.tag}
                    </div>
                    <div className="sv-headline" style={{ fontSize: '42px', marginTop: '14px', lineHeight: 0.95 }}>
                      {activePromotion.title}
                    </div>
                    <div style={{ marginTop: '10px', maxWidth: '460px', lineHeight: 1.65 }}>
                      {activePromotion.subtitle}
                    </div>
                  </div>
                </article>

                <div className="sv-column" style={{ gap: '12px' }}>
                  {STORE_PROMOTIONS.map((promotion, index) => (
                    <button
                      key={promotion.id}
                      type="button"
                      className={`sv-thumb sv-glass ${activePromo === index ? 'is-active' : ''}`}
                      onClick={() => {
                        startTransition(() => setActivePromo(index));
                      }}
                    >
                      <div
                        className="sv-thumb-image"
                        style={{ backgroundImage: `url('${promotion.image}')` }}
                      />
                      <div style={{ fontSize: '12px', opacity: 0.62, fontWeight: 800, letterSpacing: '0.08em' }}>
                        {promotion.tag}
                      </div>
                      <div style={{ marginTop: '4px', fontSize: '16px', fontWeight: 800 }}>
                        {promotion.title}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section id="catalogo" className="sv-section-card sv-glass">
              <div className="sv-section-head">
                <div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 800 }}>
                    CATALOGO PILOTO
                  </div>
                  <div className="sv-headline" style={{ fontSize: '44px', marginTop: '6px', lineHeight: 0.96 }}>
                    CORTES PARA
                    <br />
                    PEDIDO EN LINEA
                  </div>
                </div>
                <div style={{ maxWidth: '340px', color: 'rgba(255, 247, 237, 0.72)', lineHeight: 1.6 }}>
                  Solo por libra, siempre en pasos de media libra, usando el codigo que luego se puede enlazar
                  a SICAR.
                </div>
              </div>

              <div className="sv-toolbar">
                <div className="sv-filter-row">
                  {STORE_FILTERS.map((filterOption) => (
                    <button
                      key={filterOption.id}
                      type="button"
                      className={`sv-filter-btn ${activeFilter === filterOption.id ? 'is-active' : ''}`}
                      onClick={() => setActiveFilter(filterOption.id)}
                    >
                      {filterOption.label}
                    </button>
                  ))}
                </div>

                <input
                  className="sv-search"
                  type="search"
                  placeholder="Buscar por codigo, nombre o estilo..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>

              {filteredProducts.length === 0 ? (
                <div className="sv-empty">
                  No encontramos productos con ese filtro. Probá otra palabra o volvé a "Todo el catalogo".
                </div>
              ) : (
                <div className="sv-product-grid">
                  {filteredProducts.map((product) => {
                    const quantity = Number(cart[product.code] || 0);
                    const subtotal = quantity * product.price;

                    return (
                      <article
                        key={product.code}
                        className="sv-card"
                        style={{ backgroundImage: `url('${product.image}')` }}
                      >
                        <div className="sv-card-content">
                          <div className="sv-card-top">
                            <span className="sv-card-tag">{product.badge}</span>
                            <span
                              className="sv-card-tag"
                              style={{
                                background: `${product.accent}22`,
                                borderColor: `${product.accent}55`,
                                color: product.accent,
                              }}
                            >
                              SICAR {product.code}
                            </span>
                          </div>

                          <div>
                            <div style={{ fontSize: '13px', opacity: 0.68, fontWeight: 700 }}>
                              Precio por libra
                            </div>
                            <div className="sv-headline" style={{ fontSize: '34px', marginTop: '4px', lineHeight: 0.95 }}>
                              {formatCurrency(product.price)}
                            </div>
                          </div>

                          <div>
                            <div style={{ fontSize: '24px', fontWeight: 900, lineHeight: 1.1 }}>
                              {product.name}
                            </div>
                            <div style={{ marginTop: '8px', color: 'rgba(255, 247, 237, 0.76)', lineHeight: 1.55 }}>
                              {product.description}
                            </div>
                          </div>

                          <div className="sv-quick-row">
                            {QUICK_WEIGHTS.map((weight) => (
                              <button
                                key={`${product.code}-${weight}`}
                                type="button"
                                className={`sv-quick-chip ${quantity === weight ? 'is-active' : ''}`}
                                onClick={() => handleQuantityChange(product.code, weight)}
                              >
                                {formatWeight(weight)} lb
                              </button>
                            ))}
                          </div>

                          <div className="sv-stepper">
                            <button
                              type="button"
                              className="sv-qty-btn"
                              onClick={() => handleQuantityChange(product.code, quantity - 0.5)}
                            >
                              −
                            </button>
                            <div className="sv-qty-box">
                              <div style={{ fontSize: '12px', opacity: 0.64, fontWeight: 800, letterSpacing: '0.08em' }}>
                                CANTIDAD
                              </div>
                              <div className="sv-headline" style={{ fontSize: '34px', lineHeight: 0.9, marginTop: '6px' }}>
                                {formatWeight(quantity || 0)}
                              </div>
                              <div style={{ marginTop: '6px', fontSize: '13px', opacity: 0.72 }}>
                                {quantity > 0 ? `${formatCurrency(subtotal)} estimado` : 'Elegí un peso'}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="sv-qty-btn"
                              onClick={() => handleQuantityChange(product.code, quantity + 0.5)}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="sv-section-card sv-glass">
              <div className="sv-section-head">
                <div>
                  <div style={{ fontSize: '12px', letterSpacing: '0.08em', opacity: 0.62, fontWeight: 800 }}>
                    EXPERIENCIA OPERATIVA
                  </div>
                  <div className="sv-headline" style={{ fontSize: '38px', marginTop: '6px', lineHeight: 0.98 }}>
                    TIENDA BONITA
                    <br />
                    PERO BIEN ATERRIZADA
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '14px',
                }}
              >
                {STORE_FEATURES.map((feature) => (
                  <div key={feature.title} className="sv-feature sv-glass" style={{ padding: '18px' }}>
                    <div style={{ fontSize: '13px', letterSpacing: '0.08em', opacity: 0.66, fontWeight: 800 }}>
                      BENEFICIO
                    </div>
                    <div style={{ marginTop: '8px', fontSize: '22px', fontWeight: 900 }}>
                      {feature.title}
                    </div>
                    <div style={{ marginTop: '10px', color: 'rgba(255, 247, 237, 0.72)', lineHeight: 1.6 }}>
                      {feature.description}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside className="sv-cart-panel sv-glass">
            <div className="sv-order-card">
              <div style={{ fontSize: '12px', opacity: 0.68, fontWeight: 800, letterSpacing: '0.08em' }}>
                PEDIDO EN PREPARACION
              </div>
              <div className="sv-headline" style={{ fontSize: '52px', lineHeight: 0.9, marginTop: '8px' }}>
                #{estimatedOrder}
              </div>
              <div style={{ marginTop: '12px', color: 'rgba(255, 247, 237, 0.78)', lineHeight: 1.6 }}>
                Se confirma al guardar. El numero sale del mismo contador que usan los pedidos manuales.
              </div>
            </div>

            {!hasAvailability && (
              <div
                style={{
                  marginBottom: '18px',
                  padding: '14px 16px',
                  borderRadius: '18px',
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.36)',
                  color: '#fecaca',
                  lineHeight: 1.55,
                }}
              >
                Hoy ya se alcanzo el limite de {ORDER_LIMIT_PER_DAY} pedidos. La tienda queda visible pero el
                envio se bloquea hasta el siguiente dia.
              </div>
            )}

            <div className="sv-cart-tags">
              <span className="sv-filter-btn is-active">{cartItems.length} productos</span>
              <span className="sv-filter-btn">{formatWeight(totalWeight)} lb</span>
              <span className="sv-filter-btn">{formatCurrency(totalAmount)}</span>
            </div>

            <div className="sv-cart-list">
              {cartItems.length === 0 ? (
                <div className="sv-empty">
                  Agrega tus cortes favoritos y aqui mismo preparamos el resumen para enviarlo a cocina.
                </div>
              ) : (
                cartItems.map((item) => (
                  <div key={item.codigo} className="sv-cart-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '12px', opacity: 0.62, fontWeight: 800 }}>COD {item.codigo}</div>
                        <div style={{ marginTop: '4px', fontSize: '16px', fontWeight: 800 }}>{item.nombre}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', opacity: 0.62, fontWeight: 800 }}>SUBTOTAL</div>
                        <div style={{ marginTop: '4px', fontSize: '16px', fontWeight: 900 }}>
                          {formatCurrency(item.subtotal)}
                        </div>
                      </div>
                    </div>
                    <div style={{ color: 'rgba(255, 247, 237, 0.7)', lineHeight: 1.55 }}>
                      {formatWeight(item.cantidad)} {item.unidad} x {formatCurrency(item.precioUnitario)}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="sv-cart-summary">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ opacity: 0.72 }}>Peso total</span>
                <strong>{formatWeight(totalWeight)} lb</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ opacity: 0.72 }}>Total estimado</span>
                <strong>{formatCurrency(totalAmount)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ opacity: 0.72 }}>Cupos disponibles</span>
                <strong>{remainingOrders}</strong>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="sv-form-grid">
              <div>
                <div style={{ fontSize: '12px', opacity: 0.62, fontWeight: 800, letterSpacing: '0.08em' }}>
                  DATOS DEL CLIENTE
                </div>
              </div>

              <input
                className="sv-field"
                type="text"
                placeholder="Nombre completo"
                value={customer.nombre}
                onChange={(event) => handleCustomerChange('nombre', event.target.value)}
              />

              <input
                className="sv-field"
                type="tel"
                placeholder="Telefono o WhatsApp"
                value={customer.telefono}
                onChange={(event) => handleCustomerChange('telefono', event.target.value)}
              />

              <input
                className="sv-field"
                type="text"
                placeholder="Direccion de entrega"
                value={customer.direccion}
                onChange={(event) => handleCustomerChange('direccion', event.target.value)}
              />

              <input
                className="sv-field"
                type="text"
                placeholder="Referencia adicional"
                value={customer.referencia}
                onChange={(event) => handleCustomerChange('referencia', event.target.value)}
              />

              <div>
                <div style={{ fontSize: '12px', opacity: 0.62, fontWeight: 800, letterSpacing: '0.08em', marginBottom: '10px' }}>
                  METODO DE PAGO
                </div>
                <div className="sv-payment-grid">
                  {STORE_PAYMENT_OPTIONS.map((paymentOption) => (
                    <button
                      key={paymentOption}
                      type="button"
                      className={`sv-pay-btn ${customer.metodoPago === paymentOption ? 'is-active' : ''}`}
                      onClick={() => handleCustomerChange('metodoPago', paymentOption)}
                    >
                      {paymentOption}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                className="sv-textarea"
                placeholder="Observaciones para cocina o entrega"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />

              <button
                type="submit"
                className="sv-button"
                disabled={submitting || !hasAvailability}
                style={{
                  opacity: submitting || !hasAvailability ? 0.66 : 1,
                  cursor: submitting || !hasAvailability ? 'not-allowed' : 'pointer',
                }}
              >
                {submitting
                  ? 'Enviando pedido a cocina...'
                  : hasAvailability
                    ? `Enviar pedido #${estimatedOrder}`
                    : 'Cupos agotados por hoy'}
              </button>

              <div style={{ color: 'rgba(255, 247, 237, 0.62)', lineHeight: 1.6, fontSize: '13px' }}>
                El cliente compra aqui y el pedido se registra en el mismo flujo del delivery. Esta prueba ya
                deja los codigos, cantidades y canal listos para crecer hacia SICAR.
              </div>
            </form>
          </aside>
        </div>
      </div>
    </div>
  );
}
