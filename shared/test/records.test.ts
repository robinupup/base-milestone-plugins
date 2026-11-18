import test from 'node:test';
import assert from 'node:assert/strict';
import { cellToItem, recordsToRows, distinctValues } from '../src/records.ts';
import { parseSource } from '../src/milestones.ts';
import type { SourceConfig } from '../src/milestones.ts';

const records = [
  {
    fields: {
      name: [{ type: 'text', text: '🌟必保时间点🌟【验收】' }, { type: 'text', text: '东莞' }],
      status: { id: 'o1', text: '验收通过' },
      end: '2027/03/15',
    },
  },
  { fields: { name: [{ type: 'text', text: '普通任务' }], status: { id: 'o2', text: '待开启' }, end: '2027/03/20' } },
  { fields: { name: [{ type: 'text', text: '🌟必保时间点🌟无日期' }], status: null, end: null } },
];

test('cellToItem 拼接文本分段并保留选项文本', () => {
  assert.equal(cellToItem(records[0].fields.name).text, '🌟必保时间点🌟【验收】东莞');
  assert.equal(cellToItem(records[0].fields.status).text, '验收通过');
  assert.deepEqual(cellToItem(null), { value: null, text: null });
  assert.equal(cellToItem(1803949200000).value, 1803949200000);
});

test('记录 → 行 → parseSource:关键词里程碑 + 完成率', () => {
  const c: SourceConfig = {
    tableId: 't',
    nameFieldId: 'name',
    flagFieldId: 'name',
    flagKeyword: '必保时间点',
    flagValues: [],
    statusFieldId: 'status',
    doneValues: ['验收通过'],
    dateFieldId: 'end',
  };
  // 布局顺序 status, name(=flag), date
  const rows = recordsToRows(records, ['status', 'name', 'end']);
  const out = parseSource(rows, c);
  assert.equal(out.total, 3);
  assert.equal(out.done, 1);
  assert.equal(out.milestones.length, 1);
  assert.equal(out.milestones[0].dateText, '2027-03-15');
  assert.equal(out.milestones[0].name, '【验收】东莞');
  assert.equal(out.milestones[0].done, true);
});

test('parseSource 跳过仪表盘接口的表头行', () => {
  const c: SourceConfig = { tableId: 't', statusFieldId: 's', doneValues: ['完成'], flagValues: [] };
  const rows = [
    [{ value: 's', text: 's' }, { value: 'Bitable_Dashboard_Count', text: 'Bitable_Dashboard_Count' }],
    [{ value: '完成', text: '完成' }, { value: 2, text: '2' }],
  ];
  const out = parseSource(rows, c);
  assert.equal(out.total, 2);
  assert.equal(out.done, 2);
});

test('distinctValues 展开多选', () => {
  const v = distinctValues([{ fields: { x: [{ text: 'a' }, { text: 'b' }] } }, { fields: { x: [{ text: 'a' }] } }], 'x');
  assert.deepEqual(v.sort(), ['a', 'b']);
});
