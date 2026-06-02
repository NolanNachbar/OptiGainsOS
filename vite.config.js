import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'

// Use HTTPS only when VITE_HTTPS=true (needed for barcode camera on LAN/iPhone)
const useHttps = process.env.VITE_HTTPS === 'true';

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/OptiGains/' : '/',
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  server: {
    ...(useHttps ? { https: true } : {}),
    host: true, // expose on LAN
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // manualChunks: {
        //   // Split vendor libraries into separate chunks
        //   'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        //   'ui-vendor': ['lucide-react', 'sonner', 'framer-motion'],
        //   'data-vendor': ['@tanstack/react-query', '@supabase/supabase-js', 'zod'],
        //   'chart-vendor': ['recharts', 'date-fns'],
        // },
      },
    },
    chunkSizeWarningLimit: 600, // Increase limit slightly to reduce noise
  },
})
