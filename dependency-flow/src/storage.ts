// 流程图配置的本地存储:数据表视图里按"视图 id"隔离,避免同一个插件的多个视图共用一份配置。
// 纯逻辑(storage 由调用方传入),便于测试。

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const PREFIX = 'dependency-flow:';

/** 旧版本只按页面路径存,同一插件的所有视图共用同一个 key */
export const legacyKey = (pathname: string) => `${PREFIX}${pathname}`;
export const configKey = (viewId: string | undefined, pathname: string) =>
  viewId ? `${PREFIX}view:${viewId}` : legacyKey(pathname);

const parse = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/** 先读本视图的配置;没有时沿用旧的共享配置,这样升级后已有设置不会丢 */
export function readConfig<T>(kv: KV, viewId: string | undefined, pathname: string): T | null {
  const own = parse<T>(kv.getItem(configKey(viewId, pathname)));
  if (own) return own;
  return viewId ? parse<T>(kv.getItem(legacyKey(pathname))) : null;
}

export function writeConfig<T>(kv: KV, viewId: string | undefined, pathname: string, value: T): void {
  kv.setItem(configKey(viewId, pathname), JSON.stringify(value));
}
