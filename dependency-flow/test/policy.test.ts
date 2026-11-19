import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, defaultFlowConfig } from '../src/graph.ts';
import type { FlowGraph } from '../src/graph.ts';
import { canNudge, formatWait, lastNudgeAt, modeFromViewName, nudgeWaitMs, restrictToOwner } from '../src/policy.ts';
import { personIds } from '../../shared/src/records.ts';

const text = (s: string) => [{ type: 'text', text: s }];
const rec = (id: string, owner: string, status: string, deps: string[] = []) => ({
  recordId: id,
  fields: {
    n: text(id.toUpperCase()),
    s: { id: status, text: status },
    o: [{ id: owner, name: owner }],
    dep: deps.length ? { recordIds: deps } : null,
  },
});
const cfg = { ...defaultFlowConfig, nameFieldId: 'n', statusFieldId: 's', ownerFieldId: 'o', depFieldId: 'dep', showIsolated: true };

// a(甲) -> b(乙) -> c(丙) -> d(丁);e(甲) 独立;f(乙) -> d
const g: FlowGraph = buildGraph(
  [
    rec('a', 'u1', '进行中'),
    rec('b', 'u2', '进行中', ['a']),
    rec('c', 'u3', '待开启', ['b']),
    rec('d', 'u4', '待开启', ['c', 'f']),
    rec('e', 'u1', '待开启'),
    rec('f', 'u2', '验收通过'),
  ],
  cfg,
);

test('personIds 读取人员字段', () => {
  assert.deepEqual(personIds([{ id: 'u1', name: 'x' }, { id: 'u2' }]), ['u1', 'u2']);
  assert.deepEqual(personIds({ id: 'u1' }), ['u1']);
  assert.deepEqual(personIds(null), []);
  assert.deepEqual(personIds('王雪'), []);
});

test('buildGraph 带出 ownerIds', () => {
  assert.deepEqual(g.tasks.find((t) => t.id === 'b')?.ownerIds, ['u2']);
});

test('restrictToOwner:保留自己的任务和全部上下游,其他标记为 external', () => {
  const r = restrictToOwner(g, 'u2');
  const ids = r.tasks.map((t) => t.id).sort();
  assert.deepEqual(ids, ['a', 'b', 'c', 'd', 'f']);
  assert.equal(r.tasks.find((t) => t.id === 'b')?.external, undefined);
  assert.equal(r.tasks.find((t) => t.id === 'a')?.external, true);
  assert.equal(r.tasks.find((t) => t.id === 'c')?.external, true);
  // 相关范围内的连线全部保留
  assert.deepEqual(
    r.edges.map((e) => `${e.from}>${e.to}`).sort(),
    ['a>b', 'b>c', 'c>d', 'f>d'],
  );
});

test('restrictToOwner:看不到无关的人;没有任务的人什么也看不到;取不到用户时为空', () => {
  const r3 = restrictToOwner(g, 'u3');
  assert.deepEqual(r3.tasks.map((t) => t.id).sort(), ['a', 'b', 'c', 'd']); // f 只是 d 的另一条前置,和 c 无关
  assert.equal(restrictToOwner(g, 'nobody').tasks.length, 0);
  assert.equal(restrictToOwner(g, null).tasks.length, 0);
});

test('restrictToOwner:自己独立的任务也保留', () => {
  const r = restrictToOwner(g, 'u1');
  assert.ok(r.tasks.some((t) => t.id === 'e' && !t.external));
  // 间接后置 b、c、d 也相关
  assert.deepEqual(r.tasks.map((t) => t.id).sort(), ['a', 'b', 'c', 'd', 'e']);
});

test('canNudge:管理员可催有负责人且未完成的;普通用户可催与自己相关的全部上下游', () => {
  const t = (id: string) => g.tasks.find((x) => x.id === id)!;
  const admin = { userId: 'u9', isAdmin: true };
  assert.equal(canNudge(t('c'), g, admin), true);
  assert.equal(canNudge(t('f'), g, admin), false); // 已完成
  const u2 = { userId: 'u2', isAdmin: false };
  assert.equal(canNudge(t('a'), g, u2), true); // a 是 b 的前置
  assert.equal(canNudge(t('c'), g, u2), true); // c 是 b 的后置,也算相关
  assert.equal(canNudge(t('d'), g, u2), true); // d 是 b 的间接后置
  assert.equal(canNudge(t('e'), g, u2), false); // e 和 b 没有依赖关系
  assert.equal(canNudge(t('b'), g, u2), false); // 自己
  assert.equal(canNudge(t('a'), g, { userId: null, isAdmin: false }), false);
});

test('催办冷却:同一人同一任务 1 小时内不能再催', () => {
  const logs = [
    { taskId: 'a', nudgerId: 'u2', at: 1_000_000 },
    { taskId: 'a', nudgerId: 'u2', at: 2_000_000 },
    { taskId: 'a', nudgerId: 'u3', at: 5_000_000 },
  ];
  assert.equal(lastNudgeAt(logs, 'a', 'u2'), 2_000_000);
  assert.equal(nudgeWaitMs(logs, 'a', 'u2', 2_000_000 + 10 * 60_000), 50 * 60_000);
  assert.equal(nudgeWaitMs(logs, 'a', 'u2', 2_000_000 + 61 * 60_000), 0);
  assert.equal(nudgeWaitMs(logs, 'b', 'u2', 2_000_000), 0);
  assert.equal(formatWait(50 * 60_000), '50 分钟');
  assert.equal(formatWait(75 * 60_000), '1 小时 15 分钟');
  assert.equal(formatWait(60 * 60_000), '1 小时');
});

test('modeFromViewName:按视图名推断显示方式', () => {
  assert.equal(modeFromViewName('我的任务(列表)'), 'list');
  assert.equal(modeFromViewName('任务 List'), 'list');
  assert.equal(modeFromViewName('依赖关系流程图'), 'flow');
  assert.equal(modeFromViewName('我的任务'), undefined);
  assert.equal(modeFromViewName(undefined), undefined);
});
