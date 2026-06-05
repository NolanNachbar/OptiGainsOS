import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import path from 'path'
import fs from 'fs'

// Use HTTPS only when VITE_HTTPS=true (needed for barcode camera on LAN/iPhone)
const useHttps = process.env.VITE_HTTPS === 'true';
const base = process.env.GITHUB_PAGES ? '/OptiGainsOS/' : '/';

// Rewrites start_url/scope in dist/manifest.json to match the actual base path.
function pwaManifestBase(base) {
  return {
    name: 'pwa-manifest-base',
    apply: 'build',
    closeBundle() {
      const manifestPath = path.resolve(__dirname, 'dist/manifest.json');
      if (!fs.existsSync(manifestPath)) return;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      manifest.start_url = base;
      manifest.scope = base;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), ...(useHttps ? [basicSsl()] : []), pwaManifestBase(base)],
  server: {
    ...(useHttps ? { https: true } : {}),
    host: true,
    headers: {
      'Cache-Control': 'no-store',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
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
