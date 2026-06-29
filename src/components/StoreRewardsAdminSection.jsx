import React, { useEffect, useMemo, useState } from 'react';
import {
  calculateStoreRewardRequiredSpend,
  calculateStoreRewardWeightPercent,
  DEFAULT_STORE_REWARD_SETTINGS,
  deleteStoreReward,
  mergeStoreRewards,
  normalizeStoreReward,
  normalizeStoreRewardSettings,
  saveStoreReward,
  saveStoreRewardSettings,
  seedDefaultStoreRewardsProgramIfEmpty,
  subscribeStoreRewardSettings,
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

export default function StoreRewardsAdminSection({ catalog = [] }) {
  const [settings, setSettings] = useState(DEFAULT_STORE_REWARD_SETTINGS);
  const [rewardMap, setRewardMap] = useState({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [rewardSaving, setRewardSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [rewardForm, setRewardForm] = useState(createEmptyRewardForm());

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

  const updateSettingsField = (field, value) => {
    setSettings((current) => ({
      ...current,
      [field]: field === 'enabled' ? value : value,
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
