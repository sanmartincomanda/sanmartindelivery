import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

const BRAND_LOGO_PATH = '/tienda/branding/logo-mark.svg';

const ICON_PATHS = {
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5M9.5 20v-6h5v6" /></>,
  orders: <><path d="M6 3h12v18H6z" /><path d="M9 7h6M9 11h6M9 15h4" /></>,
  kitchen: <><path d="M5 4h14M7 4v16h10V4M9 14h6M12 14v6" /></>,
  catalog: <><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="m4 7v10l8 4 8-4V7M12 11v10" /></>,
  customers: <><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 2 18.5V20" /><circle cx="9" cy="7" r="4" /><path d="M17 10a3.5 3.5 0 1 0 0-7M22 20v-1.5a4.5 4.5 0 0 0-3.5-4.4" /></>,
  store: <><path d="M3 9h18l-1.5-5h-15L3 9Z" /><path d="M4 9v11h16V9M9 20v-6h6v6" /></>,
  marketing: <><path d="M4 13V9l13-5v14L4 13Z" /><path d="M7 14.5 8.5 20h3L10 14M20 8v6" /></>,
  benefits: <><path d="M12 3v18M4 9h16v12H4zM3 9h18V6H3z" /><path d="M12 9H7.5A2.5 2.5 0 1 1 10 6.5V9M12 9h4.5A2.5 2.5 0 1 0 14 6.5V9" /></>,
  reports: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1.4 1.6v.09h-4V21A1.7 1.7 0 0 0 8 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 13.6H3v-4h.09A1.7 1.7 0 0 0 4.6 8a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10.4 3v-.1h4V3A1.7 1.7 0 0 0 16 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1.4h.09v4H21A1.7 1.7 0 0 0 19.4 15Z" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" /></>,
  collapse: <path d="m15 18-6-6 6-6" />,
  chevron: <path d="m9 18 6-6-6-6" />,
};

export function AdminIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name] || ICON_PATHS.home}
    </svg>
  );
}

const getRoleLabel = (role) => {
  if (role === 'branch_admin') return 'Administrador de sucursal';
  if (role === 'operator') return 'Operador';
  return 'Administrador maestro';
};

const getInitials = (value = '') => {
  const cleanValue = String(value || 'Admin').trim();
  return cleanValue.slice(0, 2).toUpperCase();
};

