import { STORE_SUBCATEGORY_CANONICALS } from './storeSubcategoryRules';

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

export const STORE_COMBOS = [];

export const LEGACY_STORE_COMBO_CODES = ['1001', '1002', '1003', 'COMBO-660', 'COMBO-730', 'COMBO-1020'];

export const STORE_PAYMENT_OPTIONS = ['TARJETA', 'TRANSFERENCIA', 'LINK DE PAGO', 'EFECTIVO'];

export const STORE_CATEGORIES = [
  {
    id: 'todos',
    label: 'Todos',
    subcategories: [],
  },
  {
    id: 'res',
    label: 'Res',
    subcategories: STORE_SUBCATEGORY_CANONICALS.res,
  },
  {
    id: 'pollo',
    label: 'Pollo',
    subcategories: STORE_SUBCATEGORY_CANONICALS.pollo,
  },
  {
    id: 'cerdo',
    label: 'Cerdo',
    subcategories: STORE_SUBCATEGORY_CANONICALS.cerdo,
  },
  {
    id: 'abarroteria',
    label: 'Abarroteria',
    subcategories: STORE_SUBCATEGORY_CANONICALS.abarroteria,
  },
  {
    id: 'congelados',
    label: 'Congelados',
    subcategories: STORE_SUBCATEGORY_CANONICALS.congelados,
  },
  {
    id: 'refrigerados',
    label: 'Refrigerados',
    subcategories: STORE_SUBCATEGORY_CANONICALS.refrigerados,
  },
  {
    id: 'promociones',
    label: 'Promociones',
    subcategories: STORE_SUBCATEGORY_CANONICALS.promociones,
  },
];

export const QUICK_WEIGHTS = [0.5, 1, 1.5, 2, 2.5];
