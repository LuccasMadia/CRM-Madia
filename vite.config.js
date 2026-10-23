import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// A mesma variável do server/index.js: o proxy segue a API que estiver rodando.
const API_PORTA = Number(process.env.CRM_PORTA_API) || 5174;

export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.png'],
      manifest: {
        name: 'CRM Madia',
        short_name: 'CRM Madia',
        description: 'Gestão de clientes, funil e conteúdos da Madia',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0b',
        theme_color: '#0a0a0b',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Sem html no precache: senão o index.html servido do cache responde "/" e o
        // start_url mesmo com a sessão do Access expirada, e o login nunca aparece.
        globPatterns: ['**/*.{js,css,png,svg}'],
        // Navegações sempre tentam a rede: com a sessão do Cloudflare Access expirada,
        // a recarga precisa chegar ao login em vez de receber o index.html do cache.
        navigateFallback: null,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            // Só guarda páginas de verdade (200), nunca o redirecionamento para o login.
            options: { cacheName: 'paginas', networkTimeoutSeconds: 3, cacheableResponse: { statuses: [200] } },
          },
        ],
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//, /^\/publico\//, /^\/cdn-cgi\//],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: true,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORTA}`,
      '/uploads': `http://127.0.0.1:${API_PORTA}`,
    },
  },
});
