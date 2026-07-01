import React, { useEffect, useMemo, useState } from 'react';
import { ref, update } from 'firebase/database';
import { database } from '../firebase';
import { hoyISO } from './Utils';
import {
  buildGoogleMapsAddressUrl,
  buildGoogleMapsPlaceUrl,
  buildGoogleMapsRouteUrl,
  getBrowserLocation,
  hasLocation,
  normalizeLocation,
  optimizeStopsByNearest,
} from '../services/geo';
import { fetchDriverByCode } from '../services/drivers';
import { formatOrderNumber, subscribeOrdersForDriverCode } from '../services/orders';
import {
  assertRole,
  AUTH_ROLES,
  signInDriverAuth,
  signOutCurrentUser,
} from '../services/authRoles';
import { SAN_MARTIN_THEME } from '../styles/sanMartinTheme';

const DRIVER_SESSION_KEY = 'sanmartin_driver_session';
const BRAND_LOGO_PATH = '/tienda/branding/logo-mark.svg';
const DRIVER_THEME = SAN_MARTIN_THEME;

const Icons = {
  bike: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="18" r="3" />
      <path d="M9 18h4l2-6h3" />
      <path d="M12 9h3l2 3" />
      <path d="M9 18 7 10h4" />
    </svg>
  ),
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
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2.8 19.2A1.3 1.3 0 0 0 4 21h16a1.3 1.3 0 0 0 1.2-1.8L12 3Z" />
      <path d="M12 9v4.8" />
      <path d="M12 18h.01" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" />
    </svg>
  ),
  history: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 101.9-5.6" />
      <path d="M3 4v4h4" />
      <path d="M12 7v5l3 2" />
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

const getOrderKey = (order = {}) => order.firebaseKey || order.id || `${order.cliente || 'pedido'}-${order.timestamp || 0}`;

const getOrderItemLines = (order = {}) => {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return 0;
  }

  return order.items.length;
};

const getOrderItemSummary = (order = {}) => {
  const lines = getOrderItemLines(order);
  if (lines > 0) {
    return `${lines} ${lines === 1 ? 'producto' : 'productos'}`;
  }

  if (String(order.pedido || '').trim()) {
    return 'Detalle disponible';
  }

  return 'Sin detalle';
};

const getAddressPreview = (order = {}, maxLength = 72) => {
  const address = getWrittenAddress(order) || 'Sin direccion escrita';
  if (address.length <= maxLength) {
    return address;
  }

  return `${address.slice(0, maxLength - 1).trim()}...`;
};

const parseOrderIngresoTimestamp = (order = {}) => {
  const fecha = String(order.fecha || '').trim();
  const timeLabel = String(order.timestampIngreso || '').trim();
  if (!fecha || !timeLabel) {
    return 0;
  }

  const compact = timeLabel.toLowerCase().replace(/[\s.\u00a0]/g, '');
  const match = compact.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    return 0;
  }

  let hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const meridiem = compact.includes('pm') ? 'pm' : compact.includes('am') ? 'am' : '';

  if (meridiem) {
    if (hours === 12) {
      hours = 0;
    }

    if (meridiem === 'pm') {
      hours += 12;
    }
  }

  const baseDate = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return 0;
  }

  baseDate.setHours(hours, minutes, seconds, 0);
  return baseDate.getTime();
};

const getOrderCreatedAt = (order = {}) =>
  Number(order.timestampIngresoMs || order.timestampCreado || parseOrderIngresoTimestamp(order) || order.timestamp || 0);

const getOrderDeliveredAt = (order = {}) =>
  Number(order.timestampEntregadoMs || order.timestampFinalizado || order.timestamp || 0);

const compareDriverActiveOrders = (left = {}, right = {}) => {
  const dateDiff = String(left.fecha || '').localeCompare(String(right.fecha || ''));
  if (dateDiff !== 0) {
    return dateDiff;
  }

  const idDiff = Number(left.id || 0) - Number(right.id || 0);
  if (idDiff !== 0) {
    return idDiff;
  }

  return getOrderCreatedAt(left) - getOrderCreatedAt(right);
};

const formatElapsedMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  if (safeMinutes < 60) {
    return `${safeMinutes} min`;
  }

  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder > 0 ? `${hours} h ${String(remainder).padStart(2, '0')} min` : `${hours} h`;
};

