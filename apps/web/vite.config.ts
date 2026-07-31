import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Bun keeps app and workspace-package dependencies isolated. Force every
    // shared component to use the web app's React instance so hooks resolve
    // against the renderer's dispatcher instead of a second bundled copy.
    dedupe: ['react', 'react-dom'],
  },
  build: { outDir: 'dist' },
});
