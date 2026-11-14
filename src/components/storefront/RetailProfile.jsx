import React from 'react';

export default function RetailProfile({ currentUser, rewardPoints, selectedBranch, rewardsEnabled = true, onEditProfile, onOpenRewards, onOpenActivity, onSignOut, Icon }) {
  const shortcuts = [
    { icon: 'activity', title: 'Mis pedidos', action: onOpenActivity },
    { icon: 'pin', title: 'Direcciones', action: () => onEditProfile('addresses') },
  ];
  const entries = [
    { icon: 'account', title: 'Mi información', detail: currentUser?.telefono, action: () => onEditProfile('information') },
    { icon: 'orders', title: 'Ayuda y privacidad', detail: 'Soporte y opciones de tu cuenta', action: () => onEditProfile('help') },
  ];
  return <section className="store-mobile-app-page retail-profile">
    <h1>Perfil</h1>
    <div className="retail-profile-identity">
      <div><h2>{currentUser?.nombre || 'Mi cuenta'}</h2><p>{selectedBranch?.name}</p></div>
      <button type="button" className="retail-profile-edit" onClick={() => onEditProfile('information')} aria-label="Editar mi información">
        <span aria-hidden="true">{Array.from(String(currentUser?.nombre || 'C').trim())[0]?.toUpperCase() || 'C'}</span>
      </button>
    </div>
    <nav className="retail-profile-shortcuts" aria-label="Accesos de tu cuenta">
      {shortcuts.map(entry => <button type="button" key={entry.title} onClick={entry.action}>
        <Icon name={entry.icon} /><span>{entry.title}</span>
      </button>)}
    </nav>
    {rewardsEnabled && <button type="button" className="retail-profile-gold" onClick={onOpenRewards}>
      <Icon name="reward" />
      <span><strong>Miembro Gold</strong><small>Premios y beneficios</small></span>
      <b>{Number(rewardPoints || 0).toLocaleString('es-NI')} <small>pts</small></b>
      <span className="retail-profile-chevron" aria-hidden="true">›</span>
    </button>}
    <nav className="retail-profile-menu" aria-label="Configuración de tu cuenta">
      {entries.map(entry => <button key={entry.title} type="button" onClick={entry.action}>
        <Icon name={entry.icon} /><span><strong>{entry.title}</strong>{entry.detail && <small>{entry.detail}</small>}</span>
        <span className="retail-profile-chevron" aria-hidden="true">›</span>
      </button>)}
    </nav>
    <button type="button" className="retail-signout" onClick={onSignOut}>Cerrar sesión</button>
  </section>;
}
