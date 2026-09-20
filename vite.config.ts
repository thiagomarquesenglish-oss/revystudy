import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(() => {
  return ({
  define: {
    __APP_VERSION__: JSON.stringify('1.3.28'),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png", "apple-touch-icon.png"],
      workbox: {
        navigateFallbackDenylist: [/^\/~oauth/],
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Verified downloads must never be intercepted by the media cache.
            urlPattern: ({ url }) => url.searchParams.has('revystudy_download'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Files downloaded from Settings live in this bounded cache.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'revystudy-media-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 365, purgeOnQuotaError: true },
              rangeRequests: true,
            },
          },
          {
            // IndexedDB is the app's single offline data cache. Keeping REST
            // responses in Workbox duplicated card HTML and exhausted iOS.
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkOnly',
          },
        ],
      },
      manifest: {
        name: "RevyStudy",
        short_name: "RevyStudy",
        description: "Aplicativo de flashcards com repetição espaçada",
        theme_color: "#1B1B1C",
        background_color: "#1B1B1C",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  });
});

