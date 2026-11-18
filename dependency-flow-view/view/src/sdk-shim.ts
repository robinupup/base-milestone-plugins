// 数据表视图运行在旧版 @lark-opdev/block-bitable-api 上:没有 getRecords 分页,
// 这里把它适配成 @lark-base-open/js-sdk 的子集,让 dependency-flow 的代码原样复用。
import { bitable as legacy } from '@lark-opdev/block-bitable-api';

const BATCH = 25;

async function getRecords(table: any, params: { pageSize?: number; pageToken?: string }) {
  // 旧 SDK 没有分页:一次取全部 id,逐批取记录,hasMore 恒为 false
  if (params.pageToken) return { records: [], hasMore: false, pageToken: '' };
  const ids: string[] = (await table.getRecordIdList()).filter(Boolean);
  const records: Array<{ recordId: string; fields: Record<string, unknown> }> = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const rows = await Promise.all(chunk.map((id) => table.getRecordById(id)));
    rows.forEach((r: any, k: number) => records.push({ recordId: chunk[k], fields: r?.fields ?? {} }));
  }
  return { records, hasMore: false, pageToken: '', total: records.length };
}

const wrapTable = (table: any) =>
  new Proxy(table, {
    get(target, prop, receiver) {
      if (prop === 'getRecords') return (p: any) => getRecords(target, p ?? {});
      const v = Reflect.get(target, prop, receiver);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

const base: any = (legacy as any).base;

export const bitable: any = new Proxy(legacy as any, {
  get(target, prop, receiver) {
    if (prop === 'base') {
      return new Proxy(base, {
        get(b, p, r) {
          if (p === 'getTableById') return async (id: string) => wrapTable(await b.getTableById(id));
          const v = Reflect.get(b, p, r);
          return typeof v === 'function' ? v.bind(b) : v;
        },
      });
    }
    return Reflect.get(target, prop, receiver);
  },
});

// 以下仅为满足仪表盘代码的 import,数据表视图里不会走到
export const dashboard: any = { state: 'View' };
export const DashboardState = { Create: 'Create', Config: 'Config', View: 'View', FullScreen: 'FullScreen' };
export const GroupMode = { ENUM: 'enum', INTEGRATED: 'integrated', RANGE: 'range' };
export const SourceType = { ALL: 'ALL', PART: 'PART' };
