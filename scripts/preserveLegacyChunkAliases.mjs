import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '../dist/assets');

const LEGACY_CHUNK_ALIASES = {
  TiendaVirtualAdminView: [
    'TiendaVirtualAdminView-6itDpGSD.js',
    'TiendaVirtualAdminView-BZoPeeDK.js',
    'TiendaVirtualAdminView-TeSxWxGI.js',
    'TiendaVirtualAdminView-CeklrUxf.js',
  ],
  KitchenView: [
    'KitchenView-BPgKowig.js',
    'KitchenView-CVdud4v9.js',
    'KitchenView-B1eMkPlH.js',
    'KitchenView-DHn8EKo5.js',
  ],
  DriverView: [
    'DriverView-BXD5CVrb.js',
    'DriverView-ByGo15NA.js',
    'DriverView-C9oFgWbm.js',
    'DriverView-BLGH-nY6.js',
  ],
  ConfiguracionView: [
    'ConfiguracionView-CPqEeVbh.js',
    'ConfiguracionView-O-k-xMTi.js',
    'ConfiguracionView-BifAzsTL.js',
    'ConfiguracionView-Bh-q8v59.js',
  ],
  TiendaVirtualView: [
    'TiendaVirtualView-DE3yxHVA.js',
    'TiendaVirtualView-GDliRfsN.js',
    'TiendaVirtualView-R2tXb9Rj.js',
    'TiendaVirtualView-BhDM7FrH.js',
  ],
  storeDeliverySettings: [
    'storeDeliverySettings-lJRHKE57.js',
    'storeDeliverySettings-CxG_FcV5.js',
    'storeDeliverySettings-2gET5yPa.js',
    'storeDeliverySettings-OQorx0EH.js',
  ],
  ListaPedidos: [
    'ListaPedidos-D6iORSkk.js',
    'ListaPedidos-CZVBlg6x.js',
    'ListaPedidos-ZbVyNBvA.js',
    'ListaPedidos-DItzYqpk.js',
  ],
  BaseDatosView: [
    'BaseDatosView-CqTQ-9IF.js',
    'BaseDatosView-D2kg5DgJ.js',
    'BaseDatosView-BILnofz9.js',
    'BaseDatosView-B7GEcEyY.js',
  ],
  CrmView: [
    'CrmView-BJP6ZMB9.js',
    'CrmView-BYoeEAGM.js',
    'CrmView-D2ILb49m.js',
    'CrmView-CA1xUQzz.js',
  ],
  OrderForm: [
    'OrderForm--fRYPxIo.js',
    'OrderForm-w5rlZucH.js',
    'OrderForm-lqU-DHXa.js',
    'OrderForm-DZp8QGu_.js',
  ],
  sicarCatalog: [
    'sicarCatalog-BMRRnQIA.js',
  ],
  index: [
    'index-YnJNeJfG.js',
    'index-CoOHaIDK.js',
    'index-DhtaOwU8.js',
    'index-D0zz5xdi.js',
    'index-DQqLl5Ki.js',
    'index-D389tvB7.js',
    'index-Ci4x7oe3.js',
    'index-ZfKy3csY.js',
    'index-CU9Q52aZ.js',
  ],
};

const findCurrentChunkByPrefix = async (prefix) => {
  const assetNames = await fs.readdir(assetsDir);
  return assetNames.find((name) => name.startsWith(`${prefix}-`) && name.endsWith('.js')) || null;
};

const ensureLegacyAlias = async (currentFileName, legacyFileName) => {
  if (!currentFileName || currentFileName === legacyFileName) {
    return false;
  }

  const sourcePath = path.join(assetsDir, currentFileName);
  const targetPath = path.join(assetsDir, legacyFileName);
  await fs.copyFile(sourcePath, targetPath);
  return true;
};

async function main() {
  const created = [];

  for (const [prefix, legacyFiles] of Object.entries(LEGACY_CHUNK_ALIASES)) {
    const currentFileName = await findCurrentChunkByPrefix(prefix);
    if (!currentFileName) {
      continue;
    }

    for (const legacyFileName of legacyFiles) {
      const copied = await ensureLegacyAlias(currentFileName, legacyFileName);
      if (copied) {
        created.push(`${legacyFileName} -> ${currentFileName}`);
      }
    }
  }

  if (created.length) {
    console.log(`Legacy chunk aliases preserved: ${created.length}`);
    created.forEach((line) => console.log(`- ${line}`));
  } else {
    console.log('No legacy chunk aliases needed.');
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
