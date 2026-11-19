import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/figure-gallery/',
  plugins: [react()],
  build: { outDir: 'dist' },
});
