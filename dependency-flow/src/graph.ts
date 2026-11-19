// 依赖关系图的纯逻辑:从记录里抽取任务和依赖,不依赖 SDK 和 DOM,便于测试。
import { cellTexts, cellToItem, personIds } from '../../shared/src/records.ts';
import type { RawRecord } from '../../shared/src/records.ts';
import { formatDate, parseDateItem } from '../../shared/src/milestones.ts';

export interface FlowConfig {
  tableId?: string;
  nameFieldId?: string;
  statusFieldId?: string;
  dateFieldId?: string;
  ownerFieldId?: string;
  /** 关联字段:记录里写的是它的前置任务(或后置任务,见 depMode) */
  depFieldId?: string;
  /** pred: 字段里是前置任务;succ: 字段里是后置任务 */
  depMode: 'pred' | 'succ';
  /** 名称里带这些关键词的任务当作里程碑,逗号分隔 */
  milestoneKeywords: string;
  showIsolated: boolean;
  /** 显示方式:auto 有依赖关系时画流程图,否则显示列表 */
  viewMode?: 'auto' | 'flow' | 'list';
}

export const defaultFlowConfig: FlowConfig = {
  depMode: 'pred',
  milestoneKeywords: '必保时间点,里程碑,🌟',
  showIsolated: false,
  viewMode: 'auto',
};

export type StatusKind = 'done' | 'doing' | 'blocked' | 'todo';

export interface FlowTask {
  id: string;
  name: string;
  status: string;
  kind: StatusKind;
  dateText: string;
  owner: string;
  /** 负责人的用户 id,用来按权限过滤和催办 */
  ownerIds: string[];
  milestone: boolean;
  /** 非管理员视图里,别人负责、只作为上下游出现的任务(只读) */
  external?: boolean;
}

export interface FlowEdge {
  from: string;
  to: string;
}

export interface FlowGraph {
  tasks: FlowTask[];
  edges: FlowEdge[];
  /** 没有任何依赖关系、被过滤掉的任务数 */
  isolated: number;
  /** 环上的边(从后往前指的依赖),画图时仍会保留,但提示用户检查 */
  cycleEdges: FlowEdge[];
}

const DONE_RE = /完成|通过|done|finish|complete|closed|resolved/i;
const NOT_DONE_RE = /未|待|不|没|not|un|wip/i;
const DOING_RE = /进行中|处理中|doing|in.?progress|ongoing/i;
const BLOCKED_RE = /阻塞|延期|依赖.*未|blocked|delay/i;

export function statusKind(status: string): StatusKind {
  if (!status) return 'todo';
  if (BLOCKED_RE.test(status)) return 'blocked';
  if (DONE_RE.test(status) && !NOT_DONE_RE.test(status)) return 'done';
  if (DOING_RE.test(status)) return 'doing';
  return 'todo';
}

/** 关联字段的值:{recordIds: []} 或它们的数组,兼容 record_ids */
export function linkIds(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.flatMap(linkIds);
  if (typeof v === 'object') {
    const o = v as { recordIds?: unknown; record_ids?: unknown; recordId?: unknown };
    const ids = o.recordIds ?? o.record_ids ?? (o.recordId ? [o.recordId] : []);
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  }
  return [];
}

const keywordsOf = (c: FlowConfig) =>
  c.milestoneKeywords
    .split(/[,，;；]/)
    .map((k) => k.trim())
    .filter(Boolean);

/** 名称里的关键词和星标只用来识别里程碑,展示时去掉 */
export function cleanName(name: string, keywords: string[]): string {
  let out = name;
  for (const k of keywords) out = out.split(k).join(' ');
  out = out.replace(/[🌟⭐★☆]/gu, ' ').replace(/\s+/g, ' ').trim();
  return out || name;
}

export function buildGraph(records: RawRecord[], c: FlowConfig): FlowGraph {
  const kws = keywordsOf(c);
  const byId = new Map<string, FlowTask>();
  const order: string[] = [];
  for (const r of records) {
    if (!r.recordId) continue;
    const rawName = c.nameFieldId ? cellToItem(r.fields[c.nameFieldId]).text ?? '' : '';
    if (!rawName.trim()) continue; // 空行不画
    const milestone = kws.some((k) => rawName.includes(k));
    const status = c.statusFieldId ? cellTexts(r.fields[c.statusFieldId]).join(', ') : '';
    const date = c.dateFieldId ? parseDateItem(cellToItem(r.fields[c.dateFieldId])) : null;
    byId.set(r.recordId, {
      id: r.recordId,
      name: milestone ? cleanName(rawName, kws) : rawName.trim(),
      status,
      kind: statusKind(status),
      dateText: date ? formatDate(date) : '',
      owner: c.ownerFieldId ? cellTexts(r.fields[c.ownerFieldId]).join('、') : '',
      ownerIds: c.ownerFieldId ? personIds(r.fields[c.ownerFieldId]) : [],
      milestone,
    });
    order.push(r.recordId);
  }

  const seen = new Set<string>();
  const edges: FlowEdge[] = [];
  if (c.depFieldId) {
    for (const r of records) {
      if (!r.recordId || !byId.has(r.recordId)) continue;
      for (const other of linkIds(r.fields[c.depFieldId])) {
        if (!byId.has(other) || other === r.recordId) continue;
        const e: FlowEdge = c.depMode === 'pred' ? { from: other, to: r.recordId } : { from: r.recordId, to: other };
        const key = `${e.from}>${e.to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push(e);
      }
    }
  }

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.from);
    connected.add(e.to);
  }
  const ids = c.showIsolated ? order : order.filter((id) => connected.has(id));
  return {
    tasks: ids.map((id) => byId.get(id)!),
    edges,
    isolated: order.length - connected.size,
    cycleEdges: findCycleEdges(ids, edges),
  };
}

/** DFS 找回边:每条回边都意味着依赖里存在环 */
export function findCycleEdges(ids: string[], edges: FlowEdge[]): FlowEdge[] {
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) adj.get(e.from)?.push(e.to);
  const state = new Map<string, 1 | 2>();
  const back: FlowEdge[] = [];
  const visit = (u: string) => {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v);
      if (s === 1) back.push({ from: u, to: v });
      else if (!s) visit(v);
    }
    state.set(u, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  return back;
}

/** 某个任务的全部上游/下游,用于悬浮时高亮整条链路 */
export function reachable(start: string, edges: FlowEdge[], dir: 'up' | 'down'): Set<string> {
  const next = new Map<string, string[]>();
  for (const e of edges) {
    const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
    (next.get(a) ?? next.set(a, []).get(a)!).push(b);
  }
  const out = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of next.get(u) ?? []) {
      if (!out.has(v)) {
        out.add(v);
        stack.push(v);
      }
    }
  }
  return out;
}
