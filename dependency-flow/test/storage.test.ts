import test from 'node:test';
import assert from 'node:assert/strict';
import { configKey, legacyKey, readConfig, writeConfig } from '../src/storage.ts';
import type { KV } from '../src/storage.ts';

const memory = (): KV & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

test('不同视图的配置互相隔离', () => {
  const kv = memory();
  writeConfig(kv, 'vewA', '/block/', { depFieldId: 'fA' });
  writeConfig(kv, 'vewB', '/block/', { depFieldId: 'fB' });
  assert.deepEqual(readConfig(kv, 'vewA', '/block/'), { depFieldId: 'fA' });
  assert.deepEqual(readConfig(kv, 'vewB', '/block/'), { depFieldId: 'fB' });
});

test('升级前按路径保存的旧配置,在视图第一次读取时被沿用', () => {
  const kv = memory();
  kv.setItem(legacyKey('/block/'), JSON.stringify({ depFieldId: 'old' }));
  assert.deepEqual(readConfig(kv, 'vewA', '/block/'), { depFieldId: 'old' });
  // 视图自己保存后,以自己的为准,不再受旧配置影响
  writeConfig(kv, 'vewA', '/block/', { depFieldId: 'mine' });
  assert.deepEqual(readConfig(kv, 'vewA', '/block/'), { depFieldId: 'mine' });
  assert.deepEqual(readConfig(kv, 'vewB', '/block/'), { depFieldId: 'old' });
});

test('取不到视图 id 时退回按路径存取', () => {
  const kv = memory();
  writeConfig(kv, undefined, '/x/', { a: 1 });
  assert.equal(configKey(undefined, '/x/'), legacyKey('/x/'));
  assert.deepEqual(readConfig(kv, undefined, '/x/'), { a: 1 });
});

test('存储内容损坏或为空时返回 null', () => {
  const kv = memory();
  assert.equal(readConfig(kv, 'v', '/p/'), null);
  kv.setItem(configKey('v', '/p/'), '{bad json');
  assert.equal(readConfig(kv, 'v', '/p/'), null);
});
