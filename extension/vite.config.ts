import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/background.ts'),
      output: {
        entryFileNames: 'background.js',
        format: 'es',
      },
    },
    target: 'esnext',
    minify: false,
  },
  resolve: {
    alias: {
      '@src': resolve(__dirname, '../src'),
    },
  },
});
