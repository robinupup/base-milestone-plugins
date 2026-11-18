import { t } from '@shared';
import type { NextMilestoneResult } from '@shared';

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
        <div className="nm-title">{t('next.title')}</div>
        <div className="nm-hint">{loading ? t('common.loading') : t('common.notConfigured')}</div>
      </div>
    );
  }

  const tone = daysLeft === 0 ? 'today' : 'normal';

  return (
    <div className={`nm-card nm-${next ? tone : 'empty'}`}>
      <div className="nm-title">{t('next.title')}</div>
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
