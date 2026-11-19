import { detectLang, SOON_DAYS, t } from '@shared';
import type { NextMilestoneResult } from '@shared';

/** 标题旁的小红旗 */
const RedFlag = () => (
  <svg className="nm-flag" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M3 1.5v13" stroke="#8a8f99" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    <path d="M3.7 2.3h9l-2.2 3 2.2 3h-9z" fill="#f54a45" />
  </svg>
);

const WarnIcon = () => (
  <svg className="nm-warn-icon" viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 1.8 15 14H1L8 1.8Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <path d="M8 6.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11.8" r="0.9" fill="currentColor" />
  </svg>
);

const CheckIcon = () => (
  <svg className="nm-check-icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="m7.5 12.5 3 3 6-6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LOCALE = { zh: 'zh-CN', en: 'en-US', ja: 'ja-JP' } as const;

/** 主日期(如 12月25日 / Dec 25)和副标题(如 2026年周五 / 2026 Fri) */
function formatHero(d: Date): { main: string; sub: string } {
  const locale = LOCALE[detectLang()];
  return {
    main: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(d),
    sub: new Intl.DateTimeFormat(locale, { year: 'numeric', weekday: 'short' }).format(d),
  };
}

const Title = () => (
  <div className="nm-title">
    <RedFlag />
    <span className="nm-title-text">{t('next.title')}</span>
  </div>
);

/** 紧凑模式(格子很小时):一行文字 */
export function NextMilestoneLine({ result, configured }: { result: NextMilestoneResult; configured: boolean }) {
  if (!configured) return null;
  const { next, daysLeft } = result;
  const hero = next ? formatHero(next.date) : null;
  const tone = daysLeft === 0 ? 'today' : daysLeft !== null && daysLeft <= SOON_DAYS ? 'soon' : 'upcoming';
  return (
    <div className={`nl-line nl-${next ? tone : 'none'}`}>
      <RedFlag />
      {next && hero ? (
        <>
          <span className="nl-name" title={next.name}>
            {next.name}
          </span>
          <span className="nl-date">{hero.main}</span>
          <span className="nl-badge">{daysLeft === 0 ? t('next.today') : t('next.daysLeft', { n: daysLeft ?? 0 })}</span>
        </>
      ) : (
        <span className="nl-name">{t('next.none')}</span>
      )}
    </div>
  );
}

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

  // 紧急程度:就是今天 > 一周内 > 还早
  const tone = daysLeft === 0 ? 'today' : daysLeft !== null && daysLeft <= SOON_DAYS ? 'soon' : 'upcoming';
  const hero = next ? formatHero(next.date) : null;

  return (
    <div className={`nm-card nm-${next ? tone : 'empty'}`}>
      <Title />
      <div className="nm-body">
        {next && hero ? (
          <>
            <div className="nm-date" data-testid="next-date" title={next.dateText}>
              {hero.main}
            </div>
            <div className="nm-year">{hero.sub}</div>
            <div className="nm-name" title={next.name}>
              {next.name}
            </div>
            <div className="nm-badge">
              {daysLeft === 0 ? t('next.today') : t('next.daysLeft', { n: daysLeft ?? 0 })}
            </div>
          </>
        ) : (
          <div className="nm-none">
            <CheckIcon />
            <span>{t('next.none')}</span>
          </div>
        )}
      </div>
      {overdueCount > 0 ? (
        <div className="nm-overdue">
          <WarnIcon />
          <span>{t('next.overdue', { n: overdueCount })}</span>
        </div>
      ) : null}
    </div>
  );
}
