import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Application installable (PWA).
 * RÈGLE DE SÉCURITÉ : le service worker ne met JAMAIS en cache les
 * échanges avec Supabase (données, connexion, fonctions, fichiers) ni
 * avec Bictorys : ils passent toujours par le réseau (NetworkOnly).
 * Seule l'interface est mise en cache (HTML, JS, CSS, polices, icônes).
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',        // la mise à jour attend l'accord de l'utilisateur (bandeau)
      injectRegister: false,          // enregistrement fait par UpdatePrompt.jsx
      includeManifestIcons: false,    // déjà pré-chargées via globPatterns (évite les doublons)
      manifest: {
        id: '/',
        name: 'Margee+ — Gère ton business e-commerce',
        short_name: 'Margee+',
        description: 'Ventes, reçus, pubs, bénéfice réel, objectifs et épargne dans une seule app.',
        start_url: '/app/dashboard?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1B1D21',
        background_color: '#FAF7F0',
        lang: 'fr',
        dir: 'ltr',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Ajouter une vente',
            short_name: 'Vente',
            description: 'Ouvre directement le formulaire de vente',
            url: '/app/ventes?nouvelle=1&source=pwa',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
          {
            name: 'Tableau de bord',
            short_name: 'Dashboard',
            url: '/app/dashboard?source=pwa',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        // Interface : pré-chargée pour un démarrage rapide
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        // Pas de « fallback » SPA depuis le cache : les pages passent par le
        // réseau, et sans réseau on affiche offline.html (règle ci-dessous).
        navigateFallback: null,
        runtimeCaching: [
          {
            // Supabase (API, auth, storage, fonctions) et Bictorys : JAMAIS de cache.
            // La fonction est recopiée telle quelle dans sw.js : elle ne doit
            // utiliser aucune variable de ce fichier (d'où l'expression en dur).
            urlPattern: ({ url }) => /(\.supabase\.(co|in)|bictorys\.com)$/.test(url.hostname),
            handler: 'NetworkOnly',
          },
          {
            // Pages : toujours le réseau ; hors ligne → page « Hors connexion »
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
            options: { precacheFallback: { fallbackURL: '/offline.html' } },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Police d'icônes (version figée dans index.html)
            urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@tabler\/icons-webfont@.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'icon-font',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { port: 5173 },
});
