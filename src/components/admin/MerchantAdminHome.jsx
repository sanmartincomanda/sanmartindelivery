import React, { useMemo } from 'react';
import { formatOrderNumber, isPickupOrder } from '../../services/orders';
import { AdminIcon } from './MerchantAdminShell';

const normalizeStatus = (value = '') => String(value || 'Pendiente').trim().toLowerCase();

const STATUS_COLUMNS = [
  { id: 'pending', label: 'Nuevos', match: (status) => status === 'pendiente', tone: 'blue' },
  { id: 'preparing', label: 'En preparación', match: (status) => status === 'en preparación' || status === 'en preparacion', tone: 'amber' },
  { id: 'ready', label: 'Listos', match: (status) => status === 'preparado' || status === 'listo', tone: 'green' },
];

const getOrderTime = (order = {}) => order.timestampIngreso || order.hora || order.timestampPreparacion || 'Sin hora';

export default function MerchantAdminHome({ branch, navItems, onNavigate, orders = [], role, stats }) {
  const columns = useMemo(
    () => STATUS_COLUMNS.map((column) => ({
      ...column,
      orders: orders.filter((order) => column.match(normalizeStatus(order.estado))).slice(0, 4),
    })),
    [orders]
  );

  const metricItems = [
    { label: 'Pedidos hoy', value: stats.total, icon: 'orders', tone: 'blue', helper: 'Operación del día' },
    { label: 'Pendientes', value: stats.pendientes, icon: 'bell', tone: 'red', helper: 'Requieren atención' },
    { label: 'En preparación', value: stats.preparando, icon: 'kitchen', tone: 'amber', helper: 'En cocina' },
    { label: 'Listos', value: stats.listos, icon: 'catalog', tone: 'green', helper: 'Para entregar' },
  ];

  const quickActions = [
    { id: 'ingreso', label: 'Nuevo pedido', description: 'Tomar pedido por teléfono o WhatsApp', icon: 'plus' },
    { id: 'lista', label: 'Ver pedidos', description: 'Consultar estados y entregas', icon: 'orders' },
    { id: 'cocina', label: 'Abrir cocina', description: 'Revisar preparación', icon: 'kitchen' },
    { id: 'tienda_virtual', label: 'Revisar tienda', description: 'Administrar el storefront', icon: 'store' },
  ];

  const availableIds = new Set(navItems.map((item) => item.id));

  return (
    <div className="merchant-home">
      <section className="merchant-home-heading">
        <div>
          <span className="merchant-eyebrow">Centro de operación</span>
          <h1>Resumen de hoy</h1>
          <p>{branch?.name ? `Operación de ${branch.name}` : 'Vista consolidada de las sucursales autorizadas para tu cuenta'}.</p>
        </div>
        <div className="merchant-home-date"><small>Fecha operativa</small><strong>{new Date().toLocaleDateString('es-NI', { weekday: 'long', day: 'numeric', month: 'long' })}</strong></div>
      </section>

      <section className="merchant-metrics" aria-label="Indicadores operativos">
        {metricItems.map((item) => (
          <article className={`merchant-metric tone-${item.tone}`} key={item.label}>
            <span className="merchant-metric-icon"><AdminIcon name={item.icon} /></span>
            <span><small>{item.label}</small><strong>{item.value}</strong><em>{item.helper}</em></span>
          </article>
        ))}
      </section>

      <div className="merchant-home-grid">
        <section className="merchant-operation-board">
          <div className="merchant-section-heading">
            <div><span className="merchant-eyebrow">Flujo actual</span><h2>Operación de pedidos</h2></div>
            <button type="button" onClick={() => onNavigate('lista')}>Ver todos <AdminIcon name="chevron" size={16} /></button>
          </div>
          <div className="merchant-board-columns">
            {columns.map((column) => (
              <div className={`merchant-board-column tone-${column.tone}`} key={column.id}>
                <header><span><i />{column.label}</span><strong>{column.orders.length}</strong></header>
                <div className="merchant-board-orders">
                  {column.orders.map((order) => (
                    <button type="button" key={order.firebaseKey || order.id} onClick={() => onNavigate('lista')}>
                      <span><strong>#{formatOrderNumber(order)}</strong><small>{getOrderTime(order)}</small></span>
                      <span><strong>{order.cliente || 'Cliente sin nombre'}</strong><small>{isPickupOrder(order) ? 'Retiro' : 'Delivery'} · {(order.items || []).length || 'Pedido'} artículos</small></span>
                    </button>
                  ))}
                  {column.orders.length === 0 && <div className="merchant-board-empty"><span>No hay pedidos</span><small>Los nuevos movimientos aparecerán aquí.</small></div>}
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="merchant-home-side">
          <section className="merchant-quick-actions">
            <div className="merchant-section-heading"><div><span className="merchant-eyebrow">Accesos</span><h2>Acciones rápidas</h2></div></div>
            <div>
              {quickActions.filter((item) => item.id === 'ingreso' || availableIds.has(item.id)).map((item) => (
                <button type="button" key={item.id} onClick={() => onNavigate(item.id)}><span className="merchant-quick-icon"><AdminIcon name={item.icon} /></span><span><strong>{item.label}</strong><small>{item.description}</small></span><AdminIcon name="chevron" size={16} /></button>
              ))}
            </div>
          </section>

          <section className="merchant-readiness">
            <div className="merchant-section-heading"><div><span className="merchant-eyebrow">Contexto</span><h2>Estado de acceso</h2></div></div>
            <ul>
              <li><span><i className="is-ok" />Sesión administrativa</span><strong>Activa</strong></li>
              <li><span><i className="is-ok" />Pedidos sincronizados</span><strong>{orders.length} hoy</strong></li>
              <li><span><i className="is-info" />Alcance de datos</span><strong>{branch?.name || 'Corporativo'}</strong></li>
              <li><span><i className="is-info" />Rol operativo</span><strong>{role === 'branch_admin' ? 'Sucursal' : role === 'operator' ? 'Operador' : 'Maestro'}</strong></li>
            </ul>
            <p>El estado de publicación, horarios y servicios se consulta dentro de Tienda Virtual; no se simulan datos que no estén cargados.</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
