import { defineConfig } from 'vite';

// Base relativa: el mismo build sirve en localhost y en GitHub Pages (/mayor-o-menor-pokemon/).
export default defineConfig({
  base: './',
  server: { port: 5330, strictPort: true },
  build: {
    rollupOptions: { input: { main: 'index.html', creditos: 'creditos.html' } },
  },
});
