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
