import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  QUICK_WEIGHTS,
  STORE_PAYMENT_OPTIONS,
  STORE_PROMOTIONS,
} from '../data/tiendaVirtual';
import { mergeCatalogProducts, STORE_CATALOG_PATH } from '../services/storeCatalog';
import {
  mergeStoreCategories,
  STORE_CATEGORIES_PATH,
} from '../services/storeCategories';
import {
  cleanStorePhone,
  loginStoreUser,
  registerStoreUser,
  updateStoreUserProfile,
} from '../services/storeUsers';
import { formatOrderNumber, formatWeight, STORE_CHANNEL } from '../services/orders';

const LOGO_PATH = '/tienda/branding/logo.png';
const STORE_BACKGROUND_PATH = '/tienda/branding/fondo-combos-tortas.svg';
const STORE_SESSION_KEY = 'sanmartin_store_user';
const STORE_WHATSAPP_NUMBER = '50584657949';
const ORDER_PROGRESS_STEPS = ['Recibido', 'Cocina', 'Listo', 'En camino'];

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const isUnitProduct = (product) => String(product?.unit || '').toLowerCase() === 'unidad';

const getQuantityStep = (product) => (isUnitProduct(product) ? 1 : 0.5);

const clampQuantity = (value, product) => {
  const step = getQuantityStep(product);
  const rounded = Math.round(Number(value || 0) / step) * step;
  if (rounded <= 0) {
    return 0;
  }

  return Number(rounded.toFixed(step === 1 ? 0 : 1));
};

const isValidQuantityStep = (value, product) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return true;
  }

  const step = getQuantityStep(product);
  const steps = numberValue / step;
  return Math.abs(steps - Math.round(steps)) < 0.00001;
};

const formatStoreQuantity = (quantity, unit) =>
  String(unit).toLowerCase() === 'unidad' ? String(Number(quantity || 0)) : formatWeight(quantity);

const getQuickQuantities = (product) => (isUnitProduct(product) ? [1, 2, 3, 4] : QUICK_WEIGHTS);

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeCustomerOrderStatus = (status) => {
  const normalizedStatus = removeTextAccents(status || 'Pendiente');

  if (normalizedStatus.includes('cancel')) {
    return 'cancelado';
  }

  if (normalizedStatus.includes('enviado')) {
    return 'enviado';
  }

  if (normalizedStatus.includes('preparado')) {
    return 'preparado';
  }

  if (normalizedStatus.includes('preparacion')) {
    return 'preparando';
  }

  return 'pendiente';
};

const getShortPersonName = (name, fallback) => {
  const cleanName = String(name || '').trim();
  if (!cleanName) {
    return fallback;
  }

  const [firstName] = cleanName.split(/\s+/);
  return firstName || fallback;
};

const getCustomerStatusMeta = (order = {}) => {
  const statusKey = normalizeCustomerOrderStatus(order.estado);
  const cookName = getShortPersonName(order.cocinero, 'Harvey');
  const riderName = getShortPersonName(order.repartidor, 'Jordin');

  const statusMeta = {
    pendiente: {
      accent: '#ef4444',
      soft: '#fff1f2',
      emoji: '🧾',
      label: 'Pedido recibido',
      message: 'Recibimos tu pedido. Ya esta en la fila de cocina y te iremos avisando cada paso.',
      progress: 1,
    },
    preparando: {
      accent: '#f59e0b',
      soft: '#fffbeb',
      emoji: '👨‍🍳',
      label: 'En cocina',
      message: `Carnicero ${cookName} ya esta preparando tu pedido.`,
      progress: 2,
    },
    preparado: {
      accent: '#10b981',
      soft: '#ecfdf5',
      emoji: '✅',
      label: 'Pedido listo',
      message: 'Tu pedido ya esta listo. Estamos coordinando la salida para entregarlo con cuidado.',
      progress: 3,
    },
    enviado: {
      accent: '#2563eb',
      soft: '#eff6ff',
      emoji: '🏍️',
      label: 'En camino',
      message: `${riderName} lleva tu pedido en camino.`,
      progress: 4,
    },
    cancelado: {
      accent: '#64748b',
      soft: '#f8fafc',
      emoji: 'ℹ️',
      label: 'Pedido cancelado',
      message: 'Este pedido fue cancelado. Si necesitas ayuda, escribenos por WhatsApp.',
      progress: 0,
    },
  };

  return statusMeta[statusKey] || statusMeta.pendiente;
};

const buildOrderItemsMessage = (order = {}) => {
  if (!Array.isArray(order.items) || order.items.length === 0) {
    return order.pedido || 'Sin detalle de productos';
  }

  return order.items
    .map((item) => {
      const quantity = formatStoreQuantity(item.cantidad, item.unidad);
      return `* ${quantity} ${item.unidad || ''} ${item.nombre || ''}`.trim();
    })
    .join('\n');
};

const buildOrderWhatsAppMessage = (order = {}, currentUser = {}) => {
  const customerName = currentUser?.nombre || order.cliente || 'Cliente';
  const customerPhone = currentUser?.telefono || order.telefono || '';
  const orderNumber = formatOrderNumber(order.id);

  return [
    'Hola Carnes San Martin Granada.',
    'Tengo este pedido en linea',
    `Pedido #${orderNumber}`,
    `Cliente: ${customerName}`,
    customerPhone ? `Telefono: ${customerPhone}` : '',
    `Estado actual: ${order.estado || 'Pendiente'}`,
    `Total: ${formatCurrency(order.total)}`,
    'Productos:',
    buildOrderItemsMessage(order),
  ]
    .filter(Boolean)
    .join('\n');
};

const buildOrderWhatsAppLink = (order, currentUser) =>
  `https://wa.me/${STORE_WHATSAPP_NUMBER}?text=${encodeURIComponent(
    buildOrderWhatsAppMessage(order, currentUser)
  )}`;

