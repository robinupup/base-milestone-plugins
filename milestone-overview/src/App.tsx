import { useMemo } from 'react';
import {
  ConfigLayout,
  SourceForm,
  buildSourceConditions,
  findNextMilestone,
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
import { NextMilestoneCard, NextMilestoneLine } from './NextCard';
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
    // 下一个里程碑和进度条用同一份里程碑列表(含手动补充的节点),两处永远一致
    const next = findNextMilestone(milestones, today, hasStatus);
    return {
      total: parsed.total,
      done: parsed.done,
      percent: percent(parsed.done, parsed.total),
      milestones,
      next,
    };
  }, [api.data, config, today, hasStatus]);

  if (api.error && !api.data) return <div className="bm-center">{t('common.error')}: {api.error}</div>;
  if (!api.ready) return <div className="bm-center">{t('common.loading')}</div>;

  const nextConfigured =
    api.configured && (config.flagValues.length > 0 || !!config.flagKeyword?.trim() || config.manual.length > 0);

  const card = (
    <div className="mo-card">
      <div className="mo-progress">
        <ProgressCard
          configured={api.configured}
          loading={api.dataLoading}
          total={view.total}
          done={view.done}
          percent={view.percent}
          milestones={view.milestones}
          today={today}
          showPercent={config.showPercent}
          showDates={config.showDates}
        />
      </div>
      <div className="mo-next">
        <NextMilestoneCard result={view.next} configured={nextConfigured} loading={api.dataLoading} />
      </div>
      <div className="mo-next-line">
        <NextMilestoneLine result={view.next} configured={nextConfigured} />
      </div>
    </div>
  );

  if (!api.isConfig) return <div className="mo-root">{card}</div>;

  return (
    <ConfigLayout
      preview={<div className="mo-root">{card}</div>}
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
