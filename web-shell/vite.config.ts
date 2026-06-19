import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
  },
  optimizeDeps: {
    exclude: ['diagram_wasm'],
  },
  server: {
    port: 4100,
    strictPort: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