export default function TiendaVirtualView({
  onCreateOrder,
  mode = 'public',
  publicStoreUrl = '#tienda',
}) {
  const [catalog, setCatalog] = useState(() => mergeCatalogProducts());
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [cart, setCart] = useState({});
  const [quantityNotice, setQuantityNotice] = useState('');
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeSubcategory, setActiveSubcategory] = useState('todas');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedPromotion, setSelectedPromotion] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return JSON.parse(window.localStorage.getItem(STORE_SESSION_KEY) || 'null');
    } catch (error) {
      console.error('No se pudo leer la sesion de tienda:', error);
      return null;
    }
  });
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    nombre: '',
    telefono: '',
    password: '',
    confirmPassword: '',
    direccion: '',
    referencia: '',
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
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
  const quantityNoticeTimeoutRef = useRef(null);

  const deferredQuery = useDeferredValue(query);
  const isDashboard = mode === 'dashboard';

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATALOG_PATH), (snapshot) => {
      setCatalog(mergeCatalogProducts(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATEGORIES_PATH), (snapshot) => {
      setCategories(mergeStoreCategories(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(
    () => () => {
      if (quantityNoticeTimeoutRef.current) {
        window.clearTimeout(quantityNoticeTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!currentUser) {
      setCustomerOrders([]);
      return undefined;
    }

    const cleanPhone = cleanStorePhone(currentUser.telefono);
    if (!cleanPhone) {
      setCustomerOrders([]);
      return undefined;
    }

    const unsubscribe = onValue(ref(database, 'orders'), (snapshot) => {
      const data = snapshot.val() || {};
      const orders = Object.entries(data)
        .map(([firebaseKey, order]) => ({ firebaseKey, ...order }))
        .filter(
          (order) =>
            order.storeUserKey === currentUser.key || cleanStorePhone(order.telefono) === cleanPhone
        )
        .sort((left, right) => Number(right.timestamp || 0) - Number(left.timestamp || 0))
        .slice(0, 10);

      setCustomerOrders(orders);
    });

    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setCustomer((current) => ({
      ...current,
      nombre: currentUser.nombre || '',
      telefono: currentUser.telefono || '',
      direccion: currentUser.direccion || '',
      referencia: currentUser.referencia || '',
    }));
  }, [currentUser]);

  const activeProducts = useMemo(
    () => catalog.filter((product) => product.active !== false),
    [catalog]
  );

  const categoryOptions = useMemo(
    () => [
      { id: 'todos', label: 'Todos', subcategories: [] },
      ...categories.filter((category) => category.active !== false),
    ],
    [categories]
  );

  const selectedCategory = useMemo(
    () => categoryOptions.find((category) => category.id === activeCategory) || categoryOptions[0],
    [activeCategory, categoryOptions]
  );

  useEffect(() => {
    if (!categoryOptions.some((category) => category.id === activeCategory)) {
      setActiveCategory('todos');
      setActiveSubcategory('todas');
    }
  }, [activeCategory, categoryOptions]);

  const subcategoryOptions = useMemo(() => {
    if (activeCategory === 'todos') {
      return [];
    }

    const officialSubcategories = selectedCategory?.subcategories || [];
    const productSubcategories = activeProducts
      .filter((product) => {
        if (activeCategory === 'promociones') {
          return product.promo || product.category === 'promociones';
        }

        return product.category === activeCategory;
      })
      .map((product) => product.subcategory)
      .filter(Boolean);

    return Array.from(new Set([...officialSubcategories, ...productSubcategories]));
  }, [activeCategory, activeProducts, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    return activeProducts.filter((product) => {
      const matchesCategory =
        activeCategory === 'todos' ||
        (activeCategory === 'promociones' && (product.promo || product.category === 'promociones')) ||
        product.category === activeCategory;

      const matchesSubcategory =
        activeSubcategory === 'todas' ||
        String(product.subcategory || '').toLowerCase() === activeSubcategory.toLowerCase();

      const matchesSearch =
        !normalizedQuery ||
        [product.code, product.name, product.description, product.category, product.subcategory]
          .join(' ')
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesCategory && matchesSubcategory && matchesSearch;
    });
  }, [activeCategory, activeProducts, activeSubcategory, deferredQuery]);

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

  const cartCount = cartItems.length;

  const showQuantityNotice = (message) => {
    setQuantityNotice(message);

    if (quantityNoticeTimeoutRef.current) {
      window.clearTimeout(quantityNoticeTimeoutRef.current);
    }

    quantityNoticeTimeoutRef.current = window.setTimeout(() => {
      setQuantityNotice('');
      quantityNoticeTimeoutRef.current = null;
    }, 2000);
  };

  const updateQuantity = (code, nextValue) => {
    const product = activeProducts.find((item) => item.code === code) || catalog.find((item) => item.code === code);
    const numericValue = Number(nextValue);

    if (!Number.isFinite(numericValue)) {
      showQuantityNotice('Ingresa una cantidad valida.');
      return;
    }

    if (!isValidQuantityStep(numericValue, product)) {
      showQuantityNotice(
        isUnitProduct(product)
          ? 'Solo permite unidades cerradas.'
          : 'Solo permite pesos de media libra o libra cerrada.'
      );
    }

    setCart((current) => ({
      ...current,
      [code]: clampQuantity(numericValue, product),
    }));
  };

  const updateCustomer = (field, value) => {
    setCustomer((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const persistStoreSession = (user) => {
    setCurrentUser(user);
    setCreatedOrder(null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORE_SESSION_KEY, JSON.stringify(user));
    }
  };

  const clearStoreSession = () => {
    setCurrentUser(null);
    setCart({});
    setCreatedOrder(null);
    setCustomerOrders([]);
    setOrdersOpen(false);
    setCheckoutOpen(false);
    setProfileOpen(false);
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(STORE_SESSION_KEY);
    }
  };

  const cancelCustomerOrder = async (order) => {
    if (!order?.firebaseKey) {
      alert('No pudimos encontrar este pedido para anularlo.');
      return;
    }

    const confirmCancel = window.confirm(
      `Quieres anular el pedido #${formatOrderNumber(order.id)}?`
    );

    if (!confirmCancel) {
      return;
    }

    const now = new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
    const cancelPayload = {
      estado: 'Cancelado',
      canceladoPor: 'Cliente tienda virtual',
      timestampCancelado: now,
      timestamp: Date.now(),
    };

    try {
      await update(ref(database, `orders/${order.firebaseKey}`), cancelPayload);
      setCreatedOrder((current) =>
        current && (current.firebaseKey === order.firebaseKey || String(current.id) === String(order.id))
          ? { ...current, ...cancelPayload }
          : current
      );
    } catch (error) {
      console.error('Error anulando pedido virtual:', error);
      alert('No se pudo anular el pedido. Intenta escribirnos por WhatsApp.');
    }
  };

  const handleStoreLogin = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    try {
      const user = await loginStoreUser({
        telefono: authForm.telefono,
        password: authForm.password,
      });
      persistStoreSession(user);
      setAuthForm((current) => ({
        ...current,
        password: '',
        confirmPassword: '',
      }));
    } catch (error) {
      console.error('Error iniciando sesion de tienda:', error);
      setAuthError('Telefono o contrasena incorrecta.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStoreRegister = async (event) => {
    event.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    if (authForm.password !== authForm.confirmPassword) {
      setAuthLoading(false);
      setAuthError('Las contrasenas no coinciden.');
      return;
    }

    try {
      const user = await registerStoreUser(authForm);
      persistStoreSession(user);
      setAuthForm({
        nombre: '',
        telefono: '',
        password: '',
        confirmPassword: '',
        direccion: '',
        referencia: '',
      });
    } catch (error) {
      console.error('Error registrando usuario de tienda:', error);
      if (error.code === 'USER_EXISTS') {
        setAuthError('Ese telefono ya tiene cuenta. Inicia sesion.');
        setAuthMode('login');
      } else {
        setAuthError('Completa nombre, telefono, contrasena y direccion.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const handleProfileSave = async (profile) => {
    if (!currentUser) {
      return;
    }

    setSubmitting(true);
    try {
      const nextUser = await updateStoreUserProfile(currentUser, profile);
      persistStoreSession(nextUser);
      setProfileOpen(false);
    } catch (error) {
      console.error('Error actualizando perfil:', error);
      alert('No se pudo actualizar tu perfil.');
    } finally {
      setSubmitting(false);
    }
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

    if (!currentUser) {
      alert('Inicia sesion para crear tu pedido.');
      return;
    }

    if (cartItems.length === 0) {
      alert('Agrega al menos un producto.');
      return;
    }

    if (!currentUser.direccion) {
      alert('Agrega tu direccion antes de enviar el pedido.');
      setProfileOpen(true);
      return;
    }

    setSubmitting(true);

    try {
      const fullAddress = currentUser.referencia
        ? `${currentUser.direccion} | Ref: ${currentUser.referencia}`
        : currentUser.direccion;

      const order = await onCreateOrder(
        {
          cliente: currentUser.nombre,
          clienteCodigo: currentUser.codigo,
          clienteFirebaseKey: currentUser.clientKey,
          storeUserKey: currentUser.key,
          direccion: fullAddress,
          telefono: currentUser.telefono,
          referencia: currentUser.referencia,
          items: cartItems,
          total: totalAmount,
          observaciones: notes.trim(),
          metodoPago: customer.metodoPago,
        },
        { channel: STORE_CHANNEL }
      );

      setCreatedOrder(order);
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
          position: relative;
          isolation: isolate;
          overflow-x: hidden;
          background:
            radial-gradient(circle at 12% 12%, rgba(123, 16, 34, 0.08), transparent 28%),
            radial-gradient(circle at 88% 28%, rgba(217, 74, 63, 0.08), transparent 30%),
            linear-gradient(180deg, #fffafa 0%, #f8f4f4 48%, #f7f7f8 100%);
          color: #111827;
          font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        }
        .store-shell::before {
          content: '';
          position: fixed;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          opacity: 0.24;
          background-image: url("data:image/svg+xml,%3Csvg width='420' height='420' viewBox='0 0 420 420' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%237b1022' stroke-width='5' stroke-linecap='round' stroke-linejoin='round' opacity='.24'%3E%3Cpath d='M40 85 C82 42 128 42 170 85 S258 128 300 85'/%3E%3Cpath d='M54 138 C96 96 142 96 184 138 S272 180 314 138'/%3E%3Ccircle cx='330' cy='72' r='34' stroke-width='18'/%3E%3Cpath d='M80 302 C96 252 160 246 188 288 C204 314 184 348 142 354 C96 360 66 334 80 302Z'/%3E%3Cpath d='M250 300 C264 260 326 256 340 300Z'/%3E%3Cpath d='M252 308 H342 M270 334 C286 350 316 350 334 334'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 420px 420px;
          background-position: 3% 8%;
        }
        .store-shell * {
          box-sizing: border-box;
        }
        .store-page {
          position: relative;
          z-index: 1;
          max-width: 1180px;
          margin: 0 auto;
          padding: ${isDashboard ? '18px' : '12px'} 18px 108px;
        }
        .store-page.with-floating-cart {
          max-width: 1500px;
        }
        .store-auth-page {
          position: relative;
          z-index: 1;
          min-height: ${isDashboard ? 'calc(100vh - 64px)' : '100vh'};
          display: grid;
          grid-template-columns: minmax(0, 1.05fr) minmax(340px, 0.75fr);
          gap: 22px;
          align-items: center;
          max-width: 1120px;
          margin: 0 auto;
          padding: 28px 18px;
        }
        .store-auth-hero {
          min-height: 560px;
          border-radius: 24px;
          padding: 28px;
          color: #fffaf5;
          background:
            linear-gradient(90deg, rgba(48, 8, 15, 0.52), rgba(95, 14, 27, 0.2) 55%, rgba(255, 255, 255, 0.05)),
            url('${STORE_BACKGROUND_PATH}') center / cover;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          box-shadow: 0 26px 60px rgba(15, 23, 42, 0.18);
        }
        .store-auth-copy {
          max-width: 520px;
          padding: 18px;
          border: 1px solid rgba(255, 250, 245, 0.22);
          border-radius: 22px;
          background: linear-gradient(135deg, rgba(68, 13, 21, 0.42), rgba(68, 13, 21, 0.16));
          box-shadow: 0 20px 45px rgba(38, 6, 12, 0.16);
          backdrop-filter: blur(8px);
        }
        .store-auth-hero h1 {
          margin: 14px 0 10px;
          max-width: 500px;
          font-size: clamp(32px, 4.6vw, 56px);
          line-height: 0.98;
          letter-spacing: -0.045em;
          text-shadow: 0 12px 26px rgba(38, 6, 12, 0.24);
        }
        .store-auth-copy p {
          max-width: 460px;
          margin: 0;
          font-size: 16px;
          line-height: 1.45;
          color: rgba(255, 250, 245, 0.9);
        }
        .store-auth-pills {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .store-auth-pills .store-status-pill {
          background: rgba(255, 250, 245, 0.9);
          color: #3b1216;
          box-shadow: 0 12px 26px rgba(38, 6, 12, 0.12);
        }
        .store-auth-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          padding: 20px;
          box-shadow: 0 22px 54px rgba(15, 23, 42, 0.12);
        }
        .store-auth-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 14px;
          padding: 4px;
          border-radius: 999px;
          background: #f3f4f6;
        }
        .store-auth-toggle button {
          border: 0;
          border-radius: 999px;
          padding: 11px;
          background: transparent;
          cursor: pointer;
          font-weight: 900;
          color: #6b7280;
        }
        .store-auth-toggle button.active {
          background: #111827;
          color: #ffffff;
        }
        .store-auth-error {
          border-radius: 12px;
          padding: 10px 12px;
          background: #fee2e2;
          color: #991b1b;
          font-size: 13px;
          font-weight: 900;
          margin-bottom: 10px;
        }
        .store-account-card {
          margin: 0 0 14px;
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .store-account-card strong {
          display: block;
        }
        .store-account-card span {
          display: block;
          margin-top: 2px;
          color: #6b7280;
          font-size: 13px;
          font-weight: 700;
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
          background: rgba(255, 250, 250, 0.9);
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
          align-items: center;
        }
        .store-icon-button,
        .store-order-status-button,
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
        .store-order-status-button:hover,
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
        .store-order-status-button {
          min-height: 42px;
          border-radius: 999px;
          padding: 0 16px;
          background: linear-gradient(135deg, #7b1022, #d94a3f);
          color: #fffaf5;
          box-shadow: 0 14px 28px rgba(123, 16, 34, 0.2);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.04em;
          white-space: nowrap;
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
        .store-subtabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 8px 0 0;
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
        .store-subtabs .store-chip {
          padding: 8px 13px;
          font-size: 13px;
          background: #f3f4f6;
        }
        .store-subtabs .store-chip.active {
          background: #ef4444;
          border-color: #ef4444;
          color: #ffffff;
        }
        .store-promo {
          margin: 12px 0 18px;
        }
        .store-section-title {
          font-size: 18px;
          font-weight: 900;
          margin: 0 0 10px;
        }
        .store-stories {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .store-story {
          flex: 0 0 82px;
          border: 0;
          background: transparent;
          color: #111827;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.15;
          cursor: pointer;
          padding: 0;
          text-align: center;
        }
        .store-story-ring {
          width: 74px;
          height: 74px;
          margin: 0 auto 7px;
          border-radius: 999px;
          padding: 3px;
          background: conic-gradient(from 160deg, #fbbf24, #ef4444, #991b1b, #fbbf24);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 24px rgba(153, 27, 27, 0.16);
        }
        .store-story-ring img {
          width: 100%;
          height: 100%;
          border: 3px solid #ffffff;
          border-radius: 999px;
          object-fit: cover;
          background: #ffffff;
        }
        .store-story:hover .store-story-ring {
          transform: translateY(-1px);
        }
        .store-story-title {
          display: block;
          white-space: normal;
        }
        .store-promo-viewer {
          width: min(420px, calc(100vw - 28px));
          max-height: calc(100vh - 36px);
          background: #0f172a;
          border-radius: 18px;
          padding: 12px;
          box-shadow: 0 22px 56px rgba(15, 23, 42, 0.28);
        }
        .store-promo-viewer img {
          width: 100%;
          max-height: calc(100vh - 160px);
          object-fit: contain;
          border-radius: 12px;
          background: #111827;
        }
        .store-promo-viewer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: #ffffff;
          margin-bottom: 10px;
        }
        .store-promo-viewer-actions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
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
        .store-floating-cart {
          position: fixed;
          top: ${isDashboard ? '148px' : '132px'};
          right: max(18px, calc((100vw - 1500px) / 2 + 18px));
          z-index: 110;
          width: 300px;
          max-height: calc(100vh - 170px);
          border: 1px solid rgba(123, 16, 34, 0.12);
          border-radius: 26px;
          background: rgba(255, 255, 255, 0.92);
          color: #111827;
          overflow: hidden;
          box-shadow: 0 26px 70px rgba(123, 16, 34, 0.18);
          backdrop-filter: blur(18px);
        }
        .store-floating-cart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 16px 16px 12px;
          background: linear-gradient(135deg, rgba(123, 16, 34, 0.08), rgba(217, 74, 63, 0.04));
        }
        .store-floating-cart-head strong {
          display: block;
          font-size: 16px;
        }
        .store-floating-cart-head span {
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
        }
        .store-floating-cart-items {
          max-height: 290px;
          overflow: auto;
          padding: 6px 14px 2px;
        }
        .store-floating-cart-item {
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr);
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid #f0e6e7;
        }
        .store-floating-cart-item:last-child {
          border-bottom: 0;
        }
        .store-floating-cart-thumb {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          object-fit: contain;
          background: #fff7f4;
          border: 1px solid #f1dfe0;
        }
        .store-floating-cart-name {
          margin: 0 0 6px;
          color: #374151;
          font-size: 12px;
          font-weight: 900;
          line-height: 1.25;
        }
        .store-floating-cart-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .store-floating-cart-controls button {
          width: 26px;
          height: 26px;
          border: 1px solid #ead8da;
          border-radius: 999px;
          background: #ffffff;
          color: #7b1022;
          cursor: pointer;
          font-weight: 950;
        }
        .store-floating-cart-controls strong {
          margin-left: auto;
          color: #111827;
          font-size: 12px;
          white-space: nowrap;
        }
        .store-floating-qty-input,
        .store-qty-input {
          min-width: 0;
          border: 1px solid #ead8da;
          border-radius: 999px;
          background: #ffffff;
          color: #111827;
          font: inherit;
          font-weight: 900;
          text-align: center;
          outline: 0;
        }
        .store-floating-qty-input {
          width: 64px;
          height: 28px;
          font-size: 12px;
        }
        .store-floating-cart-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px 16px 16px;
          border-top: 1px solid #f0e6e7;
        }
        .store-floating-cart-total small {
          display: block;
          color: #9f6b70;
          font-size: 11px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .store-floating-cart-total strong {
          display: block;
          margin-top: 2px;
          color: #111827;
          font-size: 18px;
        }
        .store-quantity-notice {
          position: fixed;
          left: 50%;
          bottom: 28px;
          z-index: 260;
          transform: translateX(-50%);
          width: min(460px, calc(100vw - 28px));
          border-radius: 999px;
          padding: 13px 18px;
          background: #7b1022;
          color: #fffaf5;
          text-align: center;
          font-size: 14px;
          font-weight: 950;
          box-shadow: 0 18px 42px rgba(123, 16, 34, 0.24);
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
        .store-stepper .store-qty-input {
          width: 100%;
          height: 46px;
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
        .store-friendly-status {
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          padding: 16px;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
        }
        .store-friendly-status::after {
          content: '';
          position: absolute;
          inset: auto -38px -54px auto;
          width: 132px;
          height: 132px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.68);
        }
        .store-friendly-head {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .store-status-emoji {
          width: 48px;
          height: 48px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          background: #ffffff;
          font-size: 26px;
          box-shadow: 0 12px 25px rgba(15, 23, 42, 0.08);
        }
        .store-status-message {
          position: relative;
          z-index: 1;
          margin: 12px 0 0;
          color: #475569;
          line-height: 1.45;
        }
        .store-progress {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          margin-top: 14px;
        }
        .store-progress-step {
          min-height: 36px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          color: #94a3b8;
          font-size: 11px;
          font-weight: 900;
          text-align: center;
        }
        .store-progress-step.done {
          color: #ffffff;
        }
        .store-order-meta {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 14px;
        }
        .store-order-meta span {
          display: block;
          color: #64748b;
          font-size: 11px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .store-order-meta strong {
          display: block;
          margin-top: 2px;
          color: #111827;
          font-size: 13px;
        }
        .store-whatsapp-button {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 14px;
          border-radius: 999px;
          background: #16a34a;
          color: #ffffff;
          font-weight: 950;
          text-decoration: none;
          box-shadow: 0 16px 30px rgba(22, 163, 74, 0.24);
        }
        .store-cancel-order-button {
          position: relative;
          z-index: 1;
          width: 100%;
          min-height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 10px;
          border: 1px solid #fecaca;
          border-radius: 999px;
          background: #fff7f7;
          color: #dc2626;
          cursor: pointer;
          font: inherit;
          font-weight: 950;
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
        .store-section-label {
          margin: 14px 0 8px;
          color: #7b1022;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .store-history-toggle {
          width: 100%;
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 14px;
          border: 1px solid #ead8da;
          border-radius: 16px;
          padding: 0 14px;
          background: #fff8f6;
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          font-weight: 950;
        }
        .store-history-toggle span {
          display: inline-flex;
          min-width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #7b1022;
          color: #fffaf5;
          font-size: 12px;
        }
        .store-history-list {
          margin-top: 8px;
        }
        .store-status-items {
          position: relative;
          z-index: 1;
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #f1f2f4;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }
        @media (min-width: 1181px) {
          .store-page.with-floating-cart {
            padding-right: 336px;
          }
        }
        @media (max-width: 1180px) {
          .store-floating-cart {
            top: auto;
            right: 14px;
            bottom: 14px;
            left: 14px;
            width: auto;
            max-height: none;
            border-radius: 24px;
          }
          .store-floating-cart-items {
            display: none;
          }
          .store-floating-cart-head,
          .store-floating-cart-total {
            padding: 12px 14px;
          }
          .store-page.with-floating-cart {
            padding-right: 18px;
          }
          .store-quantity-notice {
            bottom: 116px;
          }
        }
        @media (max-width: 980px) {
          .store-auth-page {
            grid-template-columns: 1fr;
          }
          .store-auth-hero {
            min-height: 430px;
          }
          .store-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 720px) {
          .store-page {
            padding-left: 14px;
            padding-right: 14px;
            padding-bottom: 160px;
          }
          .store-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 18px 14px;
          }
          .store-story {
            flex-basis: 76px;
          }
          .store-story-ring {
            width: 68px;
            height: 68px;
          }
          .store-detail-grid {
            grid-template-columns: 1fr;
          }
          .store-product-name {
            font-size: 14px;
          }
          .store-brand-row {
            align-items: flex-start;
          }
          .store-actions {
            flex-direction: column;
            align-items: flex-end;
          }
          .store-order-status-button {
            min-height: 38px;
            padding: 0 12px;
            font-size: 11px;
          }
          .store-auth-hero {
            min-height: 420px;
            padding: 18px;
            border-radius: 20px;
          }
          .store-auth-copy {
            max-width: 100%;
            padding: 14px;
          }
          .store-auth-hero h1 {
            font-size: clamp(30px, 10vw, 42px);
          }
          .store-order-meta,
          .store-progress {
            grid-template-columns: 1fr;
          }
          .store-progress-step {
            min-height: 32px;
          }
        }
      `}</style>

      {!currentUser ? (
        <StoreAuthView
          authMode={authMode}
          authForm={authForm}
          authError={authError}
          authLoading={authLoading}
          onAuthModeChange={(mode) => {
            setAuthMode(mode);
            setAuthError('');
          }}
          onFormChange={updateAuthForm}
          onLogin={handleStoreLogin}
          onRegister={handleStoreRegister}
        />
      ) : (
        <>
      <div className={`store-page ${cartItems.length > 0 ? 'with-floating-cart' : ''}`}>
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

        <div className="store-account-card">
          <div>
            <strong>{currentUser.nombre}</strong>
            <span>
              {currentUser.direccion}
              {currentUser.referencia ? ` | Ref: ${currentUser.referencia}` : ''}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="store-button secondary" onClick={() => setProfileOpen(true)}>
              Perfil
            </button>
            <button type="button" className="store-button secondary" onClick={clearStoreSession}>
              Salir
            </button>
          </div>
        </div>

        <header className="store-top">
          <div className="store-brand-row">
            <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
            <div className="store-title">Tienda Virtual Carnes San Martin Granada</div>
            <div className="store-actions">
              <button
                type="button"
                className="store-order-status-button"
                title="Estado de mi pedido"
                onClick={() => setOrdersOpen(true)}
              >
                ESTADO DE MI PEDIDO
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
                onClick={() => {
                  setActiveCategory(category.id);
                  setActiveSubcategory('todas');
                }}
              >
                {category.label}
              </button>
            ))}
          </nav>

          {subcategoryOptions.length > 0 && (
            <nav className="store-subtabs">
              <button
                type="button"
                className={`store-chip ${activeSubcategory === 'todas' ? 'active' : ''}`}
                onClick={() => setActiveSubcategory('todas')}
              >
                Todas
              </button>
              {subcategoryOptions.map((subcategory) => (
                <button
                  key={subcategory}
                  type="button"
                  className={`store-chip ${activeSubcategory === subcategory ? 'active' : ''}`}
                  onClick={() => setActiveSubcategory(subcategory)}
                >
                  {subcategory}
                </button>
              ))}
            </nav>
          )}
        </header>

        <section className="store-promo">
          <h2 className="store-section-title">Promociones activas</h2>
          <div className="store-stories">
            {STORE_PROMOTIONS.map((promotion) => (
              <button
                key={promotion.id}
                type="button"
                className="store-story"
                onClick={() => setSelectedPromotion(promotion)}
              >
                <span className="store-story-ring">
                  <img src={promotion.image} alt={promotion.title} />
                </span>
                <span className="store-story-title">{promotion.title}</span>
              </button>
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
                setActiveSubcategory('todas');
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
                      onClick={() =>
                        updateQuantity(
                          product.code,
                          quantity > 0 ? quantity + getQuantityStep(product) : 1
                        )
                      }
                    >
                      +
                    </button>
                    <h3 className="store-product-name" onClick={() => openProduct(product)}>
                      {product.name}
                    </h3>
                    <p className="store-price">{formatCurrency(product.price)}</p>
                    <p className="store-unit">
                      {quantity > 0
                        ? `${formatStoreQuantity(quantity, product.unit)} ${product.unit} en carrito`
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
        <FloatingCart
          cartItems={cartItems}
          cartCount={cartCount}
          totalAmount={totalAmount}
          onCheckout={() => setCheckoutOpen(true)}
          onQuantityChange={updateQuantity}
        />
      )}

      {quantityNotice && <div className="store-quantity-notice">{quantityNotice}</div>}

      {selectedProduct && (
        <ProductSheet
          product={selectedProduct}
          quantity={Number(cart[selectedProduct.code] || 0)}
          onClose={() => setSelectedProduct(null)}
          onQuantityChange={(nextQuantity) => updateQuantity(selectedProduct.code, nextQuantity)}
        />
      )}

      {selectedPromotion && (
        <PromotionViewer
          promotion={selectedPromotion}
          onClose={() => setSelectedPromotion(null)}
          onViewCombos={() => {
            setSelectedPromotion(null);
            setQuery('');
            setActiveCategory('promociones');
            setActiveSubcategory('todas');
          }}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          cartItems={cartItems}
          currentUser={currentUser}
          customer={customer}
          notes={notes}
          submitting={submitting}
          totalAmount={totalAmount}
          onClose={() => setCheckoutOpen(false)}
          onCustomerChange={updateCustomer}
          onEditProfile={() => setProfileOpen(true)}
          onNotesChange={setNotes}
          onSubmit={submitOrder}
        />
      )}

      {ordersOpen && (
        <OrdersSheet
          currentUser={currentUser}
          orders={customerOrders}
          createdOrder={createdOrder}
          onCancelOrder={cancelCustomerOrder}
          onClose={() => setOrdersOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfileSheet
          user={currentUser}
          saving={submitting}
          onClose={() => setProfileOpen(false)}
          onSave={handleProfileSave}
        />
      )}
        </>
      )}
    </div>
  );
}

function StoreAuthView({
  authMode,
  authForm,
  authError,
  authLoading,
  onAuthModeChange,
  onFormChange,
  onLogin,
  onRegister,
}) {
  const isRegister = authMode === 'register';

  return (
    <div className="store-auth-page">
      <section className="store-auth-hero">
        <div className="store-auth-copy">
          <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
          <h1>Tienda Virtual Carnes San Martin Granada</h1>
          <p>
            Crea tu cuenta una vez, guarda tu direccion y revisa el estado de tus pedidos desde el mismo lugar.
          </p>
        </div>
        <div className="store-auth-pills">
          <span className="store-status-pill">
            Pedidos a cocina
          </span>
          <span className="store-status-pill">
            Historial por usuario
          </span>
          <span className="store-status-pill">
            Direccion guardada
          </span>
        </div>
      </section>

      <section className="store-auth-card">
        <div className="store-auth-toggle">
          <button
            type="button"
            className={!isRegister ? 'active' : ''}
            onClick={() => onAuthModeChange('login')}
          >
            Ingresar
          </button>
          <button
            type="button"
            className={isRegister ? 'active' : ''}
            onClick={() => onAuthModeChange('register')}
          >
            Crear cuenta
          </button>
        </div>

        <h2 style={{ margin: '0 0 4px', fontSize: 26 }}>
          {isRegister ? 'Crea tu usuario' : 'Bienvenido'}
        </h2>
        <p style={{ margin: '0 0 16px', color: '#6b7280', fontWeight: 700 }}>
          {isRegister
            ? 'Usaremos estos datos para tus pedidos delivery.'
            : 'Ingresa con tu telefono y contrasena.'}
        </p>

        {authError && <div className="store-auth-error">{authError}</div>}

        <form className="store-form" onSubmit={isRegister ? onRegister : onLogin}>
          {isRegister && (
            <input
              className="store-field"
              value={authForm.nombre}
              onChange={(event) => onFormChange('nombre', event.target.value)}
              placeholder="Nombre completo"
              required
            />
          )}
          <input
            className="store-field"
            value={authForm.telefono}
            onChange={(event) => onFormChange('telefono', event.target.value)}
            placeholder="Telefono o WhatsApp"
            required
          />
          <input
            className="store-field"
            type="password"
            value={authForm.password}
            onChange={(event) => onFormChange('password', event.target.value)}
            placeholder="Contrasena"
            required
          />
          {isRegister && (
            <>
              <input
                className="store-field"
                type="password"
                value={authForm.confirmPassword}
                onChange={(event) => onFormChange('confirmPassword', event.target.value)}
                placeholder="Confirmar contrasena"
                required
              />
              <input
                className="store-field"
                value={authForm.direccion}
                onChange={(event) => onFormChange('direccion', event.target.value)}
                placeholder="Direccion de entrega"
                required
              />
              <input
                className="store-field"
                value={authForm.referencia}
                onChange={(event) => onFormChange('referencia', event.target.value)}
                placeholder="Referencia"
              />
            </>
          )}
          <button type="submit" className="store-button" disabled={authLoading}>
            {authLoading ? 'Procesando...' : isRegister ? 'Crear cuenta y entrar' : 'Entrar a la tienda'}
          </button>
        </form>
      </section>
    </div>
  );
}

function ProfileSheet({ user, saving, onClose, onSave }) {
  const [profile, setProfile] = useState({
    nombre: user?.nombre || '',
    direccion: user?.direccion || '',
    referencia: user?.referencia || '',
  });

  const updateProfile = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!profile.nombre.trim() || !profile.direccion.trim()) {
      alert('Nombre y direccion son obligatorios.');
      return;
    }

    onSave(profile);
  };

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>Mi perfil</strong>
        </div>

        <form className="store-form" onSubmit={handleSubmit}>
          <input
            className="store-field"
            value={profile.nombre}
            onChange={(event) => updateProfile('nombre', event.target.value)}
            placeholder="Nombre completo"
          />
          <input className="store-field" value={user?.telefono || ''} disabled />
          <input
            className="store-field"
            value={profile.direccion}
            onChange={(event) => updateProfile('direccion', event.target.value)}
            placeholder="Direccion de entrega"
          />
          <input
            className="store-field"
            value={profile.referencia}
            onChange={(event) => updateProfile('referencia', event.target.value)}
            placeholder="Referencia"
          />
          <button type="submit" className="store-button" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PromotionViewer({ promotion, onClose, onViewCombos }) {
  return (
    <div className="store-sheet-overlay">
      <div className="store-promo-viewer">
        <div className="store-promo-viewer-head">
          <strong>{promotion.title}</strong>
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
        </div>
        <img src={promotion.image} alt={promotion.title} />
        <div className="store-promo-viewer-actions">
          <button type="button" className="store-button" style={{ flex: 1 }} onClick={onViewCombos}>
            Ver combos
          </button>
          <button type="button" className="store-button secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function QuantityInput({ value, step, className, onChange, ariaLabel }) {
  const [draftValue, setDraftValue] = useState(value ? String(value) : '');

  useEffect(() => {
    setDraftValue(value ? String(value) : '');
  }, [value]);

  const handleChange = (event) => {
    const nextValue = event.target.value.replace(',', '.');

    if (!/^\d*\.?\d*$/.test(nextValue)) {
      return;
    }

    setDraftValue(nextValue);
    onChange(nextValue);
  };

  return (
    <input
      className={className}
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={draftValue}
      placeholder="0"
      onChange={handleChange}
      onBlur={() => setDraftValue(value ? String(value) : '')}
    />
  );
}

function FloatingCart({ cartItems, cartCount, totalAmount, onCheckout, onQuantityChange }) {
  return (
    <aside className="store-floating-cart" aria-label="Carrito flotante">
      <div className="store-floating-cart-head">
        <div>
          <strong>Tu carrito</strong>
          <span>{cartCount === 1 ? '1 producto agregado' : `${cartCount} productos agregados`}</span>
        </div>
        <button type="button" className="store-button" onClick={onCheckout}>
          Ver pedido
        </button>
      </div>

      <div className="store-floating-cart-items">
        {cartItems.map((item) => {
          const step = getQuantityStep({ unit: item.unidad });
          const currentQuantity = Number(item.cantidad || 0);

          return (
            <div key={item.codigo} className="store-floating-cart-item">
              <img
                className="store-floating-cart-thumb"
                src={item.image || LOGO_PATH}
                alt={item.nombre}
              />
              <div>
                <p className="store-floating-cart-name">{item.nombre}</p>
                <div className="store-floating-cart-controls">
                  <button
                    type="button"
                    aria-label={`Quitar ${item.nombre}`}
                    onClick={() => onQuantityChange(item.codigo, currentQuantity - step)}
                  >
                    -
                  </button>
                  <QuantityInput
                    className="store-floating-qty-input"
                    step={step}
                    value={currentQuantity}
                    ariaLabel={`Cantidad de ${item.nombre}`}
                    onChange={(nextValue) => onQuantityChange(item.codigo, nextValue)}
                  />
                  <button
                    type="button"
                    aria-label={`Agregar ${item.nombre}`}
                    onClick={() => onQuantityChange(item.codigo, currentQuantity + step)}
                  >
                    +
                  </button>
                  <strong>{formatCurrency(item.subtotal)}</strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="store-floating-cart-total">
        <div>
          <small>Total</small>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>
        <button type="button" className="store-button" onClick={onCheckout}>
          Confirmar
        </button>
      </div>
    </aside>
  );
}

function ProductSheet({ product, quantity, onClose, onQuantityChange }) {
  const subtotal = Number(quantity || 0) * Number(product.price || 0);
  const step = getQuantityStep(product);

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
              {getQuickQuantities(product).map((weight) => (
                <button
                  key={weight}
                  type="button"
                  className={`store-chip ${quantity === weight ? 'active' : ''}`}
                  onClick={() => onQuantityChange(weight)}
                >
                  {formatStoreQuantity(weight, product.unit)} {product.unit}
                </button>
              ))}
            </div>

            <div className="store-stepper">
              <button type="button" onClick={() => onQuantityChange(quantity - step)}>
                -
              </button>
              <QuantityInput
                className="store-qty-input"
                step={step}
                value={quantity}
                ariaLabel={`Cantidad de ${product.name}`}
                onChange={onQuantityChange}
              />
              <button type="button" onClick={() => onQuantityChange(quantity > 0 ? quantity + step : 1)}>
                +
              </button>
            </div>

            <p className="store-unit" style={{ marginBottom: 14 }}>
              {quantity > 0
                ? `${formatStoreQuantity(quantity, product.unit)} ${product.unit} seleccionado`
                : `Elige la cantidad en ${product.unit}`}
            </p>

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
  currentUser,
  customer,
  notes,
  submitting,
  totalAmount,
  onClose,
  onCustomerChange,
  onEditProfile,
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
                {formatStoreQuantity(item.cantidad, item.unidad)} {item.unidad} x{' '}
                {formatCurrency(item.precioUnitario)}
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
          <div className="store-status-card" style={{ marginTop: 0 }}>
            <div className="store-status-pill">Entrega</div>
            <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
            <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
              {currentUser.telefono}
              <br />
              {currentUser.direccion}
              {currentUser.referencia ? ` | Ref: ${currentUser.referencia}` : ''}
            </div>
            <button
              type="button"
              className="store-button secondary"
              style={{ marginTop: 10 }}
              onClick={onEditProfile}
            >
              Cambiar direccion
            </button>
          </div>
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
            {submitting ? 'Enviando...' : 'Enviar pedido'}
          </button>
        </form>
      </div>
    </div>
  );
}

function OrdersSheet({ currentUser, orders, createdOrder, onCancelOrder, onClose }) {
  const [showPreviousOrders, setShowPreviousOrders] = useState(false);
  const listedOrders = Array.isArray(orders) ? orders : [];
  const isSameCustomerOrder = (left, right) => {
    if (!left || !right) {
      return false;
    }

    if (left.firebaseKey && right.firebaseKey && left.firebaseKey === right.firebaseKey) {
      return true;
    }

    return left.id !== undefined && right.id !== undefined && String(left.id) === String(right.id);
  };
  const liveCreatedOrder = createdOrder
    ? listedOrders.find((order) => isSameCustomerOrder(order, createdOrder))
    : null;
  const activeOrder = liveCreatedOrder || createdOrder || listedOrders[0] || null;
  const previousOrders = activeOrder
    ? listedOrders.filter((order) => !isSameCustomerOrder(order, activeOrder))
    : listedOrders;

  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>ESTADO DE MI PEDIDO</strong>
        </div>

        <div className="store-status-card" style={{ marginTop: 0 }}>
          <div className="store-status-pill">Cuenta</div>
          <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
          <div style={{ color: '#6b7280' }}>{currentUser.telefono}</div>
        </div>

        {activeOrder ? (
          <>
            <div className="store-section-label">Pedido actual</div>
            <OrderStatusCard
              order={activeOrder}
              currentUser={currentUser}
              highlight
              onCancelOrder={onCancelOrder}
            />
          </>
        ) : (
          <div className="store-empty" style={{ marginTop: 12 }}>
            Todavia no tienes pedidos en esta cuenta.
          </div>
        )}

        {previousOrders.length > 0 && (
          <>
            <button
              type="button"
              className="store-history-toggle"
              onClick={() => setShowPreviousOrders((value) => !value)}
            >
              {showPreviousOrders ? 'Ocultar pedidos anteriores' : 'Ver pedidos anteriores'}
              <span>{previousOrders.length}</span>
            </button>

            {showPreviousOrders && (
              <div className="store-history-list">
                {previousOrders.map((order) => (
                  <OrderStatusCard
                    key={order.firebaseKey || order.id}
                    order={order}
                    currentUser={currentUser}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrderStatusCard({ order, currentUser, highlight = false, onCancelOrder }) {
  const meta = getCustomerStatusMeta(order);
  const orderNumber = formatOrderNumber(order.id);
  const cookName = order.cocinero ? getShortPersonName(order.cocinero, order.cocinero) : 'Por asignar';
  const riderName = order.repartidor
    ? getShortPersonName(order.repartidor, order.repartidor)
    : 'Por asignar';
  const whatsappLink = buildOrderWhatsAppLink(order, currentUser);
  const statusKey = normalizeCustomerOrderStatus(order.estado);
  const canCancelOrder =
    typeof onCancelOrder === 'function' && !['cancelado', 'enviado'].includes(statusKey);

  return (
    <div
      className="store-status-card store-friendly-status"
      style={{
        borderColor: meta.accent,
        background: `linear-gradient(135deg, ${meta.soft} 0%, #ffffff 72%)`,
      }}
    >
      <div className="store-friendly-head">
        <span className="store-status-emoji" aria-hidden="true">
          {meta.emoji}
        </span>
        <div style={{ flex: 1 }}>
          <div
            className="store-status-pill"
            style={{
              background: highlight ? '#111827' : '#ffffff',
              color: highlight ? '#ffffff' : '#111827',
            }}
          >
            Pedido #{orderNumber}
          </div>
          <h3 style={{ margin: '10px 0 2px', color: '#111827' }}>{meta.label}</h3>
          <div style={{ color: meta.accent, fontSize: 13, fontWeight: 900 }}>
            {order.estado || 'Pendiente'}
          </div>
        </div>
      </div>

      <p className="store-status-message">{meta.message}</p>

      <div className="store-progress" aria-label="Progreso del pedido">
        {ORDER_PROGRESS_STEPS.map((step, index) => {
          const isDone = meta.progress >= index + 1;
          return (
            <span
              key={step}
              className={`store-progress-step ${isDone ? 'done' : ''}`}
              style={isDone ? { background: meta.accent } : undefined}
            >
              {step}
            </span>
          );
        })}
      </div>

      <div className="store-order-meta">
        <div>
          <span>Ingreso</span>
          <strong>
            {order.fecha || 'Hoy'} {order.timestampIngreso || ''}
          </strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatCurrency(order.total)}</strong>
        </div>
        <div>
          <span>Carnicero</span>
          <strong>
            {cookName}
            {order.timestampPreparacion ? ` - ${order.timestampPreparacion}` : ''}
          </strong>
        </div>
        <div>
          <span>Entrega</span>
          <strong>
            {riderName}
            {order.timestampEnviado ? ` - ${order.timestampEnviado}` : ''}
          </strong>
        </div>
      </div>

      {Array.isArray(order.items) && order.items.length > 0 && (
        <div className="store-status-items">
          {order.items.map((item) => (
            <div key={`${order.firebaseKey || order.id}-${item.codigo || item.nombre}`}>
              {formatStoreQuantity(item.cantidad, item.unidad)} {item.unidad} {item.nombre}
            </div>
          ))}
        </div>
      )}

      <a className="store-whatsapp-button" href={whatsappLink} target="_blank" rel="noreferrer">
        💬 Escribir a WhatsApp de la tienda
      </a>

      {canCancelOrder && (
        <button
          type="button"
          className="store-cancel-order-button"
          onClick={() => onCancelOrder(order)}
        >
          Anular pedido
        </button>
      )}
    </div>
  );
}
