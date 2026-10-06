import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CheckoutSheet, ProfileSheet, StoreMobileActivityPage, StoreMobileProfilePage, StoreClosedNoticeModal, OrderSuccessSheet } from '../../src/components/TiendaVirtualView';
import StoreRewardsSheet from '../../src/components/StoreRewardsSheet';
import { FirstOrderRewardSelector } from '../../src/components/FirstOrderRewardExperience';
import { useRetailFocusLayers } from '../../src/components/storefront/useRetailNavigation';
import { getRouteSanMartinSlots } from '../../src/services/routeSanMartin';
import { ORDER_FULFILLMENT_DELIVERY, ORDER_FULFILLMENT_PICKUP } from '../../src/services/orders';

const address = { id: 'qa-home', nombre: 'Casa', direccion: 'Dirección de prueba en Granada', referencia: 'Portón azul', ubicacion: { lat: 11.93, lng: -85.953, label: 'Granada' }, predeterminada: true };
const user = { firebaseKey: 'qa-not-a-real-account', nombre: 'Cliente de prueba', telefono: '50500000000', ...address, nombre: 'Cliente de prueba', direccionesGuardadas: [address] };
const branch = { id: 'granada', shortName: 'Granada', name: 'Carnes San Martín Granada', address: 'Dirección de sucursal de prueba', storeLocation: address.ubicacion };
const initialItems = [{ codigo: 'qa-res', nombre: 'RIB EYE PREMIUM PARA PARRILLA', cantidad: 4, unidad: 'lb', precioUnitario: 285, minQuantity: .5, quantityStep: .5, image: '/tienda/page/product-gold.jpg' }, { codigo: 'qa-pollo', nombre: 'FILETE DE POLLO', cantidad: 2, unidad: 'lb', precioUnitario: 98, minQuantity: .5, quantityStep: .5, image: '/tienda/page/product-birria.jpg' }];
const rewards = [{ id: 'qa-reward', name: 'Premio de prueba', pointsRequired: 100, active: true, available: true, minPurchaseAmount: 0, image: '/tienda/page/product-gold.jpg', items: [{ id: 'qa-item', productCode: 'qa-res', productName: 'RIB EYE', quantity: 1, unit: 'lb' }] }, { id: 'qa-out', name: 'Premio agotado', pointsRequired: 50, available: false, image: '/tienda/page/product-birria.jpg' }];
const gift = { id: 'qa-gift', name: 'Regalía de prueba', image: '/tienda/page/product-gold.jpg', description: 'Muestra local', availableQuantity: 3 };
const orders = ['pendiente', 'preparando', 'preparado', 'enviado', 'entregado', 'cancelado'].map((estado, index) => ({ id: index + 1, firebaseKey: `qa-order-${index}`, estado, cliente: user.nombre, direccion: address.direccion, fecha: '06/10/2026', timestampIngreso: '10:42', total: 1336, fulfillmentType: ORDER_FULFILLMENT_DELIVERY, storeBranchId: 'granada', storeBranchName: branch.name, items: initialItems.map((item) => ({ ...item, subtotal: item.cantidad * item.precioUnitario })), repartidor: 'Driver de prueba', createdAt: 1791304920000 }));

