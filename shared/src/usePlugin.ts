import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IConfig, IDataCondition } from '@lark-base-open/js-sdk';
import { createBridge } from './bridge';
import { createDisposer, createLatest, onBecameVisible } from './async';
import { dlog } from './devlog';
import type { Bridge, FieldInfo, PluginState, TableInfo, ThemeMode } from './bridge';
import { buildLayout, COLUMN_ORDER } from './milestones';
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
                await latest.run(
                  () => b.getRows(tableId, fieldIds),
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
  const condKey = JSON.stringify(conditions);
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
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    if (!bridge) return false;
    setSaving(true);
    try {
      const layout = buildLayout(config);
      const cols = (Object.entries(layout.index) as Array<[ColumnKey, number]>).map(([k, i]) => [k, i]);
      const payload: IConfig = {
        dataConditions: optsRef.current.buildConditions(config),
        customConfig: { ...config, __cols: cols } as unknown as Record<string, unknown>,
      };
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
