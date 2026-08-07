import React, { useEffect } from 'react';
import TiendaVirtualView from './components/TiendaVirtualView';
import { createOrder } from './services/orders';
import {
  DEFAULT_STORE_BRANCHES,
  getStoreBranchIdFromPathname,
} from './services/storeBranches';

const STORE_CANONICAL_ORIGIN = 'https://tienda.sanmartinsr.com';
const CHUNK_RECOVERY_FLAG = 'sanmartin_chunk_recovery_once';

const createPublicStoreOrder = (payload, options = {}) => createOrder(payload, options);
const getPublicStoreUrl = () => {
  const isCanonicalHost = window.location.hostname === 'tienda.sanmartinsr.com';
  const origin = isCanonicalHost ? window.location.origin : STORE_CANONICAL_ORIGIN;
  return `${origin}${window.location.pathname}`;
};

export default function PublicStoreApp() {
  useEffect(() => {
    const branchId = getStoreBranchIdFromPathname(window.location.pathname) || 'granada';
    const branch = DEFAULT_STORE_BRANCHES[branchId] || DEFAULT_STORE_BRANCHES.granada;

    document.title = branch.brandTitle || `Delivery Carnes San Martin ${branch.shortName}`;
    window.sessionStorage.removeItem(CHUNK_RECOVERY_FLAG);
  }, []);

  return (
    <TiendaVirtualView
      onCreateOrder={createPublicStoreOrder}
      publicStoreUrl={getPublicStoreUrl()}
      mode="public"
    />
  );
}
