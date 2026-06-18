import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
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
  STORE_USERS_PATH,
  updateStoreUserPassword,
} from '../services/storeUsers';
import {
  DRIVERS_PATH,
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
import {
  compressImportedCatalogImage,
  fetchSicarCatalogSelection,
  fetchSicarPricesByCodes,
  fetchSicarProductImage,
  getSicarBridgeHealth,
} from '../services/sicarCatalog';

const COUPONS_PIN = '210397';

const buildEmptyProduct = (unit = 'lb') => ({
  code: '',
  name: '',
  price: '',
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
  active: true,
  notes: '',
};

const emptyDriver = {
  code: '',
  name: '',
  phone: '',
  active: true,
  sortOrder: '',
  password: '',
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

export default function ConfiguracionView() {
  const [section, setSection] = useState('catalogo');
  const [usersTab, setUsersTab] = useState('administrativo');
  const [products, setProducts] = useState(() => mergeCatalogProducts());
  const [categories, setCategories] = useState(() => mergeStoreCategories());
  const [coupons, setCoupons] = useState(() => mergeStoreCoupons());
  const [drivers, setDrivers] = useState(() => mergeDrivers());
  const [kitchenUser, setKitchenUser] = useState(() => normalizeKitchenUser());
  const [storeUsers, setStoreUsers] = useState([]);
  const [form, setForm] = useState(emptyProduct);
  const [categoryForm, setCategoryForm] = useState(emptyCategory);
  const [couponForm, setCouponForm] = useState(emptyCoupon);
  const [driverForm, setDriverForm] = useState(emptyDriver);
  const [kitchenForm, setKitchenForm] = useState(emptyKitchenForm);
  const [couponsUnlocked, setCouponsUnlocked] = useState(false);
  const [couponPin, setCouponPin] = useState('');
  const [passwordForms, setPasswordForms] = useState({});
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [savingDriver, setSavingDriver] = useState(false);
  const [savingKitchen, setSavingKitchen] = useState(false);
  const [savingPasswordKey, setSavingPasswordKey] = useState('');
  const [syncingSicar, setSyncingSicar] = useState(false);
  const [syncingSicarPrices, setSyncingSicarPrices] = useState(false);
  const [testingSicar, setTestingSicar] = useState(false);
  const [loadingSicarPreview, setLoadingSicarPreview] = useState(false);
  const [sicarHealth, setSicarHealth] = useState(null);
  const [sicarPreview, setSicarPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    const unsubscribe = onValue(ref(database, STORE_CATALOG_PATH), (snapshot) => {
      setProducts(mergeCatalogProducts(snapshot.val()));
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
    const unsubscribe = onValue(ref(database, STORE_COUPONS_PATH), (snapshot) => {
      setCoupons(mergeStoreCoupons(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, DRIVERS_PATH), (snapshot) => {
      setDrivers(mergeDrivers(snapshot.val()));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, `${SYSTEM_USERS_PATH}/${KITCHEN_USER_KEY}`), (snapshot) => {
      const nextUser = normalizeKitchenUser(snapshot.val());
      setKitchenUser(nextUser);
      setKitchenForm((current) => ({
        ...current,
        username: nextUser.username || 'cocina',
        displayName: nextUser.displayName || 'Cocina',
        active: nextUser.active !== false,
      }));
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
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

      setStoreUsers(users);
    });

    return () => unsubscribe();
  }, []);

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
    setForm({
      code: product.code || '',
      name: product.name || '',
      price: product.price || '',
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
  };

  const editCoupon = (coupon) => {
    setCouponForm({
      code: coupon.code || '',
      title: coupon.title || '',
      type: coupon.type || 'percent',
      value: coupon.value ?? '',
      minimum: coupon.minimum ?? '',
      active: coupon.active !== false,
      notes: coupon.notes || '',
    });
  };

  const editDriver = (driver) => {
    setDriverForm({
      code: driver.code || '',
      name: driver.name || '',
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
      phone: driver.phone || current.phone || '',
      active: driver.active !== false,
      sortOrder: driver.sortOrder ?? current.sortOrder,
      password: current.code === driver.code ? current.password : '',
    }));
    setMessage(`Usuario Driver vinculado a ${driver.name || driver.code}. Define la contrasena y guarda.`);
  };

  const handleImageFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateForm('image', String(reader.result || ''));
    };
    reader.readAsDataURL(file);
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
        minQuantity: Number(form.minQuantity || getDefaultProductMinQuantity(form.unit)),
        quantityStep: Number(form.quantityStep || getDefaultProductQuantityStep(form.unit)),
      }, existingProduct);
      setForm((current) => ({
        ...current,
        minQuantity: String(Number(form.minQuantity || getDefaultProductMinQuantity(form.unit))),
        quantityStep: String(Number(form.quantityStep || getDefaultProductQuantityStep(form.unit))),
      }));
      setMessage('Producto guardado con sus restricciones.');
    } catch (error) {
      console.error('Error guardando producto:', error);
      setMessage('No se pudo guardar el producto.');
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
      setMessage('Entregador guardado.');
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
      setMessage(
        `No se pudo conectar con SICAR. Verifica que el puente local este activo con "npm run sicar:bridge". ${error?.message || ''}`.trim()
      );
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
      setMessage(
        `No se pudo cargar la vista previa SICAR. Verifica que el puente local este activo con "npm run sicar:bridge". ${error?.message || ''}`.trim()
      );
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
      setMessage(
        `No se pudo aplicar el catalogo SICAR. Verifica que el puente local este activo con "npm run sicar:bridge". ${error?.message || ''}`.trim()
      );
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
      setMessage(
        `No se pudieron actualizar los precios SICAR. Verifica que el puente local este activo con "npm run sicar:bridge". ${error?.message || ''}`.trim()
      );
    } finally {
      setSyncingSicarPrices(false);
    }
  };

  const sectionMeta = {
    catalogo: {
      path: 'Configuraciones / Tienda Virtual / Catalogo',
      title: 'Catalogo de tienda virtual',
    },
    usuarios: {
      path: 'Configuraciones / Usuarios',
      title: 'Usuarios',
    },
    cupones: {
      path: 'Configuraciones / Cupones',
      title: 'Cupones',
    },
    entregadores: {
      path: 'Configuraciones / Entregadores',
      title: 'Entregadores',
    },
  }[section] || {
    path: 'Configuraciones',
    title: 'Configuraciones',
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
          {section === 'catalogo' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="cfg-button secondary"
                onClick={seedCatalog}
                disabled={saving || testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices}
              >
                Inicializar catalogo base
              </button>
              <button
                type="button"
                className="cfg-button secondary"
                onClick={testSicarConnection}
                disabled={testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices}
              >
                {testingSicar ? 'Probando conexion...' : 'Probar conexion SICAR'}
              </button>
              <button
                type="button"
                className="cfg-button secondary"
                onClick={updateSicarPrices}
                disabled={testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices}
              >
                {syncingSicarPrices ? 'Actualizando precios...' : 'Actualizar precios SICAR'}
              </button>
              <button
                type="button"
                className="cfg-button"
                onClick={loadSicarPreview}
                disabled={testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices}
              >
                {loadingSicarPreview ? 'Cargando vista previa...' : 'Vista previa 90% SICAR'}
              </button>
              <button
                type="button"
                className="cfg-button"
                onClick={() => applySicarCatalog(sicarPreview)}
                disabled={!sicarPreview || testingSicar || loadingSicarPreview || syncingSicar || syncingSicarPrices}
              >
                {syncingSicar ? 'Aplicando SICAR...' : 'Aplicar catalogo SICAR'}
              </button>
            </div>
          )}
          {section === 'entregadores' && (
            <button type="button" className="cfg-button secondary" onClick={seedDrivers} disabled={savingDriver}>
              Inicializar entregadores base
            </button>
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

        {section === 'catalogo' && (sicarHealth || sicarPreview) && (
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
              {sicarPreview?.generatedAt && (
                <span style={{ color: '#1e3a8a', fontWeight: 800 }}>
                  Vista previa generada: {formatSicarDate(sicarPreview.generatedAt)}
                </span>
              )}
            </div>
            {sicarHealth && (
              <div style={{ color: '#1e3a8a', fontWeight: 700, lineHeight: 1.5 }}>
                Bridge local activo en puerto {sicarHealth.bridgePort}. Base detectada: {sicarHealth.database} en{' '}
                {sicarHealth.host}.
              </div>
            )}
            {sicarPreview && (
              <div style={{ color: '#1e3a8a', fontWeight: 700, lineHeight: 1.5 }}>
                Reglas activas: {sicarPreview.rules?.thresholdPct || 0}% acumulado por categoria, categorias con al
                menos {sicarPreview.rules?.minOverallSharePct || 0}% del total general, y {sicarPreview.products?.length || 0}{' '}
                SKUs seleccionados para aplicar.
              </div>
            )}
            {!sicarPreview && (
              <div style={{ color: '#1e3a8a', fontWeight: 700, lineHeight: 1.5 }}>
                Primero genera la vista previa 90% para habilitar el boton Aplicar catalogo SICAR.
              </div>
            )}
          </div>
        )}

        <div className="cfg-tabs">
          <button
            type="button"
            className={`cfg-tab ${section === 'catalogo' ? 'active' : ''}`}
            onClick={() => setSection('catalogo')}
          >
            Tienda Virtual
          </button>
          <button
            type="button"
            className={`cfg-tab ${section === 'usuarios' ? 'active' : ''}`}
            onClick={() => setSection('usuarios')}
          >
            Usuarios
          </button>
          <button
            type="button"
            className={`cfg-tab ${section === 'entregadores' ? 'active' : ''}`}
            onClick={() => setSection('entregadores')}
          >
            Entregadores
          </button>
          <button
            type="button"
            className={`cfg-tab ${section === 'cupones' ? 'active' : ''}`}
            onClick={() => setSection('cupones')}
          >
            Cupones
          </button>
        </div>

        {section === 'catalogo' ? (
          <>
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
              <h2 style={{ margin: 0, fontSize: 22 }}>Categorias y subcategorias</h2>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
                Estas opciones alimentan los filtros de la tienda y las listas del catalogo.
              </p>
            </div>
            <button type="button" className="cfg-button secondary" onClick={seedCategories} disabled={savingCategory}>
              Inicializar categorias base
            </button>
          </div>

          <div
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

        <div
          className="cfg-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.5fr) minmax(360px, 0.85fr)',
            gap: 18,
            marginTop: 18,
            alignItems: 'start',
          }}
        >
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                marginBottom: 12,
                alignItems: 'center',
              }}
            >
              <input
                className="cfg-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar producto"
                style={{ maxWidth: 360 }}
              />
              <strong>{filteredProducts.length} productos</strong>
            </div>

            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Producto</th>
                  <th>Categoria</th>
                  <th>Precio</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.code}>
                    <td>
                      <img className="cfg-photo" src={product.image || '/tienda/branding/logo.png'} alt="" />
                    </td>
                    <td>
                      <strong>{product.name}</strong>
                      <div style={{ color: '#64748b', marginTop: 4 }}>{product.code}</div>
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

          <form
            onSubmit={saveProduct}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: 16,
              display: 'grid',
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22 }}>Producto</h2>
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
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => updateForm('price', event.target.value)}
              placeholder="Precio"
            />
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
                  maxHeight: 220,
                  objectFit: 'contain',
                  background: '#f1f5f9',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              />
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" className="cfg-button" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar producto'}
              </button>
              <button type="button" className="cfg-button secondary" onClick={() => setForm(buildEmptyProduct())}>
                Nuevo
              </button>
            </div>
          </form>
        </div>
          </>
        ) : section === 'usuarios' ? (
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
          />
        ) : section === 'entregadores' ? (
          <DriversManager
            drivers={drivers}
            driverForm={driverForm}
            savingDriver={savingDriver}
            updateDriverForm={updateDriverForm}
            saveDeliveryDriver={saveDeliveryDriver}
            editDriver={editDriver}
            linkDriverToUser={linkDriverToUser}
            toggleDriver={toggleDriver}
            resetDriverForm={() => setDriverForm(emptyDriver)}
          />
        ) : (
          <CouponsManager
            coupons={coupons}
            couponsUnlocked={couponsUnlocked}
            couponPin={couponPin}
            couponForm={couponForm}
            savingCoupon={savingCoupon}
            setCouponPin={setCouponPin}
            unlockCoupons={unlockCoupons}
            updateCouponForm={updateCouponForm}
            saveCoupon={saveCoupon}
            editCoupon={editCoupon}
            toggleCoupon={toggleCoupon}
            resetCouponForm={() => setCouponForm(emptyCoupon)}
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
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectedDriverCode, setSelectedDriverCode] = useState(driverForm.code || '');

  useEffect(() => {
    setSelectedDriverCode(driverForm.code || '');
  }, [driverForm.code]);

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
            <h2 style={{ margin: 0, fontSize: 22 }}>Entregadores asignados</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700 }}>
              Estos codigos se usan para asignar pedidos y entrar al modulo Driver.
            </p>
          </div>
          <strong>{drivers.length} entregadores</strong>
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
                <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span className={`cfg-badge ${driver.active === false ? 'off' : ''}`}>
                    {driver.active === false ? 'Inactivo' : 'Activo'}
                  </span>
                  <span className={`cfg-badge ${driver.passwordHash ? '' : 'off'}`}>
                    {driver.passwordHash ? 'Con contrasena' : 'Clave inicial: codigo'}
                  </span>
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
            <h2 style={{ margin: 0, fontSize: 22 }}>Usuario Driver</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.45 }}>
              Vincula el usuario con el mismo entregador que se selecciona en Lista de Pedidos.
            </p>
          </div>
          <button type="button" className="cfg-button secondary" onClick={() => setSelectorOpen(true)}>
            Elegir entregador
          </button>
        </div>

        {driverForm.code && (
          <div
            style={{
              border: '1px solid #dbeafe',
              borderRadius: 12,
              padding: 12,
              background: '#eff6ff',
              color: '#1d4ed8',
              fontWeight: 900,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>Vinculado a: {driverForm.name || 'Sin nombre'}</span>
            <span>{driverForm.code}</span>
          </div>
        )}

        <input
          className="cfg-input"
          value={driverForm.code}
          onChange={(event) => updateDriverForm('code', event.target.value.toUpperCase())}
          placeholder="Codigo. Ej: E-001"
        />
        <input
          className="cfg-input"
          value={driverForm.name}
          onChange={(event) => updateDriverForm('name', event.target.value.toUpperCase())}
          placeholder="Nombre"
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
        <input
          className="cfg-input"
          type="password"
          value={driverForm.password}
          onChange={(event) => updateDriverForm('password', event.target.value)}
          placeholder="Nueva contrasena para Driver"
        />
        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
          Si dejas la contrasena vacia se mantiene la actual. Para los entregadores base sin
          contrasena, la clave inicial es su mismo codigo.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button type="submit" className="cfg-button" disabled={savingDriver}>
            {savingDriver ? 'Guardando...' : 'Guardar entregador'}
          </button>
          <button type="button" className="cfg-button secondary" onClick={resetDriverForm}>
            Nuevo
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

function CouponsManager({
  coupons,
  couponsUnlocked,
  couponPin,
  couponForm,
  savingCoupon,
  setCouponPin,
  unlockCoupons,
  updateCouponForm,
  saveCoupon,
  editCoupon,
  toggleCoupon,
  resetCouponForm,
}) {
  const formatCouponValue = (coupon) =>
    coupon.type === 'amount' ? `C$ ${Number(coupon.value || 0).toFixed(2)}` : `${Number(coupon.value || 0)}%`;

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
      </section>

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
      ) : (
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
      )}
    </section>
  );
}
