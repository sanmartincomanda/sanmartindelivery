import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import { database } from '../firebase';
import logo from '../logo.svg';
import {
  buildGoogleMapsAddressUrl,
  buildGoogleMapsPlaceUrl,
  buildGoogleMapsRouteUrl,
  getBrowserLocation,
  hasLocation,
  optimizeStopsByNearest,
} from '../services/geo';
import { DRIVERS_PATH, loginDriver, mergeDrivers } from '../services/drivers';
import { formatOrderNumber } from '../services/orders';

const DRIVER_SESSION_KEY = 'sanmartin_driver_session';

const Icons = {
  route: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 18c0-2.2 1.8-4 4-4h4a4 4 0 100-8h-1" />
      <path d="M7 6l-4 4 4 4" />
      <path d="M17 18l4-4-4-4" />
    </svg>
  ),
  map: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 1118 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.8 19.8 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.18 2 2 0 014.1 2h3a2 2 0 012 1.72l.38 3.05a2 2 0 01-.57 1.72l-1.3 1.3a16 16 0 006.74 6.74l1.3-1.3a2 2 0 011.72-.57l3.05.38A2 2 0 0122 16.92z" />
    </svg>
  ),
  package: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
      <path d="M3.3 7L12 12l8.7-5" />
      <path d="M12 22V12" />
    </svg>
  ),
  receipt: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h12v20l-3-2-3 2-3-2-3 2V2z" />
      <path d="M9 7h6M9 11h6M9 15h4" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </svg>
  ),
};

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const formatTimeLabel = () =>
  new Date().toLocaleTimeString('es-NI', {
    hour: '2-digit',
    minute: '2-digit',
  });

const getWrittenAddress = (order) => {
  const address = String(order?.direccion || order?.address || '').trim();
  return address && address !== '-' ? address : '';
};

const isDeliveredOrder = (order) => order?.estado === 'Entregado';

const cleanPhone = (phone) => String(phone || '').replace(/\D/g, '');

const buildCustomerWhatsappPhone = (phone) => {
  const cleaned = cleanPhone(phone);
  if (!cleaned) {
    return '';
  }

  if (cleaned.startsWith('505') && cleaned.length >= 11) {
    return cleaned;
  }

  return `505${cleaned.slice(-8)}`;
};

const buildDriverCustomerMessage = (order = {}) =>
  [
    `Hola ${order.cliente || ''}.`.trim(),
    `Soy tu entregador de Carnes San Martin Granada del pedido #${formatOrderNumber(order.id)}.`,
    'Te escribo para coordinar la entrega.',
  ].join('\n');

