import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    RubyPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./app/frontend', import.meta.url)),
    },
  },
})
