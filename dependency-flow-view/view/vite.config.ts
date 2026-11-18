import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';

const flow = path.resolve(__dirname, '../../dependency-flow/src');

// opdev upload 需要产物里带 project.config.json 和 index.json(官方 webpack 插件做的事,这里等价生成)
const opdevFiles = (): Plugin => ({
  name: 'opdev-files',
  apply: 'build',
  generateBundle() {
    const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../app.json'), 'utf-8'));
    const block = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'block.json'), 'utf-8'));
    this.emitFile({
      type: 'asset',
      fileName: 'project.config.json',
      source: JSON.stringify({ appid: app.appId, projectname: block.projectName, blocks: ['index'] }),
    });
    this.emitFile({
      type: 'asset',
      fileName: 'index.json',
      source: JSON.stringify({ blockTypeID: block.blockTypeID, blockRenderType: 'offlineWeb' }),
    });
  },
});

// 复用 dependency-flow 的全部界面代码,仅把 SDK 换成数据表视图用的旧版 block-bitable-api。
// 调试时 Base 通过 debugPort 加载 /block/,所以 dev 的 base 必须是 /block/;打包用 ./。
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/block/' : './',
  plugins: [react(), opdevFiles()],
  resolve: {
    alias: [
      { find: '@lark-base-open/js-sdk', replacement: path.resolve(__dirname, 'src/sdk-shim.ts') },
      { find: '@shared', replacement: path.resolve(__dirname, '../../shared/src') },
      { find: '@flow', replacement: flow },
    ],
  },
  server: { host: '0.0.0.0', port: 5176, fs: { allow: [path.resolve(__dirname, '../..')] } },
  build: { target: 'es2019', outDir: 'dist', emptyOutDir: true },
}));
