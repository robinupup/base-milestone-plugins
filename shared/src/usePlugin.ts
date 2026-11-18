import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { IConfig, IData, IDataCondition } from '@lark-base-open/js-sdk';
import { createBridge } from './bridge';
import type { Bridge, FieldInfo, PluginState, TableInfo, ThemeMode } from './bridge';
import { buildLayout, COLUMN_ORDER } from './milestones';
import type { ColumnKey, SourceConfig } from './milestones';

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
  take('flag', findField(fields, FLAG_TYPES, [/里程碑|milestone/i, /类型|type/i]));
  take(
    'date',
    findField(fields, DATE_TYPES, [/结束|截止|到期|deadline|end|due/i]) ??
      fields.find((f) => f.type === FT.DateTime),
  );
  take(
    'name',
    findField(fields, NAME_TYPES, [/名称|标题|任务|name|title/i], used) ??
      fields.find((f) => f.type === FT.Text && !used.includes(f.id)),
  );
  if (opts.status) take('status', findField(fields, STATUS_TYPES, [/状态|进度|status|state/i], used));
  return next;
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
  data: IData | null;
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
  const [data, setData] = useState<IData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>('LIGHT');
  const pickedFor = useRef<string | null>(null);

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
    let off: Array<() => void> = [];
    let cancelled = false;
    (async () => {
      try {
        const b = await createBridge();
        if (cancelled) return;
        setBridge(b);
        const th = await b.getTheme().catch(() => 'LIGHT' as ThemeMode);
        setTheme(b.state === 'FullScreen' ? 'DARK' : th);
        off.push(b.onThemeChange((x) => setTheme(b.state === 'FullScreen' ? 'DARK' : x)));

        if (b.state === 'Create') {
          const list = await b.getTables();
          setTables(list);
          if (list[0]) setConfig((c) => ({ ...c, tableId: list[0].id }));
        } else {
          const loaded = await loadConfig(b);
          setConfig(loaded);
          if (b.state === 'Config') {
            // 已有配置时不要再自动选字段,避免把用户清空的可选字段又填回去
            pickedFor.current = loaded.tableId ?? null;
            setTables(await b.getTables());
          }
          if (b.state === 'View' || b.state === 'FullScreen') {
            const reload = async () => {
              try {
                setData(await b.getData());
              } catch (e) {
                setError(String((e as Error)?.message ?? e));
              }
            };
            await reload();
            off.push(b.onDataChange(reload));
            off.push(
              b.onConfigChange(async () => {
                setConfig(await loadConfig(b));
                await reload();
              }),
            );
          }
        }
        setReady(true);
      } catch (e) {
        setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => {
      cancelled = true;
      off.forEach((f) => f());
      off = [];
    };
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
      setFields(list);
      if (pickedFor.current !== config.tableId) {
        pickedFor.current = config.tableId ?? null;
        setConfig((c) => autoPick(c, list, { status: optsRef.current.autoPickStatus !== false }));
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
        .getPreviewData(conditions[0])
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
      const ok = await bridge.saveConfig(payload);
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
