import test from 'node:test';
import assert from 'node:assert/strict';
import { bindingsStale, clearBindings, pickTable } from '../src/rebind.ts';
import type { SourceConfig } from '../src/milestones.ts';

const tables = [
  { id: 't-log', name: '催办记录' },
  { id: 't-proj', name: '东莞一期项目总表' },
];

const base = (): SourceConfig => ({
  tableId: 't-old',
  statusFieldId: 'f-status',
  doneValues: ['验收通过'],
  flagFieldId: 'f-flag',
  flagValues: ['是'],
  flagKeyword: '必保时间点',
  nameFieldId: 'f-name',
  dateFieldId: 'f-date',
  keyFieldId: 'f-key',
});

test('bindingsStale:表不在当前多维表格里', () => {
  assert.equal(bindingsStale(base(), tables, null), 'table');
});

test('bindingsStale:表还在、字段还没取到时不判定字段失效', () => {
  assert.equal(bindingsStale({ ...base(), tableId: 't-proj' }, tables, null), null);
});

test('bindingsStale:绑定的字段一个都不在当前表里', () => {
  const fields = [{ id: 'new-1', name: '任务名称', type: 1 }];
  assert.equal(bindingsStale({ ...base(), tableId: 't-proj' }, tables, fields), 'fields');
});

test('bindingsStale:至少有一个字段还在就不重绑', () => {
  const fields = [{ id: 'f-name', name: '任务名称', type: 1 }];
  assert.equal(bindingsStale({ ...base(), tableId: 't-proj' }, tables, fields), null);
});

test('clearBindings:换成新表并清掉旧字段,其它配置保留', () => {
  const next = clearBindings({ ...base(), showPercent: true } as SourceConfig & { showPercent: boolean }, 't-proj');
  assert.equal(next.tableId, 't-proj');
  assert.equal(next.statusFieldId, undefined);
  assert.equal(next.flagFieldId, undefined);
  assert.equal(next.nameFieldId, undefined);
  assert.equal(next.dateFieldId, undefined);
  assert.equal(next.keyFieldId, undefined);
  assert.deepEqual(next.doneValues, []);
  assert.deepEqual(next.flagValues, []);
  assert.equal(next.flagKeyword, '');
  assert.equal(next.showPercent, true);
});

test('pickTable:优先名字像项目或任务的表', () => {
  assert.equal(pickTable(tables)?.id, 't-proj');
  assert.equal(pickTable([{ id: 'only', name: '人员路由' }])?.id, 'only');
  assert.equal(pickTable([]), undefined);
});
