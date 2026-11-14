import React from 'react';

function ProfileIcon({ name }) {
  const paths = {
    person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></>,
    help: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="m5.6 5.6 3.6 3.6m5.6 5.6 3.6 3.6m0-12.8-3.6 3.6m-5.6 5.6-3.6 3.6" /></>,
    wallet: <><path d="M20 8H5a2 2 0 0 1 0-4h13v4M3 6v12a2 2 0 0 0 2 2h15V8m0 4h-5v4h5" /><path d="M17 14h.01" /></>,
    address: <><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.4" /></>,
    orders: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 7h6M9 11h6M9 15h3" /></>,
    gold: <><path d="m3 6 5 4 4-6 4 6 5-4-2 12H5L3 6Zm3 15h12" /></>,
    settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="2" fill="currentColor" stroke="none" /></>,
    whatsapp: <><path d="M21 11.5a9 9 0 0 1-13.3 7.9L3 21l1.6-4.7A9 9 0 1 1 21 11.5Z" /><path d="M8.3 7.4c-1.8 1.8 4.5 8.1 6.3 6.3l1-1-2-1-.7.7-2.6-2.6.7-.7-1-2-1.7.3Z" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    exit: <><path d="M10 4H4v16h6m4-13 5 5-5 5m-5-5h10" /></>,
  };
  return <svg className="csm-account-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.person}</svg>;
}

export default function RetailProfile({ currentUser, rewardPoints, selectedBranch, rewardsEnabled = true, onEditProfile, onOpenRewards, onOpenActivity, onSignOut }) {
  const phone = String(selectedBranch?.whatsapp || '').replace(/\D/g, '');
  const whatsapp = /^\d{8,15}$/.test(phone) ? `https://wa.me/${phone}?text=${encodeURIComponent('Hola, necesito ayuda con la tienda virtual.')}` : '';
  const shortcuts = [
    { id: 'help', icon: 'help', title: 'Ayuda', action: () => onEditProfile('help') },
    { id: 'wallet', icon: 'wallet', title: 'Billetera', detail: 'Próximamente', disabled: true },
    { id: 'addresses', icon: 'address', title: 'Mis direcciones', action: () => onEditProfile('addresses') },
    { id: 'orders', icon: 'orders', title: 'Mis pedidos', action: onOpenActivity },
  ];
  return <section className="store-mobile-app-page csm-account" aria-label="Mi cuenta">
    <header className="csm-account-identity">
      <div className="csm-account-name"><p>Mi cuenta</p><h1>{currentUser?.nombre || 'Mi cuenta'}</h1><span>{selectedBranch?.shortName || selectedBranch?.name || 'Carnes San Martín'}</span></div>
      <span className="csm-account-avatar" aria-hidden="true"><ProfileIcon name="person" /></span>
    </header>
    <nav className="csm-account-shortcuts" aria-label="Accesos de tu cuenta">
      {shortcuts.map(entry => <button type="button" key={entry.id} data-account-action={entry.id} onClick={entry.action} disabled={entry.disabled}>
        <ProfileIcon name={entry.icon} /><span className="csm-account-copy"><strong>{entry.title}</strong>{entry.detail && <small>{entry.detail}</small>}</span>
      </button>)}
    </nav>
    {rewardsEnabled && <button type="button" className="csm-account-gold" onClick={() => onOpenRewards()}>
      <span className="csm-account-copy"><strong>Miembro Gold</strong><span className="csm-account-points">{Number(rewardPoints || 0).toLocaleString('es-NI')} <small>puntos disponibles</small></span><small>Ver premios y beneficios</small></span>
      <span className="csm-account-gold-mark"><ProfileIcon name="gold" /></span>
      <ProfileIcon name="chevron" />
    </button>}
    <nav className="csm-account-menu" aria-label="Opciones de tu cuenta">
      <button type="button" onClick={() => onEditProfile('information')}><ProfileIcon name="settings" /><span className="csm-account-copy"><strong>Configuración</strong><small>Nombre, contacto y datos personales</small></span><ProfileIcon name="chevron" /></button>
      {whatsapp ? <a href={whatsapp} target="_blank" rel="noopener noreferrer"><ProfileIcon name="whatsapp" /><span className="csm-account-copy"><strong>Contactar por WhatsApp</strong><small>{selectedBranch?.shortName || selectedBranch?.name}</small></span><ProfileIcon name="chevron" /></a> : <button type="button" disabled><ProfileIcon name="whatsapp" /><span className="csm-account-copy"><strong>Contactar por WhatsApp</strong><small>Contacto no disponible</small></span></button>}
    </nav>
    <button type="button" className="csm-account-signout" onClick={onSignOut}><ProfileIcon name="exit" /><span>Cerrar sesión</span></button>
  </section>;
}
