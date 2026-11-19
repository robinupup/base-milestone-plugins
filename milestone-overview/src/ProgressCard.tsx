import { useEffect, useRef, useState } from 'react';
import { daysBetween, layoutPositions, milestoneTone, t } from '@shared';
import type { Milestone, MilestoneTone } from '@shared';

/** 里程碑小红旗:旗杆底部落在进度条上,颜色随阶段变化(见样式里的 tone-*) */
const Flag = () => (
  <svg className="mp-flag" viewBox="0 0 16 18" aria-hidden="true">
    <path className="mp-flag-pole" d="M2.5 1v17" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path className="mp-flag-cloth" d="M3.2 1.8h10l-2.6 3.4 2.6 3.4h-10z" />
  </svg>
);

/** 日期太近时跳过中间的,避免文字挤在一起 */
function visibleDates(list: Milestone[], positions: Map<string, number>, width: number): Set<string> {
  const shown = new Set<string>();
  let lastX = -Infinity;
  for (const m of list) {
    const x = ((positions.get(m.id) ?? 50) / 100) * width;
    if (x - lastX >= 38) {
      shown.add(m.id);
      lastX = x;
    }
  }
  return shown;
}

const shortDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

/** 悬浮提示里的状态文字:已完成 / 还有 N 天 / 已逾期 N 天 */
function toneText(tone: MilestoneTone, date: Date, today: Date): string {
  if (tone === 'done') return t('ms.done');
  const days = daysBetween(today, date);
  if (tone === 'overdue') return t('ms.overdueDays', { n: -days });
  return days === 0 ? t('ms.dueToday') : t('ms.inDays', { n: days });
}

const TONE_ORDER: MilestoneTone[] = ['done', 'soon', 'overdue', 'upcoming'];

interface Props {
  configured: boolean;
  loading?: boolean;
  total: number;
  done: number;
  percent: number;
  milestones: Milestone[];
  today: Date;
  showPercent: boolean;
  showDates: boolean;
}

export function ProgressCard({
  configured,
  loading,
  total,
  done,
  percent,
  milestones,
  today,
  showPercent,
  showDates,
}: Props) {
  const laneRef = useRef<HTMLDivElement>(null);
  const [laneWidth, setLaneWidth] = useState(600);
  useEffect(() => {
    const el = laneRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLaneWidth(el.clientWidth || 600));
    ro.observe(el);
    setLaneWidth(el.clientWidth || 600);
    return () => ro.disconnect();
  }, [configured]);
  if (!configured) {
    return (
      <div className="mp-card mp-empty">
        <div className="mp-title">{t('progress.title')}</div>
        <div className="mp-hint">{loading ? t('common.loading') : t('common.notConfigured')}</div>
      </div>
    );
  }

  const positions = layoutPositions(milestones, 7);
  const complete = percent >= 100;
  // 同一天的里程碑合并成一面旗,悬浮时列出全部名称
  const groups: Milestone[][] = [];
  for (const m of milestones) {
    const last = groups[groups.length - 1];
    if (last && last[0].dateText === m.dateText) last.push(m);
    else groups.push([m]);
  }
  const dateShown = showDates ? visibleDates(groups.map((g) => g[0]), positions, laneWidth) : new Set<string>();
  const present = new Set<MilestoneTone>();

  return (
    <div className="mp-card">
      <div className="mp-head">
        <div className="mp-head-text">
          <span className="mp-title">{t('progress.title')}</span>
          <span className="mp-sub">{t('progress.tasksDone', { done, total })}</span>
        </div>
        {showPercent ? (
          <span className={`mp-percent${complete ? ' is-complete' : ''}`} data-testid="percent">
            {percent}
            <small>%</small>
          </span>
        ) : null}
      </div>

      <div className="mp-lane" ref={laneRef}>
        <div className="mp-track">
          <div
            className={`mp-fill${complete ? ' is-complete' : ''}`}
            style={{ width: `${percent}%` }}
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>

        {groups.map((g) => {
          const first = g[0];
          const pos = positions.get(first.id) ?? 50;
          const allDone = g.every((m) => m.done);
          // 同一天里只要有没完成的,按没完成的那个算阶段
          const tone = milestoneTone(allDone, first.date, today);
          present.add(tone);
          const edge = pos < 22 ? ' at-left' : pos > 78 ? ' at-right' : '';
          return (
            <div
              key={first.id}
              className={`mp-ms tone-${tone}${edge}`}
              style={{ left: `${pos}%` }}
              data-testid="milestone"
            >
              <Flag />
              <i className="mp-dot" />
              {dateShown.has(first.id) ? <span className="mp-ms-date">{shortDate(first.date)}</span> : null}
              <span className="mp-tip" role="tooltip">
                {g.map((m) => {
                  const mt = milestoneTone(m.done, m.date, today);
                  return (
                    <span key={m.id} className="mp-tip-row">
                      <b>{m.name}</b>
                      <span className={`mp-tip-meta tone-${mt}`}>
                        {m.dateText} · {toneText(mt, m.date, today)}
                      </span>
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
        {!milestones.length ? <div className="mp-lane-empty">{t('progress.empty')}</div> : null}
      </div>

      {present.size ? (
        <div className="mp-legend">
          {TONE_ORDER.filter((k) => present.has(k)).map((k) => (
            <span key={k} className={`tone-${k}`}>
              <i />
              {t(`ms.${k}`)}
            </span>
          ))}
        </div>
      ) : (
        <div className="mp-legend" />
      )}
    </div>
  );
}
