import { useEffect, useState } from 'react';
import type { FieldInfo } from '@shared';
import { cellTexts } from '../../shared/src/records.ts';
import type { RawRecord } from '../../shared/src/records.ts';
import { formatDate } from '../../shared/src/milestones.ts';
import type { FlowTask } from './graph.ts';
import { KIND_COLOR, KIND_LABEL } from './FlowChart.tsx';
import { formatWait } from './policy.ts';

const DATE_FIELD_TYPES = new Set([5, 1001, 1002]);

/** 把一个单元格转成可读文本;日期是毫秒时间戳,按日期格式显示 */
export function formatCell(v: unknown, type: number): string {
  if (v === null || v === undefined || v === '') return '';
  if (DATE_FIELD_TYPES.has(type) && typeof v === 'number') return formatDate(new Date(v));
  if (type === 7 && typeof v === 'boolean') return v ? '是' : '否';
  return cellTexts(v).join('、');
}

/** 踹一脚:小腿 + 球鞋 + 速度线 + 冲击星 */
export const KickIcon = () => (
  <svg className="df-kick-icon" viewBox="0 0 28 20" aria-hidden="true">
    <path d="M1 9.6h3.4M.6 12.4h4.2M1.4 15.2h2.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".5" />
    <path d="M6.4 2.6l3.6 5" stroke="#ffcf9e" strokeWidth="4.4" strokeLinecap="round" />
    <path d="M9.2 6.6l2.2 3" stroke="#69b1ff" strokeWidth="4.8" strokeLinecap="round" />
    <path
      d="M8 10.6c0-1.3 1.2-2.2 2.5-1.9l3 .7c.7.2 1.2.6 1.5 1.2l.4.8c.3.5.8.8 1.4.8h3.4c1.8 0 3.3 1.5 3.3 3.3 0 .9-.7 1.6-1.6 1.6H9.6c-.9 0-1.6-.7-1.6-1.6z"
      fill="#ff7a45"
    />
    <path d="M8.3 15h14.6" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity=".9" />
    <circle cx="17.7" cy="12.5" r=".6" fill="#3a2a20" />
    <circle cx="19.8" cy="12.5" r=".6" fill="#3a2a20" />
    <path d="M18.1 13.6q.65.6 1.3 0" stroke="#3a2a20" strokeWidth=".6" strokeLinecap="round" fill="none" />
    <path d="M25.3 6.4l.75 1.5 1.5.75-1.5.75-.75 1.5-.75-1.5-1.5-.75 1.5-.75z" fill="#ffc53d" />
    <circle cx="23" cy="5.4" r=".8" fill="#ffc53d" />
  </svg>
);

/** 自己的任务上的一键催办全部未完成前置 */
export interface KickAllUi {
  /** 未完成且有负责人的直接前置 */
  targets: FlowTask[];
  /** 其中现在可以催的(不在冷却中) */
  ready: FlowTask[];
  /** 全部在冷却时,最早可再催的等待时间 */
  waitMs: number;
  busy: boolean;
  notice: { kind: 'ok' | 'err'; text: string } | null;
  onSend(): void;
}

export interface NudgeUi {
  /** hidden:不显示按钮;ready:可催;wait:冷却中;unavailable:催办记录表不可用 */
  state: 'hidden' | 'ready' | 'wait';
  waitMs: number;
  busy: boolean;
  notice: { kind: 'ok' | 'err'; text: string } | null;
  onSend(message: string): void;
}

