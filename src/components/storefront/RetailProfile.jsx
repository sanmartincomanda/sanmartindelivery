import React, { useEffect, useRef, useState } from 'react';
import { getProfilePhoto, prepareProfilePhoto } from '../../services/storeProfilePhoto';

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
    camera: <><path d="M8 6 9.5 4h5L16 6h4v14H4V6h4Z" /><circle cx="12" cy="12" r="3" /></>,
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    exit: <><path d="M10 4H4v16h6m4-13 5 5-5 5m-5-5h10" /></>,
  };
  return <svg className="csm-account-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.person}</svg>;
}

export default function RetailProfile({ currentUser, rewardPoints, selectedBranch, rewardsEnabled = true, onEditProfile, onOpenRewards, onOpenActivity, onSignOut, onSavePhoto, preparePhoto = prepareProfilePhoto }) {
  const photo = getProfilePhoto(currentUser);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [draftPhoto, setDraftPhoto] = useState(photo);
  const [photoError, setPhotoError] = useState('');
  const [photoStatus, setPhotoStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [brokenPhoto, setBrokenPhoto] = useState('');
  const inputRef = useRef(null);
  const operation = useRef(0);
  const busyRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current++; }; }, []);
  useEffect(() => {
    if (!photoOpen) return undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, [photoOpen]);

  const openPhoto = () => { setDraftPhoto(photo); setPhotoError(''); setPhotoStatus(''); setPhotoOpen(true); };
  const closePhoto = () => { if (!busyRef.current) { operation.current++; setPhotoOpen(false); } };
  const choosePhoto = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busyRef.current) return;
    const attempt = ++operation.current;
    busyRef.current = true; setBusy(true); setPhotoError(''); setPhotoStatus('Preparando foto…');
    try {
      const next = await preparePhoto(file);
      if (mounted.current && attempt === operation.current) { setDraftPhoto(next); setPhotoStatus('Foto lista para guardar'); }
    } catch (error) {
      if (mounted.current && attempt === operation.current) { setPhotoError(error.message); setPhotoStatus(''); }
    } finally {
      if (mounted.current && attempt === operation.current) { busyRef.current = false; setBusy(false); }
    }
  };
  const savePhoto = async () => {
    if (busyRef.current || !onSavePhoto) return;
    busyRef.current = true; setBusy(true); setPhotoError(''); setPhotoStatus('Guardando foto…');
    try {
      await onSavePhoto(draftPhoto);
      if (mounted.current) { setPhotoOpen(false); setPhotoStatus('Foto actualizada'); setBrokenPhoto(''); }
    } catch {
      if (mounted.current) { setPhotoError('No pudimos guardar tu foto. Revisá tu conexión e intentá nuevamente.'); setPhotoStatus(''); }
    } finally {
      if (mounted.current) { busyRef.current = false; setBusy(false); }
    }
  };
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
      <button type="button" className="csm-account-avatar" onClick={openPhoto} aria-label={photo ? 'Cambiar foto de perfil' : 'Agregar foto de perfil'}>
        {photo && brokenPhoto !== photo ? <img src={photo} alt="" width="72" height="72" onError={() => setBrokenPhoto(photo)} /> : <ProfileIcon name="person" />}
        <span className="csm-account-camera"><ProfileIcon name="camera" /></span>
      </button>
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
    {!photoOpen && photoStatus && <p className="csm-account-status" role="status">{photoStatus}</p>}
    {photoOpen && <div className="csm-account-photo-overlay" onClick={event => { if (event.target === event.currentTarget) closePhoto(); }}>
      <section className="csm-account-photo-sheet" role="dialog" aria-modal="true" aria-label="Foto de perfil" aria-busy={busy}>
        <span className="csm-account-sheet-handle" aria-hidden="true" />
        <div className="csm-account-photo-head"><h2>Foto de perfil</h2><button type="button" aria-label="Cerrar foto de perfil" data-retail-local-back="true" disabled={busy} onClick={closePhoto}><ProfileIcon name="close" /></button></div>
        <div className="csm-account-photo-preview">{draftPhoto ? <img src={draftPhoto} alt="Vista previa de tu foto" /> : <ProfileIcon name="person" />}</div>
        <p>Elegí una foto de tu galería. Se guardará como una miniatura.</p>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Elegir foto de perfil" hidden onChange={choosePhoto} disabled={busy} />
        {photoError && <p className="csm-account-photo-error" role="alert">{photoError}</p>}
        <p className="csm-account-status" role="status">{photoStatus}</p>
        <button type="button" className="csm-account-photo-choose" disabled={busy} onClick={() => inputRef.current?.click()}>Elegir foto</button>
        {draftPhoto && <button type="button" className="csm-account-photo-remove" disabled={busy} onClick={() => { setDraftPhoto(''); setPhotoStatus('Guardá para quitar la foto'); }}>Quitar foto</button>}
        <button type="button" className="csm-account-photo-save" disabled={busy || draftPhoto === photo || !onSavePhoto} onClick={savePhoto}>{busy ? 'Procesando…' : 'Guardar cambios'}</button>
      </section>
    </div>}
  </section>;
}
