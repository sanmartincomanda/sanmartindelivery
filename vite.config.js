import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => ({
  base: './',
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
  },
}));
