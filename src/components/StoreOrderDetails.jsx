import React from 'react';
import {
  formatStoreQuantity,
  getActualStoreQuantity,
  getRequestedStoreQuantity,
  getStoreDisplayItems,
  getStoreProductItems,
  getStoreQuantityStep,
  getStoreRewardItems,
  normalizeStoreItemCode,
} from '../services/storeOrderEditor';
import './StoreOrderDetails.css';

export default function StoreOrderDetails({ pedido, editable = false, busy = false, getDraftValue, onDraftChange }) {
  const products = getStoreProductItems(pedido);
  const displayItems = getStoreDisplayItems(pedido);
  const rewards = getStoreRewardItems(pedido);
  const money = (value) => `C$${Number(value || 0).toFixed(2)}`;

  return (
    <div className="store-order-details">
      <div className="store-order-lines">
        {displayItems.map((item, index) => {
          const unit = String(item?.unidad || 'lb').trim() || 'lb';
          const requested = getRequestedStoreQuantity(item);
          const actual = getActualStoreQuantity(item);
          const code = normalizeStoreItemCode(item);
          const productIndex = products.indexOf(item);
          return (
            <div className="store-order-line" key={`${pedido.firebaseKey}-${code || index}-${index}`}>
              <div className="store-order-line__name">
                <strong>{item?.nombre || 'Producto sin nombre'}</strong>
                {code && <span className="store-order-line__code">Código {code}</span>}
              </div>
              <span className="store-order-line__quantity">{formatStoreQuantity(requested)} {unit}</span>
              {editable && productIndex >= 0 ? (
                <label className="store-order-line__editor">
                  <span>Cantidad real ({unit})</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step={getStoreQuantityStep(item)}
                    min={unit.toLowerCase() === 'unidad' ? '1' : '0.1'}
                    value={getDraftValue(pedido, item, productIndex)}
                    onChange={(event) => onDraftChange(pedido, productIndex, event.target.value)}
                    onFocus={(event) => event.target.select()}
                    aria-label={`Cantidad real de ${item?.nombre || 'producto'} en ${unit}`}
                    disabled={busy}
                  />
                </label>
              ) : actual !== requested && actual > 0 ? (
                <div className="store-order-line__actual">Cantidad real: {formatStoreQuantity(actual)} {unit}</div>
              ) : null}
            </div>
          );
        })}
        {rewards.map((item, index) => (
          <div className="store-order-line store-order-line--reward" key={`${pedido.firebaseKey}-reward-${item.id || index}`}>
            <div className="store-order-line__name">
              <span className="store-order-line__reward-tag">Regalía · {item.rewardName}</span>
              <strong>{item.nombre}</strong>
              {item.codigo && <span className="store-order-line__code">Código {item.codigo}</span>}
            </div>
            <span className="store-order-line__quantity">{formatStoreQuantity(item.cantidad)} {item.unidad}</span>
          </div>
        ))}
      </div>

      {pedido.observaciones && (
        <div className="store-order-notes">
          <span>Notas del cliente</span>
          <p>{pedido.observaciones}</p>
        </div>
      )}

      <div className="store-order-summary">
        <div><span>{pedido?.totalAproximado === false ? 'Subtotal actualizado' : 'Subtotal estimado'}</span><strong>{money(pedido.subtotalEstimado)}</strong></div>
        {Number(pedido.descuentoCupon || 0) > 0 && (
          <div><span>Cupón aplicado</span><strong>-{money(pedido.descuentoCupon)}</strong></div>
        )}
        {Boolean(pedido.deliveryFree) && Number(pedido.deliveryFeeOriginal || 0) > 0 ? (
          <div><span>Servicio a domicilio</span><strong>Gratis</strong></div>
        ) : Number(pedido.deliveryFee || 0) > 0 ? (
          <div><span>Servicio a domicilio</span><strong>{money(pedido.deliveryFee)}</strong></div>
        ) : null}
        <div className="store-order-summary__total"><span>{pedido?.totalAproximado === false ? 'Total actualizado' : 'Total aproximado'}</span><strong>{money(pedido.total)}</strong></div>
      </div>
    </div>
  );
}
