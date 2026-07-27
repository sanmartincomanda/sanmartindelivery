import React from 'react';
import ConfiguracionView from './ConfiguracionView';
import BranchStoreAdminView from './BranchStoreAdminView';

export default function TiendaVirtualAdminView({ branchScope = null, username = '' }) {
  if (branchScope?.id) {
    return (
      <BranchStoreAdminView
        branchId={branchScope.id}
        branchName={branchScope.name || branchScope.id}
        username={username}
      />
    );
  }

  return <ConfiguracionView mode="store" />;
}