const getOrderAgeMeta = (order = {}, now = Date.now()) => {
  const createdAt = getOrderCreatedAt(order);
  const ageMinutes = createdAt ? Math.max(0, Math.floor((now - createdAt) / 60000)) : 0;

  if (ageMinutes >= 60) {
    return {
      key: 'critical',
      label: formatElapsedMinutes(ageMinutes),
      tone: 'Mas de 1 hora',
    };
  }

  if (ageMinutes >= 45) {
    return {
      key: 'alert',
      label: formatElapsedMinutes(ageMinutes),
      tone: '45 a 59 min',
    };
  }

  if (ageMinutes >= 30) {
    return {
      key: 'warning',
      label: formatElapsedMinutes(ageMinutes),
      tone: '30 a 44 min',
    };
  }

  return {
    key: 'fresh',
    label: formatElapsedMinutes(ageMinutes),
    tone: 'Menos de 30 min',
  };
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

const compareDriverPreviousOrders = (left = {}, right = {}) => {
  const leftTime = isDeliveredOrder(left) ? getOrderDeliveredAt(left) : getOrderCreatedAt(left);
  const rightTime = isDeliveredOrder(right) ? getOrderDeliveredAt(right) : getOrderCreatedAt(right);
  const timeDiff = rightTime - leftTime;
  if (timeDiff !== 0) {
    return timeDiff;
  }

  const dateDiff = String(right.fecha || '').localeCompare(String(left.fecha || ''));
  if (dateDiff !== 0) {
    return dateDiff;
  }

  return Number(right.id || 0) - Number(left.id || 0);
};

export default function DriverView() {
  const todayKey = hoyISO();
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
  const [driverOrders, setDriverOrders] = useState([]);
  const [routeOrders, setRouteOrders] = useState([]);
  const [optimizing, setOptimizing] = useState(false);
  const [deliveringOrderKey, setDeliveringOrderKey] = useState('');
  const [locatingOrderKey, setLocatingOrderKey] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [confirmDeliveryOrder, setConfirmDeliveryOrder] = useState(null);
  const [driverSection, setDriverSection] = useState('ruta');
  const [notice, setNotice] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (!driver?.code) {
      setDriverOrders([]);
      return undefined;
    }

    const unsubscribe = subscribeOrdersForDriverCode(
      driver.code,
      (orders) => {
        setDriverOrders(Array.isArray(orders) ? orders : []);
      },
      (error) => {
        console.error('Error cargando pedidos del driver:', error);
        setDriverOrders([]);
      }
    );

    return () => unsubscribe();
  }, [driver]);

  const assignedOrders = useMemo(() => {
    if (!driver) {
      return [];
    }

    const driverName = normalizeName(driver.name);
    return driverOrders
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

        return getOrderCreatedAt(left) - getOrderCreatedAt(right);
      });
  }, [driver, driverOrders]);

  const activeAssignedOrders = useMemo(
    () => assignedOrders.filter((order) => !isDeliveredOrder(order)),
    [assignedOrders]
  );

  const currentAssignedOrders = useMemo(
    () =>
      activeAssignedOrders
        .filter((order) => String(order.fecha || '') === todayKey)
        .sort(compareDriverActiveOrders),
    [activeAssignedOrders, todayKey]
  );

  const hiddenLegacyAssignedOrders = useMemo(
    () =>
      activeAssignedOrders
        .filter((order) => String(order.fecha || '') !== todayKey)
        .sort(compareDriverActiveOrders),
    [activeAssignedOrders, todayKey]
  );

  const deliveredOrders = useMemo(
    () =>
      assignedOrders
        .filter((order) => isDeliveredOrder(order))
        .sort((left, right) => getOrderDeliveredAt(right) - getOrderDeliveredAt(left)),
    [assignedOrders]
  );

  const deliveredTodayOrders = useMemo(
    () =>
      deliveredOrders.filter((order) => String(order.fecha || '') === todayKey),
    [deliveredOrders, todayKey]
  );

  const previousOrders = useMemo(
    () =>
      [...hiddenLegacyAssignedOrders, ...deliveredOrders.filter((order) => String(order.fecha || '') !== todayKey)]
        .sort(compareDriverPreviousOrders),
    [deliveredOrders, hiddenLegacyAssignedOrders, todayKey]
  );

  useEffect(() => {
    setRouteOrders(currentAssignedOrders);
  }, [currentAssignedOrders]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoginError('');

    try {
      const authUser = await signInDriverAuth(loginForm);
      const roleRecord = await assertRole(AUTH_ROLES.DRIVER, authUser.uid);
      const loggedDriver = await fetchDriverByCode(roleRecord.driverCode || loginForm.code);

      if (!loggedDriver?.code || loggedDriver.active === false) {
        throw new Error('Entregador no autorizado');
      }

      setDriver(loggedDriver);
      window.localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(loggedDriver));
      setLoginForm({ code: '', password: '' });
    } catch (error) {
      console.error('Error iniciando sesion driver:', error);
      setLoginError('Codigo o contrasena incorrecta.');
    }
  };

  const logout = async () => {
    setDriver(null);
    window.localStorage.removeItem(DRIVER_SESSION_KEY);
    await signOutCurrentUser().catch(() => {});
  };

  const optimizeRoute = async () => {
    const locatedOrders = currentAssignedOrders.filter((order) => hasLocation(order.ubicacion));
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

      const optimized = optimizeStopsByNearest(currentAssignedOrders, origin);
      const routeUrl = buildGoogleMapsRouteUrl(optimized, origin);
      if (routeUrl) {
        window.open(routeUrl, '_blank', 'noopener,noreferrer');
        setNotice(`Ruta optimizada abierta en Google Maps con ${optimized.length} paradas.`);
      }
    } finally {
      setOptimizing(false);
    }
  };

  const findClientKeyForOrder = (order = {}) => {
    if (order.clienteFirebaseKey) {
      return order.clienteFirebaseKey;
    }

    return '';
  };

  const saveCustomerLocation = async (order) => {
    if (!order?.firebaseKey) {
      alert('No se pudo identificar este pedido.');
      return;
    }

    setLocatingOrderKey(order.firebaseKey);

    try {
      const browserLocation = await getBrowserLocation();
      const location = normalizeLocation({
        ...browserLocation,
        label: getWrittenAddress(order) || order.cliente || browserLocation.label,
      });

      if (!location) {
        throw new Error('Ubicacion invalida');
      }

      const now = Date.now();
      const updates = {
        [`orders/${order.firebaseKey}/ubicacion`]: location,
        [`orders/${order.firebaseKey}/ubicacionCapturadaPor`]: driver.name,
        [`orders/${order.firebaseKey}/ubicacionCapturadaPorCodigo`]: driver.code,
        [`orders/${order.firebaseKey}/timestampUbicacionCliente`]: formatTimeLabel(),
        [`orders/${order.firebaseKey}/timestamp`]: now,
      };

      const clientKey = findClientKeyForOrder(order);
      if (clientKey) {
        updates[`clients/${clientKey}/ubicacion`] = location;
        updates[`clients/${clientKey}/ubicacionActualizadaPor`] = driver.name;
        updates[`clients/${clientKey}/ubicacionActualizadaPorCodigo`] = driver.code;
        updates[`clients/${clientKey}/ubicacionActualizadaAt`] = now;
      }

      await update(ref(database), updates);
      setRouteOrders((current) =>
        current.map((routeOrder) =>
          routeOrder.firebaseKey === order.firebaseKey ? { ...routeOrder, ubicacion: location } : routeOrder
        )
      );
      setSelectedOrder((current) =>
        current?.firebaseKey === order.firebaseKey ? { ...current, ubicacion: location } : current
      );
      setNotice(clientKey ? 'Ubicacion guardada en pedido y cliente.' : 'Ubicacion guardada en el pedido.');
    } catch (error) {
      console.error('Error guardando ubicacion del cliente:', error);
      alert('No se pudo guardar la ubicacion. Revisa el permiso de GPS e intenta nuevamente desde el punto de entrega.');
    } finally {
      setLocatingOrderKey('');
    }
  };

  const markOrderDelivered = async (order) => {
    if (!order?.firebaseKey) {
      alert('No se pudo identificar este pedido.');
      return;
    }

    const now = formatTimeLabel();
    const nowMs = Date.now();
    setDeliveringOrderKey(order.firebaseKey);

    try {
      await update(ref(database, `orders/${order.firebaseKey}`), {
        estado: 'Entregado',
        timestampEntregado: now,
        timestampEntregadoMs: nowMs,
        timestampFinalizado: nowMs,
        entregadoPor: driver.name,
        entregadoPorCodigo: driver.code,
        timestamp: nowMs,
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
          <img src={BRAND_LOGO_PATH} alt="Carnes San Martin" />
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

  const activeRouteOrders = routeOrders;
  const ordersWithLocation = activeRouteOrders.filter((order) => hasLocation(order.ubicacion));
  const ordersWithoutLocation = activeRouteOrders.filter((order) => !hasLocation(order.ubicacion));
  const deliveredCount = deliveredTodayOrders.length;
  const previousCount = previousOrders.length;
  const enCaminoCount = activeRouteOrders.filter((order) => order.estado === 'Enviado').length;
  const delayedCount = activeRouteOrders.filter((order) => getOrderAgeMeta(order, nowTick).key === 'critical').length;
  const visibleRouteOrders = routeOrders;
  const routeListTitle = 'Pedidos por entregar';
  const deliveredSummary = deliveredTodayOrders[0]?.timestampEntregado
    ? `Ultima entrega ${deliveredTodayOrders[0].timestampEntregado}`
    : 'Revisa pedidos entregados de hoy.';
  const previousSummary = previousOrders[0]?.fecha
    ? `Movimientos anteriores desde ${previousOrders[0].fecha}`
    : 'Aqui aparecen pedidos de dias anteriores.';

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

      <section className="driver-hero driver-hero-compact">
        <div className="driver-hero-copy">
          <span className="driver-kicker">Driver app</span>
          <h1>{driver.name}</h1>
          <p>{driver.code} | {activeRouteOrders.length} por entregar hoy | {enCaminoCount} en ruta</p>
        </div>
        <div className="driver-hero-actions">
          <button
            type="button"
            className="driver-primary-action"
            onClick={optimizeRoute}
            disabled={optimizing || ordersWithLocation.length === 0}
          >
            {Icons.route}
            {optimizing ? 'Optimizando...' : 'Optimizar'}
          </button>
          <button type="button" className="driver-ghost-action" onClick={logout}>
            Salir
          </button>
        </div>
      </section>

      <section className="driver-summary">
        <DriverStatCard label="Pendientes" value={activeRouteOrders.length} tone="wine" />
        <DriverStatCard label="Sin pin" value={ordersWithoutLocation.length} tone="orange" />
        <DriverStatCard label="En camino" value={enCaminoCount} tone="blue" />
        <DriverStatCard label="Entregados" value={deliveredCount} tone="green" />
      </section>

      {driverSection === 'ruta' ? (
        <>
          <section className="driver-section-head">
            <div>
              <strong>{routeListTitle}</strong>
              <span>{`${visibleRouteOrders.length} pedidos en esta vista, ordenados del mas viejo al mas nuevo`}</span>
            </div>
          </section>

          {delayedCount > 0 && (
            <div className="driver-delay-banner">
              {Icons.alert}
              <strong>PEDIDO RETRASADO</strong>
              <span>{delayedCount} pedido{delayedCount === 1 ? '' : 's'} con mas de 1 hora en ruta.</span>
            </div>
          )}

          {hiddenLegacyAssignedOrders.length > 0 && (
            <div className="driver-inline-warning driver-inline-warning-legacy">
              <span>
                Se ocultaron {hiddenLegacyAssignedOrders.length} pedidos viejos de dias anteriores que siguen abiertos.
                La ruta activa ahora solo muestra pedidos de hoy.
              </span>
            </div>
          )}

          {visibleRouteOrders.length === 0 ? (
            <div className="driver-empty">
              <DriverEmptyVector />
              <strong>No hay pedidos en esta vista.</strong>
              <span>Cuando administracion asigne pedidos de hoy, apareceran aqui listos para ruta.</span>
            </div>
          ) : (
            <main className="driver-grid">
              {visibleRouteOrders.map((order) => (
                <DriverOrderCard
                  key={getOrderKey(order)}
                  order={order}
                  nowMs={nowTick}
                  delivering={deliveringOrderKey === order.firebaseKey}
                  locating={locatingOrderKey === order.firebaseKey}
                  onOpenDetails={setSelectedOrder}
                  onOpenMap={openOrderMap}
                  onAddLocation={saveCustomerLocation}
                  onRequestDelivered={setConfirmDeliveryOrder}
                />
              ))}
            </main>
          )}
        </>
      ) : driverSection === 'entregados' ? (
        <>
          <section className="driver-section-head">
            <div>
              <strong>Entregados</strong>
              <span>{deliveredSummary}</span>
            </div>
          </section>

          {deliveredTodayOrders.length === 0 ? (
            <div className="driver-empty">
              <DriverEmptyVector />
              <strong>Aun no hay entregas completadas hoy.</strong>
              <span>Cuando cierres pedidos entregados hoy apareceran aqui.</span>
            </div>
          ) : (
            <main className="driver-grid history">
              {deliveredTodayOrders.map((order) => (
                <DriverHistoryCard
                  key={getOrderKey(order)}
                  order={order}
                  onOpenDetails={setSelectedOrder}
                  onOpenMap={openOrderMap}
                />
              ))}
            </main>
          )}
        </>
      ) : (
        <>
          <section className="driver-section-head">
            <div>
              <strong>Pedidos anteriores</strong>
              <span>{previousSummary}</span>
            </div>
          </section>

          {previousOrders.length === 0 ? (
            <div className="driver-empty">
              <DriverEmptyVector />
              <strong>No hay pedidos anteriores para mostrar.</strong>
              <span>Cuando pasen dias o haya entregas anteriores, apareceran aqui.</span>
            </div>
          ) : (
            <main className="driver-grid history">
              {previousOrders.map((order) => (
                <DriverPreviousOrderCard
                  key={getOrderKey(order)}
                  order={order}
                  onOpenDetails={setSelectedOrder}
                  onOpenMap={openOrderMap}
                />
              ))}
            </main>
          )}
        </>
      )}

      <DriverBottomNav
        section={driverSection}
        activeCount={activeRouteOrders.length}
        deliveredCount={deliveredCount}
        previousCount={previousCount}
        onChangeSection={setDriverSection}
      />

      {selectedOrder && (
        <DriverDetailModal
          order={selectedOrder}
          delivering={deliveringOrderKey === selectedOrder.firebaseKey}
          locating={locatingOrderKey === selectedOrder.firebaseKey}
          onClose={() => setSelectedOrder(null)}
          onOpenMap={openOrderMap}
          onAddLocation={saveCustomerLocation}
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

function DriverBottomNav({ section, activeCount, deliveredCount, previousCount, onChangeSection }) {
  return (
    <nav className="driver-bottom-nav" aria-label="Menu principal driver">
      <button
        type="button"
        className={section === 'ruta' ? 'active' : ''}
        onClick={() => onChangeSection('ruta')}
      >
        {Icons.bike}
        <span>En Ruta</span>
        <b>{activeCount}</b>
      </button>
      <button
        type="button"
        className={section === 'entregados' ? 'active' : ''}
        onClick={() => onChangeSection('entregados')}
      >
        {Icons.check}
        <span>Entregados</span>
        <b>{deliveredCount}</b>
      </button>
      <button
        type="button"
        className={section === 'anteriores' ? 'active' : ''}
        onClick={() => onChangeSection('anteriores')}
      >
        {Icons.history}
        <span>Pedidos Ant.</span>
        <b>{previousCount}</b>
      </button>
    </nav>
  );
}

function DriverOrderCard({ order, nowMs, delivering, locating, onOpenDetails, onOpenMap, onAddLocation, onRequestDelivered }) {
  const status = getStatusMeta(order);
  const delivered = isDeliveredOrder(order);
  const navigationUrl = getOrderNavigationUrl(order);
  const hasMapPoint = hasLocation(order.ubicacion);
  const ageMeta = getOrderAgeMeta(order, nowMs);
  const delayed = ageMeta.key === 'critical';

  return (
    <article className={`driver-order-card ${status.tone} age-${ageMeta.key}`}>
      {delayed && (
        <div className="driver-delay-alert">
          {Icons.alert}
          <strong>PEDIDO RETRASADO</strong>
        </div>
      )}

      <button type="button" className="driver-order-main" onClick={() => onOpenDetails(order)}>
        <span className="driver-route-badge">{formatOrderNumber(order.id)}</span>
        <span className="driver-card-vector" aria-hidden="true">
          {Icons.bike}
        </span>
        <span className="driver-order-info">
          <small>Pedido #{formatOrderNumber(order.id)}</small>
          <strong>{order.cliente}</strong>
          <em>{getAddressPreview(order)}</em>
        </span>
        <span className="driver-status-pill" style={{ color: status.accent }}>
          {status.label}
        </span>
      </button>

      <div className="driver-card-meta">
        <span>{getOrderItemSummary(order)}</span>
        <span className={`driver-age-chip ${ageMeta.key}`}>{ageMeta.label}</span>
        <span>{hasMapPoint ? 'Con pin' : 'Sin pin'}</span>
        <b>{formatCurrency(order.total)}</b>
      </div>

      {!hasMapPoint && !delivered && (
        <div className="driver-inline-warning compact driver-inline-warning-card">
          <span>Falta ubicacion exacta del cliente.</span>
          <button
            type="button"
            className="driver-location-action driver-location-action-compact"
            onClick={() => onAddLocation(order)}
            disabled={locating}
          >
            {Icons.map}
            {locating ? 'Guardando...' : 'Guardar pin'}
          </button>
        </div>
      )}

      <div className="driver-card-actions">
        <button type="button" onClick={() => onOpenMap(order)} disabled={!navigationUrl}>
          {Icons.map}
          <span>Mapa</span>
        </button>
        <button type="button" onClick={() => onOpenDetails(order)}>
          {Icons.receipt}
          <span>Detalle</span>
        </button>
        {delivered ? (
          <span className="driver-done-chip">Entregado {order.timestampEntregado || ''}</span>
        ) : (
          <button type="button" className="driver-deliver-action" onClick={() => onRequestDelivered(order)} disabled={delivering}>
            {Icons.check}
            <span>{delivering ? 'Guardando...' : 'Entregado'}</span>
          </button>
        )}
      </div>
    </article>
  );
}

function DriverHistoryCard({ order, onOpenDetails, onOpenMap }) {
  const navigationUrl = getOrderNavigationUrl(order);

  return (
    <article className="driver-order-card delivered history">
      <button type="button" className="driver-order-main" onClick={() => onOpenDetails(order)}>
        <span className="driver-route-badge">{formatOrderNumber(order.id)}</span>
        <span className="driver-card-vector" aria-hidden="true">
          {Icons.check}
        </span>
        <span className="driver-order-info">
          <small>Pedido entregado</small>
          <strong>{order.cliente}</strong>
          <em>{getAddressPreview(order)}</em>
        </span>
        <span className="driver-status-pill delivered">Entregado</span>
      </button>

      <div className="driver-card-meta">
        <span>{getOrderItemSummary(order)}</span>
        <span>{hasLocation(order.ubicacion) ? 'Con pin' : 'Sin pin'}</span>
        <span>{order.timestampEntregado || 'Sin hora'}</span>
        <b>{formatCurrency(order.total)}</b>
      </div>

      <div className="driver-card-actions">
        <button type="button" onClick={() => onOpenMap(order)} disabled={!navigationUrl}>
          {Icons.map}
          <span>Mapa</span>
        </button>
        <button type="button" onClick={() => onOpenDetails(order)}>
          {Icons.receipt}
          <span>Detalle</span>
        </button>
        <span className="driver-done-chip">Entregado {order.timestampEntregado || ''}</span>
      </div>
    </article>
  );
}

function DriverPreviousOrderCard({ order, onOpenDetails, onOpenMap }) {
  const delivered = isDeliveredOrder(order);
  const navigationUrl = getOrderNavigationUrl(order);
  const badgeLabel = delivered ? 'Entregado' : 'Pendiente';
  const badgeClass = delivered ? 'driver-status-pill delivered' : 'driver-status-pill previous';
  const timeLabel = delivered ? order.timestampEntregado || 'Sin hora' : order.timestampIngreso || 'Sin hora';

  return (
    <article className={`driver-order-card history previous ${delivered ? 'delivered' : 'pending'}`}>
      <button type="button" className="driver-order-main" onClick={() => onOpenDetails(order)}>
        <span className="driver-route-badge">{formatOrderNumber(order.id)}</span>
        <span className="driver-card-vector" aria-hidden="true">
          {delivered ? Icons.check : Icons.history}
        </span>
        <span className="driver-order-info">
          <small>{order.fecha || 'Fecha no disponible'}</small>
          <strong>{order.cliente}</strong>
          <em>{getAddressPreview(order)}</em>
        </span>
        <span className={badgeClass}>{badgeLabel}</span>
      </button>

      <div className="driver-card-meta">
        <span>{getOrderItemSummary(order)}</span>
        <span>{hasLocation(order.ubicacion) ? 'Con pin' : 'Sin pin'}</span>
        <span>{timeLabel}</span>
        <b>{formatCurrency(order.total)}</b>
      </div>

      <div className="driver-card-actions">
        <button type="button" onClick={() => onOpenMap(order)} disabled={!navigationUrl}>
          {Icons.map}
          <span>Mapa</span>
        </button>
        <button type="button" onClick={() => onOpenDetails(order)}>
          {Icons.receipt}
          <span>Detalle</span>
        </button>
        <span className="driver-done-chip">
          {delivered ? `Entregado ${timeLabel}` : `Pendiente ${timeLabel}`}
        </span>
      </div>
    </article>
  );
}

function DriverDetailModal({ order, delivering, locating, onClose, onOpenMap, onAddLocation, onRequestDelivered }) {
  const status = getStatusMeta(order);
  const delivered = isDeliveredOrder(order);
  const address = getWrittenAddress(order);
  const navigationUrl = getOrderNavigationUrl(order);
  const whatsappLink = buildCustomerWhatsappLink(order);
  const hasMapPoint = hasLocation(order.ubicacion);
  const ageMeta = getOrderAgeMeta(order);

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
            <span>Antiguedad</span>
            <strong>{ageMeta.label}</strong>
          </div>
          <div>
            <span>Estado</span>
            <strong>{order.estado || 'Asignado'}</strong>
          </div>
        </div>

        <div className={`driver-detail-address ${hasMapPoint ? '' : 'fallback'}`}>
          <span>{hasMapPoint ? 'Punto de mapa guardado' : 'Direccion escrita del cliente'}</span>
          <strong>{address || 'Sin direccion escrita'}</strong>
          {!hasMapPoint && address && (
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
          {!hasMapPoint && (
            <button
              type="button"
              className="driver-location-action"
              onClick={() => onAddLocation(order)}
              disabled={locating || delivered}
            >
              {Icons.map}
              {locating ? 'Guardando pin...' : 'Agregar ubicacion del cliente'}
            </button>
          )}
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
        <path d="M142 114h116l-12-28H163l-21 28z" fill={DRIVER_THEME.blueDeep} />
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
      <path d="M56 51h61M56 67h44" stroke={DRIVER_THEME.blueDeep} strokeWidth="8" strokeLinecap="round" />
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
      ${DRIVER_THEME.heroGradient};
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
    background: ${DRIVER_THEME.blueDeep};
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
    background: ${DRIVER_THEME.darkPanelGradient};
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
    color: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
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
  .driver-stat.wine { color: ${DRIVER_THEME.blueDeep}; }
  .driver-stat.blue { color: ${DRIVER_THEME.blue}; }
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
    background: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
    font-size: 16px;
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
    background: ${DRIVER_THEME.blueDeep};
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
    color: ${DRIVER_THEME.blueDeep};
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
    background: ${DRIVER_THEME.blueDeep};
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
  .driver-card-actions .driver-location-action,
  .driver-detail-actions .driver-location-action {
    background: #f97316;
    color: #ffffff;
  }
  .driver-card-actions .driver-location-action {
    flex-basis: 100%;
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
    background: ${DRIVER_THEME.darkPanelGradient};
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
  .driver-hero.driver-hero-compact {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: auto;
    gap: 14px;
    padding: 18px;
    border-radius: 28px;
    background: ${DRIVER_THEME.heroGradient};
    box-shadow: 0 18px 42px rgba(17, 24, 39, 0.18);
  }
  .driver-hero.driver-hero-compact::before {
    display: none;
  }
  .driver-hero.driver-hero-compact .driver-hero-copy {
    display: grid;
    gap: 8px;
  }
  .driver-hero.driver-hero-compact h1 {
    margin: 0;
    font-size: clamp(32px, 8vw, 46px);
    line-height: 0.94;
    letter-spacing: -0.05em;
  }
  .driver-hero.driver-hero-compact p {
    margin: 0;
    font-size: 14px;
  }
  .driver-hero.driver-hero-compact .driver-hero-actions {
    margin-top: 0;
    align-self: center;
    justify-content: flex-end;
  }
  .driver-summary {
    gap: 10px;
    margin: 14px 0 10px;
  }
  .driver-stat {
    border-radius: 20px;
    padding: 14px 12px;
    box-shadow: 0 12px 28px rgba(17, 24, 39, 0.06);
  }
  .driver-stat span {
    font-size: 11px;
  }
  .driver-stat strong {
    font-size: 29px;
  }
  .driver-featured-card {
    display: grid;
    gap: 12px;
    margin-top: 4px;
    border: 1px solid #ead8da;
    border-radius: 28px;
    padding: 16px;
    background: rgba(255, 255, 255, 0.94);
    box-shadow: 0 18px 42px rgba(17, 24, 39, 0.08);
  }
  .driver-featured-head {
    display: grid;
    grid-template-columns: 52px minmax(0, 1fr) auto;
    gap: 12px;
    align-items: start;
  }
  .driver-featured-head small {
    display: block;
    color: #9f1239;
    font-size: 11px;
    font-weight: 950;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .driver-featured-head strong {
    display: block;
    margin-top: 2px;
    color: #111827;
    font-size: 22px;
    line-height: 1.05;
  }
  .driver-featured-head em {
    display: block;
    margin-top: 6px;
    color: #6b7280;
    font-size: 13px;
    font-style: normal;
    font-weight: 800;
    line-height: 1.35;
  }
  .driver-featured-head b {
    color: ${DRIVER_THEME.blueDeep};
    font-size: 18px;
    white-space: nowrap;
  }
  .driver-featured-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .driver-featured-meta span {
    min-height: 30px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0 12px;
    background: #f8fafc;
    color: #475569;
    font-size: 12px;
    font-weight: 900;
  }
  .driver-featured-actions,
  .driver-card-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .driver-featured-actions button,
  .driver-featured-actions a,
  .driver-card-actions button,
  .driver-card-actions a,
  .driver-detail-actions button,
  .driver-detail-actions a {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 0;
    border-radius: 16px;
    padding: 0 12px;
    background: #f8fafc;
    color: #111827;
    font: inherit;
    font-size: 12px;
    font-weight: 950;
    text-decoration: none;
    cursor: pointer;
  }
  .driver-featured-actions .driver-deliver-action,
  .driver-card-actions .driver-deliver-action,
  .driver-detail-actions .driver-deliver-action {
    background: #16a34a;
    color: #ffffff;
  }
  .driver-featured-actions .driver-location-action,
  .driver-card-actions .driver-location-action,
  .driver-detail-actions .driver-location-action {
    background: #f97316;
    color: #ffffff;
  }
  .driver-location-action.driver-location-action-compact {
    min-height: 34px;
    gap: 6px;
    padding: 0 10px;
    font-size: 11px;
  }
  .driver-location-action.driver-location-action-compact svg {
    width: 14px;
    height: 14px;
  }
  .driver-inline-warning {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    border: 1px solid #fed7aa;
    border-radius: 18px;
    padding: 12px;
    background: #fff7ed;
  }
  .driver-inline-warning.compact {
    padding: 10px 12px;
  }
  .driver-inline-warning-card {
    align-items: center;
  }
  .driver-inline-warning-legacy {
    margin-bottom: 12px;
  }
  .driver-inline-warning span {
    color: #9a3412;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.35;
  }
  .driver-section-head {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
    margin: 10px 0 12px;
  }
  .driver-section-head strong {
    display: block;
    color: #111827;
    font-size: 18px;
    font-weight: 950;
  }
  .driver-section-head span {
    display: block;
    margin-top: 3px;
    color: #6b7280;
    font-size: 12px;
    font-weight: 800;
  }
  .driver-delay-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: 18px;
    padding: 12px 14px;
    background: linear-gradient(135deg, rgba(254, 242, 242, 0.98), rgba(255, 255, 255, 0.98));
    box-shadow: 0 16px 28px rgba(220, 38, 38, 0.08);
  }
  .driver-delay-banner strong,
  .driver-delay-alert strong {
    color: #b91c1c;
    font-size: 12px;
    font-weight: 950;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .driver-delay-banner span {
    color: #7f1d1d;
    font-size: 12px;
    font-weight: 900;
    line-height: 1.35;
  }
  .driver-delay-banner svg,
  .driver-delay-alert svg {
    width: 16px;
    height: 16px;
    color: #dc2626;
    flex: 0 0 auto;
  }
  .driver-grid {
    grid-template-columns: repeat(auto-fill, minmax(248px, 1fr));
    gap: 12px;
  }
  .driver-order-card {
    gap: 9px;
    border-radius: 24px;
    padding: 12px;
    box-shadow: 0 14px 32px rgba(17, 24, 39, 0.07);
  }
  .driver-order-card::after {
    display: none;
  }
  .driver-order-main {
    width: 100%;
    grid-template-columns: 40px 40px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }
  .driver-route-badge {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    font-size: 14px;
  }
  .driver-card-vector {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    background: ${DRIVER_THEME.blueDeep};
  }
  .driver-card-vector svg {
    width: 20px;
    height: 20px;
  }
  .driver-order-info strong {
    font-size: 15px;
  }
  .driver-order-info em {
    font-size: 12px;
  }
  .driver-status-pill {
    grid-column: auto;
    padding: 6px 10px;
    background: #f8fafc;
    justify-self: end;
    white-space: nowrap;
  }
  .driver-status-pill.previous {
    background: #eef2ff;
    color: #475569;
  }
  .driver-order-card.previous.pending {
    border-color: rgba(71, 85, 105, 0.18);
    background: linear-gradient(145deg, #f8fafc, #ffffff);
  }
  .driver-delay-alert {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    border-radius: 999px;
    padding: 5px 10px;
    background: rgba(254, 226, 226, 0.96);
  }
  .driver-card-meta {
    align-items: center;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
  }
  .driver-card-meta span {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
    padding: 0 10px;
    background: #f8fafc;
    color: #6b7280;
    font-size: 11px;
  }
  .driver-card-meta b {
    margin-left: auto;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    color: #111827;
    font-size: 15px;
  }
  .driver-card-actions .driver-deliver-action,
  .driver-done-chip {
    grid-column: 1 / -1;
  }
  .driver-done-chip {
    min-height: 40px;
    border-radius: 16px;
    padding: 0 12px;
    font-size: 11px;
  }
  .driver-detail-modal {
    width: min(680px, 100%);
    border-radius: 28px;
    padding: 16px;
  }
  .driver-detail-head {
    border-radius: 22px;
    padding: 18px;
    background: ${DRIVER_THEME.darkPanelGradient};
  }
  .driver-detail-head h2 {
    font-size: clamp(24px, 6vw, 40px);
  }
  .driver-detail-grid div,
  .driver-detail-address,
  .driver-detail-items {
    border-radius: 16px;
  }
  @media (max-width: 860px) {
    .driver-hero.driver-hero-compact {
      grid-template-columns: 1fr;
    }
    .driver-hero.driver-hero-compact .driver-hero-actions {
      justify-content: stretch;
    }
  }
  @media (max-width: 560px) {
    .driver-hero.driver-hero-compact {
      padding: 16px;
      border-radius: 24px;
    }
    .driver-summary {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .driver-featured-head {
      grid-template-columns: 48px minmax(0, 1fr);
    }
    .driver-featured-head b {
      grid-column: 2;
    }
    .driver-featured-actions,
    .driver-card-actions,
    .driver-detail-actions {
      grid-template-columns: 1fr 1fr;
    }
    .driver-featured-actions .driver-deliver-action,
    .driver-inline-warning,
    .driver-card-actions .driver-deliver-action,
    .driver-done-chip {
      grid-column: 1 / -1;
    }
    .driver-inline-warning {
      flex-direction: column;
      align-items: stretch;
    }
    .driver-section-head strong {
      font-size: 16px;
    }
    .driver-order-main {
      grid-template-columns: 34px 34px minmax(0, 1fr);
      gap: 8px;
    }
    .driver-route-badge,
    .driver-card-vector {
      width: 34px;
      height: 34px;
      border-radius: 12px;
    }
    .driver-card-vector svg {
      width: 18px;
      height: 18px;
    }
    .driver-status-pill {
      grid-column: 2 / -1;
      justify-self: start;
      margin-top: 2px;
    }
    .driver-card-meta b {
      margin-left: 0;
    }
    .driver-detail-modal,
    .driver-confirm-modal {
      width: 100%;
      border-radius: 24px;
    }
  }
  .driver-shell {
    padding-bottom: 112px;
  }
  .driver-featured-side {
    display: grid;
    justify-items: end;
    gap: 8px;
  }
  .driver-bottom-nav {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    z-index: 1400;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 10px;
    border: 1px solid rgba(255, 255, 255, 0.58);
    border-radius: 24px;
    background: rgba(17, 24, 39, 0.94);
    box-shadow: 0 22px 60px rgba(17, 24, 39, 0.24);
    backdrop-filter: blur(16px);
  }
  .driver-bottom-nav button {
    position: relative;
    min-height: 62px;
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 4px;
    border: 0;
    border-radius: 18px;
    padding: 8px 6px;
    background: transparent;
    color: rgba(255, 250, 245, 0.72);
    font: inherit;
    font-size: 12px;
    font-weight: 950;
    cursor: pointer;
    text-align: center;
  }
  .driver-bottom-nav button span {
    line-height: 1.05;
  }
  .driver-bottom-nav button b {
    position: absolute;
    top: 7px;
    right: 7px;
    min-width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: inherit;
    font-size: 11px;
  }
  .driver-bottom-nav button.active {
    background: linear-gradient(135deg, ${DRIVER_THEME.blueDeep}, ${DRIVER_THEME.red});
    color: #fffaf5;
    box-shadow: 0 14px 26px rgba(123, 16, 34, 0.24);
  }
  .driver-bottom-nav button.active b {
    background: rgba(255, 255, 255, 0.18);
  }
  .driver-bottom-nav svg {
    width: 19px;
    height: 19px;
  }
  .driver-age-chip {
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0 10px;
    font-size: 11px;
    font-weight: 950;
    white-space: nowrap;
  }
  .driver-age-chip.fresh {
    background: rgba(22, 163, 74, 0.14);
    color: #15803d;
  }
  .driver-age-chip.warning {
    background: rgba(245, 158, 11, 0.16);
    color: #b45309;
  }
  .driver-age-chip.alert {
    background: rgba(249, 115, 22, 0.16);
    color: #c2410c;
  }
  .driver-age-chip.critical {
    background: rgba(220, 38, 38, 0.14);
    color: #b91c1c;
  }
  .driver-featured-card.age-fresh,
  .driver-order-card.age-fresh {
    border-color: rgba(34, 197, 94, 0.36);
    box-shadow: 0 18px 42px rgba(34, 197, 94, 0.1);
  }
  .driver-featured-card.age-warning,
  .driver-order-card.age-warning {
    border-color: rgba(245, 158, 11, 0.4);
    box-shadow: 0 18px 42px rgba(245, 158, 11, 0.12);
  }
  .driver-featured-card.age-alert,
  .driver-order-card.age-alert {
    border-color: rgba(249, 115, 22, 0.48);
    box-shadow: 0 18px 42px rgba(249, 115, 22, 0.14);
  }
  .driver-featured-card.age-critical,
  .driver-order-card.age-critical {
    border-color: rgba(220, 38, 38, 0.5);
    box-shadow: 0 20px 46px rgba(220, 38, 38, 0.16);
    background: linear-gradient(145deg, rgba(255, 245, 245, 0.98), rgba(255, 255, 255, 0.96));
  }
  .driver-order-card.history {
    border-color: rgba(34, 197, 94, 0.26);
  }
  .driver-status-pill.delivered {
    color: #15803d;
  }
  .driver-grid.history {
    padding-bottom: 8px;
  }
  @media (max-width: 560px) {
    .driver-shell {
      padding-bottom: 118px;
    }
    .driver-featured-side {
      justify-items: start;
    }
    .driver-bottom-nav {
      left: 10px;
      right: 10px;
      bottom: 10px;
      padding: 8px;
      border-radius: 22px;
    }
    .driver-bottom-nav button {
      min-height: 56px;
      padding: 8px 4px;
      font-size: 10px;
    }
    .driver-bottom-nav button b {
      top: 6px;
      right: 6px;
      min-width: 20px;
      height: 20px;
      font-size: 10px;
    }
    .driver-featured-meta span:last-child {
      width: 100%;
      justify-content: center;
    }
  }
`;
