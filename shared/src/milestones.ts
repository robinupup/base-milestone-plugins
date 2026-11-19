// 纯逻辑模块:不依赖 SDK 运行时,便于单元测试。

export interface DataItem {
  value: string | number | null | boolean;
  text: string | null;
  groupKey?: string;
}
export type DataRows = DataItem[][];

/** 里程碑数据源配置:两个插件共用 */
export interface SourceConfig {
  tableId?: string;
  statusFieldId?: string;
  /** 视为"已完成"的状态值(文本) */
  doneValues: string[];
  flagFieldId?: string;
  /** 视为"里程碑"的标记值(文本) */
  flagValues: string[];
  /** 标记字段文本包含任一关键词(逗号分隔)也视为里程碑,适合把里程碑写在任务名里的表,如"必保时间点" */
  flagKeyword?: string;
  nameFieldId?: string;
  dateFieldId?: string;
  /** 跟随仪表盘筛选器用的"记录键"字段:优先自动编号(唯一、格式稳定),没有时退回名称字段 */
  keyFieldId?: string;
}

export type ColumnKey = 'status' | 'flag' | 'name' | 'date';
export const COLUMN_ORDER: ColumnKey[] = ['status', 'flag', 'name', 'date'];

export const fieldIdOf = (c: SourceConfig, key: ColumnKey): string | undefined =>
  c[`${key}FieldId` as const];

/** 按固定顺序生成 groups,并记录每一列在返回数据里的下标 */
export function buildLayout(c: SourceConfig): {
  keys: ColumnKey[];
  fieldIds: string[];
  index: Partial<Record<ColumnKey, number>>;
} {
  const keys: ColumnKey[] = [];
  const fieldIds: string[] = [];
  const index: Partial<Record<ColumnKey, number>> = {};
  for (const key of COLUMN_ORDER) {
    const id = fieldIdOf(c, key);
    if (!id) continue;
    // 同一个字段被多个角色使用时,复用同一列
    const existing = fieldIds.indexOf(id);
    if (existing >= 0) {
      index[key] = existing;
      continue;
    }
    index[key] = fieldIds.length;
    keys.push(key);
    fieldIds.push(id);
  }
  return { keys, fieldIds, index };
}

export interface Milestone {
  id: string;
  name: string;
  date: Date;
  /** yyyy-mm-dd */
  dateText: string;
  done: boolean;
  source: 'table' | 'manual';
}

export interface ManualMilestone {
  id: string;
  name: string;
  /** yyyy-mm-dd */
  date: string;
  done?: boolean;
}

