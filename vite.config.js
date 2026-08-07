import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const NETLIFY_PUBLIC_ASSET_ORIGIN = 'https://verdant-youtiao-5cd9d3.netlify.app/';

export default defineConfig(({ mode }) => ({
  // The custom domain currently has a slow IPv4 route. Production assets use
  // Netlify's dual-stack hostname while previews and the native app stay local.
  base:
    mode !== 'android' && process.env.CONTEXT === 'production'
      ? NETLIFY_PUBLIC_ASSET_ORIGIN
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
