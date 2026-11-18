import type { FlowConfig } from './graph.ts';

export interface FieldLite {
  id: string;
  name: string;
  type: number;
}

// SDK FieldType 数值
export const T = { Text: 1, SingleSelect: 3, DateTime: 5, User: 11, SingleLink: 18, DuplexLink: 21, Formula: 20, Created: 1001, Modified: 1002 };
export const LINK_TYPES = [T.SingleLink, T.DuplexLink];
export const DATE_TYPES = [T.DateTime, T.Formula, T.Created, T.Modified];

const find = (fields: FieldLite[], types: number[], re?: RegExp) => {
  const pool = fields.filter((f) => types.includes(f.type));
  return (re && pool.find((f) => re.test(f.name))) || undefined;
};

/** 只补全还没选的字段;依赖字段优先"前置",只找到"后置"时自动切到 succ 模式 */
export function autoPickFlow(fields: FieldLite[], c: FlowConfig): Partial<FlowConfig> {
  const patch: Partial<FlowConfig> = {};
  if (!c.nameFieldId) {
    const f = find(fields, [T.Text], /任务项|名称|标题|任务|name|title/i) ?? fields.find((x) => x.type === T.Text);
    if (f) patch.nameFieldId = f.id;
  }
  if (!c.statusFieldId) {
    const f = find(fields, [T.SingleSelect], /进展|状态|status|state/i);
    if (f) patch.statusFieldId = f.id;
  }
  if (!c.dateFieldId) {
    const f = find(fields, DATE_TYPES, /完成时间|结束|截止|到期|due|end/i) ?? fields.find((x) => x.type === T.DateTime);
    if (f) patch.dateFieldId = f.id;
  }
  if (!c.ownerFieldId) {
    const f = find(fields, [T.User], /负责人|owner|assignee/i) ?? fields.find((x) => x.type === T.User);
    if (f) patch.ownerFieldId = f.id;
  }
  if (!c.depFieldId) {
    const pred = find(fields, LINK_TYPES, /前置|前序|依赖|predecessor|depend/i);
    const succ = find(fields, LINK_TYPES, /后置|后续|影响|successor/i);
    const any = fields.find((x) => LINK_TYPES.includes(x.type));
    if (pred) {
      patch.depFieldId = pred.id;
      patch.depMode = 'pred';
    } else if (succ) {
      patch.depFieldId = succ.id;
      patch.depMode = 'succ';
    } else if (any) {
      patch.depFieldId = any.id;
    }
  }
  return patch;
}

/** 有多张表时,优先选名字像"项目/任务"的表 */
export const pickTable = <T extends { id: string; name: string }>(list: T[]) =>
  list.find((t) => /项目|任务|事件|计划|task|project|plan/i.test(t.name)) ?? list[0];
