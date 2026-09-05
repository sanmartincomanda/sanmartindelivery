import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteStoreIncentiveItem,
  getCampaignItems,
  getCampaignTiers,
  reconcileFirstOrderRewards,
  saveStoreIncentiveCampaign,
  saveStoreIncentiveItem,
  saveStoreIncentiveTier,
  seedDefaultFirstOrderRewardCampaignIfEmpty,
  subscribeStoreIncentiveConfig,
  subscribeStoreIncentiveReservations,
  updateStoreIncentiveItem,
} from '../services/storeIncentives';
import {
  FIRST_ORDER_REWARD_CAMPAIGN_ID,
  FIRST_ORDER_REWARD_CAMPAIGN_TYPE,
  normalizeIncentiveCampaign,
  normalizeIncentiveItem,
} from '../services/storeIncentiveCore';
import { mergeStoreBranches, subscribeStoreBranches } from '../services/storeBranches';
import '../styles/firstOrderRewardAdmin.css';

const EMPTY_ITEM = {
  id: '',
  campaignId: FIRST_ORDER_REWARD_CAMPAIGN_ID,
  tierId: '',
  name: '',
  description: '',
  sku: '',
  provider: '',
  image: '',
  stockAvailable: 0,
  stockReserved: 0,
  unitCost: 0,
  active: true,
  branchIds: [],
  displayOrder: 10,
  startsAt: '',
  endsAt: '',
};

const formatMoney = (value) =>
  new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
  }).format(Number(value || 0));

const formatDate = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = Number(value) > 0 ? new Date(Number(value)) : new Date(value || 0);
  return Number.isNaN(parsed.getTime())
    ? 'Sin fecha'
    : parsed.toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' });
};

const toDateTimeInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const fromDateTimeInput = (value) => (value ? new Date(value).toISOString() : '');
const normalizeStatus = (value = '') =>
  String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const isCancelled = (order = {}) => /cancel|anulad|fallid/.test(normalizeStatus(order.estado));
const isValidStoreOrder = (order = {}) => order?.canal === 'tienda_virtual' && !isCancelled(order);
const customerKeyForOrder = (order = {}) =>
  String(order.storeUserKey || '').trim() || String(order.telefono || '').replace(/\D/g, '');

const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });

function BranchChecks({ branches, value = [], onChange }) {
  const selected = new Set(value);
  return (
    <div className="first-reward-admin-branches">
      {branches.map((branch) => (
        <label key={branch.id}>
          <input
            type="checkbox"
            checked={selected.has(branch.id)}
            onChange={(event) => {
              const next = new Set(selected);
              if (event.target.checked) next.add(branch.id);
              else next.delete(branch.id);
              onChange(Array.from(next));
            }}
          />
          <span>{branch.shortName}</span>
        </label>
      ))}
    </div>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="first-reward-admin-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {detail && <span>{detail}</span>}
    </div>
  );
}

