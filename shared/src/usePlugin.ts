import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IConfig, IDataCondition } from '@lark-base-open/js-sdk';
import { createBridge } from './bridge';
import { createDisposer, createLatest, onBecameVisible } from './async';
import { dlog } from './devlog';
import type { Bridge, FieldInfo, PluginState, TableInfo, ThemeMode } from './bridge';
import { buildLayout, COLUMN_ORDER } from './milestones';
import { filterKeyOf } from './conditions';
import { filterByKeys, rowKey, visibleKeys } from './records';
import type { ColumnKey, DataRows, SourceConfig } from './milestones';

// SDK FieldType 数值
export const FT = {
  Text: 1,
  Number: 2,
  SingleSelect: 3,
  MultiSelect: 4,
  DateTime: 5,
  Checkbox: 7,
  Formula: 20,
  CreatedTime: 1001,
  ModifiedTime: 1002,
  AutoNumber: 1005,
  Progress: 99002,
} as const;

export const DATE_TYPES: number[] = [FT.DateTime, FT.CreatedTime, FT.ModifiedTime, FT.Formula];
export const FLAG_TYPES: number[] = [FT.Checkbox, FT.SingleSelect, FT.MultiSelect, FT.Text];
export const STATUS_TYPES: number[] = [FT.SingleSelect, FT.Checkbox, FT.Text, FT.Progress];
export const NAME_TYPES: number[] = [FT.Text, FT.SingleSelect, FT.AutoNumber, FT.Formula];

/** 按顺序尝试多个名称规则,靠前的规则优先 */
const findField = (fields: FieldInfo[], types: number[], res: RegExp[], exclude: string[] = []) => {
  const pool = fields.filter((f) => types.includes(f.type) && !exclude.includes(f.id));
  for (const re of res) {
    const hit = pool.find((f) => re.test(f.name));
    if (hit) return hit;
  }
  return undefined;
};

/** 只填充还没选的字段,尽量选出名称和类型都合适的字段 */
export function autoPick<C extends SourceConfig>(c: C, fields: FieldInfo[], opts: { status: boolean }): C {
  const next = { ...c };
  const used: string[] = [];
  const take = (key: ColumnKey, f?: FieldInfo) => {
    const k = `${key}FieldId` as const;
    if (!next[k] && f) next[k] = f.id;
    if (next[k]) used.push(next[k] as string);
  };
  take('flag', findField(fields, FLAG_TYPES, [/里程碑|milestone/i]));
  take(
    'date',
    findField(fields, DATE_TYPES, [/完成时间|结束|截止|到期|deadline|end|due/i]) ??
      fields.find((f) => f.type === FT.DateTime),
  );
  take(
    'name',
    findField(fields, [FT.Text], [/名称|标题|任务项|任务|name|title/i], used) ??
      findField(fields, NAME_TYPES, [/名称|标题|name|title/i], used) ??
      fields.find((f) => f.type === FT.Text && !used.includes(f.id)),
  );
  if (!next.keyFieldId) next.keyFieldId = fields.find((f) => f.type === FT.AutoNumber)?.id;
  if (opts.status) take('status', findField(fields, STATUS_TYPES, [/状态|进度|进展|status|state/i], used));
  return next;
}

const MILESTONE_KEYWORDS = ['必保时间点', '里程碑', 'Milestone', '🌟'];
const DONE_RE = /完成|通过|done|finish|complete|closed|resolved/i;
const NOT_DONE_RE = /未|待|不|没|not|un|wip/i;
const FLAG_YES_RE = /^(是|true|yes|y|✓|✔|里程碑|milestone)$/i;

/**
 * 根据真实数据补全配置:
 * - 没有"里程碑"字段时,看任务名里是否带"必保时间点/里程碑/🌟"这类标记,有就用名称字段+关键词;
 * - 标记字段已选但没选值时,挑"是/里程碑"之类的值;
 * - 状态字段已选但没选完成值时,挑"完成/通过"之类的值。
 */
export async function smartFill(b: Bridge, c: SourceConfig): Promise<Partial<SourceConfig>> {
  const patch: Partial<SourceConfig> = {};
  const tableId = c.tableId;
  if (!tableId) return patch;
  if (!c.flagFieldId && c.nameFieldId) {
    const vals = await b.getFieldValues(tableId, c.nameFieldId);
    const kw = MILESTONE_KEYWORDS.find((k) => vals.some((v) => v.includes(k)));
    if (kw) {
      patch.flagFieldId = c.nameFieldId;
      patch.flagKeyword = kw;
    }
  } else if (c.flagFieldId && !c.flagValues.length && !c.flagKeyword) {
    const vals = await b.getFieldValues(tableId, c.flagFieldId);
    const hit = vals.filter((v) => FLAG_YES_RE.test(v) || /里程碑|milestone/i.test(v));
    if (hit.length) patch.flagValues = hit;
  }
  if (c.statusFieldId && !c.doneValues.length) {
    const vals = await b.getFieldValues(tableId, c.statusFieldId);
    const hit = vals.filter((v) => DONE_RE.test(v) && !NOT_DONE_RE.test(v));
    if (hit.length) patch.doneValues = hit;
  }
  return patch;
}

