import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const path = (value) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path('./'),
  publicDir: path('../../public'),
  plugins: [react()],
  resolve: {
    alias: ['orders', 'clientDirectory', 'storeCatalog', 'storeDeliverySettings', 'storeBranches']
      .map((service) => ({ find: `../services/${service}`, replacement: path(`./services.js`) })),
  },
  server: { host: '127.0.0.1', port: 5192, strictPort: true, fs: { allow: [path('../../')] } },
});
