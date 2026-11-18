import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, defaultFlowConfig, findCycleEdges, linkIds, reachable, statusKind } from '../src/graph.ts';

const text = (s: string) => [{ type: 'text', text: s }];
const rec = (id: string, name: string, status: string, deps: string[] = [], end?: string) => ({
  recordId: id,
  fields: {
    n: text(name),
    s: { id: 'o', text: status },
    d: end ?? null,
    dep: deps.length ? { recordIds: deps, tableId: 't', text: 'x', type: 'text' } : null,
  },
});
const cfg = { ...defaultFlowConfig, nameFieldId: 'n', statusFieldId: 's', dateFieldId: 'd', depFieldId: 'dep' };

test('linkIds 兼容对象、数组、record_ids', () => {
  assert.deepEqual(linkIds({ recordIds: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(linkIds([{ record_ids: ['a'] }, { recordIds: ['b'] }]), ['a', 'b']);
  assert.deepEqual(linkIds(null), []);
});

test('statusKind', () => {
  assert.equal(statusKind('验收通过'), 'done');
  assert.equal(statusKind('进行中'), 'doing');
  assert.equal(statusKind('依赖项目未完成'), 'blocked');
  assert.equal(statusKind('待开启'), 'todo');
});

test('buildGraph:前置依赖生成 前置→当前 的边,过滤孤立任务,识别里程碑', () => {
  const g = buildGraph(
    [
      rec('a', '需求评审', '验收通过', [], '2026/12/01'),
      rec('b', '🌟必保时间点🌟验收', '待开启', ['a'], '2027/01/19'),
      rec('c', '无关任务', '待开启'),
      rec('d', '', '待开启', ['a']), // 空名称忽略
    ],
    cfg,
  );
  assert.deepEqual(g.edges, [{ from: 'a', to: 'b' }]);
  assert.deepEqual(g.tasks.map((t) => t.id), ['a', 'b']);
  assert.equal(g.isolated, 1);
  assert.equal(g.tasks[1].milestone, true);
  assert.equal(g.tasks[1].name, '验收');
  assert.equal(g.tasks[0].dateText, '2026-12-01');
});

test('depMode=succ 时方向反过来;showIsolated 保留孤立任务', () => {
  const g = buildGraph([rec('a', 'A', '待开启', ['b']), rec('b', 'B', '待开启'), rec('c', 'C', '待开启')], {
    ...cfg,
    depMode: 'succ',
    showIsolated: true,
  });
  assert.deepEqual(g.edges, [{ from: 'a', to: 'b' }]);
  assert.equal(g.tasks.length, 3);
});

test('环检测与上下游可达', () => {
  const edges = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'c', to: 'a' },
  ];
  assert.equal(findCycleEdges(['a', 'b', 'c'], edges).length, 1);
  const chain = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
  ];
  assert.deepEqual([...reachable('b', chain, 'up')], ['a']);
  assert.deepEqual([...reachable('a', chain, 'down')].sort(), ['b', 'c']);
});
