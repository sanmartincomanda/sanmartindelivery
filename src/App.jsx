import React, { useState, useEffect, useMemo } from 'react';
import { ref, onValue, push, update } from 'firebase/database';
import { database } from './firebase';
import logo from './logo.svg';
import './App.css';

import { hoyISO } from './components/Utils';
import OrderForm from './components/OrderForm';
import KitchenView from './components/KitchenView';
import ListaPedidos from './components/ListaPedidos';
import BaseDatosView from './components/BaseDatosView';

const Icons = {
  plus: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>,
  chef: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 4h12M6 4v16a2 2 0 002 2h8a2 2 0 002-2V4M6 4L4 2m16 2l2-2M12 14v6m-4-4l4 4 4-4"/></svg>,
  list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  database: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
};

function App() {
  const [orders, setOrders] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [view, setView] = useState('ingreso');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, pendientes: 0, preparando: 0 });

  // ✅ OPTIMIZACIÓN 1: Solo escuchamos cambios del día actual, no todo el historial
  useEffect(() => {
    const today = hoyISO();
    const ordersRef = ref(database, 'orders');
    
    const unsubscribe = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val();
      
      if (!data) {
        setOrders([]);
        setStats({ total: 0, pendientes: 0, preparando: 0 });
        setLoading(false);
        return;
      }

      // Procesamos solo los pedidos de hoy (mucho más rápido)
      const todayOrders = [];
      let pendientes = 0;
      let preparando = 0;

      Object.entries(data).forEach(([key, val]) => {
        if (val.fecha === today) {
          todayOrders.push({ firebaseKey: key, ...val });
          
          if (val.estado === 'Pendiente') pendientes++;
          else if (val.estado === 'En preparación') preparando++;
        }
      });

      todayOrders.sort((a, b) => (a.id || 0) - (b.id || 0));
      
      setOrders(todayOrders);
      setStats({
        total: todayOrders.length,
        pendientes,
        preparando
      });
      setLoading(false);
    }, (error) => {
      console.error('Error cargando pedidos:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []); // Solo se ejecuta una vez al montar

  // ✅ OPTIMIZACIÓN 2: Clientes en listener separado (no bloquea la UI)
  useEffect(() => {
    const clientsRef = ref(database, 'clients');
    
    const unsubscribe = onValue(clientsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) {
        setClientes([]);
        return;
      }
      
      const arr = Object.entries(data).map(([key, val]) => ({ 
        firebaseKey: key, 
        ...val 
      }));
      arr.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setClientes(arr);
    });

    return () => unsubscribe();
  }, []);

  const getNextOrderId = useMemo(() => {
    return () => (orders.reduce((max, o) => Math.max(max, o.id || 0), 0) || 0) + 1;
  }, [orders]);

  const addOrder = async ({ cliente, clienteCodigo, direccion, pedido, fecha, id, metodoPago }) => {
    try {
      await push(ref(database, 'orders'), { 
        cliente, 
        clienteCodigo, 
        direccion, 
        pedido, 
        estado: 'Pendiente', 
        metodoPago: metodoPago || 'Efectivo', 
        fecha, 
        id, 
        timestampIngreso: new Date().toLocaleTimeString(), 
        justAdded: true,
        timestamp: Date.now() // Para ordenamiento rápido
      });
    } catch (error) {
      console.error('Error agregando pedido:', error);
      alert('Error al guardar el pedido');
    }
  };

  const handleEnviarPedido = (orderId, repartidor) => {
    const order = orders.find(o => o.id === orderId);
    if (order && order.firebaseKey) {
      update(ref(database, `orders/${order.firebaseKey}`), { 
        estado: 'Enviado', 
        repartidor, 
        timestampEnviado: new Date().toLocaleTimeString(),
        timestamp: Date.now()
      });
    }
  };

  const navItems = [
    { id: 'ingreso', label: 'Nuevo Pedido', icon: Icons.plus, color: '#dc2626', short: 'Nuevo' },
    { id: 'cocina', label: 'Vista Cocina', icon: Icons.chef, color: '#f59e0b', short: 'Cocina' },
    { id: 'lista', label: 'Lista Pedidos', icon: Icons.list, color: '#3b82f6', short: 'Lista' },
    { id: 'basedatos', label: 'Base de Datos', icon: Icons.database, color: '#10b981', short: 'Datos' },
  ];

  const getViewTitle = () => {
    const item = navItems.find(n => n.id === view);
    return item ? item.label : 'Dashboard';
  };

  // Loading screen mientras carga la primera vez
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f8fafc',
        flexDirection: 'column',
        gap: '24px'
      }}>
        <div style={{
          width: '64px',
          height: '64px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}>
          <img src={logo} alt="Logo" style={{ width: '40px', height: '40px', filter: 'brightness(0) invert(1)' }} />
        </div>
        <div style={{ fontSize: '18px', fontWeight: 600, color: '#64748b' }}>
          Cargando sistema...
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

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
      `}</style>

      {/* Sidebar */}
      <aside style={{
        width: sidebarCollapsed ? '80px' : '260px',
        background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        transition: 'width 0.3s ease',
        zIndex: 1000
      }}>
        <div style={{
          padding: '24px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <img src={logo} alt="Logo" style={{ width: '28px', height: '28px', filter: 'brightness(0) invert(1)' }} />
          </div>
          {!sidebarCollapsed && (
            <div>
              <div style={{ fontSize: '16px', fontWeight: 800 }}>San Martín</div>
              <div style={{ fontSize: '11px', opacity: 0.6 }}>Delivery</div>
            </div>
          )}
        </div>

        <nav style={{ flex: 1, padding: '12px 0' }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              style={{
                width: '100%',
                padding: sidebarCollapsed ? '16px' : '14px 20px',
                margin: '4px 0',
                border: 'none',
                background: view === item.id ? 'rgba(255,255,255,0.1)' : 'transparent',
                color: view === item.id ? item.color : 'rgba(255,255,255,0.7)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                fontSize: '14px',
                fontWeight: view === item.id ? 700 : 600,
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                borderLeft: view === item.id ? `3px solid ${item.color}` : '3px solid transparent',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ 
                width: '36px', 
                height: '36px', 
                borderRadius: '8px',
                background: view === item.id ? `${item.color}20` : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {item.icon}
              </span>
              {!sidebarCollapsed && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            padding: '16px 20px',
            border: 'none',
            background: 'rgba(255,255,255,0.05)',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
            gap: '12px',
            fontSize: '12px',
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <span style={{ transform: sidebarCollapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}>
            ←
          </span>
          {!sidebarCollapsed && <span>Colapsar</span>}
        </button>
      </aside>

      {/* Main Content */}
      <main style={{
        flex: 1,
        marginLeft: sidebarCollapsed ? '80px' : '260px',
        transition: 'margin-left 0.3s ease',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <header style={{
          height: '64px',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: '20px', 
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

          <div style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
            {/* Stats */}
            <div style={{ display: 'flex', gap: '24px' }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Hoy
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e293b' }}>
                  {stats.total}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Pendientes
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#f59e0b' }}>
                  {stats.pendientes}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase' }}>
                  Cocina
                </div>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#3b82f6' }}>
                  {stats.preparando}
                </div>
              </div>
            </div>

            <div style={{ width: '1px', height: '32px', background: '#e2e8f0' }} />

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                {new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="animate-fadeIn" style={{ flex: 1 }}>
          {view === 'ingreso' && (
            <OrderForm 
              onAddOrder={addOrder} 
              nextOrderId={getNextOrderId()} 
              clientes={clientes} 
            />
          )}
          {view === 'cocina' && <KitchenView orders={orders} />}
          {view === 'lista' && (
            <ListaPedidos 
              pedidos={orders} 
              onEnviarPedido={handleEnviarPedido} 
            />
          )}
          {view === 'basedatos' && (
            <BaseDatosView clientes={clientes} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;