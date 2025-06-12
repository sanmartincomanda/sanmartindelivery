import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true // hace que Vite escuche en 0.0.0.0 y sea accesible desde otras máquinas
  }
})
