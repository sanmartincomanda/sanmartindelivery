import React, { useEffect, useMemo, useState } from 'react';
import { formatOrderNumber } from '../services/orders';
import {
  adjustStoreRewardPoints,
  buildCustomerRewardSummary,
  DEFAULT_STORE_REWARD_SETTINGS,
  mergeStoreRewards,
  normalizeStoreRewardAccount,
  normalizeStoreRewardSettings,
  subscribeStoreRewardAccounts,
  subscribeStoreRewardSettings,
  subscribeStoreRewardTransactions,
  subscribeStoreRewards,
} from '../services/storeRewards';
import {
  getStoreWelcomeCouponEffectiveStatus,
  normalizeStoreWelcomeCoupon,
} from '../services/storeWelcomeCoupon';
import { updateStoreUserPassword } from '../services/storeUsers';
import { buildGoogleMapsAddressUrl, buildGoogleMapsPlaceUrl } from '../services/geo';

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value) => {
  const timestamp = Number(value || 0);
  if (!timestamp) {
    return 'Sin dato';
  }

  try {
    return new Intl.DateTimeFormat('es-NI', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  } catch (error) {
    return 'Sin dato';
  }
};

const formatDateOnly = (value) => {
  const timestamp = Number(value || 0);
  if (!timestamp) {
    return 'Sin dato';
  }

  try {
    return new Intl.DateTimeFormat('es-NI', {
      dateStyle: 'medium',
    }).format(new Date(timestamp));
  } catch (error) {
    return 'Sin dato';
  }
};

const formatSignedPoints = (value) => {
  const numeric = Math.trunc(Number(value || 0));
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${numeric} pts`;
};

const normalizeStatusText = (value = '') =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isDeliveredStatus = (status = '') => normalizeStatusText(status).includes('entregado');
const isCanceledStatus = (status = '') => {
  const normalized = normalizeStatusText(status);
  return normalized.includes('cancel') || normalized.includes('anulad');
};

const getTransactionTypeLabel = (transaction = {}) => {
  const type = String(transaction?.type || '').trim().toLowerCase();
  if (type === 'earned') {
    return 'Compra acreditada';
  }
  if (type === 'redeemed') {
    return 'Premio canjeado';
  }
  if (type === 'reversed') {
    return 'Reversion';
  }
  if (type === 'adjusted') {
    return 'Ajuste manual';
  }
  return 'Movimiento';
};

const getWelcomeCouponStatusLabel = (status) => {
  if (status === 'used') {
    return 'Canjeado';
  }
  if (status === 'claimed') {
    return 'Activado';
  }
  if (status === 'available') {
    return 'Disponible';
  }
  if (status === 'expired') {
    return 'Vencido';
  }
  return 'Sin cupon';
};

const getWelcomeCouponStatusTone = (status) => {
  if (status === 'used') {
    return { background: '#dcfce7', color: '#166534' };
  }
  if (status === 'claimed' || status === 'available') {
    return { background: '#dbeafe', color: '#1d4ed8' };
  }
  if (status === 'expired') {
    return { background: '#fee2e2', color: '#b91c1c' };
  }
  return { background: '#f1f5f9', color: '#475569' };
};

const getRewardStatusTone = (pointsBalance = 0) =>
  Number(pointsBalance || 0) > 0
    ? { background: '#ecfeff', color: '#0f766e' }
    : { background: '#f8fafc', color: '#64748b' };

const NEW_CUSTOMER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isNewCustomerRecord = (customer = {}, now = Date.now()) => {
  const createdAt = Number(customer?.createdAt || 0);
  if (!createdAt) {
    return false;
  }

  return createdAt >= now - NEW_CUSTOMER_WINDOW_MS;
};

const resolveOrderAmount = (order = {}) => {
  const customerTotal = Number(order?.totalActualizadoCliente || 0);
  if (customerTotal > 0) {
    return customerTotal;
  }

  const sicarTotal = Number(order?.sicarQuote?.total || 0);
  if (sicarTotal > 0 && order?.totalAproximado === false) {
    return sicarTotal;
  }

  return Number(order?.total || order?.subtotalEstimado || 0);
};

const getOrderSummaryByUser = (orders = []) => {
  const summary = new Map();

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const userKey = String(order?.storeUserKey || '').trim();
    if (!userKey) {
      return;
    }

    if (!summary.has(userKey)) {
      summary.set(userKey, {
        orders: [],
        totalOrders: 0,
        deliveredOrders: 0,
        canceledOrders: 0,
        pickupOrders: 0,
        totalSpent: 0,
        lastOrderAt: 0,
        firstOrderAt: 0,
        lastOrder: null,
      });
    }

    const bucket = summary.get(userKey);
    const orderTimestamp = Number(order?.timestampIngresoMs || order?.timestamp || 0);
    const amount = resolveOrderAmount(order);

    bucket.orders.push(order);
    bucket.totalOrders += 1;
    bucket.totalSpent += amount;
    if (isDeliveredStatus(order?.estado)) {
      bucket.deliveredOrders += 1;
    }
    if (isCanceledStatus(order?.estado)) {
      bucket.canceledOrders += 1;
    }
    if (String(order?.fulfillmentType || '').trim().toLowerCase() === 'pickup') {
      bucket.pickupOrders += 1;
    }
    if (!bucket.firstOrderAt || (orderTimestamp > 0 && orderTimestamp < bucket.firstOrderAt)) {
      bucket.firstOrderAt = orderTimestamp;
    }
    if (orderTimestamp >= bucket.lastOrderAt) {
      bucket.lastOrderAt = orderTimestamp;
      bucket.lastOrder = order;
    }
  });

  summary.forEach((value) => {
    value.orders.sort(
      (left, right) =>
        Number(right?.timestampIngresoMs || right?.timestamp || 0) -
          Number(left?.timestampIngresoMs || left?.timestamp || 0) ||
        Number(right?.id || 0) - Number(left?.id || 0)
    );
  });

  return summary;
};

export default function StoreCustomersAdminSection({
  storeUsers = [],
  storeOrders = [],
}) {
  const [rewardSettings, setRewardSettings] = useState(DEFAULT_STORE_REWARD_SETTINGS);
  const [rewardMap, setRewardMap] = useState({});
  const [rewardAccountsMap, setRewardAccountsMap] = useState({});
  const [search, setSearch] = useState('');
  const [selectedUserKey, setSelectedUserKey] = useState('');
  const [selectedTransactions, setSelectedTransactions] = useState([]);
  const [passwordForm, setPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [adjustmentForm, setAdjustmentForm] = useState({ mode: 'sumar', points: '', note: '' });
  const [adjustingPoints, setAdjustingPoints] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const unsubscribeSettings = subscribeStoreRewardSettings(
      (value) => setRewardSettings(normalizeStoreRewardSettings(value, DEFAULT_STORE_REWARD_SETTINGS)),
      (error) => console.error('No se pudo cargar la configuracion de recompensas:', error)
    );
    const unsubscribeRewards = subscribeStoreRewards(
      (value) => setRewardMap(value || {}),
      (error) => console.error('No se pudieron cargar los premios del cliente:', error)
    );
    const unsubscribeAccounts = subscribeStoreRewardAccounts(
      (value) => setRewardAccountsMap(value || {}),
      (error) => console.error('No se pudieron cargar las cuentas Miembro Gold:', error)
    );

    return () => {
      unsubscribeSettings();
      unsubscribeRewards();
      unsubscribeAccounts();
    };
  }, []);

  useEffect(() => {
    if (!selectedUserKey) {
      setSelectedTransactions([]);
      return undefined;
    }

    const unsubscribe = subscribeStoreRewardTransactions(
      selectedUserKey,
      (transactions) => setSelectedTransactions(Array.isArray(transactions) ? transactions : []),
      (error) => console.error('No se pudieron cargar las transacciones del cliente:', error),
      60
    );

    return () => unsubscribe();
  }, [selectedUserKey]);

  useEffect(() => {
    setPasswordForm({ password: '', confirmPassword: '' });
    setAdjustmentForm({ mode: 'sumar', points: '', note: '' });
    setMessage('');
  }, [selectedUserKey]);

  const rewards = useMemo(() => mergeStoreRewards(rewardMap), [rewardMap]);

  const ordersByUser = useMemo(() => getOrderSummaryByUser(storeOrders), [storeOrders]);

  const customerRows = useMemo(() => {
    const now = Date.now();
    return (Array.isArray(storeUsers) ? storeUsers : [])
      .map((user) => {
        const userKey = String(user?.key || '').trim();
        const orderSummary = ordersByUser.get(userKey) || {
          orders: [],
          totalOrders: 0,
          deliveredOrders: 0,
          canceledOrders: 0,
          pickupOrders: 0,
          totalSpent: 0,
          lastOrderAt: 0,
          firstOrderAt: 0,
          lastOrder: null,
        };
        const rewardAccount = rewardAccountsMap[userKey] || normalizeStoreRewardAccount({}, userKey);
        const rewardSummary = buildCustomerRewardSummary(
          rewards,
          rewardAccount.pointsBalance,
          0,
          rewardSettings
        );
        const welcomeCoupon = normalizeStoreWelcomeCoupon(user?.welcomeCoupon);
        const welcomeCouponUsageCount = orderSummary.orders.filter(
          (order) =>
            isDeliveredStatus(order?.estado) &&
            String(order?.cupon?.code || '').trim() &&
            String(order?.cupon?.code || '').trim() === String(welcomeCoupon?.coupon?.code || '').trim()
        ).length;
        const welcomeCouponStatus = getStoreWelcomeCouponEffectiveStatus(
          welcomeCoupon,
          welcomeCouponUsageCount
        );

        return {
          ...user,
          key: userKey,
          orderSummary,
          rewardAccount,
          rewardSummary,
          welcomeCoupon,
          welcomeCouponStatus,
          welcomeCouponUsageCount,
          isNewCustomer: isNewCustomerRecord(user, now),
        };
      })
      .sort(
        (left, right) =>
          Number(right?.createdAt || 0) - Number(left?.createdAt || 0) ||
          Number(right?.updatedAt || 0) - Number(left?.updatedAt || 0) ||
          Number(right?.orderSummary?.lastOrderAt || 0) - Number(left?.orderSummary?.lastOrderAt || 0) ||
          Number(right?.rewardAccount?.pointsBalance || 0) - Number(left?.rewardAccount?.pointsBalance || 0) ||
          String(left?.nombre || '').localeCompare(String(right?.nombre || ''), 'es-NI', {
            sensitivity: 'base',
          })
      );
  }, [ordersByUser, rewardAccountsMap, rewardSettings, rewards, storeUsers]);

  const filteredCustomers = useMemo(() => {
    const queryText = String(search || '').trim().toLowerCase();
    if (!queryText) {
      return customerRows;
    }

    return customerRows.filter((customer) =>
      [
        customer.nombre,
        customer.codigo,
        customer.email,
        customer.telefono,
        customer.clientKey,
        customer.orderSummary?.lastOrder?.clienteCodigo,
      ]
        .join(' ')
        .toLowerCase()
        .includes(queryText)
    );
  }, [customerRows, search]);

  const metrics = useMemo(() => {
    return {
      total: customerRows.length,
      nuevos: customerRows.filter((customer) => customer?.isNewCustomer).length,
      conCompra: customerRows.filter((customer) => Number(customer?.orderSummary?.totalOrders || 0) > 0).length,
      conPuntos: customerRows.filter((customer) => Number(customer?.rewardAccount?.pointsBalance || 0) > 0).length,
      conCuponActivo: customerRows.filter((customer) =>
        ['available', 'claimed'].includes(customer?.welcomeCouponStatus)
      ).length,
    };
  }, [customerRows]);

  const selectedCustomer = useMemo(
    () => filteredCustomers.find((customer) => customer.key === selectedUserKey) ||
      customerRows.find((customer) => customer.key === selectedUserKey) ||
      null,
    [customerRows, filteredCustomers, selectedUserKey]
  );

  const selectedCustomerOrders = selectedCustomer?.orderSummary?.orders || [];
  const selectedCustomerLastOrder = selectedCustomer?.orderSummary?.lastOrder || null;
  const selectedMapUrl = selectedCustomer?.ubicacion
    ? buildGoogleMapsPlaceUrl(selectedCustomer.ubicacion)
    : '';
  const selectedAddressUrl = buildGoogleMapsAddressUrl(selectedCustomer?.direccion);

  const handlePasswordSave = async (event) => {
    event.preventDefault();
    if (!selectedCustomer) {
      return;
    }

    const cleanPassword = String(passwordForm.password || '').trim();
    const confirmPassword = String(passwordForm.confirmPassword || '').trim();

    if (cleanPassword.length < 6) {
      setMessage('La nueva contrasena debe tener al menos 6 caracteres.');
      return;
    }

    if (cleanPassword !== confirmPassword) {
      setMessage('Las contrasenas no coinciden.');
      return;
    }

    setSavingPassword(true);
    setMessage('');
    try {
      await updateStoreUserPassword(selectedCustomer, cleanPassword);
      setPasswordForm({ password: '', confirmPassword: '' });
      setMessage('Contrasena del cliente actualizada.');
    } catch (error) {
      console.error('No se pudo actualizar la contrasena del cliente:', error);
      setMessage('No se pudo actualizar la contrasena del cliente.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handlePointsAdjustment = async (event) => {
    event.preventDefault();
    if (!selectedCustomer) {
      return;
    }

    const rawPoints = Math.trunc(Number(adjustmentForm.points || 0));
    if (!rawPoints) {
      setMessage('Indica cuantos puntos quieres ajustar.');
      return;
    }

    const pointsDelta = adjustmentForm.mode === 'restar' ? rawPoints * -1 : rawPoints;

    setAdjustingPoints(true);
    setMessage('');
    try {
      await adjustStoreRewardPoints({
        userKey: selectedCustomer.key,
        pointsDelta,
        note: adjustmentForm.note,
        adminLabel: 'Ajuste desde Tienda Virtual / Clientes',
      });
      setAdjustmentForm({ mode: 'sumar', points: '', note: '' });
      setMessage('Saldo Miembro Gold actualizado.');
    } catch (error) {
      console.error('No se pudo ajustar el saldo Miembro Gold:', error);
      setMessage(error?.message || 'No se pudo ajustar el saldo Miembro Gold.');
    } finally {
      setAdjustingPoints(false);
    }
  };

  return (
    <section className="cfg-section-card" style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22 }}>Clientes de tienda virtual</h2>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
            Controla cada cliente desde un solo lugar: perfil, pedidos, Miembro Gold, cupones y movimientos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="cfg-badge">Clientes: {metrics.total}</span>
          <span className="cfg-badge">Nuevos 7 dias: {metrics.nuevos}</span>
          <span className="cfg-badge">Con compra: {metrics.conCompra}</span>
          <span className="cfg-badge">Con puntos: {metrics.conPuntos}</span>
          <span className="cfg-badge">Cupon activo: {metrics.conCuponActivo}</span>
        </div>
      </div>

      {message && (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid #dbe3ef',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 800,
            whiteSpace: 'pre-wrap',
          }}
        >
          {message}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="cfg-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nombre, codigo, correo, telefono o cliente"
          style={{ maxWidth: 420 }}
        />
        <strong>{filteredCustomers.length} de {customerRows.length} clientes</strong>
      </div>

      {filteredCustomers.length === 0 ? (
        <div
          style={{
            padding: 26,
            borderRadius: 14,
            border: '1px dashed #cbd5e1',
            color: '#64748b',
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          No encontramos clientes con esos filtros.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredCustomers.map((customer) => {
            const rewardTone = getRewardStatusTone(customer.rewardAccount?.pointsBalance);
            const couponTone = getWelcomeCouponStatusTone(customer.welcomeCouponStatus);
            return (
              <article
                key={customer.key}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 18,
                  padding: 16,
                  background: '#fff',
                  display: 'grid',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <strong style={{ fontSize: 18 }}>{customer.nombre || 'Cliente sin nombre'}</strong>
                    <div style={{ color: '#64748b', fontWeight: 700, marginTop: 4 }}>
                      {customer.codigo || 'Sin codigo'} | {customer.telefono || 'Sin telefono'}
                    </div>
                    <div style={{ color: '#94a3b8', marginTop: 4, fontSize: 13 }}>
                      {customer.email || 'Sin correo'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {customer.isNewCustomer && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          borderRadius: 999,
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: 900,
                          background: '#fef3c7',
                          color: '#92400e',
                        }}
                      >
                        CLIENTE NUEVO
                      </span>
                    )}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 900,
                        ...rewardTone,
                      }}
                    >
                      Miembro Gold: {Math.trunc(Number(customer.rewardAccount?.pointsBalance || 0))} pts
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        borderRadius: 999,
                        padding: '6px 10px',
                        fontSize: 12,
                        fontWeight: 900,
                        ...couponTone,
                      }}
                    >
                      Cupon: {getWelcomeCouponStatusLabel(customer.welcomeCouponStatus)}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                    gap: 10,
                  }}
                >
                  <MetricCard label="Fecha ingreso" value={formatDateOnly(customer.createdAt)} />
                  <MetricCard
                    label="Ultima compra"
                    value={customer.orderSummary?.lastOrderAt ? formatDateTime(customer.orderSummary.lastOrderAt) : 'Sin compras'}
                  />
                  <MetricCard label="Pedidos" value={String(customer.orderSummary?.totalOrders || 0)} />
                  <MetricCard label="Venta acumulada" value={formatCurrency(customer.orderSummary?.totalSpent || 0)} />
                </div>

                <div style={{ color: '#475569', fontWeight: 700, lineHeight: 1.5 }}>
                  {customer.direccion || 'Sin direccion guardada'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                  <button type="button" className="cfg-button secondary" onClick={() => setSelectedUserKey(customer.key)}>
                    Ver cliente
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedCustomer && (
        <div
          className="cfg-driver-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedUserKey('');
            }
          }}
        >
          <div
            className="cfg-driver-modal"
            style={{ width: 'min(1120px, 100%)', display: 'grid', gap: 18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                  Tienda Virtual / Cliente
                </div>
                <h2 style={{ margin: '6px 0 0', fontSize: 30 }}>
                  {selectedCustomer.nombre || 'Cliente sin nombre'}
                </h2>
                <div style={{ color: '#64748b', fontWeight: 800, marginTop: 4 }}>
                  {selectedCustomer.codigo || 'Sin codigo'} | {selectedCustomer.telefono || 'Sin telefono'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'start' }}>
                {selectedCustomer.isNewCustomer && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      borderRadius: 999,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 900,
                      background: '#fef3c7',
                      color: '#92400e',
                    }}
                  >
                    CLIENTE NUEVO
                  </span>
                )}
                <span className="cfg-badge">Miembro Gold: {Math.trunc(Number(selectedCustomer.rewardAccount?.pointsBalance || 0))} pts</span>
                <button type="button" className="cfg-button secondary" onClick={() => setSelectedUserKey('')}>
                  Cerrar
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                gap: 12,
              }}
            >
              <MetricCard label="Fecha de ingreso" value={formatDateTime(selectedCustomer.createdAt)} />
              <MetricCard
                label="Ultima compra"
                value={selectedCustomer.orderSummary?.lastOrderAt ? formatDateTime(selectedCustomer.orderSummary.lastOrderAt) : 'Sin compras'}
              />
              <MetricCard label="Pedidos totales" value={String(selectedCustomer.orderSummary?.totalOrders || 0)} />
              <MetricCard label="Pedidos entregados" value={String(selectedCustomer.orderSummary?.deliveredOrders || 0)} />
              <MetricCard label="Venta acumulada" value={formatCurrency(selectedCustomer.orderSummary?.totalSpent || 0)} />
              <MetricCard
                label="Ticket promedio"
                value={formatCurrency(
                  Number(selectedCustomer.orderSummary?.totalOrders || 0) > 0
                    ? Number(selectedCustomer.orderSummary?.totalSpent || 0) /
                        Number(selectedCustomer.orderSummary?.totalOrders || 1)
                    : 0
                )}
              />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                gap: 14,
              }}
            >
              <InfoCard title="Perfil del cliente">
                <DetailLine label="Correo" value={selectedCustomer.email || 'Sin correo'} />
                <DetailLine label="Telefono" value={selectedCustomer.telefono || 'Sin telefono'} />
                <DetailLine label="Codigo cliente" value={selectedCustomer.codigo || '-'} />
                <DetailLine label="Client key" value={selectedCustomer.clientKey || '-'} />
                <DetailLine label="Auth uid" value={selectedCustomer.authUid || selectedCustomer.key || '-'} mono />
                <DetailLine label="Ultimo acceso" value={formatDateTime(selectedCustomer.lastLoginAt)} />
                <DetailLine label="Contrasena" value={selectedCustomer.hasPassword ? 'Configurada' : 'Pendiente'} />
              </InfoCard>

              <InfoCard title="Entrega y ubicacion">
                <DetailLine label="Direccion" value={selectedCustomer.direccion || 'Sin direccion'} />
                <DetailLine label="Referencia" value={selectedCustomer.referencia || 'Sin referencia'} />
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                  {selectedAddressUrl && (
                    <a href={selectedAddressUrl} target="_blank" rel="noreferrer" className="cfg-button secondary" style={{ textDecoration: 'none' }}>
                      Buscar direccion
                    </a>
                  )}
                  {selectedMapUrl && (
                    <a href={selectedMapUrl} target="_blank" rel="noreferrer" className="cfg-button secondary" style={{ textDecoration: 'none' }}>
                      Ver punto en mapa
                    </a>
                  )}
                </div>
              </InfoCard>

              <InfoCard title="Miembro Gold">
                <DetailLine label="Puntos disponibles" value={`${Math.trunc(Number(selectedCustomer.rewardAccount?.pointsBalance || 0))} pts`} />
                <DetailLine label="Puntos ganados" value={`${Math.trunc(Number(selectedCustomer.rewardAccount?.lifetimePointsEarned || 0))} pts`} />
                <DetailLine label="Puntos canjeados" value={`${Math.trunc(Number(selectedCustomer.rewardAccount?.lifetimePointsRedeemed || 0))} pts`} />
                <DetailLine
                  label="Premio actual"
                  value={selectedCustomer.rewardSummary?.bestReward?.name || 'Aun no desbloquea premio'}
                />
                <DetailLine
                  label="Siguiente premio"
                  value={selectedCustomer.rewardSummary?.closestReward?.name || 'Sin programa activo'}
                />
              </InfoCard>

              <InfoCard title="Cupon de bienvenida">
                <DetailLine label="Estado" value={getWelcomeCouponStatusLabel(selectedCustomer.welcomeCouponStatus)} />
                <DetailLine label="Codigo" value={selectedCustomer.welcomeCoupon?.coupon?.code || '-'} />
                <DetailLine
                  label="Vencimiento"
                  value={selectedCustomer.welcomeCoupon?.expiresAt ? formatDateTime(selectedCustomer.welcomeCoupon.expiresAt) : 'Sin vigencia'}
                />
                <DetailLine
                  label="Veces usado"
                  value={String(selectedCustomer.welcomeCouponUsageCount || 0)}
                />
              </InfoCard>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 14,
              }}
            >
              <form
                onSubmit={handlePasswordSave}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 14,
                  background: '#fff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 18 }}>Cambiar contrasena</strong>
                <input
                  className="cfg-input"
                  type="password"
                  value={passwordForm.password}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Nueva contrasena"
                />
                <input
                  className="cfg-input"
                  type="password"
                  value={passwordForm.confirmPassword}
                  onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  placeholder="Confirmar contrasena"
                />
                <button type="submit" className="cfg-button" disabled={savingPassword}>
                  {savingPassword ? 'Guardando...' : 'Guardar contrasena'}
                </button>
              </form>

              <form
                onSubmit={handlePointsAdjustment}
                style={{
                  border: '1px solid #e2e8f0',
                  borderRadius: 14,
                  padding: 14,
                  background: '#fff',
                  display: 'grid',
                  gap: 10,
                }}
              >
                <strong style={{ fontSize: 18 }}>Ajustar Miembro Gold</strong>
                <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0, 1fr)', gap: 10 }}>
                  <select
                    className="cfg-select"
                    value={adjustmentForm.mode}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({ ...current, mode: event.target.value }))
                    }
                  >
                    <option value="sumar">Sumar puntos</option>
                    <option value="restar">Restar puntos</option>
                  </select>
                  <input
                    className="cfg-input"
                    type="number"
                    min="1"
                    value={adjustmentForm.points}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({ ...current, points: event.target.value }))
                    }
                    placeholder="Cantidad de puntos"
                  />
                </div>
                <textarea
                  className="cfg-textarea"
                  value={adjustmentForm.note}
                  onChange={(event) => setAdjustmentForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Motivo del ajuste"
                />
                <button type="submit" className="cfg-button" disabled={adjustingPoints}>
                  {adjustingPoints ? 'Aplicando...' : 'Guardar ajuste'}
                </button>
              </form>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: 14,
              }}
            >
              <InfoCard title="Resumen comercial">
                <DetailLine
                  label="Ultimo pedido"
                  value={
                    selectedCustomerLastOrder
                      ? `#${formatOrderNumber(selectedCustomerLastOrder.id)} | ${formatDateTime(selectedCustomerLastOrder.timestampIngresoMs || selectedCustomerLastOrder.timestamp)}`
                      : 'Sin pedidos'
                  }
                />
                <DetailLine
                  label="Estado ultimo pedido"
                  value={selectedCustomerLastOrder?.estado || 'Sin pedidos'}
                />
                <DetailLine
                  label="Metodo de pago ultimo pedido"
                  value={selectedCustomerLastOrder?.metodoPago || 'Sin dato'}
                />
                <DetailLine
                  label="Pickup"
                  value={`${Math.trunc(Number(selectedCustomer.orderSummary?.pickupOrders || 0))}`}
                />
              </InfoCard>

              <InfoCard title="Movimientos recientes de puntos">
                {selectedTransactions.length === 0 ? (
                  <div style={{ color: '#64748b', fontWeight: 700 }}>
                    Este cliente todavia no tiene movimientos Miembro Gold.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {selectedTransactions.slice(0, 8).map((transaction) => (
                      <div
                        key={transaction.id}
                        style={{
                          border: '1px solid #edf2f7',
                          borderRadius: 12,
                          padding: 12,
                          display: 'grid',
                          gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <strong>{getTransactionTypeLabel(transaction)}</strong>
                          <strong>{formatSignedPoints(transaction.points)}</strong>
                        </div>
                        <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>
                          {formatDateTime(transaction.createdAt)}
                        </div>
                        <div style={{ color: '#475569', fontWeight: 700 }}>
                          Saldo: {Math.trunc(Number(transaction.balanceBefore || 0))} pts {'->'} {Math.trunc(Number(transaction.balanceAfter || 0))} pts
                        </div>
                        {transaction.note && (
                          <div style={{ color: '#334155', whiteSpace: 'pre-wrap' }}>{transaction.note}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </InfoCard>
            </div>

            <InfoCard title="Pedidos del cliente">
              {selectedCustomerOrders.length === 0 ? (
                <div style={{ color: '#64748b', fontWeight: 700 }}>
                  Este cliente aun no tiene pedidos en tienda virtual.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {selectedCustomerOrders.slice(0, 12).map((order) => (
                    <div
                      key={order.firebaseKey}
                      style={{
                        border: '1px solid #edf2f7',
                        borderRadius: 12,
                        padding: 12,
                        display: 'grid',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                        <strong>
                          Pedido #{formatOrderNumber(order.id)} | {order.estado || 'Pendiente'}
                        </strong>
                        <strong>{formatCurrency(resolveOrderAmount(order))}</strong>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>
                        {formatDateTime(order.timestampIngresoMs || order.timestamp)} | {order.metodoPago || 'Sin pago'}
                      </div>
                      <div style={{ color: '#475569', fontWeight: 700 }}>
                        {order.direccion || 'Sin direccion'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {String(order?.cupon?.code || '').trim() && (
                          <span className="cfg-badge">Cupon {order.cupon.code}</span>
                        )}
                        {String(order?.rewardRedemption?.rewardName || '').trim() && (
                          <span className="cfg-badge">Premio {order.rewardRedemption.rewardName}</span>
                        )}
                        {String(order?.fulfillmentLabel || '').trim() && (
                          <span className="cfg-badge">{order.fulfillmentLabel}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>
        </div>
      )}
    </section>
  );
}

function MetricCard({ label, value }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        padding: 12,
        background: '#f8fafc',
      }}
    >
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function InfoCard({ title, children }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: 14,
        background: '#fff',
        display: 'grid',
        gap: 10,
      }}
    >
      <strong style={{ fontSize: 18 }}>{title}</strong>
      <div style={{ display: 'grid', gap: 8 }}>{children}</div>
    </div>
  );
}

function DetailLine({ label, value, mono = false }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: '#0f172a', fontWeight: 800, wordBreak: 'break-word', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value}
      </div>
    </div>
  );
}
