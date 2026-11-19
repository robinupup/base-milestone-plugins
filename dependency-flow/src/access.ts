import { bitable } from '@lark-base-open/js-sdk';
import { isMock } from './data.ts';
import type { Access } from './policy.ts';

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | undefined> =>
  Promise.race([p, new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))]);

/**
 * 当前用户是谁、是不是管理员。
 * 管理员 = 对整个多维表格有「管理」权限;取不到权限时一律按普通用户处理(更保守)。
 * 本地 mock:?asUser=<id>&admin=0|1(默认管理员)。
 */
export async function getAccess(): Promise<Access> {
  if (isMock()) {
    const q = new URLSearchParams(window.location.search);
    return { userId: q.get('asUser'), isAdmin: q.get('admin') !== '0' };
  }
  const b = bitable as any;
  const [userId, isAdmin] = await Promise.all([
    withTimeout<string>(b.bridge?.getUserId?.(), 3000).catch(() => undefined),
    (async () => {
      try {
        // 两个 SDK 都支持 getPermission;旧写法 getBasePermission 作为后备
        const r = b.base.getPermission
          ? await withTimeout<boolean>(b.base.getPermission({ entity: 'Base', type: 'manageable' }), 3000)
          : await withTimeout<boolean>(b.base.getBasePermission('manageable'), 3000);
        return r === true;
      } catch {
        return false;
      }
    })(),
  ]);
  return { userId: userId ?? null, isAdmin };
}
