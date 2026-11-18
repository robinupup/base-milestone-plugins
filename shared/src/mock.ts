// 本地调试用的模拟多维表格。用法: http://localhost:5173/?mock&state=Config|View|FullScreen|Create
// 可选参数: theme=DARK, empty=1(无里程碑)
import type { IConfig, IData, IDataCondition } from '@lark-base-open/js-sdk';
import type { Bridge, FieldInfo, PluginState, TableInfo, ThemeMode } from './bridge';
import { DAY_MS, formatDate } from './milestones';

const TABLE: TableInfo = { id: 'tbl_tasks', name: '项目任务表' };
const FIELDS: FieldInfo[] = [
  { id: 'fld_name', name: '任务名称', type: 1 },
  { id: 'fld_status', name: '状态', type: 3 },
  { id: 'fld_type', name: '类型', type: 3 },
  { id: 'fld_ms', name: '是否里程碑', type: 7 },
  { id: 'fld_start', name: '开始日期', type: 5 },
  { id: 'fld_end', name: '结束日期', type: 5 },
  { id: 'fld_owner', name: '负责人', type: 11 },
];

const day = (offset: number) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + offset * DAY_MS);
};

interface Rec {
  fld_name: string;
  fld_status: string;
  fld_type: string;
  fld_ms: string;
  fld_end: Date;
}

function buildRecords(empty: boolean): Rec[] {
  const tasks: Array<[string, string, number]> = [
    ['需求评审', '已完成', -40],
    ['原型设计', '已完成', -30],
    ['UI 设计', '已完成', -22],
    ['后端接口', '已完成', -12],
    ['前端开发', '进行中', 5],
    ['联调', '进行中', 14],
    ['测试', '未开始', 25],
    ['灰度发布', '未开始', 40],
  ];
  const recs: Rec[] = tasks.map(([n, s, o]) => ({
    fld_name: n,
    fld_status: s,
    fld_type: '任务',
    fld_ms: '否',
    fld_end: day(o),
  }));
  if (!empty) {
    const ms: Array<[string, string, number]> = [
      ['立项', '已完成', -45],
      ['设计评审', '已完成', -20],
      ['代码冻结(已逾期)', '进行中', -3],
      ['内测发布', '未开始', 17],
      ['正式上线', '未开始', 50],
    ];
    for (const [n, s, o] of ms)
      recs.push({ fld_name: n, fld_status: s, fld_type: '里程碑', fld_ms: '是', fld_end: day(o) });
  }
  return recs;
}

function aggregate(recs: Rec[], cond: IDataCondition): IData {
  const groups = (cond.groups ?? []).map((g) => g.fieldId);
  const map = new Map<string, { row: IData[number]; n: number }>();
  for (const r of recs) {
    const items = groups.map((id) => {
      if (id === 'fld_end' || id === 'fld_start') {
        const d = r.fld_end;
        return { value: d.getTime(), text: formatDate(d) };
      }
      const v = (r as unknown as Record<string, string>)[id] ?? '';
      return { value: v || null, text: v || null };
    });
    const key = items.map((i) => i.text).join('\u0001');
    const hit = map.get(key);
    if (hit) hit.n += 1;
    else map.set(key, { row: items, n: 1 });
  }
  return [...map.values()].map(({ row, n }) => [...row, { value: n, text: String(n) }]);
}

export function createMockBridge(): Bridge {
  const q = new URLSearchParams(window.location.search);
  const state = (q.get('state') as PluginState) || 'View';
  const theme: ThemeMode = state === 'FullScreen' || q.get('theme') === 'DARK' ? 'DARK' : 'LIGHT';
  const recs = buildRecords(q.has('empty'));
  const storeKey = `mock-config:${window.location.pathname}`;
  const listeners = new Set<() => void>();
  let saved: IConfig | null = null;
  try {
    saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
  } catch {
    saved = null;
  }
  const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 60));

  return {
    state,
    isMock: true,
    getTables: () => delay([TABLE]),
    getFields: () => delay(FIELDS),
    getPreviewData: (c) => delay(aggregate(recs, Array.isArray(c) ? c[0] : c)),
    getData: async () => {
      const cond = saved?.dataConditions?.[0];
      return delay(cond ? aggregate(recs, cond) : []);
    },
    getRows: (_t, fieldIds) =>
      delay(aggregate(recs, { tableId: _t, groups: fieldIds.map((fieldId) => ({ fieldId })) } as unknown as IDataCondition)),
    getFieldValues: async (_t, fieldId) => {
      const rows = aggregate(recs, { tableId: _t, groups: [{ fieldId }] } as unknown as IDataCondition);
      return delay([...new Set(rows.map((r) => String(r[0].text ?? '')).filter(Boolean))]);
    },
    onRecordsChange: () => () => {},
    getConfig: () => delay(saved ?? { dataConditions: [], customConfig: undefined }),
    saveConfig: async (c) => {
      saved = c;
      localStorage.setItem(storeKey, JSON.stringify(c));
      console.info('[mock] saveConfig', c);
      listeners.forEach((l) => l());
      return true;
    },
    getTheme: () => delay(theme),
    onDataChange: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onConfigChange: () => () => {},
    onThemeChange: () => () => {},
    setRendered: async () => {},
  };
}
