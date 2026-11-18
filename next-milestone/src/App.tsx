import { useMemo } from 'react';
import {
  ConfigLayout,
  SourceForm,
  buildSourceConditions,
  findNextMilestone,
  parseSource,
  t,
  usePlugin,
  useToday,
} from '@shared';
import type { SourceConfig } from '@shared';
import { NextMilestoneCard } from './Card';

const defaults: SourceConfig = { doneValues: [], flagValues: [] };

export function App() {
  const api = usePlugin<SourceConfig>({
    defaults,
    buildConditions: (c) => buildSourceConditions(c, ['flag', 'date']),
  });
  const today = useToday();
  const { config } = api;

  const hasStatus = !!config.statusFieldId && config.doneValues.length > 0;
  const result = useMemo(() => {
    const parsed = parseSource(api.data, config);
    return findNextMilestone(parsed.milestones, today, hasStatus);
  }, [api.data, config, today, hasStatus]);

  if (api.error && !api.data) return <div className="bm-center">{t('common.error')}: {api.error}</div>;
  if (!api.ready) return <div className="bm-center">{t('common.loading')}</div>;

  const card = (
    <NextMilestoneCard
      result={result}
      configured={api.configured && (config.flagValues.length > 0 || !!config.flagKeyword?.trim())}
      loading={api.dataLoading}
    />
  );

  if (!api.isConfig) return <div className="nm-root">{card}</div>;

  return (
    <ConfigLayout
      preview={<div className="nm-root">{card}</div>}
      form={<SourceForm api={api} statusRequired={false} />}
      onConfirm={api.save}
      saving={api.saving}
      saved={api.saved}
      disabled={!api.configured}
    />
  );
}
