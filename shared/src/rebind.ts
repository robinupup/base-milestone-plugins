// 纯逻辑:整库复制后,仪表盘插件仍可能记着旧表、旧字段的 id。
import { COLUMN_ORDER, fieldIdOf } from './milestones.ts';
import type { SourceConfig } from './milestones.ts';
import type { FieldInfo, TableInfo } from './bridge.ts';

/** 有多张表时,优先选名字像"项目/任务"的表 */
export function pickTable(list: TableInfo[]): TableInfo | undefined {
  return list.find((t) => /项目|任务|事件|计划|task|project|plan/i.test(t.name)) ?? list[0];
}

/**
 * 配置指向的表或字段不在当前多维表格里。
 * fields 还没取到时只判断表;字段要全部对不上才算失效,避免误清用户改过的配置。
 */
export function bindingsStale(c: SourceConfig, tables: TableInfo[], fields: FieldInfo[] | null): 'table' | 'fields' | null {
  if (!c.tableId || !tables.some((t) => t.id === c.tableId)) return 'table';
  if (!fields) return null;
  const ids = new Set(fields.map((f) => f.id));
  const bound = [...COLUMN_ORDER.map((k) => fieldIdOf(c, k)), c.keyFieldId].filter((x): x is string => !!x);
  if (bound.length > 0 && bound.every((id) => !ids.has(id))) return 'fields';
  return null;
}

/** 换成当前表,并清掉旧字段绑定,方便按字段名重新选择 */
export function clearBindings<C extends SourceConfig>(c: C, tableId: string): C {
  const next = { ...c, tableId };
  for (const key of COLUMN_ORDER) (next as SourceConfig)[`${key}FieldId` as const] = undefined;
  next.keyFieldId = undefined;
  next.doneValues = [];
  next.flagValues = [];
  next.flagKeyword = '';
  return next;
}
