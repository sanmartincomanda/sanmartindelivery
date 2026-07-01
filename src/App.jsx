import React, { useEffect, useMemo, useState } from 'react';
import { get, onValue, ref, update } from 'firebase/database';
import { Suspense, lazy } from 'react';
import { database } from './firebase';
import { getDriverPublicName } from './services/drivers';
import './App.css';
import { SAN_MARTIN_THEME } from './styles/sanMartinTheme';

import { hoyISO } from './components/Utils';
import { createOrder, ORDER_LIMIT_PER_DAY, subscribeOrdersForDate } from './services/orders';
import {
  assertRole,
  AUTH_ROLES,
  fetchUserRole,
  onFirebaseAuthChange,
  signInInternalUser,
} from './services/authRoles';
import {
  KITCHEN_USER_KEY,
  normalizeKitchenUser,
  SYSTEM_USERS_PATH,
} from './services/systemUsers';
import { CLIENT_DIRECTORY_PATH } from './services/clientDirectory';

const OrderForm = lazy(() => import('./components/OrderForm'));
const KitchenView = lazy(() => import('./components/KitchenView'));
const ListaPedidos = lazy(() => import('./components/ListaPedidos'));
const TiendaVirtualView = lazy(() => import('./components/TiendaVirtualView'));
const TiendaVirtualAdminView = lazy(() => import('./components/TiendaVirtualAdminView'));
const ConfiguracionView = lazy(() => import('./components/ConfiguracionView'));
const DriverView = lazy(() => import('./components/DriverView'));
const BaseDatosView = lazy(() => import('./components/BaseDatosView'));
const CrmView = lazy(() => import('./components/CrmView'));

const Icons = {
  plus: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  chef: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 4h12M6 4v16a2 2 0 002 2h8a2 2 0 002-2V4M6 4L4 2m16 2l2-2M12 14v6m-4-4l4 4 4-4" />
    </svg>
  ),
  list: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  database: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  ),
  store: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M4 10v9a2 2 0 002 2h12a2 2 0 002-2v-9" />
      <path d="M3 9h18" />
      <path d="M9 14h6" />
    </svg>
  ),
  settings: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.88l.06.06a2 2 0 01-2.83 2.83l-.06-.06A1.7 1.7 0 0015 19.4a1.7 1.7 0 00-1 .6 1.7 1.7 0 00-.4 1.1V21a2 2 0 01-4 0v-.09A1.7 1.7 0 009 19.4a1.7 1.7 0 00-1.88.34l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.7 1.7 0 004.6 15a1.7 1.7 0 00-.6-1 1.7 1.7 0 00-1.1-.4H3a2 2 0 010-4h.09A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.34-1.88l-.06-.06a2 2 0 012.83-2.83l.06.06A1.7 1.7 0 009 4.6a1.7 1.7 0 001-.6 1.7 1.7 0 00.4-1.1V3a2 2 0 014 0v.09A1.7 1.7 0 0015 4.6a1.7 1.7 0 001.88-.34l.06-.06a2 2 0 012.83 2.83l-.06.06A1.7 1.7 0 0019.4 9a1.7 1.7 0 00.6 1 1.7 1.7 0 001.1.4H21a2 2 0 010 4h-.09A1.7 1.7 0 0019.4 15z" />
    </svg>
  ),
};

const STORE_CANONICAL_ORIGIN = 'https://tienda.sanmartinsr.com';
const STORE_HOSTS = new Set(['tienda.sanmartinsr.com']);
const PUBLIC_HOST_ROUTE_MAP = new Map([
  ['tienda.sanmartinsr.com', 'tienda'],
  ['admintv.sanmartinsr.com', 'dashboard'],
  ['cocina.sanmartinsr.com', 'cocina'],
  ['driver.sanmartinsr.com', 'driver'],
  ['crm.sanmartinsr.com', 'crm'],
]);
const BRAND_LOGO_PATH = '/tienda/branding/logo-mark.svg';
const APP_THEME = SAN_MARTIN_THEME;

