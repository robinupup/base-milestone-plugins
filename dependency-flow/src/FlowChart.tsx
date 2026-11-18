import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowEdge, StatusKind } from './graph.ts';
import { reachable } from './graph.ts';
import { edgePath, NODE_H, NODE_W } from './layout.ts';
import type { Layout, PlacedNode } from './layout.ts';

export const KIND_COLOR: Record<StatusKind, string> = {
  done: '#00b42a',
  doing: '#3370ff',
  blocked: '#ff8800',
  todo: '#9aa0a8',
};
export const KIND_LABEL: Record<StatusKind, string> = {
  done: '已完成',
  doing: '进行中',
  blocked: '被阻塞',
  todo: '未开始',
};

interface View {
  k: number;
  x: number;
  y: number;
}

const FlagIcon = () => (
  <svg className="df-flag" viewBox="0 0 16 18" aria-hidden="true">
    <path d="M2.5 1v17" stroke="#8a8f99" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path d="M3.2 1.8h10l-2.6 3.4 2.6 3.4h-10z" fill="#f54a45" />
  </svg>
);

function Node({ n, dim, hot }: { n: PlacedNode; dim: boolean; hot: boolean }) {
  const t = n.task;
  const color = KIND_COLOR[t.kind];
  return (
    <foreignObject x={n.x - NODE_W / 2} y={n.y - NODE_H / 2} width={NODE_W} height={NODE_H} className="df-node-fo">
      <div
        className={`df-node${t.milestone ? ' is-milestone' : ''}${dim ? ' is-dim' : ''}${hot ? ' is-hot' : ''}`}
        style={{ ['--kind' as string]: color }}
        data-id={t.id}
      >
        <div className="df-node-name" title={t.name}>
          {t.name}
        </div>
        <div className="df-node-meta">
          <span className="df-chip">
            <i />
            {t.status || KIND_LABEL[t.kind]}
          </span>
          <span className="df-meta-right">
            {t.owner ? <span className="df-owner">{t.owner}</span> : null}
            {t.dateText ? <span className="df-date">{t.dateText.slice(5).replace('-', '/')}</span> : null}
          </span>
        </div>
        {t.milestone ? <FlagIcon /> : null}
      </div>
    </foreignObject>
  );
}

export function FlowChart({
  layout,
  edges,
  cycleKeys,
  query,
}: {
  layout: Layout;
  edges: FlowEdge[];
  cycleKeys: Set<string>;
  query: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ k: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const fitted = useRef(false);

  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.task.id, n])), [layout]);

  /** whole=true 完整缩放进屏幕;否则保证字能看清(最小 0.62),放不下时从左侧开始,可拖动查看 */
  const fit = useCallback(
    (whole = true) => {
      const box = boxRef.current;
      if (!box || !layout.width || !layout.height) return;
      const W = box.clientWidth;
      const H = box.clientHeight;
      const fitK = Math.min(W / layout.width, (H - 70) / layout.height, 1.15);
      const k = whole ? fitK : Math.max(fitK, 0.62);
      const x = layout.width * k <= W ? (W - layout.width * k) / 2 : 0;
      const y = layout.height * k <= H ? (H - layout.height * k) / 2 + 18 : 70;
      setView({ k, x, y });
    },
    [layout],
  );

  // 数据第一次到达时自动适应屏幕;之后保持用户的缩放和位置
  useEffect(() => {
    if (!fitted.current && layout.nodes.length) {
      fitted.current = true;
      fit(false);
    }
  }, [layout, fit]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(2.5, Math.max(0.15, v.k * Math.exp(-e.deltaY * 0.0015)));
        const s = k / v.k;
        return { k, x: px - (px - v.x) * s, y: py - (py - v.y) * s };
      });
    };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) =>
    setView((v) => {
      const box = boxRef.current;
      const cx = (box?.clientWidth ?? 0) / 2;
      const cy = (box?.clientHeight ?? 0) / 2;
      const k = Math.min(2.5, Math.max(0.15, v.k * f));
      const s = k / v.k;
      return { k, x: cx - (cx - v.x) * s, y: cy - (cy - v.y) * s };
    });

  // 悬浮:高亮整条上下游链路,其余变淡
  const chain = useMemo(() => {
    if (!hover) return null;
    const up = reachable(hover, edges, 'up');
    const down = reachable(hover, edges, 'down');
    return { up, down, all: new Set([hover, ...up, ...down]) };
  }, [hover, edges]);

  const q = query.trim().toLowerCase();
  const matched = useMemo(() => {
    if (!q) return null;
    return new Set(layout.nodes.filter((n) => n.task.name.toLowerCase().includes(q)).map((n) => n.task.id));
  }, [q, layout]);

  const edgeOn = (e: FlowEdge) => {
    if (!chain || !hover) return false;
    const upSet = new Set([hover, ...chain.up]);
    const downSet = new Set([hover, ...chain.down]);
    return (upSet.has(e.from) && upSet.has(e.to)) || (downSet.has(e.from) && downSet.has(e.to));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.df-node')) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const onPointerUp = () => (drag.current = null);

  const onOver = (e: React.MouseEvent) => {
    const el = (e.target as HTMLElement).closest('.df-node') as HTMLElement | null;
    setHover(el?.dataset.id ?? null);
  };

  return (
    <div
      ref={boxRef}
      className="df-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onMouseOver={onOver}
      onMouseLeave={() => setHover(null)}
    >
      <svg className="df-svg" width="100%" height="100%">
        <defs>
          {(Object.keys(KIND_COLOR) as StatusKind[]).map((k) => (
            <marker
              key={k}
              id={`df-arrow-${k}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="9"
              markerHeight="9"
              markerUnits="userSpaceOnUse"
              orient="auto"
            >
              <path d="M1,1.5 L8.5,5 L1,8.5 z" fill={KIND_COLOR[k]} />
            </marker>
          ))}
        </defs>
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g className="df-edges">
            {edges.map((e) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const kind = a.task.kind;
              const on = edgeOn(e);
              const dimmed = (chain && !on) || (matched && !(matched.has(e.from) || matched.has(e.to)));
              const cyc = cycleKeys.has(`${e.from}>${e.to}`);
              return (
                <path
                  key={`${e.from}>${e.to}`}
                  d={edgePath(a, b)}
                  className={`df-edge${on ? ' is-on' : ''}${dimmed ? ' is-dim' : ''}${cyc ? ' is-cycle' : ''}`}
                  style={{ stroke: cyc ? '#f54a45' : KIND_COLOR[kind] }}
                  markerEnd={`url(#df-arrow-${cyc ? 'blocked' : kind})`}
                />
              );
            })}
          </g>
          <g className="df-nodes">
            {layout.nodes.map((n) => {
              const id = n.task.id;
              const dim = (chain ? !chain.all.has(id) : false) || (matched ? !matched.has(id) : false);
              return <Node key={id} n={n} dim={dim} hot={id === hover} />;
            })}
          </g>
        </g>
      </svg>

      <div className="df-zoom">
        <button onClick={() => zoomBy(1.2)} aria-label="放大">
          ＋
        </button>
        <button onClick={() => zoomBy(1 / 1.2)} aria-label="缩小">
          －
        </button>
        <button onClick={() => fit(true)} aria-label="适应屏幕" title="适应屏幕">
          ⤢
        </button>
      </div>
    </div>
  );
}