const buildCustomerWhatsappLink = (order = {}) => {
  const phone = buildCustomerWhatsappPhone(order.telefono);
  if (!phone) {
    return '';
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(buildDriverCustomerMessage(order))}`;
};

const getOrderNavigationUrl = (order = {}) => {
  if (hasLocation(order.ubicacion)) {
    return buildGoogleMapsPlaceUrl(order.ubicacion);
  }

  return buildGoogleMapsAddressUrl(getWrittenAddress(order));
};

const getStatusMeta = (order = {}) => {
  if (isDeliveredOrder(order)) {
    return {
      label: 'Entregado',
      tone: 'delivered',
      accent: '#16a34a',
      message: order.timestampEntregado ? `Entregado ${order.timestampEntregado}` : 'Pedido entregado',
      progress: 3,
    };
  }

  if (order.estado === 'Enviado') {
    return {
      label: 'En camino',
      tone: 'route',
      accent: '#2563eb',
      message: 'Listo para entregar',
      progress: 2,
    };
  }

  return {
    label: order.estado || 'Asignado',
    tone: 'pending',
    accent: '#f97316',
    message: 'Pendiente de salida',
    progress: 1,
  };
};

export default function DriverView({ orders = [] }) {
  const [drivers, setDrivers] = useState(() => mergeDrivers());
  const [driver, setDriver] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return JSON.parse(window.localStorage.getItem(DRIVER_SESSION_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [loginForm, setLoginForm] = useState({ code: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [routeOrders, setRouteOrders] = useState([]);
  const [optimizing, setOptimizing] = useState(false);
  const [deliveringOrderKey, setDeliveringOrderKey] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState(null);
  const [routeFilter, setRouteFilter] = useState('activos');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const unsubscribe = onValue(ref(database, DRIVERS_PATH), (snapshot) => {
      setDrivers(mergeDrivers(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  const assignedOrders = useMemo(() => {
    if (!driver) {
      return [];
    }

    const driverName = normalizeName(driver.name);
    return orders
      .filter((order) => {
        if (order.estado === 'Cancelado') {
          return false;
        }

        return order.repartidorCodigo === driver.code || normalizeName(order.repartidor) === driverName;
      })
      .sort((left, right) => {
        const deliveredDiff = Number(isDeliveredOrder(left)) - Number(isDeliveredOrder(right));
        if (deliveredDiff !== 0) {
          return deliveredDiff;
        }

        return Number(left.timestamp || 0) - Number(right.timestamp || 0);
      });
  }, [driver, orders]);

  useEffect(() => {
    setRouteOrders(assignedOrders);
  }, [assignedOrders]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');

    try {
      const loggedDriver = await loginDriver(loginForm, drivers);
      setDriver(loggedDriver);
      window.localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(loggedDriver));
      setLoginForm({ code: '', password: '' });
    } catch (error) {
      console.error('Error iniciando sesion driver:', error);
      setLoginError('Codigo o contrasena incorrecta.');
    }
  };

  const logout = () => {
    setDriver(null);
    window.localStorage.removeItem(DRIVER_SESSION_KEY);
  };

  const optimizeRoute = async () => {
    const activeAssignedOrders = assignedOrders.filter((order) => !isDeliveredOrder(order));
    const locatedOrders = activeAssignedOrders.filter((order) => hasLocation(order.ubicacion));
    if (locatedOrders.length === 0) {
      alert('No hay pedidos con ubicacion para optimizar.');
      return;
    }

    setOptimizing(true);
    try {
      let origin = null;
      try {
        origin = await getBrowserLocation();
      } catch {
        origin = null;
      }

      const optimized = optimizeStopsByNearest(activeAssignedOrders, origin);
      const deliveredOrders = assignedOrders.filter((order) => isDeliveredOrder(order));
      setRouteOrders([...optimized, ...deliveredOrders]);
      const routeUrl = buildGoogleMapsRouteUrl(optimized, origin);
      if (routeUrl) {
        window.open(routeUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setOptimizing(false);
    }
  };

  const markOrderDelivered = async (order) => {
    if (!order?.firebaseKey) {
      alert('No se pudo identificar este pedido.');
      return;
    }

    const now = formatTimeLabel();
    setDeliveringOrderKey(order.firebaseKey);

    try {
      await update(ref(database, `orders/${order.firebaseKey}`), {
        estado: 'Entregado',
        timestampEntregado: now,
        entregadoPor: driver.name,
        entregadoPorCodigo: driver.code,
        timestamp: Date.now(),
      });
      setConfirmDeliveryOrder(null);
      setSelectedOrder(null);
      setNotice(`Pedido #${formatOrderNumber(order.id)} marcado como entregado.`);
    } catch (error) {
      console.error('Error marcando pedido entregado:', error);
      alert('No se pudo marcar el pedido como entregado. Intenta de nuevo.');
    } finally {
      setDeliveringOrderKey('');
    }
  };

  if (!driver) {
    return (
      <div className="driver-login-page">
        <style>{driverStyles}</style>
        <form className="driver-login-card" onSubmit={handleLogin}>
          <img src={logo} alt="Carnes San Martin" />
          <h1>Driver</h1>
          <p>Ingresa con tu codigo de entregador.</p>
          {loginError && <div className="driver-error">{loginError}</div>}
          <input
            value={loginForm.code}
            onChange={(event) => setLoginForm((current) => ({ ...current, code: event.target.value }))}
            placeholder="Codigo. Ej: E-001"
            autoCapitalize="characters"
          />
          <input
            type="password"
            value={loginForm.password}
            onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="Contrasena"
          />
          <button type="submit">Entrar</button>
          <small>Clave inicial de entregadores base: su mismo codigo.</small>
        </form>
      </div>
    );
  }

  const activeRouteOrders = routeOrders.filter((order) => !isDeliveredOrder(order));
  const ordersWithLocation = activeRouteOrders.filter((order) => hasLocation(order.ubicacion));
  const deliveredCount = assignedOrders.filter((order) => isDeliveredOrder(order)).length;
  const enCaminoCount = assignedOrders.filter((order) => order.estado === 'Enviado').length;
  const nextOrder = activeRouteOrders[0] || null;
  const visibleRouteOrders = routeOrders.filter((order) => {
    if (routeFilter === 'todos') return true;
    if (routeFilter === 'entregados') return isDeliveredOrder(order);
    if (routeFilter === 'en_camino') return order.estado === 'Enviado';
    return !isDeliveredOrder(order);
  });
  const routeFilters = [
    { key: 'activos', label: 'Ruta activa', count: activeRouteOrders.length },
    { key: 'en_camino', label: 'En camino', count: enCaminoCount },
    { key: 'entregados', label: 'Entregados', count: deliveredCount },
    { key: 'todos', label: 'Todos', count: assignedOrders.length },
  ];

  const openOrderMap = (order) => {
    const navigationUrl = getOrderNavigationUrl(order);
    if (!navigationUrl) {
      alert('Este pedido no tiene ubicacion ni direccion para abrir mapa.');
      return;
    }

    window.open(navigationUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="driver-shell">
      <style>{driverStyles}</style>
      {notice && (
        <div className="driver-toast">
          {Icons.check}
          <span>{notice}</span>
        </div>
      )}

      <section className="driver-hero">
        <div className="driver-hero-copy">
          <span className="driver-kicker">Driver app</span>
          <h1>Ruta de {driver.name}</h1>
          <p>{driver.code} | {activeRouteOrders.length} pedidos pendientes para entregar</p>
          <div className="driver-hero-actions">
            <button type="button" className="driver-primary-action" onClick={optimizeRoute} disabled={optimizing || ordersWithLocation.length === 0}>
              {Icons.route}
              {optimizing ? 'Optimizando...' : 'Optimizar ruta'}
            </button>
            <button type="button" className="driver-ghost-action" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
        <DriverHeroVector />
      </section>

      <section className="driver-summary">
        <DriverStatCard label="Pendientes" value={activeRouteOrders.length} tone="wine" />
        <DriverStatCard label="Con mapa" value={ordersWithLocation.length} tone="blue" />
        <DriverStatCard label="En camino" value={enCaminoCount} tone="orange" />
        <DriverStatCard label="Entregados" value={deliveredCount} tone="green" />
      </section>

      {nextOrder && (
        <button type="button" className="driver-next-card" onClick={() => setSelectedOrder(nextOrder)}>
          <span className="driver-next-icon">{Icons.spark}</span>
          <span>
            <small>Siguiente entrega</small>
            <strong>#{formatOrderNumber(nextOrder.id)} {nextOrder.cliente}</strong>
            <em>{getWrittenAddress(nextOrder) || 'Sin direccion escrita'}</em>
          </span>
          <b>{formatCurrency(nextOrder.total)}</b>
        </button>
      )}

      <nav className="driver-filter-row" aria-label="Filtros de ruta">
        {routeFilters.map((filter) => (
          <button
            key={filter.key}
            type="button"
            className={routeFilter === filter.key ? 'active' : ''}
            onClick={() => setRouteFilter(filter.key)}
          >
            {filter.label}
            <span>{filter.count}</span>
          </button>
        ))}
      </nav>

      {visibleRouteOrders.length === 0 ? (
        <div className="driver-empty">
          <DriverEmptyVector />
          <strong>No hay pedidos en esta vista.</strong>
          <span>Cuando administracion asigne pedidos, apareceran aqui listos para ruta.</span>
        </div>
      ) : (
        <main className="driver-grid">
          {visibleRouteOrders.map((order, index) => (
            <DriverOrderCard
              key={order.firebaseKey || order.id}
              order={order}
              index={index}
              delivering={deliveringOrderKey === order.firebaseKey}
              onOpenDetails={setSelectedOrder}
              onOpenMap={openOrderMap}
              onRequestDelivered={setConfirmDeliveryOrder}
            />
          ))}
        </main>
      )}

      {selectedOrder && (
        <DriverDetailModal
          order={selectedOrder}
          delivering={deliveringOrderKey === selectedOrder.firebaseKey}
          onClose={() => setSelectedOrder(null)}
          onOpenMap={openOrderMap}
          onRequestDelivered={setConfirmDeliveryOrder}
        />
      )}

      {confirmDeliveryOrder && (
        <DeliveryConfirmModal
          order={confirmDeliveryOrder}
          delivering={deliveringOrderKey === confirmDeliveryOrder.firebaseKey}
          onCancel={() => setConfirmDeliveryOrder(null)}
          onConfirm={() => markOrderDelivered(confirmDeliveryOrder)}
        />
      )}
    </div>
  );
}

