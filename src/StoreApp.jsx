import React, { useEffect, useMemo, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { database } from './firebase';
import TiendaVirtualView from './components/TiendaVirtualView';
import { hoyISO } from './components/Utils';
import { createOrder, ORDER_LIMIT_PER_DAY } from './services/orders';

const STORE_CANONICAL_ORIGIN = 'https://tienda.sanmartinsr.com';

export default function StoreApp() {
  const todayKey = hoyISO();
  const [todayCounter, setTodayCounter] = useState(0);

  useEffect(() => {
    document.title = 'Delivery Carnes San Martin Granada';
    document.documentElement.dataset.appTarget = 'store-android';

    return () => {
      delete document.documentElement.dataset.appTarget;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(database, `orderCounters/${todayKey}`), (snapshot) => {
      setTodayCounter(Number(snapshot.val() || 0));
    });

    return () => unsubscribe();
  }, [todayKey]);

  const nextOrderNumber = useMemo(
    () => Math.min(todayCounter + 1, ORDER_LIMIT_PER_DAY + 1),
    [todayCounter]
  );
  const remainingOrders = useMemo(
    () => Math.max(ORDER_LIMIT_PER_DAY - todayCounter, 0),
    [todayCounter]
  );

  return (
    <TiendaVirtualView
      onCreateOrder={(payload, options = {}) => createOrder(payload, options)}
      nextOrderNumber={nextOrderNumber}
      remainingOrders={remainingOrders}
      publicStoreUrl={STORE_CANONICAL_ORIGIN}
      mode="public"
    />
  );
}
