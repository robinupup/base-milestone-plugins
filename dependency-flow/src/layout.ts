import dagre from '@dagrejs/dagre';
import type { FlowEdge, FlowTask } from './graph.ts';

export const NODE_W = 236;
export const NODE_H = 68;

export interface PlacedNode {
  task: FlowTask;
  x: number; // 中心点
  y: number;
}
export interface Layout {
  nodes: PlacedNode[];
  width: number;
  height: number;
}

/** 从左到右的分层布局;环上的边由 dagre 内部处理,画线时仍按真实端点连 */
export function layoutGraph(tasks: FlowTask[], edges: FlowEdge[]): Layout {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 22, marginx: 40, marginy: 40, ranker: 'network-simplex' });
  g.setDefaultEdgeLabel(() => ({}));
  for (const t of tasks) g.setNode(t.id, { width: NODE_W, height: NODE_H });
  for (const e of edges) if (g.hasNode(e.from) && g.hasNode(e.to)) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const nodes: PlacedNode[] = tasks.map((t) => {
    const n = g.node(t.id);
    return { task: t, x: n.x, y: n.y };
  });
  const info = g.graph();
  return { nodes, width: info.width ?? 0, height: info.height ?? 0 };
}

/** 从源节点右侧中点,用三次贝塞尔曲线连到目标节点左侧中点 */
export function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y;
  const x2 = b.x - NODE_W / 2;
  const y2 = b.y;
  if (x2 - x1 >= 24) {
    const dx = Math.max(48, (x2 - x1) * 0.55);
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
  }
  // 目标在同列或更靠左(环或同层依赖):绕一个大弧
  const out = 70;
  const mid = (y1 + y2) / 2 + (y2 >= y1 ? 1 : -1) * (NODE_H / 2 + 26);
  return `M${x1},${y1} C${x1 + out},${y1} ${x1 + out},${mid} ${(x1 + x2) / 2},${mid} S${x2 - out},${y2} ${x2},${y2}`;
}
