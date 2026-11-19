// 权限与催办的纯逻辑:不依赖 SDK 和 DOM,便于测试。
import type { FlowEdge, FlowGraph, FlowTask } from './graph.ts';

export interface Access {
  /** 当前用户 id;取不到时为 null */
  userId: string | null;
  /** 对整个多维表格有管理权限 */
  isAdmin: boolean;
}

export const isMine = (t: FlowTask, userId: string | null) => !!userId && t.ownerIds.includes(userId);

/**
 * 非管理员视图:只保留自己负责的任务,以及它们的直接前置和直接后置任务(标记为 external、只读)。
 * 两个都不是自己的任务之间的连线会被去掉。
 */
export function restrictToOwner(g: FlowGraph, userId: string | null): FlowGraph {
  const mine = new Set(g.tasks.filter((t) => isMine(t, userId)).map((t) => t.id));
  const keep = new Set(mine);
  const edges: FlowEdge[] = [];
  for (const e of g.edges) {
    if (mine.has(e.from) || mine.has(e.to)) {
      keep.add(e.from);
      keep.add(e.to);
      edges.push(e);
    }
  }
  const tasks = g.tasks
    .filter((t) => keep.has(t.id))
    .map((t) => (mine.has(t.id) ? t : { ...t, external: true }));
  const ids = new Set(tasks.map((t) => t.id));
  return {
    tasks,
    edges,
    isolated: g.isolated,
    cycleEdges: g.cycleEdges.filter((e) => ids.has(e.from) && ids.has(e.to) && edges.some((x) => x.from === e.from && x.to === e.to)),
  };
}

/**
 * 能不能催这个任务:
 * - 没有负责人或已完成的任务不用催;
 * - 管理员可以催任何人;
 * - 非管理员可以催和自己任务直接相关的任务(前置或后置),不能催自己。
 */
export function canNudge(task: FlowTask, g: FlowGraph, access: Access): boolean {
  if (task.kind === 'done' || task.ownerIds.length === 0) return false;
  if (access.isAdmin) return true;
  if (!access.userId || isMine(task, access.userId)) return false;
  const mine = new Set(g.tasks.filter((t) => isMine(t, access.userId)).map((t) => t.id));
  return g.edges.some((e) => (e.from === task.id && mine.has(e.to)) || (e.to === task.id && mine.has(e.from)));
}

/** 同一催办人对同一任务的冷却时间 */
export const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;

export interface NudgeLog {
  taskId: string;
  nudgerId: string;
  at: number;
}

export function lastNudgeAt(logs: NudgeLog[], taskId: string, nudgerId: string | null): number | null {
  let last: number | null = null;
  for (const l of logs) {
    if (l.taskId === taskId && l.nudgerId === (nudgerId ?? '') && (last === null || l.at > last)) last = l.at;
  }
  return last;
}

/** 距离下次可以催办还要等多少毫秒;0 表示现在就可以 */
export function nudgeWaitMs(
  logs: NudgeLog[],
  taskId: string,
  nudgerId: string | null,
  now: number,
  cooldown = NUDGE_COOLDOWN_MS,
): number {
  const last = lastNudgeAt(logs, taskId, nudgerId);
  if (last === null) return 0;
  return Math.max(0, last + cooldown - now);
}

export function formatWait(ms: number): string {
  const min = Math.ceil(ms / 60000);
  if (min < 60) return `${min} 分钟`;
  return min % 60 === 0 ? `${min / 60} 小时` : `${Math.floor(min / 60)} 小时 ${min % 60} 分钟`;
}

/**
 * 按视图名字推断显示方式:名字里有「列表」「list」用任务列表,有「流程」「依赖」「flow」用流程图。
 * 这样管理员只要把视图命名好,所有成员打开都是同样的显示方式,不依赖每个人本机的设置。
 */
export function modeFromViewName(name: string | undefined): 'flow' | 'list' | undefined {
  if (!name) return undefined;
  if (/列表|list/i.test(name)) return 'list';
  if (/流程|依赖|flow/i.test(name)) return 'flow';
  return undefined;
}
