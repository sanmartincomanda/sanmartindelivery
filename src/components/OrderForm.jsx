import React, { useEffect, useMemo, useState } from 'react';
import { hoyISO, normalizar } from './Utils';
import {
  MANUAL_CHANNEL,
  ORDER_FULFILLMENT_DELIVERY,
  ORDER_FULFILLMENT_PICKUP,
  formatOrderNumber,
} from '../services/orders';
import { buildGoogleMapsPlaceUrl, getBrowserLocation, hasLocation } from '../services/geo';
import { createManualClient } from '../services/clientDirectory';
import {
  getCurrentCatalogMap,
  getProductMinQuantity,
  getProductQuantityStep,
  mergeCatalogProducts,
} from '../services/storeCatalog';
import {
  calculateStoreDeliveryQuote,
  formatStoreDeliveryDistance,
  subscribeStoreDeliverySettings,
} from '../services/storeDeliverySettings';
import {
  getStoreBranchById,
  getStoreBranchDeliverySettings,
  mergeStoreBranches,
  subscribeStoreBranches,
} from '../services/storeBranches';

const BRAND_LOGO_PATH = '/tienda/branding/logo-mark.svg';

const PAYMENT_OPTIONS = [
  'Efectivo',
  'POS BAC',
  'POS BANPRO',
  'POS LAFISE',
  'LINK DE PAGO',
  'TRANSFERENCIA',
  'CREDITO',
];

