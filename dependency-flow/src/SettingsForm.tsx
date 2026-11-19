import { Input, Select, Switch } from '@douyinfe/semi-ui';
import { FieldSelect, FormItem, TableSelect } from '@shared';
import type { FieldInfo, TableInfo } from '@shared';
import { DATE_TYPES, LINK_TYPES, T } from './autopick.ts';
import type { FlowConfig } from './graph.ts';

const NAME_TYPES = [T.Text, T.SingleSelect, T.Formula];

export function SettingsForm({
  config,
  tables,
  fields,
  onChange,
  onTable,
}: {
  config: FlowConfig;
  tables: TableInfo[];
  fields: FieldInfo[];
  onChange(p: Partial<FlowConfig>): void;
  onTable(id: string): void;
}) {
  return (
    <>
      <FormItem label="数据表">
        <TableSelect tables={tables} value={config.tableId} onChange={onTable} />
      </FormItem>
      <FormItem label="显示方式" hint="自动:视图名带「列表」显示任务列表,带「流程」「依赖」画流程图;否则有依赖关系就画流程图">
        <Select
          style={{ width: '100%' }}
          value={config.viewMode ?? 'auto'}
          onChange={(v) => onChange({ viewMode: v as FlowConfig['viewMode'] })}
          optionList={[
            { value: 'auto', label: '自动' },
            { value: 'flow', label: '流程图' },
            { value: 'list', label: '任务列表' },
          ]}
        />
      </FormItem>
      <FormItem label="依赖字段" hint="关联到本表的字段,例如“前置依赖”">
        <FieldSelect fields={fields} types={LINK_TYPES} value={config.depFieldId} onChange={(id) => onChange({ depFieldId: id })} />
      </FormItem>
      <FormItem label="字段里写的是">
        <Select
          style={{ width: '100%' }}
          value={config.depMode}
          onChange={(v) => onChange({ depMode: v as FlowConfig['depMode'] })}
          optionList={[
            { value: 'pred', label: '前置任务(它依赖谁)' },
            { value: 'succ', label: '后置任务(谁依赖它)' },
          ]}
        />
      </FormItem>
      <FormItem label="任务名称字段">
        <FieldSelect fields={fields} types={NAME_TYPES} value={config.nameFieldId} onChange={(id) => onChange({ nameFieldId: id })} />
      </FormItem>
      <FormItem label="状态字段 (可选)">
        <FieldSelect fields={fields} types={[T.SingleSelect, T.Text]} value={config.statusFieldId} clearable onChange={(id) => onChange({ statusFieldId: id })} />
      </FormItem>
      <FormItem label="日期字段 (可选)">
        <FieldSelect fields={fields} types={DATE_TYPES} value={config.dateFieldId} clearable onChange={(id) => onChange({ dateFieldId: id })} />
      </FormItem>
      <FormItem label="负责人字段 (可选)">
        <FieldSelect fields={fields} types={[T.User, T.Text]} value={config.ownerFieldId} clearable onChange={(id) => onChange({ ownerFieldId: id })} />
      </FormItem>
      <FormItem label="里程碑关键词" hint="名称包含这些词的任务标红旗,逗号分隔">
        <Input value={config.milestoneKeywords} onChange={(v) => onChange({ milestoneKeywords: v })} showClear />
      </FormItem>
      <FormItem label="显示没有依赖关系的任务">
        <Switch checked={config.showIsolated} onChange={(v) => onChange({ showIsolated: v })} />
      </FormItem>
    </>
  );
}
