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
  onClose,
}: {
  task: FlowTask;
  record?: RawRecord;
  fields: FieldInfo[];
  /** 有权看到整条记录;别人负责、只作为上下游出现的任务只显示摘要 */
  full: boolean;
  nudge: NudgeUi;
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
              {nudge.state === 'wait' ? `已催办,${formatWait(nudge.waitMs)}后可再催` : `踢屁股 · 催办${task.owner || '负责人'}`}
            </button>
          )}
        </footer>
      ) : null}
    </aside>
  );
}
