import { GroupMode, SourceType } from '@lark-base-open/js-sdk';
import type { IDataCondition } from '@lark-base-open/js-sdk';
import { buildLayout, fieldIdOf } from './milestones';
import type { ColumnKey, SourceConfig } from './milestones';

/**
 * 生成仪表盘的 dataConditions。
 * 仪表盘 API 由服务端聚合:按各字段分组 + COUNTA 计数,返回二维数组,无需把全量记录拉到前端。
 * 缺少 required 里的任一字段时返回 [],表示配置还不完整。
 */
export function buildSourceConditions(c: SourceConfig, required: ColumnKey[]): IDataCondition[] {
  if (!c.tableId) return [];
  if (required.some((k) => !fieldIdOf(c, k))) return [];
  const { fieldIds } = buildLayout(c);
  if (!fieldIds.length) return [];
  return [
    {
      tableId: c.tableId,
      dataRange: { type: SourceType.ALL },
      groups: fieldIds.map((fieldId) => ({ fieldId, mode: GroupMode.INTEGRATED })),
      series: 'COUNTA',
    },
  ];
}

/** 取某个字段的所有取值(用于配置里的"已完成值""里程碑值"下拉) */
export function buildValuesCondition(tableId: string, fieldId: string): IDataCondition {
  return {
    tableId,
    dataRange: { type: SourceType.ALL },
    groups: [{ fieldId, mode: GroupMode.INTEGRATED }],
    series: 'COUNTA',
  };
}
