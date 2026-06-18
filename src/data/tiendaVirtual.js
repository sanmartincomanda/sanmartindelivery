export const STORE_PRODUCTS = [
  {
    code: '00393',
    name: 'BISTEC POSTA DE PIERNA VP',
    price: 182,
    unit: 'lb',
    category: 'carniceria',
    subcategory: 'Res',
    active: true,
    image: '/tienda/page/product-gold.jpg',
    description: 'Bistec por libra.',
  },
  {
    code: '00444',
    name: 'POSTA DE GALLINA VP',
    price: 178,
    unit: 'lb',
    category: 'carniceria',
    subcategory: 'Gallina',
    active: true,
    image: '/tienda/page/product-birria.jpg',
    description: 'Posta de gallina por libra.',
  },
  {
    code: '00442',
    name: 'MANO DE PIEDRA VP',
    price: 165,
    unit: 'lb',
    category: 'carniceria',
    subcategory: 'Res',
    active: true,
    image: '/tienda/page/hero-table.jpg',
    description: 'Mano de piedra por libra.',
  },
];

export const STORE_PROMOTIONS = [
  {
    id: 'combo-practico',
    title: 'Combo Practico',
    image: '/tienda/promos/promo-combo-2.jpg',
  },
  {
    id: 'parrilladas',
    title: 'Parrilladas',
    image: '/tienda/promos/promo-parrilladas.jpg',
  },
  {
    id: 'combo-premium',
    title: 'Combo Premium',
    image: '/tienda/promos/promo-combo-3.jpg',
  },
  {
    id: 'combo-parrillero',
    title: 'Combo Parrillero',
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
    code: 'COMBO-660',
    name: 'COMBO 2 HAMBURGUESA PRACTICO',
    price: 660,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-2.jpg',
    description: 'Codigo SICAR pendiente. Vinculado por precio C$ 660.',
  },
  {
    code: 'COMBO-730',
    name: 'COMBO 1 HAMBURGUESA PARRILLERO',
    price: 730,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-1.jpg',
    description: 'Codigo SICAR pendiente. Vinculado por precio C$ 730.',
  },
  {
    code: 'COMBO-1020',
    name: 'COMBO 3 PARRILLA PREMIUM',
    price: 1020,
    unit: 'unidad',
    category: 'promociones',
    subcategory: 'Combos',
    active: true,
    promo: true,
    image: '/tienda/promos/promo-combo-3.jpg',
    description: 'Codigo SICAR pendiente. Vinculado por precio C$ 1,020.',
  },
];

export const STORE_PAYMENT_OPTIONS = ['Efectivo', 'POS BAC', 'TRANSFERENCIA', 'LINK DE PAGO'];

export const STORE_CATEGORIES = [
  { id: 'todos', label: 'Todos' },
  { id: 'carniceria', label: 'Carniceria' },
  { id: 'res', label: 'Res' },
  { id: 'gallina', label: 'Gallina' },
  { id: 'promociones', label: 'Promociones' },
];

export const QUICK_WEIGHTS = [0.5, 1, 1.5, 2, 2.5];
