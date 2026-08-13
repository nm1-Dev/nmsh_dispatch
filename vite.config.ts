import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const rootDirectory = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: 'frontend',
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../html',
    emptyOutDir: false,
    assetsDir: 'build',
    rollupOptions: {
      input: {
        index: resolve(rootDirectory, 'frontend/index.html'),
        'full-dispatch': resolve(rootDirectory, 'frontend/full-dispatch.html'),
      },
    },
  },
})
