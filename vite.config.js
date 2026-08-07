import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const FIREBASE_PUBLIC_ASSET_ORIGIN = 'https://tiendavirtual-2ced1.web.app/';

export default defineConfig(({ mode }) => ({
  // Keep the lightweight HTML on the current domain while production assets
  // load from Firebase's CDN. Local development and the native app stay local.
  base:
    mode === 'production'
      ? FIREBASE_PUBLIC_ASSET_ORIGIN
      : './',
  plugins: [react()],
  resolve: {
    alias: {
      '@app-entry': resolve(
        process.cwd(),
        mode === 'android' ? 'src/StoreApp.jsx' : 'src/App.jsx'
      ),
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (
            id.includes('/node_modules/firebase/') ||
            id.includes('\\node_modules\\firebase\\') ||
            id.includes('/node_modules/@firebase/') ||
            id.includes('\\node_modules\\@firebase\\')
          ) {
            return 'firebase-vendor';
          }
          return undefined;
        },
      },
    },
  },
}));
