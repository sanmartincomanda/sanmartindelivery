import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { onValue, orderByChild, query, ref, startAt } from 'firebase/database';
import { database } from '../firebase';
import {
  applySicarPriceUpdatesWithOptions,
  applySicarCatalogProductsWithOptions,
  getCatalogProductKey,
  getCurrentCatalogMap,
  getDefaultProductMinQuantity,
  getDefaultProductQuantityStep,
  getProductMinQuantity,
  getProductQuantityStep,
  hasCustomProductQuantityRules,
  isSicarManagedProduct,
  isUnitMeasure,
  mergeCatalogProducts,
  migrateCatalogImagesToStorage,
  saveCatalogProduct,
  SICAR_CATALOG_SYNC_BATCH_SIZE,
  seedDefaultCatalogIfEmpty,
  STORE_CATALOG_PATH,
  updateCatalogProduct,
} from '../services/storeCatalog';
import {
  mergeStoreCategories,
  saveStoreCategory,
  seedDefaultStoreCategoriesIfEmpty,
  syncStoreCategoriesFromCatalogProducts,
  STORE_CATEGORIES_PATH,
  updateStoreCategory,
} from '../services/storeCategories';
import {
  mergeStoreCoupons,
  saveStoreCoupon,
  STORE_COUPONS_PATH,
  updateStoreCoupon,
} from '../services/storeCoupons';
import {
  cleanupExpiredStorePromotions,
  deleteStorePromotion,
  getStorePromotionStatus,
  mergeStorePromotions,
  saveStorePromotion,
  seedDefaultStorePromotionsIfEmpty,
  STORE_PROMOTIONS_PATH,
  updateStorePromotion,
} from '../services/storePromotions';
import {
  DEFAULT_STORE_DELIVERY_SETTINGS,
  buildStoreOperationScheduleSummary,
  getStoreDeliveryFeeRows,
  getStoreOperationStatus,
  normalizeStoreDeliverySettings,
  saveStoreDeliverySettings,
  STORE_DELIVERY_FEE_BRACKETS,
  STORE_OPERATION_DAY_LABELS,
  STORE_OPERATION_DAY_ORDER,
  subscribeStoreDeliverySettings,
  validateStoreOperationHours,
} from '../services/storeDeliverySettings';
import {
  STORE_USERS_PATH,
  updateStoreUserPassword,
} from '../services/storeUsers';
import {
  DRIVERS_PATH,
  getDriverLoginPassword,
  getDriverLoginUsername,
  mergeDrivers,
  saveDriver,
  seedDefaultDriversIfEmpty,
  updateDriver,
} from '../services/drivers';
import {
  KITCHEN_USER_KEY,
  normalizeKitchenUser,
  saveKitchenUser,
  SYSTEM_USERS_PATH,
} from '../services/systemUsers';
import { cleanupExpiredStoreOrders, formatOrderNumber, STORE_CHANNEL } from '../services/orders';
import { getOrderHistoryRetentionStartDate, sortOrdersByDateAndNumberDesc } from '../services/orderArchive';
import {
  compressImportedCatalogImage,
  fetchSicarCatalogSelection,
  fetchSicarPricesByCodes,
  fetchSicarProductImage,
  getSicarBridgeHealth,
} from '../services/sicarCatalog';
import {
  readStoreJsonCache,
  STORE_CATALOG_CACHE_KEY,
  STORE_CATALOG_CACHE_VERSION,
  STORE_CATEGORIES_CACHE_KEY,
  STORE_CATEGORIES_CACHE_VERSION,
  STORE_COUPONS_CACHE_KEY,
  STORE_COUPONS_CACHE_VERSION,
  STORE_PROMOTIONS_CACHE_KEY,
  STORE_PROMOTIONS_CACHE_VERSION,
  unwrapStoreCache,
  writeStoreVersionedCache,
} from '../services/storeCache';
import {
  buildGoogleMapsAddressUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsPlaceUrl,
  getBrowserLocation,
  normalizeLocation,
  reverseGeocodeLocation,
  searchLocationCandidates,
} from '../services/geo';
import StoreRewardsAdminSection from './StoreRewardsAdminSection';
import {
  buildDefaultStoreWelcomeCouponCampaign,
  normalizeStoreWelcomeCouponCampaign,
  saveStoreWelcomeCouponCampaign,
  subscribeStoreWelcomeCouponCampaign,
} from '../services/storeWelcomeCoupon';

const COUPONS_PIN = '210397';

const buildSicarFailureMessage = (prefix, error) => {
  const detail = String(error?.message || '').trim();
  if (!detail) {
    return `${prefix} Verifica que el puente local este activo con "npm run sicar:bridge".`;
  }

  if (detail.includes('puente local') || detail.includes('administrador local en http://127.0.0.1:5173')) {
    return `${prefix} ${detail}`.trim();
  }

  return `${prefix} Verifica que el puente local este activo con "npm run sicar:bridge". ${detail}`.trim();
};

const buildEmptyProduct = (unit = 'lb') => ({
  code: '',
  name: '',
  price: '',
  inventory: '',
  unit,
  category: 'res',
  subcategory: 'Linea Diaria',
  minQuantity: String(getDefaultProductMinQuantity(unit)),
  quantityStep: String(getDefaultProductQuantityStep(unit)),
  active: true,
  promo: false,
  image: '',
  description: '',
});

const emptyProduct = buildEmptyProduct();

const emptyCategory = {
  id: '',
  label: '',
  subcategoriesText: '',
  active: true,
  sortOrder: '',
};

const emptyCoupon = {
  code: '',
  title: '',
  type: 'percent',
  value: '',
  minimum: '',
  maxUsesPerUser: '',
  active: true,
  notes: '',
};

const emptyPromotion = {
  id: '',
  title: '',
  image: '',
  active: true,
  sortOrder: '',
  startsAt: '',
  endsAt: '',
};

const emptyDriver = {
  code: '',
  name: '',
  publicName: '',
  phone: '',
  active: true,
  sortOrder: '',
};

const emptyKitchenForm = {
  username: 'cocina',
  displayName: 'Cocina',
  password: '',
  confirmPassword: '',
  active: true,
};

const formatSicarNumber = (value, maximumFractionDigits = 2) =>
  new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(Number(value || 0));

const formatSicarDate = (value) => {
  if (!value) {
    return '-';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
  }).format(parsed);
};

const formatAdminDateTime = (value) => {
  if (!value) {
    return 'Sin fecha';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat('es-NI', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
};

const formatCurrencyAmount = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const normalizeAdminStatusText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const isDeliveredAdminOrder = (status = '') => normalizeAdminStatusText(status).includes('entregado');
const isCanceledAdminOrder = (status = '') =>
  normalizeAdminStatusText(status).includes('cancel') ||
  normalizeAdminStatusText(status).includes('anulad');

const toDateTimeInputValue = (value) => {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const localTime = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
  return localTime.toISOString().slice(0, 16);
};

const normalizeDateTimeInputValue = (value) => {
  const cleanValue = String(value || '').trim();
  if (!cleanValue) {
    return '';
  }

  const parsed = new Date(cleanValue);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
};

const getPromotionStatusLabel = (promotion) => {
  switch (getStorePromotionStatus(promotion)) {
    case 'scheduled':
      return 'Programada';
    case 'expired':
      return 'Vencida';
    case 'inactive':
      return 'Inactiva';
    default:
      return 'Activa';
  }
};

const formatRestrictionValue = (value, unit) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return '-';
  }

  return isUnitMeasure(unit)
    ? `${Number(numeric)} ${unit}`
    : `${Number.isInteger(numeric) ? numeric : numeric.toFixed(1).replace(/\.0$/, '')} ${unit}`;
};

const waitForUiPaint = () =>
  new Promise((resolve) => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setTimeout(resolve, 0);
      return;
    }

    window.requestAnimationFrame(() => resolve());
  });

const chunkArray = (items = [], size = 1) => {
  const chunkSize = Math.max(1, Number(size || 1));
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
};

const getInitialConfigCollection = (cacheKey, cacheVersion, mergeCollection, fallbackValue) => {
  const cachedCollection = unwrapStoreCache(readStoreJsonCache(cacheKey), cacheVersion);
  const hasCachedCollection =
    Boolean(cachedCollection.data) &&
    typeof cachedCollection.data === 'object' &&
    Object.keys(cachedCollection.data).length > 0;

  if (hasCachedCollection) {
    return mergeCollection(cachedCollection.data);
  }

  return fallbackValue;
};

const IMAGE_CROP_OUTPUT_SIZE = 960;
const IMAGE_CROP_MIN_ZOOM = 1;
const IMAGE_CROP_MAX_ZOOM = 3;

const buildEmptyImageCrop = () => ({
  open: false,
  source: '',
  fileName: '',
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  width: 0,
  height: 0,
});

const clampCropValue = (value, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, numeric));
};

const loadCatalogImageElement = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo cargar la foto seleccionada.'));
    image.src = source;
  });

const cropCatalogImage = async ({
  source,
  zoom,
  offsetX,
  offsetY,
  outputSize = IMAGE_CROP_OUTPUT_SIZE,
}) => {
  if (!source || typeof document === 'undefined') {
    throw new Error('No hay una imagen lista para recortar.');
  }

  const image = await loadCatalogImageElement(source);
  const width = Math.max(1, Number(image.width || 1));
  const height = Math.max(1, Number(image.height || 1));
  const normalizedZoom = clampCropValue(zoom, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);
  const cropSide = Math.max(1, Math.min(width, height) / normalizedZoom);
  const maxOffsetX = Math.max(0, (width - cropSide) / 2);
  const maxOffsetY = Math.max(0, (height - cropSide) / 2);
  const normalizedOffsetX = clampCropValue(offsetX, -1, 1);
  const normalizedOffsetY = clampCropValue(offsetY, -1, 1);
  const sourceX = clampCropValue(
    (width - cropSide) / 2 + maxOffsetX * normalizedOffsetX,
    0,
    width - cropSide
  );
  const sourceY = clampCropValue(
    (height - cropSide) / 2 + maxOffsetY * normalizedOffsetY,
    0,
    height - cropSide
  );
  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('No se pudo preparar el recorte de la foto.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropSide,
    cropSide,
    0,
    0,
    outputSize,
    outputSize
  );

  return canvas.toDataURL('image/jpeg', 0.9);
};

