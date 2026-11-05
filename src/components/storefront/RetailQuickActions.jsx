import React from 'react';

const paths = {
  offers: <><path d="M3 4h9l9 9-8 8-10-10V4Z" /><circle cx="8" cy="8" r="1" /></>,
  orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  gold: <><path d="m4 8 4 4 4-7 4 7 4-4-2 11H6L4 8ZM7 22h10" /></>,
};

export default function RetailQuickActions({ onOffers, onOrders, onGold, hasOffers, goldEnabled }) {
  const actions = [
    ...(hasOffers ? [{ id: 'offers', label: 'Promociones', action: onOffers }] : []),
    { id: 'orders', label: 'Mis pedidos', action: onOrders },
    ...(goldEnabled ? [{ id: 'gold', label: 'Miembro Gold', action: onGold }] : []),
  ];
  return <nav className="retail-quick-actions" aria-label="Accesos rápidos">
    {actions.map(item => <button type="button" key={item.id} onClick={item.action} className={`retail-quick-${item.id}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[item.id]}</svg>
      <span>{item.label}</span>
    </button>)}
  </nav>;
}
