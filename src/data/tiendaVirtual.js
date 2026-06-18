export const STORE_PRODUCTS = [
  {
    code: '00393',
    name: 'BISTEC POSTA DE PIERNA VP',
    price: 182,
    unit: 'lb',
    badge: 'Parrilla y sarten',
    description: 'Corte versatil con gran sabor para almuerzos y asados de fin de semana.',
    image: '/tienda/page/product-gold.jpg',
    accent: '#f97316',
  },
  {
    code: '00444',
    name: 'POSTA DE GALLINA VP',
    price: 178,
    unit: 'lb',
    badge: 'Coccion lenta',
    description: 'Perfecta para caldos, sopas y recetas caseras con coccion suave.',
    image: '/tienda/page/product-birria.jpg',
    accent: '#eab308',
  },
  {
    code: '00442',
    name: 'MANO DE PIEDRA VP',
    price: 165,
    unit: 'lb',
    badge: 'Favorita del dia',
    description: 'Un clasico de la casa para compartir y llevar directo de cocina a tu mesa.',
    image: '/tienda/page/hero-table.jpg',
    accent: '#ef4444',
  },
];

export const STORE_PROMOTIONS = [
  {
    id: 'combo-practico',
    title: 'Combo Hamburguesa Practico',
    subtitle: 'Especial para resolver rapido con sabor San Martin.',
    image: '/tienda/promos/promo-combo-2.jpg',
    tag: 'Especial',
  },
  {
    id: 'parrilladas',
    title: 'Parrilladas a precio especial',
    subtitle: 'Promocionales vigentes para fans de la carne.',
    image: '/tienda/promos/promo-parrilladas.jpg',
    tag: 'Promocion',
  },
  {
    id: 'combo-premium',
    title: 'Combo Parrilla Premium',
    subtitle: 'Experiencia premium para compartir en casa.',
    image: '/tienda/promos/promo-combo-3.jpg',
    tag: 'Premium',
  },
  {
    id: 'combo-parrillero',
    title: 'Combo Hamburguesa Parrillero',
    subtitle: 'Una opcion lista para disfrutar en familia.',
    image: '/tienda/promos/promo-combo-1.jpg',
    tag: 'Favorito',
  },
  {
    id: 'degustacion',
    title: 'Degustacion de tortas',
    subtitle: 'Publicidad de la marca para reforzar la experiencia.',
    image: '/tienda/promos/promo-degustacion.jpg',
    tag: 'Marca',
  },
  {
    id: 'promo-bac',
    title: '20% de descuento BAC',
    subtitle: 'Promocional para destacar medios de pago aliados.',
    image: '/tienda/promos/promo-bac.jpg',
    tag: 'Pago',
  },
];

export const STORE_FEATURES = [
  {
    title: 'Pedido directo a cocina',
    description: 'Lo que el cliente compra aqui entra al mismo flujo operativo del delivery.',
  },
  {
    title: 'Codigos listos para SICAR',
    description: 'El catalogo ya trabaja con codigo, nombre y precio por libra para la integracion.',
  },
  {
    title: 'Pesos claros y controlados',
    description: 'Solo medias libras y libras completas para evitar confusiones al preparar el corte.',
  },
];

export const STORE_PAYMENT_OPTIONS = [
  'Efectivo',
  'POS BAC',
  'TRANSFERENCIA',
  'LINK DE PAGO',
];

export const STORE_FILTERS = [
  { id: 'todos', label: 'Todo el catalogo' },
  { id: 'parrilla', label: 'Para parrilla' },
  { id: 'hogar', label: 'Para casa' },
  { id: 'especiales', label: 'Especiales' },
];

export const QUICK_WEIGHTS = [0.5, 1, 1.5, 2, 2.5];
