import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import type { Plugin } from 'vite';

// 仅开发:接收 iframe 内回传的日志并打印到终端
const devLog = (): Plugin => ({
  name: 'dev-log',
  configureServer(server) {
    server.middlewares.use('/__log', (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        console.log('[plugin-log]', body);
        res.statusCode = 204;
        res.end();
      });
    });
  },
});

// base: './' 必须保留,否则部署后资源路径会失效
export default defineConfig({
  base: './',
  plugins: [react(), devLog()],
  resolve: {
    alias: { '@shared': path.resolve(__dirname, '../shared/src') },
  },
  server: { host: '0.0.0.0' },
});