export const DAY_MS = 24 * 3600 * 1000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function formatDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 解析 yyyy-mm-dd / yyyy/mm/dd,按本地时区取当天 0 点 */
export function parseDateText(text: string): Date | null {
  const m = text.trim().match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 日期字段分组后 value 通常是毫秒时间戳,text 是格式化文本;两者都兼容 */
export function parseDateItem(item?: DataItem | null): Date | null {
  if (!item) return null;
  const v = item.value;
  if (typeof v === 'number' && Number.isFinite(v)) {
    const ms = v > 1e11 ? v : v > 1e8 ? v * 1000 : NaN;
    if (!Number.isNaN(ms)) return startOfDay(new Date(ms));
  }
  if (typeof v === 'string' && /^\d{10,13}$/.test(v)) {
    const n = Number(v);
    return startOfDay(new Date(v.length > 10 ? n : n * 1000));
  }
  const text = item.text ?? (typeof v === 'string' ? v : null);
  return text ? parseDateText(text) : null;
}

export const itemText = (item?: DataItem | null): string => {
  if (!item) return '';
  if (item.text !== null && item.text !== undefined) return String(item.text).trim();
  return item.value === null || item.value === undefined ? '' : String(item.value).trim();
};

/** 名称里的标记关键词和装饰星标只是用来识别里程碑的,展示时去掉 */
export function cleanMilestoneName(name: string, keywords: string[]): string {
  let out = name;
  for (const k of keywords) out = out.split(k).join(' ');
  out = out.replace(/[🌟⭐★☆]/gu, ' ').replace(/\s+/g, ' ').trim();
  return out || name;
}

export interface ParsedSource {
  /** 记录总数 */
  total: number;
  /** 已完成记录数 */
  done: number;
  milestones: Milestone[];
}

/**
 * 解析 getData / getPreviewData 返回的二维数组。
 * 数据结构: 每行 = [各分组列..., COUNTA 计数]。
 */
export function parseSource(data: DataRows | null | undefined, c: SourceConfig): ParsedSource {
  const out: ParsedSource = { total: 0, done: 0, milestones: [] };
  if (!data) return out;
  const { fieldIds, index } = buildLayout(c);
  const countCol = fieldIds.length;
  const doneSet = new Set(c.doneValues);
  const flagSet = new Set(c.flagValues);
  const keywords = (c.flagKeyword ?? '')
    .split(/[,，;；]/)
    .map((k) => k.trim())
    .filter(Boolean);
  const seen = new Set<string>();

  data.forEach((row, i) => {
    // 仪表盘接口返回的第一行是表头(计数列值为 "Bitable_Dashboard_Count"),跳过
    const rawCnt = row[countCol]?.value;
    if (typeof rawCnt === 'string' && !/^\d+$/.test(rawCnt)) return;
    const cnt = Number(row[countCol]?.value);
    const count = Number.isFinite(cnt) && cnt > 0 ? cnt : 1;
    const isDone = index.status !== undefined && doneSet.has(itemText(row[index.status]));

    out.total += count;
    if (isDone) out.done += count;

    if (index.flag === undefined || index.date === undefined) return;
    const flagText = itemText(row[index.flag]);
    if (!flagSet.has(flagText) && !keywords.some((k) => flagText.includes(k))) return;
    const date = parseDateItem(row[index.date]);
    if (!date) return;
    let name = index.name !== undefined ? itemText(row[index.name]) : '';
    if (keywords.length && keywords.some((k) => name.includes(k))) name = cleanMilestoneName(name, keywords);
    const key = `${name}|${date.getTime()}|${isDone}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.milestones.push({
      id: `t-${i}`,
      name: name || '(未命名)',
      date,
      dateText: formatDate(date),
      done: index.status !== undefined ? isDone : false,
      source: 'table',
    });
  });
  return out;
}

export function manualToMilestones(list: ManualMilestone[] | undefined): Milestone[] {
  const out: Milestone[] = [];
  for (const m of list ?? []) {
    const date = parseDateText(m.date);
    if (!date) continue;
    out.push({
      id: `m-${m.id}`,
      name: m.name || '(未命名)',
      date,
      dateText: formatDate(date),
      done: !!m.done,
      source: 'manual',
    });
  }
  return out;
}

export const sortMilestones = (list: Milestone[]): Milestone[] =>
  [...list].sort((a, b) => a.date.getTime() - b.date.getTime() || a.name.localeCompare(b.name));

/**
 * 没有状态字段时,无法判断是否完成:日期已过视为完成。
 * 有状态字段(table 来源)时以状态为准。
 */
export function isMilestoneDone(m: Milestone, today: Date, hasStatus: boolean): boolean {
  if (m.source === 'manual') return m.done || m.date.getTime() < startOfDay(today).getTime();
  return hasStatus ? m.done : m.date.getTime() < startOfDay(today).getTime();
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/** 里程碑所处阶段,用来决定颜色:已完成 / 已逾期 / 即将到期(含今天) / 未到期 */
export type MilestoneTone = 'done' | 'overdue' | 'soon' | 'upcoming';

/** 距今天数不超过这个值视为"即将到期" */
export const SOON_DAYS = 7;

export function milestoneTone(done: boolean, date: Date, today: Date): MilestoneTone {
  if (done) return 'done';
  const days = daysBetween(today, date);
  if (days < 0) return 'overdue';
  return days <= SOON_DAYS ? 'soon' : 'upcoming';
}

export interface NextMilestoneResult {
  next: Milestone | null;
  /** 距今天数,0 为今天 */
  daysLeft: number | null;
  /** 已逾期且未完成的数量 */
  overdueCount: number;
}

/** 日期 >= 今天 且 未完成 的里程碑里,取最早的一个 */
export function findNextMilestone(
  list: Milestone[],
  today: Date,
  hasStatus: boolean,
): NextMilestoneResult {
  const t0 = startOfDay(today).getTime();
  const pending = sortMilestones(list).filter((m) => !(hasStatus && m.done));
  const upcoming = pending.filter((m) => m.date.getTime() >= t0);
  const overdue = hasStatus ? pending.filter((m) => m.date.getTime() < t0) : [];
  const next = upcoming[0] ?? null;
  return {
    next,
    daysLeft: next ? daysBetween(today, next.date) : null,
    overdueCount: overdue.length,
  };
}

/** 把里程碑按日期映射到 [pad, 100-pad] 百分比位置;只有一个节点时居中 */
export function layoutPositions(list: Milestone[], pad = 6): Map<string, number> {
  const map = new Map<string, number>();
  if (!list.length) return map;
  const times = list.map((m) => m.date.getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  for (const m of list) {
    const ratio = max === min ? 0.5 : (m.date.getTime() - min) / (max - min);
    map.set(m.id, pad + (100 - 2 * pad) * ratio);
  }
  return map;
}

export function percent(done: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
