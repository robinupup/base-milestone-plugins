import { bitable, dashboard } from '@lark-base-open/js-sdk';
import { GroupMode, SourceType } from '@lark-base-open/js-sdk';
import type { FlowConfig } from './graph.ts';
import { isMock } from './data.ts';

export type HostState = 'Create' | 'Config' | 'View' | 'FullScreen' | 'TableView';
export type Theme = 'LIGHT' | 'DARK';

export interface Host {
  state: HostState;
  loadConfig(): Promise<Partial<FlowConfig> | null>;
  saveConfig(c: FlowConfig): Promise<boolean>;
  setRendered(): Promise<void>;
  getTheme(): Promise<Theme>;
  onThemeChange(cb: (t: Theme) => void): () => void;
}

const params = () => new URLSearchParams(window.location.search);
const storeKey = (suffix = '') => `dependency-flow:${window.location.pathname}${suffix}`;

const localConfig = (): Partial<FlowConfig> | null => {
  try {
    return JSON.parse(localStorage.getItem(storeKey()) || 'null');
  } catch {
    return null;
  }
};

const systemTheme = (): Theme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT');

/** 数据表视图 / 独立打开 / 本地 mock:配置存在 localStorage */
function tableViewHost(): Host {
  return {
    state: 'TableView',
    loadConfig: async () => localConfig(),
    saveConfig: async (c) => {
      localStorage.setItem(storeKey(), JSON.stringify(c));
      return true;
    },
    setRendered: async () => {},
    async getTheme() {
      const q = params().get('theme');
      if (q) return q.toUpperCase() === 'DARK' ? 'DARK' : 'LIGHT';
      if (isMock()) return systemTheme();
      try {
        const bridge = (bitable as unknown as { bridge?: { getTheme?: () => Promise<string> } }).bridge;
        // 取不到主题时不能卡住初始化,最多等 1.5 秒
        const t = await Promise.race([
          bridge?.getTheme?.(),
          new Promise<undefined>((r) => setTimeout(() => r(undefined), 1500)),
        ]);
        if (t) return t.toUpperCase() === 'DARK' ? 'DARK' : 'LIGHT';
      } catch {
        /* 使用系统主题 */
      }
      return systemTheme();
    },
    onThemeChange: () => () => {},
  };
}

/** 仪表盘自定义插件:配置存在仪表盘里 */
function dashboardHost(): Host {
  const mock = isMock();
  const state = (mock ? (params().get('state') as HostState) : (dashboard.state as unknown as HostState)) || 'View';
  return {
    state,
    async loadConfig() {
      if (mock) return localConfig();
      const saved = await dashboard.getConfig();
      const custom = saved.customConfig as Partial<FlowConfig> | undefined;
      const cond = saved.dataConditions?.[0];
      return custom || cond ? { ...custom, tableId: custom?.tableId ?? cond?.tableId } : null;
    },
    async saveConfig(c) {
      if (mock) {
        localStorage.setItem(storeKey(), JSON.stringify(c));
        return true;
      }
      return dashboard.saveConfig({
        customConfig: c as unknown as Record<string, unknown>,
        dataConditions: c.tableId
          ? [
              {
                tableId: c.tableId,
                dataRange: { type: SourceType.ALL },
                groups: c.nameFieldId ? [{ fieldId: c.nameFieldId, mode: GroupMode.INTEGRATED }] : undefined,
                series: 'COUNTA',
              },
            ]
          : [],
      });
    },
    async setRendered() {
      if (!mock) await dashboard.setRendered();
    },
    async getTheme() {
      const q = params().get('theme');
      if (q) return q.toUpperCase() === 'DARK' ? 'DARK' : 'LIGHT';
      if (mock) return state === 'FullScreen' ? 'DARK' : 'LIGHT';
      const t = await dashboard.getTheme();
      return t.theme as unknown as Theme;
    },
    onThemeChange(cb) {
      if (mock) return () => {};
      return dashboard.onThemeChange((e) => cb(e.data.theme as unknown as Theme));
    },
  };
}

/**
 * 默认按数据表视图 / 独立页面处理。
 * 作为仪表盘自定义插件使用时,在插件地址后面加 ?host=dashboard。
 * 本地 mock 想预览仪表盘的创建/配置/全屏状态:?mock&state=Create|Config|View|FullScreen
 */
export function createHost(): Host {
  const q = params();
  const dash = q.get('host') === 'dashboard' || (isMock() && q.has('state'));
  return dash ? dashboardHost() : tableViewHost();
}
