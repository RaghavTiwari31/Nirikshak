/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    // In dev, the API is same-origin through this proxy, so VITE_API_BASE_URL can stay empty.
    proxy: { '/api': 'http://localhost:8000' },
  },
  build: {
    // The tree-shaken ECharts chunk (~610 kB, ~200 kB gzipped) is the only one above the
    // default 500 kB; pages are lazy-loaded, so it is fetched only when a chart page opens.
    chunkSizeWarningLimit: 650,
    // Never inline fonts as data: URIs, so the strict CSP (font-src 'self') holds.
    assetsInlineLimit: (file) => (file.endsWith('.woff2') ? false : undefined),
    rollupOptions: {
      output: {
        manualChunks: {
          echarts: ['echarts', 'echarts-for-react'],
          react: ['react', 'react-dom', 'react-router'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
