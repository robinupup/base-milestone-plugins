import React from 'react';
import ReactDOM from 'react-dom/client';
// 官方定制的 Semi 主题(预编译 CSS,已包含 Semi 全量样式)
import '@semi-bot/semi-theme-feishu-dashboard/semi.min.css';
import '@shared/styles.css';
import './styles.css';
import { App } from './App';

document.documentElement.lang = new URLSearchParams(window.location.search).get('lang') ?? navigator.language;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
