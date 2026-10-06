import React, { useEffect, useRef } from 'react';
import { useOnlineStatus } from './useRetailNavigation';

export const RETAIL_CHECKOUT_STEPS = ['cart', 'delivery', 'address', 'schedule', 'payment', 'benefits', 'review'];

// Presentation only: amounts, eligibility and actions come from the existing checkout.
export default function RetailCheckout(props) {
  const {
    cartItems, currentUser, customer, fulfillmentType, routeSlots = [], routeSlotId,
    deliveryMode, savedAddresses, selectedSavedAddress, alternateDelivery, alternateLocating,
    notes, submitting, appliedCoupon, couponInput, couponMessage, discountBenefit,
    approximateTotalAmount, discountedProductTotal, totalAmount, deliveryQuote, deliverySummary,
    deliveryFeeAmount, estimatedRewardPoints, storeClosedMessage, rewardSettings, selectedReward,
    firstOrderRewardEnabled, firstOrderProgress, selectedFirstOrderGift, welcomeCoupon,
    welcomeCouponStatus, welcomeCouponExpiryLabel, welcomeCouponActionBusy, defaultLocation,
    selectedBranch, onClose, onCustomerChange, onFulfillmentTypeChange, onRouteSlotChange,
    onDeliveryModeChange, onSavedAddressSelect, onQuantityChange, onAlternateDeliveryChange,
    onCaptureAlternateLocation, onApplyCoupon, onApplySpecificCoupon, onCouponInputChange,
    onEditProfile, onNotesChange, onOpenLogin, onOpenRegister, onOpenRewards, onOpenFirstOrderGift,
    onClaimWelcomeCoupon, onClearSelectedReward, onRemoveCoupon, onStoreClosed, onSubmit,
    onNavigateBack, checkoutStep = 'cart', onCheckoutStepChange, model, ui,
  } = props;
  const { money, formatQuantity, discountLabel, hasLocation, autofillAddress, Back, Icon,
    QuantityInput, LocationCaptureBlock, SlotPicker, GiftProgress, GiftCard, GiftLine, PoketLogo } = ui;
  const { pickupFlow, routeSanMartinFlow, selectedRouteSlot, routeMinimumShortfall, paymentValue,
    canSubmitDelivery, storeClosed, rewardCartPreview, deliveryChoices, paymentChoices,
    showWelcomeCouponCard, welcomeCouponCanApply, welcomeCouponIsApplied } = model;
  const online = useOnlineStatus();
  const content = useRef(null);
  const direction = useRef('forward');
  const previousStep = useRef(checkoutStep);
  if (previousStep.current !== checkoutStep) {
    direction.current = RETAIL_CHECKOUT_STEPS.indexOf(checkoutStep) < RETAIL_CHECKOUT_STEPS.indexOf(previousStep.current) ? 'back' : 'forward';
    previousStep.current = checkoutStep;
  }
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
    content.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [checkoutStep]);
  const steps = RETAIL_CHECKOUT_STEPS.filter((step) => step !== 'schedule' || routeSanMartinFlow);
  const step = steps.includes(checkoutStep) ? checkoutStep : 'delivery';
  const titles = { cart: 'Tu carrito', delivery: 'Cómo lo recibís', address: pickupFlow ? 'Retiro en tienda' : 'Dirección de entrega', schedule: 'Elegí tu horario', payment: 'Método de pago', benefits: 'Tus beneficios', review: 'Revisá tu pedido' };
  const go = (value) => onCheckoutStepChange(value);
  const back = () => {
    if (onNavigateBack) onNavigateBack();
    else if (step === 'cart') onClose();
    else go(steps[Math.max(0, steps.indexOf(step) - 1)]);
  };
  const deliveryAddress = deliveryMode === 'otra' ? alternateDelivery : (selectedSavedAddress || currentUser);
  const addressReady = pickupFlow || (String(deliveryAddress?.direccion || '').trim() && hasLocation(deliveryAddress?.ubicacion));
  const continueDisabled = submitting || !cartItems.length ||
    (step === 'address' && Boolean(currentUser) && !addressReady) ||
    (step === 'schedule' && (!selectedRouteSlot || routeMinimumShortfall > 0)) ||
    (step === 'review' && (!canSubmitDelivery || storeClosed || !online));
  const continueFlow = () => {
    if (step === 'address' && !currentUser) { onOpenLogin(); return; }
    if (step === 'review') {
      if (!currentUser) { onOpenLogin(); return; }
      onSubmit();
      return;
    }
    go(steps[steps.indexOf(step) + 1]);
  };
  const totals = (
    <dl className="retail-totals">
      <div><dt>Productos</dt><dd>{money(totalAmount)}</dd></div>
      {Number(discountBenefit?.amount || 0) > 0 && <div className="retail-saving"><dt>{discountLabel(discountBenefit)}</dt><dd>−{money(discountBenefit.amount)}</dd></div>}
      {step !== 'cart' && <div><dt>{pickupFlow ? 'Retiro' : 'Envío'}</dt><dd>{pickupFlow || deliveryQuote?.available ? (Number(deliveryFeeAmount) > 0 ? money(deliveryFeeAmount) : 'Gratis') : 'Por calcular'}</dd></div>}
      <div className="retail-total"><dt>{step === 'cart' ? 'Subtotal' : 'Total aproximado'}</dt><dd>{money(step === 'cart' ? discountedProductTotal : approximateTotalAmount)}</dd></div>
    </dl>
  );
  const gifts = <>
    <GiftCard eligible={firstOrderRewardEnabled} selectedItem={selectedFirstOrderGift} onOpen={onOpenFirstOrderGift} />
    {selectedFirstOrderGift && <GiftLine item={selectedFirstOrderGift} />}
    {rewardCartPreview && <div className="retail-gift-line"><img src={rewardCartPreview.image || '/tienda/branding/logo-mark.svg'} alt="" /><div><small>Canje Miembro Gold</small><strong>{rewardCartPreview.subtitle || rewardCartPreview.title}</strong>{rewardCartPreview.detail && <small>{rewardCartPreview.detail}</small>}</div><strong>{money(0)}</strong></div>}
  </>;
  return (
    <div className="store-sheet-overlay retail-screen-overlay">
      <section className="store-sheet retail-checkout-screen" role="dialog" aria-modal="true" aria-label={titles[step]}>
        <header className="retail-screen-header"><Back onClick={back} label={step === 'cart' ? 'Tienda' : 'Atrás'} /><strong>{step === 'cart' ? 'Carrito' : 'Finalizar compra'}</strong><span>{step === 'cart' ? cartItems.length : `${steps.indexOf(step)} / ${steps.length - 1}`}</span></header>
        {step !== 'cart' && <div className="retail-checkout-progress" role="progressbar" aria-label="Progreso de compra" aria-valuemin={0} aria-valuemax={steps.length - 1} aria-valuenow={steps.indexOf(step)}><span style={{ width: `${steps.indexOf(step) / (steps.length - 1) * 100}%` }} /></div>}
        <div className="retail-checkout-scroll" ref={content}>
          <div key={step} className={`retail-checkout-content motion-${direction.current}`}>
            <h1 tabIndex={-1}>{titles[step]}</h1>
            {!online && <p className="retail-notice" role="status">Sin conexión. Tu carrito sigue aquí; conectate para confirmar.</p>}
            {!cartItems.length ? <div className="retail-empty"><Icon name="cart" /><h2>Tu carrito está vacío</h2><p>Agregá tus cortes y productos favoritos.</p><button type="button" className="store-button" onClick={onClose}>Volver a la tienda</button></div> : <>
              {step === 'cart' && <>
                <p className="retail-muted">{selectedBranch?.name} · {cartItems.length} {cartItems.length === 1 ? 'producto' : 'productos'}</p>
                <div className="retail-cart-lines">
                  {cartItems.map((item) => <article className="retail-cart-line" key={item.codigo}>
                    <img src={item.image || '/tienda/branding/logo-mark.svg'} alt={item.nombre} width="88" height="88" onError={(event) => { if (!event.currentTarget.dataset.fallback) { event.currentTarget.dataset.fallback = '1'; event.currentTarget.src = '/tienda/branding/logo-mark.svg'; } }} />
                    <div className="retail-cart-copy"><strong>{item.nombre}</strong><small>{money(item.precioUnitario)} / {item.unidad}</small>
                      <div className="retail-cart-actions"><div className="retail-card-stepper">
                        <button type="button" aria-label={`Reducir ${item.nombre}`} onClick={() => onQuantityChange(item.codigo, Number(item.cantidad) <= Number(item.minQuantity || 0) + 0.000001 ? 0 : Number(item.cantidad) - Number(item.quantityStep || 1))}>−</button>
                        <QuantityInput className="retail-quantity-input" value={Number(item.cantidad)} step={item.quantityStep} ariaLabel={`Cantidad de ${item.nombre}`} onChange={(value) => onQuantityChange(item.codigo, value)} />
                        <button type="button" aria-label={`Agregar ${item.nombre}`} onClick={() => onQuantityChange(item.codigo, Number(item.cantidad) + Number(item.quantityStep || 1))}>+</button>
                      </div><button className="retail-text-button" type="button" aria-label={`Quitar ${item.nombre}`} onClick={() => onQuantityChange(item.codigo, 0)}>Quitar</button></div>
                    </div><strong className="retail-line-total">{money(item.subtotal)}</strong>
                  </article>)}
                </div>
                {gifts}
                {firstOrderRewardEnabled && <GiftProgress progress={firstOrderProgress} selectedItem={selectedFirstOrderGift} onOpen={onOpenFirstOrderGift} />}
                {totals}
                <p className="retail-footnote">IVA incluido. El total puede variar según el peso final. Envío calculado al elegir la entrega.</p>
                <button type="button" className="retail-text-button" onClick={onClose}>Seguir comprando</button>
              </>}
              {step === 'delivery' && <>
                <div className="retail-segmented" aria-label="Modalidad de entrega">
                  {deliveryChoices.map((choice) => <button type="button" key={choice.value} aria-pressed={fulfillmentType === choice.value} onClick={() => onFulfillmentTypeChange(choice.value)}>{choice.icon === 'pickup' ? 'Retiro en tienda' : choice.icon === 'route' ? 'Ruta San Martín' : 'Delivery'}</button>)}
                </div>
                <section className="retail-fulfillment-info"><Icon name={pickupFlow ? 'pickup' : routeSanMartinFlow ? 'route' : 'delivery'} /><div><h2>{pickupFlow ? 'Pasá por tu pedido' : routeSanMartinFlow ? 'Entrega programada, envío gratis' : 'Hasta tu puerta'}</h2><p>{pickupFlow ? selectedBranch?.address : routeSanMartinFlow ? 'Desde Granada, hasta 40 km. Elegí una franja disponible en el siguiente paso.' : 'Confirmá tu dirección para consultar cobertura y costo de envío.'}</p></div></section>
                {routeSanMartinFlow && routeMinimumShortfall > 0 && <p className="retail-notice">Agregá {money(routeMinimumShortfall)} en productos para usar Ruta San Martín.</p>}
                {storeClosed && <div className="retail-notice"><strong>Tienda cerrada</strong><p>{storeClosedMessage}</p><button type="button" className="retail-text-button" onClick={onStoreClosed}>Ver horario</button>{selectedBranch?.id === 'granada' && <p>Podés preparar tu carrito o elegir Ruta San Martín para una entrega programada.</p>}</div>}
                <div className="retail-summary-line"><span>Tu tienda</span><strong>{selectedBranch?.name}</strong></div>
              </>}
              {step === 'address' && <>
                {!currentUser ? <div className="retail-empty"><Icon name="account" /><h2>Guardá tu pedido en tu cuenta</h2><p>Ingresá para usar tus direcciones y seguir la entrega.</p><button type="button" className="store-button" onClick={onOpenLogin}>Iniciar sesión</button><button type="button" className="store-button secondary" onClick={onOpenRegister}>Crear cuenta</button></div> : pickupFlow ? <>
                  <section className="retail-fulfillment-info"><Icon name="pickup" /><div><h2>{selectedBranch?.name}</h2><p>{selectedBranch?.address}</p></div></section><div className="retail-summary-line"><span>Retira</span><strong>{currentUser.nombre}<small>{currentUser.telefono}</small></strong></div><button type="button" className="retail-text-button" onClick={onStoreClosed}>Ver horario de la tienda</button>
                </> : <>
                  <div className="retail-option-list">{savedAddresses.map((address) => <button type="button" className="retail-option" key={address.id} aria-pressed={deliveryMode === 'perfil' && selectedSavedAddress?.id === address.id} onClick={() => onSavedAddressSelect(address.id)}><Icon name="pin" /><span><strong>{address.nombre}</strong><small>{address.direccion}</small></span><span className="retail-radio" aria-hidden="true" /></button>)}
                    <button type="button" className="retail-option" aria-pressed={deliveryMode === 'otra'} onClick={() => onDeliveryModeChange('otra')}><Icon name="pin" /><span><strong>Otra dirección</strong><small>Solo para este pedido</small></span><span className="retail-radio" aria-hidden="true" /></button>
                  </div>
                  {deliveryMode === 'otra' ? <div className="retail-form">
                    <label>Dirección escrita<input className="store-field" value={alternateDelivery.direccion} onChange={(event) => onAlternateDeliveryChange('direccion', event.target.value)} autoComplete="street-address" /></label>
                    <label>Referencia<input className="store-field" value={alternateDelivery.referencia} onChange={(event) => onAlternateDeliveryChange('referencia', event.target.value)} /></label>
                    <LocationCaptureBlock location={alternateDelivery.ubicacion} defaultLocation={defaultLocation} locating={alternateLocating} onCapture={onCaptureAlternateLocation} onManualLocation={(location) => { onAlternateDeliveryChange('ubicacion', location); if (autofillAddress(alternateDelivery.direccion)) onAlternateDeliveryChange('direccion', location?.label || 'Ubicacion seleccionada en el mapa'); }} onAddressResolved={(value) => { if (autofillAddress(alternateDelivery.direccion)) onAlternateDeliveryChange('direccion', value); }} />
                  </div> : <button type="button" className="retail-text-button" onClick={onEditProfile}>Administrar mis direcciones</button>}
                  {!addressReady && <p className="retail-notice" role="status">Confirmá la dirección y su punto exacto en el mapa.</p>}
                  {addressReady && <div className="retail-notice" role="status"><strong>{deliverySummary?.title}</strong><p>{deliverySummary?.message}</p>{deliveryQuote?.available && <span>Envío: {Number(deliveryFeeAmount) > 0 ? money(deliveryFeeAmount) : 'Gratis'}</span>}</div>}
                </>}
              </>}
              {step === 'schedule' && <SlotPicker slots={routeSlots} selectedId={routeSlotId} shortfall={routeMinimumShortfall} onSelect={onRouteSlotChange} />}
              {step === 'payment' && <>
                <div className="retail-option-list">{paymentChoices.map((payment) => <button type="button" key={payment.value} className="retail-option" aria-pressed={paymentValue === payment.value} onClick={() => onCustomerChange('metodoPago', payment.value)}>{payment.value === 'LINK DE PAGO' ? <PoketLogo size={28} inverted={false} /> : <Icon name={payment.icon} />}<span><strong>{payment.title}</strong><small>{payment.detail}</small></span><span className="retail-radio" aria-hidden="true" /></button>)}</div>
                {paymentValue === 'LINK DE PAGO' && <p className="retail-notice">Se generará un link de pago automático cuando el pedido esté listo.</p>}
                {paymentValue === 'EFECTIVO' && <label className="retail-field">Necesito cambio para<input className="store-field" value={customer.cambioPara || ''} inputMode="decimal" onChange={(event) => onCustomerChange('cambioPara', event.target.value)} placeholder="Ej. C$ 500" /></label>}
              </>}
              {step === 'benefits' && <>
                <section className="retail-benefit"><h2>Cupón</h2><label className="retail-field">Código promocional<div className="retail-coupon-input"><input className="store-field" value={couponInput} onChange={(event) => onCouponInputChange(event.target.value)} autoCapitalize="characters" /><button type="button" className="store-button secondary" onClick={onApplyCoupon}>Aplicar</button></div></label>{couponMessage && <p role="status">{couponMessage}</p>}{appliedCoupon && <button type="button" className="retail-text-button" onClick={onRemoveCoupon}>Quitar {appliedCoupon.code}</button>}</section>
                {showWelcomeCouponCard && <section className="retail-benefit"><h2>Cupón de bienvenida</h2><p>{welcomeCoupon.coupon.code} · Mínimo {money(welcomeCoupon.minimumPurchase)}{welcomeCouponExpiryLabel ? ` · ${welcomeCouponExpiryLabel}` : ''}</p>{welcomeCouponStatus === 'available' ? <button className="store-button secondary" type="button" onClick={onClaimWelcomeCoupon} disabled={welcomeCouponActionBusy}>{welcomeCouponActionBusy ? 'Activando...' : 'Canjear cupón'}</button> : welcomeCouponCanApply && !welcomeCouponIsApplied ? <button className="store-button secondary" type="button" onClick={() => onApplySpecificCoupon(welcomeCoupon.coupon)}>Aplicar cupón de bienvenida</button> : welcomeCouponIsApplied ? <p>Aplicado a tu pedido</p> : <p>Completá el monto mínimo para aplicarlo.</p>}</section>}
                {rewardSettings?.enabled !== false && <section className="retail-benefit retail-gold-benefit"><Icon name="reward" /><h2>Miembro Gold</h2><p>{selectedReward ? `Premio elegido: ${selectedReward.rewardName}` : `${estimatedRewardPoints} puntos estimados en esta compra.`}</p><button type="button" className="store-button secondary" onClick={currentUser ? onOpenRewards : onOpenLogin}>{selectedReward ? 'Cambiar premio' : 'Ver recompensas'}</button>{selectedReward && <button type="button" className="retail-text-button" onClick={onClearSelectedReward}>Seguir acumulando</button>}</section>}
                {gifts}
                <p className="retail-footnote">Se aplica el mejor beneficio disponible según las condiciones vigentes.</p>
              </>}
              {step === 'review' && <>
                <div className="retail-review-block"><div><h2>Entrega</h2><button type="button" className="retail-text-button" onClick={() => go('delivery')}>Cambiar</button></div><strong>{pickupFlow ? 'Retiro en tienda' : routeSanMartinFlow ? 'Ruta San Martín' : 'Delivery'}</strong><p>{pickupFlow ? selectedBranch?.address : deliveryAddress?.direccion}</p>{deliveryAddress?.referencia && !pickupFlow && <small>{deliveryAddress.referencia}</small>}{routeSanMartinFlow && <p>{selectedRouteSlot?.dateLabel} · {selectedRouteSlot?.label}</p>}</div>
                <div className="retail-review-block"><div><h2>Pago</h2><button type="button" className="retail-text-button" onClick={() => go('payment')}>Cambiar</button></div><p>{paymentChoices.find((payment) => payment.value === paymentValue)?.title}{paymentValue === 'EFECTIVO' && customer.cambioPara ? ` · Cambio para ${customer.cambioPara}` : ''}</p></div>
                <div className="retail-review-block"><div><h2>Productos</h2><button type="button" className="retail-text-button" onClick={() => go('cart')}>Editar</button></div>{cartItems.map((item) => <div className="retail-review-item" key={item.codigo}><span>{formatQuantity(item.cantidad, item.unidad)} {item.unidad} · {item.nombre}</span><strong>{money(item.subtotal)}</strong></div>)}</div>
                {gifts}
                <button type="button" className="retail-text-button" onClick={() => go('benefits')}>Editar cupón o beneficios</button>
                <label className="retail-field">Notas para tu pedido <small>(opcional)</small><textarea className="store-field" value={notes} onChange={(event) => onNotesChange(event.target.value)} rows={3} /></label>
                {totals}<p className="retail-footnote">IVA incluido. El total puede variar según el peso final de los productos.</p>
                {!canSubmitDelivery && <p className="retail-notice" role="status">{deliverySummary?.message || 'Revisá la dirección y la franja de entrega.'}</p>}
                {storeClosed && <div className="retail-notice"><p>{storeClosedMessage}</p><button className="retail-text-button" type="button" onClick={onStoreClosed}>Ver horario</button><button className="retail-text-button" type="button" onClick={() => go('delivery')}>Cambiar modalidad</button></div>}
              </>}
            </>}
          </div>
        </div>
        {cartItems.length > 0 && <footer className="retail-checkout-footer"><div><small>{step === 'cart' ? 'Subtotal' : 'Total aproximado'}</small><strong>{money(step === 'cart' ? discountedProductTotal : approximateTotalAmount)}</strong></div><button type="button" className="store-button" disabled={continueDisabled} onClick={continueFlow}>{submitting ? 'Enviando…' : step === 'review' ? 'Confirmar pedido' : step === 'address' && !currentUser ? 'Iniciar sesión' : 'Continuar'}<span aria-hidden="true"> →</span></button></footer>}
      </section>
    </div>
  );
}