export function DetailPanel({
  task,
  record,
  fields,
  full,
  nudge,
  kickAll,
  onClose,
}: {
  task: FlowTask;
  record?: RawRecord;
  fields: FieldInfo[];
  /** 有权看到整条记录;别人负责、只作为上下游出现的任务只显示摘要 */
  full: boolean;
  nudge: NudgeUi;
  /** 只在自己负责的任务上传入 */
  kickAll?: KickAllUi;
  onClose(): void;
}) {
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setAsking(false);
    setMsg('');
  }, [task.id]);
  // 催办成功后收起输入框
  useEffect(() => {
    if (nudge.notice?.kind === 'ok') {
      setAsking(false);
      setMsg('');
    }
  }, [nudge.notice]);

  const rows = full && record
    ? fields
        .map((f) => ({ id: f.id, name: f.name, text: formatCell(record.fields[f.id], f.type) }))
        .filter((r) => r.text)
    : [
        { id: 'status', name: '状态', text: task.status },
        { id: 'owner', name: '负责人', text: task.owner },
        { id: 'date', name: '日期', text: task.dateText },
      ].filter((r) => r.text);

  return (
    <aside className="df-detail" aria-label="任务详情">
      <header className="df-detail-head" style={{ ['--kind' as string]: KIND_COLOR[task.kind] }}>
        <div className="df-detail-title">
          <div className="df-detail-name">{task.name}</div>
          <span className="df-chip">
            <i />
            {task.status || KIND_LABEL[task.kind]}
          </span>
        </div>
        <button className="df-detail-close" onClick={onClose} aria-label="关闭">
          ×
        </button>
      </header>

      <div className="df-detail-body">
        {rows.map((r) => (
          <div key={r.id} className="df-detail-row">
            <div className="df-detail-label">{r.name}</div>
            <div className="df-detail-value">{r.text}</div>
          </div>
        ))}
        {!full ? <div className="df-detail-note">这是别人负责的相邻任务,只显示摘要。</div> : null}
      </div>

      {kickAll ? (
        <footer className="df-detail-foot">
          {kickAll.notice ? <div className={`df-notice is-${kickAll.notice.kind}`}>{kickAll.notice.text}</div> : null}
          {kickAll.targets.length ? (
            <div className="df-kick-list">
              {kickAll.targets.map((t) => {
                const waiting = !kickAll.ready.includes(t);
                return (
                  <span key={t.id} className={`df-kick-item${waiting ? ' is-wait' : ''}`} title={t.name}>
                    {t.owner || '负责人'} · {t.name}
                    {waiting ? '(已催)' : ''}
                  </span>
                );
              })}
            </div>
          ) : null}
          <button
            className="df-btn is-kick"
            disabled={!kickAll.ready.length || kickAll.busy}
            onClick={kickAll.onSend}
            title="给这条任务所有未完成的前置依赖负责人各发一条催办通知"
          >
            <KickIcon />
            {kickAll.busy
              ? '正在踹…'
              : !kickAll.targets.length
                ? '前置依赖都已完成,无需催办'
                : kickAll.ready.length
                  ? `一键踢屁股 · 催 ${kickAll.ready.length} 个前置`
                  : `前置都已催过,${formatWait(kickAll.waitMs)}后可再催`}
          </button>
        </footer>
      ) : null}

      {nudge.state !== 'hidden' ? (
        <footer className="df-detail-foot">
          {nudge.notice ? <div className={`df-notice is-${nudge.notice.kind}`}>{nudge.notice.text}</div> : null}
          {asking && nudge.state === 'ready' ? (
            <>
              <textarea
                className="df-nudge-input"
                placeholder={`给${task.owner || '负责人'}留一句话(可选,不填则自动通知并附记录链接)`}
                value={msg}
                maxLength={200}
                onChange={(e) => setMsg(e.target.value)}
                rows={2}
              />
              <div className="df-nudge-actions">
                <button className="df-btn" onClick={() => setAsking(false)} disabled={nudge.busy}>
                  取消
                </button>
                <button className="df-btn is-primary" onClick={() => nudge.onSend(msg)} disabled={nudge.busy}>
                  {nudge.busy ? '发送中…' : msg.trim() ? '带留言催办' : '直接催办'}
                </button>
              </div>
            </>
          ) : (
            <button
              className="df-btn is-kick"
              disabled={nudge.state === 'wait' || nudge.busy}
              onClick={() => setAsking(true)}
              title={`通知${task.owner || '负责人'}尽快处理`}
            >
              <KickIcon />
              {nudge.state === 'wait' ? `已催办,${formatWait(nudge.waitMs)}后可再催` : `踢屁股 · 催办${task.owner || '负责人'}`}
            </button>
          )}
        </footer>
      ) : null}
    </aside>
  );
}