/** 有多张表时,优先选名字像"项目/任务"的表 */
const pickTable = (list: TableInfo[]) =>
  list.find((t) => /项目|任务|事件|计划|task|project|plan/i.test(t.name)) ?? list[0];

/** 保存到仪表盘的配置:dataConditions 是"可见记录探针",customConfig 存完整配置 */
function makePayload<C extends SourceConfig>(c: C, buildConditions: (c: C) => IDataCondition[]): IConfig {
  const key = filterKeyOf(c);
  return {
    dataConditions: buildConditions(c),
    customConfig: { ...c, __cols: key?.column ? [[key.column, 0]] : [] } as unknown as Record<string, unknown>,
  };
}

/** 旧版本保存的 dataConditions 有多个分组,getData 会报错、也拿不到筛选结果;读到时自动升级成探针格式 */
function needsUpgrade(saved: IConfig, want: IDataCondition[]): boolean {
  if (!want.length) return false;
  const have = saved.dataConditions?.[0];
  const w = want[0];
  return !have || have.tableId !== w.tableId || have.groups?.length !== 1 || have.groups[0].fieldId !== w.groups?.[0]?.fieldId;
}

interface Options<C extends SourceConfig> {
  defaults: C;
  /** 返回保存到仪表盘的 dataConditions;配置不完整时返回空数组 */
  buildConditions(c: C): IDataCondition[];
  /** 是否让 autoPick 去选状态字段(插件 2 里状态字段可选,不自动选) */
  autoPickStatus?: boolean;
}

export interface PluginApi<C extends SourceConfig> {
  ready: boolean;
  error: string | null;
  bridge: Bridge | null;
  state: PluginState;
  /** 创建或配置状态 */
  isConfig: boolean;
  config: C;
  update(patch: Partial<C>): void;
  setTable(tableId: string): void;
  tables: TableInfo[];
  fields: FieldInfo[];
  data: DataRows | null;
  dataLoading: boolean;
  save(): Promise<boolean>;
  saving: boolean;
  saved: boolean;
  dark: boolean;
  /** 配置是否足以向服务端取数 */
  configured: boolean;
}

