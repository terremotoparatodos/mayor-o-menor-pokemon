import { defineConfig } from 'vite';

// Juego de grabación: sólo index.html.
export default defineConfig({
  server: { port: 5330, strictPort: true },
});