function DriverStatCard({ label, value, tone }) {
  return (
    <div className={`driver-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DriverProgress({ progress }) {
  const steps = ['Listo', 'Ruta', 'Entregado'];

  return (
    <div className="driver-progress">
      {steps.map((step, index) => (
        <span key={step} className={progress >= index + 1 ? 'done' : ''}>
          {step}
        </span>
      ))}
    </div>
  );
}

function DriverOrderCard({ order, index, delivering, onOpenDetails, onOpenMap, onRequestDelivered }) {
  const status = getStatusMeta(order);
  const delivered = isDeliveredOrder(order);
  const address = getWrittenAddress(order);
  const navigationUrl = getOrderNavigationUrl(order);
  const whatsappLink = buildCustomerWhatsappLink(order);

  return (
    <article className={`driver-order-card ${status.tone}`}>
      <button type="button" className="driver-order-main" onClick={() => onOpenDetails(order)}>
        <span className="driver-route-badge">{String(index + 1).padStart(2, '0')}</span>
        <span className="driver-card-vector">{delivered ? Icons.check : Icons.package}</span>
        <span className="driver-order-info">
          <small>Pedido #{formatOrderNumber(order.id)}</small>
          <strong>{order.cliente}</strong>
          <em>{address || 'Sin direccion escrita'}</em>
        </span>
        <span className="driver-status-pill" style={{ color: status.accent }}>
          {status.label}
        </span>
      </button>

      <DriverProgress progress={status.progress} />

      <div className="driver-card-meta">
        <span>{order.telefono || 'Sin telefono'}</span>
        <b>{formatCurrency(order.total)}</b>
      </div>

      <div className="driver-card-actions">
        <button type="button" onClick={() => onOpenMap(order)} disabled={!navigationUrl}>
          {Icons.map}
          Mapa
        </button>
        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noreferrer">
            {Icons.phone}
            Cliente
          </a>
        )}
        {delivered ? (
          <span className="driver-done-chip">Entregado {order.timestampEntregado || ''}</span>
        ) : (
          <button type="button" className="driver-deliver-action" onClick={() => onRequestDelivered(order)} disabled={delivering}>
            {Icons.check}
            {delivering ? 'Guardando...' : 'Entregado'}
          </button>
        )}
      </div>
    </article>
  );
}

function DriverDetailModal({ order, delivering, onClose, onOpenMap, onRequestDelivered }) {
  const status = getStatusMeta(order);
  const delivered = isDeliveredOrder(order);
  const address = getWrittenAddress(order);
  const navigationUrl = getOrderNavigationUrl(order);
  const whatsappLink = buildCustomerWhatsappLink(order);

  return (
    <div
      className="driver-modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section className="driver-detail-modal">
        <header className="driver-detail-head">
          <div>
            <span>Pedido #{formatOrderNumber(order.id)}</span>
            <h2>{order.cliente}</h2>
            <p>{status.message}</p>
          </div>
          <button type="button" className="driver-close-button" onClick={onClose}>
            {Icons.close}
          </button>
        </header>

        <DriverProgress progress={status.progress} />

        <div className="driver-detail-grid">
          <div>
            <span>Telefono</span>
            <strong>{order.telefono || 'Sin telefono'}</strong>
          </div>
          <div>
            <span>Total</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
          <div>
            <span>Asignado</span>
            <strong>{order.timestampAsignado || order.timestampEnviado || '-'}</strong>
          </div>
          <div>
            <span>Estado</span>
            <strong>{order.estado || 'Asignado'}</strong>
          </div>
        </div>

        <div className={`driver-detail-address ${hasLocation(order.ubicacion) ? '' : 'fallback'}`}>
          <span>{hasLocation(order.ubicacion) ? 'Punto de mapa guardado' : 'Direccion escrita del cliente'}</span>
          <strong>{address || 'Sin direccion escrita'}</strong>
          {!hasLocation(order.ubicacion) && address && (
            <p>Este pedido no tiene punto de mapa. Usa la direccion escrita como referencia.</p>
          )}
        </div>

        <div className="driver-detail-items">
          <span>Detalle del pedido</span>
          {Array.isArray(order.items) && order.items.length > 0 ? (
            <div className="driver-items-list">
              {order.items.map((item) => (
                <div key={`${item.codigo || item.nombre}-${item.cantidad}`}>
                  <strong>{item.nombre}</strong>
                  <small>{item.cantidad} {item.unidad || ''} | {formatCurrency(item.subtotal)}</small>
                </div>
              ))}
            </div>
          ) : (
            <pre>{order.pedido || 'Sin detalle'}</pre>
          )}
        </div>

        <footer className="driver-detail-actions">
          <button type="button" onClick={() => onOpenMap(order)} disabled={!navigationUrl}>
            {Icons.map}
            Abrir mapa
          </button>
          {whatsappLink && (
            <a href={whatsappLink} target="_blank" rel="noreferrer">
              {Icons.phone}
              WhatsApp cliente
            </a>
          )}
          {!delivered && (
            <button type="button" className="driver-deliver-action" onClick={() => onRequestDelivered(order)} disabled={delivering}>
              {Icons.check}
              {delivering ? 'Guardando...' : 'Marcar entregado'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

function DeliveryConfirmModal({ order, delivering, onCancel, onConfirm }) {
  return (
    <div className="driver-modal-overlay">
      <section className="driver-confirm-modal">
        <span className="driver-confirm-icon">{Icons.check}</span>
        <h2>Confirmar entrega</h2>
        <p>Vas a marcar el pedido #{formatOrderNumber(order.id)} de {order.cliente} como entregado.</p>
        <div className="driver-confirm-actions">
          <button type="button" className="driver-ghost-action dark" onClick={onCancel} disabled={delivering}>
            Cancelar
          </button>
          <button type="button" className="driver-primary-action green" onClick={onConfirm} disabled={delivering}>
            {delivering ? 'Guardando...' : 'Si, entregado'}
          </button>
        </div>
      </section>
    </div>
  );
}

function DriverHeroVector() {
  return (
    <div className="driver-hero-vector" aria-hidden="true">
      <svg viewBox="0 0 360 260" fill="none">
        <path d="M42 170C50 93 106 43 189 48c77 5 126 55 126 123 0 34-14 57-40 57H76c-23 0-37-22-34-58z" fill="rgba(255,255,255,0.16)" />
        <path d="M82 176h115l29-62h-82c-31 0-54 20-62 62z" fill="#fff7ed" />
        <path d="M205 176h51c7 0 12-6 11-13l-10-49h-31l-21 62z" fill="#fed7aa" />
        <path d="M142 114h116l-12-28H163l-21 28z" fill="#7b1022" />
        <circle cx="118" cy="190" r="29" fill="#111827" />
        <circle cx="118" cy="190" r="12" fill="#f8fafc" />
        <circle cx="255" cy="190" r="29" fill="#111827" />
        <circle cx="255" cy="190" r="12" fill="#f8fafc" />
        <path d="M66 152h49M50 176h34M274 90l26-19 14 23M286 73l9 33" stroke="#fff7ed" strokeWidth="10" strokeLinecap="round" />
        <path d="M91 67l13-28 22 18M286 45l25-16M303 57l29-2" stroke="rgba(255,255,255,0.55)" strokeWidth="7" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function DriverEmptyVector() {
  return (
    <svg className="driver-empty-vector" viewBox="0 0 180 130" fill="none" aria-hidden="true">
      <rect x="36" y="35" width="100" height="58" rx="18" fill="#fff7ed" />
      <path d="M56 51h61M56 67h44" stroke="#7b1022" strokeWidth="8" strokeLinecap="round" />
      <path d="M132 78l24-16" stroke="#f97316" strokeWidth="8" strokeLinecap="round" />
      <circle cx="58" cy="97" r="13" fill="#111827" />
      <circle cx="126" cy="97" r="13" fill="#111827" />
      <path d="M22 31l18-18M144 24l23-8M149 42h22" stroke="#fecaca" strokeWidth="7" strokeLinecap="round" />
    </svg>
  );
}

const driverStyles = `
  .driver-login-page,
  .driver-shell {
    min-height: 100vh;
    box-sizing: border-box;
    font-family: 'Trebuchet MS', 'Segoe UI', sans-serif;
  }
  .driver-login-page {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background:
      radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.14), transparent 24%),
      linear-gradient(135deg, #3b0b16, #7b1022 52%, #a33a36);
  }
  .driver-login-card {
    width: min(420px, 100%);
    display: grid;
    gap: 12px;
    padding: 30px;
    border-radius: 22px;
    background: #ffffff;
    box-shadow: 0 28px 80px rgba(38, 6, 12, 0.28);
  }
  .driver-login-card img {
    width: 68px;
    height: 68px;
    margin: 0 auto;
  }
  .driver-login-card h1 {
    margin: 0;
    text-align: center;
    font-size: 30px;
  }
  .driver-login-card p,
  .driver-login-card small {
    margin: 0;
    text-align: center;
    color: #64748b;
    font-weight: 800;
  }
  .driver-login-card input {
    min-height: 46px;
    border: 1px solid #dbe3ef;
    border-radius: 12px;
    padding: 0 14px;
    font: inherit;
    font-weight: 800;
  }
  .driver-login-card button,
  .driver-header-actions button,
  .driver-actions a,
  .driver-actions button {
    min-height: 44px;
    border: 0;
    border-radius: 999px;
    padding: 0 18px;
    background: #7b1022;
    color: #fff;
    font: inherit;
    font-weight: 900;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .driver-error {
    border-radius: 12px;
    padding: 10px 12px;
    background: #fee2e2;
    color: #991b1b;
    font-weight: 900;
    text-align: center;
  }
  .driver-shell {
    padding: 20px;
    background: #f8fafc;
    color: #111827;
  }
  .driver-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    border-radius: 24px;
    padding: 22px;
    color: #fff;
    background: linear-gradient(135deg, #3b0b16, #7b1022);
    box-shadow: 0 20px 50px rgba(123, 16, 34, 0.18);
  }
  .driver-header span {
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
    opacity: 0.78;
  }
  .driver-header h1 {
    margin: 4px 0;
    font-size: clamp(30px, 6vw, 52px);
    line-height: 0.95;
  }
  .driver-header p {
    margin: 0;
    font-weight: 800;
    opacity: 0.86;
  }
  .driver-header-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .driver-header-actions button.secondary {
    background: rgba(255, 255, 255, 0.16);
  }
  .driver-header-actions button:disabled,
  .driver-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .driver-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0;
  }
  .driver-summary div,
  .driver-empty,
  .driver-order {
    border: 1px solid #e5e7eb;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 14px 35px rgba(15, 23, 42, 0.06);
  }
  .driver-summary div {
    padding: 16px;
  }
  .driver-summary strong {
    display: block;
    font-size: 28px;
    color: #7b1022;
  }
  .driver-summary span,
  .driver-meta,
  .driver-order-top span,
  .driver-empty span {
    color: #64748b;
    font-size: 13px;
    font-weight: 800;
  }
  .driver-empty {
    display: grid;
    gap: 6px;
    padding: 32px;
    text-align: center;
  }
  .driver-list {
    display: grid;
    gap: 14px;
  }
  .driver-order {
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    overflow: hidden;
  }
  .driver-order.delivered {
    border-color: #bbf7d0;
    background: #f0fdf4;
  }
  .driver-order.delivered .driver-order-number {
    background: #dcfce7;
    color: #15803d;
  }
  .driver-order.delivered .driver-status {
    background: #dcfce7;
    color: #15803d;
  }
  .driver-order-number {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff7f4;
    color: #7b1022;
    font-size: 22px;
    font-weight: 950;
  }
  .driver-order-body {
    min-width: 0;
    padding: 16px;
  }
  .driver-order-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .driver-order-top strong {
    display: block;
    font-size: 18px;
  }
  .driver-order p {
    margin: 10px 0;
    color: #374151;
    font-weight: 800;
    line-height: 1.4;
  }
  .driver-address {
    margin: 12px 0;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 12px;
    background: #f8fafc;
  }
  .driver-address.fallback {
    border-color: #fed7aa;
    background: #fff7ed;
  }
  .driver-address span {
    display: block;
    margin-bottom: 4px;
    color: #7b1022;
    font-size: 11px;
    font-weight: 950;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .driver-address p {
    margin: 0;
  }
  .driver-address small {
    display: block;
    margin-top: 6px;
    color: #9a3412;
    font-weight: 900;
  }
  .driver-status {
    border-radius: 999px;
    padding: 7px 10px;
    background: #eff6ff;
    color: #2563eb;
    font-size: 12px;
    font-weight: 950;
    white-space: nowrap;
  }
  .driver-meta {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .driver-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 12px;
  }
  .driver-actions details {
    flex: 1;
    min-width: 180px;
  }
  .driver-actions a.address-search {
    background: #f97316;
  }
  .driver-actions button.deliver-button {
    background: #16a34a;
  }
  .driver-delivered-badge {
    min-height: 44px;
    border-radius: 999px;
    padding: 0 18px;
    background: #dcfce7;
    color: #15803d;
    font-weight: 950;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .driver-actions summary {
    cursor: pointer;
    color: #7b1022;
    font-weight: 950;
  }
  .driver-actions pre {
    white-space: pre-wrap;
    margin: 10px 0 0;
    padding: 12px;
    border-radius: 12px;
    background: #f8fafc;
    color: #374151;
    font: inherit;
    font-size: 13px;
  }
  @keyframes driverFloatIn {
    from { opacity: 0; transform: translateY(18px) scale(0.98); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes driverToastIn {
    from { opacity: 0; transform: translate(-50%, -12px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }
  @keyframes driverPulse {
    0%, 100% { transform: scale(1); opacity: 0.72; }
    50% { transform: scale(1.06); opacity: 1; }
  }
  .driver-shell {
    position: relative;
    isolation: isolate;
    min-height: 100vh;
    padding: 22px;
    overflow-x: hidden;
    background:
      radial-gradient(circle at 16% 8%, rgba(123, 16, 34, 0.13), transparent 28%),
      radial-gradient(circle at 84% 16%, rgba(249, 115, 22, 0.13), transparent 28%),
      linear-gradient(145deg, #fffaf7 0%, #f8fafc 48%, #fff1f2 100%);
    color: #111827;
  }
  .driver-shell::before,
  .driver-shell::after {
    content: '';
    position: fixed;
    inset: auto auto 8% -80px;
    width: 280px;
    height: 280px;
    border: 30px solid rgba(123, 16, 34, 0.055);
    border-radius: 999px;
    pointer-events: none;
    z-index: -1;
  }
  .driver-shell::after {
    inset: 8% -90px auto auto;
    border-color: rgba(249, 115, 22, 0.07);
  }
  .driver-toast {
    position: fixed;
    top: 16px;
    left: 50%;
    z-index: 3000;
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 0 18px;
    border-radius: 999px;
    background: #111827;
    color: white;
    font-weight: 950;
    box-shadow: 0 18px 45px rgba(17, 24, 39, 0.22);
    animation: driverToastIn 0.22s ease-out both;
  }
  .driver-toast svg,
  .driver-primary-action svg,
  .driver-card-actions svg,
  .driver-detail-actions svg,
  .driver-close-button svg,
  .driver-next-icon svg {
    width: 18px;
    height: 18px;
  }
  .driver-hero {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(260px, 0.75fr);
    gap: 18px;
    align-items: center;
    min-height: 260px;
    border-radius: 34px;
    padding: 26px;
    overflow: hidden;
    color: #fffaf5;
    background:
      linear-gradient(135deg, rgba(59, 11, 22, 0.96), rgba(123, 16, 34, 0.92) 54%, rgba(193, 54, 48, 0.88)),
      radial-gradient(circle at 80% 18%, rgba(255, 255, 255, 0.18), transparent 26%);
    box-shadow: 0 28px 70px rgba(123, 16, 34, 0.22);
    animation: driverFloatIn 0.38s ease-out both;
  }
  .driver-hero::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.3;
    background-image:
      linear-gradient(115deg, transparent 0 42%, rgba(255,255,255,0.18) 42% 44%, transparent 44% 100%),
      radial-gradient(circle at 18% 74%, rgba(255,255,255,0.18) 0 2px, transparent 3px);
    background-size: 150px 150px, 28px 28px;
    pointer-events: none;
  }
  .driver-hero-copy {
    position: relative;
    z-index: 1;
  }
  .driver-kicker {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    border-radius: 999px;
    padding: 0 12px;
    background: rgba(255, 255, 255, 0.14);
    color: #fff7ed;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .driver-hero h1 {
    max-width: 680px;
    margin: 12px 0 8px;
    font-size: clamp(38px, 7vw, 76px);
    line-height: 0.88;
    letter-spacing: -0.055em;
  }
  .driver-hero p {
    margin: 0;
    color: rgba(255, 250, 245, 0.82);
    font-weight: 900;
  }
  .driver-hero-actions,
  .driver-confirm-actions,
  .driver-detail-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 18px;
  }
  .driver-primary-action,
  .driver-ghost-action,
  .driver-card-actions button,
  .driver-card-actions a,
  .driver-detail-actions button,
  .driver-detail-actions a {
    min-height: 46px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 999px;
    padding: 0 18px;
    font: inherit;
    font-size: 13px;
    font-weight: 950;
    text-decoration: none;
    cursor: pointer;
    transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
  }
  .driver-primary-action {
    background: #fffaf5;
    color: #7b1022;
    box-shadow: 0 18px 35px rgba(17, 24, 39, 0.18);
  }
  .driver-primary-action.green {
    background: #16a34a;
    color: #ffffff;
  }
  .driver-ghost-action {
    background: rgba(255, 255, 255, 0.14);
    color: #fffaf5;
  }
  .driver-ghost-action.dark {
    background: #f3f4f6;
    color: #374151;
  }
  .driver-primary-action:hover,
  .driver-ghost-action:hover,
  .driver-card-actions button:hover,
  .driver-card-actions a:hover,
  .driver-detail-actions button:hover,
  .driver-detail-actions a:hover {
    transform: translateY(-2px);
  }
  .driver-primary-action:disabled,
  .driver-card-actions button:disabled,
  .driver-detail-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
  .driver-hero-vector {
    position: relative;
    z-index: 1;
    min-height: 210px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .driver-hero-vector svg {
    width: min(360px, 100%);
    filter: drop-shadow(0 28px 24px rgba(17, 24, 39, 0.2));
  }
  .driver-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0;
  }
  .driver-stat {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(234, 216, 218, 0.9);
    border-radius: 24px;
    padding: 18px;
    background: rgba(255, 255, 255, 0.82);
    box-shadow: 0 18px 45px rgba(17, 24, 39, 0.07);
    animation: driverFloatIn 0.42s ease-out both;
  }
  .driver-stat::after {
    content: '';
    position: absolute;
    right: -18px;
    bottom: -30px;
    width: 90px;
    height: 90px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.08;
  }
  .driver-stat span {
    display: block;
    color: #6b7280;
    font-size: 12px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .driver-stat strong {
    display: block;
    margin-top: 6px;
    color: #111827;
    font-size: 34px;
    line-height: 1;
  }
  .driver-stat.wine { color: #7b1022; }
  .driver-stat.blue { color: #2563eb; }
  .driver-stat.orange { color: #f97316; }
  .driver-stat.green { color: #16a34a; }
  .driver-next-card {
    width: 100%;
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: center;
    border: 1px solid #fed7aa;
    border-radius: 26px;
    padding: 14px;
    background: linear-gradient(135deg, #fff7ed, #ffffff);
    color: #111827;
    box-shadow: 0 18px 45px rgba(249, 115, 22, 0.12);
    cursor: pointer;
    text-align: left;
    animation: driverFloatIn 0.5s ease-out both;
  }
  .driver-next-icon {
    width: 54px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    background: #7b1022;
    color: #fffaf5;
    animation: driverPulse 2.4s ease-in-out infinite;
  }
  .driver-next-card small,
  .driver-order-info small,
  .driver-detail-grid span,
  .driver-detail-address span,
  .driver-detail-items > span {
    display: block;
    color: #9f1239;
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .driver-next-card strong,
  .driver-order-info strong {
    display: block;
    color: #111827;
    font-size: 18px;
    font-weight: 950;
  }
  .driver-next-card em,
  .driver-order-info em {
    display: block;
    overflow: hidden;
    color: #6b7280;
    font-size: 13px;
    font-style: normal;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .driver-next-card b {
    color: #7b1022;
    font-size: 16px;
  }
  .driver-filter-row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 16px 2px 12px;
    scrollbar-width: none;
  }
  .driver-filter-row::-webkit-scrollbar {
    display: none;
  }
  .driver-filter-row button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    border: 1px solid #ead8da;
    border-radius: 999px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.82);
    color: #374151;
    font: inherit;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
    cursor: pointer;
  }
  .driver-filter-row button.active {
    border-color: #7b1022;
    background: #111827;
    color: #fffaf5;
  }
  .driver-filter-row span {
    min-width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(123, 16, 34, 0.1);
    font-size: 12px;
  }
  .driver-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(310px, 1fr));
    gap: 16px;
  }
  .driver-order-card {
    position: relative;
    display: grid;
    gap: 12px;
    border: 1px solid #ead8da;
    border-radius: 30px;
    padding: 14px;
    overflow: hidden;
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 22px 55px rgba(17, 24, 39, 0.08);
    animation: driverFloatIn 0.42s ease-out both;
  }
  .driver-order-card::after {
    content: '';
    position: absolute;
    right: -44px;
    top: -44px;
    width: 140px;
    height: 140px;
    border-radius: 999px;
    background: #7b1022;
    opacity: 0.06;
    pointer-events: none;
  }
  .driver-order-card.route::after { background: #2563eb; }
  .driver-order-card.pending::after { background: #f97316; }
  .driver-order-card.delivered {
    border-color: #bbf7d0;
    background: linear-gradient(145deg, #f0fdf4, #ffffff);
  }
  .driver-order-main {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 42px 54px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    border: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }
  .driver-route-badge {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 15px;
    background: #fff7ed;
    color: #7b1022;
    font-weight: 950;
  }
  .driver-card-vector {
    width: 54px;
    height: 54px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 20px;
    background: #111827;
    color: #fffaf5;
  }
  .driver-card-vector svg {
    width: 24px;
    height: 24px;
  }
  .driver-status-pill {
    grid-column: 1 / -1;
    width: fit-content;
    border-radius: 999px;
    padding: 7px 10px;
    background: #f8fafc;
    font-size: 12px;
    font-weight: 950;
  }
  .driver-progress {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }
  .driver-progress span {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: #f3f4f6;
    color: #9ca3af;
    font-size: 11px;
    font-weight: 950;
  }
  .driver-progress span.done {
    background: #7b1022;
    color: #fffaf5;
  }
  .driver-card-meta {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: #6b7280;
    font-size: 13px;
    font-weight: 900;
  }
  .driver-card-meta b {
    color: #111827;
  }
  .driver-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .driver-card-actions button,
  .driver-card-actions a,
  .driver-detail-actions button,
  .driver-detail-actions a {
    min-height: 40px;
    flex: 1 1 auto;
    background: #f8fafc;
    color: #111827;
  }
  .driver-card-actions .driver-deliver-action,
  .driver-detail-actions .driver-deliver-action {
    background: #16a34a;
    color: #ffffff;
  }
  .driver-done-chip {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0 12px;
    background: #dcfce7;
    color: #15803d;
    font-size: 12px;
    font-weight: 950;
  }
  .driver-empty {
    min-height: 280px;
    display: grid;
    place-items: center;
    gap: 8px;
    border: 1px dashed #ead8da;
    border-radius: 30px;
    padding: 34px;
    background: rgba(255, 255, 255, 0.72);
    text-align: center;
  }
  .driver-empty-vector {
    width: 170px;
    max-width: 70vw;
  }
  .driver-empty strong {
    font-size: 20px;
    color: #111827;
  }
  .driver-empty span {
    max-width: 420px;
    color: #6b7280;
    font-weight: 800;
  }
  .driver-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 2500;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 18px;
    background: rgba(17, 24, 39, 0.58);
    backdrop-filter: blur(8px);
  }
  .driver-detail-modal,
  .driver-confirm-modal {
    width: min(720px, 100%);
    max-height: calc(100vh - 36px);
    overflow: auto;
    border-radius: 32px;
    background: #ffffff;
    box-shadow: 0 34px 90px rgba(17, 24, 39, 0.28);
    animation: driverFloatIn 0.24s ease-out both;
  }
  .driver-detail-modal {
    padding: 18px;
  }
  .driver-detail-head {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    border-radius: 24px;
    padding: 20px;
    color: #fffaf5;
    background: linear-gradient(135deg, #3b0b16, #7b1022);
  }
  .driver-detail-head span {
    display: inline-flex;
    margin-bottom: 8px;
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(255,255,255,0.14);
    font-size: 12px;
    font-weight: 950;
  }
  .driver-detail-head h2 {
    margin: 0;
    font-size: clamp(28px, 6vw, 48px);
    line-height: 0.95;
  }
  .driver-detail-head p {
    margin: 8px 0 0;
    color: rgba(255, 250, 245, 0.82);
    font-weight: 900;
  }
  .driver-close-button {
    width: 42px;
    height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    border: 0;
    border-radius: 999px;
    background: rgba(255,255,255,0.14);
    color: #fffaf5;
    cursor: pointer;
  }
  .driver-detail-modal .driver-progress {
    margin: 14px 0;
  }
  .driver-detail-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .driver-detail-grid div,
  .driver-detail-address,
  .driver-detail-items {
    border: 1px solid #e5e7eb;
    border-radius: 18px;
    padding: 12px;
    background: #f8fafc;
  }
  .driver-detail-grid strong {
    display: block;
    margin-top: 4px;
    color: #111827;
    font-size: 14px;
  }
  .driver-detail-address {
    margin-top: 10px;
  }
  .driver-detail-address.fallback {
    border-color: #fed7aa;
    background: #fff7ed;
  }
  .driver-detail-address strong {
    display: block;
    margin-top: 6px;
    color: #111827;
    line-height: 1.4;
  }
  .driver-detail-address p {
    margin: 6px 0 0;
    color: #9a3412;
    font-size: 13px;
    font-weight: 900;
  }
  .driver-detail-items {
    margin-top: 10px;
    background: #ffffff;
  }
  .driver-detail-items pre {
    margin: 10px 0 0;
    white-space: pre-wrap;
    color: #111827;
    font: inherit;
    font-size: 15px;
    font-weight: 800;
    line-height: 1.55;
  }
  .driver-items-list {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }
  .driver-items-list div {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    border-radius: 14px;
    padding: 10px;
    background: #f8fafc;
  }
  .driver-items-list strong {
    color: #111827;
  }
  .driver-items-list small {
    color: #6b7280;
    font-weight: 900;
  }
  .driver-confirm-modal {
    width: min(420px, 100%);
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 28px;
    text-align: center;
  }
  .driver-confirm-icon {
    width: 70px;
    height: 70px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 24px;
    background: #dcfce7;
    color: #16a34a;
  }
  .driver-confirm-icon svg {
    width: 34px;
    height: 34px;
  }
  .driver-confirm-modal h2 {
    margin: 8px 0 0;
    color: #111827;
  }
  .driver-confirm-modal p {
    margin: 0;
    color: #6b7280;
    font-weight: 800;
    line-height: 1.45;
  }
  @media (max-width: 860px) {
    .driver-shell {
      padding: 14px;
    }
    .driver-hero {
      grid-template-columns: 1fr;
      min-height: auto;
    }
    .driver-hero-vector {
      min-height: 160px;
      margin-top: -20px;
    }
    .driver-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .driver-grid {
      grid-template-columns: 1fr;
    }
    .driver-detail-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 560px) {
    .driver-shell {
      padding: 12px;
    }
    .driver-hero {
      border-radius: 28px;
      padding: 22px;
    }
    .driver-hero-actions,
    .driver-detail-actions,
    .driver-confirm-actions {
      display: grid;
      grid-template-columns: 1fr;
    }
    .driver-summary {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .driver-stat {
      border-radius: 20px;
      padding: 14px;
    }
    .driver-stat strong {
      font-size: 28px;
    }
    .driver-next-card {
      grid-template-columns: 48px minmax(0, 1fr);
    }
    .driver-next-card b {
      grid-column: 2;
    }
    .driver-order-main {
      grid-template-columns: 38px 46px minmax(0, 1fr);
    }
    .driver-card-vector {
      width: 46px;
      height: 46px;
      border-radius: 16px;
    }
    .driver-card-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .driver-card-actions .driver-deliver-action,
    .driver-done-chip {
      grid-column: 1 / -1;
    }
    .driver-detail-grid {
      grid-template-columns: 1fr;
    }
    .driver-modal-overlay {
      align-items: flex-end;
      padding: 10px;
    }
    .driver-detail-modal,
    .driver-confirm-modal {
      border-radius: 28px;
      max-height: calc(100vh - 20px);
    }
  }
`;
