import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// One-off icon generation: `npm run icons` (outputs PNGs + favicon next to public/logo.svg)
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0f766e' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0f766e' } }
  },
  images: ['public/logo.svg']
})
