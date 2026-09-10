import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Two independent entry points, mirroring the original project's two
// self-contained HTML files (goat-simulador.html + deckbuilder.html).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        deckbuilder: resolve(import.meta.dirname, 'deckbuilder.html'),
      },
    },
  },
})