export default function FirstOrderRewardAdminSection({ storeUsers = [], storeOrders = [] }) {
  const [config, setConfig] = useState({ campaigns: [], tiers: [], items: [] });
  const [reservations, setReservations] = useState([]);
  const [branches, setBranches] = useState(() => mergeStoreBranches());
  const [campaignDraft, setCampaignDraft] = useState(null);
  const [tierDrafts, setTierDrafts] = useState({});
  const [itemDraft, setItemDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');

  const campaign = useMemo(
    () =>
      config.campaigns.find((entry) => entry.id === FIRST_ORDER_REWARD_CAMPAIGN_ID) ||
      config.campaigns.find((entry) => entry.type === FIRST_ORDER_REWARD_CAMPAIGN_TYPE) ||
      null,
    [config.campaigns]
  );
  const tiers = useMemo(() => getCampaignTiers(config, campaign?.id), [campaign?.id, config]);
  const items = useMemo(() => getCampaignItems(config, campaign?.id), [campaign?.id, config]);

  useEffect(() => {
    seedDefaultFirstOrderRewardCampaignIfEmpty().catch((error) => {
      console.error('No se pudo crear la campaña inicial de regalías:', error);
    });
    reconcileFirstOrderRewards().catch((error) => {
      console.warn('La conciliación de regalías se realizará más adelante:', error);
    });

    const unsubscribeConfig = subscribeStoreIncentiveConfig(setConfig, (error) => {
      console.error('No se pudo cargar la campaña:', error);
      setFeedback('No se pudo cargar la configuración de regalías.');
    });
    const unsubscribeReservations = subscribeStoreIncentiveReservations(setReservations, (error) => {
      console.error('No se pudo cargar la auditoría de regalías:', error);
    });
    const unsubscribeBranches = subscribeStoreBranches(setBranches, (error) => {
      console.warn('No se pudieron cargar las sucursales:', error);
    });
    return () => {
      unsubscribeConfig();
      unsubscribeReservations();
      unsubscribeBranches();
    };
  }, []);

  useEffect(() => {
    if (!campaign) return;
    setCampaignDraft({
      ...campaign,
      startsAt: toDateTimeInput(campaign.startsAt),
      endsAt: toDateTimeInput(campaign.endsAt),
    });
  }, [campaign]);

  useEffect(() => {
    setTierDrafts(
      Object.fromEntries(
        tiers.map((tier) => [tier.id, {
          ...tier,
          minAmount: String(tier.minAmount),
          maxAmount: tier.maxAmount > 0 ? String(tier.maxAmount) : '',
        }])
      )
    );
  }, [tiers]);

  const analytics = useMemo(() => {
    const benefited = reservations.filter((entry) => ['ordered', 'delivered'].includes(entry.status));
    const delivered = reservations.filter((entry) => entry.status === 'delivered');
    const validOrders = storeOrders.filter(isValidStoreOrder);
    const ordersByCustomer = new Map();
    validOrders.forEach((order) => {
      const key = customerKeyForOrder(order);
      if (!key) return;
      const list = ordersByCustomer.get(key) || [];
      list.push(order);
      ordersByCustomer.set(key, list);
    });
    const firstPurchaseCustomers = new Set(benefited.map((entry) => entry.customerId || entry.phoneKey));
    const secondPurchaseCount = benefited.filter((entry) => {
      const key = entry.customerId || '';
      return Number(ordersByCustomer.get(key)?.length || 0) >= 2;
    }).length;
    const itemCounts = new Map();
    benefited.forEach((entry) => itemCounts.set(entry.itemName, Number(itemCounts.get(entry.itemName) || 0) + 1));
    const mostChosen = Array.from(itemCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const average = benefited.length
      ? benefited.reduce((sum, entry) => sum + Number(entry.eligibleSubtotal || 0), 0) / benefited.length
      : 0;
    return {
      benefited,
      delivered,
      firstPurchaseCount: firstPurchaseCustomers.size,
      conversion: storeUsers.length ? (firstPurchaseCustomers.size / storeUsers.length) * 100 : 0,
      average,
      secondPurchaseCount,
      secondPurchaseRate: benefited.length ? (secondPurchaseCount / benefited.length) * 100 : 0,
      mostChosen: mostChosen ? `${mostChosen[0]} (${mostChosen[1]})` : 'Sin datos',
      exhausted: items.filter((item) => Number(item.stockAvailable || 0) <= 0).length,
      estimatedCost: delivered.reduce((sum, entry) => sum + Number(entry.unitCost || 0), 0),
    };
  }, [items, reservations, storeOrders, storeUsers.length]);

  const campaignStatus = useMemo(() => {
    if (!campaign?.active) return 'Pausada';
    const now = Date.now();
    if (campaign.startsAt && Date.parse(campaign.startsAt) > now) return 'Programada';
    if (campaign.endsAt && Date.parse(campaign.endsAt) <= now) return 'Finalizada';
    return 'Activa';
  }, [campaign]);

  const saveCampaign = async (event) => {
    event.preventDefault();
    if (!campaignDraft) return;
    setBusy('campaign');
    setFeedback('');
    try {
      await saveStoreIncentiveCampaign({
        ...campaignDraft,
        startsAt: fromDateTimeInput(campaignDraft.startsAt),
        endsAt: fromDateTimeInput(campaignDraft.endsAt),
      }, campaign);
      setFeedback('Campaña guardada. La tienda usará esta vigencia y estas sucursales.');
    } catch (error) {
      setFeedback(error?.message || 'No se pudo guardar la campaña.');
    } finally {
      setBusy('');
    }
  };

  const saveTier = async (tierId) => {
    const draft = tierDrafts[tierId];
    if (!draft) return;
    setBusy(`tier:${tierId}`);
    setFeedback('');
    try {
      await saveStoreIncentiveTier({
        ...draft,
        campaignId: campaign.id,
        minAmount: Number(draft.minAmount || 0),
        maxAmount: draft.maxAmount === '' ? 0 : Number(draft.maxAmount),
      }, tiers.find((tier) => tier.id === tierId));
      setFeedback(`Intervalo ${draft.internalName} actualizado.`);
    } catch (error) {
      setFeedback(error?.message || 'No se pudo guardar el intervalo.');
    } finally {
      setBusy('');
    }
  };

  const openNewItem = (tierId) => setItemDraft({ ...EMPTY_ITEM, campaignId: campaign.id, tierId });
  const openEditItem = (item) => setItemDraft({
    ...item,
    startsAt: toDateTimeInput(item.startsAt),
    endsAt: toDateTimeInput(item.endsAt),
  });

  const saveItem = async (event) => {
    event.preventDefault();
    setBusy('item');
    setFeedback('');
    try {
      const existing = items.find((entry) => entry.id === itemDraft.id && entry.tierId === itemDraft.tierId);
      await saveStoreIncentiveItem({
        ...itemDraft,
        stockAvailable: Number(itemDraft.stockAvailable || 0),
        unitCost: Number(itemDraft.unitCost || 0),
        displayOrder: Number(itemDraft.displayOrder || 0),
        startsAt: fromDateTimeInput(itemDraft.startsAt),
        endsAt: fromDateTimeInput(itemDraft.endsAt),
      }, existing);
      setItemDraft(null);
      setFeedback('Regalía guardada y disponible según su inventario.');
    } catch (error) {
      setFeedback(error?.message || 'No se pudo guardar la regalía.');
    } finally {
      setBusy('');
    }
  };

  const toggleItem = async (item) => {
    setBusy(`item:${item.id}`);
    try {
      await updateStoreIncentiveItem(item, { active: item.active === false });
    } catch (error) {
      setFeedback(error?.message || 'No se pudo cambiar el estado.');
    } finally {
      setBusy('');
    }
  };

  const removeItem = async (item) => {
    if (!window.confirm(`¿Eliminar la regalía ${item.name}?`)) return;
    setBusy(`item:${item.id}`);
    try {
      await deleteStoreIncentiveItem(item);
      setFeedback('Regalía eliminada.');
    } catch (error) {
      setFeedback(error?.message || 'No se pudo eliminar la regalía.');
    } finally {
      setBusy('');
    }
  };

  if (!campaignDraft || !campaign) {
    return (
      <section className="first-reward-admin-loading" aria-busy="true">
        <span /> <span /> <span />
      </section>
    );
  }

  return (
    <section className="first-reward-admin">
      {feedback && <div className="first-reward-admin-feedback" role="status">{feedback}</div>}

      <div className="first-reward-admin-hero">
        <div>
          <small>MARKETING · REGALIAS</small>
          <h2>Regalo Primera Compra</h2>
          <p>Motor de incentivos por ticket para convertir registros en primeros y segundos pedidos.</p>
        </div>
        <span className={`first-reward-admin-status status-${campaignStatus.toLowerCase()}`}>{campaignStatus}</span>
      </div>

      <div className="first-reward-admin-metrics">
        <Metric label="Usuarios registrados" value={storeUsers.length} />
        <Metric label="Pedidos beneficiados" value={analytics.benefited.length} detail="Reservados en pedidos válidos" />
        <Metric label="Ticket promedio inicial" value={formatMoney(analytics.average)} />
        <Metric label="Regalos entregados" value={analytics.delivered.length} />
        <Metric label="Registro a primer pedido" value={`${analytics.conversion.toFixed(1)}%`} detail={`${analytics.firstPurchaseCount} de ${storeUsers.length}`} />
        <Metric label="Primer a segundo pedido" value={`${analytics.secondPurchaseRate.toFixed(1)}%`} detail={`${analytics.secondPurchaseCount} clientes`} />
      </div>

      <form className="first-reward-admin-campaign" onSubmit={saveCampaign}>
        <div className="first-reward-admin-section-head">
          <div><small>CAMPAÑA ACTUAL</small><h3>{campaign.name}</h3></div>
          <button className="cfg-button" type="submit" disabled={busy === 'campaign'}>{busy === 'campaign' ? 'Guardando...' : 'Guardar campaña'}</button>
        </div>
        <div className="first-reward-admin-form-grid">
          <label><span>Nombre</span><input className="cfg-input" value={campaignDraft.name} onChange={(event) => setCampaignDraft((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>Estado</span><select className="cfg-select" value={campaignDraft.active ? 'active' : 'paused'} onChange={(event) => setCampaignDraft((current) => ({ ...current, active: event.target.value === 'active' }))}><option value="active">Activa</option><option value="paused">Pausada</option></select></label>
          <label><span>Inicio</span><input className="cfg-input" type="datetime-local" value={campaignDraft.startsAt} onChange={(event) => setCampaignDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
          <label><span>Final opcional</span><input className="cfg-input" type="datetime-local" value={campaignDraft.endsAt} onChange={(event) => setCampaignDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
        </div>
        <div className="first-reward-admin-date-line"><span>Vigencia</span><strong>{formatDate(campaign.startsAt)} → {campaign.endsAt ? formatDate(campaign.endsAt) : 'Sin fecha final'}</strong></div>
        <div><span className="first-reward-admin-field-label">Sucursales donde aplica</span><BranchChecks branches={branches} value={campaignDraft.branchIds} onChange={(branchIds) => setCampaignDraft((current) => ({ ...current, branchIds }))} /></div>
      </form>

      <div className="first-reward-admin-tiers">
        {tiers.map((tier) => {
          const draft = tierDrafts[tier.id] || tier;
          const tierItems = items.filter((item) => item.tierId === tier.id);
          const tierCustomers = new Set(
            analytics.benefited
              .filter((entry) => entry.tierId === tier.id)
              .map((entry) => entry.customerId || entry.phoneKey)
              .filter(Boolean)
          ).size;
          return (
            <article key={tier.id} className={`first-reward-admin-tier ${tier.premium ? 'is-premium' : ''}`}>
              <div className="first-reward-admin-tier__head">
                <div><small>{tier.premium ? 'SELECCION ESPECIAL' : 'INTERVALO'}</small><input value={draft.internalName || ''} onChange={(event) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...draft, internalName: event.target.value } }))} /></div>
                <span>{tierCustomers} clientes</span>
              </div>
              <div className="first-reward-admin-tier__range">
                <label><span>Desde C$</span><input type="number" min="0" step="0.01" value={draft.minAmount} onChange={(event) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...draft, minAmount: event.target.value } }))} /></label>
                <label><span>Hasta C$</span><input type="number" min="0" step="0.01" placeholder="Sin límite" value={draft.maxAmount} onChange={(event) => setTierDrafts((current) => ({ ...current, [tier.id]: { ...draft, maxAmount: event.target.value } }))} /></label>
                <button type="button" onClick={() => saveTier(tier.id)} disabled={busy === `tier:${tier.id}`}>Guardar</button>
              </div>
              <div className="first-reward-admin-items">
                {tierItems.map((item) => (
                  <div key={item.id} className={`first-reward-admin-item ${item.active === false ? 'is-off' : ''}`}>
                    <img src={item.image || '/tienda/branding/product-placeholder.svg'} alt={item.name} />
                    <div><strong>{item.name}</strong><span>SKU {item.sku}</span><small>{item.stockAvailable} disponibles · {item.stockReserved} reservados</small></div>
                    <div className="first-reward-admin-item__actions">
                      <button type="button" onClick={() => openEditItem(item)}>Editar</button>
                      <button type="button" onClick={() => toggleItem(item)}>{item.active === false ? 'Activar' : 'Pausar'}</button>
                      <button type="button" className="danger" onClick={() => removeItem(item)}>Eliminar</button>
                    </div>
                  </div>
                ))}
                {tierItems.length === 0 && <div className="first-reward-admin-empty">Aún no hay regalos en este intervalo.</div>}
              </div>
              <button type="button" className="first-reward-admin-add" onClick={() => openNewItem(tier.id)}>+ Agregar regalía</button>
            </article>
          );
        })}
      </div>

      <div className="first-reward-admin-insights">
        <Metric label="Regalía más elegida" value={analytics.mostChosen} />
        <Metric label="Regalías agotadas" value={analytics.exhausted} />
        <Metric label="Costo estimado entregado" value={formatMoney(analytics.estimatedCost)} />
      </div>

      <div className="first-reward-admin-audit">
        <div className="first-reward-admin-section-head"><div><small>AUDITORIA</small><h3>Historial de regalías</h3></div><span>{reservations.length} registros</span></div>
        <div className="first-reward-admin-table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Pedido</th><th>Fecha</th><th>Carrito</th><th>Intervalo</th><th>Regalo</th><th>Sucursal</th><th>Estado</th></tr></thead>
            <tbody>
              {reservations.map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{entry.customerName || 'Cliente'}</strong><small>Tel. •••• {entry.phoneSuffix || '----'}</small></td>
                  <td>{entry.orderNumber || entry.orderKey || 'Sin pedido'}</td>
                  <td>{formatDate(entry.orderedAt || entry.reservedAt)}</td>
                  <td>{formatMoney(entry.eligibleSubtotal)}</td>
                  <td>{entry.tierName}</td><td>{entry.itemName}</td><td>{entry.branchId}</td>
                  <td><span className={`first-reward-admin-audit-status status-${entry.status}`}>{entry.status}</span></td>
                </tr>
              ))}
              {reservations.length === 0 && <tr><td colSpan="8" className="first-reward-admin-empty">Todavía no hay pedidos beneficiados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {itemDraft && typeof document !== 'undefined' && createPortal((
        <div className="first-reward-admin-modal" onMouseDown={() => setItemDraft(null)}>
          <form className="first-reward-admin-editor" onSubmit={saveItem} onMouseDown={(event) => event.stopPropagation()}>
            <div className="first-reward-admin-section-head"><div><small>REGALIA</small><h3>{itemDraft.id ? 'Editar opción' : 'Nueva opción'}</h3></div><button type="button" className="first-reward-admin-close" onClick={() => setItemDraft(null)}>×</button></div>
            <div className="first-reward-admin-editor__preview"><img src={itemDraft.image || '/tienda/branding/product-placeholder.svg'} alt="Vista previa" /><label><span>Imagen del producto</span><input type="file" accept="image/*" onChange={async (event) => { const file = event.target.files?.[0]; if (file) { const image = await readImageFile(file); setItemDraft((current) => ({ ...current, image })); } }} /></label></div>
            <div className="first-reward-admin-form-grid">
              <label><span>Nombre</span><input className="cfg-input" required value={itemDraft.name} onChange={(event) => setItemDraft((current) => ({ ...current, name: event.target.value }))} /></label>
              <label><span>SKU SICAR</span><input className="cfg-input" required value={itemDraft.sku} onChange={(event) => setItemDraft((current) => ({ ...current, sku: event.target.value }))} /></label>
              <label><span>Proveedor opcional</span><input className="cfg-input" value={itemDraft.provider} onChange={(event) => setItemDraft((current) => ({ ...current, provider: event.target.value }))} /></label>
              <label><span>Stock promocional</span><input className="cfg-input" type="number" min="0" step="1" value={itemDraft.stockAvailable} onChange={(event) => setItemDraft((current) => ({ ...current, stockAvailable: event.target.value }))} /></label>
              <label><span>Costo unitario opcional</span><input className="cfg-input" type="number" min="0" step="0.01" value={itemDraft.unitCost} onChange={(event) => setItemDraft((current) => ({ ...current, unitCost: event.target.value }))} /></label>
              <label><span>Posición</span><input className="cfg-input" type="number" step="1" value={itemDraft.displayOrder} onChange={(event) => setItemDraft((current) => ({ ...current, displayOrder: event.target.value }))} /></label>
              <label><span>Inicio opcional</span><input className="cfg-input" type="datetime-local" value={itemDraft.startsAt} onChange={(event) => setItemDraft((current) => ({ ...current, startsAt: event.target.value }))} /></label>
              <label><span>Final opcional</span><input className="cfg-input" type="datetime-local" value={itemDraft.endsAt} onChange={(event) => setItemDraft((current) => ({ ...current, endsAt: event.target.value }))} /></label>
            </div>
            <label><span>Descripción corta</span><textarea className="cfg-textarea" rows="3" value={itemDraft.description} onChange={(event) => setItemDraft((current) => ({ ...current, description: event.target.value }))} /></label>
            <label className="first-reward-admin-switch"><input type="checkbox" checked={itemDraft.active !== false} onChange={(event) => setItemDraft((current) => ({ ...current, active: event.target.checked }))} /><span>Disponible para clientes</span></label>
            <div><span className="first-reward-admin-field-label">Sucursales</span><BranchChecks branches={branches} value={itemDraft.branchIds} onChange={(branchIds) => setItemDraft((current) => ({ ...current, branchIds }))} /></div>
            <button className="cfg-button" type="submit" disabled={busy === 'item'}>{busy === 'item' ? 'Guardando...' : 'Guardar regalía'}</button>
          </form>
        </div>
      ), document.body)}
    </section>
  );
}
