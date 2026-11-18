import { bitable, dashboard, DashboardState } from '@lark-base-open/js-sdk';
import type { IConfig, IData, IDataCondition } from '@lark-base-open/js-sdk';
import { distinctValues, recordsToRows } from './records';
import type { RawRecord } from './records';
import type { DataRows } from './milestones';

export type PluginState = 'Create' | 'Config' | 'View' | 'FullScreen';

export interface TableInfo {
  id: string;
  name: string;
}
export interface FieldInfo {
  id: string;
  name: string;
  /** SDK FieldType 数值 */
  type: number;
}
export type ThemeMode = 'LIGHT' | 'DARK';

/** 对 SDK dashboard 的最小封装,方便在本地用 mock 数据调试 */
export interface Bridge {
  state: PluginState;
  isMock: boolean;
  getTables(): Promise<TableInfo[]>;
  getFields(tableId: string): Promise<FieldInfo[]>;
  getPreviewData(c: IDataCondition | IDataCondition[]): Promise<IData>;
  getData(): Promise<IData>;
  /** 按字段顺序取整表记录(每行末尾带计数列),直接读多维表格,不受仪表盘聚合接口的分组数限制 */
  getRows(tableId: string, fieldIds: string[]): Promise<DataRows>;
  getFieldValues(tableId: string, fieldId: string): Promise<string[]>;
  /** 记录增删改时回调,返回取消订阅函数 */
  onRecordsChange(tableId: string, cb: () => void): () => void;
  getConfig(): Promise<IConfig>;
  saveConfig(c: IConfig): Promise<boolean>;
  getTheme(): Promise<ThemeMode>;
  onDataChange(cb: () => void): () => void;
  onConfigChange(cb: () => void): () => void;
  onThemeChange(cb: (t: ThemeMode) => void): () => void;
  setRendered(): Promise<void>;
}

const params = () => new URLSearchParams(window.location.search);
export const isMockMode = () => params().has('mock');

async function loadRecords(tableId: string, fieldIds?: string[]): Promise<RawRecord[]> {
  const table = await bitable.base.getTableById(tableId);
  const out: RawRecord[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 200; i++) {
    const res = await table.getRecords({ pageSize: 200, pageToken, ...(fieldIds ? { fieldIds } : {}) } as never);
    for (const r of res.records) out.push({ recordId: r.recordId, fields: r.fields as Record<string, unknown> });
    if (!res.hasMore || !res.pageToken) break;
    pageToken = res.pageToken;
  }
  return out;
}

function realBridge(): Bridge {
  return {
    state: dashboard.state as unknown as PluginState,
    isMock: false,
    async getTables() {
      const list = await bitable.base.getTableMetaList();
      return list.map((t) => ({ id: t.id, name: t.name }));
    },
    async getFields(tableId) {
      // 官方要求用 View 模块拉字段,这样返回的字段顺序和界面一致
      try {
        const table = await bitable.base.getTableById(tableId);
        const views = await table.getViewMetaList();
        const view = await table.getViewById(views[0].id);
        const list = await view.getFieldMetaList();
        return list.map((f) => ({ id: f.id, name: f.name, type: f.type as unknown as number }));
      } catch {
        const cats = await dashboard.getCategories(tableId);
        return cats.map((f) => ({ id: f.fieldId, name: f.fieldName, type: f.fieldType as unknown as number }));
      }
    },
    getPreviewData: (c) => dashboard.getPreviewData(c),
    getData: () => dashboard.getData(),
    async getRows(tableId, fieldIds) {
      return recordsToRows(await loadRecords(tableId, fieldIds), fieldIds);
    },
    async getFieldValues(tableId, fieldId) {
      return distinctValues(await loadRecords(tableId, [fieldId]), fieldId);
    },
    onRecordsChange(tableId, cb) {
      let dead = false;
      let offs: Array<() => void> = [];
      bitable.base
        .getTableById(tableId)
        .then((tb) => {
          if (dead) return;
          offs = [tb.onRecordAdd(cb), tb.onRecordModify(cb), tb.onRecordDelete(cb)];
        })
        .catch(() => {});
      return () => {
        dead = true;
        offs.forEach((f) => f());
      };
    },
    getConfig: () => dashboard.getConfig(),
    saveConfig: (c) => dashboard.saveConfig(c),
    async getTheme() {
      const t = await dashboard.getTheme();
      return t.theme as unknown as ThemeMode;
    },
    onDataChange: (cb) => dashboard.onDataChange(() => cb()),
    onConfigChange: (cb) => dashboard.onConfigChange(() => cb()),
    onThemeChange: (cb) => dashboard.onThemeChange((e) => cb(e.data.theme as unknown as ThemeMode)),
    async setRendered() {
      await dashboard.setRendered();
    },
  };
}

export async function createBridge(): Promise<Bridge> {
  if (isMockMode()) {
    const { createMockBridge } = await import('./mock');
    return createMockBridge();
  }
  return realBridge();
}

export { DashboardState };
