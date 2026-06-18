const normalizeCategoryKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const normalizeSubcategoryKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');

export const STORE_SUBCATEGORY_CANONICALS = {
  res: [
    'Linea Diaria',
    'Linea Parrillera',
    'Linea Practica y Tortas Hamburguesa',
    'Molida Granel',
    'Productos Especiales',
    'Linea Gold',
    'Productos Industriales',
    'Linea Selecta',
    'Visceras y Sopas',
    'Americano Choice',
    'Tortas de Carne',
    'Combos',
  ],
  pollo: ['Pollo', 'Pollo- Cortes Espec. San Martin'],
  cerdo: ['Cerdo', 'Cerdo Cortes Especiales'],
  abarroteria: [
    'Basicos',
    'BC- Snacks',
    'Condimentos (Especies)',
    'Enlatados',
    'Salsas',
    'Sumplementos para asado',
    'Z - Otros',
  ],
  congelados: ['Derivado pollo', 'Mariscos', 'Otros Congelados'],
  refrigerados: ['Bebidas', 'Embutidos', 'Lacteos', 'Otros Refrigerados'],
  promociones: ['Combos'],
};

const STORE_SUBCATEGORY_ALIASES = {
  res: {
    res: 'Linea Diaria',
    'linea diaria': 'Linea Diaria',
    'linea parrillera': 'Linea Parrillera',
    'linea practica': 'Linea Practica y Tortas Hamburguesa',
    'tortas hamburguesa': 'Linea Practica y Tortas Hamburguesa',
    'producto gold': 'Linea Gold',
    'productos gold': 'Linea Gold',
    'producto selecto': 'Linea Selecta',
    'producto selectos': 'Linea Selecta',
    'productos selectos': 'Linea Selecta',
    selectos: 'Linea Selecta',
    sopa: 'Visceras y Sopas',
    visceras: 'Visceras y Sopas',
    producidos: 'Molida Granel',
  },
  pollo: {
    gallina: 'Pollo',
    pollo: 'Pollo',
    'pollo- cortes espec. san martin': 'Pollo- Cortes Espec. San Martin',
  },
  cerdo: {
    cerdo: 'Cerdo',
    'cerdo cortes especiales': 'Cerdo Cortes Especiales',
  },
  abarroteria: {
    basicos: 'Basicos',
    'bc- snacks': 'BC- Snacks',
    'condimentos (especies)': 'Condimentos (Especies)',
    enlatados: 'Enlatados',
    salsas: 'Salsas',
    'sumplementos para asado': 'Sumplementos para asado',
    'z - otros': 'Z - Otros',
  },
  congelados: {
    'derivado pollo': 'Derivado pollo',
    mariscos: 'Mariscos',
    'otros congelados': 'Otros Congelados',
  },
  refrigerados: {
    bebidas: 'Bebidas',
    embutidos: 'Embutidos',
    lacteos: 'Lacteos',
    'otros refrigerados': 'Otros Refrigerados',
  },
  promociones: {
    combos: 'Combos',
  },
};

const CATEGORY_SUBCATEGORY_MAPS = Object.fromEntries(
  Object.entries(STORE_SUBCATEGORY_CANONICALS).map(([categoryId, labels]) => {
    const mapping = new Map();

    labels.forEach((label) => {
      mapping.set(normalizeSubcategoryKey(label), label);
    });

    Object.entries(STORE_SUBCATEGORY_ALIASES[categoryId] || {}).forEach(([alias, canonicalLabel]) => {
      mapping.set(normalizeSubcategoryKey(alias), canonicalLabel);
    });

    return [categoryId, mapping];
  })
);

const GLOBAL_SUBCATEGORY_MAP = new Map();
Object.values(STORE_SUBCATEGORY_CANONICALS).forEach((labels) => {
  labels.forEach((label) => {
    const key = normalizeSubcategoryKey(label);
    if (!GLOBAL_SUBCATEGORY_MAP.has(key)) {
      GLOBAL_SUBCATEGORY_MAP.set(key, label);
    }
  });
});

export const getForcedSicarSubcategories = (categoryId) => {
  const normalizedCategoryId = normalizeCategoryKey(categoryId);
  if (normalizedCategoryId === 'res') {
    return ['Linea Practica y Tortas Hamburguesa'];
  }

  return [];
};

export const normalizeStoreSubcategory = (subcategory, categoryId = '') => {
  const normalizedCategoryId = normalizeCategoryKey(categoryId);
  const cleanSubcategory = String(subcategory || '').trim();
  const subcategoryKey = normalizeSubcategoryKey(cleanSubcategory);

  if (normalizedCategoryId === 'res' && (!subcategoryKey || subcategoryKey === 'res')) {
    return 'Linea Diaria';
  }

  if (!cleanSubcategory) {
    return '';
  }

  const categoryMapping = CATEGORY_SUBCATEGORY_MAPS[normalizedCategoryId];
  if (categoryMapping?.has(subcategoryKey)) {
    return categoryMapping.get(subcategoryKey);
  }

  if (GLOBAL_SUBCATEGORY_MAP.has(subcategoryKey)) {
    return GLOBAL_SUBCATEGORY_MAP.get(subcategoryKey);
  }

  return cleanSubcategory;
};

export const normalizeStoreSubcategories = (value, categoryId = '') => {
  const source = Array.isArray(value) ? value : String(value || '').split(/\n|,/);
  const deduped = new Map();

  source.forEach((item) => {
    const normalizedLabel = normalizeStoreSubcategory(item, categoryId);
    const normalizedKey = normalizeSubcategoryKey(normalizedLabel);
    if (!normalizedKey) {
      return;
    }

    if (!deduped.has(normalizedKey)) {
      deduped.set(normalizedKey, normalizedLabel);
    }
  });

  return Array.from(deduped.values());
};