export default function MerchantAdminShell({
  activeView,
  branch,
  children,
  collapsed,
  navItems,
  onCollapsedChange,
  onCreateOrder,
  onLogout,
  onNavigate,
  role,
  stats,
  title,
  username,
}) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const commandInputRef = useRef(null);
  const deferredQuery = useDeferredValue(commandQuery);
  const contextName = branch?.name || 'Todas las sucursales';
  const contextDetail = branch?.id ? 'Contexto asignado por permisos' : 'Vista corporativa';

  const filteredNavigation = useMemo(() => {
    const query = deferredQuery.trim().toLowerCase();
    if (!query) return navItems;
    return navItems.filter((item) => `${item.label} ${item.description || ''}`.toLowerCase().includes(query));
  }, [deferredQuery, navItems]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeView]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen((current) => !current);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMobileNavOpen(false);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!commandOpen) return undefined;
    const frame = window.requestAnimationFrame(() => commandInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [commandOpen]);

  const selectView = (viewId) => {
    onNavigate(viewId);
    setCommandOpen(false);
    setCommandQuery('');
  };

  const mobileItems = navItems.filter((item) => ['home', 'lista', 'cocina', 'tienda_virtual'].includes(item.id)).slice(0, 4);

  return (
    <div className={`merchant-admin-shell${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className={`merchant-sidebar-scrim${mobileNavOpen ? ' is-visible' : ''}`}
        onClick={() => setMobileNavOpen(false)}
        aria-label="Cerrar navegación"
      />

      <aside className={`merchant-sidebar${mobileNavOpen ? ' is-open' : ''}`} aria-label="Navegación principal">
        <div className="merchant-brand">
          <span className="merchant-brand-mark"><img src={BRAND_LOGO_PATH} alt="" /></span>
          <span className="merchant-brand-copy"><strong>AdminTV</strong><small>San Martín</small></span>
          <button type="button" className="merchant-mobile-close" onClick={() => setMobileNavOpen(false)} aria-label="Cerrar navegación"><AdminIcon name="close" /></button>
        </div>

        <div className="merchant-store-context" title={contextName}>
          <span className="merchant-store-avatar">SM</span>
          <span className="merchant-store-copy"><small>Alcance operativo</small><strong>{contextName}</strong><em>{contextDetail}</em></span>
        </div>

        <nav className="merchant-nav">
          {navItems.map((item, index) => {
            const previousGroup = navItems[index - 1]?.group;
            const showGroup = !previousGroup || previousGroup !== item.group;
            return (
              <React.Fragment key={item.id}>
                {showGroup && <span className="merchant-nav-group">{item.group}</span>}
                <button
                  type="button"
                  className={`merchant-nav-item${activeView === item.id ? ' is-active' : ''}`}
                  onClick={() => selectView(item.id)}
                  aria-current={activeView === item.id ? 'page' : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="merchant-nav-icon"><AdminIcon name={item.icon} /></span>
                  <span className="merchant-nav-copy"><strong>{item.label}</strong>{item.description && <small>{item.description}</small>}</span>
                  {item.badge ? <span className="merchant-nav-badge">{item.badge}</span> : null}
                </button>
              </React.Fragment>
            );
          })}
        </nav>

        <div className="merchant-sidebar-footer">
          <div className="merchant-user-card">
            <span className="merchant-user-avatar">{getInitials(username)}</span>
            <span className="merchant-user-copy"><strong>{username || 'Administrador'}</strong><small>{getRoleLabel(role)}</small></span>
            <button type="button" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión"><AdminIcon name="logout" /></button>
          </div>
          <button type="button" className="merchant-collapse" onClick={() => onCollapsedChange(!collapsed)} aria-label={collapsed ? 'Expandir navegación' : 'Contraer navegación'}>
            <AdminIcon name="collapse" />
            <span>Contraer</span>
          </button>
        </div>
      </aside>

      <div className="merchant-workspace">
        <header className="merchant-topbar">
          <div className="merchant-topbar-title">
            <button type="button" className="merchant-menu-button" onClick={() => setMobileNavOpen(true)} aria-label="Abrir navegación"><AdminIcon name="menu" /></button>
            <span><small>AdminTV</small><strong>{title}</strong></span>
          </div>

          <div className="merchant-topbar-actions">
            <span className="merchant-topbar-context"><small>Sucursal</small><strong>{contextName}</strong></span>
            <button type="button" className="merchant-command-button" onClick={() => setCommandOpen(true)}>
              <AdminIcon name="search" />
              <span>Buscar módulo</span>
              <kbd>Ctrl K</kbd>
            </button>
            <span className="merchant-live-status"><i />Sesión activa</span>
            <button type="button" className="merchant-notification-button" onClick={() => selectView('lista')} aria-label={`${stats.pendientes || 0} pedidos pendientes`}>
              <AdminIcon name="bell" />
              {stats.pendientes > 0 && <span>{stats.pendientes}</span>}
            </button>
            <button type="button" className="merchant-create-button" onClick={onCreateOrder}><AdminIcon name="plus" /><span>Nuevo pedido</span></button>
          </div>
        </header>

        <main className="merchant-content">{children}</main>
      </div>

      <nav className="merchant-mobile-nav" aria-label="Navegación móvil">
        {mobileItems.map((item) => (
          <button key={item.id} type="button" className={activeView === item.id ? 'is-active' : ''} onClick={() => selectView(item.id)}>
            <AdminIcon name={item.icon} />
            <span>{item.mobileLabel || item.label}</span>
          </button>
        ))}
        <button type="button" className={mobileNavOpen ? 'is-active' : ''} onClick={() => setMobileNavOpen(true)}><AdminIcon name="menu" /><span>Más</span></button>
      </nav>

      {commandOpen && (
        <div className="merchant-command-overlay" role="presentation" onMouseDown={() => setCommandOpen(false)}>
          <section className="merchant-command-panel" role="dialog" aria-modal="true" aria-label="Buscar en AdminTV" onMouseDown={(event) => event.stopPropagation()}>
            <div className="merchant-command-search"><AdminIcon name="search" /><input ref={commandInputRef} value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Buscar módulos y herramientas" aria-label="Buscar módulos y herramientas" /><button type="button" onClick={() => setCommandOpen(false)} aria-label="Cerrar búsqueda"><AdminIcon name="close" /></button></div>
            <div className="merchant-command-results">
              {filteredNavigation.map((item) => (
                <button type="button" key={item.id} onClick={() => selectView(item.id)}><span className="merchant-nav-icon"><AdminIcon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><AdminIcon name="chevron" size={16} /></button>
              ))}
              {filteredNavigation.length === 0 && <div className="merchant-command-empty">No encontramos un módulo con ese nombre.</div>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
