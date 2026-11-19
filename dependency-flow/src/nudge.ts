import { bitable } from '@lark-base-open/js-sdk';
import { loadRecords } from '@shared';
import { cellTexts, personIds } from '../../shared/src/records.ts';
import { isMock } from './data.ts';
import type { FlowTask } from './graph.ts';
import type { NudgeLog } from './policy.ts';

/** 催办记录表的名字和字段名(找不到会提示缺哪个) */
export const NUDGE_TABLE = '催办记录';
const F = {
  task: '任务',
  taskId: '任务记录ID',
  target: '被催办人',
  nudger: '催办人',
  at: '催办时间',
  message: '留言',
} as const;
/** 可选字段:记录链接(文本)。没有这一列时,链接会附在留言末尾 */
const LINK_FIELD = '记录链接';

export interface NudgeInput {
  task: FlowTask;
  /** 任务所在的数据表,用来生成记录链接 */
  tableId?: string;
  message: string;
  nudgerId: string | null;
}

export interface Nudger {
  /** 催办记录表是否可用;不可用时返回给用户看的原因 */
  check(): Promise<{ ok: true } | { ok: false; reason: string }>;
  history(): Promise<NudgeLog[]>;
  send(input: NudgeInput): Promise<void>;
}

const MOCK_KEY = 'df-mock-nudges';
const mockNudger: Nudger = {
  check: async () => ({ ok: true }),
  history: async () => JSON.parse(localStorage.getItem(MOCK_KEY) ?? '[]') as NudgeLog[],
  async send({ task, nudgerId }) {
    const list = JSON.parse(localStorage.getItem(MOCK_KEY) ?? '[]') as NudgeLog[];
    list.push({ taskId: task.id, nudgerId: nudgerId ?? '', at: Date.now() });
    localStorage.setItem(MOCK_KEY, JSON.stringify(list));
    console.info('[mock] 催办', task.name, '→', task.ownerIds);
  },
};

interface Resolved {
  tableId: string;
  fieldIds: Record<keyof typeof F, string>;
  linkFieldId?: string;
}

async function resolve(): Promise<Resolved | { error: string }> {
  const tables = await bitable.base.getTableMetaList();
  const meta = tables.find((t) => t.name.trim() === NUDGE_TABLE);
  if (!meta) return { error: `没有找到名为「${NUDGE_TABLE}」的数据表,请先让管理员创建` };
  const table = await bitable.base.getTableById(meta.id);
  const fields = await table.getFieldMetaList();
  const byName = new Map(fields.map((f) => [f.name.trim(), f.id]));
  const missing = (Object.values(F) as string[]).filter((n) => !byName.has(n));
  if (missing.length) return { error: `「${NUDGE_TABLE}」表缺少字段:${missing.join('、')}` };
  const fieldIds = Object.fromEntries(
    (Object.keys(F) as Array<keyof typeof F>).map((k) => [k, byName.get(F[k])!]),
  ) as Resolved['fieldIds'];
  return { tableId: meta.id, fieldIds, linkFieldId: byName.get(LINK_FIELD) };
}

let cached: Promise<Resolved | { error: string }> | undefined;
const getResolved = () => (cached ??= resolve().catch((e) => ({ error: String(e?.message ?? e) })));

/** 任务记录的链接,点开直接定位到这条记录;取不到时返回空串 */
async function recordLink(tableId: string, recordId: string): Promise<string> {
  try {
    const table = await bitable.base.getTableById(tableId);
    const views = (await (table as any).getViewMetaList()) as Array<{ id: string; type: unknown }>;
    // 优先用普通表格视图,避免链接指向插件视图
    const grid = views.find((v) => v.type === 1 || String(v.type).toLowerCase() === 'grid') ?? views[0];
    if (!grid) return '';
    return await (bitable as any).bridge.getBitableUrl({ tableId, viewId: grid.id, recordId });
  } catch {
    return '';
  }
}

const realNudger: Nudger = {
  async check() {
    const r = await getResolved();
    if ('error' in r) {
      cached = undefined; // 下次点击重新检查,管理员补建表后不用刷新
      return { ok: false, reason: r.error };
    }
    return { ok: true };
  },
  async history() {
    const r = await getResolved();
    if ('error' in r) return [];
    const rows = await loadRecords(r.tableId);
    return rows.flatMap((row) => {
      const taskId = cellTexts(row.fields[r.fieldIds.taskId]).join('');
      const at = Number(row.fields[r.fieldIds.at]);
      if (!taskId || !Number.isFinite(at)) return [];
      return [{ taskId, nudgerId: personIds(row.fields[r.fieldIds.nudger])[0] ?? '', at }];
    });
  },
  async send({ task, tableId, message, nudgerId }) {
    const r = await getResolved();
    if ('error' in r) throw new Error(r.error);
    const table = await bitable.base.getTableById(r.tableId);
    const text = (s: string) => [{ type: 'text', text: s }];
    const fields: Record<string, unknown> = {
      [r.fieldIds.task]: text(task.name),
      [r.fieldIds.taskId]: text(task.id),
      [r.fieldIds.target]: task.ownerIds.map((id) => ({ id })),
      [r.fieldIds.at]: Date.now(),
    };
    if (nudgerId) fields[r.fieldIds.nudger] = [{ id: nudgerId }];
    const link = tableId ? await recordLink(tableId, task.id) : '';
    let note = message.trim();
    if (link) {
      if (r.linkFieldId) fields[r.linkFieldId] = text(link);
      else note = note ? `${note}\n${link}` : link;
    }
    if (note) fields[r.fieldIds.message] = text(note);
    await (table as any).addRecord({ fields });
  },
};

export const createNudger = (): Nudger => (isMock() ? mockNudger : realNudger);
