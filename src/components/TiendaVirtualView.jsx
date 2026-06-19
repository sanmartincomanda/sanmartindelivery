import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { get, ref, update } from 'firebase/database';
import { database } from '../firebase';
import {
  QUICK_WEIGHTS,
  STORE_PAYMENT_OPTIONS,
  STORE_PROMOTIONS,
} from '../data/tiendaVirtual';
import {
  getProductMinQuantity,
  getProductQuantityStep,
  isUnitMeasure,
  mergeCatalogProducts,
  STORE_CATALOG_PATH,
  STORE_CATALOG_META_PATH,
} from '../services/storeCatalog';
import {
  mergeStoreCategories,
  STORE_CATEGORIES_PATH,
} from '../services/storeCategories';
import {
  calculateCouponDiscount,
  mergeStoreCoupons,
  normalizeCouponCode,
  STORE_COUPONS_PATH,
} from '../services/storeCoupons';
import {
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsPlaceUrl,
  getBrowserLocation,
  hasLocation,
  normalizeLocation,
  reverseGeocodeLocation,
  searchLocationCandidates,
} from '../services/geo';
import {
  cleanStorePhone,
  loginStoreUser,
  registerStoreUser,
  updateStoreUserProfile,
} from '../services/storeUsers';
import {
  subscribeOrdersForStoreUser,
  formatOrderNumber,
  formatWeight,
  STORE_CHANNEL,
} from '../services/orders';

const LOGO_PATH = '/tienda/branding/logo.png';
const STORE_SESSION_KEY = 'sanmartin_store_user';
const STORE_CATALOG_CACHE_KEY = 'sanmartin_store_catalog_cache_v1';
const STORE_CATALOG_CACHE_VERSION = 2;
const STORE_WHATSAPP_NUMBER = '50584657949';
const ORDER_PROGRESS_STEPS = ['Recibido', 'Cocina', 'Listo', 'En camino', 'Entregado'];
const MAP_PICKER_DEFAULT_LOCATION = normalizeLocation({
  lat: 11.9299,
  lng: -85.956,
  label: 'Granada, Nicaragua',
});
const MAP_PICKER_TILE_SIZE = 256;
const MAP_PICKER_WIDTH = 360;
const MAP_PICKER_HEIGHT = 260;
const QUANTITY_EPSILON = 0.00001;
const STORE_STORY_DURATION_MS = 10000;

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const readStoreJsonCache = (key) => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return JSON.parse(window.localStorage.getItem(key) || 'null');
  } catch (error) {
    console.error(`No se pudo leer cache local de ${key}:`, error);
    return null;
  }
};

const writeStoreJsonCache = (key, value) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!value || typeof value !== 'object' || Object.keys(value).length === 0) {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`No se pudo guardar cache local de ${key}:`, error);
  }
};

const unwrapCatalogCache = (cachedValue) => {
  if (!cachedValue || typeof cachedValue !== 'object') {
    return {
      data: null,
      updatedAt: 0,
    };
  }

  if (
    Number(cachedValue.version || 0) === STORE_CATALOG_CACHE_VERSION &&
    cachedValue.data &&
    typeof cachedValue.data === 'object'
  ) {
    return {
      data: cachedValue.data,
      updatedAt: Number(cachedValue.updatedAt || 0),
    };
  }

  return {
    data: cachedValue,
    updatedAt: 0,
  };
};

const getInitialCatalogState = () => {
  const cachedCatalog = unwrapCatalogCache(readStoreJsonCache(STORE_CATALOG_CACHE_KEY));
  const hasCachedCatalog =
    Boolean(cachedCatalog.data) &&
    typeof cachedCatalog.data === 'object' &&
    Object.keys(cachedCatalog.data).length > 0;

  return {
    catalog: hasCachedCatalog ? mergeCatalogProducts(cachedCatalog.data) : [],
    loading: !hasCachedCatalog,
  };
};

const isUnitProduct = (product) => isUnitMeasure(product?.unit);

const getQuantityStep = (product) => getProductQuantityStep(product);

const getMinQuantity = (product) => getProductMinQuantity(product);

const clampQuantity = (value, product) => {
  const step = getQuantityStep(product);
  const minQuantity = getMinQuantity(product);
  const rounded = Math.round(Number(value || 0) / step) * step;
  if (rounded <= 0) {
    return 0;
  }

  return Number(Math.max(rounded, minQuantity).toFixed(3));
};

const isValidQuantityStep = (value, product) => {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    return true;
  }

  const minQuantity = getMinQuantity(product);
  if (numberValue < minQuantity - QUANTITY_EPSILON) {
    return false;
  }

  const step = getQuantityStep(product);
  const steps = (numberValue - minQuantity) / step;
  return Math.abs(steps - Math.round(steps)) < QUANTITY_EPSILON;
};

const formatStoreQuantity = (quantity, unit) =>
  String(unit).toLowerCase() === 'unidad' ? String(Number(quantity || 0)) : formatWeight(quantity);

const getQuickQuantities = (product) => {
  if (!product) {
    return QUICK_WEIGHTS;
  }

  const minQuantity = getMinQuantity(product);
  const step = getQuantityStep(product);
  const totalOptions = isUnitProduct(product) ? 4 : 5;

  return Array.from({ length: totalOptions }, (_, index) =>
    Number((minQuantity + index * step).toFixed(3))
  );
};

const getQuantityRuleMessage = (product) => {
  const minQuantity = getMinQuantity(product);
  const step = getQuantityStep(product);
  const minLabel = `${formatStoreQuantity(minQuantity, product?.unit)} ${product?.unit || ''}`.trim();
  const stepLabel = `${formatStoreQuantity(step, product?.unit)} ${product?.unit || ''}`.trim();

  if (!isUnitProduct(product) && step === 1) {
    return `Se vende desde ${minLabel} y solo permite pesos cerrados en incrementos de ${stepLabel}.`;
  }

  return `Se vende desde ${minLabel} en incrementos de ${stepLabel}.`;
};

const clampLatitude = (value) => Math.max(-85, Math.min(85, Number(value) || 0));

const normalizeLongitude = (value) => {
  const numeric = Number(value) || 0;
  return ((((numeric + 180) % 360) + 360) % 360) - 180;
};

const locationToWorldPoint = (location, zoom) => {
  const scale = MAP_PICKER_TILE_SIZE * 2 ** zoom;
  const lat = clampLatitude(location?.lat);
  const lng = normalizeLongitude(location?.lng);
  const sinLat = Math.sin((lat * Math.PI) / 180);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
};

const worldPointToLocation = (x, y, zoom) => {
  const scale = MAP_PICKER_TILE_SIZE * 2 ** zoom;
  const lng = normalizeLongitude((x / scale) * 360 - 180);
  const mercatorY = Math.PI - (2 * Math.PI * y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(mercatorY));

  return normalizeLocation({
    lat,
    lng,
    label: 'Punto seleccionado en mapa',
    updatedAt: Date.now(),
  });
};

const buildManualLocation = (lat, lng) =>
  normalizeLocation({
    lat: clampLatitude(lat),
    lng: normalizeLongitude(lng),
    label: 'Punto seleccionado en mapa',
    updatedAt: Date.now(),
  });

const removeTextAccents = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const LOCATION_ADDRESS_PLACEHOLDERS = [
  '',
  'ubicacion guardada desde el mapa',
  'ubicacion seleccionada en el mapa',
  'punto seleccionado en mapa',
];

const shouldAutofillAddress = (value) =>
  LOCATION_ADDRESS_PLACEHOLDERS.includes(removeTextAccents(value).trim());

const createEmptyDeliveryDraft = () => ({
  direccion: '',
  referencia: '',
  ubicacion: null,
});

const createUserDeliveryDraft = (user = {}) => ({
  direccion: String(user?.direccion || '').trim(),
  referencia: String(user?.referencia || '').trim(),
  ubicacion: normalizeLocation(user?.ubicacion),
});

const normalizeCustomerOrderStatus = (status) => {
  const normalizedStatus = removeTextAccents(status || 'Pendiente');

  if (normalizedStatus.includes('cancel')) {
    return 'cancelado';
  }

  if (normalizedStatus.includes('anulad')) {
    return 'cancelado';
  }

  if (normalizedStatus.includes('enviado')) {
    return 'enviado';
  }

  if (normalizedStatus.includes('entregado')) {
    return 'entregado';
  }

  if (normalizedStatus.includes('preparado')) {
    return 'preparado';
  }

  if (normalizedStatus.includes('preparacion')) {
    return 'preparando';
  }

  return 'pendiente';
};

