import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLayout,
  parseSource,
  findNextMilestone,
  layoutPositions,
  percent,
  parseDateItem,
  manualToMilestones,
  isMilestoneDone,
  type SourceConfig,
  type DataRows,
} from '../src/milestones.ts';

const cfg: SourceConfig = {
  tableId: 't1',
  statusFieldId: 'fStatus',
  doneValues: ['已完成'],
  flagFieldId: 'fType',
  flagValues: ['里程碑'],
  nameFieldId: 'fName',
  dateFieldId: 'fDate',
};

const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const row = (status: string, type: string, name: string, date: [number, number, number], n = 1) => [
  { value: status, text: status },
  { value: type, text: type },
  { value: name, text: name },
  { value: ms(...date), text: `${date[0]}-${date[1]}-${date[2]}` },
  { value: n, text: String(n) },
];

test('buildLayout 按固定顺序给出列', () => {
  const l = buildLayout(cfg);
  assert.deepEqual(l.fieldIds, ['fStatus', 'fType', 'fName', 'fDate']);
  assert.deepEqual(l.index, { status: 0, flag: 1, name: 2, date: 3 });
  const l2 = buildLayout({ ...cfg, statusFieldId: undefined });
  assert.deepEqual(l2.index, { flag: 0, name: 1, date: 2 });
});

test('parseSource 统计完成率并提取里程碑', () => {
  const data: DataRows = [
    row('已完成', '任务', 'a', [2026, 11, 1], 3),
    row('进行中', '任务', 'b', [2026, 11, 20], 1),
    row('已完成', '里程碑', '立项', [2026, 11, 5]),
    row('进行中', '里程碑', '内测', [2026, 12, 5]),
  ];
  const r = parseSource(data, cfg);
  assert.equal(r.total, 6);
  assert.equal(r.done, 4);
  assert.equal(percent(r.done, r.total), 67);
  assert.equal(r.milestones.length, 2);
  assert.equal(r.milestones[0].done, true);
  assert.equal(r.milestones[1].dateText, '2026-12-05');
});

test('findNextMilestone 取今天及以后最早的未完成里程碑', () => {
  const data: DataRows = [
    row('已完成', '里程碑', '立项', [2026, 11, 5]),
    row('进行中', '里程碑', '逾期的', [2026, 11, 10]),
    row('进行中', '里程碑', '内测', [2026, 12, 5]),
    row('进行中', '里程碑', '上线', [2027, 1, 5]),
  ];
  const { milestones } = parseSource(data, cfg);
  const r = findNextMilestone(milestones, new Date(2026, 11 - 1, 18, 15, 30), true);
  assert.equal(r.next?.name, '内测');
  assert.equal(r.daysLeft, 17);
  assert.equal(r.overdueCount, 1);
});

test('里程碑就在今天时 daysLeft 为 0', () => {
  const { milestones } = parseSource([row('进行中', '里程碑', '今天', [2026, 11, 18])], cfg);
  const r = findNextMilestone(milestones, new Date(2026, 10, 18, 23, 59), true);
  assert.equal(r.daysLeft, 0);
});

test('没有后续里程碑时返回 null', () => {
  const { milestones } = parseSource([row('已完成', '里程碑', '立项', [2026, 11, 5])], cfg);
  const r = findNextMilestone(milestones, new Date(2026, 10, 18), true);
  assert.equal(r.next, null);
  assert.equal(r.daysLeft, null);
});

test('没有状态字段时,过期的里程碑视为已完成', () => {
  const noStatus = { ...cfg, statusFieldId: undefined };
  const data: DataRows = [
    [
      { value: '里程碑', text: '里程碑' },
      { value: 'x', text: 'x' },
      { value: ms(2026, 11, 1), text: '2026-11-01' },
      { value: 1, text: '1' },
    ],
  ];
  const { milestones } = parseSource(data, noStatus);
  assert.equal(isMilestoneDone(milestones[0], new Date(2026, 10, 18), false), true);
});

test('parseDateItem 兼容毫秒、秒和文本', () => {
  const d = new Date(2026, 11, 5);
  assert.equal(parseDateItem({ value: d.getTime() + 3600 * 1000, text: null })?.getTime(), d.getTime());
  assert.equal(parseDateItem({ value: Math.floor(d.getTime() / 1000), text: null })?.getTime(), d.getTime());
  assert.equal(parseDateItem({ value: null, text: '2026/12/05' })?.getTime(), d.getTime());
  assert.equal(parseDateItem({ value: null, text: '没有日期' }), null);
});

test('layoutPositions 按日期比例排布', () => {
  const list = manualToMilestones([
    { id: '1', name: 'a', date: '2026-01-01' },
    { id: '2', name: 'b', date: '2026-01-11' },
    { id: '3', name: 'c', date: '2026-01-21' },
  ]);
  const p = layoutPositions(list, 10);
  assert.equal(p.get('m-1'), 10);
  assert.equal(p.get('m-2'), 50);
  assert.equal(p.get('m-3'), 90);
  assert.equal(layoutPositions(list.slice(0, 1)).get('m-1'), 50);
});
