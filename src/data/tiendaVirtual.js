export const STORE_PRODUCTS = [
  {
    code: '00393',
    name: 'BISTEC POSTA DE PIERNA VP',
    price: 182,
    unit: 'lb',
    category: 'res',
    subcategory: 'Linea Diaria',
    active: true,
    image: '/tienda/page/product-gold.jpg',
    description: 'Bistec por libra.',
  },
  {
    code: '00444',
    name: 'POSTA DE GALLINA VP',
    price: 178,
    unit: 'lb',
    category: 'pollo',
    subcategory: 'Pollo',
    active: true,
    image: '/tienda/page/product-birria.jpg',
    description: 'Posta de gallina por libra.',
  },
  {
    code: '00442',
    name: 'MANO DE PIEDRA VP',
    price: 165,
    unit: 'lb',
    category: 'res',
    subcategory: 'Linea Diaria',
    active: true,
    image: '/tienda/page/hero-table.jpg',
    description: 'Mano de piedra por libra.',
  },
];

export const STORE_PROMOTIONS = [
  {
    id: 'combo-practico',
    title: 'C2 Jalapeno + Chimichurri',
    image: '/tienda/promos/promo-combo-2.jpg',
  },
  {
    id: 'parrilladas',
    title: 'Parrilladas',
    image: '/tienda/promos/promo-parrilladas.jpg',
  },
  {
    id: 'combo-premium',
    title: 'C3 Cortes para parrilla',
    image: '/tienda/promos/promo-combo-3.jpg',
  },
  {
    id: 'combo-parrillero',
    title: 'C1 Torta Hamburguesa',
    image: '/tienda/promos/promo-combo-1.jpg',
  },
  {
    id: 'degustacion',
    title: 'Degustacion',
    image: '/tienda/promos/promo-degustacion.jpg',
  },
  {
    id: 'promo-bac',
    title: 'BAC',
    image: '/tienda/promos/promo-bac.jpg',
  },
];

export const STORE_COMBOS = [
  {
    code: '1001',
    name: 'C1 TORTA HAMBURGUESA (100% RES)',
    price: 730,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-1.jpg',
    description: 'Combo SICAR C1. Torta hamburguesa 100% res.',
  },
  {
    code: '1002',
    name: 'C2 TORTA SABOR JALAPENO + CHIMICHURRI',
    price: 660,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-2.jpg',
    description: 'Combo SICAR C2. Torta sabor jalapeno + chimichurri.',
  },
  {
    code: '1003',
    name: 'C3 CORTES PARA PARRILLA',
    price: 1020,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-3.jpg',
    description: 'Combo SICAR C3. Cortes para parrilla.',
  },
];

export const LEGACY_STORE_COMBO_CODES = ['COMBO-660', 'COMBO-730', 'COMBO-1020'];

export const STORE_PAYMENT_OPTIONS = ['Efectivo', 'POS BAC', 'TRANSFERENCIA', 'LINK DE PAGO'];

export const STORE_CATEGORIES = [
  {
    id: 'todos',
    label: 'Todos',
    subcategories: [],
  },
  {
    id: 'res',
    label: 'Res',
    subcategories: [
      'Linea Diaria',
      'Linea Parrillera',
      'Linea Practica',
      'Producidos',
      'Productos Especiales',
      'Productos Gold',
      'Productos Industriales',
      'Productos Selectos',
      'Sopa',
      'Tortas de Carne',
      'Visceras',
      'Americano Choice',
      'Combos',
    ],
  },
  {
    id: 'pollo',
    label: 'Pollo',
    subcategories: ['Pollo', 'Pollo- Cortes Espec. San Martin'],
  },
  {
    id: 'cerdo',
    label: 'Cerdo',
    subcategories: ['Cerdo', 'Cerdo Cortes Especiales'],
  },
  {
    id: 'abarroteria',
    label: 'Abarroteria',
    subcategories: [
      'Basicos',
      'BC- Snacks',
      'Condimentos (Especies)',
      'Enlatados',
      'Salsas',
      'Sumplementos para asado',
      'Z - Otros',
    ],
  },
  {
    id: 'congelados',
    label: 'Congelados',
    subcategories: ['Derivado pollo', 'Mariscos', 'Otros Congelados'],
  },
  {
    id: 'refrigerados',
    label: 'Refrigerados',
    subcategories: ['Bebidas', 'Embutidos', 'Lacteos', 'Otros Refrigerados'],
  },
  {
    id: 'promociones',
    label: 'Promociones',
    subcategories: ['Combos'],
  },
];

export const QUICK_WEIGHTS = [0.5, 1, 1.5, 2, 2.5];
