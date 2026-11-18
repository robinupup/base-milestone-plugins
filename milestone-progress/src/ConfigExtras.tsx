import { Button, Checkbox, Input, Switch } from '@douyinfe/semi-ui';
import { FormItem, t } from '@shared';
import type { ManualMilestone } from '@shared';
import type { ProgressConfig } from './App';

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 手动补充的里程碑:只存在插件配置里,不依赖表格 */
export function ManualMilestones({
  value,
  onChange,
}: {
  value: ManualMilestone[];
  onChange(v: ManualMilestone[]): void;
}) {
  const patch = (id: string, p: Partial<ManualMilestone>) =>
    onChange(value.map((m) => (m.id === id ? { ...m, ...p } : m)));

  return (
    <FormItem label={t('progress.manual')}>
      {value.map((m) => (
        <div key={m.id} className="bm-manual-card">
          <div className="bm-manual-row">
            <Input
              value={m.name}
              placeholder={t('progress.manualName')}
              onChange={(v) => patch(m.id, { name: v })}
            />
            <Button type="danger" theme="borderless" size="small" onClick={() => onChange(value.filter((x) => x.id !== m.id))}>
              {t('progress.remove')}
            </Button>
          </div>
          <div className="bm-manual-row">
            <input
              className="bm-date-input"
              type="date"
              value={m.date}
              aria-label={t('progress.manualDate')}
              onChange={(e) => patch(m.id, { date: e.target.value })}
            />
            <Checkbox checked={!!m.done} onChange={(e) => patch(m.id, { done: !!e.target?.checked })}>
              {t('progress.manualDone')}
            </Checkbox>
          </div>
        </div>
      ))}
      <Button
        theme="light"
        onClick={() =>
          onChange([
            ...value,
            { id: newId(), name: '', date: new Date().toISOString().slice(0, 10), done: false },
          ])
        }
      >
        + {t('progress.addManual')}
      </Button>
    </FormItem>
  );
}

export function DisplayOptions({
  config,
  onChange,
}: {
  config: ProgressConfig;
  onChange(p: Partial<ProgressConfig>): void;
}) {
  return (
    <>
      <div className="bm-switch-row">
        <span>{t('progress.showPercent')}</span>
        <Switch checked={config.showPercent} onChange={(v) => onChange({ showPercent: v })} />
      </div>
      <div className="bm-switch-row">
        <span>{t('progress.showDates')}</span>
        <Switch checked={config.showDates} onChange={(v) => onChange({ showDates: v })} />
      </div>
    </>
  );
}
