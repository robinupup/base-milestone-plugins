// 取数与订阅的小工具,纯逻辑,便于单元测试。

/**
 * "只认最新一次":连续发起多次异步读取时,较早发出但较晚返回的结果会被丢弃,
 * 避免慢请求把新数据覆盖成旧数据。
 */
export function createLatest() {
  let seq = 0;
  return {
    /** 发起一次读取;只有它仍是最新一次时才会调用 onResult */
    async run<T>(task: () => Promise<T>, onResult: (v: T) => void): Promise<boolean> {
      const mine = ++seq;
      const v = await task();
      if (mine !== seq) return false;
      onResult(v);
      return true;
    },
    /** 让所有尚未返回的读取作废(例如组件卸载、切换数据表时) */
    cancel() {
      seq++;
    },
  };
}

/**
 * 统一收集取消订阅函数。
 * 即使异步初始化在组件卸载之后才完成,迟到的订阅也会被立即取消,不会泄漏。
 */
export function createDisposer() {
  let disposed = false;
  const offs: Array<() => void> = [];
  return {
    get disposed() {
      return disposed;
    },
    add(off: () => void) {
      if (disposed) off();
      else offs.push(off);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const off of offs.splice(0)) {
        try {
          off();
        } catch {
          /* 取消订阅失败不影响其他清理 */
        }
      }
    },
  };
}

/** 标签页重新可见时回调,作为事件订阅之外的兜底刷新;返回取消函数 */
export function onBecameVisible(cb: () => void, doc: Pick<Document, 'addEventListener' | 'removeEventListener' | 'visibilityState'> = document) {
  const handler = () => {
    if (doc.visibilityState === 'visible') cb();
  };
  doc.addEventListener('visibilitychange', handler);
  return () => doc.removeEventListener('visibilitychange', handler);
}
