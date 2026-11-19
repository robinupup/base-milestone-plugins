// 把多维表格记录里的单元格值转换成统一的 DataItem,纯逻辑,便于测试。
import type { DataItem } from './milestones';

/** 单元格里可能是字符串、数字、{text}、{id,text}、{name},或它们的数组 */
export function cellTexts(v: unknown): string[] {
  if (v === null || v === undefined) return [];
  if (typeof v === 'boolean') return [v ? '是' : '否'];
  if (typeof v === 'string') return v.trim() ? [v.trim()] : [];
  if (typeof v === 'number') return [String(v)];
  if (Array.isArray(v)) return v.flatMap(cellTexts);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text.trim() ? [o.text.trim()] : [];
    if (typeof o.name === 'string') return [o.name];
    if (o.value !== undefined && typeof o.value !== 'object') return cellTexts(o.value);
  }
  return [];
}

export function cellToItem(v: unknown): DataItem {
  if (v === null || v === undefined) return { value: null, text: null };
  // 日期字段是毫秒时间戳,保留 number,由 parseDateItem 解析
  if (typeof v === 'number') return { value: v, text: String(v) };
  // 文本类单元格是分段数组,拼接成完整文本;选项数组用逗号分隔
  if (Array.isArray(v) && v.every((x) => x && typeof x === 'object' && (x as { type?: string }).type === 'text')) {
    const text = v.map((x) => (x as { text?: string }).text ?? '').join('');
    return { value: text, text };
  }
  const text = cellTexts(v).join(', ');
  return { value: text || null, text: text || null };
}

export interface RawRecord {
  recordId?: string;
  fields: Record<string, unknown>;
}

/** 按 fieldIds 顺序展开成二维数组,末尾补计数列(每条记录计 1) */
export function recordsToRows(records: RawRecord[], fieldIds: string[]): DataItem[][] {
  return records.map((r) => [...fieldIds.map((id) => cellToItem(r.fields[id])), { value: 1, text: '1' }]);
}

export function distinctValues(records: RawRecord[], fieldId: string): string[] {
  const set = new Set<string>();
  for (const r of records) for (const t of cellTexts(r.fields[fieldId])) set.add(t);
  return [...set];
}

/** 键文本归一化:去空白;纯数字统一成规范写法("003" 与 3 视为同一个) */
export function normKey(v: unknown): string {
  const t = String(v ?? '').trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? String(Number(t)) : t;
}

const itemKey = (item?: DataItem | null) =>
  !item ? '' : normKey(item.text ?? (item.value === null || item.value === undefined ? '' : item.value));

/**
 * 仪表盘 getData 返回的是"已按仪表盘筛选器(如「项目归属」切片器)过滤"后的聚合结果。
 * 取每一行第一列(分组键)的文本,得到当前可见记录的键集合;
 * 末列不是数字的行(接口返回的表头行)不算数据行。
 */
export function visibleKeys(data: DataItem[][] | null | undefined): Set<string> {
  const keys = new Set<string>();
  for (const row of data ?? []) {
    if (!row.length) continue;
    const count = row[row.length - 1]?.value;
    if (typeof count !== 'number' || !Number.isFinite(count)) continue;
    keys.add(itemKey(row[0]));
  }
  return keys;
}

/** 行与键一一对应(keys[i] 是 rows[i] 的键),只保留键在 visible 里的行 */
export function filterByKeys<T>(rows: T[], keys: string[], visible: Set<string>): T[] {
  return rows.filter((_, i) => visible.has(keys[i]));
}

/** 记录里的键字段 → 归一化后的键文本 */
export function recordKey(r: RawRecord, keyFieldId: string): string {
  return itemKey(cellToItem(r.fields[keyFieldId]));
}

/** 某一列的文本 → 键(用名称列做键时) */
export const rowKey = (row: DataItem[], index: number): string => itemKey(row[index]);

/** 人员字段里的用户 id 列表;单元格是 [{id,name,...}] 或单个对象 */
export function personIds(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(personIds);
  if (typeof v === 'object') {
    const id = (v as { id?: unknown }).id;
    return typeof id === 'string' && id ? [id] : [];
  }
  return [];
}
