import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
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

const normalizeName = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const getWrittenAddress = (order) => {
  const address = String(order?.direccion || order?.address || '').trim();
  return address && address !== '-' ? address : '';
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
      .sort((left, right) => Number(left.timestamp || 0) - Number(right.timestamp || 0));
  }, [driver, orders]);

  useEffect(() => {
    setRouteOrders(assignedOrders);
  }, [assignedOrders]);

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
    const locatedOrders = assignedOrders.filter((order) => hasLocation(order.ubicacion));
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

      const optimized = optimizeStopsByNearest(assignedOrders, origin);
      setRouteOrders(optimized);
      const routeUrl = buildGoogleMapsRouteUrl(optimized, origin);
      if (routeUrl) {
        window.open(routeUrl, '_blank', 'noopener,noreferrer');
      }
    } finally {
      setOptimizing(false);
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

  const ordersWithLocation = routeOrders.filter((order) => hasLocation(order.ubicacion));

  return (
    <div className="driver-shell">
      <style>{driverStyles}</style>
      <header className="driver-header">
        <div>
          <span>Modulo Driver</span>
          <h1>{driver.name}</h1>
          <p>{driver.code} | {assignedOrders.length} pedidos asignados</p>
        </div>
        <div className="driver-header-actions">
          <button type="button" onClick={optimizeRoute} disabled={optimizing || ordersWithLocation.length === 0}>
            {optimizing ? 'Optimizando...' : 'Optimizar ruta'}
          </button>
          <button type="button" className="secondary" onClick={logout}>
            Salir
          </button>
        </div>
      </header>

      <section className="driver-summary">
        <div>
          <strong>{assignedOrders.length}</strong>
          <span>Asignados</span>
        </div>
        <div>
          <strong>{ordersWithLocation.length}</strong>
          <span>Con ubicacion</span>
        </div>
        <div>
          <strong>{assignedOrders.filter((order) => order.estado === 'Enviado').length}</strong>
          <span>En camino</span>
        </div>
      </section>

      {routeOrders.length === 0 ? (
        <div className="driver-empty">
          <strong>No tienes pedidos asignados.</strong>
          <span>Cuando administracion te asigne un pedido, aparecera aqui.</span>
        </div>
      ) : (
        <main className="driver-list">
          {routeOrders.map((order, index) => {
            const hasMapPoint = hasLocation(order.ubicacion);
            const mapUrl = buildGoogleMapsPlaceUrl(order.ubicacion);
            const writtenAddress = getWrittenAddress(order);
            const addressUrl = buildGoogleMapsAddressUrl(writtenAddress);

            return (
              <article key={order.firebaseKey || order.id} className="driver-order">
                <div className="driver-order-number">#{formatOrderNumber(order.id)}</div>
                <div className="driver-order-body">
                  <div className="driver-order-top">
                    <div>
                      <strong>{index + 1}. {order.cliente}</strong>
                      <span>{order.telefono || 'Sin telefono'}</span>
                    </div>
                    <div className="driver-status">{order.estado || 'Asignado'}</div>
                  </div>
                  <div className={`driver-address ${hasMapPoint ? '' : 'fallback'}`}>
                    <span>{hasMapPoint ? 'Direccion del pedido' : 'Direccion escrita del cliente'}</span>
                    <p>{writtenAddress || 'Sin direccion escrita'}</p>
                    {!hasMapPoint && writtenAddress && (
                      <small>Este pedido no tiene punto de mapa. Usa esta direccion como referencia.</small>
                    )}
                  </div>
                  <div className="driver-meta">
                    <span>Asignado: {order.timestampAsignado || order.timestampEnviado || '-'}</span>
                    {order.total ? <span>{formatCurrency(order.total)}</span> : null}
                  </div>
                  <div className="driver-actions">
                    {hasMapPoint ? (
                      <a href={mapUrl} target="_blank" rel="noreferrer">
                        Abrir en Google Maps
                      </a>
                    ) : addressUrl ? (
                      <a href={addressUrl} target="_blank" rel="noreferrer" className="address-search">
                        Buscar direccion escrita
                      </a>
                    ) : (
                      <button type="button" disabled>Sin ubicacion ni direccion</button>
                    )}
                    {order.pedido && (
                      <details>
                        <summary>Ver pedido</summary>
                        <pre>{order.pedido}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </main>
      )}
    </div>
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
  @media (max-width: 680px) {
    .driver-shell {
      padding: 12px;
    }
    .driver-summary {
      grid-template-columns: 1fr;
    }
    .driver-order {
      grid-template-columns: 1fr;
    }
    .driver-order-number {
      min-height: 54px;
    }
  }
`;
