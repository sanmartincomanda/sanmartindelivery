import React, { useEffect } from 'react';
import TiendaVirtualView from './components/TiendaVirtualView';
import { createOrder } from './services/orders';
import './styles/storeNativeApp.css';

const STORE_CANONICAL_ORIGIN = 'https://tienda.sanmartinsr.com';

export default function StoreApp() {
  useEffect(() => {
    document.title = 'Delivery Carnes San Martin Granada';
    document.documentElement.dataset.appTarget = 'store-android';

    return () => {
      delete document.documentElement.dataset.appTarget;
    };
  }, []);

  return (
    <div className="native-store-app">
      <TiendaVirtualView
        onCreateOrder={(payload, options = {}) => createOrder(payload, options)}
        publicStoreUrl={STORE_CANONICAL_ORIGIN}
        mode="public"
      />
    </div>
  );
}