export function usePlugin<C extends SourceConfig>(opts: Options<C>): PluginApi<C> {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [bridge, setBridge] = useState<Bridge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<C>(opts.defaults);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [data, setData] = useState<DataRows | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('LIGHT');
  const pickedFor = useRef<string | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  const cancelledAll = useRef(false);
  useEffect(() => {
    cancelledAll.current = false;
    return () => {
      cancelledAll.current = true;
    };
  }, []);

  const state: PluginState = bridge?.state ?? 'View';
  const isConfig = state === 'Create' || state === 'Config';

  // 读取已保存配置:dataConditions 里的 id 优先(仪表盘创建副本时只会改写 dataConditions)
  const loadConfig = useCallback(async (b: Bridge) => {
    const saved = await b.getConfig();
    const base = { ...optsRef.current.defaults, ...(saved.customConfig as Partial<C> | undefined) } as C;
    const cond = saved.dataConditions?.[0];
    const cols = (saved.customConfig as { __cols?: Array<[ColumnKey, number]> } | undefined)?.__cols;
    if (cond) {
      base.tableId = cond.tableId;
      for (const [key, idx] of cols ?? []) {
        const id = cond.groups?.[idx]?.fieldId;
        if (id) (base as SourceConfig)[`${key}FieldId` as const] = id;
      }
    }
    return base;
  }, []);

  // 初始化
  useEffect(() => {
    // 所有订阅统一交给 disposer:异步初始化在卸载后才完成时,迟到的订阅会被立即取消
    const disposer = createDisposer();
    (async () => {
      try {
        dlog('init: createBridge');
        const b = await createBridge();
        dlog('init: bridge ok, state=', b.state);
        if (disposer.disposed) return;
        setBridge(b);
        const th = await b.getTheme().catch((e) => {
          dlog('getTheme failed', e);
          return 'LIGHT' as ThemeMode;
        });
        dlog('init: theme=', th);
        if (disposer.disposed) return;
        setTheme(b.state === 'FullScreen' ? 'DARK' : th);
        disposer.add(b.onThemeChange((x) => setTheme(b.state === 'FullScreen' ? 'DARK' : x)));

        if (b.state === 'Create') {
          const list = await b.getTables();
          dlog('tables', list);
          setTables(list);
          const target = pickTable(list);
          if (target) setConfig((c) => ({ ...c, tableId: target.id }));
        } else {
          const loaded = await loadConfig(b);
          setConfig(loaded);
          if (b.state === 'Config') {
            // 已有配置时不要再自动选字段,避免把用户清空的可选字段又填回去
            pickedFor.current = loaded.tableId ?? null;
            setTables(await b.getTables());
          }
          if (b.state === 'View' || b.state === 'FullScreen') {
            let current = loaded;
            // 旧配置没有记录键字段:自动找表里的自动编号字段
            if (!current.keyFieldId && current.tableId) {
              try {
                const fl = await b.getFields(current.tableId);
                const k = fl.find((f) => f.type === FT.AutoNumber)?.id;
                if (k) current = { ...current, keyFieldId: k };
              } catch (e) {
                dlog('resolve key field failed', String((e as Error)?.message ?? e));
              }
            }
            try {
              const want = optsRef.current.buildConditions(current);
              if (needsUpgrade(await b.getConfig(), want)) {
                const ok = await b.saveConfig(makePayload(current, optsRef.current.buildConditions));
                dlog('config upgraded to filter probe:', ok);
              }
            } catch (e) {
              dlog('config upgrade failed', String((e as Error)?.message ?? e));
            }
            let offRecords: () => void = () => {};
            let timer: ReturnType<typeof setTimeout> | undefined;
            // 连续多次读取时只采纳最新一次,避免慢请求用旧数据覆盖新数据
            const latest = createLatest();
            const reload = async () => {
              try {
                const { fieldIds } = buildLayout(current);
                if (!current.tableId || !fieldIds.length) {
                  latest.cancel();
                  setData([]);
                  return;
                }
                const tableId = current.tableId;
                const key = filterKeyOf(current);
                const cfg = current;
                await latest.run(
                  async () => {
                    let rows: DataRows;
                    let keys: string[] | null = null;
                    if (key && cfg.keyFieldId) {
                      ({ rows, keys } = await b.getKeyedRows(tableId, fieldIds, cfg.keyFieldId));
                    } else {
                      rows = await b.getRows(tableId, fieldIds);
                      if (key && key.index !== undefined) keys = rows.map((r) => rowKey(r, key.index as number));
                    }
                    if (!keys) return rows;
                    // 跟随仪表盘筛选器(如「项目归属」):getData 返回的是筛选后的可见记录
                    try {
                      const raw = await b.getData();
                      const visible = visibleKeys(raw);
                      let useRows = rows;
                      let useKeys = keys;
                      // 仪表盘返回数据的表头就是它实际分组的字段名。
                      // 宿主可能仍在用旧的探针配置(分组字段与我们记录的键字段不同),
                      // 这时按它实际分组的字段重新取键,保证两边能对上。
                      const probeName = raw[0]?.[0]?.text;
                      if (cfg.keyFieldId && probeName) {
                        const fl = await b.getFields(tableId);
                        const probe = fl.find((f) => f.name === probeName);
                        if (probe && probe.id !== cfg.keyFieldId) {
                          ({ rows: useRows, keys: useKeys } = await b.getKeyedRows(tableId, fieldIds, probe.id));
                        }
                      }
                      const out = filterByKeys(useRows, useKeys, visible);                      // 一个都对不上说明键不可用,宁可显示全部也不要空白
                      if (!out.length && useRows.length && visible.size) {
                        dlog('probe keys unmatched, show all');
                        return useRows;
                      }
                      return out;
                    } catch (e) {
                      // 取不到筛选结果(如旧配置还没升级)时退回显示全部,不让组件空白
                      dlog('getData failed, show all', String((e as Error)?.message ?? e));
                      return rows;
                    }
                  },
                  (rows) => {
                    if (disposer.disposed) return;
                    setData(rows);
                    setError(null);
                  },
                );
              } catch (e) {
                if (!disposer.disposed) setError(String((e as Error)?.message ?? e));
              }
            };
            const reloadSoon = () => {
              clearTimeout(timer);
              timer = setTimeout(reload, 300);
            };
            const subscribe = () => {
              offRecords();
              offRecords = () => {};
              if (current.tableId) offRecords = b.onRecordsChange(current.tableId, reloadSoon);
            };
            // 先登记清理,再做可能耗时的异步读取;卸载后迟到的订阅会被立即取消
            disposer.add(() => {
              clearTimeout(timer);
              latest.cancel();
              offRecords();
            });
            await reload();
            if (disposer.disposed) return;
            subscribe();
            disposer.add(b.onDataChange(reloadSoon));
            disposer.add(onBecameVisible(reloadSoon));
            disposer.add(
              b.onConfigChange(async () => {
                try {
                  current = await loadConfig(b);
                  if (disposer.disposed) return;
                  setConfig(current);
                  subscribe();
                  await reload();
                } catch (e) {
                  if (!disposer.disposed) setError(String((e as Error)?.message ?? e));
                }
              }),
            );
          }
        }
        dlog('init: ready');
        if (!disposer.disposed) setReady(true);
      } catch (e) {
        dlog('init: error', e);
        if (!disposer.disposed) setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => disposer.dispose();
  }, [loadConfig]);

  // 主题:同步到 body(Semi 的暗色模式依赖 theme-mode 属性)
  useEffect(() => {
    document.body.setAttribute('theme-mode', theme === 'DARK' ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme === 'DARK' ? 'dark' : 'light';
    // 真实环境里背景由仪表盘外层容器提供;本地 mock 时自己补一个背景方便肉眼检查
    if (bridge?.isMock) document.body.style.background = theme === 'DARK' ? '#1b1d21' : '';
  }, [theme, bridge]);

  // 配置状态下,切换数据表后拉字段并自动选择
  useEffect(() => {
    if (!bridge || !isConfig || !config.tableId) return;
    let cancelled = false;
    bridge.getFields(config.tableId).then((list) => {
      if (cancelled) return;
      dlog('fields of', config.tableId, list);
      setFields(list);
      if (pickedFor.current !== config.tableId) {
        pickedFor.current = config.tableId ?? null;
        const picked = autoPick(configRef.current, list, { status: optsRef.current.autoPickStatus !== false });
        setConfig(picked);
        // 再根据真实数据补全:里程碑标记、已完成值
        smartFill(bridge, picked)
          .then((patch) => {
            if (cancelledAll.current || !Object.keys(patch).length) return;
            dlog('smartFill', patch);
            setConfig((c) => (c.tableId === picked.tableId ? { ...c, ...patch } : c));
          })
          .catch((e) => dlog('smartFill error', e));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bridge, isConfig, config.tableId]);

  const conditions = useMemo(() => opts.buildConditions(config), [config]); // eslint-disable-line react-hooks/exhaustive-deps
  // 探针只含键字段;预览要读全部角色字段,所以字段选择变化也要触发刷新
  const condKey = JSON.stringify([conditions, buildLayout(config).fieldIds]);
  const configured = conditions.length > 0;

  // 配置状态下实时预览
  useEffect(() => {
    if (!bridge || !isConfig) return;
    if (!configured) {
      setData(null);
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    const timer = setTimeout(() => {
      bridge
        .getRows(config.tableId as string, buildLayout(config).fieldIds)
        .then((d) => !cancelled && setData(d))
        .catch((e) => !cancelled && setError(String(e?.message ?? e)))
        .finally(() => !cancelled && setDataLoading(false));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bridge, isConfig, condKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 展示状态下告知仪表盘已渲染完成(自动化推送截图依赖它)
  useEffect(() => {
    if (!bridge || isConfig || !ready || data === null) return;
    const id = requestAnimationFrame(() => {
      setTimeout(() => bridge.setRendered().catch(() => {}), 300);
    });
    return () => cancelAnimationFrame(id);
  }, [bridge, isConfig, ready, data]);

  const update = useCallback((patch: Partial<C>) => {
    setSaved(false);
    setConfig((c) => ({ ...c, ...patch }));
  }, []);

  const setTable = useCallback((tableId: string) => {
    setSaved(false);
    pickedFor.current = null;
    setFields([]);
    setConfig((c) => {
      const next = { ...c, tableId } as C;
      for (const key of COLUMN_ORDER) (next as SourceConfig)[`${key}FieldId` as const] = undefined;
      next.doneValues = [];
      next.flagValues = [];
      next.flagKeyword = '';
      next.keyFieldId = undefined;
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!bridge) return false;
    setSaving(true);
    try {
      const payload = makePayload(config, optsRef.current.buildConditions);
      dlog('save: start');
      const ok = await bridge.saveConfig(payload);
      dlog('save: result', ok);
      setSaved(ok);
      return ok;
    } finally {
      setSaving(false);
    }
  }, [bridge, config]);

  return {
    ready,
    error,
    bridge,
    state,
    isConfig,
    config,
    update,
    setTable,
    tables,
    fields,
    data,
    dataLoading,
    save,
    saving,
    saved,
    dark: theme === 'DARK',
    configured,
  };
}
