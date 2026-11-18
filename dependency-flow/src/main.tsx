import React from 'react';
import ReactDOM from 'react-dom/client';
import '@semi-bot/semi-theme-feishu-dashboard/semi.min.css';
import '@shared/styles.css';
import './styles.css';
import { App } from './App';
import { installDevLog } from '@shared/devlog';

installDevLog();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