function Fixture() {
  useRetailFocusLayers(true);
  const params = new URLSearchParams(window.location.search);
  const [screen, setScreen] = useState(params.get('screen') || 'checkout');
  const [items, setItems] = useState(initialItems);
  const [step, setStep] = useState('cart');
  const [customer, setCustomer] = useState({ metodoPago: 'EFECTIVO', cambioPara: '' });
  const [mode, setMode] = useState(ORDER_FULFILLMENT_DELIVERY);
  const [deliveryMode, setDeliveryMode] = useState('perfil');
  const [alternate, setAlternate] = useState({ direccion: '', referencia: '', ubicacion: null });
  const [notes, setNotes] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [slot, setSlot] = useState('');
  const [gold, setGold] = useState(false);
  const [reward, setReward] = useState(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [selectedGift, setSelectedGift] = useState(null);
  const [profile, setProfile] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [closedModal, setClosedModal] = useState(false);
  const [saved, setSaved] = useState(null);
  const [submitted, setSubmitted] = useState(null);
  const total = items.reduce((sum, item) => sum + item.cantidad * item.precioUnitario, 0);
  const discount = coupon ? total * .1 : 0;
  const fee = mode === ORDER_FULFILLMENT_DELIVERY ? 60 : 0;
  const unavailable = params.has('unavailable');
  const giftEnabled = params.has('gift');
  const settings = { enabled: true, pointsPerCurrencyUnit: 1 };
  const setScreenFromMenu = (view) => { if (view === 'profile') setScreen('profile'); else setProfile(view); };
  const slots = getRouteSanMartinSlots(new Date('2026-10-06T18:00:00-06:00'));
  return <div className="store-shell storefront-public-v2 storefront-brand-v3 storefront-retail">
    <main style={{ padding: 16 }}>
      <p>QA aislado. Sin cuentas, pedidos ni cobros reales.</p>
      <button onClick={() => setScreen('checkout')}>Abrir carrito de prueba</button>
      <button onClick={() => setScreen('profile')}>Perfil de prueba</button>
      <button onClick={() => setScreen('activity')}>Actividad de prueba</button>
      <button onClick={() => setGold(true)}>Gold de prueba</button>
      {screen === 'profile' && <StoreMobileProfilePage currentUser={user} rewardPoints={804} selectedBranch={branch} onEditProfile={setScreenFromMenu} onOpenRewards={() => setGold(true)} onOpenActivity={() => setScreen('activity')} onSignOut={() => setScreen('signedout')} />}
      {screen === 'activity' && <StoreMobileActivityPage currentUser={user} orders={orders} selectedOrderId={selectedOrderId} onSelectOrder={setSelectedOrderId} onOrderBack={() => setSelectedOrderId('')} onCancelOrder={() => setSaved({ canceled: true })} />}
      {saved && <output data-testid="saved">{JSON.stringify(saved)}</output>}
      {submitted && <output data-testid="submitted">{JSON.stringify(submitted)}</output>}
    </main>
    {screen === 'checkout' && !gold && <CheckoutSheet retail checkoutStep={step} onCheckoutStepChange={setStep}
      cartItems={items.map((item) => ({ ...item, subtotal: item.cantidad * item.precioUnitario }))} currentUser={params.has('guest') ? null : user} customer={customer}
      fulfillmentType={mode} routeSlots={slots} routeSlotId={slot} deliveryMode={deliveryMode} savedAddresses={[address]} selectedSavedAddress={address}
      alternateDelivery={alternate} alternateLocating={false} notes={notes} submitting={false} appliedCoupon={coupon}
      couponDiscount={discount} discountBenefit={coupon ? { source: 'coupon', label: 'Cupón QA', amount: discount } : null} couponInput={couponInput} couponMessage={couponMessage}
      approximateTotalAmount={total - discount + fee} discountedProductTotal={total - discount} deliveryQuote={{ available: !unavailable, deliveryFree: fee === 0 }}
      deliverySummary={{ title: 'Cobertura', message: unavailable ? 'Esta dirección está fuera de cobertura.' : 'Dirección con cobertura.' }} deliveryFeeAmount={fee} estimatedRewardPoints={26}
      storeOperationStatus={{ open: !params.has('closed') }} storeClosedMessage="Cerrado. Abre mañana a las 6:45 a. m." totalAmount={total}
      rewardSettings={settings} selectedReward={reward} firstOrderRewardEnabled={giftEnabled} firstOrderProgress={{ currentTier: { id: 'qa-tier' }, progress: 80, amount: total, targetAmount: 1500 }} selectedFirstOrderGift={selectedGift}
      defaultLocation={address.ubicacion} selectedBranch={branch} onClose={() => setScreen('profile')}
      onCustomerChange={(field, value) => setCustomer((current) => ({ ...current, [field]: value }))}
      onFulfillmentTypeChange={setMode} onRouteSlotChange={setSlot} onDeliveryModeChange={setDeliveryMode} onSavedAddressSelect={() => setDeliveryMode('perfil')}
      onQuantityChange={(code, quantity) => setItems((current) => current.map((item) => item.codigo === code ? { ...item, cantidad: Number(quantity) } : item).filter((item) => item.cantidad > 0))}
      onAlternateDeliveryChange={(field, value) => setAlternate((current) => ({ ...current, [field]: value }))} onCaptureAlternateLocation={() => setAlternate((current) => ({ ...current, ubicacion: address.ubicacion }))}
      onApplyCoupon={() => { if (couponInput === 'QA10') { setCoupon({ code: 'QA10' }); setCouponMessage('Cupón aplicado'); } else { setCoupon(null); setCouponMessage('Cupón no encontrado o inactivo.'); } }}
      onCouponInputChange={setCouponInput} onEditProfile={() => setProfile('addresses')} onNotesChange={setNotes}
      onOpenLogin={() => setSaved({ loginRequested: true })} onOpenRegister={() => setSaved({ registerRequested: true })}
      onOpenRewards={() => setGold(true)} onOpenFirstOrderGift={() => setGiftOpen(true)} onClearSelectedReward={() => setReward(null)}
      onRemoveCoupon={() => { setCoupon(null); setCouponMessage(''); }} onStoreClosed={() => setClosedModal(true)}
      onSubmit={() => { setSubmitted({ items, customer, mode, slot, deliveryMode, alternate, coupon, reward, selectedGift, notes, total: total - discount + fee }); setScreen('confirmation'); }} />}
    {profile && <ProfileSheet view={profile} user={user} defaultLocation={address.ubicacion} onClose={() => setProfile('')} onSave={(value) => { setSaved(value); setProfile(''); }} onSignOut={() => setScreen('signedout')} />}
    <StoreRewardsSheet open={gold} currentUser={user} settings={settings} rewards={rewards} account={{ pointsBalance: 804 }} transactions={[{ id: 'qa-tx', type: 'earned', signedPoints: 40, createdAt: 1791304920000, note: 'Pedido de prueba' }]} cartAmount={total} selectedReward={reward} onSelectReward={(item) => { setReward({ rewardId: item.id, rewardName: item.name, image: item.image }); setGold(false); }} onClearSelectedReward={() => setReward(null)} onClose={() => setGold(false)} />
    <FirstOrderRewardSelector open={giftOpen} items={params.has('soldout') ? [] : [gift]} selectedItem={selectedGift} onSelect={setSelectedGift} onClose={() => setGiftOpen(false)} />
    {screen === 'confirmation' && <OrderSuccessSheet retail onClose={() => { setScreen('activity'); setSelectedOrderId('qa-order-0'); }} />}
    {closedModal && <StoreClosedNoticeModal scheduleRows={[{ key: 'qa-mon', label: 'Lunes a sábado', summary: '6:45 a. m. – 5:00 p. m.' }]} onClose={() => setClosedModal(false)} />}
  </div>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