const isStoreHost = (hostname = '') => STORE_HOSTS.has(String(hostname || '').trim().toLowerCase());
const getPublicHostRoute = (hostname = '') =>
  PUBLIC_HOST_ROUTE_MAP.get(String(hostname || '').trim().toLowerCase()) || '';

const isLocalHostname = (hostname = '') => {
  const cleanHost = String(hostname || '').trim().toLowerCase();

  if (!cleanHost) {
    return false;
  }

  if (cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost === '::1') {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(cleanHost)) {
    return true;
  }

  if (/^192\.168\.\d+\.\d+$/.test(cleanHost)) {
    return true;
  }

  const match = cleanHost.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (match) {
    const secondOctet = Number(match[1] || 0);
    return secondOctet >= 16 && secondOctet <= 31;
  }

  return false;
};

const getRouteFromLocation = () => {
  if (typeof window === 'undefined') {
    return 'dashboard';
  }

  const hostname = window.location.hostname;
  const publicHostRoute = getPublicHostRoute(hostname);
  if (publicHostRoute) {
    return publicHostRoute;
  }

  if (!isLocalHostname(hostname)) {
    return 'tienda';
  }

  const cleanedHash = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
  if (cleanedHash.startsWith('tienda')) return 'tienda';
  if (cleanedHash.startsWith('cocina')) return 'cocina';
  if (cleanedHash.startsWith('driver')) return 'driver';
  if (cleanedHash.startsWith('crm')) return 'crm';
  if (cleanedHash.startsWith('admin') || cleanedHash.startsWith('administracion')) return 'dashboard';
  return 'dashboard';
};

const getDocumentTitle = (route) => {
  switch (route) {
    case 'tienda':
      return 'Delivery Carnes San Martin Granada';
    case 'cocina':
      return 'Carnes San Martin | Cocina';
    case 'driver':
      return 'Carnes San Martin | Driver';
    case 'crm':
      return 'Carnes San Martin | CRM';
    default:
      return 'Carnes San Martin | Comanda Digital';
  }
};

