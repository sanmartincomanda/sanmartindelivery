import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useKitchenStaff, { kitchenStaffService } from '../hooks/useKitchenStaff';
import { kitchenStaffError, normalizeStaffSearch, validateKitchenStaffMember } from '../services/kitchenStaff';
import '../styles/kitchenStaffAdmin.css';

export default function KitchenStaffAdminSection({ currentUsername = 'admin' }) {
  const { members, loading, connected, error, retry } = useKitchenStaff({ initialize: true, actor: currentUsername });
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  const activeCount = members.filter((member) => member.active).length;
  const visible = members.filter((member) => member.active === (filter === 'active')
    && normalizeStaffSearch(`${member.name} ${member.alias}`).includes(normalizeStaffSearch(search)));

  return (
    <section className="kitchen-staff" aria-label="Preparadores de cocina">
      <div className="kitchen-staff__header">
        <div><h3>Preparadores de cocina</h3><p>Personas que podés asignar a los pedidos de Delivery y Ruta.</p></div>
        <button type="button" className="ks-button" disabled={loading || !!error || !connected}
          onClick={() => { setMessage(''); setDialog({ mode: 'edit', member: { name: '', alias: '', active: true } }); }}>
          <span aria-hidden="true">+</span> Agregar preparador
        </button>
      </div>
      <div className="kitchen-staff__toolbar">
        <div className="kitchen-staff__filters" aria-label="Estado de preparadores">
          <button type="button" aria-pressed={filter === 'active'} onClick={() => setFilter('active')}>Activos <span>{activeCount}</span></button>
          <button type="button" aria-pressed={filter === 'inactive'} onClick={() => setFilter('inactive')}>Inactivos <span>{members.length - activeCount}</span></button>
        </div>
        <label className="kitchen-staff__search">Buscar preparador
          <input type="search" placeholder="Nombre o alias" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
      </div>
      {message && <p className="kitchen-staff__notice" role="status">{message}</p>}
      {!connected && !loading && <p className="kitchen-staff__notice" role="status">Sin conexión. Reconectá para hacer cambios.</p>}
      {error ? <div className="kitchen-staff__notice is-error" role="alert"><p>{error}</p><button className="ks-button secondary" onClick={retry}>Reintentar</button></div>
        : loading ? <div className="kitchen-staff__empty" role="status" aria-busy="true">Cargando preparadores...</div>
          : visible.length ? <ul className="kitchen-staff__list">
            {visible.map((member) => <li key={member.id}>
              <span className="kitchen-staff__avatar" aria-hidden="true">{member.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
              <div className="kitchen-staff__person"><strong>{member.name}</strong><span>En cocina: {member.alias}</span></div>
              <span className={`kitchen-staff__status ${member.active ? '' : 'is-inactive'}`}>{member.active ? 'Activo' : 'Inactivo'}</span>
              <div className="kitchen-staff__actions">
                <button type="button" className="ks-button secondary" disabled={!connected} aria-label={`Editar ${member.name}`}
                  onClick={() => setDialog({ mode: 'edit', member })}>Editar</button>
                <button type="button" className={`ks-button ${member.active ? 'danger-text' : 'secondary'}`} disabled={!connected}
                  aria-label={`${member.active ? 'Retirar' : 'Reactivar'} ${member.name}`}
                  onClick={() => setDialog({ mode: 'status', member })}>{member.active ? 'Retirar' : 'Reactivar'}</button>
              </div>
            </li>)}
          </ul> : <div className="kitchen-staff__empty"><strong>{search ? 'Sin coincidencias' : filter === 'active' ? 'No hay preparadores activos' : 'No hay preparadores inactivos'}</strong>
            <p>{search ? 'Probá otro nombre o alias.' : filter === 'active' ? 'Agregá una persona o reactivá a alguien de la lista de inactivos.' : 'Las personas que retires se guardarán aquí.'}</p></div>}
      <p className="kitchen-staff__footnote">Retirar a una persona la oculta en nuevas asignaciones. Sus pedidos anteriores y su historial se conservan. No cambia el acceso general a Cocina.</p>
      {dialog && <KitchenStaffDialog {...dialog} members={members} connected={connected} actor={currentUsername}
        onClose={() => setDialog(null)} onSaved={(member, mode) => {
          setDialog(null);
          setMessage(mode === 'status' ? `${member.name}: ${member.active ? 'activo nuevamente' : 'retirado de nuevas asignaciones'}.` : `${member.name}: cambios guardados.`);
        }} />}
    </section>
  );
}

function KitchenStaffDialog({ mode, member, members, connected, actor, onClose, onSaved }) {
  const [form, setForm] = useState({ name: member.name, alias: member.alias, active: member.active });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const panel = useRef(null);
  const saveLock = useRef(false);
  const isStatus = mode === 'status';
  const conflict = !!member.id && members.find((item) => item.id === member.id)?.revision !== member.revision;
  const title = isStatus ? `${member.active ? 'Retirar' : 'Reactivar'} preparador` : member.id ? 'Editar preparador' : 'Agregar preparador';
  useEffect(() => {
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.querySelector(isStatus ? '[data-cancel]' : 'input')?.focus();
    return () => { document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [isStatus]);

  const close = () => { if (!saveLock.current) onClose(); };
  const handleKey = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key !== 'Tab') return;
    const fields = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
    const first = fields[0], last = fields[fields.length - 1];
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const save = async (event) => {
    event.preventDefault();
    if (saveLock.current || conflict || !connected) return;
    const input = { ...form, id: member.id, expectedRevision: member.revision, ...(isStatus ? { active: !member.active } : {}) };
    try { validateKitchenStaffMember(input, members); } catch (failure) { setError(failure.message); return; }
    saveLock.current = true; setBusy(true); setError('');
    try { onSaved(await kitchenStaffService.save(input, actor), mode); }
    catch (failure) { setError(kitchenStaffError(failure)); }
    finally { saveLock.current = false; setBusy(false); }
  };
  return createPortal(
    <div className="admin-viewport-dialog kitchen-staff-dialog" onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section ref={panel} className="admin-viewport-dialog__panel kitchen-staff-dialog__panel" role="dialog" aria-modal="true"
        aria-labelledby="kitchen-staff-dialog-title" tabIndex={-1} onKeyDown={handleKey}>
        <header><h3 id="kitchen-staff-dialog-title">{title}</h3><button type="button" className="ks-button secondary" aria-label="Cerrar" disabled={busy} onClick={close}>Cerrar</button></header>
        <form onSubmit={save} aria-busy={busy}>
          {isStatus ? <div className="kitchen-staff-dialog__description"><strong>{member.name}</strong><p>{member.active
            ? 'Dejará de aparecer al asignar nuevos pedidos. Los pedidos que ya preparó conservarán su nombre. Podés reactivarlo después.'
            : 'Volverá a estar disponible para preparar nuevos pedidos.'}</p></div>
            : <>
              <label>Nombre completo<input required maxLength={80} autoComplete="off" value={form.name} disabled={busy}
                onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label>Nombre en cocina / alias<input maxLength={40} autoComplete="off" value={form.alias} disabled={busy}
                placeholder="Ej.: Julio" aria-describedby="kitchen-staff-alias-help" onChange={(event) => setForm({ ...form, alias: event.target.value })} /></label>
              <p id="kitchen-staff-alias-help" className="kitchen-staff__footnote">Así aparecerá al seleccionar quién prepara el pedido. Si lo dejás vacío, se usa el nombre completo.</p>
            </>}
          {conflict && <p role="alert" className="kitchen-staff__notice is-error">Otra persona modificó este registro. Cerrá y volvé a abrirlo para ver los cambios.</p>}
          {error && <p role="alert" className="kitchen-staff__notice is-error">{error}</p>}
          {!connected && <p role="status" className="kitchen-staff__notice">Sin conexión. Esperá a reconectarte para guardar.</p>}
          <footer><button type="button" data-cancel className="ks-button secondary" disabled={busy} onClick={close}>Cancelar</button>
            <button type="submit" className={`ks-button ${isStatus && member.active ? 'danger' : ''}`} disabled={busy || conflict || !connected}>
              {busy ? 'Guardando...' : isStatus ? member.active ? 'Retirar preparador' : 'Reactivar preparador' : 'Guardar preparador'}
            </button></footer>
        </form>
      </section>
    </div>, document.body,
  );
}
