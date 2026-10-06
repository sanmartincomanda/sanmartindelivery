// Snapshots contain navigation only, never cart, address, payment or benefits.
export const retailViewKey = ({ search, productQuantity, ...view }) => JSON.stringify(view);

export const createRetailHomeView = (view = {}) => ({
  ...view,
  tab: 'home', category: 'todos', subcategory: 'todas', search: '',
  product: '', checkout: false, checkoutStep: 'cart',
  profile: false, rewards: false, auth: false, orders: false, order: '',
  hours: false, branch: false, success: false, gift: false, welcome: false, popup: false,
});
