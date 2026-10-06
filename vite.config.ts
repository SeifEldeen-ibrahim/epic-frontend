/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Dev server sits behind the shared reverse proxy; HMR uses a fixed path and
// its client port follows the page origin, so no clientPort is pinned here.
export default defineConfig({
  plugins: [react()],
  // Git-ignored (.vite/) and inside the app dir, which the container user owns.
  cacheDir: '.vite',
  server: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
    allowedHosts: ['proxy', 'localhost', '172.17.0.1'],
    hmr: { path: '/__vite_hmr' },
  },
  preview: {
    host: '0.0.0.0',
    port: 8080,
    strictPort: true,
  },
  test: {
    // Default DOM environment; a file may opt into node with `// @vitest-environment node`.
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
  },
})
