import React, { useState, useEffect } from 'react';
import { ref, push, onValue, update, set } from 'firebase/database';
import { database } from './firebase';
import logo from './logo.svg';
import './App.css';

// Componentes
import { hoyISO } from './components/Utils';
import OrderForm from './components/OrderForm';
import KitchenView from './components/KitchenView';
import ListaPedidos from './components/ListaPedidos';
import BaseDatosView from './components/BaseDatosView';

// Iconos SVG
const Icons = {
  plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  chef: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12M6 4v16a2 2 0 002 2h8a2 2 0 002-2V4M6 4L4 2m16 2l2-2M12 14v6m-4-4l4 4 4-4"/></svg>,
  list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  database: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>,
  logout: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9"/></svg>
};

function App() {
  const [orders, setOrders] = useState([]);
  const [anteriores, setAnteriores] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [view, setView] = useState('ingreso');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    const today = hoyISO();
    const ordersRef = ref(database, 'orders');
    onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const grouped = Object.entries(data).reduce((acc, [key, val]) => {
          const f = val.fecha; 
          if (!acc[f]) acc[f] = [];
          acc[f].push({ firebaseKey: key, ...val }); 
          return acc;
        }, {});
        setOrders((grouped[today] || []).sort((a, b) => (a.id || 0) - (b.id || 0)));
        setAnteriores(Object.entries(grouped)
          .filter(([f]) => f !== today)
          .flatMap(([f, arr]) => arr.map((p, idx) => ({ ...p, fecha: f, id: p.id || idx + 1 })))
        );
      } else { 
        setOrders([]); 
        setAnteriores([]); 
      }
    });
  }, []);

  useEffect(() => {
    const clientsRef = ref(database, 'clients');
    onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) { setClientes([]); return; }
      const arr = Object.entries(data).map(([key, val]) => ({ firebaseKey: key, ...val }));
      arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setClientes(arr);
    });
  }, []);

  const getNextOrderId = () => (orders.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0) + 1;

  const addOrder = ({ cliente, clienteCodigo, direccion, pedido, fecha, id, metodoPago }) => {
    push(ref(database, 'orders'), { 
      cliente, 
      clienteCodigo, 
      direccion, 
      pedido, 
      estado: 'Pendiente', 
      metodoPago: metodoPago || 'Efectivo', 
      fecha, 
      id, 
      timestampIngreso: new Date().toLocaleTimeString(), 
      justAdded: true 
    });
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find(o => o.id === orderId);
    if (order) {
      update(ref(database, `orders/${order.firebaseKey}`), { 
        estado: 'Enviado', 
        repartidor, 
        timestampEnviado: new Date().toLocaleTimeString() 
      });
    }
  };

  const navItems = [
    { id: 'ingreso', label: 'Nuevo Pedido', icon: Icons.plus, color: '#dc2626' },
    { id: 'cocina', label: 'Vista Cocina', icon: Icons.chef, color: '#f59e0b' },
    { id: 'lista', label: 'Lista Pedidos', icon: Icons.list, color: '#3b82f6' },
    { id: 'basedatos', label: 'Base de Datos', icon: Icons.database, color: '#10b981' },
  ];

  const getViewTitle = () => {
    const item = navItems.find(n => n.id === view);
    return item ? item.label : 'Dashboard';
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#f8fafc',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(-10px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-slideIn { animation: slideIn 0.3s ease-out; }
        .animate-fadeIn { animation: fadeIn 0.3s ease-out; }
        .nav-item { transition: all 0.2s ease; }
        .nav-item:hover { background: rgba(255,255,255,0.1); }
        .nav-item.active { background: rgba(255,255,255,0.15); box-shadow: inset 3px 0 0 currentColor; }
      `}</style>

      {/* Sidebar Navigation */}
      <aside style={{
        width: sidebarCollapsed ? '80px' : '280px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        transition: 'width 0.3s ease',
        zIndex: 1000
      }}>
        {/* Logo Area */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img src={logo} alt="Logo" style={{ width: '32px', height: '32px', filter: 'brightness(0) invert(1)' }} />
          </div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '-0.5px' }}>San Martín</div>
              <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: 500 }}>Delivery System</div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '16px 0', overflowY: 'auto' }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '16px' : '16px 24px',
                border: 'none',
                background: 'transparent',
                color: view === item.id ? item.color : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                fontSize: '15px',
                fontWeight: view === item.id ? 700 : 600,
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                borderLeft: view === item.id ? `4px solid ${item.color}` : '4px solid transparent'
              }}
            >
              <span style={{ 
                width: '40px', 
                height: '40px', 
                borderRadius: '10px',
                background: view === item.id ? `${item.color}20` : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {item.icon}
              </span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            padding: '20px 24px',
            border: 'none',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '16px',
            fontSize: '13px',
            fontWeight: 600,
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <span style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
            ←
          </span>
          {!sidebarCollapsed && <span>Colapsar menú</span>}
        </button>
      </aside>

      {/* Main Content Area */}
      <main style={{
        flex: 1,
        marginLeft: sidebarCollapsed ? '80px' : '280px',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Top Header */}
        <header style={{
          height: '72px',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 32px',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '24px', 
              fontWeight: 800, 
              color: '#1e293b',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: navItems.find(n => n.id === view)?.color || '#64748b'
              }} />
              {getViewTitle()}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
            {/* Stats Summary */}
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Pedidos Hoy
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#1e293b' }}>
                  {orders.length}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Pendientes
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#f59e0b' }}>
                  {orders.filter(o => o.estado === 'Pendiente').length}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  En Preparación
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#3b82f6' }}>
                  {orders.filter(o => o.estado === 'En preparación').length}
                </div>
              </div>
            </div>

            <div style={{ width: '1px', height: '40px', background: '#e2e8f0' }} />

            {/* Date Display */}
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>
                {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="animate-fadeIn" style={{ flex: 1, overflow: 'auto' }}>
          {view === 'ingreso' && (
            <OrderForm 
              onAddOrder={addOrder} 
              nextOrderId={getNextOrderId()} 
              clientes={clientes} 
            />
          )}
          {view === 'cocina' && (
            <KitchenView orders={orders} />
          )}
          {view === 'lista' && (
            <ListaPedidos 
              pedidos={orders} 
              onEnviarPedido={handleEnviarPedido} 
            />
          )}
          {view === 'basedatos' && (
            <BaseDatosView 
              clientes={clientes} 
              anteriores={anteriores} 
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;