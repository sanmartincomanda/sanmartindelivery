import React from 'react';

const paths = {
  offers: <path fill="currentColor" stroke="none" fillRule="evenodd" d="M3 4.5A1.5 1.5 0 0 1 4.5 3h7.4a2 2 0 0 1 1.4.6l8 8a2 2 0 0 1 0 2.8l-6.9 6.9a2 2 0 0 1-2.8 0l-8-8a2 2 0 0 1-.6-1.4Zm6.8 3.8a1.6 1.6 0 1 0-3.2 0 1.6 1.6 0 0 0 3.2 0Z" />,
  orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  gold: <><path d="m4 8 4 4 4-7 4 7 4-4-2 11H6L4 8ZM7 22h10" /></>,
};

export default function RetailQuickActions({ onOffers, onOrders, onGold, hasOffers, goldEnabled }) {
  const actions = [
    ...(hasOffers ? [{ id: 'offers', label: 'Promos', accessibleLabel: 'Promos vigentes', action: onOffers }] : []),
    { id: 'orders', label: 'Pedidos', accessibleLabel: 'Mis pedidos', action: onOrders },
    ...(goldEnabled ? [{ id: 'gold', label: 'Miembro Gold', action: onGold }] : []),
  ];
  return <nav className="retail-quick-actions" aria-label="Accesos rápidos">
    {actions.map(item => <button type="button" key={item.id} onClick={item.action} className={`retail-quick-${item.id}`} aria-label={item.accessibleLabel}>
      <span className="retail-quick-content">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[item.id]}</svg>
        {item.label}
      </span>
    </button>)}
  </nav>;
}
