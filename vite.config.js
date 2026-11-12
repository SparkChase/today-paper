import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

const fromRoot = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  base: './',
  plugins: [tailwindcss()],
  resolve: {
    alias: { '@': fromRoot('./vendor/looseleaf') },
  },
  build: {
    rollupOptions: {
      input: {
        panel: fromRoot('./index.html'),
        background: fromRoot('./src/background.js'),
      },
      output: { entryFileNames: '[name].js' },
    },
  },
  esbuild: { jsx: 'automatic' },
})
