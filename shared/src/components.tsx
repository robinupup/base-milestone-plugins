import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Input, Select } from '@douyinfe/semi-ui';
import type { Bridge, FieldInfo, TableInfo } from './bridge';
import { t } from './i18n';
import type { SourceConfig } from './milestones';
import { DATE_TYPES, FLAG_TYPES, NAME_TYPES, STATUS_TYPES } from './usePlugin';
import type { PluginApi } from './usePlugin';

/** 字段类型图标:用简短的字符标记,避免依赖图标库 */
const TYPE_GLYPH: Record<number, string> = {
  1: 'Aa',
  2: '123',
  3: '◉',
  4: '☰',
  5: '▦',
  7: '☑',
  11: '👤',
  20: 'ƒx',
  99002: '%',
  1001: '▦',
  1002: '▦',
  1005: '#',
};

export const TypeBadge = ({ type }: { type: number }) => (
  <span className="bm-type-badge">{TYPE_GLYPH[type] ?? '·'}</span>
);

export function FormItem({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="bm-form-item">
      <div className="bm-form-label">{label}</div>
      {children}
      {hint ? <div className="bm-form-hint">{hint}</div> : null}
    </div>
  );
}

export function TableSelect({
  tables,
  value,
  onChange,
}: {
  tables: TableInfo[];
  value?: string;
  onChange(id: string): void;
}) {
  return (
    <Select
      style={{ width: '100%' }}
      placeholder={t('common.selectTable')}
      value={value}
      filter
      onChange={(v) => onChange(String(v))}
      optionList={tables.map((x) => ({ value: x.id, label: x.name }))}
    />
  );
}

export function FieldSelect({
  fields,
  value,
  onChange,
  types,
  clearable,
}: {
  fields: FieldInfo[];
  value?: string;
  onChange(id: string | undefined): void;
  types?: number[];
  clearable?: boolean;
}) {
  const list = types ? fields.filter((f) => types.includes(f.type)) : fields;
  return (
    <Select
      style={{ width: '100%' }}
      placeholder={t('common.selectField')}
      value={value}
      showClear={clearable}
      // 官方要求:字段选择必须带搜索
      filter={(input: string, option: unknown) =>
        String((option as { name?: string }).name ?? '').toLowerCase().includes(input.toLowerCase())
      }
      onChange={(v) => onChange(v === undefined || v === '' ? undefined : String(v))}
      optionList={list.map((f) => ({
        value: f.id,
        name: f.name,
        label: (
          <span className="bm-option">
            <TypeBadge type={f.type} />
            {f.name}
          </span>
        ),
      }))}
    />
  );
}

/** 读取某字段的所有取值文本 */
export function useFieldValues(bridge: Bridge | null, tableId?: string, fieldId?: string) {
  const [values, setValues] = useState<string[]>([]);
  useEffect(() => {
    if (!bridge || !tableId || !fieldId) {
      setValues([]);
      return;
    }
    let cancelled = false;
    bridge
      .getFieldValues(tableId, fieldId)
      .then((list) => !cancelled && setValues(list))
      .catch(() => !cancelled && setValues([]));
    return () => {
      cancelled = true;
    };
  }, [bridge, tableId, fieldId]);
  return values;
}

export function ValueSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string[];
  onChange(v: string[]): void;
}) {
  // 已保存的值即使当前数据里没有了,也保留在选项中,避免被悄悄丢掉
  const all = [...new Set([...options, ...value])];
  return (
    <Select
      multiple
      style={{ width: '100%' }}
      placeholder={t('common.selectValue')}
      emptyContent={t('field.noValues')}
      filter
      maxTagCount={3}
      value={value}
      onChange={(v) => onChange((v as string[]) ?? [])}
      optionList={all.map((x) => ({ value: x, label: x }))}
    />
  );
}

/** 官方要求的配置布局:左侧预览,右侧 340px 表单,底部预留 70px 放确认按钮 */
export function ConfigLayout({
  preview,
  form,
  onConfirm,
  saving,
  saved,
  disabled,
}: {
  preview: ReactNode;
  form: ReactNode;
  onConfirm(): void;
  saving?: boolean;
  saved?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="config-widget-dialog-container">
      <div className="config-widget-dialog-preview">{preview}</div>
      <div className="config-widget-dialog-settings">
        <div className="bm-settings-scroll">{form}</div>
        <div className="bm-settings-footer">
          <Button theme="solid" type="primary" loading={saving} disabled={disabled} onClick={onConfirm}>
            {saved ? t('common.saved') : t('common.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 两个插件共用的"数据源"表单:数据表 + 里程碑标记/名称/日期 + 状态 */
export function SourceForm<C extends SourceConfig>({
  api,
  statusRequired,
}: {
  api: PluginApi<C>;
  statusRequired: boolean;
}) {
  const { config, fields, tables, bridge } = api;
  const flagValues = useFieldValues(bridge, config.tableId, config.flagFieldId);
  const doneValues = useFieldValues(bridge, config.tableId, config.statusFieldId);
  const upd = api.update as (p: Partial<SourceConfig>) => void;

  return (
    <>
      <FormItem label={t('common.table')}>
        <TableSelect tables={tables} value={config.tableId} onChange={api.setTable} />
      </FormItem>

      <FormItem label={t('field.flag')} hint={t('field.hintFlag')}>
        <FieldSelect
          fields={fields}
          types={FLAG_TYPES}
          value={config.flagFieldId}
          onChange={(id) => upd({ flagFieldId: id, flagValues: [], flagKeyword: '' })}
        />
      </FormItem>
      {config.flagFieldId ? (
        <FormItem label={t('field.flagValues')}>
          <ValueSelect
            options={flagValues.length > 30 ? [] : flagValues}
            value={config.flagValues}
            onChange={(v) => upd({ flagValues: v })}
          />
        </FormItem>
      ) : null}
      {config.flagFieldId ? (
        <FormItem label={t('field.flagKeyword')} hint={t('field.hintFlagKeyword')}>
          <Input
            value={config.flagKeyword ?? ''}
            placeholder={t('field.flagKeywordPlaceholder')}
            onChange={(v) => upd({ flagKeyword: v })}
            showClear
          />
        </FormItem>
      ) : null}

      <FormItem label={t('field.name')}>
        <FieldSelect
          fields={fields}
          types={NAME_TYPES}
          value={config.nameFieldId}
          onChange={(id) => upd({ nameFieldId: id })}
        />
      </FormItem>
      <FormItem label={t('field.date')}>
        <FieldSelect
          fields={fields}
          types={DATE_TYPES}
          value={config.dateFieldId}
          onChange={(id) => upd({ dateFieldId: id })}
        />
      </FormItem>

      <FormItem label={`${t('field.status')}${statusRequired ? '' : ' ' + t('common.optional')}`}>
        <FieldSelect
          fields={fields}
          types={STATUS_TYPES}
          value={config.statusFieldId}
          clearable={!statusRequired}
          onChange={(id) => upd({ statusFieldId: id, doneValues: [] })}
        />
      </FormItem>
      {config.statusFieldId ? (
        <FormItem label={t('field.done')}>
          <ValueSelect
            options={doneValues}
            value={config.doneValues}
            onChange={(v) => upd({ doneValues: v })}
          />
        </FormItem>
      ) : null}
    </>
  );
}
