import React, { useEffect, useMemo, useState } from 'react';
import {
  buildGoogleMapsPlaceUrl,
  getBrowserLocation,
  normalizeLocation,
  reverseGeocodeLocation,
  searchLocationCandidates,
} from '../services/geo';
import {
  getStoreBranchDeliverySettings,
  mergeStoreBranches,
  saveStoreBranch,
  seedDefaultStoreBranchesIfEmpty,
  subscribeStoreBranches,
} from '../services/storeBranches';
import {
  DEFAULT_STORE_DELIVERY_SETTINGS,
  STORE_DELIVERY_FEE_BRACKETS,
  getStoreDeliveryFeeRows,
  normalizeStoreDeliverySettings,
  normalizeStoreOperationHours,
  subscribeStoreDeliverySettings,
  validateStoreOperationHours,
} from '../services/storeDeliverySettings';
import StoreOperationHoursEditor from './StoreOperationHoursEditor';

const branchToForm = (branch = {}, globalSettings = DEFAULT_STORE_DELIVERY_SETTINGS) => {
  const effectiveDeliverySettings = getStoreBranchDeliverySettings(branch, globalSettings);
  return {
    id: branch.id || '',
    name: branch.name || '',
    shortName: branch.shortName || '',
    brandTitle: branch.brandTitle || '',
    city: branch.city || '',
    address: branch.address || '',
    phone: branch.phone || '',
    whatsapp: branch.whatsapp || '',
    lat: branch.storeLocation?.lat ?? '',
    lng: branch.storeLocation?.lng ?? '',
    coverageRadiusKm: branch.coverageRadiusKm ?? 7.5,
    switchPromptRadiusKm: branch.switchPromptRadiusKm ?? 12,
    taxRate: effectiveDeliverySettings.taxRate,
    fees: effectiveDeliverySettings.fees,
    operationHours: effectiveDeliverySettings.operationHours,
    active: branch.active !== false,
    acceptingOrders: branch.acceptingOrders !== false,
    displayOrder: branch.displayOrder ?? 999,
  };
};

