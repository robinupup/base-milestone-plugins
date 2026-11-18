/// <reference types="vite/client" />
// 仅开发环境:把插件 iframe 里的日志和报错回传到 vite 终端。
// 插件跑在飞书页面的 iframe 里,没法直接开 DevTools 时用它排查。
export function dlog(...args: unknown[]) {
  if (!import.meta.env.DEV) return;
  const msg = args
    .map((a) => (typeof a === 'string' ? a : a instanceof Error ? `${a.name}: ${a.message}` : JSON.stringify(a)))
    .join(' ');
  try {
    void fetch('/__log', { method: 'POST', body: msg, keepalive: true });
  } catch {
    /* ignore */
  }
}

export function installDevLog() {
  if (!import.meta.env.DEV) return;
  dlog('boot', window.location.href, 'inIframe=', window.self !== window.top);
  window.addEventListener('error', (e) => dlog('window.error', e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) =>
    dlog('unhandledrejection', (e.reason && (e.reason.message || String(e.reason))) || 'unknown'),
  );
}
