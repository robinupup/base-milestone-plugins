import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// base: './' 必须保留,否则部署后资源路径会失效
export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared/src') },
  },
  server: { host: '0.0.0.0' },
});
