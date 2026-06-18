import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
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

const formatStoreQuantity = (quantity, unit) =>
  String(unit).toLowerCase() === 'unidad' ? String(Number(quantity || 0)) : formatWeight(quantity);

const getQuickQuantities = (product) => (isUnitProduct(product) ? [1, 2, 3, 4] : QUICK_WEIGHTS);

export default function TiendaVirtualView({
  onCreateOrder,
  mode = 'public',
  publicStoreUrl = '#tienda',
}) {
  const [catalog, setCatalog] = useState(() => mergeCatalogProducts());
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [cart, setCart] = useState({});
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

  const updateQuantity = (code, nextValue) => {
    const product = activeProducts.find((item) => item.code === code) || catalog.find((item) => item.code === code);
    setCart((current) => ({
      ...current,
      [code]: clampQuantity(nextValue, product),
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
        .store-auth-page {
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
          color: #ffffff;
          background:
            linear-gradient(135deg, rgba(17, 24, 39, 0.16), rgba(127, 29, 29, 0.12)),
            url('${STORE_BACKGROUND_PATH}') center / cover;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          box-shadow: 0 26px 60px rgba(15, 23, 42, 0.18);
        }
        .store-auth-hero h1 {
          margin: 22px 0 10px;
          max-width: 560px;
          font-size: clamp(38px, 6vw, 74px);
          line-height: 0.9;
          letter-spacing: -0.06em;
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
        .store-status-items {
          margin-top: 10px;
          padding-top: 10px;
          border-top: 1px solid #f1f2f4;
          color: #6b7280;
          font-size: 13px;
          line-height: 1.5;
        }
        @media (max-width: 980px) {
          .store-auth-page {
            grid-template-columns: 1fr;
          }
          .store-auth-hero {
            min-height: 340px;
          }
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
          .store-cart-bar {
            left: 50%;
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
                      onClick={() => updateQuantity(product.code, quantity + getQuantityStep(product))}
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
        <div className="store-cart-bar">
          <div>
            <strong>{cartCount === 1 ? '1 producto' : `${cartCount} productos`}</strong>
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
        <div>
          <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
          <h1>Tienda Virtual Carnes San Martin Granada</h1>
          <p style={{ maxWidth: 480, margin: 0, fontSize: 18, lineHeight: 1.45, opacity: 0.9 }}>
            Crea tu cuenta una vez, guarda tu direccion y revisa el estado de tus pedidos desde el mismo lugar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className="store-status-pill" style={{ background: '#ffffff', color: '#111827' }}>
            Pedidos a cocina
          </span>
          <span className="store-status-pill" style={{ background: '#ffffff', color: '#111827' }}>
            Historial por usuario
          </span>
          <span className="store-status-pill" style={{ background: '#ffffff', color: '#111827' }}>
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
              <strong>{formatStoreQuantity(quantity, product.unit)} {product.unit}</strong>
              <button type="button" onClick={() => onQuantityChange(quantity + step)}>
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

function OrdersSheet({ currentUser, orders, createdOrder, onClose }) {
  return (
    <div className="store-sheet-overlay">
      <div className="store-sheet">
        <div className="store-sheet-head">
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
          <strong>Estado de pedido</strong>
        </div>

        <div className="store-status-card" style={{ marginTop: 0 }}>
          <div className="store-status-pill">Cuenta</div>
          <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
          <div style={{ color: '#6b7280' }}>{currentUser.telefono}</div>
        </div>

        {createdOrder && (
          <div className="store-status-card" style={{ borderColor: '#ef4444' }}>
            <div className="store-status-pill">Pedido #{formatOrderNumber(createdOrder.id)}</div>
            <h3 style={{ margin: '10px 0 4px' }}>{createdOrder.estado}</h3>
            <div style={{ color: '#6b7280' }}>{formatCurrency(createdOrder.total)}</div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="store-empty" style={{ marginTop: 12 }}>
            Todavia no tienes pedidos en esta cuenta.
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
              {Array.isArray(order.items) && order.items.length > 0 && (
                <div className="store-status-items">
                  {order.items.map((item) => (
                    <div key={`${order.firebaseKey}-${item.codigo}`}>
                      {formatStoreQuantity(item.cantidad, item.unidad)} {item.unidad} {item.nombre}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
