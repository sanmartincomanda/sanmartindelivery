import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  // Web deployments must load their hashed chunks from the same release and
  // host as index.html. The native build keeps relative paths inside the APK.
  base: mode === 'android' ? './' : '/',
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
