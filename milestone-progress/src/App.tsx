import { useMemo } from 'react';
import {
  ConfigLayout,
  SourceForm,
  buildSourceConditions,
  isMilestoneDone,
  manualToMilestones,
  parseSource,
  percent,
  sortMilestones,
  t,
  usePlugin,
  useToday,
} from '@shared';
import type { ManualMilestone, Milestone, SourceConfig } from '@shared';
import { ProgressCard } from './ProgressCard';
import { ManualMilestones, DisplayOptions } from './ConfigExtras';

export interface ProgressConfig extends SourceConfig {
  manual: ManualMilestone[];
  showPercent: boolean;
  showDates: boolean;
}

const defaults: ProgressConfig = {
  doneValues: [],
  flagValues: [],
  manual: [],
  showPercent: true,
  showDates: false,
};

export function App() {
  const api = usePlugin<ProgressConfig>({
    defaults,
    // 整体进度只强依赖状态字段;里程碑相关字段没配时,仍然可以显示进度条
    buildConditions: (c) => buildSourceConditions(c, ['status']),
  });
  const today = useToday();
  const { config } = api;
  const hasStatus = !!config.statusFieldId && config.doneValues.length > 0;

  const view = useMemo(() => {
    const parsed = parseSource(api.data, config);
    const merged: Milestone[] = [...parsed.milestones, ...manualToMilestones(config.manual)];
    const milestones = sortMilestones(
      merged.map((m) => ({ ...m, done: isMilestoneDone(m, today, hasStatus) })),
    );
    return {
      total: parsed.total,
      done: parsed.done,
      percent: percent(parsed.done, parsed.total),
      milestones,
    };
  }, [api.data, config, today, hasStatus]);

  if (api.error && !api.data) return <div className="bm-center">{t('common.error')}: {api.error}</div>;
  if (!api.ready) return <div className="bm-center">{t('common.loading')}</div>;

  const card = (
    <ProgressCard
      configured={api.configured}
      loading={api.dataLoading}
      total={view.total}
      done={view.done}
      percent={view.percent}
      milestones={view.milestones}
      showPercent={config.showPercent}
      showDates={config.showDates}
    />
  );

  if (!api.isConfig) return <div className="mp-root">{card}</div>;

  return (
    <ConfigLayout
      preview={<div className="mp-root">{card}</div>}
      form={
        <>
          <SourceForm api={api} statusRequired />
          <ManualMilestones value={config.manual} onChange={(manual) => api.update({ manual })} />
          <DisplayOptions config={config} onChange={api.update} />
        </>
      }
      onConfirm={api.save}
      saving={api.saving}
      saved={api.saved}
      disabled={!api.configured}
    />
  );
}