export default function StoreBranchesAdminSection() {
  const [branches, setBranches] = useState(() => mergeStoreBranches());
  const [globalDeliverySettings, setGlobalDeliverySettings] = useState(
    DEFAULT_STORE_DELIVERY_SETTINGS
  );
  const [selectedBranchId, setSelectedBranchId] = useState('granada');
  const [form, setForm] = useState(() =>
    branchToForm(mergeStoreBranches()[0], DEFAULT_STORE_DELIVERY_SETTINGS)
  );
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');
  const [addressSearch, setAddressSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeStoreBranches(
      (nextBranches) => setBranches(nextBranches),
      (error) => {
        console.error('No se pudieron cargar las sucursales:', error);
        setMessage('No se pudieron cargar las sucursales guardadas. Se muestran los datos base.');
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreDeliverySettings(
      (settings) => setGlobalDeliverySettings(settings),
      (error) => console.error('No se pudo cargar el horario base de las sucursales:', error)
    );
    return () => unsubscribe();
  }, []);

  const selectedBranch = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId) || branches[0],
    [branches, selectedBranchId]
  );

  useEffect(() => {
    if (selectedBranch) {
      setForm(branchToForm(selectedBranch, globalDeliverySettings));
    }
  }, [globalDeliverySettings, selectedBranch]);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateFee = (feeKey, value) => {
    setForm((current) => ({
      ...current,
      fees: {
        ...(current.fees || {}),
        [feeKey]: value,
      },
    }));
  };

  const chooseSearchResult = (result) => {
    updateField('lat', result.lat);
    updateField('lng', result.lng);
    updateField('address', result.label || result.shortLabel || addressSearch);
    setAddressSearch(result.label || result.shortLabel || '');
    setSearchResults([]);
  };

  const searchAddress = async () => {
    if (addressSearch.trim().length < 3) {
      setMessage('Escribe al menos tres letras para buscar la ubicación.');
      return;
    }

    setSearching(true);
    setMessage('');
    try {
      const results = await searchLocationCandidates(addressSearch, {
        countryCode: 'ni',
        limit: 8,
        broad: true,
      });
      setSearchResults(results);
      if (results.length === 0) {
        setMessage('No encontramos coincidencias. Puedes escribir las coordenadas manualmente.');
      }
    } catch (error) {
      console.error('No se pudo buscar la sucursal:', error);
      setMessage('No pudimos buscar esa ubicación en este momento.');
    } finally {
      setSearching(false);
    }
  };

  const captureCurrentLocation = async () => {
    setLocating(true);
    setMessage('');
    try {
      const location = await getBrowserLocation();
      const resolved = (await reverseGeocodeLocation(location)) || location;
      updateField('lat', resolved.lat);
      updateField('lng', resolved.lng);
      if (resolved.label) {
        updateField('address', resolved.label);
      }
      setMessage('Ubicación capturada. Revisa la dirección y guarda la sucursal.');
    } catch (error) {
      console.error('No se pudo capturar la ubicación:', error);
      setMessage('Activa el permiso de ubicación e intenta nuevamente.');
    } finally {
      setLocating(false);
    }
  };

  const saveBranch = async (event) => {
    event.preventDefault();
    const location = normalizeLocation({
      lat: form.lat,
      lng: form.lng,
      label: form.name,
    });

    if (!form.id.trim() || !form.name.trim() || !location) {
      setMessage('Completa código, nombre y coordenadas válidas.');
      return;
    }

    const operationHours = normalizeStoreOperationHours(
      form.operationHours,
      globalDeliverySettings.operationHours
    );
    const deliverySettings = normalizeStoreDeliverySettings(
      {
        ...globalDeliverySettings,
        storeLocation: location,
        coverageRadiusKm: form.coverageRadiusKm,
        taxRate: form.taxRate,
        fees: form.fees,
        operationHours,
      },
      globalDeliverySettings
    );
    const scheduleError = validateStoreOperationHours(deliverySettings);
    if (scheduleError) {
      setMessage(scheduleError);
      return;
    }

    if (!Number.isFinite(Number(form.coverageRadiusKm)) || Number(form.coverageRadiusKm) <= 0) {
      setMessage('Completa un radio de cobertura valido.');
      return;
    }

    const branchDeliverySettings = {
      taxRate: deliverySettings.taxRate,
      coverageRadiusKm: deliverySettings.coverageRadiusKm,
      storeLocation: deliverySettings.storeLocation,
      fees: deliverySettings.fees,
      operationHours,
      updatedAt: Date.now(),
    };

    setSaving(true);
    setMessage('Guardando sucursal...');
    try {
      const saved = await saveStoreBranch({
        ...selectedBranch,
        ...form,
        id: form.id.trim().toLowerCase(),
        storeLocation: location,
        coverageRadiusKm: deliverySettings.coverageRadiusKm,
        switchPromptRadiusKm: Number(form.switchPromptRadiusKm),
        displayOrder: Number(form.displayOrder),
        deliverySettings: branchDeliverySettings,
      });
      setSelectedBranchId(saved.id);
      setMessage(`${saved.name} guardada. La tienda ya puede detectarla por ubicación.`);
    } catch (error) {
      console.error('No se pudo guardar la sucursal:', error);
      setMessage(error?.message || 'No se pudo guardar la sucursal.');
    } finally {
      setSaving(false);
    }
  };

  const seedBranches = async () => {
    setSaving(true);
    setMessage('Preparando Granada, Masaya y Nindirí...');
    try {
      const nextBranches = await seedDefaultStoreBranchesIfEmpty(branches);
      setBranches(nextBranches);
      setMessage('Sucursales base verificadas. No se sobrescribieron cambios existentes.');
    } catch (error) {
      console.error('No se pudieron inicializar las sucursales:', error);
      setMessage('No se pudieron guardar las sucursales base.');
    } finally {
      setSaving(false);
    }
  };

  const mapLocation = normalizeLocation({
    lat: form.lat,
    lng: form.lng,
    label: form.name,
  });
  const mapUrl = buildGoogleMapsPlaceUrl(mapLocation);
  const deliveryPreview = useMemo(
    () =>
      normalizeStoreDeliverySettings(
        {
          ...globalDeliverySettings,
          storeLocation: mapLocation || globalDeliverySettings.storeLocation,
          coverageRadiusKm: form.coverageRadiusKm,
          taxRate: form.taxRate,
          fees: form.fees,
          operationHours: form.operationHours,
        },
        globalDeliverySettings
      ),
    [form.coverageRadiusKm, form.fees, form.operationHours, form.taxRate, globalDeliverySettings, mapLocation]
  );
  const feeRows = useMemo(() => getStoreDeliveryFeeRows(deliveryPreview), [deliveryPreview]);

  return (
    <section className="cfg-section-card">
      <div className="branch-admin-head">
        <div>
          <span className="branch-admin-kicker">Operación multitienda</span>
          <h2>Granada, Masaya y Nindirí</h2>
          <p>
            Cada pedido quedará asignado a una sucursal. La app sugerirá automáticamente la más cercana,
            pero el cliente conservará la decisión final.
          </p>
        </div>
        <button type="button" className="cfg-button secondary" onClick={seedBranches} disabled={saving}>
          Verificar sucursales base
        </button>
      </div>

      {message && <div className="branch-admin-message">{message}</div>}

      <div className="branch-admin-layout">
        <aside className="branch-admin-list">
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              className={`branch-admin-card ${branch.id === selectedBranch?.id ? 'active' : ''}`}
              onClick={() => setSelectedBranchId(branch.id)}
            >
              <span className="branch-admin-pin">●</span>
              <span>
                <strong>{branch.name}</strong>
                <small>{branch.address}</small>
                <em>
                  {branch.active === false
                    ? 'Inactiva'
                    : branch.acceptingOrders === false
                      ? 'Pedidos pausados'
                      : 'Recibiendo pedidos'}
                </em>
              </span>
            </button>
          ))}
        </aside>

        <form className="branch-admin-form" onSubmit={saveBranch}>
          <div className="branch-admin-form-head">
            <div>
              <span>Editar sucursal</span>
              <h3>{form.name || 'Nueva sucursal'}</h3>
            </div>
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noreferrer">
                Ver en mapa
              </a>
            )}
          </div>

          <div className="branch-admin-grid two">
            <label>
              Código
              <input
                className="cfg-input"
                value={form.id}
                onChange={(event) => updateField('id', event.target.value)}
                disabled={Boolean(selectedBranch?.id)}
              />
            </label>
            <label>
              Orden
              <input
                className="cfg-input"
                type="number"
                min="1"
                value={form.displayOrder}
                onChange={(event) => updateField('displayOrder', event.target.value)}
              />
            </label>
          </div>

          <label>
            Nombre público
            <input
              className="cfg-input"
              value={form.name}
              onChange={(event) => updateField('name', event.target.value)}
            />
          </label>
          <div className="branch-admin-grid two">
            <label>
              Nombre corto
              <input
                className="cfg-input"
                value={form.shortName}
                onChange={(event) => updateField('shortName', event.target.value)}
              />
            </label>
            <label>
              Ciudad
              <input
                className="cfg-input"
                value={form.city}
                onChange={(event) => updateField('city', event.target.value)}
              />
            </label>
          </div>
          <label>
            Título de la tienda
            <input
              className="cfg-input"
              value={form.brandTitle}
              onChange={(event) => updateField('brandTitle', event.target.value)}
            />
          </label>
          <label>
            Dirección
            <input
              className="cfg-input"
              value={form.address}
              onChange={(event) => updateField('address', event.target.value)}
            />
          </label>

          <div className="branch-admin-search">
            <input
              className="cfg-input"
              value={addressSearch}
              onChange={(event) => setAddressSearch(event.target.value)}
              placeholder="Buscar ubicación de la sucursal"
            />
            <button type="button" className="cfg-button secondary" onClick={searchAddress} disabled={searching}>
              {searching ? 'Buscando...' : 'Buscar'}
            </button>
            <button type="button" className="cfg-button secondary" onClick={captureCurrentLocation} disabled={locating}>
              {locating ? 'Ubicando...' : 'Usar mi ubicación'}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="branch-admin-results">
              {searchResults.map((result) => (
                <button type="button" key={result.placeId || `${result.lat}-${result.lng}`} onClick={() => chooseSearchResult(result)}>
                  <strong>{result.shortLabel || result.label}</strong>
                  <span>{result.label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="branch-admin-grid two">
            <label>
              Latitud
              <input
                className="cfg-input"
                type="number"
                step="0.0000001"
                value={form.lat}
                onChange={(event) => updateField('lat', event.target.value)}
              />
            </label>
            <label>
              Longitud
              <input
                className="cfg-input"
                type="number"
                step="0.0000001"
                value={form.lng}
                onChange={(event) => updateField('lng', event.target.value)}
              />
            </label>
          </div>

          <div className="branch-admin-grid two">
            <label>
              Radio de cobertura (km)
              <input
                className="cfg-input"
                type="number"
                min="0.5"
                step="0.1"
                value={form.coverageRadiusKm}
                onChange={(event) => updateField('coverageRadiusKm', event.target.value)}
              />
            </label>
            <label>
              Radio para sugerir cambio (km)
              <input
                className="cfg-input"
                type="number"
                min="1"
                step="0.5"
                value={form.switchPromptRadiusKm}
                onChange={(event) => updateField('switchPromptRadiusKm', event.target.value)}
              />
            </label>
          </div>

          <section className="branch-admin-delivery-panel">
            <div>
              <span className="branch-admin-kicker">Entrega de esta sucursal</span>
              <h3>Tarifas y cobertura</h3>
              <p>
                Estos montos aplican solamente a {form.shortName || form.city || form.name || 'esta sucursal'}.
                El cliente vera el total con IVA segun la distancia.
              </p>
            </div>

            <label>
              IVA de envio (%)
              <input
                className="cfg-input"
                type="number"
                min="0"
                step="0.01"
                value={form.taxRate}
                onChange={(event) => updateField('taxRate', event.target.value)}
              />
            </label>

            <div className="branch-admin-fee-grid">
              {STORE_DELIVERY_FEE_BRACKETS.map((bracket, index) => {
                const row = feeRows[index] || {};
                return (
                  <label className="branch-admin-fee-card" key={bracket.key}>
                    <span>
                      <strong>{bracket.label}</strong>
                      <em>Total cliente: C$ {Number(row.totalFee || 0).toFixed(2)}</em>
                    </span>
                    <input
                      className="cfg-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.fees?.[bracket.key] ?? ''}
                      onChange={(event) => updateFee(bracket.key, event.target.value)}
                      placeholder="Costo base"
                    />
                    <small>
                      Base C$ {Number(row.baseFee || 0).toFixed(2)} + IVA C${' '}
                      {Number(row.taxAmount || 0).toFixed(2)}
                    </small>
                  </label>
                );
              })}
            </div>
          </section>

          <div className="branch-admin-grid two">
            <label>
              Teléfono
              <input
                className="cfg-input"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
              />
            </label>
            <label>
              WhatsApp con código de país
              <input
                className="cfg-input"
                value={form.whatsapp}
                onChange={(event) => updateField('whatsapp', event.target.value)}
              />
            </label>
          </div>

          <div className="branch-admin-toggles">
            <label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateField('active', event.target.checked)}
              />
              Visible en la app
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.acceptingOrders}
                onChange={(event) => updateField('acceptingOrders', event.target.checked)}
              />
              Recibiendo pedidos
            </label>
          </div>

          <StoreOperationHoursEditor
            value={form.operationHours}
            onChange={(operationHours) => updateField('operationHours', operationHours)}
            title={`Horario de ${form.shortName || form.city || 'la sucursal'}`}
            description="Este horario aplica solamente a esta sucursal y se muestra al cliente cuando esta cerrada."
            disabled={saving}
          />

          <button type="submit" className="cfg-button" disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar sucursal'}
          </button>
        </form>
      </div>

      <style>{`
        .branch-admin-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }
        .branch-admin-head h2 {
          margin: 5px 0;
          font-size: 28px;
        }
        .branch-admin-head p {
          max-width: 720px;
          margin: 0;
          color: #64748b;
          font-weight: 700;
          line-height: 1.5;
        }
        .branch-admin-kicker {
          color: #0c4d88;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .branch-admin-message {
          margin-top: 14px;
          padding: 12px 14px;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
          background: #eff6ff;
          color: #1e3a8a;
          font-weight: 800;
        }
        .branch-admin-layout {
          display: grid;
          grid-template-columns: minmax(250px, 0.72fr) minmax(0, 1.55fr);
          gap: 18px;
          margin-top: 18px;
          align-items: start;
        }
        .branch-admin-list,
        .branch-admin-form {
          display: grid;
          gap: 10px;
        }
        .branch-admin-card {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 10px;
          padding: 14px;
          border: 1px solid #dce7f3;
          border-radius: 16px;
          background: #ffffff;
          color: #0f2f52;
          text-align: left;
          cursor: pointer;
        }
        .branch-admin-card.active {
          border-color: #3b82f6;
          background: #eff7ff;
          box-shadow: 0 12px 25px rgba(12, 77, 136, 0.1);
        }
        .branch-admin-card > span:last-child {
          display: grid;
          gap: 4px;
        }
        .branch-admin-card small {
          color: #64748b;
          font-weight: 700;
        }
        .branch-admin-card em {
          color: #0f8a54;
          font-size: 12px;
          font-style: normal;
          font-weight: 950;
        }
        .branch-admin-pin {
          width: 30px;
          height: 30px;
          display: grid;
          place-items: center;
          border-radius: 10px;
          background: #dceeff;
          color: #0c4d88;
        }
        .branch-admin-form {
          padding: 18px;
          border: 1px solid #dce7f3;
          border-radius: 18px;
          background: #ffffff;
        }
        .branch-admin-form label {
          display: grid;
          gap: 6px;
          color: #334155;
          font-size: 13px;
          font-weight: 900;
        }
        .branch-admin-form-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
        }
        .branch-admin-form-head span {
          color: #64748b;
          font-size: 12px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .branch-admin-form-head h3 {
          margin: 3px 0 0;
          font-size: 22px;
        }
        .branch-admin-form-head a {
          color: #0c4d88;
          font-weight: 900;
        }
        .branch-admin-grid {
          display: grid;
          gap: 10px;
        }
        .branch-admin-grid.two {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .branch-admin-delivery-panel {
          display: grid;
          gap: 12px;
          padding: 14px;
          border: 1px solid #dce7f3;
          border-radius: 16px;
          background: #f8fbff;
        }
        .branch-admin-delivery-panel h3 {
          margin: 4px 0;
          color: #102a4a;
          font-size: 20px;
        }
        .branch-admin-delivery-panel p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
          font-weight: 750;
          line-height: 1.45;
        }
        .branch-admin-fee-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .branch-admin-fee-card {
          padding: 12px;
          border: 1px solid #dbe7f4;
          border-radius: 14px;
          background: #ffffff;
        }
        .branch-admin-fee-card span {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: flex-start;
        }
        .branch-admin-fee-card em {
          color: #0c4d88;
          font-size: 12px;
          font-style: normal;
          font-weight: 950;
          white-space: nowrap;
        }
        .branch-admin-fee-card small {
          color: #64748b;
          font-size: 12px;
          font-weight: 750;
        }
        .branch-admin-search {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 8px;
        }
        .branch-admin-results {
          display: grid;
          gap: 6px;
          max-height: 240px;
          overflow: auto;
          padding: 8px;
          border: 1px solid #dce7f3;
          border-radius: 12px;
          background: #f8fbff;
        }
        .branch-admin-results button {
          display: grid;
          gap: 3px;
          padding: 10px;
          border: 0;
          border-radius: 10px;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
        }
        .branch-admin-results span {
          color: #64748b;
          font-size: 12px;
        }
        .branch-admin-toggles {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
          padding: 12px;
          border-radius: 12px;
          background: #f8fafc;
        }
        .branch-admin-toggles label {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        @media (max-width: 900px) {
          .branch-admin-layout,
          .branch-admin-grid.two,
          .branch-admin-fee-grid,
          .branch-admin-search {
            grid-template-columns: 1fr;
          }
          .branch-admin-head {
            flex-direction: column;
          }
        }
      `}</style>
    </section>
  );
}