export default function OrderForm({
  onAddOrder,
  clientes = [],
  allowClientDirectory = true,
  nextOrderNumber = 1,
  branchId = 'granada',
}) {
  const [clienteInput, setClienteInput] = useState('');
  const [pedido, setPedido] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);
  const [showNewClient, setShowNewClient] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({
    nombre: '',
    codigo: '',
    telefono: '',
    direccion: '',
    ubicacion: null,
  });
  const [savingClient, setSavingClient] = useState(false);
  const [locatingClient, setLocatingClient] = useState(false);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [fulfillmentType, setFulfillmentType] = useState(ORDER_FULFILLMENT_DELIVERY);
  const [hoverIdx, setHoverIdx] = useState(-1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successNumber, setSuccessNumber] = useState(null);
  const [deliverySettings, setDeliverySettings] = useState(null);
  const [storeBranches, setStoreBranches] = useState(() => mergeStoreBranches());
  const [deliverySettingsError, setDeliverySettingsError] = useState(false);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [orderItems, setOrderItems] = useState([]);

  const previewNumber = formatOrderNumber(nextOrderNumber, branchId);

  useEffect(() => {
    const unsubscribe = subscribeStoreDeliverySettings(
      (settings) => {
        setDeliverySettings(settings);
        setDeliverySettingsError(false);
      },
      (error) => {
        console.error('No se pudo cargar la configuracion de entrega:', error);
        setDeliverySettingsError(true);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeStoreBranches(
      (branches) => setStoreBranches(branches),
      (error) => console.error('No se pudieron cargar las sucursales para el envio:', error)
    );
    return () => unsubscribe();
  }, []);

  const selectedBranch = useMemo(
    () => getStoreBranchById(storeBranches, branchId),
    [branchId, storeBranches]
  );
  const activeDeliverySettings = useMemo(
    () =>
      deliverySettings
        ? getStoreBranchDeliverySettings(selectedBranch, deliverySettings)
        : null,
    [deliverySettings, selectedBranch]
  );

  useEffect(() => {
    let cancelled = false;

    getCurrentCatalogMap()
      .then((catalogMap) => {
        if (cancelled) {
          return;
        }

        setCatalog(mergeCatalogProducts(catalogMap).filter((product) => product.active !== false));
        setCatalogError(false);
      })
      .catch((error) => {
        console.error('No se pudo cargar el catalogo para el pedido manual:', error);
        if (!cancelled) {
          setCatalogError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCatalogLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const deliveryQuote = useMemo(() => {
    if (fulfillmentType === ORDER_FULFILLMENT_PICKUP) {
      return calculateStoreDeliveryQuote({ fulfillmentType });
    }

    if (!activeDeliverySettings) {
      return null;
    }

    return calculateStoreDeliveryQuote({
      settings: activeDeliverySettings,
      destination: selectedClient?.ubicacion || null,
      fulfillmentType,
    });
  }, [activeDeliverySettings, fulfillmentType, selectedClient]);

  const sugerencias = useMemo(() => {
    if (!allowClientDirectory) {
      return [];
    }

    const normalizedInput = normalizar(clienteInput || '');
    if (!normalizedInput) {
      return [];
    }

    return (clientes || [])
      .filter((client) => normalizar(client.nombre || '').includes(normalizedInput))
      .slice(0, 6);
  }, [allowClientDirectory, clienteInput, clientes]);

  const productSuggestions = useMemo(() => {
    const normalizedSearch = normalizar(productSearch || '');
    if (!normalizedSearch) {
      return [];
    }

    return catalog
      .filter((product) => {
        const searchText = normalizar(`${product.code || ''} ${product.name || ''}`);
        return searchText.includes(normalizedSearch);
      })
      .slice(0, 8);
  }, [catalog, productSearch]);

  const manualSubtotal = useMemo(
    () =>
      Number(
        orderItems
          .reduce(
            (sum, item) => sum + Number(item.cantidad || 0) * Number(item.precioUnitario || 0),
            0
          )
          .toFixed(2)
      ),
    [orderItems]
  );
  const hasOrderDetail = orderItems.length > 0 || Boolean(pedido.trim());

  const addCatalogProduct = (product) => {
    const code = String(product?.code || '').trim();
    if (!code) {
      return;
    }

    const minQuantity = getProductMinQuantity(product);
    const quantityStep = getProductQuantityStep(product);

    setOrderItems((currentItems) => {
      const existingIndex = currentItems.findIndex((item) => item.codigo === code);
      if (existingIndex === -1) {
        return [
          ...currentItems,
          {
            codigo: code,
            nombre: product.name,
            descripcion: product.description || '',
            unidad: product.unit || 'lb',
            cantidad: minQuantity,
            precioUnitario: Number(product.price || 0),
            minQuantity,
            quantityStep,
          },
        ];
      }

      return currentItems.map((item, index) =>
        index === existingIndex
          ? {
              ...item,
              cantidad: Number((Number(item.cantidad || 0) + quantityStep).toFixed(3)),
            }
          : item
      );
    });
    setProductSearch('');
  };

  const updateOrderItemQuantity = (code, value) => {
    setOrderItems((currentItems) =>
      currentItems.map((item) => {
        if (item.codigo !== code) {
          return item;
        }

        const numericValue = Number(value);
        return {
          ...item,
          cantidad: Number.isFinite(numericValue) && numericValue > 0 ? numericValue : item.minQuantity,
        };
      })
    );
  };

  const removeOrderItem = (code) => {
    setOrderItems((currentItems) => currentItems.filter((item) => item.codigo !== code));
  };

  const handleSelectCliente = (client) => {
    setSelectedClient(client);
    setClienteInput(client.nombre || '');
    setShowNewClient(false);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!hasOrderDetail) {
      alert('Agrega productos del catalogo o escribe la nota del pedido.');
      return;
    }

    const manualClientName = clienteInput.trim();
    if (!selectedClient && !manualClientName) {
      alert(
        allowClientDirectory
          ? 'Selecciona un cliente de la lista, crea uno nuevo o escribe el nombre.'
          : 'Escribe el nombre del cliente.'
      );
      return;
    }

    const orderClient = selectedClient || {
      nombre: manualClientName,
      codigo: '-',
      firebaseKey: '',
      direccion: '-',
      ubicacion: null,
      telefono: '',
    };

    if (fulfillmentType === ORDER_FULFILLMENT_DELIVERY) {
      if (deliverySettingsError) {
        alert('No se pudo consultar la tarifa de envio. Intenta nuevamente antes de guardar el pedido.');
        return;
      }

      if (!deliveryQuote) {
        alert('La tarifa de envio todavia esta cargando. Espera un momento e intenta nuevamente.');
        return;
      }

      if (!deliveryQuote.available) {
        if (deliveryQuote.reason === 'missing_destination') {
          alert('Este cliente no tiene un pin de ubicacion. Guardalo antes de crear un pedido con delivery.');
        } else if (deliveryQuote.reason === 'out_of_coverage') {
          alert(
            `La ubicacion esta fuera del radio de ${deliveryQuote.coverageRadiusKm} km. Usa Pickup o confirma otra direccion.`
          );
        } else {
          alert('No se pudo calcular el envio. Revisa la ubicacion de la tienda y del cliente.');
        }
        return;
      }
    }

    const appliedDeliveryQuote =
      deliveryQuote || calculateStoreDeliveryQuote({ fulfillmentType: ORDER_FULFILLMENT_PICKUP });

    setIsSubmitting(true);

    try {
      const createdOrder = await onAddOrder(
        {
          cliente: orderClient.nombre,
          clienteCodigo: orderClient.codigo || '-',
          clienteFirebaseKey: orderClient.firebaseKey || '',
          direccion: orderClient.direccion || '-',
          ubicacion: orderClient.ubicacion || null,
          telefono: orderClient.telefono || '',
          pedido: pedido.trim(),
          observaciones: pedido.trim(),
          items: orderItems,
          manualNoteOnly: orderItems.length === 0,
          fecha: hoyISO(),
          metodoPago,
          fulfillmentType,
          deliveryDistanceKm: appliedDeliveryQuote.distanceKm,
          coverageRadiusKm: appliedDeliveryQuote.coverageRadiusKm,
          deliveryFee: appliedDeliveryQuote.totalFee,
          deliveryFeeOriginal: appliedDeliveryQuote.originalTotalFee ?? appliedDeliveryQuote.totalFee,
          deliveryFeeBase: appliedDeliveryQuote.baseFee,
          deliveryFeeTax: appliedDeliveryQuote.taxAmount,
          deliveryFeeBaseOriginal: appliedDeliveryQuote.originalBaseFee ?? appliedDeliveryQuote.baseFee,
          deliveryFeeTaxOriginal: appliedDeliveryQuote.originalTaxAmount ?? appliedDeliveryQuote.taxAmount,
          deliveryFeeBracket: appliedDeliveryQuote.feeKey,
          deliveryFree: appliedDeliveryQuote.deliveryFree === true,
          deliveryPromotionLabel: appliedDeliveryQuote.promotionLabel || '',
          deliveryPromotionType: appliedDeliveryQuote.promotionType || '',
          deliveryPromotionDate: appliedDeliveryQuote.promotionDate || '',
        },
        { channel: MANUAL_CHANNEL }
      );

      setSuccessNumber(createdOrder);
      window.setTimeout(() => setSuccessNumber(null), 2200);

      setClienteInput('');
      setSelectedClient(null);
      setPedido('');
      setOrderItems([]);
      setProductSearch('');
      setMetodoPago('Efectivo');
      setFulfillmentType(ORDER_FULFILLMENT_DELIVERY);
    } catch (error) {
      console.error('Error agregando pedido manual:', error);
      if (error.code === 'ORDER_LIMIT_REACHED') {
        alert('Hoy ya no quedan numeros disponibles para seguir recibiendo pedidos.');
      } else {
        alert('No se pudo guardar el pedido.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const guardarNuevoCliente = async () => {
    const { nombre, codigo, direccion } = nuevoCliente;
    if (!nombre.trim() || !codigo.trim() || !direccion.trim()) {
      alert('Completa nombre, codigo y direccion para crear el cliente.');
      return;
    }

    try {
      setSavingClient(true);
      const clientData = {
        nombre: nombre.trim(),
        codigo: codigo.trim(),
        direccion: direccion.trim(),
        telefono: nuevoCliente.telefono || '',
        ubicacion: nuevoCliente.ubicacion || null,
      };
      const createdClient = await createManualClient(clientData);

      setShowNewClient(false);
      setNuevoCliente({ nombre: '', codigo: '', telefono: '', direccion: '', ubicacion: null });
      setSelectedClient(createdClient);
      setClienteInput(createdClient.nombre);
    } catch (error) {
      console.error('Error guardando cliente:', error);
      alert('No se pudo guardar el cliente.');
    } finally {
      setSavingClient(false);
    }
  };

  const capturarUbicacionCliente = async () => {
    setLocatingClient(true);
    try {
      const ubicacion = await getBrowserLocation();
      setNuevoCliente((current) => ({
        ...current,
        ubicacion,
        direccion: current.direccion || 'Ubicacion guardada desde el mapa',
      }));
    } catch (error) {
      console.error('No se pudo obtener ubicacion:', error);
      alert('No pudimos tomar la ubicacion. Activa permisos o escribe la direccion.');
    } finally {
      setLocatingClient(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding: '24px',
        fontFamily: "'Trebuchet MS', 'Segoe UI', sans-serif",
        color: '#f8fafc',
      }}
    >
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes successPop { 0% { transform: scale(0.8); opacity: 0; } 50% { transform: scale(1.05); } 100% { transform: scale(1); opacity: 1; } }
        .animate-slideIn { animation: slideIn 0.5s ease-out; }
        .animate-slideUp { animation: slideUp 0.5s ease-out; }
        .animate-pulse { animation: pulse 2s infinite; }
        .animate-success { animation: successPop 0.4s ease-out; }
        .btn-hover { transition: all 0.2s ease; }
        .btn-hover:hover { transform: translateY(-2px); box-shadow: 0 10px 25px rgba(0,0,0,0.2); }
        .input-focus { transition: all 0.2s ease; }
        .input-focus:focus { transform: scale(1.01); }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 20px 40px rgba(0,0,0,0.15); }
      `}</style>

      <div
        className="animate-slideIn"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '20px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 10px 30px rgba(245, 158, 11, 0.4)',
            }}
          >
            <img
              src={BRAND_LOGO_PATH}
              alt="Logo"
              style={{ width: '44px', height: '44px', objectFit: 'contain' }}
            />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 800 }}>Nuevo Pedido</h1>
            <p style={{ margin: '4px 0 0 0', opacity: 0.6, fontSize: '15px', fontWeight: 500 }}>
              Flujo manual conectado al mismo contador que el delivery
            </p>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 24px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '16px',
            border: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          <div>
            <span style={{ fontSize: '14px', opacity: 0.6, fontWeight: 600, display: 'block' }}>
              Proximo pedido estimado
            </span>
            <span
              style={{
                fontSize: '36px',
                fontWeight: 900,
                color: '#f59e0b',
                fontFamily: 'monospace',
                lineHeight: 1,
              }}
            >
              {previewNumber}
            </span>
          </div>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: '#10b981',
              animation: 'pulse 2s infinite',
            }}
          />
        </div>
      </div>

      {successNumber && (
        <div
          className="animate-success"
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            padding: '32px 48px',
            borderRadius: '24px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.3)',
            zIndex: 1000,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '18px', fontWeight: 700, opacity: 0.84 }}>Pedido enviado</div>
          <div style={{ fontSize: '44px', fontWeight: 900, marginTop: '8px' }}>
            #{formatOrderNumber(successNumber)}
          </div>
          <div style={{ fontSize: '15px', opacity: 0.92, marginTop: '8px' }}>
            Ya entro al flujo de cocina
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '20px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
            gap: '20px',
          }}
        >
          <div
            className="animate-slideUp card-hover"
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '24px',
              padding: '24px',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#f59e0b',
              }}
            >
              Informacion del Pedido
            </div>

            <div
              style={{
                marginBottom: '20px',
                padding: '20px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '16px',
                border: '2px solid rgba(245, 158, 11, 0.3)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.6)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '8px',
                }}
              >
                Numero asignado al confirmar
              </div>
              <div
                style={{
                  fontSize: '56px',
                  fontWeight: 900,
                  color: '#f59e0b',
                  fontFamily: 'monospace',
                  lineHeight: 1,
                }}
              >
                {previewNumber}
              </div>
              {fulfillmentType === ORDER_FULFILLMENT_DELIVERY && (
                <div
                  style={{
                    marginTop: '14px',
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: `1px solid ${deliveryQuote?.available ? 'rgba(56, 189, 248, 0.5)' : 'rgba(248, 113, 113, 0.45)'}`,
                    background: deliveryQuote?.available
                      ? 'rgba(56, 189, 248, 0.12)'
                      : 'rgba(239, 68, 68, 0.1)',
                    color: deliveryQuote?.available ? '#bae6fd' : '#fecaca',
                    fontSize: '13px',
                    fontWeight: 700,
                  }}
                >
                  {!deliverySettings && !deliverySettingsError && 'Calculando tarifa de envio...'}
                  {deliverySettingsError && 'No se pudo cargar la tarifa de envio.'}
                  {deliveryQuote?.reason === 'missing_destination' &&
                    'Selecciona un cliente con pin para calcular el envio.'}
                  {deliveryQuote?.reason === 'out_of_coverage' &&
                    `Fuera del radio de ${deliveryQuote.coverageRadiusKm} km.`}
                  {deliveryQuote?.available && (
                    <>
                      Envio: C$ {Number(deliveryQuote.totalFee || 0).toFixed(2)} con IVA
                      {' | '}
                      {formatStoreDeliveryDistance(deliveryQuote.distanceKm)}
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.6)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Tipo de Entrega
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                  marginBottom: '18px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setFulfillmentType(ORDER_FULFILLMENT_DELIVERY)}
                  className="btn-hover"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '2px solid',
                    borderColor:
                      fulfillmentType === ORDER_FULFILLMENT_DELIVERY ? '#38bdf8' : 'rgba(255,255,255,0.1)',
                    background:
                      fulfillmentType === ORDER_FULFILLMENT_DELIVERY
                        ? 'rgba(56, 189, 248, 0.18)'
                        : 'rgba(255,255,255,0.05)',
                    color:
                      fulfillmentType === ORDER_FULFILLMENT_DELIVERY ? '#38bdf8' : 'rgba(255,255,255,0.7)',
                    fontWeight: fulfillmentType === ORDER_FULFILLMENT_DELIVERY ? 800 : 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setFulfillmentType(ORDER_FULFILLMENT_PICKUP)}
                  className="btn-hover"
                  style={{
                    padding: '14px 16px',
                    borderRadius: '12px',
                    border: '2px solid',
                    borderColor:
                      fulfillmentType === ORDER_FULFILLMENT_PICKUP ? '#22c55e' : 'rgba(255,255,255,0.1)',
                    background:
                      fulfillmentType === ORDER_FULFILLMENT_PICKUP
                        ? 'rgba(34, 197, 94, 0.18)'
                        : 'rgba(255,255,255,0.05)',
                    color:
                      fulfillmentType === ORDER_FULFILLMENT_PICKUP ? '#22c55e' : 'rgba(255,255,255,0.7)',
                    fontWeight: fulfillmentType === ORDER_FULFILLMENT_PICKUP ? 800 : 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Pickup
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.6)',
                  marginBottom: '8px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                Metodo de Pago
              </label>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px',
                }}
              >
                {PAYMENT_OPTIONS.map((payment) => (
                  <button
                    key={payment}
                    type="button"
                    onClick={() => setMetodoPago(payment)}
                    className="btn-hover"
                    style={{
                      padding: '12px 16px',
                      borderRadius: '12px',
                      border: '2px solid',
                      borderColor: metodoPago === payment ? '#f59e0b' : 'rgba(255,255,255,0.1)',
                      background: metodoPago === payment ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: metodoPago === payment ? '#f59e0b' : 'rgba(255,255,255,0.7)',
                      fontWeight: metodoPago === payment ? 800 : 600,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {payment}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div
            className="animate-slideUp card-hover"
            style={{
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '24px',
              padding: '24px',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '20px',
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: '#3b82f6',
              }}
            >
              Cliente
            </div>

            {!selectedClient ? (
              <div>
                <div style={{ position: 'relative', marginBottom: '16px' }}>
                  <input
                    type="text"
                    placeholder={allowClientDirectory ? 'Buscar cliente por nombre...' : 'Nombre del cliente'}
                    value={clienteInput}
                    onChange={(event) => {
                      setClienteInput(event.target.value);
                      setSelectedClient(null);
                    }}
                    className="input-focus"
                    style={{
                      width: '100%',
                      padding: '16px 20px 16px 48px',
                      borderRadius: '16px',
                      border: '2px solid rgba(255,255,255,0.1)',
                      background: 'rgba(0,0,0,0.2)',
                      color: 'white',
                      fontSize: '16px',
                      fontWeight: 600,
                      outline: 'none',
                    }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      left: '16px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: '18px',
                      opacity: 0.5,
                    }}
                  >
                    /
                  </span>

                  {allowClientDirectory && clienteInput && sugerencias.length > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        right: 0,
                        background: '#1e293b',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                        zIndex: 50,
                        overflow: 'hidden',
                      }}
                    >
                      {sugerencias.map((client, index) => (
                        <div
                          key={client.firebaseKey}
                          onMouseEnter={() => setHoverIdx(index)}
                          onMouseLeave={() => setHoverIdx(-1)}
                          onClick={() => handleSelectCliente(client)}
                          style={{
                            padding: '16px 20px',
                            cursor: 'pointer',
                            background: hoverIdx === index ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <div style={{ fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                            {client.nombre}
                          </div>
                          <div style={{ fontSize: '13px', opacity: 0.6, fontWeight: 500 }}>
                            Codigo: {client.codigo} - {client.direccion}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {allowClientDirectory ? (
                  <button
                    type="button"
                    onClick={() => setShowNewClient((current) => !current)}
                    className="btn-hover"
                    style={{
                      width: '100%',
                      padding: '14px',
                      borderRadius: '12px',
                      border: '2px dashed rgba(255,255,255,0.2)',
                      background: 'transparent',
                      color: showNewClient ? '#ef4444' : 'rgba(255,255,255,0.8)',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    {showNewClient ? 'Cancelar cliente nuevo' : 'Crear cliente nuevo'}
                  </button>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13, fontWeight: 700 }}>
                    Modo operativo: no se descarga la base de clientes.
                  </div>
                )}

                {allowClientDirectory && showNewClient && (
                  <div
                    className="animate-slideUp"
                    style={{
                      marginTop: '16px',
                      padding: '20px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '16px',
                      display: 'grid',
                      gap: '12px',
                    }}
                  >
                    <input
                      placeholder="Nombre completo"
                      value={nuevoCliente.nombre}
                      onChange={(event) =>
                        setNuevoCliente((current) => ({ ...current, nombre: event.target.value }))
                      }
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <input
                      placeholder="Codigo de cliente"
                      value={nuevoCliente.codigo}
                      onChange={(event) =>
                        setNuevoCliente((current) => ({ ...current, codigo: event.target.value }))
                      }
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <input
                      placeholder="Telefono"
                      value={nuevoCliente.telefono}
                      onChange={(event) =>
                        setNuevoCliente((current) => ({ ...current, telefono: event.target.value }))
                      }
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <input
                      placeholder="Direccion completa"
                      value={nuevoCliente.direccion}
                      onChange={(event) =>
                        setNuevoCliente((current) => ({ ...current, direccion: event.target.value }))
                      }
                      style={{
                        padding: '14px 16px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.05)',
                        color: 'white',
                        fontSize: '14px',
                        fontWeight: 600,
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      onClick={capturarUbicacionCliente}
                      disabled={locatingClient}
                      className="btn-hover"
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: hasLocation(nuevoCliente.ubicacion)
                          ? 'rgba(16, 185, 129, 0.18)'
                          : 'rgba(255,255,255,0.05)',
                        color: hasLocation(nuevoCliente.ubicacion) ? '#86efac' : 'white',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: locatingClient ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {locatingClient
                        ? 'Tomando ubicacion...'
                        : hasLocation(nuevoCliente.ubicacion)
                          ? 'Ubicacion guardada - actualizar'
                          : 'Guardar ubicacion actual'}
                    </button>
                    {hasLocation(nuevoCliente.ubicacion) && (
                      <a
                        href={buildGoogleMapsPlaceUrl(nuevoCliente.ubicacion)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          color: '#93c5fd',
                          fontSize: '13px',
                          fontWeight: 800,
                          textDecoration: 'none',
                        }}
                      >
                        Abrir punto en Google Maps
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={guardarNuevoCliente}
                      disabled={savingClient}
                      className="btn-hover"
                      style={{
                        padding: '14px',
                        borderRadius: '12px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                        color: 'white',
                        fontWeight: 800,
                        fontSize: '14px',
                        cursor: savingClient ? 'not-allowed' : 'pointer',
                        opacity: savingClient ? 0.7 : 1,
                      }}
                    >
                      {savingClient ? 'Guardando...' : 'Guardar Cliente'}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="animate-success"
                style={{
                  background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.2) 0%, rgba(34, 197, 94, 0.1) 100%)',
                  borderRadius: '16px',
                  padding: '20px',
                  border: '2px solid rgba(34, 197, 94, 0.3)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '12px', opacity: 0.6, fontWeight: 600, marginBottom: '4px' }}>
                      CLIENTE SELECCIONADO
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: '#4ade80' }}>
                      {selectedClient.nombre}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedClient(null);
                      setClienteInput('');
                    }}
                    className="btn-hover"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: 'rgba(239, 68, 68, 0.2)',
                      color: '#f87171',
                      fontWeight: 700,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cambiar
                  </button>
                </div>

                <div style={{ display: 'grid', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <span style={{ opacity: 0.6 }}>Codigo:</span>
                    <span
                      style={{
                        background: 'rgba(255,255,255,0.1)',
                        padding: '4px 12px',
                        borderRadius: '8px',
                        fontFamily: 'monospace',
                      }}
                    >
                      {selectedClient.codigo}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <span style={{ opacity: 0.6 }}>Direccion:</span>
                    <span>{selectedClient.direccion}</span>
                  </div>
                  {hasLocation(selectedClient.ubicacion) && (
                    <a
                      href={buildGoogleMapsPlaceUrl(selectedClient.ubicacion)}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: '#93c5fd', fontSize: '13px', fontWeight: 800, textDecoration: 'none' }}
                    >
                      Ubicacion en Google Maps
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div
          className="animate-slideUp card-hover"
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '24px',
            padding: '24px',
            border: '1px solid rgba(255,255,255,0.1)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '20px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: '#10b981',
            }}
          >
            Detalle del Pedido
          </div>

          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <input
              type="search"
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder={catalogLoading ? 'Cargando catalogo...' : 'Buscar producto por nombre o codigo SICAR'}
              disabled={catalogLoading || catalogError}
              className="input-focus"
              style={{
                width: '100%',
                padding: '16px 18px',
                borderRadius: '14px',
                border: '2px solid rgba(255,255,255,0.12)',
                background: 'rgba(0,0,0,0.3)',
                color: 'white',
                fontSize: '16px',
                fontWeight: 700,
                outline: 'none',
              }}
            />

            {catalogError && (
              <div style={{ color: '#fecaca', marginTop: '8px', fontSize: '13px', fontWeight: 700 }}>
                No se pudo cargar el catalogo. Recarga antes de ingresar el pedido.
              </div>
            )}

            {productSuggestions.length > 0 && (
              <div
                style={{
                  display: 'grid',
                  gap: '6px',
                  marginTop: '8px',
                  padding: '8px',
                  borderRadius: '14px',
                  border: '1px solid rgba(255,255,255,0.12)',
                  background: '#172033',
                  boxShadow: '0 18px 40px rgba(0,0,0,0.3)',
                }}
              >
                {productSuggestions.map((product) => (
                  <button
                    key={product.code}
                    type="button"
                    onClick={() => addCatalogProduct(product)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '11px 12px',
                      border: 0,
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.06)',
                      color: 'white',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontWeight: 800 }}>
                      {product.name} <small style={{ color: '#93c5fd' }}>[{product.code}]</small>
                    </span>
                    <span style={{ color: '#fbbf24', fontWeight: 900, whiteSpace: 'nowrap' }}>
                      C$ {Number(product.price || 0).toFixed(2)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {orderItems.length > 0 && (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '14px' }}>
              {orderItems.map((item) => (
                <div
                  key={item.codigo}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 1fr) 110px 92px auto',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '12px',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{item.nombre}</div>
                    <div style={{ color: '#93c5fd', fontSize: '12px', fontWeight: 700 }}>
                      {item.codigo} | C$ {Number(item.precioUnitario || 0).toFixed(2)}/{item.unidad}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={item.minQuantity}
                    step={item.quantityStep}
                    value={item.cantidad}
                    onChange={(event) => updateOrderItemQuantity(item.codigo, event.target.value)}
                    aria-label={`Cantidad de ${item.nombre}`}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: '9px',
                      border: '1px solid rgba(255,255,255,0.2)',
                      background: 'rgba(0,0,0,0.25)',
                      color: 'white',
                      fontWeight: 900,
                    }}
                  />
                  <strong style={{ color: '#fbbf24', textAlign: 'right' }}>
                    C$ {(Number(item.cantidad || 0) * Number(item.precioUnitario || 0)).toFixed(2)}
                  </strong>
                  <button
                    type="button"
                    onClick={() => removeOrderItem(item.codigo)}
                    aria-label={`Quitar ${item.nombre}`}
                    style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '9px',
                      border: 0,
                      background: 'rgba(239,68,68,0.18)',
                      color: '#fca5a5',
                      fontWeight: 900,
                      cursor: 'pointer',
                    }}
                  >
                    X
                  </button>
                </div>
              ))}
              <div style={{ textAlign: 'right', color: '#fbbf24', fontSize: '18px', fontWeight: 900 }}>
                Productos: C$ {manualSubtotal.toFixed(2)}
              </div>
            </div>
          )}

          <textarea
            placeholder={
              orderItems.length === 0
                ? 'Escribe la nota del pedido para cocina'
                : 'Notas adicionales para cocina (opcional)'
            }
            value={pedido}
            onChange={(event) => setPedido(event.target.value)}
            className="input-focus"
            style={{
              width: '100%',
              minHeight: '90px',
              padding: '16px 18px',
              borderRadius: '14px',
              border: '2px solid rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.3)',
              color: 'white',
              fontSize: '15px',
              fontWeight: 600,
              lineHeight: '1.5',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '20px',
              flexWrap: 'wrap',
              gap: '16px',
            }}
          >
            <div style={{ fontSize: '14px', opacity: 0.6, fontWeight: 500 }}>
              Puedes elegir productos del catalogo o enviar solamente una nota de pedido a cocina.
            </div>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                (!selectedClient && !clienteInput.trim()) ||
                !hasOrderDetail
              }
              className="btn-hover"
              style={{
                padding: '20px 48px',
                borderRadius: '16px',
                border: 'none',
                background: isSubmitting
                    ? 'rgba(255,255,255,0.1)'
                    : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                color: 'white',
                fontWeight: 900,
                fontSize: '18px',
                cursor:
                  isSubmitting || (!selectedClient && !clienteInput.trim()) || !hasOrderDetail
                    ? 'not-allowed'
                    : 'pointer',
                opacity: isSubmitting || (!selectedClient && !clienteInput.trim()) || !hasOrderDetail ? 0.5 : 1,
                boxShadow:
                  isSubmitting ? 'none' : '0 10px 30px rgba(245, 158, 11, 0.4)',
              }}
            >
              {isSubmitting ? 'Enviando...' : `Enviar Orden #${previewNumber}`}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