function LazyViewFallback({ label = 'Cargando modulo...' }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: APP_THEME.blueSoftAlt,
        flexDirection: 'column',
        gap: '18px',
      }}
    >
      <div
        style={{
          width: '60px',
          height: '60px',
          borderRadius: '18px',
          background: APP_THEME.heroGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 16px 36px ${APP_THEME.shadowStrong}`,
        }}
      >
        <img
          src={BRAND_LOGO_PATH}
          alt="Logo"
          style={{ width: '42px', height: '42px', objectFit: 'contain' }}
        />
      </div>
      <div style={{ fontSize: '17px', fontWeight: 700, color: APP_THEME.textSoft }}>{label}</div>
    </div>
  );
}

function App() {
  const [route, setRoute] = useState(() => getRouteFromLocation());

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [dashboardRole, setDashboardRole] = useState(null);
  const [inputUser, setInputUser] = useState('');
  const [inputPass, setInputPass] = useState('');
  const [loginError, setLoginError] = useState(false);
  const [kitchenAuth, setKitchenAuth] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('sanmartin_kitchen_auth') === 'true';
  });
  const [kitchenLoginError, setKitchenLoginError] = useState(false);
  const [kitchenUser, setKitchenUser] = useState(() => normalizeKitchenUser());

  const [orders, setOrders] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [view, setView] = useState('ingreso');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, preparando: 0 });
  const [todayCounter, setTodayCounter] = useState(0);

  const isPublicStoreRoute = route === 'tienda';
  const isKitchenRoute = route === 'cocina';
  const isDriverRoute = route === 'driver';
  const isCrmRoute = route === 'crm';
  const todayKey = hoyISO();
  const isAdminDashboard = dashboardRole === AUTH_ROLES.ADMIN;
  const isOperatorDashboard = dashboardRole === AUTH_ROLES.OPERATOR;

  useEffect(() => {
    const unsubscribe = onFirebaseAuthChange((user) => {
      if (!user) {
        setIsAuthenticated(false);
        setDashboardRole(null);
        setKitchenAuth(false);
        return;
      }

      fetchUserRole(user.uid)
        .then((roleRecord) => {
          const role = roleRecord?.role || null;
          setDashboardRole(role);
          setIsAuthenticated(role === AUTH_ROLES.ADMIN || role === AUTH_ROLES.OPERATOR);
          setKitchenAuth(roleRecord?.role === AUTH_ROLES.KITCHEN);
        })
        .catch(() => {
          setIsAuthenticated(false);
          setDashboardRole(null);
          setKitchenAuth(false);
        });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromLocation());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    document.title = getDocumentTitle(route);
  }, [route]);

  useEffect(() => {
    if (!isKitchenRoute || !kitchenAuth) {
      return undefined;
    }

    const kitchenUserRef = ref(database, `${SYSTEM_USERS_PATH}/${KITCHEN_USER_KEY}`);
    const unsubscribe = onValue(kitchenUserRef, (snapshot) => {
      setKitchenUser(normalizeKitchenUser(snapshot.val()));
    });

    return () => unsubscribe();
  }, [isKitchenRoute]);

  useEffect(() => {
    if (!(isPublicStoreRoute || route === 'dashboard')) {
      return undefined;
    }

    const counterRef = ref(database, `orderCounters/${todayKey}`);
    const unsubscribe = onValue(counterRef, (snapshot) => {
      setTodayCounter(Number(snapshot.val() || 0));
    });

    return () => unsubscribe();
  }, [isPublicStoreRoute, route, todayKey]);

  useEffect(() => {
    const shouldSubscribeOrders =
      !isPublicStoreRoute &&
      !isDriverRoute &&
      (isAuthenticated || (isKitchenRoute && kitchenAuth)) &&
      ((route === 'dashboard' && (view === 'ingreso' || view === 'lista' || view === 'cocina')) ||
        isKitchenRoute);

    if (!shouldSubscribeOrders) {
      return undefined;
    }

    setLoading(true);
    let finishedFirstLoad = false;
    const safeUnlockTimer = window.setTimeout(() => {
      if (!finishedFirstLoad) {
        setLoading(false);
      }
    }, 1800);

    const unsubscribe = subscribeOrdersForDate(
      todayKey,
      (todayOrders) => {
        finishedFirstLoad = true;
        window.clearTimeout(safeUnlockTimer);
        if (!Array.isArray(todayOrders) || todayOrders.length === 0) {
          setOrders([]);
          setStats({ total: 0, pendientes: 0, preparando: 0 });
          setLoading(false);
          return;
        }

        let pendientes = 0;
        let preparando = 0;

        todayOrders.forEach((value) => {
          if ((value.estado || 'Pendiente') === 'Pendiente') {
            pendientes += 1;
          } else if (value.estado === 'En preparación' || value.estado === 'En preparacion') {
            preparando += 1;
          }
        });

        todayOrders.sort((left, right) => (left.id || 0) - (right.id || 0));
        setOrders(todayOrders);
        setStats({
          total: todayOrders.length,
          pendientes,
          preparando,
        });
        setLoading(false);
      },
      (error) => {
        finishedFirstLoad = true;
        window.clearTimeout(safeUnlockTimer);
        console.error('Error cargando pedidos:', error);
        setLoading(false);
      }
    );

    return () => {
      finishedFirstLoad = true;
      window.clearTimeout(safeUnlockTimer);
      unsubscribe();
    };
  }, [isAuthenticated, isDriverRoute, isPublicStoreRoute, isKitchenRoute, kitchenAuth, route, todayKey, view]);

  useEffect(() => {
    const shouldLoadClients =
      !isPublicStoreRoute &&
      route === 'dashboard' &&
      ((isAdminDashboard && (view === 'ingreso' || view === 'basedatos')) ||
        (isOperatorDashboard && view === 'ingreso'));

    if (!shouldLoadClients) {
      setClientes([]);
      return undefined;
    }

    const clientsPath = isOperatorDashboard && !isAdminDashboard ? CLIENT_DIRECTORY_PATH : 'clients';
    const clientsRef = ref(database, clientsPath);
    const applyClientsSnapshot = (data) => {
      if (!data) {
        setClientes([]);
        return;
      }

      const nextClients = Object.entries(data).map(([key, value]) => ({
        firebaseKey: key,
        ...value,
      }));

      nextClients.sort((left, right) =>
        String(left.nombre || '').localeCompare(String(right.nombre || ''))
      );
      setClientes(nextClients);
    };

    if (view === 'ingreso') {
      let cancelled = false;

      get(clientsRef)
        .then((snapshot) => {
          if (cancelled) {
            return;
          }

          applyClientsSnapshot(snapshot.val());
        })
        .catch((error) => {
          if (!cancelled) {
            console.error('Error cargando clientes:', error);
            setClientes([]);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const unsubscribe = onValue(clientsRef, (snapshot) => {
      applyClientsSnapshot(snapshot.val());
    });

    return () => unsubscribe();
  }, [isAdminDashboard, isOperatorDashboard, isPublicStoreRoute, route, view]);

  const nextOrderNumber = useMemo(
    () => Math.min(todayCounter + 1, ORDER_LIMIT_PER_DAY + 1),
    [todayCounter]
  );

  const remainingOrders = useMemo(
    () => Math.max(ORDER_LIMIT_PER_DAY - todayCounter, 0),
    [todayCounter]
  );

  const publicStoreUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return STORE_CANONICAL_ORIGIN;
    }

    if (isStoreHost(window.location.hostname)) {
      return `${window.location.origin}${window.location.pathname}`;
    }

    return STORE_CANONICAL_ORIGIN;
  }, []);

  const handleLogin = async (event) => {
    event.preventDefault();

    try {
      const expectedRoles = isCrmRoute ? [AUTH_ROLES.ADMIN] : [AUTH_ROLES.ADMIN, AUTH_ROLES.OPERATOR];
      const authUser = await signInInternalUser({
        username: inputUser,
        password: inputPass,
        scope: 'admin',
      });
      const roleRecord = await assertRole(expectedRoles, authUser.uid);
      setDashboardRole(roleRecord.role);
      setIsAuthenticated(true);
      setLoginError(false);
      return;
    } catch (error) {
      console.error('Error iniciando sesion admin:', error);
    }

    setLoginError(true);
  };

  const handleKitchenLogin = async ({ user, password }) => {
    try {
      const authUser = await signInInternalUser({
        username: user,
        password,
        scope: 'kitchen',
      });
      await assertRole(AUTH_ROLES.KITCHEN, authUser.uid);
      setKitchenAuth(true);
      setKitchenLoginError(false);
      window.localStorage.setItem('sanmartin_kitchen_auth', 'true');
      return true;
    } catch (error) {
      console.error('Error iniciando sesion cocina:', error);
      setKitchenLoginError(true);
      return false;
    }
  };

  const handleCrmLogin = async ({ user, password }) => {
    try {
      const authUser = await signInInternalUser({
        username: user,
        password,
        scope: 'admin',
      });
      const roleRecord = await assertRole(AUTH_ROLES.ADMIN, authUser.uid);
      setDashboardRole(roleRecord.role);
      setIsAuthenticated(true);
      setLoginError(false);
      return true;
    } catch (error) {
      console.error('Error iniciando sesion CRM:', error);
      setLoginError(true);
      return false;
    }
  };

  const addOrder = async (payload, options = {}) => {
    return createOrder(payload, options);
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find((item) => item.id === orderId);
    if (!order?.firebaseKey) {
      return;
    }

    update(ref(database, `orders/${order.firebaseKey}`), {
      estado: 'Enviado',
      repartidor,
      repartidorPublico: getDriverPublicName(repartidor) || repartidor?.name || repartidor,
      timestampEnviado: new Date().toLocaleTimeString('es-NI'),
      timestamp: Date.now(),
    });
  };

  const navItems = [
    { id: 'ingreso', label: 'Nuevo Pedido', icon: Icons.plus, color: APP_THEME.red, short: 'Nuevo' },
    { id: 'cocina', label: 'Vista Cocina', icon: Icons.chef, color: '#f59e0b', short: 'Cocina' },
    { id: 'lista', label: 'Lista Pedidos', icon: Icons.list, color: APP_THEME.blue, short: 'Lista' },
    { id: 'basedatos', label: 'Base de Datos', icon: Icons.database, color: '#10b981', short: 'Datos' },
    { id: 'tienda_virtual', label: 'Tienda Virtual', icon: Icons.store, color: APP_THEME.blueBright, short: 'Tienda' },
    { id: 'configuracion', label: 'Configuraciones', icon: Icons.settings, color: APP_THEME.blueDeep, short: 'Config' },
  ];

  const availableNavItems = isAdminDashboard
    ? navItems
    : navItems.filter((item) => ['ingreso', 'cocina', 'lista'].includes(item.id));
  const currentViewMeta = availableNavItems.find((item) => item.id === view) || availableNavItems[0];

  useEffect(() => {
    if (!isAuthenticated || availableNavItems.some((item) => item.id === view)) {
      return;
    }

    setView('ingreso');
  }, [availableNavItems, isAuthenticated, view]);

  if (isPublicStoreRoute) {
    return (
      <Suspense fallback={<LazyViewFallback label="Cargando tienda..." />}>
        <TiendaVirtualView
          onCreateOrder={addOrder}
          nextOrderNumber={nextOrderNumber}
          remainingOrders={remainingOrders}
          publicStoreUrl={publicStoreUrl}
          mode="public"
        />
      </Suspense>
    );
  }

  if (isDriverRoute) {
    return (
      <Suspense fallback={<LazyViewFallback label="Cargando driver..." />}>
        <DriverView />
      </Suspense>
    );
  }

  if (isKitchenRoute) {
    if (!kitchenAuth) {
      return (
        <RoleLogin
          title="Cocina"
          subtitle="Acceso general para todos los carniceros"
          userPlaceholder={`Usuario: ${kitchenUser.username || 'cocina'}`}
          error={kitchenLoginError}
          onLogin={handleKitchenLogin}
        />
      );
    }

    return (
      <Suspense fallback={<LazyViewFallback label="Cargando cocina..." />}>
        <KitchenView orders={orders} />
      </Suspense>
    );
  }

  if (isCrmRoute) {
    if (!isAuthenticated || dashboardRole !== AUTH_ROLES.ADMIN) {
      return (
        <RoleLogin
          title="CRM"
          subtitle="Analitica online + SICAR"
          userPlaceholder="Usuario administrador"
          error={loginError}
          onLogin={handleCrmLogin}
        />
      );
    }

    return (
      <Suspense fallback={<LazyViewFallback label="Cargando CRM..." />}>
        <CrmView />
      </Suspense>
    );
  }

  if (!isAuthenticated) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: APP_THEME.darkGradient,
          fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        }}
      >
        <form
          onSubmit={handleLogin}
          style={{
            background: 'white',
            padding: '40px',
            borderRadius: '24px',
            width: '100%',
            maxWidth: '380px',
            textAlign: 'center',
            boxShadow: `0 20px 25px -5px ${APP_THEME.shadow}`,
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '16px',
              background: APP_THEME.heroGradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}
          >
            <img
              src={BRAND_LOGO_PATH}
              alt="Logo"
              style={{ width: '48px', height: '48px', objectFit: 'contain' }}
            />
          </div>

          <h2 style={{ fontSize: '24px', fontWeight: 800, color: APP_THEME.text, margin: '0 0 8px 0' }}>
            San Martin
          </h2>
          <p style={{ color: APP_THEME.textSoft, marginBottom: '32px', fontSize: '14px', marginTop: 0 }}>
            Acceso a Delivery
          </p>

          <input
            type="text"
            placeholder="Usuario"
            value={inputUser}
            onChange={(event) => setInputUser(event.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px',
              borderRadius: '12px',
              border: `2px solid ${APP_THEME.border}`,
              marginBottom: '16px',
              outline: 'none',
              fontSize: '14px',
            }}
          />

          <input
            type="password"
            placeholder="Contrasena"
            value={inputPass}
            onChange={(event) => setInputPass(event.target.value)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '14px',
              borderRadius: '12px',
              border: `2px solid ${APP_THEME.border}`,
              marginBottom: '16px',
              outline: 'none',
              fontSize: '14px',
            }}
          />

          {loginError && (
            <p style={{ color: APP_THEME.red, fontSize: '12px', fontWeight: 700, margin: '0 0 16px 0' }}>
              Credenciales incorrectas
            </p>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '16px',
              background: APP_THEME.primaryGradient,
              color: 'white',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ENTRAR
          </button>
        </form>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: APP_THEME.blueSoftAlt,
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: APP_THEME.heroGradient,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        >
          <img
            src={BRAND_LOGO_PATH}
            alt="Logo"
              style={{ width: '48px', height: '48px', objectFit: 'contain' }}
          />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 600, color: APP_THEME.textSoft }}>Cargando sistema...</div>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        background: APP_THEME.blueSoftAlt,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .nav-item { transition: all 0.2s ease; }
        .nav-item:hover { background: rgba(255,255,255,0.1); }
      `}</style>

      <aside
        style={{
          width: sidebarCollapsed ? '80px' : '260px',
          background: APP_THEME.darkGradient,
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          height: '100vh',
          transition: 'width 0.3s ease',
          zIndex: 1000,
        }}
      >
        <div
          style={{
            padding: '24px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: APP_THEME.heroGradient,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <img
              src={BRAND_LOGO_PATH}
              alt="Logo"
              style={{ width: '36px', height: '36px', objectFit: 'contain' }}
            />
          </div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>San Martin</div>
              <div style={{ fontSize: '11px', opacity: 0.6 }}>Delivery + Tienda</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {availableNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '16px' : '14px 20px',
                margin: '4px 0',
                border: 'none',
                background: view === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: view === item.id ? item.color : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '14px',
                fontWeight: view === item.id ? 700 : 600,
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                borderLeft: view === item.id ? `3px solid ${item.color}` : '3px solid transparent',
                transition: 'all 0.2s',
              }}
            >
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: view === item.id ? `${item.color}24` : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {item.icon}
              </span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setSidebarCollapsed((current) => !current)}
          style={{
            padding: '16px 20px',
            border: 'none',
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '12px',
            fontSize: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)',
          }}
        >
          <span style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
            â†
          </span>
          {!sidebarCollapsed && <span>Colapsar</span>}
        </button>
      </aside>

      <main
        style={{
          flex: 1,
          marginLeft: sidebarCollapsed ? '80px' : '260px',
          transition: 'margin-left 0.3s ease',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header
          style={{
            height: '64px',
            background: 'rgba(255,255,255,0.96)',
            borderBottom: `1px solid ${APP_THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '20px',
              fontWeight: 800,
              color: APP_THEME.text,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: currentViewMeta?.color || '#64748b',
              }}
            />
            {currentViewMeta?.label || 'Dashboard'}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: APP_THEME.textSoft, fontWeight: 700, textTransform: 'uppercase' }}>
                  Hoy
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: APP_THEME.text }}>{stats.total}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Pendientes
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>{stats.pendientes}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: APP_THEME.blue, fontWeight: 700, textTransform: 'uppercase' }}>
                  Cocina
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: APP_THEME.blue }}>{stats.preparando}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#f97316', fontWeight: 700, textTransform: 'uppercase' }}>
                  Cupos
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#f97316' }}>{remainingOrders}</div>
              </div>
            </div>

            <div style={{ width: '1px', height: '32px', background: APP_THEME.border }} />

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: APP_THEME.text }}>
                {new Date().toLocaleDateString('es-NI', { day: 'numeric', month: 'short' })}
              </div>
              <div style={{ fontSize: '11px', color: APP_THEME.textSoft, fontWeight: 600 }}>
                {new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        <div className="animate-fadeIn" style={{ flex: 1 }}>
          <Suspense fallback={<LazyViewFallback label="Cargando modulo..." />}>
            {view === 'ingreso' && (
              <OrderForm
                onAddOrder={addOrder}
                clientes={clientes}
                allowClientDirectory={isAdminDashboard || isOperatorDashboard}
                nextOrderNumber={nextOrderNumber}
                remainingOrders={remainingOrders}
              />
            )}

            {view === 'cocina' && <KitchenView orders={orders} allowRuta={isAdminDashboard} />}

            {view === 'lista' && <ListaPedidos pedidos={orders} onEnviarPedido={handleEnviarPedido} />}

            {view === 'tienda_virtual' && isAdminDashboard && <TiendaVirtualAdminView />}

            {view === 'configuracion' && isAdminDashboard && <ConfiguracionView mode="users" />}

            {view === 'basedatos' && isAdminDashboard && <BaseDatosView clientes={clientes} />}
          </Suspense>
        </div>
      </main>
    </div>
  );
}

function RoleLogin({ title, subtitle, userPlaceholder, error, onLogin }) {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await onLogin({ user, password });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          APP_THEME.heroGradient,
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: 'min(420px, 100%)',
          display: 'grid',
          gap: 12,
          background: 'white',
          padding: 30,
          borderRadius: 22,
          textAlign: 'center',
          boxShadow: `0 28px 80px ${APP_THEME.shadowStrong}`,
        }}
      >
        <img src={BRAND_LOGO_PATH} alt="Logo" style={{ width: 78, height: 78, margin: '0 auto', objectFit: 'contain' }} />
        <h1 style={{ margin: 0, color: APP_THEME.text, fontSize: 30 }}>{title}</h1>
        <p style={{ margin: 0, color: APP_THEME.textSoft, fontWeight: 800 }}>{subtitle}</p>
        {error && (
          <div
            style={{
              borderRadius: 12,
              padding: 10,
              background: '#fee2e2',
              color: APP_THEME.redDeep,
              fontWeight: 900,
            }}
          >
            Credenciales incorrectas
          </div>
        )}
        <input
          value={user}
          onChange={(event) => setUser(event.target.value)}
          placeholder={userPlaceholder}
          style={{
            minHeight: 46,
            border: `1px solid ${APP_THEME.border}`,
            borderRadius: 12,
            padding: '0 14px',
            font: 'inherit',
            fontWeight: 800,
          }}
        />
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Contrasena"
          style={{
            minHeight: 46,
            border: `1px solid ${APP_THEME.border}`,
            borderRadius: 12,
            padding: '0 14px',
            font: 'inherit',
            fontWeight: 800,
          }}
        />
        <button
          type="submit"
          disabled={submitting}
          style={{
            minHeight: 46,
            border: 0,
            borderRadius: 999,
            background: APP_THEME.primaryGradient,
            color: 'white',
            font: 'inherit',
            fontWeight: 900,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

export default App;


