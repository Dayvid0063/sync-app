// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // Everything runs in the browser (model, storage, chat). No SSR keeps the
  // build a static bundle that the service worker can cache as an app shell.
  ssr: false,

  modules: ['@vite-pwa/nuxt'],

  app: {
    head: {
      title: 'Afronet',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Offline-first AI assistant that runs entirely on your device.' },
        { name: 'theme-color', content: '#0f766e' }
      ],
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ]
    }
  },

  vite: {
    worker: { format: 'es' },
    // transformers.js ships prebuilt ESM + WASM glue; pre-bundling it breaks the worker in dev.
    optimizeDeps: { exclude: ['@huggingface/transformers'] }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Afronet',
      short_name: 'Afronet',
      description: 'Offline-first AI assistant that runs entirely on your device.',
      lang: 'en',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8fafc',
      theme_color: '#0f766e',
      icons: [
        { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
        { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
        { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
      ]
    },
    workbox: {
      // App shell + self-hosted ONNX Runtime. Model files are cached by transformers.js, not the SW.
      globPatterns: ['**/*.{js,mjs,css,html,ico,png,svg,webmanifest,wasm}'],
      // ORT's WASM binary is ~27 MB.
      maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      // SPA: any navigation while offline is served the cached shell.
      navigateFallback: '/',
      cleanupOutdatedCaches: true
    },
    client: {
      installPrompt: true
    },
    // The SW is only active in production builds (`npm run generate`).
    devOptions: { enabled: false }
  }
})