export default function ConfiguracionView({ mode = 'users' }) {
  const isStoreMode = mode === 'store';
  const [section, setSection] = useState(() => (isStoreMode ? 'categorias' : 'usuarios'));
  const [usersTab, setUsersTab] = useState('administrativo');
  const [products, setProducts] = useState(() =>
    getInitialConfigCollection(
      STORE_CATALOG_CACHE_KEY,
      STORE_CATALOG_CACHE_VERSION,
      mergeCatalogProducts,
      []
    )
  );
  const [categories, setCategories] = useState(() =>
    getInitialConfigCollection(
      STORE_CATEGORIES_CACHE_KEY,
      STORE_CATEGORIES_CACHE_VERSION,
      mergeStoreCategories,
      mergeStoreCategories()
    )
  );
  const [coupons, setCoupons] = useState(() =>
    getInitialConfigCollection(
      STORE_COUPONS_CACHE_KEY,
      STORE_COUPONS_CACHE_VERSION,
      mergeStoreCoupons,
      []
    )
  );
  const [promotions, setPromotions] = useState(() =>
    getInitialConfigCollection(
      STORE_PROMOTIONS_CACHE_KEY,
      STORE_PROMOTIONS_CACHE_VERSION,
      mergeStorePromotions,
      mergeStorePromotions()
    )
  );
  const [drivers, setDrivers] = useState(() => mergeDrivers());
  const [kitchenUser, setKitchenUser] = useState(() => normalizeKitchenUser());
  const [storeUsers, setStoreUsers] = useState([]);
  const [catalogHydrated, setCatalogHydrated] = useState(() => products.length > 0);
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [couponForm, setCouponForm] = useState(emptyCoupon);
  const [promotionForm, setPromotionForm] = useState(emptyPromotion);
  const [driverForm, setDriverForm] = useState(emptyDriver);
  const [kitchenForm, setKitchenForm] = useState(emptyKitchenForm);
  const [deliverySettings, setDeliverySettings] = useState(() =>
    normalizeStoreDeliverySettings(DEFAULT_STORE_DELIVERY_SETTINGS)
  );
  const [welcomeCouponCampaign, setWelcomeCouponCampaign] = useState(() =>
    normalizeStoreWelcomeCouponCampaign(buildDefaultStoreWelcomeCouponCampaign())
  );
  const [storeOrders, setStoreOrders] = useState([]);
  const [storeOrdersLoading, setStoreOrdersLoading] = useState(false);
  const [couponsUnlocked, setCouponsUnlocked] = useState(false);
  const [couponPin, setCouponPin] = useState('');
  const [passwordForms, setPasswordForms] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [savingPromotion, setSavingPromotion] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [savingKitchen, setSavingKitchen] = useState(false);
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false);
  const [savingWelcomeCouponCampaign, setSavingWelcomeCouponCampaign] = useState(false);
  const [savingPasswordKey, setSavingPasswordKey] = useState('');
  const [cleaningPromotions, setCleaningPromotions] = useState(false);
  const [syncingSicar, setSyncingSicar] = useState(false);
  const [syncingSicarPrices, setSyncingSicarPrices] = useState(false);
  const [migratingCatalogImages, setMigratingCatalogImages] = useState(false);
  const [cleaningExpiredOrders, setCleaningExpiredOrders] = useState(false);
  const [testingSicar, setTestingSicar] = useState(false);
  const [loadingSicarPreview, setLoadingSicarPreview] = useState(false);
  const [sicarHealth, setSicarHealth] = useState(null);
  const [sicarPreview, setSicarPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [imageCrop, setImageCrop] = useState(() => buildEmptyImageCrop());
  const [applyingImageCrop, setApplyingImageCrop] = useState(false);
  const [productEditorOpen, setProductEditorOpen] = useState(false);

  useEffect(() => {
    setSection(isStoreMode ? 'categorias' : 'usuarios');
  }, [isStoreMode]);

  useEffect(() => {
    if (!isStoreMode || !['catalogo', 'categorias', 'recompensas'].includes(section)) {
      return undefined;
    }

    const unsubscribeCatalog = onValue(ref(database, STORE_CATALOG_PATH), (snapshot) => {
      const remoteCatalog = snapshot.val() || {};
      writeStoreVersionedCache(
        STORE_CATALOG_CACHE_KEY,
        STORE_CATALOG_CACHE_VERSION,
        remoteCatalog
      );
      startTransition(() => {
        setProducts(mergeCatalogProducts(remoteCatalog));
        setCatalogHydrated(true);
      });
    });

    const unsubscribeCategories = onValue(ref(database, STORE_CATEGORIES_PATH), (snapshot) => {
      const remoteCategories = snapshot.val() || {};
      writeStoreVersionedCache(
        STORE_CATEGORIES_CACHE_KEY,
        STORE_CATEGORIES_CACHE_VERSION,
        remoteCategories
      );
      startTransition(() => {
        setCategories(mergeStoreCategories(remoteCategories));
      });
    });

    return () => {
      unsubscribeCatalog();
      unsubscribeCategories();
    };
  }, [isStoreMode, section]);

  useEffect(() => {
    if (!isStoreMode || section !== 'cupones') {
      return undefined;
    }

    const unsubscribeCoupons = onValue(ref(database, STORE_COUPONS_PATH), (snapshot) => {
      const remoteCoupons = snapshot.val() || {};
      writeStoreVersionedCache(
        STORE_COUPONS_CACHE_KEY,
        STORE_COUPONS_CACHE_VERSION,
        remoteCoupons
      );
      startTransition(() => {
        setCoupons(mergeStoreCoupons(remoteCoupons));
      });
    });

    const unsubscribeWelcomeCampaign = subscribeStoreWelcomeCouponCampaign(
      (campaign) => {
        startTransition(() => {
          setWelcomeCouponCampaign(campaign);
        });
      },
      (error) => {
        console.error('No se pudo cargar la campana del cupon de bienvenida:', error);
      }
    );

    return () => {
      unsubscribeCoupons();
      unsubscribeWelcomeCampaign();
    };
  }, [isStoreMode, section]);

  useEffect(() => {
    if (!isStoreMode || section !== 'promociones') {
      return undefined;
    }

    const unsubscribe = onValue(ref(database, STORE_PROMOTIONS_PATH), (snapshot) => {
      const remotePromotions = snapshot.val() || {};
      writeStoreVersionedCache(
        STORE_PROMOTIONS_CACHE_KEY,
        STORE_PROMOTIONS_CACHE_VERSION,
        remotePromotions
      );
      startTransition(() => {
        setPromotions(mergeStorePromotions(remotePromotions));
      });
    });

    seedDefaultStorePromotionsIfEmpty().catch((error) => {
      console.error('No se pudieron inicializar las historias base:', error);
    });

    cleanupExpiredStorePromotions().catch((error) => {
      console.error('No se pudieron limpiar las historias vencidas:', error);
    });

    return () => unsubscribe();
  }, [isStoreMode, section]);

  useEffect(() => {
    if (!isStoreMode || section !== 'entrega') {
      return undefined;
    }

    const unsubscribe = subscribeStoreDeliverySettings(
      (settings) => {
        startTransition(() => {
          setDeliverySettings(settings);
        });
      },
      (error) => {
        console.error('No se pudo cargar la configuracion de entrega:', error);
      }
    );

    return () => unsubscribe();
  }, [isStoreMode, section]);

  useEffect(() => {
    if (!isStoreMode || section !== 'pedidos') {
      return undefined;
    }

    setStoreOrdersLoading(true);
    const retentionStartDate = getOrderHistoryRetentionStartDate(new Date());
    const ordersQuery = query(ref(database, 'orders'), orderByChild('fecha'), startAt(retentionStartDate));

    const unsubscribe = onValue(
      ordersQuery,
      (snapshot) => {
        const nextOrders = Object.entries(snapshot.val() || {})
          .map(([firebaseKey, value]) => ({
            firebaseKey,
            ...value,
          }))
          .filter((order) => order.canal === STORE_CHANNEL);

        startTransition(() => {
          setStoreOrders(sortOrdersByDateAndNumberDesc(nextOrders));
          setStoreOrdersLoading(false);
        });
      },
      (error) => {
        console.error('No se pudieron cargar los pedidos de tienda virtual:', error);
        setStoreOrdersLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isStoreMode, section]);

  useEffect(() => {
    if (isStoreMode || usersTab !== 'entregadores') {
      return undefined;
    }

    const unsubscribe = onValue(ref(database, DRIVERS_PATH), (snapshot) => {
      startTransition(() => {
        setDrivers(mergeDrivers(snapshot.val()));
      });
    });

    return () => unsubscribe();
  }, [isStoreMode, usersTab]);

  useEffect(() => {
    if (isStoreMode) {
      return undefined;
    }

    const unsubscribe = onValue(ref(database, `${SYSTEM_USERS_PATH}/${KITCHEN_USER_KEY}`), (snapshot) => {
      const nextUser = normalizeKitchenUser(snapshot.val());
      startTransition(() => {
        setKitchenUser(nextUser);
      });
      setKitchenForm((current) => ({
        ...current,
        username: nextUser.username || 'cocina',
        displayName: nextUser.displayName || 'Cocina',
        active: nextUser.active !== false,
      }));
    });

    return () => unsubscribe();
  }, [isStoreMode]);

  useEffect(() => {
    if (isStoreMode || usersTab !== 'clientes') {
      return undefined;
    }

    const unsubscribe = onValue(ref(database, STORE_USERS_PATH), (snapshot) => {
      const data = snapshot.val() || {};
      const users = Object.entries(data).map(([key, value]) => ({
        key,
        ...value,
        hasPassword: Boolean(value?.passwordHash),
      }));

      users.sort((left, right) =>
        String(left.nombre || '').localeCompare(String(right.nombre || ''))
      );

      startTransition(() => {
        setStoreUsers(users);
      });
    });

    return () => unsubscribe();
  }, [isStoreMode, usersTab]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return products;
    }

    return products.filter((product) =>
      [product.code, product.name, product.category, product.subcategory]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [products, search]);

  const activeCategories = useMemo(
    () => categories.filter((category) => category.active !== false),
    [categories]
  );

  const filteredStoreUsers = useMemo(() => {
    const query = userSearch.trim().toLowerCase();
    if (!query) {
      return storeUsers;
    }

    return storeUsers.filter((user) =>
      [user.nombre, user.telefono, user.codigo, user.direccion]
        .join(' ')
        .toLowerCase()
      .includes(query)
    );
  }, [storeUsers, userSearch]);

  const sicarPreviewGroups = useMemo(() => {
    if (!sicarPreview) {
      return [];
    }

    const productsByCategory = new Map();
    (sicarPreview.products || []).forEach((product) => {
      const categoryId = String(product.category || '').trim();
      if (!productsByCategory.has(categoryId)) {
        productsByCategory.set(categoryId, []);
      }

      productsByCategory.get(categoryId).push(product);
    });

    return (sicarPreview.summary || []).map((item) => ({
      ...item,
      products: productsByCategory.get(String(item.storeCategory || '').trim()) || [],
    }));
  }, [sicarPreview]);

  const catalogCategories = useMemo(() => {
    if (form.category && !activeCategories.some((category) => category.id === form.category)) {
      const currentCategory = categories.find((category) => category.id === form.category);
      return currentCategory ? [...activeCategories, currentCategory] : activeCategories;
    }

    return activeCategories;
  }, [activeCategories, categories, form.category]);

  const selectedFormCategory = useMemo(
    () => catalogCategories.find((category) => category.id === form.category) || catalogCategories[0],
    [catalogCategories, form.category]
  );

  const formSubcategories = selectedFormCategory?.subcategories || [];

  const imageCropPreview = useMemo(() => {
    const width = Number(imageCrop.width || 0);
    const height = Number(imageCrop.height || 0);
    if (!imageCrop.open || width <= 0 || height <= 0) {
      return null;
    }

    const minSide = Math.max(1, Math.min(width, height));
    const zoom = clampCropValue(imageCrop.zoom, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM);
    const previewWidth = (width / minSide) * zoom * 100;
    const previewHeight = (height / minSide) * zoom * 100;
    const maxShiftX = Math.max(0, (previewWidth - 100) / 2);
    const maxShiftY = Math.max(0, (previewHeight - 100) / 2);

    return {
      zoom,
      previewWidth,
      previewHeight,
      previewLeft: 50 - maxShiftX * clampCropValue(imageCrop.offsetX, -1, 1),
      previewTop: 50 - maxShiftY * clampCropValue(imageCrop.offsetY, -1, 1),
    };
  }, [imageCrop]);

  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCategoryForm = (field, value) => {
    setCategoryForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateCouponForm = (field, value) => {
    setCouponForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updatePromotionForm = (field, value) => {
    setPromotionForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateDriverForm = (field, value) => {
    setDriverForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateKitchenForm = (field, value) => {
    setKitchenForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetProductEditor = () => {
    setImageCrop(buildEmptyImageCrop());
    setForm(buildEmptyProduct());
    setProductEditorOpen(false);
  };

  const openNewProductEditor = () => {
    setImageCrop(buildEmptyImageCrop());
    setForm(buildEmptyProduct());
    setProductEditorOpen(true);
  };

  const updatePasswordForm = (userKey, field, value) => {
    setPasswordForms((current) => ({
      ...current,
      [userKey]: {
        ...(current[userKey] || {}),
        [field]: value,
      },
    }));
  };

  const updateCategory = (categoryId) => {
    const nextCategory = catalogCategories.find((category) => category.id === categoryId);
    setForm((current) => ({
      ...current,
      category: categoryId,
      subcategory: nextCategory?.subcategories?.[0] || '',
    }));
  };

  const updateProductUnit = (nextUnit) => {
    setForm((current) => {
      const previousMinDefault = getDefaultProductMinQuantity(current.unit);
      const previousStepDefault = getDefaultProductQuantityStep(current.unit);
      const nextMinDefault = getDefaultProductMinQuantity(nextUnit);
      const nextStepDefault = getDefaultProductQuantityStep(nextUnit);
      const currentMin = Number(current.minQuantity || 0);
      const currentStep = Number(current.quantityStep || 0);
      const keepCustomMin = Number.isFinite(currentMin) && Math.abs(currentMin - previousMinDefault) > 0.0001;
      const keepCustomStep = Number.isFinite(currentStep) && Math.abs(currentStep - previousStepDefault) > 0.0001;

      return {
        ...current,
        unit: nextUnit,
        minQuantity: keepCustomMin ? current.minQuantity : String(nextMinDefault),
        quantityStep: keepCustomStep ? current.quantityStep : String(nextStepDefault),
      };
    });
  };

  const getCategoryLabel = (categoryId) =>
    categories.find((category) => category.id === categoryId)?.label || categoryId || '-';

  const editCategory = (category) => {
    setCategoryForm({
      id: category.id || '',
      label: category.label || '',
      subcategoriesText: (category.subcategories || []).join('\n'),
      active: category.active !== false,
      sortOrder: category.sortOrder ?? '',
    });
  };

  const editProduct = (product) => {
    setImageCrop(buildEmptyImageCrop());
    setForm({
      code: product.code || '',
      name: product.name || '',
      price: product.price || '',
      inventory: product.inventory ?? '',
      unit: product.unit || 'lb',
      category: product.category || 'res',
      subcategory: product.subcategory || 'Linea Diaria',
      minQuantity: String(getProductMinQuantity(product)),
      quantityStep: String(getProductQuantityStep(product)),
      active: product.active !== false,
      promo: Boolean(product.promo),
      image: product.image || '',
      description: product.description || '',
    });
    setProductEditorOpen(true);
  };

  const editCoupon = (coupon) => {
    setCouponForm({
      code: coupon.code || '',
      title: coupon.title || '',
      type: coupon.type || 'percent',
      value: coupon.value ?? '',
      minimum: coupon.minimum ?? '',
      maxUsesPerUser: coupon.maxUsesPerUser ?? '',
      active: coupon.active !== false,
      notes: coupon.notes || '',
    });
  };

  const editPromotion = (promotion) => {
    setPromotionForm({
      id: promotion.id || '',
      title: promotion.title || '',
      image: promotion.image || '',
      active: promotion.active !== false,
      sortOrder: promotion.sortOrder ?? '',
      startsAt: toDateTimeInputValue(promotion.startsAt),
      endsAt: toDateTimeInputValue(promotion.endsAt),
    });
  };

  const editDriver = (driver) => {
    setDriverForm({
      code: driver.code || '',
      name: driver.name || '',
      publicName: driver.publicName || '',
      phone: driver.phone || '',
      active: driver.active !== false,
      sortOrder: driver.sortOrder ?? '',
      password: '',
    });
  };

  const linkDriverToUser = (driver) => {
    setDriverForm((current) => ({
      ...current,
      code: driver.code || '',
      name: driver.name || '',
      publicName: driver.publicName || current.publicName || '',
      phone: driver.phone || current.phone || '',
      active: driver.active !== false,
      sortOrder: driver.sortOrder ?? current.sortOrder,
      password: current.code === driver.code ? current.password : '',
    }));
    setMessage(
      `Entregador ${driver.name || driver.code} cargado. Si defines una contrasena y guardas, tambien quedara listo para entrar al modulo Driver.`
    );
  };

  const startNewDriverForm = () => {
    const nextSuffix = drivers.reduce((max, driver) => {
      const match = String(driver?.code || '').match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

    setDriverForm({
      ...emptyDriver,
      code: `E-${String(nextSuffix).padStart(3, '0')}`,
      sortOrder: String((drivers.length + 1) * 10),
      active: true,
    });
  };

  const handleImageFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const source = String(reader.result || '');
      if (!source) {
        setMessage('No se pudo leer la foto seleccionada.');
        return;
      }

      try {
        const image = await loadCatalogImageElement(source);
        setImageCrop({
          open: true,
          source,
          fileName: file.name || 'Foto',
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          width: Number(image.width || 0),
          height: Number(image.height || 0),
        });
      } catch (error) {
        console.error('No se pudo abrir la foto para recortarla:', error);
        updateForm('image', source);
        setMessage('No se pudo abrir el recorte. La foto se cargo completa.');
      }
    };
    reader.onerror = () => {
      setMessage('No se pudo leer la foto seleccionada.');
    };
    reader.readAsDataURL(file);
  };

  const handlePromotionImageFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const source = String(reader.result || '');
      if (!source) {
        setMessage('No se pudo leer la historia seleccionada.');
        return;
      }

      updatePromotionForm('image', source);
      setMessage('Historia cargada. Guarda para publicarla.');
    };
    reader.onerror = () => {
      setMessage('No se pudo leer la historia seleccionada.');
    };
    reader.readAsDataURL(file);
  };

  const updateImageCrop = (field, value) => {
    setImageCrop((current) => ({
      ...current,
      [field]: field === 'zoom'
        ? clampCropValue(value, IMAGE_CROP_MIN_ZOOM, IMAGE_CROP_MAX_ZOOM)
        : clampCropValue(value, -1, 1),
    }));
  };

  const closeImageCrop = () => {
    if (applyingImageCrop) {
      return;
    }

    setImageCrop(buildEmptyImageCrop());
  };

  const applyImageCrop = async () => {
    if (!imageCrop.source) {
      return;
    }

    setApplyingImageCrop(true);
    setMessage('');

    try {
      const croppedImage = await cropCatalogImage(imageCrop);
      const optimizedImage = await compressImportedCatalogImage(croppedImage);
      updateForm('image', optimizedImage || croppedImage);
      setImageCrop(buildEmptyImageCrop());
      setMessage('Foto recortada y lista para guardar.');
    } catch (error) {
      console.error('No se pudo recortar la foto del producto:', error);
      setMessage('No se pudo aplicar el recorte de la foto.');
    } finally {
      setApplyingImageCrop(false);
    }
  };

  const saveProduct = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const existingProduct = products.find((product) => product.code === form.code) || null;
      await saveCatalogProduct({
        ...form,
        price: Number(form.price || 0),
        inventory: form.inventory === '' ? null : Number(form.inventory || 0),
        minQuantity: Number(form.minQuantity || getDefaultProductMinQuantity(form.unit)),
        quantityStep: Number(form.quantityStep || getDefaultProductQuantityStep(form.unit)),
      }, existingProduct);
      setMessage('Producto guardado con sus restricciones.');
      setImageCrop(buildEmptyImageCrop());
      setForm(buildEmptyProduct());
      setProductEditorOpen(false);
    } catch (error) {
      console.error('Error guardando producto:', error);
      setMessage(error?.message || 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    setSavingCategory(true);
    setMessage('');

    try {
      await saveStoreCategory({
        id: categoryForm.id,
        label: categoryForm.label,
        subcategories: categoryForm.subcategoriesText,
        active: categoryForm.active,
        sortOrder: categoryForm.sortOrder === '' ? categories.length * 10 : Number(categoryForm.sortOrder || 0),
      });
      setCategoryForm(emptyCategory);
      setMessage('Categoria guardada.');
    } catch (error) {
      console.error('Error guardando categoria:', error);
      setMessage('No se pudo guardar la categoria.');
    } finally {
      setSavingCategory(false);
    }
  };

  const unlockCoupons = (event) => {
    event.preventDefault();
    if (couponPin.trim() === COUPONS_PIN) {
      setCouponsUnlocked(true);
      setCouponPin('');
      setMessage('');
      return;
    }

    setMessage('PIN incorrecto para entrar a cupones.');
  };

  const saveCoupon = async (event) => {
    event.preventDefault();
    setSavingCoupon(true);
    setMessage('');

    try {
      await saveStoreCoupon({
        ...couponForm,
        value: Number(couponForm.value || 0),
        minimum: Number(couponForm.minimum || 0),
        maxUsesPerUser: Math.max(0, Math.trunc(Number(couponForm.maxUsesPerUser || 0))),
      });
      setCouponForm(emptyCoupon);
      setMessage('Cupon guardado.');
    } catch (error) {
      console.error('Error guardando cupon:', error);
      setMessage('No se pudo guardar el cupon. Revisa codigo y valor.');
    } finally {
      setSavingCoupon(false);
    }
  };

  const saveWelcomeCouponCampaignConfig = async (campaignDraft) => {
    setSavingWelcomeCouponCampaign(true);
    setMessage('');

    try {
      const savedCampaign = await saveStoreWelcomeCouponCampaign({
        ...welcomeCouponCampaign,
        ...campaignDraft,
        assignments: welcomeCouponCampaign.assignments || {},
        assignedCount: Number(welcomeCouponCampaign.assignedCount || 0),
      });
      setWelcomeCouponCampaign(savedCampaign);
      setMessage('Campana de bienvenida actualizada.');
    } catch (error) {
      console.error('No se pudo guardar la campana de bienvenida:', error);
      setMessage('No se pudo guardar la campana de bienvenida.');
    } finally {
      setSavingWelcomeCouponCampaign(false);
    }
  };

  const savePromotion = async (event) => {
    event.preventDefault();
    const startsAt = normalizeDateTimeInputValue(promotionForm.startsAt);
    const endsAt = normalizeDateTimeInputValue(promotionForm.endsAt);

    if (promotionForm.startsAt && !startsAt) {
      setMessage('La fecha inicial de la historia no es valida.');
      return;
    }

    if (promotionForm.endsAt && !endsAt) {
      setMessage('La fecha final de la historia no es valida.');
      return;
    }

    if (startsAt && endsAt && new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
      setMessage('La vigencia final debe ser posterior a la inicial.');
      return;
    }

    setSavingPromotion(true);
    setMessage('');

    try {
      const existingPromotion = promotions.find((promotion) => promotion.id === promotionForm.id) || null;
      await saveStorePromotion(
        {
          id: promotionForm.id,
          title: promotionForm.title,
          image: promotionForm.image,
          active: promotionForm.active,
          sortOrder: promotionForm.sortOrder === '' ? promotions.length * 10 : Number(promotionForm.sortOrder || 0),
          startsAt,
          endsAt,
        },
        existingPromotion
      );
      setPromotionForm(emptyPromotion);
      setMessage('Historia guardada.');
    } catch (error) {
      console.error('Error guardando historia:', error);
      setMessage(error?.message || 'No se pudo guardar la historia.');
    } finally {
      setSavingPromotion(false);
    }
  };

  const saveDeliveryDriver = async (event) => {
    event.preventDefault();
    setSavingDriver(true);
    setMessage('');

    try {
      const existingDriver = drivers.find((driver) => driver.code === driverForm.code);
      await saveDriver({
        ...(existingDriver || {}),
        ...driverForm,
        sortOrder: driverForm.sortOrder === '' ? drivers.length * 10 : Number(driverForm.sortOrder || 0),
      });
      setDriverForm(emptyDriver);
      setMessage('Entregador guardado con su acceso estandar de Driver.');
    } catch (error) {
      console.error('Error guardando entregador:', error);
      setMessage('No se pudo guardar el entregador.');
    } finally {
      setSavingDriver(false);
    }
  };

  const saveKitchenAccess = async (event) => {
    event.preventDefault();
    const password = String(kitchenForm.password || '').trim();
    const confirmPassword = String(kitchenForm.confirmPassword || '').trim();

    if (!String(kitchenForm.username || '').trim()) {
      setMessage('El usuario de cocina es obligatorio.');
      return;
    }

    if (!kitchenUser.hasPassword && password.length < 4) {
      setMessage('Define una contrasena inicial para Cocina de al menos 4 caracteres.');
      return;
    }

    if (password || confirmPassword) {
      if (password.length < 4) {
        setMessage('La contrasena debe tener al menos 4 caracteres.');
        return;
      }

      if (password !== confirmPassword) {
        setMessage('Las contrasenas no coinciden.');
        return;
      }
    }

    setSavingKitchen(true);
    setMessage('');

    try {
      const savedUser = await saveKitchenUser(kitchenForm);
      setKitchenForm({
        username: savedUser.username,
        displayName: savedUser.displayName,
        password: '',
        confirmPassword: '',
        active: savedUser.active !== false,
      });
      setMessage('Usuario unico de Cocina guardado.');
    } catch (error) {
      console.error('Error guardando usuario de cocina:', error);
      setMessage(error?.message || 'No se pudo guardar el usuario de Cocina.');
    } finally {
      setSavingKitchen(false);
    }
  };

  const toggleProduct = async (product) => {
    try {
      await updateCatalogProduct(product.code, { active: product.active === false });
    } catch (error) {
      console.error('Error actualizando producto:', error);
      setMessage('No se pudo actualizar el producto.');
    }
  };

  const toggleCategory = async (category) => {
    try {
      await updateStoreCategory(category.id, { active: category.active === false });
    } catch (error) {
      console.error('Error actualizando categoria:', error);
      setMessage('No se pudo actualizar la categoria.');
    }
  };

  const toggleCoupon = async (coupon) => {
    try {
      await updateStoreCoupon(coupon.code, { active: coupon.active === false });
    } catch (error) {
      console.error('Error actualizando cupon:', error);
      setMessage('No se pudo actualizar el cupon.');
    }
  };

  const togglePromotion = async (promotion) => {
    try {
      await updateStorePromotion(promotion.id, { active: promotion.active === false });
    } catch (error) {
      console.error('Error actualizando historia:', error);
      setMessage('No se pudo actualizar la historia.');
    }
  };

  const removePromotion = async (promotion) => {
    const confirmed =
      typeof window === 'undefined' ||
      window.confirm(`Se borrara la historia "${promotion.title || promotion.id}". Continuar?`);

    if (!confirmed) {
      return;
    }

    try {
      await deleteStorePromotion(promotion.id);
      setMessage('Historia eliminada.');
    } catch (error) {
      console.error('Error eliminando historia:', error);
      setMessage('No se pudo eliminar la historia.');
    }
  };

  const clearExpiredPromotions = async () => {
    setCleaningPromotions(true);
    setMessage('');

    try {
      const removedCount = await cleanupExpiredStorePromotions();
      setMessage(
        removedCount > 0
          ? `Se eliminaron ${removedCount} historias vencidas.`
          : 'No habia historias vencidas para eliminar.'
      );
    } catch (error) {
      console.error('Error limpiando historias vencidas:', error);
      setMessage('No se pudieron limpiar las historias vencidas.');
    } finally {
      setCleaningPromotions(false);
    }
  };

  const toggleDriver = async (driver) => {
    try {
      await updateDriver(driver.code, { active: driver.active === false });
    } catch (error) {
      console.error('Error actualizando entregador:', error);
      setMessage('No se pudo actualizar el entregador.');
    }
  };

  const saveClientPassword = async (event, user) => {
    event.preventDefault();
    const formData = passwordForms[user.key] || {};
    const password = String(formData.password || '').trim();
    const confirmPassword = String(formData.confirmPassword || '').trim();

    if (password.length < 4) {
      setMessage('La contrasena debe tener al menos 4 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Las contrasenas no coinciden.');
      return;
    }

    setSavingPasswordKey(user.key);
    setMessage('');

    try {
      await updateStoreUserPassword(user, password);
      setPasswordForms((current) => ({
        ...current,
        [user.key]: { password: '', confirmPassword: '' },
      }));
      setMessage(`Contrasena actualizada para ${user.nombre || user.telefono}.`);
    } catch (error) {
      console.error('Error actualizando contrasena de cliente:', error);
      setMessage('No se pudo actualizar la contrasena del cliente.');
    } finally {
      setSavingPasswordKey('');
    }
  };

  const seedCatalog = async () => {
    setSaving(true);
    setMessage('');
    try {
      const seeded = await seedDefaultCatalogIfEmpty();
      setMessage(seeded ? 'Catalogo base creado.' : 'El catalogo ya existe.');
    } catch (error) {
      console.error('Error inicializando catalogo:', error);
      setMessage('No se pudo inicializar el catalogo.');
    } finally {
      setSaving(false);
    }
  };

  const seedCategories = async () => {
    setSavingCategory(true);
    setMessage('');
    try {
      const seeded = await seedDefaultStoreCategoriesIfEmpty();
      setMessage(seeded ? 'Categorias base creadas.' : 'Las categorias ya existen.');
    } catch (error) {
      console.error('Error inicializando categorias:', error);
      setMessage('No se pudieron inicializar las categorias.');
    } finally {
      setSavingCategory(false);
    }
  };

  const seedDrivers = async () => {
    setSavingDriver(true);
    setMessage('');
    try {
      const seeded = await seedDefaultDriversIfEmpty();
      setMessage(seeded ? 'Entregadores base creados.' : 'Los entregadores ya existen.');
    } catch (error) {
      console.error('Error inicializando entregadores:', error);
      setMessage('No se pudieron inicializar los entregadores.');
    } finally {
      setSavingDriver(false);
    }
  };

  const testSicarConnection = async () => {
    setTestingSicar(true);
    setMessage('Probando conexion con SICAR...');

    try {
      const health = await getSicarBridgeHealth();
      setSicarHealth(health);
      setMessage(
        `Conexion SICAR OK. Puente activo en puerto ${health.bridgePort} para base ${health.database}.`
      );
    } catch (error) {
      console.error('Error probando conexion SICAR:', error);
      setMessage(buildSicarFailureMessage('No se pudo conectar con SICAR.', error));
    } finally {
      setTestingSicar(false);
    }
  };

  const loadSicarPreview = async () => {
    setLoadingSicarPreview(true);
    setMessage('Generando vista previa SICAR... esto puede tardar entre 10 y 20 segundos.');

    try {
      const health = await getSicarBridgeHealth();
      setSicarHealth(health);
      const payload = await fetchSicarCatalogSelection();
      setSicarPreview(payload);
      setMessage(
        `Vista previa SICAR lista. ${payload.products?.length || 0} SKUs en ${payload.summary?.length || 0} categorias.`
      );
    } catch (error) {
      console.error('Error cargando vista previa SICAR:', error);
      setMessage(buildSicarFailureMessage('No se pudo cargar la vista previa SICAR.', error));
    } finally {
      setLoadingSicarPreview(false);
    }
  };

  const applySicarCatalog = async (previewPayload = null) => {
    setSyncingSicar(true);
    setMessage('Aplicando catalogo SICAR... importando SKUs, categorias y fotos. Esto puede tardar unos momentos.');

    try {
      const health = await getSicarBridgeHealth();
      setSicarHealth(health);
      const payload = previewPayload || (await fetchSicarCatalogSelection());
      const currentCatalogMap = await getCurrentCatalogMap();
      const catalogProducts = Array.isArray(payload.products) ? payload.products : [];
      const totalProducts = catalogProducts.length;
      const imageCandidates = catalogProducts.filter((importedProduct) => {
        const productKey = getCatalogProductKey(importedProduct.code);
        const existingProduct = currentCatalogMap[productKey] || {};
        const hasExistingRecord = Boolean(existingProduct?.code);
        return !hasExistingRecord && importedProduct?.sicar?.hasImage;
      }).length;
      let importedImages = 0;
      const importedProducts = [];
      const productBatches = chunkArray(catalogProducts, 10);

      for (let batchIndex = 0; batchIndex < productBatches.length; batchIndex += 1) {
        const batch = productBatches[batchIndex];
        const batchResults = await Promise.all(
          batch.map(async (importedProduct) => {
            const productKey = getCatalogProductKey(importedProduct.code);
            const existingProduct = currentCatalogMap[productKey] || {};
            const hasExistingRecord = Boolean(existingProduct?.code);
            let nextImage = String(existingProduct?.image || '').trim();
            let importedImageCount = 0;

            if (!hasExistingRecord && importedProduct?.sicar?.hasImage) {
              try {
                const remoteImage = await fetchSicarProductImage(importedProduct.code);
                nextImage = await compressImportedCatalogImage(remoteImage.dataUrl);
                importedImageCount = 1;
              } catch (error) {
                console.error(`No se pudo importar la imagen de ${importedProduct.code}:`, error);
              }
            }

            return {
              product: {
                ...importedProduct,
                image: nextImage,
              },
              importedImageCount,
            };
          })
        );

        batchResults.forEach(({ product, importedImageCount }) => {
          importedProducts.push(product);
          importedImages += importedImageCount;
        });

        setMessage(
          `Preparando catalogo SICAR... ${importedProducts.length}/${totalProducts} SKUs listos y ${importedImages}/${imageCandidates} fotos importadas.`
        );
        await waitForUiPaint();
      }

      setMessage(`Guardando catalogo SICAR en tienda... 0/${importedProducts.length} SKUs aplicados.`);
      const { appliedCount, appliedProducts } = await applySicarCatalogProductsWithOptions(importedProducts, {
        currentMap: currentCatalogMap,
        batchSize: SICAR_CATALOG_SYNC_BATCH_SIZE,
        onProgress: ({ processed, total }) => {
          setMessage(`Guardando catalogo SICAR en tienda... ${processed}/${total} SKUs aplicados.`);
        },
      });
      setMessage('Sincronizando categorias SICAR con la tienda...');
      const categoryCount = await syncStoreCategoriesFromCatalogProducts(appliedProducts);
      setSicarPreview(null);
      setMessage(
        `Catalogo SICAR aplicado. ${appliedCount} SKUs actualizados, ${categoryCount} categorias sincronizadas y ${importedImages} fotos importadas.`
      );
    } catch (error) {
      console.error('Error aplicando catalogo SICAR:', error);
      setMessage(buildSicarFailureMessage('No se pudo aplicar el catalogo SICAR.', error));
    } finally {
      setSyncingSicar(false);
    }
  };

  const updateSicarPrices = async () => {
    setSyncingSicarPrices(true);
    setMessage('Actualizando precios SICAR por clave... buscando coincidencias en tu catalogo actual.');

    try {
      const health = await getSicarBridgeHealth();
      setSicarHealth(health);

      const currentCatalogMap = await getCurrentCatalogMap();
      const catalogCodes = Array.from(
        new Set(
          Object.values(currentCatalogMap || {})
            .map((product) => String(product?.code || '').trim())
            .filter(Boolean)
        )
      );

      if (catalogCodes.length === 0) {
        setMessage('No hay SKUs con codigo en el catalogo actual para actualizar precios desde SICAR.');
        return;
      }

      const pricePayload = await fetchSicarPricesByCodes(catalogCodes);
      const matchedProducts = Array.isArray(pricePayload?.products) ? pricePayload.products : [];

      if (matchedProducts.length === 0) {
        setMessage('SICAR no devolvio coincidencias por clave para actualizar precios.');
        return;
      }

      setMessage(`Guardando precios SICAR... 0/${matchedProducts.length} SKUs actualizados por clave.`);
      const { appliedCount } = await applySicarPriceUpdatesWithOptions(matchedProducts, {
        currentMap: currentCatalogMap,
        batchSize: SICAR_CATALOG_SYNC_BATCH_SIZE,
        onProgress: ({ processed, total }) => {
          setMessage(`Guardando precios SICAR... ${processed}/${total} SKUs actualizados por clave.`);
        },
      });

      const missingCount = Math.max(0, catalogCodes.length - matchedProducts.length);
      setMessage(
        `Precios SICAR actualizados. ${appliedCount} SKUs actualizados por clave y ${missingCount} no tuvieron coincidencia en SICAR.`
      );
    } catch (error) {
      console.error('Error actualizando precios SICAR:', error);
      setMessage(buildSicarFailureMessage('No se pudieron actualizar los precios SICAR.', error));
    } finally {
      setSyncingSicarPrices(false);
    }
  };

  const migrateLegacyCatalogImages = async () => {
    setMigratingCatalogImages(true);
    setMessage('Migrando fotos legacy a Firebase Storage... esto puede tardar varios minutos.');

    try {
      const currentCatalogMap = await getCurrentCatalogMap();
      const result = await migrateCatalogImagesToStorage({
        currentMap: currentCatalogMap,
        batchSize: Math.max(5, SICAR_CATALOG_SYNC_BATCH_SIZE),
        onProgress: ({ processed, total }) => {
          setMessage(`Migrando fotos a Storage... ${processed}/${total} SKUs actualizados.`);
        },
      });

      setMessage(
        `Migracion de fotos terminada. ${result.migratedCount} imagenes subidas a Storage, ${result.cleanedMetadataCount} registros legacy limpiados y ${result.updatedCount} SKUs actualizados.`
      );
    } catch (error) {
      console.error('Error migrando fotos a Storage:', error);
      setMessage(
        `No se pudieron migrar las fotos a Storage. Revisa permisos de Firebase Storage y vuelve a intentar. ${error?.message || ''}`.trim()
      );
    } finally {
      setMigratingCatalogImages(false);
    }
  };

  const runExpiredOrdersCleanup = async () => {
    setCleaningExpiredOrders(true);
    setMessage('Limpiando pedidos virtuales vencidos...');

    try {
      const removedCount = await cleanupExpiredStoreOrders();
      setMessage(
        removedCount > 0
          ? `Limpieza completa. ${removedCount} pedidos virtuales vencidos fueron eliminados.`
          : 'Limpieza completa. No habia pedidos virtuales vencidos para eliminar.'
      );
    } catch (error) {
      console.error('Error limpiando pedidos vencidos:', error);
      setMessage('No se pudieron limpiar los pedidos virtuales vencidos.');
    } finally {
      setCleaningExpiredOrders(false);
    }
  };

  const saveDeliveryConfig = async (nextSettings) => {
    setSavingDeliverySettings(true);
    setMessage('Guardando cobertura, tarifas y horario de entrega...');

    try {
      const savedSettings = await saveStoreDeliverySettings(nextSettings);
      setDeliverySettings(savedSettings);
      setMessage('Configuracion de entrega guardada. La tienda ya usara este radio, estas tarifas y el nuevo horario.');
    } catch (error) {
      console.error('Error guardando configuracion de entrega:', error);
      setMessage('No se pudo guardar la configuracion de entrega.');
    } finally {
      setSavingDeliverySettings(false);
    }
  };

  const sectionMeta = isStoreMode
    ? {
        categorias: {
          path: 'Admintv / Tienda Virtual / Categorias',
          title: 'Categorias y subcategorias',
        },
        catalogo: {
          path: 'Admintv / Tienda Virtual / Catalogo',
          title: 'Catalogo de tienda virtual',
        },
        cupones: {
          path: 'Admintv / Tienda Virtual / Cupones',
          title: 'Cupones',
        },
        recompensas: {
          path: 'Admintv / Tienda Virtual / Programa de Recompensas',
          title: 'Club San Martin Granada',
        },
        entrega: {
          path: 'Admintv / Tienda Virtual / Entrega',
          title: 'Entrega y cobertura',
        },
        pedidos: {
          path: 'Admintv / Tienda Virtual / Pedidos',
          title: 'Pedidos de tienda virtual',
        },
        promociones: {
          path: 'Admintv / Tienda Virtual / Historias',
          title: 'Historias',
        },
      }[section] || {
        path: 'Admintv / Tienda Virtual',
        title: 'Tienda Virtual',
      }
    : {
        usuarios: {
          path: 'Admintv / Configuracion / Usuarios',
          title: 'Usuarios',
        },
      }[section] || {
        path: 'Admintv / Configuracion',
        title: 'Configuracion',
      };

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        background: '#f8fafc',
        padding: '24px',
        color: '#0f172a',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
      }}
    >
      <style>{`
        .cfg-shell * { box-sizing: border-box; }
        .cfg-button {
          border: 0;
          border-radius: 8px;
          padding: 12px 14px;
          background: #dc2626;
          color: #fff;
          font-weight: 900;
          cursor: pointer;
        }
        .cfg-button.secondary {
          background: #fff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
        }
        .cfg-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        .cfg-tab {
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 11px 16px;
          background: #fff;
          color: #475569;
          cursor: pointer;
          font: inherit;
          font-weight: 900;
        }
        .cfg-tab.active {
          background: #0f172a;
          border-color: #0f172a;
          color: #fff;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
        }
        .cfg-input,
        .cfg-textarea,
        .cfg-select {
          width: 100%;
          min-height: 42px;
          border: 1px solid #dbe3ef;
          border-radius: 8px;
          padding: 10px 12px;
          font: inherit;
          outline: 0;
          background: #fff;
        }
        .cfg-textarea {
          min-height: 84px;
          resize: vertical;
        }
        .cfg-table {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          overflow: hidden;
        }
        .cfg-table th,
        .cfg-table td {
          padding: 12px;
          border-bottom: 1px solid #edf2f7;
          text-align: left;
          vertical-align: middle;
          font-size: 14px;
        }
        .cfg-table th {
          color: #64748b;
          font-size: 12px;
          text-transform: uppercase;
        }
        .cfg-photo {
          width: 58px;
          height: 58px;
          border-radius: 8px;
          object-fit: contain;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
        }
        .cfg-badge {
          display: inline-flex;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 900;
          background: #ecfdf5;
          color: #047857;
        }
        .cfg-badge.off {
          background: #fee2e2;
          color: #b91c1c;
        }
        .cfg-driver-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 18px;
          background: rgba(15, 23, 42, 0.68);
          backdrop-filter: blur(5px);
        }
        .cfg-driver-modal {
          width: min(680px, 100%);
          max-height: calc(100vh - 36px);
          overflow: auto;
          border-radius: 24px;
          padding: 24px;
          background: #ffffff;
          box-shadow: 0 28px 80px rgba(15, 23, 42, 0.32);
        }
        .cfg-product-modal {
          width: min(980px, 100%);
        }
        .cfg-driver-picker-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
          gap: 12px;
          margin-top: 18px;
        }
        .cfg-driver-picker-card {
          min-height: 126px;
          border: 2px solid #e2e8f0;
          border-radius: 18px;
          padding: 14px 10px;
          background: #f8fafc;
          color: #475569;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font: inherit;
          text-align: center;
          transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
        }
        .cfg-driver-picker-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.12);
        }
        .cfg-driver-picker-card.selected {
          border-color: #6366f1;
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
          color: #ffffff;
          box-shadow: 0 16px 34px rgba(99, 102, 241, 0.28);
        }
        .cfg-driver-picker-icon {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.72);
          color: #4f46e5;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .cfg-driver-picker-card strong {
          font-size: 14px;
          line-height: 1.2;
        }
        .cfg-driver-picker-card small,
        .cfg-driver-picker-card em {
          font-size: 12px;
          font-style: normal;
          font-weight: 850;
          opacity: 0.82;
        }
        .cfg-section-card {
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 16px;
          margin-top: 18px;
        }
        @media (max-width: 980px) {
          .cfg-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>

      <div className="cfg-shell">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
              {sectionMeta.path}
            </div>
            <h1 style={{ margin: '6px 0 0', fontSize: 30 }}>
              {sectionMeta.title}
            </h1>
          </div>
          {isStoreMode && section === 'catalogo' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cfg-button"
                onClick={updateSicarPrices}
                disabled={testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices || migratingCatalogImages || cleaningExpiredOrders}
              >
                {syncingSicarPrices ? 'Actualizando precios...' : 'Actualizar precios SICAR'}
              </button>
            </div>
          )}
        </div>

        {message && (
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 8,
              background: '#fff',
              border: '1px solid #e2e8f0',
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        )}

        {isStoreMode && section === 'catalogo' && sicarHealth && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              borderRadius: 12,
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ color: '#1d4ed8' }}>Estado SICAR</strong>
            </div>
            {sicarHealth && (
              <div style={{ color: '#1e3a8a', fontWeight: 700, lineHeight: 1.5 }}>
                Bridge local activo en puerto {sicarHealth.bridgePort}. Base detectada: {sicarHealth.database} en{' '}
                {sicarHealth.host}.
              </div>
            )}
          </div>
        )}

        {isStoreMode && (
          <div className="cfg-tabs">
            <button
              type="button"
              className={`cfg-tab ${section === 'categorias' ? 'active' : ''}`}
              onClick={() => setSection('categorias')}
            >
              Categorias
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'catalogo' ? 'active' : ''}`}
              onClick={() => setSection('catalogo')}
            >
              Catalogo
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'cupones' ? 'active' : ''}`}
              onClick={() => setSection('cupones')}
            >
              Cupones
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'recompensas' ? 'active' : ''}`}
              onClick={() => setSection('recompensas')}
            >
              Recompensas
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'entrega' ? 'active' : ''}`}
              onClick={() => setSection('entrega')}
            >
              Entrega
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'pedidos' ? 'active' : ''}`}
              onClick={() => setSection('pedidos')}
            >
              Pedidos
            </button>
            <button
              type="button"
              className={`cfg-tab ${section === 'promociones' ? 'active' : ''}`}
              onClick={() => setSection('promociones')}
            >
              Historias
            </button>
          </div>
        )}

        {isStoreMode && section === 'categorias' ? (
          <section className="cfg-section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22 }}>Categorias y subcategorias</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
                  Administra como se organizan los productos dentro de la tienda virtual.
                </p>
              </div>
              <button type="button" className="cfg-button secondary" onClick={seedCategories} disabled={savingCategory}>
                Inicializar categorias base
              </button>
            </div>

            <div
              className="cfg-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
                gap: 14,
                marginTop: 14,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 10 }}>
                {categories.map((category) => (
                  <div
                    key={category.id}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 8,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong>{category.label}</strong>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                        {(category.subcategories || []).join(' | ') || 'Sin subcategorias'}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={`cfg-badge ${category.active === false ? 'off' : ''}`}>
                          {category.active === false ? 'Inactiva' : 'Activa'}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="button" className="cfg-button secondary" onClick={() => editCategory(category)}>
                        Editar
                      </button>
                      <button type="button" className="cfg-button secondary" onClick={() => toggleCategory(category)}>
                        {category.active === false ? 'Activar' : 'Desactivar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={saveCategory} style={{ display: 'grid', gap: 10 }}>
                <input
                  className="cfg-input"
                  value={categoryForm.label}
                  onChange={(event) => updateCategoryForm('label', event.target.value)}
                  placeholder="Nombre de categoria"
                />
                <textarea
                  className="cfg-textarea"
                  value={categoryForm.subcategoriesText}
                  onChange={(event) => updateCategoryForm('subcategoriesText', event.target.value)}
                  placeholder="Subcategorias, una por linea o separadas por coma"
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <input
                    className="cfg-input"
                    type="number"
                    value={categoryForm.sortOrder}
                    onChange={(event) => updateCategoryForm('sortOrder', event.target.value)}
                    placeholder="Orden"
                  />
                  <select
                    className="cfg-select"
                    value={categoryForm.active ? 'activo' : 'inactivo'}
                    onChange={(event) => updateCategoryForm('active', event.target.value === 'activo')}
                  >
                    <option value="activo">Activa</option>
                    <option value="inactivo">Inactiva</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button type="submit" className="cfg-button" disabled={savingCategory}>
                    {savingCategory ? 'Guardando...' : 'Guardar categoria'}
                  </button>
                  <button
                    type="button"
                    className="cfg-button secondary"
                    onClick={() => setCategoryForm(emptyCategory)}
                  >
                    Nueva
                  </button>
                </div>
              </form>
            </div>
          </section>
        ) : isStoreMode && section === 'catalogo' ? (
          <>
            <section className="cfg-section-card">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <input
                  className="cfg-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar producto"
                  style={{ maxWidth: 360 }}
                />
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{catalogHydrated ? `${filteredProducts.length} productos` : 'Cargando catalogo...'}</strong>
                  <button type="button" className="cfg-button secondary" onClick={openNewProductEditor}>
                    Nuevo producto
                  </button>
                </div>
              </div>

              <table className="cfg-table">
                <thead>
                  <tr>
                    <th>Foto</th>
                    <th>Producto</th>
                    <th>Categoria</th>
                    <th>Precio</th>
                    <th>Inventario</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {!catalogHydrated && filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ color: '#64748b', fontWeight: 800 }}>
                        Cargando catalogo real desde Firebase...
                      </td>
                    </tr>
                  )}
                  {filteredProducts.map((product) => (
                    <tr key={product.code}>
                      <td>
                        <img
                          className="cfg-photo"
                          src={product.image || '/tienda/branding/logo.png'}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      </td>
                      <td>
                        <strong>{product.name}</strong>
                        <div style={{ color: '#64748b', marginTop: 4 }}>{product.code}</div>
                        {product.description && (
                          <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>{product.description}</div>
                        )}
                        {isSicarManagedProduct(product) && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            <span className="cfg-badge">SICAR</span>
                            {product.sync?.overrides?.name && <span className="cfg-badge">Nombre manual</span>}
                            {product.sync?.overrides?.price && <span className="cfg-badge">Precio manual</span>}
                            {product.sync?.overrides?.image && <span className="cfg-badge">Foto manual</span>}
                          </div>
                        )}
                        {hasCustomProductQuantityRules(product) && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                            <span className="cfg-badge">
                              Min {formatRestrictionValue(getProductMinQuantity(product), product.unit)}
                            </span>
                            <span className="cfg-badge">
                              Paso {formatRestrictionValue(getProductQuantityStep(product), product.unit)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td>
                        <strong>{getCategoryLabel(product.category)}</strong>
                        <div style={{ color: '#64748b', marginTop: 4 }}>{product.subcategory || '-'}</div>
                        {product.promo && (
                          <div style={{ marginTop: 6 }}>
                            <span className="cfg-badge">Promocion</span>
                          </div>
                        )}
                      </td>
                      <td>C$ {Number(product.price || 0).toFixed(2)}</td>
                      <td>{product.inventory === null || product.inventory === undefined || product.inventory === '' ? '-' : Number(product.inventory)}</td>
                      <td>
                        <span className={`cfg-badge ${product.active === false ? 'off' : ''}`}>
                          {product.active === false ? 'Inactivo' : 'Activo'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button type="button" className="cfg-button secondary" onClick={() => editProduct(product)}>
                            Editar
                          </button>
                          <button type="button" className="cfg-button secondary" onClick={() => toggleProduct(product)}>
                            {product.active === false ? 'Activar' : 'Desactivar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {productEditorOpen && (
              <div
                className="cfg-driver-modal-overlay"
                onClick={(event) => {
                  if (event.target === event.currentTarget && !saving && !applyingImageCrop) {
                    resetProductEditor();
                  }
                }}
              >
                <form
                  onSubmit={saveProduct}
                  className="cfg-driver-modal cfg-product-modal"
                  style={{ display: 'grid', gap: 16 }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                        Tienda Virtual / Catalogo
                      </div>
                      <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>
                        {products.some((product) => product.code === form.code) ? 'Editar producto' : 'Nuevo producto'}
                      </h2>
                    </div>
                    <button type="button" className="cfg-button secondary" onClick={resetProductEditor} disabled={saving || applyingImageCrop}>
                      Cerrar
                    </button>
                  </div>

                  {isSicarManagedProduct(products.find((product) => product.code === form.code)) && (
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: '#fff7ed',
                        border: '1px solid #fed7aa',
                        color: '#9a3412',
                        fontWeight: 800,
                        lineHeight: 1.5,
                      }}
                    >
                      Este SKU esta sincronizado con SICAR. Si cambias nombre, precio o foto aqui, esos campos quedaran
                      protegidos y no se sobreescribiran en la proxima actualizacion.
                    </div>
                  )}

                  <div
                    className="cfg-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1.2fr) minmax(320px, 0.8fr)',
                      gap: 16,
                      alignItems: 'start',
                    }}
                  >
                    <div style={{ display: 'grid', gap: 10 }}>
                      <input
                        className="cfg-input"
                        value={form.code}
                        onChange={(event) => updateForm('code', event.target.value)}
                        placeholder="Codigo SICAR"
                      />
                      <input
                        className="cfg-input"
                        value={form.name}
                        onChange={(event) => updateForm('name', event.target.value)}
                        placeholder="Nombre"
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input
                          className="cfg-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.price}
                          onChange={(event) => updateForm('price', event.target.value)}
                          placeholder="Precio"
                        />
                        <input
                          className="cfg-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.inventory}
                          onChange={(event) => updateForm('inventory', event.target.value)}
                          placeholder="Inventario (opcional)"
                        />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <select
                          className="cfg-select"
                          value={form.unit}
                          onChange={(event) => updateProductUnit(event.target.value)}
                        >
                          <option value="lb">lb</option>
                          <option value="unidad">unidad</option>
                        </select>
                        <select
                          className="cfg-select"
                          value={form.active ? 'activo' : 'inactivo'}
                          onChange={(event) => updateForm('active', event.target.value === 'activo')}
                        >
                          <option value="activo">Activo</option>
                          <option value="inactivo">Inactivo</option>
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <input
                          className="cfg-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.minQuantity}
                          onChange={(event) => updateForm('minQuantity', event.target.value)}
                          placeholder={`Minimo en ${form.unit}`}
                        />
                        <input
                          className="cfg-input"
                          type="number"
                          min="0"
                          step="0.01"
                          value={form.quantityStep}
                          onChange={(event) => updateForm('quantityStep', event.target.value)}
                          placeholder={`Incremento en ${form.unit}`}
                        />
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
                        Ejemplo: minimo 1 y paso 1 para New York deja solo 1 lb, 2 lb, 3 lb. Si dejas 0.5 y 0.5,
                        permite media libra, 1 lb, 1.5 lb y asi sucesivamente.
                      </div>
                      <select
                        className="cfg-select"
                        value={form.promo ? 'promo' : 'normal'}
                        onChange={(event) => updateForm('promo', event.target.value === 'promo')}
                      >
                        <option value="normal">Producto normal</option>
                        <option value="promo">Promocion / combo</option>
                      </select>
                      <select
                        className="cfg-select"
                        value={form.category}
                        onChange={(event) => updateCategory(event.target.value)}
                      >
                        {catalogCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="cfg-select"
                        value={form.subcategory}
                        onChange={(event) => updateForm('subcategory', event.target.value)}
                      >
                        {formSubcategories.map((subcategory) => (
                          <option key={subcategory} value={subcategory}>
                            {subcategory}
                          </option>
                        ))}
                        {!formSubcategories.includes(form.subcategory) && form.subcategory && (
                          <option value={form.subcategory}>{form.subcategory}</option>
                        )}
                      </select>
                      <textarea
                        className="cfg-textarea"
                        value={form.description}
                        onChange={(event) => updateForm('description', event.target.value)}
                        placeholder="Descripcion corta"
                      />
                    </div>

                    <div style={{ display: 'grid', gap: 10 }}>
                      <input
                        className="cfg-input"
                        value={form.image}
                        onChange={(event) => updateForm('image', event.target.value)}
                        placeholder="URL o imagen guardada"
                      />
                      <input className="cfg-input" type="file" accept="image/*" onChange={handleImageFile} />
                      {form.image && (
                        <img
                          src={form.image}
                          alt="Vista previa"
                          style={{
                            width: '100%',
                            maxHeight: 280,
                            objectFit: 'contain',
                            background: '#f1f5f9',
                            borderRadius: 12,
                            border: '1px solid #e2e8f0',
                          }}
                        />
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button type="button" className="cfg-button secondary" onClick={resetProductEditor} disabled={saving || applyingImageCrop}>
                      Cancelar
                    </button>
                    <button type="submit" className="cfg-button" disabled={saving}>
                      {saving ? 'Guardando...' : 'Guardar producto'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        ) : isStoreMode && section === 'recompensas' ? (
          <StoreRewardsAdminSection catalog={products} />
        ) : isStoreMode && section === 'entrega' ? (
          <DeliverySettingsManager
            settings={deliverySettings}
            saving={savingDeliverySettings}
            onSave={saveDeliveryConfig}
          />
        ) : isStoreMode && section === 'pedidos' ? (
          <StoreOrdersAdminSection orders={storeOrders} loading={storeOrdersLoading} />
        ) : isStoreMode && section === 'promociones' ? (
          <PromotionsManager
            promotions={promotions}
            promotionForm={promotionForm}
            savingPromotion={savingPromotion}
            cleaningPromotions={cleaningPromotions}
            updatePromotionForm={updatePromotionForm}
            savePromotion={savePromotion}
            editPromotion={editPromotion}
            togglePromotion={togglePromotion}
            removePromotion={removePromotion}
            handlePromotionImageFile={handlePromotionImageFile}
            clearExpiredPromotions={clearExpiredPromotions}
            resetPromotionForm={() => setPromotionForm(emptyPromotion)}
          />
        ) : isStoreMode && section === 'cupones' ? (
          <CouponsManager
            coupons={coupons}
            couponsUnlocked={couponsUnlocked}
            couponPin={couponPin}
            couponForm={couponForm}
            savingCoupon={savingCoupon}
            welcomeCouponCampaign={welcomeCouponCampaign}
            savingWelcomeCouponCampaign={savingWelcomeCouponCampaign}
            setCouponPin={setCouponPin}
            unlockCoupons={unlockCoupons}
            updateCouponForm={updateCouponForm}
            saveCoupon={saveCoupon}
            saveWelcomeCouponCampaignConfig={saveWelcomeCouponCampaignConfig}
            editCoupon={editCoupon}
            toggleCoupon={toggleCoupon}
            resetCouponForm={() => setCouponForm(emptyCoupon)}
          />
        ) : (
          <UsersManager
            usersTab={usersTab}
            setUsersTab={setUsersTab}
            kitchenUser={kitchenUser}
            kitchenForm={kitchenForm}
            updateKitchenForm={updateKitchenForm}
            saveKitchenAccess={saveKitchenAccess}
            savingKitchen={savingKitchen}
            storeUsers={storeUsers}
            filteredStoreUsers={filteredStoreUsers}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            passwordForms={passwordForms}
            updatePasswordForm={updatePasswordForm}
            saveClientPassword={saveClientPassword}
            savingPasswordKey={savingPasswordKey}
            drivers={drivers}
            driverForm={driverForm}
            savingDriver={savingDriver}
            updateDriverForm={updateDriverForm}
            saveDeliveryDriver={saveDeliveryDriver}
            editDriver={editDriver}
            linkDriverToUser={linkDriverToUser}
            toggleDriver={toggleDriver}
            resetDriverForm={() => setDriverForm(emptyDriver)}
            startNewDriverForm={startNewDriverForm}
          />
        )}

        {sicarPreview && (
          <div
            className="cfg-driver-modal-overlay"
            onClick={() => {
              if (!syncingSicar) {
                setSicarPreview(null);
              }
            }}
          >
            <div
              className="cfg-driver-modal"
              style={{ width: 'min(1120px, 100%)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                    Vista previa antes de aplicar
                  </div>
                  <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>Catalogo SICAR 90%</h2>
                  <p style={{ margin: '8px 0 0', color: '#475569', fontWeight: 700, lineHeight: 1.5 }}>
                    Solo se muestran categorias con al menos {sicarPreview.rules?.minOverallSharePct || 0}% del total
                    vendido. Dentro de cada categoria se toman SKUs hasta cubrir {sicarPreview.rules?.thresholdPct || 0}
                    % acumulado de venta. En Res tambien se incluye completa la subcategoria Linea Practica y Tortas
                    Hamburguesa.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
                  <button
                    type="button"
                    className="cfg-button secondary"
                    onClick={() => setSicarPreview(null)}
                    disabled={syncingSicar}
                  >
                    Cerrar
                  </button>
                  <button
                    type="button"
                    className="cfg-button"
                    onClick={() => applySicarCatalog(sicarPreview)}
                    disabled={syncingSicar}
                  >
                    {syncingSicar ? 'Aplicando SICAR...' : 'Aplicar catalogo SICAR'}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: 12,
                  marginTop: 20,
                }}
              >
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    Total SKU
                  </div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
                    {formatSicarNumber(sicarPreview.products?.length || 0, 0)}
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    Categorias
                  </div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
                    {formatSicarNumber(sicarPreview.summary?.length || 0, 0)}
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    Ventana
                  </div>
                  <div style={{ marginTop: 8, fontSize: 16, fontWeight: 900 }}>
                    {formatSicarDate(sicarPreview.dateWindow?.startDate)} al{' '}
                    {formatSicarDate(sicarPreview.dateWindow?.endInclusiveDate)}
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#f8fafc' }}>
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    Venta total
                  </div>
                  <div style={{ marginTop: 8, fontSize: 28, fontWeight: 900 }}>
                    {formatSicarNumber(sicarPreview.totalOverallQuantity || 0, 2)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                  gap: 12,
                  marginTop: 20,
                }}
              >
                {sicarPreviewGroups.map((group) => (
                  <div
                    key={group.storeCategory}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 16,
                      padding: 14,
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
                      <div>
                        <strong style={{ fontSize: 18 }}>{group.storeCategoryLabel}</strong>
                        <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                          {group.selectedSkuCount} de {group.soldSkuCount} SKUs vendidos
                        </div>
                      </div>
                      <span className="cfg-badge">{group.overallSharePct}% del total</span>
                    </div>
                    <div style={{ marginTop: 10, color: '#475569', fontSize: 13, lineHeight: 1.5 }}>
                      Subcategorias: {group.subcategories?.join(' | ') || 'Sin subcategorias'}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 22, display: 'grid', gap: 16 }}>
                {sicarPreviewGroups.map((group) => (
                  <section
                    key={`${group.storeCategory}-products`}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 16,
                      padding: 14,
                      background: '#ffffff',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 20 }}>{group.storeCategoryLabel}</h3>
                        <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 700 }}>
                          {group.selectedSkuCount} SKUs que entrarian a la tienda virtual.
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <span className="cfg-badge">{group.overallSharePct}% del total</span>
                        <span className="cfg-badge">{group.subcategories?.length || 0} subcategorias</span>
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto', marginTop: 14 }}>
                      <table className="cfg-table">
                        <thead>
                          <tr>
                            <th>Codigo</th>
                            <th>Descripcion</th>
                            <th>Subcategoria</th>
                            <th>Precio</th>
                            <th>Venta 90d</th>
                            <th>Foto SICAR</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.products.map((product) => (
                            <tr key={product.code}>
                              <td>{product.code}</td>
                              <td>
                                <strong>{product.name}</strong>
                              </td>
                              <td>{product.subcategory || '-'}</td>
                              <td>C$ {Number(product.price || 0).toFixed(2)}</td>
                              <td>{formatSicarNumber(product.sicar?.quantitySold90d || 0, 2)}</td>
                              <td>
                                <span className={`cfg-badge ${product.sicar?.hasImage ? '' : 'off'}`}>
                                  {product.sicar?.hasImage ? 'Disponible' : 'Sin foto'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </div>
        )}

        {imageCrop.open && imageCropPreview && (
          <div
            className="cfg-driver-modal-overlay"
            onClick={closeImageCrop}
          >
            <div
              className="cfg-driver-modal"
              style={{ width: 'min(760px, 100%)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                    Foto del articulo
                  </div>
                  <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>Recorta la imagen</h2>
                  <p style={{ margin: '8px 0 0', color: '#475569', fontWeight: 700, lineHeight: 1.5 }}>
                    Ajusta el encuadre para que el producto se vea limpio en la tienda. El recorte se guarda antes
                    de subir la foto al sistema.
                  </p>
                </div>
                <div style={{ color: '#94a3b8', fontWeight: 800 }}>
                  {imageCrop.fileName || 'Foto nueva'}
                </div>
              </div>

              <div
                style={{
                  marginTop: 20,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 320px)',
                  gap: 18,
                  alignItems: 'start',
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    justifyItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 'min(100%, 360px)',
                      aspectRatio: '1 / 1',
                      position: 'relative',
                      overflow: 'hidden',
                      borderRadius: 24,
                      background: 'linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%)',
                      border: '1px solid #cbd5e1',
                      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.5)',
                    }}
                  >
                    <img
                      src={imageCrop.source}
                      alt="Recorte de producto"
                      style={{
                        position: 'absolute',
                        width: `${imageCropPreview.previewWidth}%`,
                        height: `${imageCropPreview.previewHeight}%`,
                        left: `${imageCropPreview.previewLeft}%`,
                        top: `${imageCropPreview.previewTop}%`,
                        transform: 'translate(-50%, -50%)',
                        objectFit: 'cover',
                        userSelect: 'none',
                        pointerEvents: 'none',
                      }}
                    />
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 24,
                        boxShadow: 'inset 0 0 0 2px rgba(15, 23, 42, 0.08)',
                      }}
                    />
                  </div>
                  <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
                    Vista previa cuadrada para la tienda virtual.
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gap: 14,
                    padding: 16,
                    borderRadius: 18,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                  }}
                >
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>
                      Zoom: {imageCropPreview.zoom.toFixed(2)}x
                    </span>
                    <input
                      type="range"
                      min={IMAGE_CROP_MIN_ZOOM}
                      max={IMAGE_CROP_MAX_ZOOM}
                      step="0.01"
                      value={imageCrop.zoom}
                      onChange={(event) => updateImageCrop('zoom', event.target.value)}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>Mover horizontal</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={imageCrop.offsetX}
                      onChange={(event) => updateImageCrop('offsetX', event.target.value)}
                    />
                  </label>

                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={{ fontWeight: 800, color: '#0f172a' }}>Mover vertical</span>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.01"
                      value={imageCrop.offsetY}
                      onChange={(event) => updateImageCrop('offsetY', event.target.value)}
                    />
                  </label>

                  <div style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, fontWeight: 700 }}>
                    Consejo: acerca la foto si quieres resaltar el corte y mueve el encuadre hasta que quede centrado.
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="cfg-button secondary"
                      onClick={closeImageCrop}
                      disabled={applyingImageCrop}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="cfg-button"
                      onClick={applyImageCrop}
                      disabled={applyingImageCrop}
                    >
                      {applyingImageCrop ? 'Aplicando recorte...' : 'Usar recorte'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DriversManager({
  drivers,
  driverForm,
  savingDriver,
  updateDriverForm,
  saveDeliveryDriver,
  editDriver,
  linkDriverToUser,
  toggleDriver,
  resetDriverForm,
  startNewDriverForm,
  embedded = false,
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedDriverCode, setSelectedDriverCode] = useState(driverForm.code || '');

  useEffect(() => {
    setSelectedDriverCode(driverForm.code || '');
  }, [driverForm.code]);

  const nextDriverCode = useMemo(() => {
    const nextSuffix = drivers.reduce((max, driver) => {
      const match = String(driver?.code || '').match(/(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

    return `E-${String(nextSuffix).padStart(3, '0')}`;
  }, [drivers]);

  const activeDriversCount = useMemo(
    () => drivers.filter((driver) => driver.active !== false).length,
    [drivers]
  );
  const inactiveDriversCount = Math.max(drivers.length - activeDriversCount, 0);
  const isEditingExistingDriver = useMemo(
    () => drivers.some((driver) => driver.code === driverForm.code),
    [drivers, driverForm.code]
  );
  const previewDriverCredentials = useMemo(
    () =>
      driverForm.code || driverForm.name
        ? {
            username: getDriverLoginUsername(driverForm),
            password: getDriverLoginPassword(driverForm),
          }
        : null,
    [driverForm]
  );

  const chooseDriver = (driver) => {
    setSelectedDriverCode(driver.code);
  };

  const confirmDriverLink = () => {
    const selectedDriver = drivers.find((driver) => driver.code === selectedDriverCode);
    if (!selectedDriver) {
      return;
    }

    linkDriverToUser(selectedDriver);
    setSelectorOpen(false);
  };

  return (
    <div
      className="cfg-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(340px, 0.85fr)',
        gap: 18,
        marginTop: embedded ? 0 : 18,
        alignItems: 'start',
      }}
    >
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Entregadores asignados</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
              Estos codigos se usan para asignar pedidos y entrar al modulo Driver.
            </p>
          </div>
          <strong>{drivers.length} entregadores</strong>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <span className="cfg-badge">{activeDriversCount} activos</span>
          <span className={`cfg-badge ${inactiveDriversCount ? 'off' : ''}`}>
            {inactiveDriversCount} inactivos
          </span>
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {drivers.map((driver) => (
            <div
              key={driver.code}
              style={{
                border: '1px solid #edf2f7',
                borderRadius: 8,
                padding: 12,
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto',
                gap: 12,
                alignItems: 'center',
              }}
            >
              <div>
                <strong style={{ fontSize: 18 }}>{driver.name}</strong>
                <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                  {driver.code} {driver.phone ? `| ${driver.phone}` : ''}
                </div>
                <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                  Publico: {driver.publicName || driver.name}
                </div>
                <div style={{ color: '#1e3a8a', marginTop: 6, fontWeight: 800 }}>
                  Usuario: {getDriverLoginUsername(driver)} | Clave: {getDriverLoginPassword(driver)}
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`cfg-badge ${driver.active === false ? 'off' : ''}`}>
                    {driver.active === false ? 'Inactivo' : 'Activo'}
                  </span>
                  <span className="cfg-badge">Acceso estandar</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="cfg-button secondary" onClick={() => editDriver(driver)}>
                  Editar
                </button>
                <button type="button" className="cfg-button secondary" onClick={() => toggleDriver(driver)}>
                  {driver.active === false ? 'Activar' : 'Desactivar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <form
        onSubmit={saveDeliveryDriver}
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Crear o editar entregador</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>
              Aqui no se crean dos cosas por separado: al guardar este formulario se crea o actualiza el
              entregador y tambien su acceso al modulo Driver.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="cfg-button secondary" onClick={startNewDriverForm}>
              Nuevo entregador
            </button>
            <button type="button" className="cfg-button secondary" onClick={() => setSelectorOpen(true)}>
              Elegir existente
            </button>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 12,
            background: '#f8fafc',
            display: 'grid',
            gap: 6,
            color: '#334155',
            fontWeight: 700,
            lineHeight: 1.45,
          }}
        >
          <div>1. Crea un codigo nuevo para el entregador o carga uno existente.</div>
          <div>2. Define alias interno, nombre publico y telefono. El sistema genera el usuario automaticamente.</div>
          <div>3. Usuario: primer nombre del alias + 3 numeros. Clave: apellido del alias + 3 numeros.</div>
          <div>4. Ese mismo codigo aparecera luego para asignarlo en Lista de Pedidos.</div>
        </div>

        {driverForm.code && (
          <div
            style={{
              border: `1px solid ${isEditingExistingDriver ? '#dbeafe' : '#dcfce7'}`,
              borderRadius: 12,
              padding: 12,
              background: isEditingExistingDriver ? '#eff6ff' : '#f0fdf4',
              color: isEditingExistingDriver ? '#1d4ed8' : '#166534',
              fontWeight: 900,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>
              {isEditingExistingDriver ? 'Editando entregador:' : 'Nuevo entregador:'} {driverForm.name || 'Sin nombre'}
            </span>
            <span>{driverForm.code}</span>
          </div>
        )}

        <input
          className="cfg-input"
          value={driverForm.code}
          onChange={(event) =>
            updateDriverForm('code', event.target.value.toUpperCase().replace(/\s+/g, ''))
          }
          placeholder={`Codigo. Ej: ${nextDriverCode}`}
        />
        <input
          className="cfg-input"
          value={driverForm.name}
          onChange={(event) => updateDriverForm('name', event.target.value.toUpperCase())}
          placeholder="Alias interno. Ej: CHIMI"
        />
        <input
          className="cfg-input"
          value={driverForm.publicName}
          onChange={(event) => updateDriverForm('publicName', event.target.value)}
          placeholder="Nombre publico. Ej: Noel Hernandez"
        />
        <input
          className="cfg-input"
          value={driverForm.phone}
          onChange={(event) => updateDriverForm('phone', event.target.value)}
          placeholder="Telefono"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <input
            className="cfg-input"
            type="number"
            value={driverForm.sortOrder}
            onChange={(event) => updateDriverForm('sortOrder', event.target.value)}
            placeholder="Orden"
          />
          <select
            className="cfg-select"
            value={driverForm.active ? 'activo' : 'inactivo'}
            onChange={(event) => updateDriverForm('active', event.target.value === 'activo')}
          >
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>
        {previewDriverCredentials && (
          <div
            style={{
              border: '1px solid #dbeafe',
              borderRadius: 12,
              padding: 12,
              background: '#eff6ff',
              color: '#1e3a8a',
              display: 'grid',
              gap: 4,
              fontWeight: 800,
            }}
          >
            <div>Usuario Driver: {previewDriverCredentials.username}</div>
            <div>Clave inicial: {previewDriverCredentials.password}</div>
          </div>
        )}
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
          El acceso de Driver queda estandarizado para todos los repartidores con este formato.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="cfg-button" disabled={savingDriver}>
            {savingDriver
              ? 'Guardando...'
              : isEditingExistingDriver
                ? 'Actualizar entregador y acceso'
                : 'Crear entregador y acceso'}
          </button>
          <button type="button" className="cfg-button secondary" onClick={resetDriverForm}>
            Limpiar
          </button>
        </div>
      </form>

      {selectorOpen && (
        <div
          className="cfg-driver-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectorOpen(false);
            }
          }}
        >
          <div className="cfg-driver-modal">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 24 }}>Seleccionar entregador</h2>
                <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
                  Es la misma lista que aparece al asignar un pedido.
                </p>
              </div>
              <button type="button" className="cfg-button secondary" onClick={() => setSelectorOpen(false)}>
                Cerrar
              </button>
            </div>

            <div className="cfg-driver-picker-grid">
              {drivers.map((driver) => (
                <button
                  key={driver.code}
                  type="button"
                  className={`cfg-driver-picker-card ${selectedDriverCode === driver.code ? 'selected' : ''}`}
                  onClick={() => chooseDriver(driver)}
                >
                  <span className="cfg-driver-picker-icon">Moto</span>
                  <strong>{driver.name}</strong>
                  <small>{driver.code}</small>
                  <em>{driver.active === false ? 'Inactivo' : 'Activo'}</em>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button type="button" className="cfg-button secondary" style={{ flex: 1 }} onClick={() => setSelectorOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="cfg-button" style={{ flex: 2 }} onClick={confirmDriverLink} disabled={!selectedDriverCode}>
                Vincular usuario
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeliverySettingsManager({ settings, saving, onSave }) {
  const [draft, setDraft] = useState(() =>
    normalizeStoreDeliverySettings(settings, DEFAULT_STORE_DELIVERY_SETTINGS)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchError, setSearchError] = useState('');
  const [locating, setLocating] = useState(false);
  const storeLocation = normalizeLocation(draft.storeLocation);
  const feeRows = useMemo(() => getStoreDeliveryFeeRows(draft), [draft]);
  const operationStatus = useMemo(() => getStoreOperationStatus(draft), [draft]);
  const scheduleSummary = useMemo(() => buildStoreOperationScheduleSummary(draft), [draft]);
  const mapUrl = buildGoogleMapsPlaceUrl(storeLocation);
  const embedUrl = buildGoogleMapsEmbedUrl(storeLocation);

  useEffect(() => {
    setDraft(normalizeStoreDeliverySettings(settings, DEFAULT_STORE_DELIVERY_SETTINGS));
  }, [settings]);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length < 3) {
      setSearchResults([]);
      setSearchError('');
      setSearching(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      setSearching(true);
      setSearchError('');

      try {
        const results = await searchLocationCandidates(trimmedQuery, {
          countryCode: 'ni',
          limit: 10,
          broad: true,
        });
        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('No encontramos coincidencias. Prueba con barrio, calle, negocio o referencia.');
        }
      } catch (error) {
        console.error('No se pudieron buscar ubicaciones para la tienda:', error);
        setSearchResults([]);
        setSearchError('No pudimos buscar ubicaciones en este momento.');
      } finally {
        setSearching(false);
      }
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  const updateDraft = (field, value) => {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateStoreLocation = (updates) => {
    setDraft((current) => ({
      ...current,
      storeLocation: {
        ...(current.storeLocation || {}),
        ...updates,
      },
    }));
  };

  const updateFee = (key, value) => {
    setDraft((current) => ({
      ...current,
      fees: {
        ...(current.fees || {}),
        [key]: value,
      },
    }));
  };

  const updateOperationDay = (dayKey, field, value) => {
    setDraft((current) => ({
      ...current,
      operationHours: {
        ...(current.operationHours || {}),
        [dayKey]: {
          ...(current.operationHours?.[dayKey] || {}),
          [field]: field === 'enabled' ? value === true : value,
        },
      },
    }));
  };

  const useCurrentLocation = async () => {
    setLocating(true);

    try {
      const currentLocation = await getBrowserLocation();
      const resolvedLocation = (await reverseGeocodeLocation(currentLocation)) || currentLocation;
      updateStoreLocation({
        ...(resolvedLocation || currentLocation),
        label:
          String(resolvedLocation?.label || '').trim() ||
          String(draft.storeLocation?.label || '').trim() ||
          'Carnes San Martin Granada',
      });
    } catch (error) {
      console.error('No se pudo obtener la ubicacion actual de la tienda:', error);
      alert('No pudimos tomar la ubicacion actual. Activa permisos o ingresa el punto manualmente.');
    } finally {
      setLocating(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const normalized = normalizeStoreDeliverySettings(draft, DEFAULT_STORE_DELIVERY_SETTINGS);
    const scheduleError = validateStoreOperationHours(normalized);

    if (!normalizeLocation(normalized.storeLocation)) {
      alert('Debes guardar una ubicacion valida para la tienda.');
      return;
    }

    if (scheduleError) {
      alert(scheduleError);
      return;
    }

    onSave(normalized);
  };

  return (
    <form className="cfg-section-card" onSubmit={handleSubmit} style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Entrega y cobertura</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
            Aqui defines el punto base de la tienda, el radio maximo de cobertura y el costo de envio por distancia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="cfg-badge">Radio actual: {Number(draft.coverageRadiusKm || 0).toFixed(1)} km</span>
          <span className="cfg-badge">IVA envio: {Number(draft.taxRate || 0).toFixed(0)}%</span>
          <span className={`cfg-badge ${operationStatus.open ? '' : 'off'}`}>
            Horario: {operationStatus.statusLabel}
          </span>
        </div>
      </div>

      <div
        className="cfg-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.15fr) minmax(320px, 0.85fr)',
          gap: 16,
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 14,
              background: '#ffffff',
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <strong style={{ fontSize: 18 }}>Punto base de la tienda</strong>
              <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                Este punto se usa para medir la distancia al cliente y bloquear pedidos fuera de cobertura.
              </div>
            </div>

            <input
              className="cfg-input"
              value={draft.storeLocation?.label || ''}
              onChange={(event) => updateStoreLocation({ label: event.target.value })}
              placeholder="Nombre o referencia del punto base"
            />

            <input
              className="cfg-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Buscar ubicacion de la tienda"
            />

            {searching && <div style={{ color: '#475569', fontWeight: 700 }}>Buscando ubicaciones...</div>}
            {searchError && <div style={{ color: '#b91c1c', fontWeight: 700 }}>{searchError}</div>}

            {searchResults.length > 0 && (
              <div style={{ display: 'grid', gap: 8 }}>
                {searchResults.map((result) => (
                  <button
                    key={`${result.placeId || result.label}-${result.lat}-${result.lng}`}
                    type="button"
                    className="cfg-button secondary"
                    style={{ textAlign: 'left', justifyContent: 'flex-start' }}
                    onClick={() => {
                      updateStoreLocation({
                        ...result,
                        label: result.label || result.shortLabel || draft.storeLocation?.label || 'Carnes San Martin Granada',
                      });
                      setSearchQuery('');
                      setSearchResults([]);
                      setSearchError('');
                    }}
                  >
                    {result.shortLabel || result.label}
                  </button>
                ))}
              </div>
            )}

            {searchQuery.trim().length >= 3 && (
              <a
                href={buildGoogleMapsAddressUrl(searchQuery)}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}
              >
                Buscar esta direccion en Google Maps
              </a>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input
                className="cfg-input"
                type="number"
                step="0.000001"
                value={draft.storeLocation?.lat ?? ''}
                onChange={(event) => updateStoreLocation({ lat: event.target.value })}
                placeholder="Latitud"
              />
              <input
                className="cfg-input"
                type="number"
                step="0.000001"
                value={draft.storeLocation?.lng ?? ''}
                onChange={(event) => updateStoreLocation({ lng: event.target.value })}
                placeholder="Longitud"
              />
            </div>

            <button type="button" className="cfg-button secondary" onClick={useCurrentLocation} disabled={locating}>
              {locating ? 'Tomando ubicacion...' : 'Usar mi ubicacion actual'}
            </button>

            {storeLocation && (
              <>
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    background: '#f8fafc',
                    color: '#334155',
                    fontWeight: 700,
                    lineHeight: 1.5,
                  }}
                >
                  {storeLocation.label || 'Punto base guardado'}
                  <br />
                  {Number(storeLocation.lat || 0).toFixed(6)}, {Number(storeLocation.lng || 0).toFixed(6)}
                </div>
                <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #dbe3ef', background: '#e2e8f0' }}>
                  <iframe
                    title="Ubicacion base de la tienda"
                    src={embedUrl}
                    style={{ display: 'block', width: '100%', height: 260, border: 0 }}
                    loading="lazy"
                  />
                </div>
                <a href={mapUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 800, textDecoration: 'none' }}>
                  Abrir punto en Google Maps
                </a>
              </>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 14,
              background: '#ffffff',
              display: 'grid',
              gap: 12,
            }}
          >
            <strong style={{ fontSize: 18 }}>Cobertura</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#475569', fontWeight: 800 }}>Radio maximo (km)</span>
                <input
                  className="cfg-input"
                  type="number"
                  min="0.5"
                  step="0.1"
                  value={draft.coverageRadiusKm}
                  onChange={(event) => updateDraft('coverageRadiusKm', event.target.value)}
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#475569', fontWeight: 800 }}>IVA de envio (%)</span>
                <input
                  className="cfg-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.taxRate}
                  onChange={(event) => updateDraft('taxRate', event.target.value)}
                />
              </label>
            </div>
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
              Si el cliente esta mas lejos que este radio, la tienda no le permitira pedir a domicilio.
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 14,
              background: '#ffffff',
              display: 'grid',
              gap: 12,
            }}
          >
            <div>
              <strong style={{ fontSize: 18 }}>Horario de operaciones</strong>
              <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700, lineHeight: 1.5 }}>
                Si la tienda esta cerrada, la tienda virtual no permitira enviar pedidos y mostrara el horario de atencion.
              </div>
            </div>

            <div
              style={{
                border: '1px solid #dbe3ef',
                borderRadius: 12,
                padding: 12,
                background: operationStatus.open ? '#ecfdf5' : '#fff7ed',
                color: operationStatus.open ? '#047857' : '#9a3412',
                fontWeight: 800,
                lineHeight: 1.5,
              }}
            >
              {operationStatus.message}
              <br />
              <span style={{ fontWeight: 700, color: '#475569' }}>{scheduleSummary}</span>
            </div>

            <div style={{ display: 'grid', gap: 10 }}>
              {STORE_OPERATION_DAY_ORDER.map((dayKey) => {
                const dayConfig = draft.operationHours?.[dayKey] || {};
                return (
                  <div
                    key={dayKey}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 12,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: 'minmax(0, 1fr) repeat(2, minmax(110px, 140px))',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        fontWeight: 900,
                        color: '#0f172a',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={dayConfig.enabled !== false}
                        onChange={(event) => updateOperationDay(dayKey, 'enabled', event.target.checked)}
                      />
                      {STORE_OPERATION_DAY_LABELS[dayKey] || dayKey}
                    </label>
                    <input
                      className="cfg-input"
                      type="time"
                      value={dayConfig.open || '06:45'}
                      onChange={(event) => updateOperationDay(dayKey, 'open', event.target.value)}
                      disabled={dayConfig.enabled === false}
                    />
                    <input
                      className="cfg-input"
                      type="time"
                      value={dayConfig.close || '17:15'}
                      onChange={(event) => updateOperationDay(dayKey, 'close', event.target.value)}
                      disabled={dayConfig.enabled === false}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
              Resumen publico: {scheduleSummary}
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 14,
              background: '#ffffff',
              display: 'grid',
              gap: 12,
            }}
          >
            <strong style={{ fontSize: 18 }}>Tarifas por distancia</strong>
            <div style={{ display: 'grid', gap: 10 }}>
              {STORE_DELIVERY_FEE_BRACKETS.map((bracket, index) => {
                const row = feeRows[index];
                return (
                  <div
                    key={bracket.key}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 12,
                      padding: 12,
                      display: 'grid',
                      gap: 8,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <strong>{bracket.label}</strong>
                      <span className="cfg-badge">Total cliente: C$ {Number(row?.totalFee || 0).toFixed(2)}</span>
                    </div>
                    <input
                      className="cfg-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.fees?.[bracket.key] ?? ''}
                      onChange={(event) => updateFee(bracket.key, event.target.value)}
                      placeholder={`Costo base ${bracket.label}`}
                    />
                    <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>
                      Base: C$ {Number(row?.baseFee || 0).toFixed(2)} | IVA: C$ {Number(row?.taxAmount || 0).toFixed(2)} | Total: C$ {Number(row?.totalFee || 0).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="cfg-button secondary"
          onClick={() => setDraft(normalizeStoreDeliverySettings(settings, DEFAULT_STORE_DELIVERY_SETTINGS))}
          disabled={saving}
        >
          Restaurar desde actual
        </button>
        <button type="submit" className="cfg-button" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar cobertura y tarifas'}
        </button>
      </div>
    </form>
  );
}

function StoreOrdersAdminSection({ orders, loading }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedOrderKey, setSelectedOrderKey] = useState('');

  const summary = useMemo(() => {
    const allOrders = Array.isArray(orders) ? orders : [];
    return {
      total: allOrders.length,
      abiertos: allOrders.filter((order) => !isDeliveredAdminOrder(order.estado) && !isCanceledAdminOrder(order.estado)).length,
      entregados: allOrders.filter((order) => isDeliveredAdminOrder(order.estado)).length,
      pickup: allOrders.filter((order) => String(order.fulfillmentType || '').trim().toLowerCase() === 'pickup').length,
      conCupon: allOrders.filter((order) => String(order?.cupon?.code || '').trim()).length,
    };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const queryText = search.trim().toLowerCase();

    return (Array.isArray(orders) ? orders : []).filter((order) => {
      if (filter === 'abiertos' && (isDeliveredAdminOrder(order.estado) || isCanceledAdminOrder(order.estado))) {
        return false;
      }

      if (filter === 'entregados' && !isDeliveredAdminOrder(order.estado)) {
        return false;
      }

      if (filter === 'pickup' && String(order.fulfillmentType || '').trim().toLowerCase() !== 'pickup') {
        return false;
      }

      if (filter === 'cupon' && !String(order?.cupon?.code || '').trim()) {
        return false;
      }

      if (!queryText) {
        return true;
      }

      return [
        order.id,
        order.cliente,
        order.telefono,
        order.direccion,
        order.estado,
        order.cupon?.code,
        order.rewardRedemption?.rewardName,
      ]
        .join(' ')
        .toLowerCase()
        .includes(queryText);
    });
  }, [filter, orders, search]);

  useEffect(() => {
    if (!selectedOrderKey) {
      return;
    }

    const exists = (Array.isArray(orders) ? orders : []).some((order) => order.firebaseKey === selectedOrderKey);
    if (!exists) {
      setSelectedOrderKey('');
    }
  }, [orders, selectedOrderKey]);

  const selectedOrder = useMemo(
    () => (Array.isArray(orders) ? orders : []).find((order) => order.firebaseKey === selectedOrderKey) || null,
    [orders, selectedOrderKey]
  );

  const buildStatusBadgeStyle = (status) => {
    if (isCanceledAdminOrder(status)) {
      return { background: '#fee2e2', color: '#b91c1c' };
    }

    if (isDeliveredAdminOrder(status)) {
      return { background: '#dcfce7', color: '#166534' };
    }

    if (normalizeAdminStatusText(status).includes('camino') || normalizeAdminStatusText(status).includes('ruta')) {
      return { background: '#dbeafe', color: '#1d4ed8' };
    }

    return { background: '#fef3c7', color: '#92400e' };
  };

  const getQuoteLabel = (order) => {
    if (order?.sicarQuote?.cotId) {
      return `Cotizacion SICAR #${order.sicarQuote.cotId}`;
    }

    if (order?.sicarQuote?.status === 'error') {
      return 'Cotizacion con error';
    }

    if (order?.sicarQuote?.status === 'done') {
      return 'Cotizacion sincronizada';
    }

    return 'Cotizacion en cola';
  };

  return (
    <section className="cfg-section-card" style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Pedidos de tienda virtual</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
            Monitorea pedidos en linea, cupones aplicados, recompensas canjeadas y el avance hacia SICAR.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="cfg-badge">Total: {summary.total}</span>
          <span className="cfg-badge">Abiertos: {summary.abiertos}</span>
          <span className="cfg-badge">Entregados: {summary.entregados}</span>
          <span className="cfg-badge">Pickup: {summary.pickup}</span>
          <span className="cfg-badge">Cupon: {summary.conCupon}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="cfg-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por numero, cliente, telefono, cupon o premio"
          style={{ maxWidth: 420 }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Todos' },
            { key: 'abiertos', label: 'Abiertos' },
            { key: 'entregados', label: 'Entregados' },
            { key: 'pickup', label: 'Pickup' },
            { key: 'cupon', label: 'Con cupon' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              className={`cfg-tab ${filter === option.key ? 'active' : ''}`}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div
          style={{
            padding: 26,
            borderRadius: 14,
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          Cargando pedidos de tienda virtual...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div
          style={{
            padding: 26,
            borderRadius: 14,
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          No encontramos pedidos de tienda virtual con esos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredOrders.map((order) => {
            const statusStyle = buildStatusBadgeStyle(order.estado);
            const hasCoupon = Boolean(String(order?.cupon?.code || '').trim());
            const hasReward = Boolean(String(order?.rewardRedemption?.rewardName || '').trim());

            return (
              <article
                key={order.firebaseKey}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 18,
                  padding: 16,
                  background: '#fff',
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>Pedido #{formatOrderNumber(order.id)}</strong>
                    <div style={{ color: '#64748b', fontWeight: 700, marginTop: 4 }}>
                      {order.cliente || 'Cliente sin nombre'} | {order.telefono || 'Sin telefono'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 900,
                        ...statusStyle,
                      }}
                    >
                      {order.estado || 'Pendiente'}
                    </span>
                    <span className="cfg-badge">{order.fulfillmentLabel || 'Delivery'}</span>
                    <span className={`cfg-badge ${order?.sicarQuote?.status === 'error' ? 'off' : ''}`}>
                      {getQuoteLabel(order)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      Fecha
                    </div>
                    <div style={{ fontWeight: 800 }}>{formatAdminDateTime(order.timestampIngresoMs || order.timestamp)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      Total
                    </div>
                    <div style={{ fontWeight: 800 }}>{formatCurrencyAmount(order.total)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      Pago
                    </div>
                    <div style={{ fontWeight: 800 }}>{order.metodoPago || 'Sin definir'}</div>
                  </div>
                  <div>
                    <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                      Envio
                    </div>
                    <div style={{ fontWeight: 800 }}>{formatCurrencyAmount(order.deliveryFee)}</div>
                  </div>
                </div>

                <div style={{ color: '#475569', fontWeight: 700, lineHeight: 1.5 }}>
                  {order.direccion || 'Sin direccion'}
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {hasCoupon && <span className="cfg-badge">Cupon {order.cupon.code}</span>}
                  {hasReward && <span className="cfg-badge">Premio {order.rewardRedemption.rewardName}</span>}
                  {Number(order.descuentoCupon || 0) > 0 && (
                    <span className="cfg-badge">Descuento {formatCurrencyAmount(order.descuentoCupon)}</span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="cfg-button secondary" onClick={() => setSelectedOrderKey(order.firebaseKey)}>
                    Ver detalle
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedOrder && (
        <div
          className="cfg-driver-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedOrderKey('');
            }
          }}
        >
          <div
            className="cfg-driver-modal"
            style={{ width: 'min(920px, 100%)', display: 'grid', gap: 18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                  Pedido tienda virtual
                </div>
                <h2 style={{ margin: '6px 0 0', fontSize: 30 }}>
                  #{formatOrderNumber(selectedOrder.id)} | {selectedOrder.cliente}
                </h2>
              </div>
              <button type="button" className="cfg-button secondary" onClick={() => setSelectedOrderKey('')}>
                Cerrar
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: 12,
              }}
            >
              {[
                ['Estado', selectedOrder.estado || 'Pendiente'],
                ['Tipo entrega', selectedOrder.fulfillmentLabel || 'Delivery'],
                ['Metodo pago', selectedOrder.metodoPago || 'Sin definir'],
                ['Fecha ingreso', formatAdminDateTime(selectedOrder.timestampIngresoMs || selectedOrder.timestamp)],
                ['Subtotal', formatCurrencyAmount(selectedOrder.subtotalEstimado)],
                ['Descuento cupon', formatCurrencyAmount(selectedOrder.descuentoCupon)],
                ['Envio', formatCurrencyAmount(selectedOrder.deliveryFee)],
                ['Total', formatCurrencyAmount(selectedOrder.total)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: 12,
                    background: '#f8fafc',
                  }}
                >
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
                    {label}
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 900 }}>{value}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 14,
                  background: '#ffffff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 18 }}>Cliente y entrega</strong>
                <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.55 }}>
                  <strong>{selectedOrder.cliente}</strong>
                  <br />
                  Codigo cliente: {selectedOrder.clienteCodigo || '-'}
                  <br />
                  Telefono: {selectedOrder.telefono || '-'}
                  <br />
                  Direccion: {selectedOrder.direccion || '-'}
                  <br />
                  Referencia: {selectedOrder.referencia || '-'}
                </div>
              </div>

              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 14,
                  background: '#ffffff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 18 }}>Promociones y SICAR</strong>
                <div style={{ color: '#334155', fontWeight: 700, lineHeight: 1.55 }}>
                  Cupon: {selectedOrder?.cupon?.code || 'Sin cupon'}
                  <br />
                  Premio: {selectedOrder?.rewardRedemption?.rewardName || 'Sin premio'}
                  <br />
                  Cotizacion: {getQuoteLabel(selectedOrder)}
                  <br />
                  Estado puntos: {selectedOrder?.rewardPoints?.status || 'Sin movimiento'}
                </div>
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 14,
                background: '#ffffff',
                display: 'grid',
                gap: 12,
              }}
            >
              <strong style={{ fontSize: 18 }}>Detalle del pedido</strong>
              {Array.isArray(selectedOrder.items) && selectedOrder.items.length > 0 ? (
                <div style={{ display: 'grid', gap: 10 }}>
                  {selectedOrder.items.map((item, index) => (
                    <div
                      key={`${selectedOrder.firebaseKey}-item-${item.codigo || item.nombre}-${index}`}
                      style={{
                        border: '1px solid #edf2f7',
                        borderRadius: 12,
                        padding: 12,
                        display: 'grid',
                        gridTemplateColumns: 'minmax(0, 1fr) auto',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <strong>{item.nombre}</strong>
                        <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                          {item.codigo || '-'} | {Number(item.cantidad || 0)} {item.unidad || 'lb'}
                        </div>
                        {item.descripcion && (
                          <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>{item.descripcion}</div>
                        )}
                      </div>
                      <strong>{formatCurrencyAmount(item.subtotal)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#64748b', fontWeight: 800 }}>Este pedido no trae items estructurados.</div>
              )}
            </div>

            {selectedOrder.observaciones && (
              <div
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 14,
                  background: '#ffffff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 18 }}>Notas del cliente</strong>
                <div style={{ color: '#334155', fontWeight: 700, whiteSpace: 'pre-wrap' }}>
                  {selectedOrder.observaciones}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function PromotionsManager({
  promotions,
  promotionForm,
  savingPromotion,
  cleaningPromotions,
  updatePromotionForm,
  savePromotion,
  editPromotion,
  togglePromotion,
  removePromotion,
  handlePromotionImageFile,
  clearExpiredPromotions,
  resetPromotionForm,
}) {
  const activeCount = promotions.filter((promotion) => getStorePromotionStatus(promotion) === 'active').length;
  const expiredCount = promotions.filter((promotion) => getStorePromotionStatus(promotion) === 'expired').length;

  return (
    <div
      className="cfg-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.2fr) minmax(360px, 0.8fr)',
        gap: 18,
        marginTop: 18,
        alignItems: 'start',
      }}
    >
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Historias de promociones</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
              Cambia las historias que salen en la tienda y define desde cuando se publican y cuando vencen.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
            <span className="cfg-badge">{activeCount} activas</span>
            <span className={`cfg-badge ${expiredCount > 0 ? 'off' : ''}`}>{expiredCount} vencidas</span>
            <button
              type="button"
              className="cfg-button secondary"
              onClick={clearExpiredPromotions}
              disabled={cleaningPromotions}
            >
              {cleaningPromotions ? 'Limpiando...' : 'Borrar vencidas'}
            </button>
          </div>
        </div>

        {promotions.length === 0 ? (
          <div
            style={{
              padding: 28,
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              color: '#64748b',
              textAlign: 'center',
              fontWeight: 800,
            }}
          >
            No hay historias cargadas todavia.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {promotions.map((promotion) => {
              const status = getStorePromotionStatus(promotion);
              const statusClass = status === 'active' ? '' : 'off';

              return (
                <div
                  key={promotion.id}
                  style={{
                    border: '1px solid #edf2f7',
                    borderRadius: 12,
                    padding: 12,
                    display: 'grid',
                    gridTemplateColumns: '120px minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'center',
                  }}
                >
                  <img
                    src={promotion.image || '/tienda/branding/logo.png'}
                    alt={promotion.title}
                    style={{
                      width: '120px',
                      height: '120px',
                      objectFit: 'cover',
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      background: '#f8fafc',
                    }}
                  />
                  <div>
                    <strong style={{ fontSize: 18 }}>{promotion.title}</strong>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <span className={`cfg-badge ${statusClass}`}>{getPromotionStatusLabel(promotion)}</span>
                      <span className={`cfg-badge ${promotion.active === false ? 'off' : ''}`}>
                        {promotion.active === false ? 'Oculta' : 'Visible'}
                      </span>
                    </div>
                    <div style={{ color: '#64748b', marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
                      <div>Inicio: {promotion.startsAt ? formatAdminDateTime(promotion.startsAt) : 'Inmediato'}</div>
                      <div>Finaliza: {promotion.endsAt ? formatAdminDateTime(promotion.endsAt) : 'Sin vencimiento'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button type="button" className="cfg-button secondary" onClick={() => editPromotion(promotion)}>
                      Editar
                    </button>
                    <button type="button" className="cfg-button secondary" onClick={() => togglePromotion(promotion)}>
                      {promotion.active === false ? 'Activar' : 'Desactivar'}
                    </button>
                    <button type="button" className="cfg-button secondary" onClick={() => removePromotion(promotion)}>
                      Borrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <form
        onSubmit={savePromotion}
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
          display: 'grid',
          gap: 10,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 22 }}>Historia</h2>
        <input
          className="cfg-input"
          value={promotionForm.title}
          onChange={(event) => updatePromotionForm('title', event.target.value)}
          placeholder="Titulo corto de la historia"
        />
        <input
          className="cfg-input"
          value={promotionForm.image}
          onChange={(event) => updatePromotionForm('image', event.target.value)}
          placeholder="URL de la imagen o imagen cargada"
        />
        <input className="cfg-input" type="file" accept="image/*" onChange={handlePromotionImageFile} />
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
          La historia se ocultara sola al vencer. Puedes subir una imagen nueva o pegar una URL publica.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <select
            className="cfg-select"
            value={promotionForm.active ? 'activo' : 'inactivo'}
            onChange={(event) => updatePromotionForm('active', event.target.value === 'activo')}
          >
            <option value="activo">Visible</option>
            <option value="inactivo">Oculta</option>
          </select>
          <input
            className="cfg-input"
            type="number"
            min="0"
            step="1"
            value={promotionForm.sortOrder}
            onChange={(event) => updatePromotionForm('sortOrder', event.target.value)}
            placeholder="Orden"
          />
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>Inicio de vigencia</span>
            <input
              className="cfg-input"
              type="datetime-local"
              value={promotionForm.startsAt}
              onChange={(event) => updatePromotionForm('startsAt', event.target.value)}
            />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 800, color: '#0f172a' }}>Final de vigencia</span>
            <input
              className="cfg-input"
              type="datetime-local"
              value={promotionForm.endsAt}
              onChange={(event) => updatePromotionForm('endsAt', event.target.value)}
            />
          </label>
        </div>
        {promotionForm.image && (
          <img
            src={promotionForm.image}
            alt="Vista previa de historia"
            style={{
              width: '100%',
              maxHeight: 320,
              objectFit: 'cover',
              background: '#f1f5f9',
              borderRadius: 14,
              border: '1px solid #e2e8f0',
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="cfg-button" disabled={savingPromotion}>
            {savingPromotion ? 'Guardando...' : 'Guardar historia'}
          </button>
          <button type="button" className="cfg-button secondary" onClick={resetPromotionForm}>
            Nueva
          </button>
        </div>
      </form>
    </div>
  );
}

function CouponsManager({
  coupons,
  couponsUnlocked,
  couponPin,
  couponForm,
  savingCoupon,
  welcomeCouponCampaign,
  savingWelcomeCouponCampaign,
  setCouponPin,
  unlockCoupons,
  updateCouponForm,
  saveCoupon,
  saveWelcomeCouponCampaignConfig,
  editCoupon,
  toggleCoupon,
  resetCouponForm,
}) {
  const [campaignDraft, setCampaignDraft] = useState(() => ({
    limit: String(welcomeCouponCampaign?.limit || ''),
    amount: String(welcomeCouponCampaign?.amount || ''),
    minimumPurchase: String(welcomeCouponCampaign?.minimumPurchase || ''),
    active: welcomeCouponCampaign?.active !== false,
  }));

  useEffect(() => {
    setCampaignDraft({
      limit: String(welcomeCouponCampaign?.limit || ''),
      amount: String(welcomeCouponCampaign?.amount || ''),
      minimumPurchase: String(welcomeCouponCampaign?.minimumPurchase || ''),
      active: welcomeCouponCampaign?.active !== false,
    });
  }, [
    welcomeCouponCampaign?.active,
    welcomeCouponCampaign?.amount,
    welcomeCouponCampaign?.limit,
    welcomeCouponCampaign?.minimumPurchase,
  ]);

  const formatCouponValue = (coupon) =>
    coupon.type === 'amount' ? `C$ ${Number(coupon.value || 0).toFixed(2)}` : `${Number(coupon.value || 0)}%`;
  const formatCouponUsageLimit = (coupon) => {
    const limit = Math.max(0, Math.trunc(Number(coupon.maxUsesPerUser || 0)));
    if (limit <= 0) {
      return 'Sin limite por usuario';
    }

    return limit === 1 ? '1 uso por usuario' : `${limit} usos por usuario`;
  };
  const campaignAssignments = useMemo(
    () =>
      Object.entries(welcomeCouponCampaign?.assignments || {})
        .map(([userKey, assignment]) => ({
          userKey,
          ...assignment,
        }))
        .sort((left, right) => Number(right.assignedAt || 0) - Number(left.assignedAt || 0)),
    [welcomeCouponCampaign?.assignments]
  );
  const assignedCount = Math.max(0, Number(welcomeCouponCampaign?.assignedCount || 0));
  const campaignLimit = Math.max(0, Number(welcomeCouponCampaign?.limit || 0));
  const remainingCount = Math.max(0, campaignLimit - assignedCount);
  const handleSaveCampaign = async (event) => {
    event.preventDefault();
    const nextLimit = Math.max(assignedCount, 1, Math.trunc(Number(campaignDraft.limit || 0)));
    await saveWelcomeCouponCampaignConfig({
      limit: nextLimit,
      amount: Math.max(0, Number(campaignDraft.amount || 0)),
      minimumPurchase: Math.max(0, Number(campaignDraft.minimumPurchase || 0)),
      active: campaignDraft.active !== false,
    });
  };

  if (!couponsUnlocked) {
    return (
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 18,
          marginTop: 18,
          maxWidth: 520,
        }}
      >
        <div className="cfg-badge off">Acceso protegido</div>
        <h2 style={{ margin: '12px 0 6px', fontSize: 22 }}>Entrar a cupones</h2>
        <p style={{ margin: '0 0 14px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
          Ingresa el PIN administrativo para crear o editar cupones de la tienda virtual.
        </p>
        <form onSubmit={unlockCoupons} style={{ display: 'grid', gap: 10 }}>
          <input
            className="cfg-input"
            type="password"
            inputMode="numeric"
            value={couponPin}
            onChange={(event) => setCouponPin(event.target.value)}
            placeholder="PIN"
          />
          <button type="submit" className="cfg-button">
            Entrar
          </button>
        </form>
      </section>
    );
  }

  return (
    <div
      className="cfg-grid"
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(340px, 0.85fr)',
        gap: 18,
        marginTop: 18,
        alignItems: 'start',
      }}
    >
      <section
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 8,
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22 }}>Cupones activos</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
              El cliente escribe el codigo en el checkout de la tienda.
            </p>
          </div>
          <strong>{coupons.length} cupones</strong>
        </div>

        {coupons.length === 0 ? (
          <div
            style={{
              padding: 28,
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              color: '#64748b',
              textAlign: 'center',
              fontWeight: 800,
            }}
          >
            No hay cupones creados todavia.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {coupons.map((coupon) => (
              <div
                key={coupon.code}
                style={{
                  border: '1px solid #edf2f7',
                  borderRadius: 8,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  alignItems: 'center',
                }}
              >
                <div>
                  <strong style={{ fontSize: 18 }}>{coupon.code}</strong>
                  <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                    {coupon.title || 'Cupon sin descripcion'} | {formatCouponValue(coupon)}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                    Minimo: C$ {Number(coupon.minimum || 0).toFixed(2)}
                    {` | ${formatCouponUsageLimit(coupon)}`}
                    {coupon.notes ? ` | ${coupon.notes}` : ''}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`cfg-badge ${coupon.active === false ? 'off' : ''}`}>
                      {coupon.active === false ? 'Inactivo' : 'Activo'}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button type="button" className="cfg-button secondary" onClick={() => editCoupon(coupon)}>
                    Editar
                  </button>
                  <button type="button" className="cfg-button secondary" onClick={() => toggleCoupon(coupon)}>
                    {coupon.active === false ? 'Activar' : 'Desactivar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 18,
            borderTop: '1px solid #e2e8f0',
            paddingTop: 18,
            display: 'grid',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22 }}>Campana de bienvenida</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
                Aqui controlas cuantos usuarios nuevos reciben el cupon automatico, cuantos ya se otorgaron y cuantos cupos siguen disponibles.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className={`cfg-badge ${welcomeCouponCampaign?.active === false ? 'off' : ''}`}>
                {welcomeCouponCampaign?.active === false ? 'Inactiva' : 'Activa'}
              </span>
              <span className="cfg-badge">Otorgados: {assignedCount}</span>
              <span className={`cfg-badge ${remainingCount <= 0 ? 'off' : ''}`}>Faltan: {remainingCount}</span>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 10,
            }}
          >
            <div style={{ border: '1px solid #edf2f7', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Limite actual</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 22 }}>{campaignLimit}</div>
            </div>
            <div style={{ border: '1px solid #edf2f7', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Monto</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 22 }}>C$ {Number(welcomeCouponCampaign?.amount || 0).toFixed(2)}</div>
            </div>
            <div style={{ border: '1px solid #edf2f7', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Compra minima</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 22 }}>C$ {Number(welcomeCouponCampaign?.minimumPurchase || 0).toFixed(2)}</div>
            </div>
            <div style={{ border: '1px solid #edf2f7', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>Restantes</div>
              <div style={{ marginTop: 6, fontWeight: 900, fontSize: 22 }}>{remainingCount}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <strong style={{ fontSize: 18 }}>Detalle de cupones otorgados</strong>
            {campaignAssignments.length === 0 ? (
              <div
                style={{
                  padding: 18,
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                  color: '#64748b',
                  fontWeight: 800,
                  textAlign: 'center',
                }}
              >
                Aun no se ha otorgado ningun cupon de bienvenida.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {campaignAssignments.map((assignment) => (
                  <div
                    key={`${assignment.userKey}-${assignment.slotNumber}`}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 12,
                      padding: 12,
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 999,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                      }}
                    >
                      {String(assignment.slotNumber || '').padStart(2, '0')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, color: '#0f172a' }}>
                        {assignment.customerName || 'Cliente sin nombre'} {assignment.phoneSuffix ? `| Tel. ${assignment.phoneSuffix}` : ''}
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                        {assignment.userKey}
                        {assignment.assignedAt ? ` | ${formatAdminDateTime(assignment.assignedAt)}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div style={{ display: 'grid', gap: 18 }}>
        <form
          onSubmit={handleSaveCampaign}
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            display: 'grid',
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22 }}>Editar campana de bienvenida</h2>
          <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.5 }}>
            Si quieres agregar mas cupos, aumenta el limite total. El sistema nunca dejara el limite por debajo de los cupones ya otorgados.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              className="cfg-input"
              type="number"
              min="1"
              step="1"
              value={campaignDraft.limit}
              onChange={(event) => setCampaignDraft((current) => ({ ...current, limit: event.target.value }))}
              placeholder="Limite total de cupones"
            />
            <select
              className="cfg-select"
              value={campaignDraft.active ? 'activo' : 'inactivo'}
              onChange={(event) =>
                setCampaignDraft((current) => ({ ...current, active: event.target.value === 'activo' }))
              }
            >
              <option value="activo">Activa</option>
              <option value="inactivo">Inactiva</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={campaignDraft.amount}
              onChange={(event) => setCampaignDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="Monto del cupon"
            />
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={campaignDraft.minimumPurchase}
              onChange={(event) =>
                setCampaignDraft((current) => ({ ...current, minimumPurchase: event.target.value }))
              }
              placeholder="Compra minima"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="cfg-button" disabled={savingWelcomeCouponCampaign}>
              {savingWelcomeCouponCampaign ? 'Guardando...' : 'Guardar campana'}
            </button>
            <button
              type="button"
              className="cfg-button secondary"
              onClick={() =>
                setCampaignDraft({
                  limit: String(welcomeCouponCampaign?.limit || ''),
                  amount: String(welcomeCouponCampaign?.amount || ''),
                  minimumPurchase: String(welcomeCouponCampaign?.minimumPurchase || ''),
                  active: welcomeCouponCampaign?.active !== false,
                })
              }
            >
              Restaurar valores
            </button>
          </div>
        </form>

        <form
          onSubmit={saveCoupon}
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            padding: 16,
            display: 'grid',
            gap: 10,
          }}
        >
          <h2 style={{ margin: 0, fontSize: 22 }}>Cupon</h2>
          <input
            className="cfg-input"
            value={couponForm.code}
            onChange={(event) => updateCouponForm('code', event.target.value.toUpperCase())}
            placeholder="Codigo. Ej: GRANADA10"
          />
          <input
            className="cfg-input"
            value={couponForm.title}
            onChange={(event) => updateCouponForm('title', event.target.value)}
            placeholder="Descripcion corta"
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <select
              className="cfg-select"
              value={couponForm.type}
              onChange={(event) => updateCouponForm('type', event.target.value)}
            >
              <option value="percent">Porcentaje</option>
              <option value="amount">Monto fijo</option>
            </select>
            <select
              className="cfg-select"
              value={couponForm.active ? 'activo' : 'inactivo'}
              onChange={(event) => updateCouponForm('active', event.target.value === 'activo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={couponForm.value}
              onChange={(event) => updateCouponForm('value', event.target.value)}
              placeholder={couponForm.type === 'amount' ? 'Monto C$' : 'Porcentaje'}
            />
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={couponForm.minimum}
              onChange={(event) => updateCouponForm('minimum', event.target.value)}
              placeholder="Minimo de compra"
            />
          </div>
          <input
            className="cfg-input"
            type="number"
            min="0"
            step="1"
            value={couponForm.maxUsesPerUser}
            onChange={(event) => updateCouponForm('maxUsesPerUser', event.target.value)}
            placeholder="Usos maximos por usuario (0 = sin limite)"
          />
          <textarea
            className="cfg-textarea"
            value={couponForm.notes}
            onChange={(event) => updateCouponForm('notes', event.target.value)}
            placeholder="Notas internas"
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="submit" className="cfg-button" disabled={savingCoupon}>
              {savingCoupon ? 'Guardando...' : 'Guardar cupon'}
            </button>
            <button type="button" className="cfg-button secondary" onClick={resetCouponForm}>
              Nuevo
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UsersManager({
  usersTab,
  setUsersTab,
  kitchenUser,
  kitchenForm,
  updateKitchenForm,
  saveKitchenAccess,
  savingKitchen,
  storeUsers,
  filteredStoreUsers,
  userSearch,
  setUserSearch,
  passwordForms,
  updatePasswordForm,
  saveClientPassword,
  savingPasswordKey,
  drivers,
  driverForm,
  savingDriver,
  updateDriverForm,
  saveDeliveryDriver,
  editDriver,
  linkDriverToUser,
  toggleDriver,
  resetDriverForm,
  startNewDriverForm,
}) {
  return (
    <section
      style={{
        background: '#fff',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 16,
        marginTop: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Gestion de usuarios</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
            Separa usuarios internos administrativos de usuarios clientes de la tienda virtual.
          </p>
        </div>
        <div className="cfg-tabs" style={{ marginTop: 0 }}>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'administrativo' ? 'active' : ''}`}
            onClick={() => setUsersTab('administrativo')}
          >
            Administrativo
          </button>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'cocina' ? 'active' : ''}`}
            onClick={() => setUsersTab('cocina')}
          >
            Cocina
          </button>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'clientes' ? 'active' : ''}`}
            onClick={() => setUsersTab('clientes')}
          >
            Clientes
          </button>
          <button
            type="button"
            className={`cfg-tab ${usersTab === 'entregadores' ? 'active' : ''}`}
            onClick={() => setUsersTab('entregadores')}
          >
            Entregadores
          </button>
        </div>
      </div>

      {usersTab === 'administrativo' ? (
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          <div
            style={{
              border: '1px solid #edf2f7',
              borderRadius: 8,
              padding: 16,
              background: '#f8fafc',
            }}
          >
            <div className="cfg-badge">Administrativo</div>
            <h3 style={{ margin: '12px 0 4px', fontSize: 20 }}>Panel interno</h3>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5, fontWeight: 700 }}>
              Este espacio queda separado para los usuarios del sistema administrativo.
            </p>
            <div style={{ marginTop: 14, color: '#0f172a', fontWeight: 900 }}>
              Usuario actual: delivery
            </div>
          </div>
          <div
            style={{
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              padding: 16,
              background: '#fff',
              color: '#64748b',
              lineHeight: 1.5,
              fontWeight: 700,
            }}
          >
            En esta etapa dejamos listo el modulo administrativo separado. El cambio de contrasena solicitado
            esta disponible en la pestana Clientes.
          </div>
        </div>
      ) : usersTab === 'cocina' ? (
        <div
          style={{
            marginTop: 18,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 0.8fr)',
            gap: 14,
            alignItems: 'start',
          }}
        >
          <div
            style={{
              border: '1px solid #edf2f7',
              borderRadius: 8,
              padding: 16,
              background: '#f8fafc',
            }}
          >
            <div className={`cfg-badge ${kitchenUser.active === false ? 'off' : ''}`}>
              {kitchenUser.active === false ? 'Inactivo' : 'Activo'}
            </div>
            <h3 style={{ margin: '12px 0 4px', fontSize: 20 }}>Acceso unico para Cocina</h3>
            <p style={{ margin: 0, color: '#64748b', lineHeight: 1.5, fontWeight: 700 }}>
              Este es el unico usuario general para entrar al modulo Cocina. Todos los carniceros
              usan estas credenciales para ver y preparar pedidos.
            </p>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              <div style={{ color: '#0f172a', fontWeight: 900 }}>
                Usuario actual: {kitchenUser.username || 'cocina'}
              </div>
              <div style={{ color: '#64748b', fontWeight: 800 }}>
                Nombre visible: {kitchenUser.displayName || 'Cocina'}
              </div>
              <span className={`cfg-badge ${kitchenUser.hasPassword ? '' : 'off'}`}>
                {kitchenUser.hasPassword ? 'Con contrasena configurada' : 'Clave temporal: cocina2026'}
              </span>
            </div>
          </div>

          <form
            onSubmit={saveKitchenAccess}
            style={{
              border: '1px solid #edf2f7',
              borderRadius: 8,
              padding: 16,
              background: '#fff',
              display: 'grid',
              gap: 10,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 20 }}>Crear / editar usuario Cocina</h3>
            <input
              className="cfg-input"
              value={kitchenForm.username}
              onChange={(event) => updateKitchenForm('username', event.target.value.toLowerCase())}
              placeholder="Usuario. Ej: cocina"
            />
            <input
              className="cfg-input"
              value={kitchenForm.displayName}
              onChange={(event) => updateKitchenForm('displayName', event.target.value)}
              placeholder="Nombre visible"
            />
            <select
              className="cfg-select"
              value={kitchenForm.active ? 'activo' : 'inactivo'}
              onChange={(event) => updateKitchenForm('active', event.target.value === 'activo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
            <input
              className="cfg-input"
              type="password"
              value={kitchenForm.password}
              onChange={(event) => updateKitchenForm('password', event.target.value)}
              placeholder={kitchenUser.hasPassword ? 'Nueva contrasena opcional' : 'Contrasena inicial'}
            />
            <input
              className="cfg-input"
              type="password"
              value={kitchenForm.confirmPassword}
              onChange={(event) => updateKitchenForm('confirmPassword', event.target.value)}
              placeholder="Confirmar contrasena"
            />
            <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
              Si ya existe una contrasena y dejas estos campos vacios, se mantiene la actual.
            </div>
            <button type="submit" className="cfg-button" disabled={savingKitchen}>
              {savingKitchen ? 'Guardando...' : 'Guardar usuario Cocina'}
            </button>
          </form>
        </div>
      ) : usersTab === 'clientes' ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            <input
              className="cfg-input"
              value={userSearch}
              onChange={(event) => setUserSearch(event.target.value)}
              placeholder="Buscar cliente por nombre, telefono o codigo"
              style={{ maxWidth: 420 }}
            />
            <strong>{filteredStoreUsers.length} de {storeUsers.length} clientes</strong>
          </div>

          {filteredStoreUsers.length === 0 ? (
            <div
              style={{
                padding: 28,
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                color: '#64748b',
                textAlign: 'center',
                fontWeight: 800,
              }}
            >
              No hay clientes de tienda virtual para mostrar.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {filteredStoreUsers.map((user) => {
                const passwordForm = passwordForms[user.key] || {};
                return (
                  <form
                    key={user.key}
                    onSubmit={(event) => saveClientPassword(event, user)}
                    style={{
                      border: '1px solid #edf2f7',
                      borderRadius: 8,
                      padding: 14,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                      gap: 14,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: 17 }}>{user.nombre || 'Cliente sin nombre'}</strong>
                      <div style={{ color: '#64748b', marginTop: 4, fontWeight: 700 }}>
                        {user.telefono || 'Sin telefono'} {user.codigo ? `| ${user.codigo}` : ''}
                      </div>
                      <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                        {user.direccion || 'Sin direccion guardada'}
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <span className={`cfg-badge ${user.hasPassword ? '' : 'off'}`}>
                          {user.hasPassword ? 'Con contrasena' : 'Sin contrasena'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gap: 8 }}>
                      <input
                        className="cfg-input"
                        type="password"
                        value={passwordForm.password || ''}
                        onChange={(event) => updatePasswordForm(user.key, 'password', event.target.value)}
                        placeholder="Nueva contrasena"
                      />
                      <input
                        className="cfg-input"
                        type="password"
                        value={passwordForm.confirmPassword || ''}
                        onChange={(event) => updatePasswordForm(user.key, 'confirmPassword', event.target.value)}
                        placeholder="Confirmar contrasena"
                      />
                      <button type="submit" className="cfg-button" disabled={savingPasswordKey === user.key}>
                        {savingPasswordKey === user.key ? 'Actualizando...' : 'Cambiar contrasena'}
                      </button>
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 18 }}>
          <DriversManager
            drivers={drivers}
            driverForm={driverForm}
            savingDriver={savingDriver}
            updateDriverForm={updateDriverForm}
            saveDeliveryDriver={saveDeliveryDriver}
            editDriver={editDriver}
            linkDriverToUser={linkDriverToUser}
            toggleDriver={toggleDriver}
            resetDriverForm={resetDriverForm}
            startNewDriverForm={startNewDriverForm}
            embedded
          />
        </div>
      )}
    </section>
  );
}
