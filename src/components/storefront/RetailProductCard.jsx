import React, { useState } from 'react';
import RetailPromoSeal from './RetailPromoSeal';

export default function RetailProductCard({ product, quantity, image, fallback, money, formatQuantity, step, minimum, discounted = false, onOpen, onQuantityChange }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <article className={`retail-product${discounted ? ' has-preciazo' : ''}`}>
      <button type="button" className="retail-product-link" onClick={onOpen} aria-label={`Ver ${product.name}${discounted ? ', en promoción' : ''}`}>
        <span className={`retail-product-photo ${loaded ? 'is-loaded' : ''}`}>
          <img src={image} alt={product.name} loading="lazy" decoding="async" width="320" height="320"
            onLoad={() => setLoaded(true)} onError={(event) => { fallback(event); setLoaded(true); }} />
          {discounted && <RetailPromoSeal />}
        </span>
        <span className="retail-product-name">{product.name}</span>
        <span className="retail-product-unit">Por {product.unit} <span aria-hidden="true">·</span> {product.code}</span>
        <span className="retail-product-price">{money(product.price)} <small>/ {product.unit}</small></span>
        {discounted && <span className="retail-product-was"><s>{money(product.originalPrice)}</s> <span>{product.specialPromotion?.title || 'Precio especial'}</span></span>}
      </button>
      {quantity > 0 ? (
        <div className="retail-card-stepper" aria-label={`Cantidad de ${product.name}`}>
          <button type="button" aria-label={`Reducir ${product.name}`} onClick={() => onQuantityChange(quantity <= minimum + 0.000001 ? 0 : quantity - step)}>−</button>
          <output aria-live="polite">{formatQuantity(quantity, product.unit)} <small>{product.unit}</small></output>
          <button type="button" aria-label={`Agregar ${product.name}`} onClick={() => onQuantityChange(quantity + step)}>+</button>
        </div>
      ) : (
        <button type="button" className="retail-card-add" aria-label={`Agregar ${product.name}`} onClick={() => onQuantityChange(minimum)}><span aria-hidden="true">+</span> Agregar</button>
      )}
    </article>
  );
}
