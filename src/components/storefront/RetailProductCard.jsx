import React, { useEffect, useRef, useState } from 'react';
import RetailPromoSeal from './RetailPromoSeal';

export default function RetailProductCard({ product, quantity, image, fallback, money, formatQuantity, step, minimum, discounted = false, onOpen, onQuantityChange, shareControl }) {
  const [loaded, setLoaded] = useState(false);
  const article = useRef(null);
  const keyboardChange = useRef(false);
  const changeQuantity = (event, next) => {
    keyboardChange.current = event.detail === 0;
    onQuantityChange(next);
  };
  useEffect(() => {
    if (keyboardChange.current && !article.current?.contains(document.activeElement)) {
      article.current?.querySelector(quantity > 0 ? '.retail-card-stepper button:last-child' : '.retail-card-add')?.focus({ preventScroll: true });
    }
    keyboardChange.current = false;
  }, [quantity]);
  return (
    <article ref={article} className={`retail-product${discounted ? ' has-preciazo' : ''}${quantity > 0 ? ' is-in-cart' : ''}`}>
      <button type="button" className="retail-product-link" onClick={onOpen} aria-label={`Ver ${product.name}${discounted ? ', en promoción' : ''}`}>
        <span className={`retail-product-photo ${loaded ? 'is-loaded' : ''}`}>
          <img src={image} alt={product.name} loading="lazy" decoding="async" width="320" height="320"
            onLoad={() => setLoaded(true)} onError={(event) => { fallback(event); setLoaded(true); }} />
          {discounted && <RetailPromoSeal promotion={product.specialPromotion} />}
        </span>
        <span className="retail-product-name">{product.name}</span>
        <span className="retail-product-unit">{product.boxSale ? `${product.boxSale.poundsPerBox} lb por caja · ${money(product.boxSale.pricePerPound)} / lb` : <>Por {product.unit} <span aria-hidden="true">·</span> {product.code}</>}</span>
        <span className="retail-product-price">{money(product.price)} <small>/ {product.unit}</small></span>
        {discounted && <span className="retail-product-was"><s>{money(product.originalPrice)}</s> <span>{product.specialPromotion?.title || 'Precio especial'}</span></span>}
      </button>
      {quantity > 0 ? (
        <div className="retail-card-stepper" aria-label={`Cantidad de ${product.name}`}>
          <button type="button" aria-label={`Reducir ${product.name}`} onClick={(event) => changeQuantity(event, quantity <= minimum + 0.000001 ? 0 : quantity - step)}>−</button>
          <output aria-live="polite"><span key={quantity} className="retail-quantity-value">{formatQuantity(quantity, product.unit)}</span> <small>{product.unit}</small></output>
          <button type="button" aria-label={`Agregar ${product.name}`} onClick={(event) => changeQuantity(event, quantity + step)}>+</button>
        </div>
      ) : (
        <button type="button" className="retail-card-add" aria-label={`Agregar ${product.name}`} onClick={(event) => changeQuantity(event, minimum)}><span aria-hidden="true">+</span> Agregar</button>
      )}
      {shareControl}
    </article>
  );
}