const isFinalCustomerOrder = (order = {}) =>
  ['cancelado', 'entregado'].includes(normalizeCustomerOrderStatus(order.estado));

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
    entregado: {
      accent: '#16a34a',
      soft: '#f0fdf4',
      emoji: 'OK',
      label: 'Pedido entregado',
      message: 'Tu pedido fue entregado. Gracias por comprar en Carnes San Martin Granada.',
      progress: 5,
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
    `Total aproximado: ${formatCurrency(order.total)}`,
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
  publicStoreUrl = 'https://tienda.sanmartinsr.com',
}) {
  const [catalogState] = useState(() => getInitialCatalogState());
  const [catalog, setCatalog] = useState(() => catalogState.catalog);
  const [catalogLoading, setCatalogLoading] = useState(() => catalogState.loading);
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [coupons, setCoupons] = useState([]);
  const [cart, setCart] = useState({});
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [quantityNotice, setQuantityNotice] = useState('');
  const [query, setQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState('todos');
  const [activeSubcategory, setActiveSubcategory] = useState('todas');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedProductQuantity, setSelectedProductQuantity] = useState(0);
  const [selectedPromotionIndex, setSelectedPromotionIndex] = useState(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 1180 : false
  );
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
    ubicacion: null,
  });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authLocating, setAuthLocating] = useState(false);
  const [customerOrders, setCustomerOrders] = useState([]);
  const [customer, setCustomer] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    referencia: '',
    metodoPago: STORE_PAYMENT_OPTIONS[0],
  });
  const [deliveryMode, setDeliveryMode] = useState('perfil');
  const [alternateDelivery, setAlternateDelivery] = useState(() => createEmptyDeliveryDraft());
  const [alternateLocating, setAlternateLocating] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const quantityNoticeTimeoutRef = useRef(null);

  const deferredQuery = useDeferredValue(query);
  const isDashboard = mode === 'dashboard';

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      const cachedCatalog = unwrapCatalogCache(readStoreJsonCache(STORE_CATALOG_CACHE_KEY));

      try {
        const metaSnapshot = await get(ref(database, STORE_CATALOG_META_PATH));
        const remoteUpdatedAt = Number(metaSnapshot.val()?.updatedAt || 0);
        const canReuseCache =
          Boolean(cachedCatalog.data) &&
          cachedCatalog.updatedAt > 0 &&
          remoteUpdatedAt > 0 &&
          cachedCatalog.updatedAt >= remoteUpdatedAt;

        if (canReuseCache) {
          if (!cancelled) {
            setCatalog(mergeCatalogProducts(cachedCatalog.data));
            setCatalogLoading(false);
          }
          return;
        }

        const catalogSnapshot = await get(ref(database, STORE_CATALOG_PATH));
        const remoteCatalog = catalogSnapshot.val() || {};

        writeStoreJsonCache(STORE_CATALOG_CACHE_KEY, {
          version: STORE_CATALOG_CACHE_VERSION,
          updatedAt: remoteUpdatedAt || Date.now(),
          data: remoteCatalog,
        });

        if (!cancelled) {
          setCatalog(mergeCatalogProducts(remoteCatalog));
          setCatalogLoading(false);
        }
      } catch (error) {
        console.error('No se pudo cargar el catalogo de tienda:', error);

        if (!cancelled) {
          if (cachedCatalog.data) {
            setCatalog(mergeCatalogProducts(cachedCatalog.data));
          }
          setCatalogLoading(false);
        }
      }
    };

    loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const snapshot = await get(ref(database, STORE_CATEGORIES_PATH));
        if (!cancelled) {
          setCategories(mergeStoreCategories(snapshot.val()));
        }
      } catch (error) {
        console.error('No se pudieron cargar las categorias de tienda:', error);
      }
    };

    loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCoupons = async () => {
      try {
        const snapshot = await get(ref(database, STORE_COUPONS_PATH));
        if (!cancelled) {
          setCoupons(mergeStoreCoupons(snapshot.val()));
        }
      } catch (error) {
        console.error('No se pudieron cargar los cupones de tienda:', error);
      }
    };

    loadCoupons();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handleResize = () => {
      setIsMobileLayout(window.innerWidth <= 1180);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
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

    const cleanUserKey = String(currentUser.key || '').trim();
    if (!cleanUserKey) {
      setCustomerOrders([]);
      return undefined;
    }

    const unsubscribe = subscribeOrdersForStoreUser(
      cleanUserKey,
      (orders) => {
        setCustomerOrders(orders);
      },
      (error) => {
        console.error('No se pudieron cargar los pedidos del cliente:', error);
        setCustomerOrders([]);
      }
    );

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
    setDeliveryMode('perfil');
    setAlternateDelivery(createEmptyDeliveryDraft());
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

  const categoryProductCounts = useMemo(() => {
    const counts = {};

    categoryOptions.forEach((category) => {
      if (category.id === 'todos') {
        counts[category.id] = activeProducts.length;
        return;
      }

      counts[category.id] = activeProducts.filter((product) => {
        if (category.id === 'promociones') {
          return product.promo || product.category === 'promociones';
        }

        return product.category === category.id;
      }).length;
    });

    return counts;
  }, [activeProducts, categoryOptions]);

  const subcategoryProductCounts = useMemo(() => {
    if (activeCategory === 'todos') {
      return {};
    }

    const scopedProducts = activeProducts.filter((product) => {
      if (activeCategory === 'promociones') {
        return product.promo || product.category === 'promociones';
      }

      return product.category === activeCategory;
    });

    const counts = { todas: scopedProducts.length };

    subcategoryOptions.forEach((subcategory) => {
      counts[subcategory] = scopedProducts.filter(
        (product) => String(product.subcategory || '').toLowerCase() === subcategory.toLowerCase()
      ).length;
    });

    return counts;
  }, [activeCategory, activeProducts, subcategoryOptions]);

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
            minQuantity: getMinQuantity(product),
            quantityStep: getQuantityStep(product),
          };
        }),
    [activeProducts, cart]
  );

  const totalAmount = useMemo(
    () => cartItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0),
    [cartItems]
  );

  const couponDiscount = useMemo(
    () => calculateCouponDiscount(appliedCoupon, totalAmount),
    [appliedCoupon, totalAmount]
  );

  const approximateTotalAmount = useMemo(
    () => Number(Math.max(totalAmount - couponDiscount, 0).toFixed(2)),
    [couponDiscount, totalAmount]
  );

  const savedDeliveryAddress = useMemo(() => createUserDeliveryDraft(currentUser), [currentUser]);
  const activeDeliveryAddress = deliveryMode === 'otra' ? alternateDelivery : savedDeliveryAddress;
  const showPromotions =
    deferredQuery.trim().length === 0 &&
    activeCategory === 'todos' &&
    activeSubcategory === 'todas';

  const cartCount = cartItems.length;

  const activeFilterSummary = useMemo(() => {
    if (catalogLoading && catalog.length === 0) {
      return {
        title: 'Cargando catalogo',
        subtitle: 'Estamos preparando los productos de la tienda.',
      };
    }

    const currentCategoryLabel = selectedCategory?.label || 'Todos';
    const currentSubcategoryLabel =
      activeSubcategory === 'todas' ? 'Todas las subcategorias' : activeSubcategory;
    const categoryCount =
      activeCategory === 'todos'
        ? activeProducts.length
        : Number(subcategoryProductCounts.todas || 0);

    return {
      title: currentCategoryLabel,
      subtitle:
        activeCategory === 'todos'
          ? `${filteredProducts.length} productos en el catalogo`
          : `${currentSubcategoryLabel} · ${categoryCount} productos en categoria`,
    };
  }, [
    activeCategory,
    activeProducts.length,
    activeSubcategory,
    filteredProducts.length,
    selectedCategory,
    subcategoryProductCounts,
  ]);

  const showCatalogSkeleton = catalogLoading && catalog.length === 0;

  useEffect(() => {
    if (cartItems.length === 0) {
      setCheckoutOpen(false);
    }
  }, [cartItems.length]);

  useEffect(() => {
    if (cartItems.length === 0 && appliedCoupon) {
      setAppliedCoupon(null);
      setCouponInput('');
      setCouponMessage('');
    }
  }, [appliedCoupon, cartItems.length]);

  useEffect(() => {
    if (!appliedCoupon) {
      return;
    }

    const refreshedCoupon = coupons.find((coupon) => coupon.code === appliedCoupon.code);
    if (!refreshedCoupon || refreshedCoupon.active === false) {
      setAppliedCoupon(null);
      setCouponMessage('Este cupon ya no esta disponible.');
      return;
    }

    if (JSON.stringify(refreshedCoupon) !== JSON.stringify(appliedCoupon)) {
      setAppliedCoupon(refreshedCoupon);
    }
  }, [appliedCoupon, coupons]);

  useEffect(() => {
    if (!appliedCoupon) {
      return;
    }

    if (appliedCoupon.minimum > 0 && totalAmount < appliedCoupon.minimum) {
      setCouponMessage(`Este cupon aplica desde ${formatCurrency(appliedCoupon.minimum)}.`);
      return;
    }

    if (couponDiscount > 0) {
      setCouponMessage(`Cupon aplicado: -${formatCurrency(couponDiscount)}.`);
    }
  }, [appliedCoupon, couponDiscount, totalAmount]);

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
      showQuantityNotice(getQuantityRuleMessage(product));
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

  const applyCoupon = () => {
    const code = normalizeCouponCode(couponInput);
    if (!code) {
      setCouponMessage('Ingresa un codigo de cupon.');
      return;
    }

    const coupon = coupons.find((item) => item.code === code);
    if (!coupon || coupon.active === false) {
      setAppliedCoupon(null);
      setCouponMessage('Cupon no encontrado o inactivo.');
      return;
    }

    if (coupon.minimum > 0 && totalAmount < coupon.minimum) {
      setAppliedCoupon(null);
      setCouponMessage(`Este cupon aplica desde ${formatCurrency(coupon.minimum)}.`);
      return;
    }

    const discount = calculateCouponDiscount(coupon, totalAmount);
    if (discount <= 0) {
      setAppliedCoupon(null);
      setCouponMessage('Este cupon no genera descuento para este pedido.');
      return;
    }

    setAppliedCoupon(coupon);
    setCouponInput(coupon.code);
    setCouponMessage(`Cupon aplicado: -${formatCurrency(discount)}.`);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponMessage('');
  };

  const updateAuthForm = (field, value) => {
    setAuthForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const fillAddressFromLocation = (currentAddress, location, fallback) => {
    if (!shouldAutofillAddress(currentAddress)) {
      return currentAddress;
    }

    return String(location?.label || fallback || 'Ubicacion guardada desde el mapa').trim();
  };

  const resolveLocationWithAddress = async (location) => {
    const normalized = normalizeLocation(location);
    if (!normalized) {
      return null;
    }

    try {
      return (await reverseGeocodeLocation(normalized)) || normalized;
    } catch (error) {
      console.error('No se pudo resolver la direccion del punto:', error);
      return normalized;
    }
  };

  const captureAuthLocation = async () => {
    setAuthLocating(true);
    setAuthError('');

    try {
      const location = await resolveLocationWithAddress(await getBrowserLocation());
      updateAuthForm('ubicacion', location);
      updateAuthForm('direccion', fillAddressFromLocation(authForm.direccion, location));
    } catch (error) {
      console.error('No se pudo obtener ubicacion:', error);
      setAuthError('No pudimos tomar tu ubicacion. Activa permisos o ajusta el punto manualmente.');
    } finally {
      setAuthLocating(false);
    }
  };

  const updateAlternateDelivery = (field, value) => {
    setAlternateDelivery((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const captureAlternateLocation = async () => {
    setAlternateLocating(true);

    try {
      const location = await resolveLocationWithAddress(await getBrowserLocation());
      setAlternateDelivery((current) => ({
        ...current,
        ubicacion: location,
        direccion: fillAddressFromLocation(current.direccion, location),
      }));
    } catch (error) {
      console.error('No se pudo obtener ubicacion alterna:', error);
      alert('No pudimos tomar la ubicacion de entrega. Activa permisos o ajusta el punto manualmente.');
    } finally {
      setAlternateLocating(false);
    }
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
    setDeliveryMode('perfil');
    setAlternateDelivery(createEmptyDeliveryDraft());
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

    const nowMs = Date.now();
    const now = new Date().toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' });
    const cancelPayload = {
      estado: 'Cancelado',
      canceladoPor: 'Cliente tienda virtual',
      timestampCancelado: now,
      timestampCanceladoMs: nowMs,
      timestampFinalizado: nowMs,
      timestamp: nowMs,
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

    if (!hasLocation(authForm.ubicacion)) {
      setAuthLoading(false);
      setAuthError('Debes guardar el punto exacto en el mapa antes de crear la cuenta.');
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
        ubicacion: null,
      });
    } catch (error) {
      console.error('Error registrando usuario de tienda:', error);
      if (error.code === 'USER_EXISTS') {
        setAuthError('Ese telefono ya tiene cuenta. Inicia sesion.');
        setAuthMode('login');
      } else if (error.code === 'LOCATION_REQUIRED') {
        setAuthError('La ubicacion exacta en el mapa es obligatoria.');
      } else {
        setAuthError('Completa nombre, telefono, contrasena, direccion y el punto exacto del mapa.');
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
      alert(
        error.code === 'LOCATION_REQUIRED'
          ? 'Debes guardar la ubicacion exacta del mapa para actualizar tu perfil.'
          : 'No se pudo actualizar tu perfil.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openProduct = (product, options = {}) => {
    const currentQuantity = Number(cart[product.code] || 0);
    const shouldStartWithMinimum = options.prefillMinimum && currentQuantity <= 0;
    setSelectedProduct(product);
    setSelectedProductQuantity(shouldStartWithMinimum ? getMinQuantity(product) : currentQuantity);
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

    if (!activeDeliveryAddress.direccion.trim() || !hasLocation(activeDeliveryAddress.ubicacion)) {
      if (deliveryMode === 'perfil') {
        alert('Completa tu direccion y guarda el punto exacto del mapa antes de enviar el pedido.');
        setProfileOpen(true);
      } else {
        alert('Completa la direccion alterna y guarda el punto exacto del mapa antes de enviar el pedido.');
      }
      return;
    }

    setSubmitting(true);

    try {
      const fullAddress = activeDeliveryAddress.referencia
        ? `${activeDeliveryAddress.direccion} | Ref: ${activeDeliveryAddress.referencia}`
        : activeDeliveryAddress.direccion;

      const order = await onCreateOrder(
        {
          cliente: currentUser.nombre,
          clienteCodigo: currentUser.codigo,
          clienteFirebaseKey: currentUser.clientKey,
          storeUserKey: currentUser.key,
          direccion: fullAddress,
          telefono: currentUser.telefono,
          referencia: activeDeliveryAddress.referencia,
          ubicacion: activeDeliveryAddress.ubicacion,
          items: cartItems,
          subtotalEstimado: totalAmount,
          descuentoCupon: couponDiscount,
          cupon: appliedCoupon
            ? {
                code: appliedCoupon.code,
                title: appliedCoupon.title,
                type: appliedCoupon.type,
                value: appliedCoupon.value,
              }
            : null,
          total: approximateTotalAmount,
          observaciones: notes.trim(),
          metodoPago: customer.metodoPago,
          deliveryMode,
        },
        { channel: STORE_CHANNEL }
      );

      setCreatedOrder(order);
      setCart({});
      setAppliedCoupon(null);
      setCouponInput('');
      setCouponMessage('');
      setNotes('');
      setCheckoutOpen(false);
      setDeliveryMode('perfil');
      setAlternateDelivery(createEmptyDeliveryDraft());
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
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          margin: 0 auto;
          padding: 44px 18px;
          background:
            radial-gradient(circle at 16% 20%, rgba(255, 255, 255, 0.12), transparent 18%),
            radial-gradient(circle at 82% 16%, rgba(255, 224, 214, 0.12), transparent 24%),
            linear-gradient(135deg, rgba(73, 12, 24, 0.92), rgba(111, 16, 33, 0.9) 48%, rgba(135, 39, 42, 0.82));
          overflow: hidden;
        }
        .store-auth-page::before {
          content: '';
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0.18;
          background-image: url("data:image/svg+xml,%3Csvg width='520' height='520' viewBox='0 0 520 520' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23fff7ef' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='92' cy='82' r='35' stroke-width='17'/%3E%3Cpath d='M322 78 l64 28 l-44 48 z M334 102 l34 12 M326 130 l30 9'/%3E%3Cpath d='M76 356 C98 300 162 296 190 342 C206 370 182 408 136 414 C92 420 58 390 76 356Z M112 344 C132 326 160 330 168 352'/%3E%3Cpath d='M328 346 C342 302 408 300 426 346Z M330 356 H428 M352 382 C370 400 404 400 422 382'/%3E%3Cpath d='M34 198 C78 154 128 154 172 198 S266 242 310 198'/%3E%3Cpath d='M204 472 C248 428 298 428 342 472 S436 516 480 472'/%3E%3C/g%3E%3C/svg%3E");
          background-size: 520px 520px;
          background-position: 6% 10%;
        }
        .store-auth-card {
          position: relative;
          z-index: 1;
          width: min(450px, 100%);
          background: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.6);
          border-radius: 20px;
          padding: 30px 32px 32px;
          box-shadow: 0 28px 80px rgba(38, 6, 12, 0.28);
        }
        .store-auth-brand {
          text-align: center;
          margin-bottom: 22px;
        }
        .store-auth-brand .store-logo {
          width: 72px;
          height: 72px;
          margin: 0 auto 12px;
          border-radius: 18px;
          box-shadow: 0 18px 40px rgba(123, 16, 34, 0.16);
        }
        .store-auth-brand h1 {
          margin: 0;
          color: #111827;
          font-size: 24px;
          line-height: 1.05;
          letter-spacing: -0.03em;
        }
        .store-auth-brand p {
          margin: 10px 0 0;
          color: #6b7280;
          font-size: 14px;
          font-weight: 800;
        }
        .store-auth-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
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
          background: #7b1022;
          color: #ffffff;
          box-shadow: 0 10px 22px rgba(123, 16, 34, 0.18);
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
        .store-filter-strip {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 4px 0;
        }
        .store-filter-strip strong {
          display: block;
          color: #111827;
          font-size: 16px;
          font-weight: 950;
        }
        .store-filter-strip span {
          display: block;
          margin-top: 3px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
        }
        .store-tabs {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 12px 2px 4px;
          scrollbar-width: none;
        }
        .store-subtabs {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 6px 2px 2px;
          scrollbar-width: none;
        }
        .store-tabs::-webkit-scrollbar,
        .store-subtabs::-webkit-scrollbar {
          display: none;
        }
        .store-chip {
          flex: 0 0 auto;
          min-height: 42px;
          padding: 10px 16px;
          border-radius: 999px;
          background: linear-gradient(180deg, #ffffff 0%, #fff7f4 100%);
          color: #4b5563;
          border: 1px solid #f1dfe0;
          box-shadow: 0 10px 24px rgba(123, 16, 34, 0.06);
          font-size: 13px;
          font-weight: 900;
        }
        .store-chip.active {
          background: linear-gradient(135deg, #7b1022, #d94a3f);
          color: #ffffff;
          border-color: transparent;
          box-shadow: 0 16px 28px rgba(123, 16, 34, 0.22);
        }
        .store-filter-chip {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: center;
          min-width: 112px;
          gap: 3px;
          text-align: left;
        }
        .store-filter-chip.compact {
          min-width: auto;
          flex-direction: row;
          align-items: center;
          gap: 8px;
          padding-right: 10px;
        }
        .store-filter-label,
        .store-filter-pill-label {
          display: block;
          font-size: 13px;
          font-weight: 950;
          line-height: 1.08;
        }
        .store-filter-meta {
          display: block;
          color: #7c5b5f;
          font-size: 11px;
          font-weight: 800;
        }
        .store-filter-badge {
          min-width: 26px;
          height: 26px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0 8px;
          background: rgba(123, 16, 34, 0.08);
          color: #7b1022;
          font-size: 11px;
          font-weight: 950;
          line-height: 1;
        }
        .store-chip.active .store-filter-meta {
          color: rgba(255, 250, 245, 0.8);
        }
        .store-chip.active .store-filter-badge {
          background: rgba(255, 255, 255, 0.16);
          color: #ffffff;
        }
        .store-subtabs .store-chip {
          min-height: 38px;
          padding: 8px 13px;
          font-size: 13px;
          background: #ffffff;
          color: #7b1022;
          border-color: #ead8da;
          box-shadow: none;
        }
        .store-subtabs .store-chip.active {
          background: #111827;
          border-color: #111827;
          color: #ffffff;
        }
        .store-subtabs .store-filter-chip.compact {
          padding-right: 12px;
        }
        .store-subtabs .store-chip.active .store-filter-badge {
          background: rgba(255, 255, 255, 0.14);
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
        .store-story-viewer-overlay {
          position: fixed;
          inset: 0;
          z-index: 240;
          background: rgba(15, 23, 42, 0.72);
          backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
        }
        .store-story-viewer {
          position: relative;
          width: min(430px, calc(100vw - 24px), calc((100vh - 24px) * 0.5625));
          aspect-ratio: 9 / 16;
          border-radius: 28px;
          overflow: hidden;
          background:
            radial-gradient(circle at top, rgba(255, 255, 255, 0.08), transparent 42%),
            linear-gradient(180deg, #1f2937 0%, #0f172a 100%);
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.45);
        }
        .store-story-viewer img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .store-story-progress {
          position: absolute;
          top: 14px;
          left: 14px;
          right: 14px;
          z-index: 5;
          display: flex;
          gap: 6px;
        }
        .store-story-progress-track {
          flex: 1;
          height: 4px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.28);
        }
        .store-story-progress-fill {
          display: block;
          width: 0;
          height: 100%;
          border-radius: inherit;
          background: #ffffff;
        }
        .store-story-progress-fill.active {
          animation: storeStoryProgress linear forwards;
        }
        .store-story-progress-fill.done {
          width: 100%;
        }
        @keyframes storeStoryProgress {
          from {
            width: 0;
          }
          to {
            width: 100%;
          }
        }
        .store-story-viewer-head {
          position: absolute;
          top: 28px;
          left: 18px;
          right: 18px;
          z-index: 5;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          color: #ffffff;
        }
        .store-story-viewer-meta {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .store-story-viewer-count {
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.72);
        }
        .store-story-viewer-meta strong {
          font-size: 16px;
          line-height: 1.1;
          text-shadow: 0 2px 16px rgba(15, 23, 42, 0.6);
        }
        .store-story-close {
          width: 42px;
          height: 42px;
          flex: 0 0 auto;
          display: grid;
          place-items: center;
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.48);
          color: #ffffff;
          font-size: 0;
          line-height: 1;
          backdrop-filter: blur(12px);
        }
        .store-story-close::before {
          content: 'x';
          font-size: 28px;
          line-height: 1;
        }
        .store-story-frame {
          position: relative;
          width: 100%;
          height: 100%;
        }
        .store-story-scrim {
          position: absolute;
          left: 0;
          right: 0;
          z-index: 2;
          pointer-events: none;
        }
        .store-story-scrim.top {
          top: 0;
          height: 28%;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0.82) 0%, rgba(15, 23, 42, 0) 100%);
        }
        .store-story-scrim.bottom {
          bottom: 0;
          height: 14%;
          background: linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(15, 23, 42, 0.28) 100%);
        }
        .store-story-nav {
          position: absolute;
          inset: 0;
          z-index: 3;
          display: grid;
          grid-template-columns: 1fr 1fr;
        }
        .store-story-nav button {
          border: 0;
          background: transparent;
          cursor: pointer;
          touch-action: manipulation;
        }
        .store-story-nav button:disabled {
          cursor: default;
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
        .store-grid-skeleton {
          pointer-events: none;
        }
        .store-product {
          position: relative;
          min-width: 0;
        }
        .store-product-skeleton {
          display: grid;
          gap: 10px;
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
        .store-skeleton-media,
        .store-skeleton-line {
          position: relative;
          overflow: hidden;
          background: linear-gradient(90deg, #f3f4f6 0%, #eceff3 50%, #f3f4f6 100%);
          background-size: 200% 100%;
          animation: storeSkeletonPulse 1.2s ease-in-out infinite;
        }
        .store-skeleton-media {
          width: 100%;
          aspect-ratio: 1 / 1;
          border-radius: 8px;
        }
        .store-skeleton-line {
          border-radius: 999px;
          height: 14px;
        }
        .store-skeleton-line.title {
          width: 88%;
          height: 16px;
        }
        .store-skeleton-line.price {
          width: 42%;
        }
        .store-skeleton-line.meta {
          width: 58%;
        }
        .store-add {
          position: absolute;
          top: calc(100% - 68px);
          right: 10px;
          min-width: 42px;
          height: 42px;
          padding: 0 12px;
          border-radius: 999px;
          background: #ffffff;
          color: #111827;
          font-size: 14px;
          font-weight: 950;
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
        @keyframes storeSkeletonPulse {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
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
        .store-floating-cart-total span {
          display: block;
          margin-top: 2px;
          color: #047857;
          font-size: 12px;
          font-weight: 900;
        }
        .store-floating-cart-total em {
          display: block;
          margin-top: 2px;
          color: #9f6b70;
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
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
        .store-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
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
        .store-input,
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
        .store-coupon-card {
          display: grid;
          gap: 10px;
          border: 1px solid #f1dfe0;
          border-radius: 16px;
          padding: 12px;
          background: linear-gradient(135deg, rgba(123, 16, 34, 0.06), rgba(255, 247, 244, 0.82));
        }
        .store-coupon-card strong {
          display: block;
          color: #111827;
        }
        .store-coupon-card span,
        .store-coupon-card p {
          margin: 3px 0 0;
          color: #7b1022;
          font-size: 12px;
          font-weight: 800;
        }
        .store-coupon-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
        }
        .store-coupon-discount,
        .store-total-note div {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .store-coupon-discount {
          border-top: 1px solid #ead8da;
          padding-top: 8px;
        }
        .store-coupon-discount strong {
          color: #047857;
        }
        .store-total-note {
          border: 1px solid #fde2e2;
          border-radius: 16px;
          padding: 13px;
          background: #fff7f4;
        }
        .store-total-note span {
          color: #7b1022;
          font-size: 13px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .store-total-note strong {
          color: #111827;
          font-size: 22px;
        }
        .store-total-note p {
          margin: 8px 0 0;
          color: #7c5b5f;
          font-size: 13px;
          font-weight: 800;
          line-height: 1.4;
        }
        .store-location-card {
          display: grid;
          gap: 10px;
          border: 1px solid #ead8da;
          border-radius: 16px;
          padding: 12px;
          background: #fff7f4;
        }
        .store-location-card strong {
          display: block;
          color: #111827;
        }
        .store-location-card span {
          display: block;
          margin-top: 3px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
        }
        .store-location-card a {
          color: #7b1022;
          font-size: 13px;
          font-weight: 900;
          text-decoration: none;
        }
        .store-location-map {
          height: 180px;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #ead8da;
          background: #f3f4f6;
        }
        .store-location-map iframe {
          width: 100%;
          height: 100%;
          border: 0;
        }
        .store-location-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .store-location-feedback {
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
          color: #7b1022;
          font-size: 12px;
          font-weight: 900;
        }
        .store-location-feedback.error {
          background: #fff1f2;
          color: #be123c;
        }
        .store-location-results {
          display: grid;
          gap: 8px;
        }
        .store-location-result {
          width: 100%;
          border: 1px solid #ead8da;
          border-radius: 14px;
          padding: 10px 12px;
          background: #ffffff;
          color: #111827;
          text-align: left;
          cursor: pointer;
        }
        .store-location-result strong {
          display: block;
          margin: 0;
          color: #111827;
          font-size: 13px;
        }
        .store-location-selected {
          border: 1px solid #ead8da;
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.92);
        }
        .store-location-selected strong {
          display: block;
          color: #111827;
          font-size: 13px;
        }
        .store-location-selected span {
          display: block;
          margin-top: 4px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
        }
        .store-map-picker {
          width: min(430px, calc(100vw - 32px));
          border-radius: 24px;
          padding: 18px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(38, 6, 12, 0.28);
        }
        .store-map-picker-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }
        .store-map-picker-head strong {
          display: block;
          color: #111827;
          font-size: 18px;
        }
        .store-map-picker-head span {
          display: block;
          margin-top: 3px;
          color: #7c5b5f;
          font-size: 12px;
          font-weight: 800;
        }
        .store-map-canvas {
          position: relative;
          width: ${MAP_PICKER_WIDTH}px;
          max-width: 100%;
          height: ${MAP_PICKER_HEIGHT}px;
          margin: 0 auto;
          overflow: hidden;
          border: 1px solid #ead8da;
          border-radius: 18px;
          background: #f3f4f6;
          cursor: crosshair;
          touch-action: manipulation;
        }
        .store-map-canvas img {
          position: absolute;
          width: ${MAP_PICKER_TILE_SIZE}px;
          height: ${MAP_PICKER_TILE_SIZE}px;
          user-select: none;
          pointer-events: none;
        }
        .store-map-pin {
          position: absolute;
          width: 30px;
          height: 30px;
          border: 4px solid #ffffff;
          border-radius: 999px 999px 999px 0;
          background: #b91c1c;
          box-shadow: 0 10px 25px rgba(185, 28, 28, 0.35);
          transform: translate(-50%, -100%) rotate(-45deg);
        }
        .store-map-pin::after {
          content: '';
          position: absolute;
          inset: 7px;
          border-radius: 999px;
          background: #ffffff;
        }
        .store-map-hint {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 10px;
          border-radius: 999px;
          padding: 8px 10px;
          background: rgba(255, 255, 255, 0.92);
          color: #7b1022;
          font-size: 11px;
          font-weight: 950;
          text-align: center;
          pointer-events: none;
        }
        .store-map-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-top: 12px;
        }
        .store-map-tools,
        .store-map-picker-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .store-mini-button {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #ead8da;
          border-radius: 999px;
          padding: 0 13px;
          background: #fff7f4;
          color: #7b1022;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
          cursor: pointer;
          text-decoration: none;
        }
        .store-order-line {
          display: grid;
          grid-template-columns: 52px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #f1f2f4;
        }
        .store-order-line-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .store-order-line-controls button {
          min-height: 28px;
          border: 1px solid #ead8da;
          border-radius: 999px;
          padding: 0 10px;
          background: #ffffff;
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 950;
        }
        .store-order-line-remove {
          margin-left: auto;
        }
        .store-order-line img {
          width: 52px;
          height: 52px;
          border-radius: 8px;
          object-fit: contain;
          background: #f7f7f8;
        }
        .store-delivery-mode {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .store-delivery-option {
          min-height: 44px;
          border: 1px solid #ead8da;
          border-radius: 16px;
          padding: 0 12px;
          background: #ffffff;
          color: #7b1022;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 950;
        }
        .store-delivery-option.active {
          background: linear-gradient(135deg, #7b1022, #d94a3f);
          border-color: transparent;
          color: #ffffff;
          box-shadow: 0 16px 28px rgba(123, 16, 34, 0.18);
        }
        .store-mobile-cart {
          position: fixed;
          left: 14px;
          right: 14px;
          bottom: 14px;
          z-index: 120;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border: 0;
          border-radius: 24px;
          padding: 14px 16px;
          background: linear-gradient(135deg, #111827, #7b1022);
          color: #fffaf5;
          box-shadow: 0 28px 60px rgba(17, 24, 39, 0.34);
          cursor: pointer;
          text-align: left;
          transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .store-mobile-cart.hidden {
          opacity: 0;
          pointer-events: none;
          transform: translateY(120%);
        }
        .store-mobile-cart strong,
        .store-mobile-cart span,
        .store-mobile-cart em {
          display: block;
        }
        .store-mobile-cart strong {
          font-size: 15px;
          font-weight: 950;
        }
        .store-mobile-cart span {
          margin-top: 2px;
          color: rgba(255, 250, 245, 0.78);
          font-size: 12px;
          font-style: normal;
          font-weight: 800;
        }
        .store-mobile-cart em {
          font-size: 13px;
          font-style: normal;
          font-weight: 950;
          white-space: nowrap;
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
          grid-template-columns: repeat(5, minmax(0, 1fr));
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
          .store-story-viewer {
            width: min(calc(100vw - 20px), calc((100vh - 20px) * 0.5625));
            border-radius: 24px;
          }
          .store-story-viewer-head {
            top: 24px;
            left: 14px;
            right: 14px;
          }
          .store-story-progress {
            top: 10px;
            left: 10px;
            right: 10px;
          }
          .store-detail-grid {
            grid-template-columns: 1fr;
          }
          .store-sheet,
          .store-sheet.full {
            width: 100%;
            max-height: 100vh;
            border-radius: 24px 24px 0 0;
            padding: 16px 14px 22px;
          }
          .store-product-name {
            font-size: 14px;
          }
          .store-brand-row {
            align-items: flex-start;
          }
          .store-filter-strip {
            flex-direction: column;
            align-items: flex-start;
            gap: 4px;
          }
          .store-filter-chip {
            min-width: 98px;
          }
          .store-filter-chip.compact {
            min-width: auto;
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
          .store-auth-page {
            padding: 24px 14px;
          }
          .store-auth-card {
            padding: 24px 18px;
          }
          .store-auth-brand h1 {
            font-size: 22px;
          }
          .store-order-meta,
          .store-progress {
            grid-template-columns: 1fr;
          }
          .store-location-actions,
          .store-map-fields,
          .store-delivery-mode {
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
          authLocating={authLocating}
          onAuthModeChange={(mode) => {
            setAuthMode(mode);
            setAuthError('');
          }}
          onFormChange={updateAuthForm}
          onCaptureLocation={captureAuthLocation}
          onManualLocation={(location) => {
            updateAuthForm('ubicacion', location);
            updateAuthForm(
              'direccion',
              fillAddressFromLocation(authForm.direccion, location, 'Ubicacion seleccionada en el mapa')
            );
          }}
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
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Buscar en Carnes San Martin Granada"
            />
          </label>

          <nav className="store-tabs">
            {categoryOptions.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`store-chip store-filter-chip ${activeCategory === category.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(category.id);
                  setActiveSubcategory('todas');
                }}
              >
                <span className="store-filter-label">{category.label}</span>
                <span className="store-filter-meta">
                  {Number(categoryProductCounts[category.id] || 0)} productos
                </span>
              </button>
            ))}
          </nav>

          <div className="store-filter-strip">
            <div>
              <strong>{activeFilterSummary.title}</strong>
              <span>{activeFilterSummary.subtitle}</span>
            </div>
          </div>

          {subcategoryOptions.length > 0 && (
            <nav className="store-subtabs">
              <button
                type="button"
                className={`store-chip store-filter-chip compact ${
                  activeSubcategory === 'todas' ? 'active' : ''
                }`}
                onClick={() => setActiveSubcategory('todas')}
              >
                <span className="store-filter-pill-label">Todas</span>
                <span className="store-filter-badge">
                  {Number(subcategoryProductCounts.todas || 0)}
                </span>
              </button>
              {subcategoryOptions.map((subcategory) => (
                <button
                  key={subcategory}
                  type="button"
                  className={`store-chip store-filter-chip compact ${
                    activeSubcategory === subcategory ? 'active' : ''
                  }`}
                  onClick={() => setActiveSubcategory(subcategory)}
                >
                  <span className="store-filter-pill-label">{subcategory}</span>
                  <span className="store-filter-badge">
                    {Number(subcategoryProductCounts[subcategory] || 0)}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </header>

        {showPromotions && (
          <section className="store-promo">
            <h2 className="store-section-title">Promociones activas</h2>
            <div className="store-stories">
              {STORE_PROMOTIONS.map((promotion) => (
                <button
                  key={promotion.id}
                  type="button"
                  className="store-story"
                  onClick={() => setSelectedPromotionIndex(STORE_PROMOTIONS.findIndex((item) => item.id === promotion.id))}
                >
                  <span className="store-story-ring">
                    <img src={promotion.image} alt={promotion.title} />
                  </span>
                  <span className="store-story-title">{promotion.title}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <main>
          <div className="store-product-head">
            <h2 className="store-count">
              {showCatalogSkeleton ? 'Cargando productos...' : `${filteredProducts.length} productos`}
            </h2>
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

          {showCatalogSkeleton ? (
            <div className="store-grid store-grid-skeleton" aria-label="Cargando catalogo">
              {Array.from({ length: 8 }, (_, index) => (
                <article key={`skeleton-${index}`} className="store-product store-product-skeleton">
                  <div className="store-skeleton-media" />
                  <div className="store-skeleton-line title" />
                  <div className="store-skeleton-line price" />
                  <div className="store-skeleton-line meta" />
                </article>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="store-empty">No encontramos productos con esa busqueda.</div>
          ) : (
            <div className="store-grid">
              {filteredProducts.map((product) => {
                const quantity = Number(cart[product.code] || 0);
                const minQuantity = getMinQuantity(product);
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
                      onClick={() => openProduct(product, { prefillMinimum: true })}
                    >
                      {quantity > 0 ? formatStoreQuantity(quantity, product.unit) : '+'}
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

      {cartItems.length > 0 && !selectedProduct && !checkoutOpen && !ordersOpen && !profileOpen && (
        isMobileLayout ? (
          <MobileCartBar
            cartCount={cartCount}
            approximateTotalAmount={approximateTotalAmount}
            hidden={searchFocused}
            onOpen={() => setCheckoutOpen(true)}
          />
        ) : (
          <FloatingCart
            cartItems={cartItems}
            cartCount={cartCount}
            couponDiscount={couponDiscount}
            approximateTotalAmount={approximateTotalAmount}
            onCheckout={() => setCheckoutOpen(true)}
            onQuantityChange={updateQuantity}
          />
        )
      )}

      {quantityNotice && <div className="store-quantity-notice">{quantityNotice}</div>}

      {selectedProduct && (
        <ProductSheet
          product={selectedProduct}
          cartQuantity={Number(cart[selectedProduct.code] || 0)}
          quantity={selectedProductQuantity}
          onClose={() => setSelectedProduct(null)}
          onConfirm={() => {
            updateQuantity(selectedProduct.code, selectedProductQuantity);
            setSelectedProduct(null);
          }}
          onQuantityChange={(nextQuantity) => {
            if (!isValidQuantityStep(nextQuantity, selectedProduct)) {
              showQuantityNotice(getQuantityRuleMessage(selectedProduct));
            }

            setSelectedProductQuantity(clampQuantity(nextQuantity, selectedProduct));
          }}
        />
      )}

      {selectedPromotionIndex !== null && (
        <PromotionViewer
          promotions={STORE_PROMOTIONS}
          activeIndex={selectedPromotionIndex}
          onChange={setSelectedPromotionIndex}
          onClose={() => setSelectedPromotionIndex(null)}
        />
      )}

      {checkoutOpen && (
        <CheckoutSheet
          cartItems={cartItems}
          currentUser={currentUser}
          customer={customer}
          deliveryMode={deliveryMode}
          alternateDelivery={alternateDelivery}
          alternateLocating={alternateLocating}
          notes={notes}
          submitting={submitting}
          appliedCoupon={appliedCoupon}
          couponDiscount={couponDiscount}
          couponInput={couponInput}
          couponMessage={couponMessage}
          approximateTotalAmount={approximateTotalAmount}
          totalAmount={totalAmount}
          onClose={() => setCheckoutOpen(false)}
          onCustomerChange={updateCustomer}
          onDeliveryModeChange={setDeliveryMode}
          onQuantityChange={updateQuantity}
          onAlternateDeliveryChange={updateAlternateDelivery}
          onCaptureAlternateLocation={captureAlternateLocation}
          onApplyCoupon={applyCoupon}
          onCouponInputChange={setCouponInput}
          onEditProfile={() => setProfileOpen(true)}
          onNotesChange={setNotes}
          onRemoveCoupon={removeCoupon}
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
  authLocating,
  onAuthModeChange,
  onCaptureLocation,
  onManualLocation,
  onFormChange,
  onLogin,
  onRegister,
}) {
  const isRegister = authMode === 'register';

  return (
    <div className="store-auth-page">
      <section className="store-auth-card">
        <div className="store-auth-brand">
          <img className="store-logo" src={LOGO_PATH} alt="Carnes San Martin" />
          <h1>Tienda Virtual Carnes San Martin Granada</h1>
          <p>
            Ingresa o crea tu cuenta para pedir en linea.
          </p>
        </div>

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
              <LocationCaptureBlock
                location={authForm.ubicacion}
                locating={authLocating}
                onCapture={onCaptureLocation}
                onManualLocation={onManualLocation}
                onAddressResolved={(value) => {
                  if (shouldAutofillAddress(authForm.direccion)) {
                    onFormChange('direccion', value);
                  }
                }}
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

function LocationCaptureBlock({ location, locating, onCapture, onManualLocation, onAddressResolved }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const mapUrl = buildGoogleMapsPlaceUrl(location);
  const embedUrl = buildGoogleMapsEmbedUrl(location);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length < 3) {
      setSearchResults([]);
      setSearchError('');
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');

      try {
        const results = await searchLocationCandidates(trimmedQuery, { countryCode: 'ni' });
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('No encontramos coincidencias. Prueba con otra direccion o negocio.');
        }
      } catch (error) {
        console.error('No se pudieron buscar direcciones:', error);
        setSearchResults([]);
        setSearchError('No pudimos buscar direcciones en este momento.');
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  return (
    <div className="store-location-card">
      <div>
        <strong>Ubicacion exacta</strong>
        <span>
          Busca tu direccion o negocio, elige un resultado y ajusta el pin si hace falta.
        </span>
      </div>
      <input
        className="store-field"
        value={searchQuery}
        onChange={(event) => setSearchQuery(event.target.value)}
        placeholder="Buscar direccion, restaurante o negocio"
      />
      {searching && <div className="store-location-feedback">Buscando ubicaciones...</div>}
      {searchError && <div className="store-location-feedback error">{searchError}</div>}
      {searchResults.length > 0 && (
        <div className="store-location-results">
          {searchResults.map((result) => (
            <button
              key={`${result.placeId || result.label}-${result.lat}-${result.lng}`}
              type="button"
              className="store-location-result"
              onClick={() => {
                onManualLocation(result);
                onAddressResolved?.(result.label || result.shortLabel || '');
                setSearchQuery('');
                setSearchResults([]);
                setSearchError('');
              }}
            >
              <strong>{result.shortLabel || 'Direccion encontrada'}</strong>
              <span>{result.label}</span>
            </button>
          ))}
        </div>
      )}
      <div className="store-location-actions">
        <button type="button" className="store-button secondary" onClick={onCapture} disabled={locating}>
          {locating ? 'Tomando ubicacion...' : hasLocation(location) ? 'Usar mi ubicacion actual' : 'Ubicacion actual'}
        </button>
        <button type="button" className="store-button secondary" onClick={() => setPickerOpen(true)}>
          Ajustar en mapa
        </button>
      </div>
      {hasLocation(location) && (
        <>
          <div className="store-location-selected">
            <strong>{location?.label || 'Punto guardado'}</strong>
            <span>
              {Number(location?.lat || 0).toFixed(6)}, {Number(location?.lng || 0).toFixed(6)}
            </span>
          </div>
          <div className="store-location-map">
            <iframe title="Ubicacion de entrega" src={embedUrl} loading="lazy" />
          </div>
          <a href={mapUrl} target="_blank" rel="noreferrer">
            Abrir punto en Google Maps
          </a>
        </>
      )}
      {pickerOpen && (
        <MapPointPicker
          location={location}
          onClose={() => setPickerOpen(false)}
          onSave={(nextLocation) => {
            onManualLocation(nextLocation);
            setPickerOpen(false);
          }}
        />
      )}
    </div>
  );
}

function MapPointPicker({ location, onClose, onSave }) {
  const initialLocation = normalizeLocation(location) || MAP_PICKER_DEFAULT_LOCATION;
  const [center, setCenter] = useState(initialLocation);
  const [selected, setSelected] = useState(initialLocation);
  const [zoom, setZoom] = useState(16);
  const [latDraft, setLatDraft] = useState(initialLocation.lat.toFixed(6));
  const [lngDraft, setLngDraft] = useState(initialLocation.lng.toFixed(6));
  const [savingPoint, setSavingPoint] = useState(false);

  useEffect(() => {
    setLatDraft(selected.lat.toFixed(6));
    setLngDraft(selected.lng.toFixed(6));
  }, [selected.lat, selected.lng]);

  const mapGeometry = useMemo(() => {
    const centerPoint = locationToWorldPoint(center, zoom);
    const topLeft = {
      x: centerPoint.x - MAP_PICKER_WIDTH / 2,
      y: centerPoint.y - MAP_PICKER_HEIGHT / 2,
    };
    const tileStartX = Math.floor(topLeft.x / MAP_PICKER_TILE_SIZE);
    const tileEndX = Math.floor((topLeft.x + MAP_PICKER_WIDTH) / MAP_PICKER_TILE_SIZE);
    const tileStartY = Math.floor(topLeft.y / MAP_PICKER_TILE_SIZE);
    const tileEndY = Math.floor((topLeft.y + MAP_PICKER_HEIGHT) / MAP_PICKER_TILE_SIZE);
    const tileCount = 2 ** zoom;
    const tiles = [];

    for (let x = tileStartX; x <= tileEndX; x += 1) {
      for (let y = tileStartY; y <= tileEndY; y += 1) {
        if (y < 0 || y >= tileCount) {
          continue;
        }

        const wrappedX = ((x % tileCount) + tileCount) % tileCount;
        tiles.push({
          key: `${zoom}-${x}-${y}`,
          src: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
          left: x * MAP_PICKER_TILE_SIZE - topLeft.x,
          top: y * MAP_PICKER_TILE_SIZE - topLeft.y,
        });
      }
    }

    return { tiles, topLeft };
  }, [center, zoom]);

  const selectedPoint = useMemo(() => {
    const point = locationToWorldPoint(selected, zoom);
    return {
      left: point.x - mapGeometry.topLeft.x,
      top: point.y - mapGeometry.topLeft.y,
    };
  }, [mapGeometry.topLeft.x, mapGeometry.topLeft.y, selected, zoom]);

  const applyManualCoordinates = () => {
    const nextLocation = buildManualLocation(latDraft, lngDraft);
    if (!nextLocation) {
      return;
    }

    setSelected(nextLocation);
    setCenter(nextLocation);
  };

  const handleMapClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = (event.clientX - rect.left) * (MAP_PICKER_WIDTH / rect.width);
    const clickY = (event.clientY - rect.top) * (MAP_PICKER_HEIGHT / rect.height);
    const nextLocation = worldPointToLocation(
      mapGeometry.topLeft.x + clickX,
      mapGeometry.topLeft.y + clickY,
      zoom
    );

    if (nextLocation) {
      setSelected(nextLocation);
    }
  };

  return (
    <div className="store-sheet-overlay">
      <div className="store-map-picker">
        <div className="store-map-picker-head">
          <div>
            <strong>Ubicar punto de entrega</strong>
            <span>Toca el mapa donde debe llegar el entregador y guarda el punto.</span>
          </div>
          <button type="button" className="store-back" onClick={onClose}>
            &lt;
          </button>
        </div>

        <div className="store-map-canvas" onClick={handleMapClick}>
          {mapGeometry.tiles.map((tile) => (
            <img
              key={tile.key}
              src={tile.src}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
          <span className="store-map-pin" style={{ left: selectedPoint.left, top: selectedPoint.top }} />
          <div className="store-map-hint">Toca el mapa para mover el pin</div>
        </div>

        <div className="store-map-tools">
          <button type="button" className="store-mini-button" onClick={() => setZoom((value) => Math.min(18, value + 1))}>
            Acercar
          </button>
          <button type="button" className="store-mini-button" onClick={() => setZoom((value) => Math.max(12, value - 1))}>
            Alejar
          </button>
          <button type="button" className="store-mini-button" onClick={() => setCenter(selected)}>
            Centrar pin
          </button>
        </div>

        <div className="store-map-fields">
          <input
            className="store-field"
            value={latDraft}
            onChange={(event) => setLatDraft(event.target.value)}
            placeholder="Latitud"
          />
          <input
            className="store-field"
            value={lngDraft}
            onChange={(event) => setLngDraft(event.target.value)}
            placeholder="Longitud"
          />
        </div>
        <div className="store-location-selected">
          <strong>{selected?.label || 'Punto seleccionado'}</strong>
          <span>{latDraft}, {lngDraft}</span>
        </div>
        <div className="store-map-tools">
          <button type="button" className="store-mini-button" onClick={applyManualCoordinates}>
            Aplicar coordenadas
          </button>
          <a className="store-mini-button" href={buildGoogleMapsPlaceUrl(selected)} target="_blank" rel="noreferrer">
            Ver en Google Maps
          </a>
        </div>

        <div className="store-map-picker-actions">
          <button type="button" className="store-button secondary" style={{ flex: 1 }} onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="store-button"
            style={{ flex: 2 }}
            disabled={savingPoint}
            onClick={async () => {
              setSavingPoint(true);
              try {
                const resolvedLocation = (await reverseGeocodeLocation(selected)) || selected;
                onSave(resolvedLocation);
              } catch (error) {
                console.error('No se pudo resolver el punto seleccionado:', error);
                onSave(selected);
              } finally {
                setSavingPoint(false);
              }
            }}
          >
            {savingPoint ? 'Guardando punto...' : 'Guardar este punto'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProfileSheet({ user, saving, onClose, onSave }) {
  const [profile, setProfile] = useState({
    nombre: user?.nombre || '',
    direccion: user?.direccion || '',
    referencia: user?.referencia || '',
    ubicacion: user?.ubicacion || null,
  });
  const [locating, setLocating] = useState(false);

  const updateProfile = (field, value) => {
    setProfile((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!profile.nombre.trim() || !profile.direccion.trim() || !hasLocation(profile.ubicacion)) {
      alert('Nombre, direccion y punto exacto en el mapa son obligatorios.');
      return;
    }

    onSave(profile);
  };

  const captureProfileLocation = async () => {
    setLocating(true);
    try {
      const currentLocation = await getBrowserLocation();
      const location = (await reverseGeocodeLocation(currentLocation)) || currentLocation;
      updateProfile('ubicacion', location);
      if (shouldAutofillAddress(profile.direccion)) {
        updateProfile('direccion', location?.label || 'Ubicacion guardada desde el mapa');
      }
    } catch (error) {
      console.error('No se pudo obtener ubicacion:', error);
      alert('No pudimos tomar tu ubicacion. Activa permisos o intenta de nuevo.');
    } finally {
      setLocating(false);
    }
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
          <LocationCaptureBlock
            location={profile.ubicacion}
            locating={locating}
            onCapture={captureProfileLocation}
            onManualLocation={(location) => {
              updateProfile('ubicacion', location);
              if (shouldAutofillAddress(profile.direccion)) {
                updateProfile('direccion', location?.label || 'Ubicacion seleccionada en el mapa');
              }
            }}
            onAddressResolved={(value) => {
              if (shouldAutofillAddress(profile.direccion)) {
                updateProfile('direccion', value);
              }
            }}
          />
          <button type="submit" className="store-button" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar perfil'}
          </button>
        </form>
      </div>
    </div>
  );
}

function PromotionViewer({ promotions, activeIndex, onChange, onClose }) {
  const promotion = promotions[activeIndex] || null;
  const isFirstPromotion = activeIndex <= 0;
  const isLastPromotion = activeIndex >= promotions.length - 1;

  const goToPrevious = () => {
    if (isFirstPromotion) {
      return;
    }

    onChange(activeIndex - 1);
  };

  const goToNext = () => {
    if (isLastPromotion) {
      onClose();
      return;
    }

    onChange(activeIndex + 1);
  };

  useEffect(() => {
    if (!promotion || typeof window === 'undefined') {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      if (isLastPromotion) {
        onClose();
        return;
      }

      onChange(activeIndex + 1);
    }, STORE_STORY_DURATION_MS);

    return () => window.clearTimeout(timeoutId);
  }, [promotion, activeIndex, isLastPromotion, onChange, onClose]);

  useEffect(() => {
    if (!promotion || typeof window === 'undefined') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevious();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === ' ') {
        event.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promotion, activeIndex]);

  useEffect(() => {
    if (!promotion || typeof document === 'undefined') {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [promotion]);

  if (!promotion) {
    return null;
  }

  return (
    <div className="store-story-viewer-overlay" onClick={onClose}>
      <div
        className="store-story-viewer"
        role="dialog"
        aria-modal="true"
        aria-label={`Promocion ${activeIndex + 1} de ${promotions.length}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="store-story-progress" aria-hidden="true">
          {promotions.map((item, index) => (
            <span key={item.id} className="store-story-progress-track">
              <span
                className={[
                  'store-story-progress-fill',
                  index === activeIndex ? 'active' : '',
                  index < activeIndex ? 'done' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={index === activeIndex ? { animationDuration: `${STORE_STORY_DURATION_MS}ms` } : undefined}
              />
            </span>
          ))}
        </div>

        <div className="store-story-viewer-head">
          <div className="store-story-viewer-meta">
            <span className="store-story-viewer-count">
              Historia {activeIndex + 1} / {promotions.length}
            </span>
            <strong>{promotion.title}</strong>
          </div>
          <button type="button" className="store-story-close" onClick={onClose} aria-label="Cerrar historias">
            ×
          </button>
        </div>

        <div className="store-story-frame">
          <img src={promotion.image} alt={promotion.title} />
          <div className="store-story-scrim top" />
          <div className="store-story-scrim bottom" />

          <div className="store-story-nav" aria-hidden="true">
            <button
              type="button"
              onClick={goToPrevious}
              disabled={isFirstPromotion}
              aria-label="Promocion anterior"
            />
            <button
              type="button"
              onClick={goToNext}
              aria-label={isLastPromotion ? 'Cerrar historias' : 'Siguiente promocion'}
            />
          </div>
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

function FloatingCart({
  cartItems,
  cartCount,
  couponDiscount,
  approximateTotalAmount,
  onCheckout,
  onQuantityChange,
}) {
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
          const step = getQuantityStep({ unit: item.unidad, quantityStep: item.quantityStep });
          const minQuantity = getMinQuantity({ unit: item.unidad, minQuantity: item.minQuantity });
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
                    onClick={() =>
                      onQuantityChange(
                        item.codigo,
                        currentQuantity <= minQuantity + QUANTITY_EPSILON ? 0 : currentQuantity - step
                      )
                    }
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
          <small>Total aproximado</small>
          {couponDiscount > 0 && <span>-{formatCurrency(couponDiscount)} en cupon</span>}
          <strong>{formatCurrency(approximateTotalAmount)}</strong>
          <em>Puede variar por pesos exactos.</em>
        </div>
        <button type="button" className="store-button" onClick={onCheckout}>
          Confirmar
        </button>
      </div>
    </aside>
  );
}

function MobileCartBar({ cartCount, approximateTotalAmount, hidden, onOpen }) {
  return (
    <button
      type="button"
      className={`store-mobile-cart ${hidden ? 'hidden' : ''}`}
      onClick={onOpen}
      aria-label="Abrir carrito"
    >
      <div>
        <strong>{cartCount === 1 ? '1 producto' : `${cartCount} productos`}</strong>
        <span>{formatCurrency(approximateTotalAmount)}</span>
      </div>
      <em>Ver carrito</em>
    </button>
  );
}

function ProductSheet({ product, cartQuantity, quantity, onClose, onConfirm, onQuantityChange }) {
  const subtotal = Number(quantity || 0) * Number(product.price || 0);
  const step = getQuantityStep(product);
  const minQuantity = getMinQuantity(product);

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
            <p className="store-unit" style={{ marginTop: 8 }}>
              {getQuantityRuleMessage(product)}
            </p>
            {cartQuantity > 0 && (
              <p className="store-unit" style={{ marginTop: 6 }}>
                Actualmente tienes {formatStoreQuantity(cartQuantity, product.unit)} {product.unit} en carrito.
              </p>
            )}

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
              <button
                type="button"
                onClick={() => onQuantityChange(quantity <= minQuantity + QUANTITY_EPSILON ? 0 : quantity - step)}
              >
                -
              </button>
              <QuantityInput
                className="store-qty-input"
                step={step}
                value={quantity}
                ariaLabel={`Cantidad de ${product.name}`}
                onChange={onQuantityChange}
              />
              <button type="button" onClick={() => onQuantityChange(quantity > 0 ? quantity + step : minQuantity)}>
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
              disabled={quantity <= 0 && cartQuantity <= 0}
              onClick={onConfirm}
            >
              {quantity > 0
                ? `Guardar ${formatCurrency(subtotal)}`
                : cartQuantity > 0
                  ? 'Quitar del carrito'
                  : 'Selecciona cantidad para agregar'}
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
  deliveryMode,
  alternateDelivery,
  alternateLocating,
  notes,
  submitting,
  appliedCoupon,
  couponDiscount,
  couponInput,
  couponMessage,
  approximateTotalAmount,
  totalAmount,
  onClose,
  onApplyCoupon,
  onAlternateDeliveryChange,
  onCaptureAlternateLocation,
  onCustomerChange,
  onCouponInputChange,
  onDeliveryModeChange,
  onEditProfile,
  onNotesChange,
  onQuantityChange,
  onRemoveCoupon,
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
              <div className="store-order-line-controls">
                <button
                  type="button"
                  onClick={() =>
                    onQuantityChange(
                      item.codigo,
                      Number(item.cantidad || 0) <= Number(item.minQuantity || 0) + QUANTITY_EPSILON
                        ? 0
                        : Number(item.cantidad || 0) - Number(item.quantityStep || 1)
                    )
                  }
                >
                  -
                </button>
                <QuantityInput
                  className="store-floating-qty-input"
                  step={item.quantityStep}
                  value={Number(item.cantidad || 0)}
                  ariaLabel={`Cantidad de ${item.nombre}`}
                  onChange={(nextValue) => onQuantityChange(item.codigo, nextValue)}
                />
                <button
                  type="button"
                  onClick={() => onQuantityChange(item.codigo, Number(item.cantidad || 0) + Number(item.quantityStep || 1))}
                >
                  +
                </button>
                <button type="button" className="store-order-line-remove" onClick={() => onQuantityChange(item.codigo, 0)}>
                  Quitar
                </button>
              </div>
            </div>
            <strong>{formatCurrency(item.subtotal)}</strong>
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 8px' }}>
          <strong>Subtotal estimado</strong>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>

        <form className="store-form" onSubmit={onSubmit}>
          <div className="store-coupon-card">
            <div>
              <strong>Cupon</strong>
              <span>Si tienes un codigo promocional, aplicalo aqui.</span>
            </div>
            <div className="store-coupon-row">
              <input
                className="store-input"
                value={couponInput}
                onChange={(event) => onCouponInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplyCoupon();
                  }
                }}
                placeholder="Codigo de cupon"
              />
              {appliedCoupon ? (
                <button type="button" className="store-button secondary" onClick={onRemoveCoupon}>
                  Quitar
                </button>
              ) : (
                <button type="button" className="store-button secondary" onClick={onApplyCoupon}>
                  Aplicar
                </button>
              )}
            </div>
            {couponMessage && <p>{couponMessage}</p>}
            {couponDiscount > 0 && (
              <div className="store-coupon-discount">
                <span>{appliedCoupon?.code}</span>
                <strong>-{formatCurrency(couponDiscount)}</strong>
              </div>
            )}
          </div>

          <div className="store-total-note">
            <div>
              <span>Total aproximado</span>
              <strong>{formatCurrency(approximateTotalAmount)}</strong>
            </div>
            <p>
              Puede variar por los pesos exactos de los productos. Se le actualizara el nuevo monto
              cuando este listo el pedido.
            </p>
          </div>

          <div className="store-delivery-mode">
            <button
              type="button"
              className={`store-delivery-option ${deliveryMode === 'perfil' ? 'active' : ''}`}
              onClick={() => onDeliveryModeChange('perfil')}
            >
              Mi direccion guardada
            </button>
            <button
              type="button"
              className={`store-delivery-option ${deliveryMode === 'otra' ? 'active' : ''}`}
              onClick={() => onDeliveryModeChange('otra')}
            >
              Otra direccion
            </button>
          </div>

          {deliveryMode === 'perfil' ? (
            <div className="store-status-card" style={{ marginTop: 0 }}>
              <div className="store-status-pill">Entrega</div>
              <h3 style={{ margin: '10px 0 4px' }}>{currentUser.nombre}</h3>
              <div style={{ color: '#6b7280', lineHeight: 1.5 }}>
                {currentUser.telefono}
                <br />
                {currentUser.direccion}
                {currentUser.referencia ? ` | Ref: ${currentUser.referencia}` : ''}
              </div>
              {!hasLocation(currentUser.ubicacion) && (
                <div className="store-location-feedback error" style={{ marginTop: 10 }}>
                  Debes guardar el punto exacto del mapa en tu perfil antes de pedir.
                </div>
              )}
              <button
                type="button"
                className="store-button secondary"
                style={{ marginTop: 10 }}
                onClick={onEditProfile}
              >
                Editar mi direccion
              </button>
            </div>
          ) : (
            <div className="store-status-card" style={{ marginTop: 0 }}>
              <div className="store-status-pill">Entrega alterna</div>
              <div className="store-form" style={{ marginTop: 12 }}>
                <input
                  className="store-field"
                  value={alternateDelivery.direccion}
                  onChange={(event) => onAlternateDeliveryChange('direccion', event.target.value)}
                  placeholder="Direccion de entrega"
                />
                <input
                  className="store-field"
                  value={alternateDelivery.referencia}
                  onChange={(event) => onAlternateDeliveryChange('referencia', event.target.value)}
                  placeholder="Referencia"
                />
                <LocationCaptureBlock
                  location={alternateDelivery.ubicacion}
                  locating={alternateLocating}
                  onCapture={onCaptureAlternateLocation}
                  onManualLocation={(location) => {
                    onAlternateDeliveryChange('ubicacion', location);
                    if (shouldAutofillAddress(alternateDelivery.direccion)) {
                      onAlternateDeliveryChange('direccion', location?.label || 'Ubicacion seleccionada en el mapa');
                    }
                  }}
                  onAddressResolved={(value) => {
                    if (shouldAutofillAddress(alternateDelivery.direccion)) {
                      onAlternateDeliveryChange('direccion', value);
                    }
                  }}
                />
              </div>
            </div>
          )}
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
  const liveOrCreatedOrder = liveCreatedOrder || createdOrder;
  const activeOrder =
    liveOrCreatedOrder && !isFinalCustomerOrder(liveOrCreatedOrder)
      ? liveOrCreatedOrder
      : listedOrders.find((order) => !isFinalCustomerOrder(order)) || null;
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
    typeof onCancelOrder === 'function' && !['cancelado', 'enviado', 'entregado'].includes(statusKey);

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
          <span>Total aproximado</span>
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
            {order.timestampEntregado
              ? ` - Entregado ${order.timestampEntregado}`
              : order.timestampEnviado
                ? ` - ${order.timestampEnviado}`
                : ''}
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
