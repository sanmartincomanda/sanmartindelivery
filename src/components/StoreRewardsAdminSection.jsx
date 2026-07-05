import React, { useEffect, useMemo, useState } from 'react';
import {
  adjustStoreRewardPoints,
  buildCustomerRewardSummary,
  calculateStoreRewardRequiredSpend,
  calculateStoreRewardWeightPercent,
  DEFAULT_STORE_REWARD_SETTINGS,
  deleteStoreReward,
  mergeStoreRewards,
  normalizeStoreReward,
  normalizeStoreRewardAccount,
  normalizeStoreRewardSettings,
  saveStoreReward,
  saveStoreRewardSettings,
  seedDefaultStoreRewardsProgramIfEmpty,
  subscribeStoreRewardAccounts,
  subscribeStoreRewardSettings,
  subscribeStoreRewardTransactions,
  subscribeStoreRewards,
  updateStoreReward,
} from '../services/storeRewards';

const createEmptyRewardForm = () => ({
  id: '',
  name: '',
  description: '',
  pointsRequired: '400',
  internalCost: '',
  minPurchaseAmount: '',
  active: true,
  available: true,
  displayOrder: '',
  rewardType: 'single_product',
  imageProductCode: '',
  items: [],
});

const createEmptyRewardItem = (sortOrder = 10) => ({
  id: '',
  productCode: '',
  quantity: '1',
  internalCost: '',
  isChoiceOption: false,
  choiceGroup: '',
  choiceLabel: '',
  sortOrder: String(sortOrder),
});

const formatCurrency = (value) => `C$ ${Number(value || 0).toFixed(2)}`;

const formatLinkedProducts = (reward = {}) =>
  (Array.isArray(reward.items) ? reward.items : [])
    .map((item) => item.productName || item.choiceLabel || item.productCode)
    .filter(Boolean)
    .join(' | ') || 'Sin productos vinculados';

const buildRewardFormFromReward = (reward = {}) => ({
  id: String(reward.id || '').trim(),
  name: String(reward.name || '').trim(),
  description: String(reward.description || '').trim(),
  pointsRequired: String(Number(reward.pointsRequired || 0) || 0),
  internalCost: String(Number(reward.internalCost || 0) || ''),
  minPurchaseAmount: String(Number(reward.minPurchaseAmount || 0) || ''),
  active: reward.active !== false,
  available: reward.available !== false,
  displayOrder: String(Number(reward.displayOrder || 0) || ''),
  rewardType: String(reward.rewardType || 'single_product').trim() || 'single_product',
  imageProductCode: String(reward.imageProductCode || '').trim(),
  items: (Array.isArray(reward.items) ? reward.items : []).map((item, index) => ({
    id: String(item.id || '').trim(),
    productCode: String(item.productCode || '').trim(),
    quantity: String(Number(item.quantity || 1) || 1),
    internalCost: String(Number(item.internalCost || 0) || ''),
    isChoiceOption: item.isChoiceOption === true,
    choiceGroup: String(item.choiceGroup || '').trim(),
    choiceLabel: String(item.choiceLabel || '').trim(),
    sortOrder: String(Number(item.sortOrder || (index + 1) * 10) || (index + 1) * 10),
  })),
});

const formatDateTime = (value) => {
  const timestamp = Number(value || 0);
  if (!timestamp) {
    return 'Sin movimiento';
  }

  try {
    return new Intl.DateTimeFormat('es-NI', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(timestamp));
  } catch (error) {
    return 'Sin movimiento';
  }
};

const formatSignedPoints = (value) => {
  const numeric = Number(value || 0);
  const prefix = numeric > 0 ? '+' : '';
  return `${prefix}${Math.trunc(numeric)} pts`;
};

const getRewardTransactionTypeLabel = (transaction = {}) => {
  const type = String(transaction?.type || '').trim().toLowerCase();
  if (type === 'earned') {
    return 'Compra completada';
  }
  if (type === 'redeemed') {
    return 'Premio canjeado';
  }
  if (type === 'reversed') {
    return 'Puntos revertidos';
  }
  if (type === 'adjusted') {
    return 'Ajuste manual';
  }
  return 'Movimiento';
};

const buildRewardProgressLabel = (row) => {
  if (row?.bestAvailableReward?.name) {
    return `Puede reclamar ${row.bestAvailableReward.name}`;
  }

  if (row?.closestReward?.name) {
    return `Le faltan ${Math.max(0, Number(row.missingPoints || 0))} pts para ${row.closestReward.name}`;
  }

  return 'Sin premios configurados';
};

