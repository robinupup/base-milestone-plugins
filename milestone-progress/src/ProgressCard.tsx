import { layoutPositions, t } from '@shared';
import type { Milestone } from '@shared';

interface Props {
  configured: boolean;
  loading?: boolean;
  total: number;
  done: number;
  percent: number;
  milestones: Milestone[];
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
  showPercent,
  showDates,
}: Props) {
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

  return (
    <div className="mp-card">
      <div className="mp-head">
        <span className="mp-title">{t('progress.title')}</span>
        {showPercent ? (
          <span className={`mp-percent${complete ? ' is-complete' : ''}`} data-testid="percent">
            {percent}%
          </span>
        ) : null}
      </div>

      <div className="mp-lane">
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

        {milestones.map((m, i) => {
          const above = i % 2 === 0;
          return (
            <div
              key={m.id}
              className={`mp-ms ${m.done ? 'is-done' : 'is-pending'} ${above ? 'is-up' : 'is-down'}`}
              style={{ left: `${positions.get(m.id) ?? 50}%` }}
              data-testid="milestone"
            >
              <span className="mp-dot" />
              <span className="mp-ms-label">
                <span className="mp-ms-name">{m.name}</span>
                {showDates ? <span className="mp-ms-date">{m.dateText}</span> : null}
              </span>
              <span className="mp-tip" role="tooltip">
                <b>{m.name}</b>
                <span>{m.dateText}</span>
                <span>{m.done ? t('progress.milestoneDone') : t('progress.milestonePending')}</span>
              </span>
            </div>
          );
        })}
        {!milestones.length ? <div className="mp-lane-empty">{t('progress.empty')}</div> : null}
      </div>

      <div className="mp-foot">{t('progress.tasksDone', { done, total })}</div>
    </div>
  );
}
