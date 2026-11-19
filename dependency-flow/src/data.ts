import { bitable } from '@lark-base-open/js-sdk';
import { loadRecords } from '@shared';
import type { FieldInfo, TableInfo } from '@shared';
import type { RawRecord } from '../../shared/src/records.ts';
import { MOCK_FIELDS, MOCK_RECORDS, MOCK_TABLES } from './mock.ts';

export interface Source {
  getTables(): Promise<TableInfo[]>;
  getFields(tableId: string): Promise<FieldInfo[]>;
  loadRecords(tableId: string): Promise<RawRecord[]>;
  /** 记录增删改时回调 cb,字段增删改时回调 onFields(不传则也走 cb),返回取消订阅 */
  subscribe(tableId: string, cb: () => void, onFields?: () => void): () => void;
  /** 当前在界面里选中的数据表(数据表视图里就是当前表) */
  currentTableId(): Promise<string | undefined>;
}

export const isMock = () => new URLSearchParams(window.location.search).has('mock');

const mockSource: Source = {
  getTables: async () => MOCK_TABLES,
  getFields: async () => MOCK_FIELDS,
  loadRecords: async () => MOCK_RECORDS,
  subscribe: () => () => {},
  currentTableId: async () => MOCK_TABLES[0].id,
};

const realSource: Source = {
  async getTables() {
    const list = await bitable.base.getTableMetaList();
    return list.map((t) => ({ id: t.id, name: t.name }));
  },
  async getFields(tableId) {
    const table = await bitable.base.getTableById(tableId);
    const list = await table.getFieldMetaList();
    return list.map((f) => ({ id: f.id, name: f.name, type: f.type as unknown as number }));
  },
  loadRecords: (tableId) => loadRecords(tableId),
  subscribe(tableId, cb, onFields) {
    let dead = false;
    let offs: Array<() => void> = [];
    bitable.base
      .getTableById(tableId)
      .then((tb) => {
        if (dead) return;
        offs = [tb.onRecordAdd(cb), tb.onRecordModify(cb), tb.onRecordDelete(cb)];
        // 字段改名/换类型/增删:旧版数据表视图 SDK 也有这几个事件,取不到时静默跳过
        const t = tb as unknown as Record<string, ((f: () => void) => () => void) | undefined>;
        const fcb = onFields ?? cb;
        for (const k of ['onFieldAdd', 'onFieldDelete', 'onFieldModify']) {
          const sub = t[k];
          if (typeof sub === 'function') offs.push(sub.call(tb, fcb));
        }
      })
      .catch(() => {});
    return () => {
      dead = true;
      offs.forEach((f) => f());
    };
  },
  async currentTableId() {
    try {
      const sel = await bitable.base.getSelection();
      return sel.tableId ?? undefined;
    } catch {
      return undefined;
    }
  },
};

export const createSource = (): Source => (isMock() ? mockSource : realSource);