export default function StoreRewardsAdminSection({
  catalog = [],
  storeUsers = [],
  storeOrders = [],
}) {
  const [settings, setSettings] = useState(DEFAULT_STORE_REWARD_SETTINGS);
  const [rewardMap, setRewardMap] = useState({});
  const [rewardAccountsMap, setRewardAccountsMap] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [rewardForm, setRewardForm] = useState(createEmptyRewardForm());
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('con_cuenta');
  const [selectedCustomerKey, setSelectedCustomerKey] = useState('');
  const [selectedCustomerTransactions, setSelectedCustomerTransactions] = useState([]);
  const [adjustmentForm, setAdjustmentForm] = useState({
    mode: 'sumar',
    points: '',
    note: '',
  });
  const [adjustingPoints, setAdjustingPoints] = useState(false);

  const catalogOptions = useMemo(
    () =>
      [...(Array.isArray(catalog) ? catalog : [])]
        .filter((product) => product?.code && product?.name)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'es-NI'))
        .map((product) => ({
          code: String(product.code || '').trim(),
          name: `${product.name} [${product.code}]`,
          image: product.image || '',
        })),
    [catalog]
  );

  const rewards = useMemo(
    () =>
      mergeStoreRewards(rewardMap, catalog).map((reward) => ({
        ...reward,
        requiredSpend: calculateStoreRewardRequiredSpend(reward.pointsRequired, settings),
        rewardWeightPercent: calculateStoreRewardWeightPercent(reward, settings),
      })),
    [catalog, rewardMap, settings]
  );

  const storeUsersByKey = useMemo(
    () =>
      (Array.isArray(storeUsers) ? storeUsers : []).reduce((accumulator, user) => {
        const userKey = String(user?.key || user?.id || user?.userKey || '').trim();
        if (!userKey) {
          return accumulator;
        }

        accumulator[userKey] = user;
        return accumulator;
      }, {}),
    [storeUsers]
  );

  const rewardOrdersByUser = useMemo(() => {
    const map = {};

    (Array.isArray(storeOrders) ? storeOrders : []).forEach((order) => {
      const userKey = String(order?.storeUserKey || '').trim();
      if (!userKey) {
        return;
      }

      const orderTimestamp = Number(order?.timestamp || order?.timestampIngresoMs || 0);
      if (!map[userKey]) {
        map[userKey] = {
          totalOrders: 0,
          rewardOrders: 0,
          deliveredRewardOrders: 0,
          lastOrderAt: 0,
          lastRewardOrderAt: 0,
          lastRewardOrder: null,
        };
      }

      map[userKey].totalOrders += 1;
      map[userKey].lastOrderAt = Math.max(map[userKey].lastOrderAt, orderTimestamp);

      if (String(order?.rewardRedemption?.rewardName || '').trim()) {
        map[userKey].rewardOrders += 1;
        if (String(order?.estado || '').trim().toLowerCase() === 'entregado') {
          map[userKey].deliveredRewardOrders += 1;
        }
        if (orderTimestamp >= Number(map[userKey].lastRewardOrderAt || 0)) {
          map[userKey].lastRewardOrderAt = orderTimestamp;
          map[userKey].lastRewardOrder = order;
        }
      }
    });

    return map;
  }, [storeOrders]);

  useEffect(() => {
    let mounted = true;

    seedDefaultStoreRewardsProgramIfEmpty()
      .then((result) => {
        if (!mounted) {
          return;
        }

        if (result.seededRewards || result.seededSettings) {
          setMessage('Programa base del Club San Martin cargado.');
        }
      })
      .catch((error) => {
        if (mounted) {
          console.error('No se pudo inicializar el programa base de recompensas:', error);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreRewardSettings(
      (value) => {
        setSettings(normalizeStoreRewardSettings(value, DEFAULT_STORE_REWARD_SETTINGS));
      },
      (error) => {
        console.error('No se pudo cargar la configuracion del Club San Martin:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreRewards(
      (value) => {
        setRewardMap(value && typeof value === 'object' ? value : {});
      },
      (error) => {
        console.error('No se pudieron cargar los premios del Club San Martin:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreRewardAccounts(
      (value) => {
        setRewardAccountsMap(value && typeof value === 'object' ? value : {});
      },
      (error) => {
        console.error('No se pudieron cargar las cuentas del Club San Martin:', error);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!selectedCustomerKey) {
      setSelectedCustomerTransactions([]);
      return undefined;
    }

    const unsubscribe = subscribeStoreRewardTransactions(
      selectedCustomerKey,
      (transactions) => {
        setSelectedCustomerTransactions(Array.isArray(transactions) ? transactions : []);
      },
      (error) => {
        console.error(`No se pudieron cargar los movimientos de ${selectedCustomerKey}:`, error);
      },
      80
    );

    return () => unsubscribe();
  }, [selectedCustomerKey]);

  const openNewReward = () => {
    setRewardForm(createEmptyRewardForm());
    setEditorOpen(true);
  };

  const openEditReward = (reward) => {
    setRewardForm(buildRewardFormFromReward(reward));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (rewardSaving) {
      return;
    }

    setEditorOpen(false);
    setRewardForm(createEmptyRewardForm());
  };

  const rewardCustomerRows = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(storeUsersByKey),
      ...Object.keys(rewardAccountsMap || {}),
      ...Object.keys(rewardOrdersByUser || {}),
    ]);

    return [...allKeys]
      .map((userKey) => {
        const storeUser = storeUsersByKey[userKey] || {};
        const hasStoredAccount = rewardAccountsMap?.[userKey] !== undefined;
        const account = normalizeStoreRewardAccount(rewardAccountsMap?.[userKey] || {}, userKey);
        const orderStats = rewardOrdersByUser?.[userKey] || {
          totalOrders: 0,
          rewardOrders: 0,
          deliveredRewardOrders: 0,
          lastOrderAt: 0,
          lastRewardOrderAt: 0,
          lastRewardOrder: null,
        };
        const pointsBalance = Math.max(0, Number(account.pointsBalance || 0));
        const pendingHoldPoints = Object.values(account.holds || {}).reduce(
          (sum, hold) => sum + Math.max(0, Number(hold?.points || 0)),
          0
        );
        const rewardSummary = buildCustomerRewardSummary(rewards, pointsBalance, 0, settings);
        const bestAvailableReward = rewardSummary.bestReward || null;
        const closestReward = rewardSummary.closestReward || null;
        const missingPoints = closestReward
          ? Math.max(0, Number(closestReward.pointsRequired || 0) - pointsBalance)
          : 0;
        const lastActivityAt = Math.max(
          Number(account.updatedAt || 0),
          Number(orderStats.lastRewardOrderAt || 0),
          Number(orderStats.lastOrderAt || 0)
        );

        return {
          userKey,
          storeUser,
          account,
          hasStoredAccount,
          pointsBalance,
          pendingHoldPoints,
          rewardSummary,
          bestAvailableReward,
          closestReward,
          missingPoints,
          progressLabel: buildRewardProgressLabel({
            bestAvailableReward,
            closestReward,
            missingPoints,
          }),
          totalOrders: Number(orderStats.totalOrders || 0),
          rewardOrders: Number(orderStats.rewardOrders || 0),
          deliveredRewardOrders: Number(orderStats.deliveredRewardOrders || 0),
          lastRewardOrder: orderStats.lastRewardOrder || null,
          lastActivityAt,
        };
      })
      .sort((left, right) => {
        if (Number(right.pointsBalance || 0) !== Number(left.pointsBalance || 0)) {
          return Number(right.pointsBalance || 0) - Number(left.pointsBalance || 0);
        }

        if (Number(right.lastActivityAt || 0) !== Number(left.lastActivityAt || 0)) {
          return Number(right.lastActivityAt || 0) - Number(left.lastActivityAt || 0);
        }

        return String(left.storeUser?.nombre || left.storeUser?.name || '').localeCompare(
          String(right.storeUser?.nombre || right.storeUser?.name || ''),
          'es-NI',
          { sensitivity: 'base' }
        );
      });
  }, [rewardAccountsMap, rewardOrdersByUser, rewards, settings, storeUsersByKey]);

  const filteredRewardCustomerRows = useMemo(() => {
    const search = String(customerSearch || '').trim().toLowerCase();

    return rewardCustomerRows.filter((row) => {
      const name = String(row.storeUser?.nombre || row.storeUser?.name || '').toLowerCase();
      const phone = String(row.storeUser?.telefono || row.storeUser?.phone || '').toLowerCase();
      const code = String(row.storeUser?.codigo || '').toLowerCase();
      const email = String(row.storeUser?.email || '').toLowerCase();

      if (search && ![name, phone, code, email, row.userKey.toLowerCase()].some((value) => value.includes(search))) {
        return false;
      }

      if (customerFilter === 'con_cuenta') {
        return row.hasStoredAccount || row.rewardOrders > 0;
      }

      if (customerFilter === 'con_puntos') {
        return row.pointsBalance > 0;
      }

      if (customerFilter === 'puede_canjear') {
        return Boolean(row.bestAvailableReward);
      }

      if (customerFilter === 'con_canje') {
        return row.rewardOrders > 0 || Number(row.account.lifetimePointsRedeemed || 0) > 0;
      }

      if (customerFilter === 'sin_puntos') {
        return row.pointsBalance <= 0;
      }

      return true;
    });
  }, [customerFilter, customerSearch, rewardCustomerRows]);

  const rewardCustomerMetrics = useMemo(() => {
    return rewardCustomerRows.reduce(
      (summary, row) => {
        summary.totalCustomers += 1;
        summary.customersWithAccount += row.hasStoredAccount ? 1 : 0;
        summary.customersWithPoints += row.pointsBalance > 0 ? 1 : 0;
        summary.customersClaimable += row.bestAvailableReward ? 1 : 0;
        summary.customersWithRedemption += row.rewardOrders > 0 ? 1 : 0;
        summary.totalPointsBalance += Number(row.pointsBalance || 0);
        summary.totalLifetimeRedeemed += Number(row.account.lifetimePointsRedeemed || 0);
        summary.pendingHoldPoints += Number(row.pendingHoldPoints || 0);
        return summary;
      },
      {
        totalCustomers: 0,
        customersWithAccount: 0,
        customersWithPoints: 0,
        customersClaimable: 0,
        customersWithRedemption: 0,
        totalPointsBalance: 0,
        totalLifetimeRedeemed: 0,
        pendingHoldPoints: 0,
      }
    );
  }, [rewardCustomerRows]);

  const selectedCustomerRow = useMemo(
    () => rewardCustomerRows.find((row) => row.userKey === selectedCustomerKey) || null,
    [rewardCustomerRows, selectedCustomerKey]
  );

  const updateSettingsField = (field, value) => {
    setSettings((current) => ({
      ...current,
      [field]: field === 'enabled' ? value : value,
    }));
  };

  const openCustomerEditor = (row) => {
    setSelectedCustomerKey(String(row?.userKey || '').trim());
    setAdjustmentForm({
      mode: 'sumar',
      points: '',
      note: '',
    });
  };

  const closeCustomerEditor = () => {
    if (adjustingPoints) {
      return;
    }

    setSelectedCustomerKey('');
    setSelectedCustomerTransactions([]);
    setAdjustmentForm({
      mode: 'sumar',
      points: '',
      note: '',
    });
  };

  const updateAdjustmentField = (field, value) => {
    setAdjustmentForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    setSettingsSaving(true);
    setMessage('');

    try {
      const saved = await saveStoreRewardSettings({
        ...settings,
        pointsPerAmount: Number(settings.pointsPerAmount || 1),
        amountPerPoint: Number(settings.amountPerPoint || 10),
        pointsExpirationMonths: Number(settings.pointsExpirationMonths || 0),
      });
      setSettings(saved);
      setMessage('Configuracion del Club San Martin guardada.');
    } catch (error) {
      console.error('No se pudo guardar la configuracion de recompensas:', error);
      setMessage(error?.message || 'No se pudo guardar la configuracion.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const saveCustomerAdjustment = async (event) => {
    event.preventDefault();
    if (!selectedCustomerRow) {
      return;
    }

    const basePoints = Math.max(0, Math.trunc(Number(adjustmentForm.points || 0)));
    const currentBalance = Math.max(0, Number(selectedCustomerRow.pointsBalance || 0));
    let pointsDelta = 0;

    if (adjustmentForm.mode === 'fijar') {
      pointsDelta = basePoints - currentBalance;
    } else {
      pointsDelta = adjustmentForm.mode === 'restar' ? -basePoints : basePoints;
    }

    if (!pointsDelta) {
      setMessage('El ajuste no cambia el saldo actual del cliente.');
      return;
    }

    setAdjustingPoints(true);
    setMessage('');

    try {
      const result = await adjustStoreRewardPoints({
        userKey: selectedCustomerRow.userKey,
        pointsDelta,
        note: adjustmentForm.note,
        adminLabel: 'Ajuste manual desde Programa de Recompensas',
      });

      setMessage(
        `Saldo actualizado para ${selectedCustomerRow.storeUser?.nombre || 'cliente'}: ${result.balanceBefore} pts -> ${result.balanceAfter} pts.`
      );
      setAdjustmentForm({
        mode: 'sumar',
        points: '',
        note: '',
      });
    } catch (error) {
      console.error('No se pudo ajustar la cuenta de recompensas:', error);
      setMessage(error?.message || 'No se pudo guardar el ajuste de puntos.');
    } finally {
      setAdjustingPoints(false);
    }
  };

  const updateRewardForm = (field, value) => {
    setRewardForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateRewardItem = (index, field, value) => {
    setRewardForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
    }));
  };

  const addRewardItem = () => {
    setRewardForm((current) => ({
      ...current,
      items: [...current.items, createEmptyRewardItem((current.items.length + 1) * 10)],
    }));
  };

  const removeRewardItem = (index) => {
    setRewardForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const saveRewardEditor = async (event) => {
    event.preventDefault();
    setRewardSaving(true);
    setMessage('');

    try {
      const payload = normalizeStoreReward({
        ...rewardForm,
        pointsRequired: Number(rewardForm.pointsRequired || 0),
        internalCost: Number(rewardForm.internalCost || 0),
        minPurchaseAmount: Number(rewardForm.minPurchaseAmount || 0),
        displayOrder: Number(rewardForm.displayOrder || 0),
        items: rewardForm.items.map((item, index) => ({
          ...item,
          quantity: Number(item.quantity || 1),
          internalCost: Number(item.internalCost || 0),
          sortOrder: Number(item.sortOrder || (index + 1) * 10),
        })),
      });

      await saveStoreReward(payload);
      setMessage('Premio guardado correctamente.');
      closeEditor();
    } catch (error) {
      console.error('No se pudo guardar el premio:', error);
      setMessage(error?.message || 'No se pudo guardar el premio.');
    } finally {
      setRewardSaving(false);
    }
  };

  const toggleRewardAvailability = async (reward) => {
    try {
      await updateStoreReward(reward.id, {
        available: reward.available === false,
      });
      setMessage(
        reward.available === false
          ? `Premio ${reward.name} marcado como disponible.`
          : `Premio ${reward.name} marcado sin disponibilidad.`
      );
    } catch (error) {
      console.error('No se pudo cambiar la disponibilidad del premio:', error);
      setMessage(error?.message || 'No se pudo cambiar la disponibilidad.');
    }
  };

  const toggleRewardActive = async (reward) => {
    try {
      await updateStoreReward(reward.id, {
        active: reward.active === false,
      });
      setMessage(
        reward.active === false
          ? `Premio ${reward.name} activado.`
          : `Premio ${reward.name} desactivado.`
      );
    } catch (error) {
      console.error('No se pudo cambiar el estado del premio:', error);
      setMessage(error?.message || 'No se pudo cambiar el estado.');
    }
  };

  const removeReward = async (reward) => {
    const confirmDelete = window.confirm(`Quieres eliminar el premio "${reward.name}"?`);
    if (!confirmDelete) {
      return;
    }

    try {
      await deleteStoreReward(reward.id);
      setMessage(`Premio ${reward.name} eliminado.`);
    } catch (error) {
      console.error('No se pudo eliminar el premio:', error);
      setMessage(error?.message || 'No se pudo eliminar el premio.');
    }
  };

  const rewardPreview = useMemo(() => {
    const normalized = normalizeStoreReward({
      ...rewardForm,
      pointsRequired: Number(rewardForm.pointsRequired || 0),
      internalCost: Number(rewardForm.internalCost || 0),
      minPurchaseAmount: Number(rewardForm.minPurchaseAmount || 0),
      displayOrder: Number(rewardForm.displayOrder || 0),
      items: rewardForm.items.map((item, index) => ({
        ...item,
        quantity: Number(item.quantity || 1),
        internalCost: Number(item.internalCost || 0),
        sortOrder: Number(item.sortOrder || (index + 1) * 10),
      })),
    });

    return {
      requiredSpend: calculateStoreRewardRequiredSpend(normalized.pointsRequired, settings),
      rewardWeightPercent: calculateStoreRewardWeightPercent(normalized, settings),
    };
  }, [rewardForm, settings]);

  return (
    <>
      <section className="cfg-section-card" style={{ display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24 }}>Programa de Recompensas</h2>
            <p style={{ margin: '6px 0 0', color: '#64748b', fontWeight: 700 }}>
              Configura puntos, niveles y premios del Club San Martin Granada.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="cfg-button secondary" onClick={openNewReward}>
              Nuevo premio
            </button>
          </div>
        </div>

        {message && (
          <div
            style={{
              borderRadius: 16,
              padding: '12px 14px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              color: '#334155',
              fontWeight: 800,
            }}
          >
            {message}
          </div>
        )}

        <form
          onSubmit={saveSettings}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            alignItems: 'end',
          }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#475569', fontWeight: 800 }}>Programa activo</span>
            <select
              className="cfg-select"
              value={settings.enabled ? 'activo' : 'inactivo'}
              onChange={(event) => updateSettingsField('enabled', event.target.value === 'activo')}
            >
              <option value="activo">Activo</option>
              <option value="inactivo">Inactivo</option>
            </select>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#475569', fontWeight: 800 }}>Puntos por compra</span>
            <input
              className="cfg-input"
              type="number"
              min="1"
              step="1"
              value={settings.pointsPerAmount}
              onChange={(event) => updateSettingsField('pointsPerAmount', event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#475569', fontWeight: 800 }}>Monto por punto</span>
            <input
              className="cfg-input"
              type="number"
              min="1"
              step="1"
              value={settings.amountPerPoint}
              onChange={(event) => updateSettingsField('amountPerPoint', event.target.value)}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ color: '#475569', fontWeight: 800 }}>Vencimiento (meses)</span>
            <input
              className="cfg-input"
              type="number"
              min="0"
              step="1"
              value={settings.pointsExpirationMonths}
              onChange={(event) => updateSettingsField('pointsExpirationMonths', event.target.value)}
            />
          </label>

          <button type="submit" className="cfg-button" disabled={settingsSaving}>
            {settingsSaving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </form>

        <section
          style={{
            display: 'grid',
            gap: 14,
            padding: 18,
            borderRadius: 22,
            background: 'linear-gradient(135deg, rgba(15,23,42,0.04), rgba(59,130,246,0.08))',
            border: '1px solid #dbeafe',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div>
              <strong style={{ display: 'block', fontSize: 20 }}>Seguimiento de clientes</strong>
              <span style={{ color: '#64748b', fontWeight: 700 }}>
                Mira como va cada cliente con sus puntos, premios disponibles y canjes.
              </span>
            </div>
            <div style={{ color: '#0f172a', fontWeight: 900 }}>
              {filteredRewardCustomerRows.length} de {rewardCustomerRows.length} clientes
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
            }}
          >
            {[
              { label: 'Con cuenta', value: rewardCustomerMetrics.customersWithAccount, helper: 'Clientes ya inscritos en recompensas' },
              { label: 'Con puntos', value: rewardCustomerMetrics.customersWithPoints, helper: 'Tienen saldo disponible' },
              { label: 'Puntos activos', value: `${rewardCustomerMetrics.totalPointsBalance} pts`, helper: 'Saldo total acumulado' },
              { label: 'Pueden canjear', value: rewardCustomerMetrics.customersClaimable, helper: 'Ya alcanzaron al menos un premio' },
              { label: 'Ya canjearon', value: rewardCustomerMetrics.customersWithRedemption, helper: 'Han usado premio en un pedido' },
              { label: 'Puntos en reserva', value: `${rewardCustomerMetrics.pendingHoldPoints} pts`, helper: 'Apartados en pedidos pendientes' },
            ].map((metric) => (
              <article
                key={metric.label}
                style={{
                  padding: 16,
                  borderRadius: 18,
                  background: '#ffffff',
                  border: '1px solid #dbeafe',
                  boxShadow: '0 14px 32px rgba(15, 23, 42, 0.05)',
                }}
              >
                <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {metric.label}
                </div>
                <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{metric.value}</div>
                <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>{metric.helper}</div>
              </article>
            ))}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(260px, 1.2fr) minmax(180px, 220px)',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#475569', fontWeight: 800 }}>Buscar cliente</span>
              <input
                className="cfg-input"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Nombre, telefono, correo o codigo"
              />
            </label>

            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: '#475569', fontWeight: 800 }}>Filtro</span>
              <select
                className="cfg-select"
                value={customerFilter}
                onChange={(event) => setCustomerFilter(event.target.value)}
              >
                <option value="con_cuenta">Con cuenta o movimiento</option>
                <option value="todos">Todos</option>
                <option value="con_puntos">Con puntos</option>
                <option value="puede_canjear">Pueden canjear</option>
                <option value="con_canje">Ya canjearon</option>
                <option value="sin_puntos">Sin puntos</option>
              </select>
            </label>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="cfg-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Saldo</th>
                  <th>Historial</th>
                  <th>Como va</th>
                  <th>Ultimo movimiento</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredRewardCustomerRows.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ color: '#64748b', fontWeight: 800 }}>
                      No encontramos clientes para ese filtro.
                    </td>
                  </tr>
                ) : (
                  filteredRewardCustomerRows.map((row) => (
                    <tr key={row.userKey}>
                      <td>
                        <strong>{row.storeUser?.nombre || row.storeUser?.name || 'Cliente sin nombre'}</strong>
                        <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                          {row.storeUser?.telefono || row.storeUser?.phone || 'Sin telefono'}
                        </div>
                        <div style={{ marginTop: 4, color: '#94a3b8', fontWeight: 700 }}>
                          {row.storeUser?.codigo || row.storeUser?.email || row.userKey}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 900, fontSize: 24, color: '#0f172a' }}>{row.pointsBalance} pts</div>
                        <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                          {row.pendingHoldPoints > 0
                            ? `${row.pendingHoldPoints} pts reservados`
                            : row.hasStoredAccount
                              ? 'Cuenta activa'
                              : 'Sin cuenta creada aun'}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#0f172a', fontWeight: 800 }}>
                          Ganados: {Number(row.account.lifetimePointsEarned || 0)} pts
                        </div>
                        <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                          Canjeados: {Number(row.account.lifetimePointsRedeemed || 0)} pts
                        </div>
                        <div style={{ marginTop: 4, color: '#94a3b8', fontWeight: 700 }}>
                          Pedidos con premio: {row.rewardOrders}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#0f172a', fontWeight: 800 }}>{row.progressLabel}</div>
                        <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {row.bestAvailableReward ? (
                            <span className="cfg-badge">Disponible ahora</span>
                          ) : row.closestReward ? (
                            <span className="cfg-badge off">{row.missingPoints} pts pendientes</span>
                          ) : (
                            <span className="cfg-badge off">Sin premios</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ color: '#0f172a', fontWeight: 800 }}>{formatDateTime(row.lastActivityAt)}</div>
                        <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                          {row.lastRewardOrder?.rewardRedemption?.rewardName || 'Sin canje reciente'}
                        </div>
                      </td>
                      <td>
                        <button type="button" className="cfg-button secondary" onClick={() => openCustomerEditor(row)}>
                          Ver cliente
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div style={{ overflowX: 'auto' }}>
          <table className="cfg-table">
            <thead>
              <tr>
                <th>Puntos</th>
                <th>Compra acumulada</th>
                <th>Premio</th>
                <th>Productos vinculados</th>
                <th>Costo interno</th>
                <th>Peso</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rewards.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ color: '#64748b', fontWeight: 800 }}>
                    No hay premios configurados todavia.
                  </td>
                </tr>
              ) : (
                rewards.map((reward) => (
                  <tr key={reward.id}>
                    <td>{Number(reward.pointsRequired || 0)}</td>
                    <td>{formatCurrency(reward.requiredSpend)}</td>
                    <td>
                      <strong>{reward.name}</strong>
                      <div style={{ color: '#64748b', marginTop: 4 }}>{reward.rewardType}</div>
                    </td>
                    <td>{formatLinkedProducts(reward)}</td>
                    <td>{formatCurrency(reward.internalCost)}</td>
                    <td>{Number(reward.rewardWeightPercent || 0).toFixed(2)}%</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span className={`cfg-badge ${reward.active === false ? 'off' : ''}`}>
                          {reward.active === false ? 'Inactivo' : 'Activo'}
                        </span>
                        <span className={`cfg-badge ${reward.available === false ? 'off' : ''}`}>
                          {reward.available === false ? 'Sin stock' : 'Disponible'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button type="button" className="cfg-button secondary" onClick={() => openEditReward(reward)}>
                          Editar
                        </button>
                        <button type="button" className="cfg-button secondary" onClick={() => toggleRewardAvailability(reward)}>
                          {reward.available === false ? 'Habilitar' : 'Sin stock'}
                        </button>
                        <button type="button" className="cfg-button secondary" onClick={() => toggleRewardActive(reward)}>
                          {reward.active === false ? 'Activar' : 'Desactivar'}
                        </button>
                        <button type="button" className="cfg-button secondary" onClick={() => removeReward(reward)}>
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedCustomerRow && (
        <div
          className="cfg-driver-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeCustomerEditor();
            }
          }}
        >
          <div
            className="cfg-driver-modal"
            style={{ width: 'min(1080px, 100%)', display: 'grid', gap: 16 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                  Programa de Recompensas / Cliente
                </div>
                <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>
                  {selectedCustomerRow.storeUser?.nombre || selectedCustomerRow.storeUser?.name || 'Cliente sin nombre'}
                </h2>
                <div style={{ marginTop: 6, color: '#64748b', fontWeight: 700 }}>
                  {selectedCustomerRow.storeUser?.telefono || selectedCustomerRow.storeUser?.phone || 'Sin telefono'}
                  {' · '}
                  {selectedCustomerRow.storeUser?.codigo || selectedCustomerRow.storeUser?.email || selectedCustomerRow.userKey}
                </div>
              </div>

              <button type="button" className="cfg-button secondary" onClick={closeCustomerEditor} disabled={adjustingPoints}>
                Cerrar
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {[
                { label: 'Saldo actual', value: `${selectedCustomerRow.pointsBalance} pts`, helper: selectedCustomerRow.bestAvailableReward ? 'Puede reclamar premio ahora' : 'Saldo disponible para canjes' },
                { label: 'Ganados', value: `${Number(selectedCustomerRow.account.lifetimePointsEarned || 0)} pts`, helper: 'Total acreditado por compras' },
                { label: 'Canjeados', value: `${Number(selectedCustomerRow.account.lifetimePointsRedeemed || 0)} pts`, helper: 'Total usado en premios' },
                { label: 'Reservados', value: `${Number(selectedCustomerRow.pendingHoldPoints || 0)} pts`, helper: 'Apartados en pedidos pendientes' },
              ].map((metric) => (
                <article
                  key={metric.label}
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ color: '#64748b', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {metric.label}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: '#0f172a' }}>{metric.value}</div>
                  <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>{metric.helper}</div>
                </article>
              ))}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.1fr) minmax(320px, 420px)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <section
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 18 }}>Como va con sus recompensas</strong>
                  <div style={{ marginTop: 10, color: '#0f172a', fontWeight: 800 }}>
                    {selectedCustomerRow.progressLabel}
                  </div>
                  <div style={{ marginTop: 8, color: '#64748b', fontWeight: 700 }}>
                    {selectedCustomerRow.bestAvailableReward
                      ? `Premio desbloqueado: ${selectedCustomerRow.bestAvailableReward.name}`
                      : selectedCustomerRow.closestReward
                        ? `Siguiente meta: ${selectedCustomerRow.closestReward.name}`
                        : 'Todavia no hay premios configurados para mostrar.'}
                  </div>

                  {(selectedCustomerRow.rewardSummary.availableRewards.length > 0 ||
                    selectedCustomerRow.rewardSummary.upcomingRewards.length > 0) && (
                    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
                      {[...selectedCustomerRow.rewardSummary.availableRewards, ...selectedCustomerRow.rewardSummary.upcomingRewards]
                        .slice(0, 3)
                        .map((reward) => {
                          const missingPoints = Math.max(
                            0,
                            Number(reward.pointsRequired || 0) - Number(selectedCustomerRow.pointsBalance || 0)
                          );

                          return (
                            <div
                              key={reward.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 12,
                                padding: '12px 14px',
                                borderRadius: 14,
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 800, color: '#0f172a' }}>{reward.name}</div>
                                <div style={{ marginTop: 4, color: '#64748b', fontWeight: 700 }}>
                                  {Number(reward.pointsRequired || 0)} pts
                                </div>
                              </div>
                              <div style={{ textAlign: 'right', fontWeight: 800, color: missingPoints <= 0 ? '#047857' : '#1d4ed8' }}>
                                {missingPoints <= 0 ? 'Disponible' : `Faltan ${missingPoints} pts`}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </section>

                <section
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: '#ffffff',
                    border: '1px solid #e2e8f0',
                  }}
                >
                  <strong style={{ display: 'block', fontSize: 18 }}>Movimientos recientes</strong>
                  <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
                    {selectedCustomerTransactions.length === 0 ? (
                      <div style={{ color: '#64748b', fontWeight: 700 }}>
                        Este cliente todavia no tiene movimientos de puntos.
                      </div>
                    ) : (
                      selectedCustomerTransactions.slice(0, 12).map((transaction) => (
                        <div
                          key={transaction.id}
                          style={{
                            display: 'grid',
                            gap: 4,
                            padding: '12px 14px',
                            borderRadius: 14,
                            background: '#f8fafc',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <strong style={{ color: '#0f172a' }}>{getRewardTransactionTypeLabel(transaction)}</strong>
                            <span style={{ color: Number(transaction.signedPoints || 0) >= 0 ? '#047857' : '#b91c1c', fontWeight: 900 }}>
                              {formatSignedPoints(transaction.signedPoints || 0)}
                            </span>
                          </div>
                          <div style={{ color: '#64748b', fontWeight: 700 }}>
                            {transaction.rewardName || transaction.note || 'Sin detalle adicional'}
                          </div>
                          <div style={{ color: '#94a3b8', fontWeight: 700 }}>
                            {formatDateTime(transaction.createdAt)} · Saldo {Number(transaction.balanceAfter || 0)} pts
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <form
                onSubmit={saveCustomerAdjustment}
                style={{
                  display: 'grid',
                  gap: 12,
                  padding: 16,
                  borderRadius: 18,
                  background: '#fff7ed',
                  border: '1px solid #fed7aa',
                }}
              >
                <div>
                  <strong style={{ display: 'block', fontSize: 18, color: '#9a3412' }}>Editar saldo como administrador</strong>
                  <span style={{ color: '#9a3412', fontWeight: 700 }}>
                    Cada cambio queda registrado en el historial del cliente.
                  </span>
                </div>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#9a3412', fontWeight: 800 }}>Tipo de ajuste</span>
                  <select
                    className="cfg-select"
                    value={adjustmentForm.mode}
                    onChange={(event) => updateAdjustmentField('mode', event.target.value)}
                  >
                    <option value="sumar">Sumar puntos</option>
                    <option value="restar">Restar puntos</option>
                    <option value="fijar">Fijar saldo exacto</option>
                  </select>
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#9a3412', fontWeight: 800 }}>
                    {adjustmentForm.mode === 'fijar' ? 'Nuevo saldo final' : 'Cantidad de puntos'}
                  </span>
                  <input
                    className="cfg-input"
                    type="number"
                    min="0"
                    step="1"
                    value={adjustmentForm.points}
                    onChange={(event) => updateAdjustmentField('points', event.target.value)}
                    placeholder={adjustmentForm.mode === 'fijar' ? 'Ejemplo: 400' : 'Ejemplo: 50'}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#9a3412', fontWeight: 800 }}>Nota administrativa</span>
                  <textarea
                    className="cfg-textarea"
                    value={adjustmentForm.note}
                    onChange={(event) => updateAdjustmentField('note', event.target.value)}
                    placeholder="Motivo del ajuste"
                  />
                </label>

                <div
                  style={{
                    padding: 14,
                    borderRadius: 14,
                    background: 'rgba(255,255,255,0.82)',
                    border: '1px solid #fdba74',
                    color: '#9a3412',
                    fontWeight: 800,
                    lineHeight: 1.55,
                  }}
                >
                  Saldo actual: <strong>{selectedCustomerRow.pointsBalance} pts</strong>
                  <br />
                  {adjustmentForm.mode === 'fijar'
                    ? 'El sistema calculara automaticamente la diferencia contra el saldo actual.'
                    : 'Usa sumar o restar para corregir puntos sin perder trazabilidad.'}
                </div>

                <button type="submit" className="cfg-button" disabled={adjustingPoints}>
                  {adjustingPoints ? 'Guardando ajuste...' : 'Guardar ajuste'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {editorOpen && (
        <div
          className="cfg-driver-modal-overlay"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeEditor();
            }
          }}
        >
          <form
            onSubmit={saveRewardEditor}
            className="cfg-driver-modal"
            style={{ width: 'min(1120px, 100%)', display: 'grid', gap: 16 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900 }}>
                  Tienda Virtual / Programa de Recompensas
                </div>
                <h2 style={{ margin: '6px 0 0', fontSize: 28 }}>
                  {rewardForm.id ? 'Editar premio' : 'Nuevo premio'}
                </h2>
              </div>
              <button type="button" className="cfg-button secondary" onClick={closeEditor} disabled={rewardSaving}>
                Cerrar
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) minmax(300px, 380px)',
                gap: 16,
                alignItems: 'start',
              }}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <input
                    className="cfg-input"
                    value={rewardForm.name}
                    onChange={(event) => updateRewardForm('name', event.target.value)}
                    placeholder="Nombre del premio"
                  />
                  <input
                    className="cfg-input"
                    value={rewardForm.id}
                    onChange={(event) => updateRewardForm('id', event.target.value)}
                    placeholder="ID interno"
                  />
                </div>

                <textarea
                  className="cfg-textarea"
                  value={rewardForm.description}
                  onChange={(event) => updateRewardForm('description', event.target.value)}
                  placeholder="Descripcion"
                />

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  <input
                    className="cfg-input"
                    type="number"
                    min="1"
                    step="1"
                    value={rewardForm.pointsRequired}
                    onChange={(event) => updateRewardForm('pointsRequired', event.target.value)}
                    placeholder="Puntos"
                  />
                  <input
                    className="cfg-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rewardForm.internalCost}
                    onChange={(event) => updateRewardForm('internalCost', event.target.value)}
                    placeholder="Costo interno"
                  />
                  <input
                    className="cfg-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={rewardForm.minPurchaseAmount}
                    onChange={(event) => updateRewardForm('minPurchaseAmount', event.target.value)}
                    placeholder="Compra minima"
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
                  <select
                    className="cfg-select"
                    value={rewardForm.rewardType}
                    onChange={(event) => updateRewardForm('rewardType', event.target.value)}
                  >
                    <option value="single_product">Producto</option>
                    <option value="choice">Eleccion</option>
                    <option value="combo">Combo</option>
                  </select>
                  <input
                    className="cfg-input"
                    type="number"
                    min="0"
                    step="1"
                    value={rewardForm.displayOrder}
                    onChange={(event) => updateRewardForm('displayOrder', event.target.value)}
                    placeholder="Orden"
                  />
                  <select
                    className="cfg-select"
                    value={rewardForm.active ? 'activo' : 'inactivo'}
                    onChange={(event) => updateRewardForm('active', event.target.value === 'activo')}
                  >
                    <option value="activo">Activo</option>
                    <option value="inactivo">Inactivo</option>
                  </select>
                  <select
                    className="cfg-select"
                    value={rewardForm.available ? 'disponible' : 'agotado'}
                    onChange={(event) => updateRewardForm('available', event.target.value === 'disponible')}
                  >
                    <option value="disponible">Disponible</option>
                    <option value="agotado">Sin disponibilidad</option>
                  </select>
                </div>

                <select
                  className="cfg-select"
                  value={rewardForm.imageProductCode}
                  onChange={(event) => updateRewardForm('imageProductCode', event.target.value)}
                >
                  <option value="">Producto para imagen principal</option>
                  {catalogOptions.map((product) => (
                    <option key={product.code} value={product.code}>
                      {product.name}
                    </option>
                  ))}
                </select>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    marginTop: 4,
                  }}
                >
                  <div>
                    <strong style={{ display: 'block', fontSize: 18 }}>Productos vinculados</strong>
                    <span style={{ color: '#64748b', fontWeight: 700 }}>
                      Agrega uno o varios productos. Marca opcion si el cliente debe elegir.
                    </span>
                  </div>
                  <button type="button" className="cfg-button secondary" onClick={addRewardItem}>
                    Agregar producto
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {rewardForm.items.length === 0 ? (
                    <div
                      style={{
                        padding: 16,
                        borderRadius: 16,
                        background: '#f8fafc',
                        border: '1px dashed #cbd5e1',
                        color: '#64748b',
                        fontWeight: 700,
                      }}
                    >
                      Este premio todavia no tiene productos vinculados.
                    </div>
                  ) : (
                    rewardForm.items.map((item, index) => (
                      <div
                        key={`${item.id || 'reward-item'}-${index}`}
                        style={{
                          display: 'grid',
                          gap: 10,
                          padding: 14,
                          borderRadius: 18,
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px 140px', gap: 10 }}>
                          <select
                            className="cfg-select"
                            value={item.productCode}
                            onChange={(event) => updateRewardItem(index, 'productCode', event.target.value)}
                          >
                            <option value="">Producto vinculado</option>
                            {catalogOptions.map((product) => (
                              <option key={product.code} value={product.code}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          <input
                            className="cfg-input"
                            type="number"
                            min="1"
                            step="1"
                            value={item.quantity}
                            onChange={(event) => updateRewardItem(index, 'quantity', event.target.value)}
                            placeholder="Cantidad"
                          />
                          <input
                            className="cfg-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.internalCost}
                            onChange={(event) => updateRewardItem(index, 'internalCost', event.target.value)}
                            placeholder="Costo item"
                          />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '150px minmax(0, 1fr) minmax(0, 1fr) 120px auto', gap: 10 }}>
                          <select
                            className="cfg-select"
                            value={item.isChoiceOption ? 'opcion' : 'fijo'}
                            onChange={(event) => updateRewardItem(index, 'isChoiceOption', event.target.value === 'opcion')}
                          >
                            <option value="fijo">Producto fijo</option>
                            <option value="opcion">Opcion</option>
                          </select>
                          <input
                            className="cfg-input"
                            value={item.choiceGroup}
                            onChange={(event) => updateRewardItem(index, 'choiceGroup', event.target.value)}
                            placeholder="Grupo de opcion"
                          />
                          <input
                            className="cfg-input"
                            value={item.choiceLabel}
                            onChange={(event) => updateRewardItem(index, 'choiceLabel', event.target.value)}
                            placeholder="Etiqueta visible"
                          />
                          <input
                            className="cfg-input"
                            type="number"
                            min="0"
                            step="1"
                            value={item.sortOrder}
                            onChange={(event) => updateRewardItem(index, 'sortOrder', event.target.value)}
                            placeholder="Orden"
                          />
                          <button type="button" className="cfg-button secondary" onClick={() => removeRewardItem(index)}>
                            Quitar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gap: 12 }}>
                <div
                  style={{
                    padding: 16,
                    borderRadius: 18,
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    color: '#9a3412',
                    fontWeight: 800,
                    lineHeight: 1.5,
                  }}
                >
                  Compra acumulada necesaria: <strong>{formatCurrency(rewardPreview.requiredSpend)}</strong>
                  <br />
                  Peso del premio: <strong>{Number(rewardPreview.rewardWeightPercent || 0).toFixed(2)}%</strong>
                </div>

                {rewardForm.imageProductCode && (
                  <div
                    style={{
                      padding: 16,
                      borderRadius: 18,
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                    }}
                  >
                    <div style={{ color: '#64748b', fontSize: 13, fontWeight: 900, marginBottom: 10 }}>
                      Imagen principal del premio
                    </div>
                    {catalogOptions.find((product) => product.code === rewardForm.imageProductCode)?.image ? (
                      <img
                        src={catalogOptions.find((product) => product.code === rewardForm.imageProductCode)?.image}
                        alt="Vista previa del premio"
                        style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 18 }}
                      />
                    ) : (
                      <div style={{ color: '#64748b', fontWeight: 700 }}>
                        El producto vinculado no tiene foto en el catalogo.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="cfg-button secondary" onClick={closeEditor} disabled={rewardSaving}>
                Cancelar
              </button>
              <button type="submit" className="cfg-button" disabled={rewardSaving}>
                {rewardSaving ? 'Guardando...' : 'Guardar premio'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
