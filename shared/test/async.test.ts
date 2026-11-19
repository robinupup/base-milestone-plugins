import test from 'node:test';
import assert from 'node:assert/strict';
import { createDisposer, createLatest, onBecameVisible } from '../src/async.ts';

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

test('createLatest:较早发出但较晚返回的结果被丢弃', async () => {
  const latest = createLatest();
  const slow = deferred<string>();
  const fast = deferred<string>();
  const got: string[] = [];

  const p1 = latest.run(() => slow.promise, (v) => got.push(v));
  const p2 = latest.run(() => fast.promise, (v) => got.push(v));
  fast.resolve('new');
  assert.equal(await p2, true);
  slow.resolve('old');
  assert.equal(await p1, false);

  assert.deepEqual(got, ['new']);
});

test('createLatest:按顺序返回时都会采纳', async () => {
  const latest = createLatest();
  const got: number[] = [];
  await latest.run(async () => 1, (v) => got.push(v));
  await latest.run(async () => 2, (v) => got.push(v));
  assert.deepEqual(got, [1, 2]);
});

test('createLatest:cancel 之后尚未返回的结果作废', async () => {
  const latest = createLatest();
  const d = deferred<string>();
  const got: string[] = [];
  const p = latest.run(() => d.promise, (v) => got.push(v));
  latest.cancel();
  d.resolve('late');
  assert.equal(await p, false);
  assert.deepEqual(got, []);
});

test('createLatest:读取失败时抛出,不影响后续读取', async () => {
  const latest = createLatest();
  await assert.rejects(latest.run(() => Promise.reject(new Error('boom')), () => {}), /boom/);
  const got: number[] = [];
  await latest.run(async () => 3, (v) => got.push(v));
  assert.deepEqual(got, [3]);
});

test('createDisposer:dispose 时依次取消已登记的订阅', () => {
  const d = createDisposer();
  const calls: string[] = [];
  d.add(() => calls.push('a'));
  d.add(() => calls.push('b'));
  d.dispose();
  assert.deepEqual(calls, ['a', 'b']);
  assert.equal(d.disposed, true);
});

test('createDisposer:卸载之后才登记的订阅会被立即取消(不泄漏)', () => {
  const d = createDisposer();
  d.dispose();
  let called = 0;
  d.add(() => called++);
  assert.equal(called, 1);
});

test('createDisposer:重复 dispose 只取消一次;某个取消函数抛错不影响其余', () => {
  const d = createDisposer();
  let n = 0;
  d.add(() => {
    throw new Error('x');
  });
  d.add(() => n++);
  d.dispose();
  d.dispose();
  assert.equal(n, 1);
});

test('onBecameVisible:只在可见时回调,取消后不再回调', () => {
  const handlers = new Set<() => void>();
  const doc = {
    visibilityState: 'hidden' as DocumentVisibilityState,
    addEventListener: (_: string, h: () => void) => handlers.add(h),
    removeEventListener: (_: string, h: () => void) => handlers.delete(h),
  };
  let n = 0;
  const off = onBecameVisible(() => n++, doc as never);
  handlers.forEach((h) => h());
  assert.equal(n, 0);
  doc.visibilityState = 'visible';
  handlers.forEach((h) => h());
  assert.equal(n, 1);
  off();
  assert.equal(handlers.size, 0);
});
