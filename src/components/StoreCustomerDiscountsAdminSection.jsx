import React, { useDeferredValue, useMemo, useState } from 'react';
import { saveStoreCustomerDiscount } from '../services/storeCustomerDiscounts';
import { normalizeStoreCustomerDiscount } from '../services/storeDiscounts';

const normalizeSearchText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const buildCustomerSearchText = (customer = {}) =>
  normalizeSearchText(
    [
      customer?.nombre,
      customer?.email,
      customer?.telefono,
      customer?.codigo,
      customer?.key,
    ].join(' ')
  );

export default function StoreCustomerDiscountsAdminSection({ storeUsers = [] }) {
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [percent, setPercent] = useState('10');
  const [label, setLabel] = useState('Descuento especial');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const deferredSearch = useDeferredValue(search);

  const customers = useMemo(
    () =>
      [...(Array.isArray(storeUsers) ? storeUsers : [])].sort((left, right) => {
        const leftDiscount = normalizeStoreCustomerDiscount(left?.customerDiscount);
        const rightDiscount = normalizeStoreCustomerDiscount(right?.customerDiscount);
        if (leftDiscount.active !== rightDiscount.active) {
          return rightDiscount.active ? 1 : -1;
        }
        return String(left?.nombre || '').localeCompare(String(right?.nombre || ''), 'es');
      }),
    [storeUsers]
  );
  const activeCount = useMemo(
    () =>
      customers.filter(
        (customer) => normalizeStoreCustomerDiscount(customer?.customerDiscount).active
      ).length,
    [customers]
  );
  const filteredCustomers = useMemo(() => {
    const cleanSearch = normalizeSearchText(deferredSearch);
    if (!cleanSearch) {
      return customers.slice(0, 40);
    }
    return customers
      .filter((customer) => buildCustomerSearchText(customer).includes(cleanSearch))
      .slice(0, 40);
  }, [customers, deferredSearch]);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer?.key || '') === selectedKey) || null,
    [customers, selectedKey]
  );

  const selectCustomer = (customer) => {
    const discount = normalizeStoreCustomerDiscount(customer?.customerDiscount);
    setSelectedKey(String(customer?.key || ''));
    setPercent(String(discount.percent || 10));
    setLabel(discount.label || 'Descuento especial');
    setActive(discount.active || !discount.percent);
    setMessage('');
  };

  const saveDiscount = async () => {
    const numericPercent = Number(percent || 0);
    if (!selectedCustomer) {
      setMessage('Selecciona un cliente.');
      return;
    }
    if (!Number.isFinite(numericPercent) || numericPercent < 0 || numericPercent > 100) {
      setMessage('El porcentaje debe estar entre 0 y 100.');
      return;
    }

    setSaving(true);
    setMessage('Guardando descuento...');
    try {
      await saveStoreCustomerDiscount({
        userKey: selectedCustomer.key,
        active: active && numericPercent > 0,
        percent: numericPercent,
        label,
      });
      setMessage(
        active && numericPercent > 0
          ? `Descuento permanente de ${numericPercent}% guardado para ${selectedCustomer.nombre}.`
          : `Descuento permanente desactivado para ${selectedCustomer.nombre}.`
      );
    } catch (error) {
      console.error('No se pudo guardar el descuento del cliente:', error);
      setMessage(error?.message || 'No se pudo guardar el descuento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section style={{ display: 'grid', gap: 18 }}>
      <div className="cfg-card" style={{ display: 'grid', gap: 12 }}>
        <div>
          <strong style={{ fontSize: '1.1rem' }}>Descuentos permanentes por cliente</strong>
          <p style={{ margin: '6px 0 0', color: '#64748b' }}>
            El carrito compara promociones, cupones y este descuento. Siempre aplica solo el ahorro mayor.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span className="cfg-pill">{activeCount} clientes con descuento activo</span>
          <span className="cfg-pill">{customers.length} clientes registrados</span>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) minmax(320px, 0.85fr)',
          gap: 18,
          alignItems: 'start',
        }}
        className="store-customer-discounts-layout"
      >
        <div className="cfg-card" style={{ display: 'grid', gap: 12 }}>
          <label className="cfg-field">
            <span>Buscar cliente</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nombre, correo, telefono o codigo"
            />
          </label>
          <div style={{ display: 'grid', gap: 8, maxHeight: 560, overflow: 'auto' }}>
            {filteredCustomers.map((customer) => {
              const discount = normalizeStoreCustomerDiscount(customer?.customerDiscount);
              const selected = selectedKey === String(customer?.key || '');
              return (
                <button
                  key={customer.key}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  style={{
                    display: 'grid',
                    gap: 4,
                    padding: 12,
                    borderRadius: 14,
                    border: selected ? '2px solid #1261a6' : '1px solid #dbe5ef',
                    background: selected ? '#eef7ff' : '#fff',
                    color: '#102a43',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <strong>{customer.nombre || 'Cliente sin nombre'}</strong>
                    {discount.active && (
                      <b style={{ color: '#0f766e' }}>{discount.percent}% activo</b>
                    )}
                  </span>
                  <span style={{ color: '#64748b', fontSize: 13 }}>
                    {customer.email || 'Sin correo'} | {customer.telefono || 'Sin telefono'}
                  </span>
                  <span style={{ color: '#64748b', fontSize: 12 }}>
                    {customer.codigo || customer.key}
                  </span>
                </button>
              );
            })}
            {filteredCustomers.length === 0 && (
              <p style={{ margin: 0, color: '#64748b' }}>No encontramos clientes con esa busqueda.</p>
            )}
          </div>
        </div>

        <div className="cfg-card" style={{ display: 'grid', gap: 14, position: 'sticky', top: 16 }}>
          <div>
            <span style={{ color: '#64748b', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
              Cliente seleccionado
            </span>
            <h3 style={{ margin: '5px 0 2px' }}>
              {selectedCustomer?.nombre || 'Selecciona un cliente'}
            </h3>
            {selectedCustomer && (
              <p style={{ margin: 0, color: '#64748b' }}>{selectedCustomer.email}</p>
            )}
          </div>
          <label className="cfg-field">
            <span>Porcentaje permanente</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              inputMode="decimal"
              value={percent}
              onChange={(event) => setPercent(event.target.value)}
              disabled={!selectedCustomer}
            />
          </label>
          <label className="cfg-field">
            <span>Nombre visible del beneficio</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Descuento especial"
              disabled={!selectedCustomer}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 800 }}>
            <input
              type="checkbox"
              checked={active}
              onChange={(event) => setActive(event.target.checked)}
              disabled={!selectedCustomer}
            />
            Descuento activo
          </label>
          <button
            type="button"
            className="cfg-primary"
            onClick={saveDiscount}
            disabled={!selectedCustomer || saving}
          >
            {saving ? 'Guardando...' : 'Guardar descuento'}
          </button>
          {message && (
            <p style={{ margin: 0, color: message.includes('guardado') ? '#166534' : '#475569' }}>
              {message}
            </p>
          )}
        </div>
      </div>
      <style>{`
        .store-customer-discounts-layout .cfg-card,
        section > .cfg-card {
          background: #ffffff;
          border: 1px solid #dbe5ef;
          border-radius: 18px;
          padding: 18px;
          box-shadow: 0 12px 30px rgba(15, 45, 75, 0.06);
        }
        .store-customer-discounts-layout .cfg-field {
          display: grid;
          gap: 7px;
          color: #15324f;
          font-weight: 800;
        }
        .store-customer-discounts-layout .cfg-field input {
          min-height: 44px;
          border: 1px solid #cbd9e7;
          border-radius: 12px;
          padding: 0 12px;
          font: inherit;
          color: #102a43;
          background: #ffffff;
        }
        .store-customer-discounts-layout .cfg-primary {
          min-height: 46px;
          border: 0;
          border-radius: 13px;
          padding: 0 18px;
          background: linear-gradient(135deg, #0b3b68, #2589df);
          color: #ffffff;
          font-weight: 900;
          cursor: pointer;
        }
        .store-customer-discounts-layout .cfg-primary:disabled {
          cursor: not-allowed;
          opacity: 0.5;
        }
        section > .cfg-card .cfg-pill {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          background: #eef7ff;
          color: #0b4f88;
          font-size: 0.82rem;
          font-weight: 900;
        }
        @media (max-width: 800px) {
          .store-customer-discounts-layout {
            grid-template-columns: 1fr !important;
          }
          .store-customer-discounts-layout > .cfg-card:last-child {
            position: static !important;
          }
        }
      `}</style>
    </section>
  );
}
