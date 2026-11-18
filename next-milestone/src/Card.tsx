import { t } from '@shared';
import type { NextMilestoneResult } from '@shared';

/** 标题旁的小红旗 */
const RedFlag = () => (
  <svg className="nm-flag" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 1.5v13" stroke="#8a8f99" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    <path d="M3.7 2.3h9l-2.2 3 2.2 3h-9z" fill="#f54a45" />
  </svg>
);

const Title = () => (
  <div className="nm-title">
    <RedFlag />
    <span className="nm-title-text">{t('next.title')}</span>
  </div>
);

export function NextMilestoneCard({
  result,
  configured,
  loading,
}: {
  result: NextMilestoneResult;
  configured: boolean;
  loading?: boolean;
}) {
  const { next, daysLeft, overdueCount } = result;

  if (!configured) {
    return (
      <div className="nm-card nm-empty">
        <Title />
        <div className="nm-hint">{loading ? t('common.loading') : t('common.notConfigured')}</div>
      </div>
    );
  }

  const tone = daysLeft === 0 ? 'today' : 'normal';

  return (
    <div className={`nm-card nm-${next ? tone : 'empty'}`}>
      <Title />
      {next ? (
        <>
          <div className="nm-date" data-testid="next-date">
            {next.dateText}
          </div>
          <div className="nm-name" title={next.name}>
            {next.name}
          </div>
          <div className="nm-days">
            {daysLeft === 0 ? t('next.today') : t('next.daysLeft', { n: daysLeft ?? 0 })}
          </div>
        </>
      ) : (
        <div className="nm-none">{t('next.none')}</div>
      )}
      {overdueCount > 0 ? <div className="nm-overdue">{t('next.overdue', { n: overdueCount })}</div> : null}
    </div>
  );
}
