import { GroupMode, SourceType } from '@lark-base-open/js-sdk';
import type { IDataCondition } from '@lark-base-open/js-sdk';
import { buildLayout, fieldIdOf } from './milestones';
import type { ColumnKey, SourceConfig } from './milestones';

/**
 * 过滤用的键字段:优先 keyFieldId(自动编号),没有时取名称列,再没有取布局里的第一列。
 * 用布局里的列做键时,column 是它对应的角色,index 是它在 buildLayout 返回数据里的列下标。
 */
export function filterKeyOf(c: SourceConfig): { fieldId: string; column?: ColumnKey; index?: number } | null {
  if (c.keyFieldId) return { fieldId: c.keyFieldId };
  const layout = buildLayout(c);
  if (!layout.fieldIds.length) return null;
  const column: ColumnKey = layout.index.name !== undefined ? 'name' : layout.keys[0];
  const index = layout.index[column] ?? 0;
  return { fieldId: layout.fieldIds[index], column, index };
}

/**
 * 生成仪表盘的 dataConditions。
 * 它不用来取全量数据(记录由 getRecords 直接读取),而是作为"可见记录探针":
 * 按键字段分组 + COUNTA 计数。仪表盘的 getData 会按「项目归属」这类筛选器过滤后返回,
 * 插件拿它的结果去过滤自己读到的记录,就能跟随筛选器。
 * 仪表盘聚合接口最多支持 2 个分组维度,所以这里只放 1 个键字段。
 * 缺少 required 里的任一字段时返回 [],表示配置还不完整。
 */
export function buildSourceConditions(c: SourceConfig, required: ColumnKey[]): IDataCondition[] {
  if (!c.tableId) return [];
  if (required.some((k) => !fieldIdOf(c, k))) return [];
  const key = filterKeyOf(c);
  if (!key) return [];
  return [
    {
      tableId: c.tableId,
      dataRange: { type: SourceType.ALL },
      groups: [{ fieldId: key.fieldId, mode: GroupMode.INTEGRATED }],
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
