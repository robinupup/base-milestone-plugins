import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfigLayout, createLatest, onBecameVisible } from '@shared';
import type { FieldInfo, TableInfo } from '@shared';
import type { RawRecord } from '../../shared/src/records.ts';
import { getAccess } from './access.ts';
import { autoPickFlow, pickTable } from './autopick.ts';
import { createSource } from './data.ts';
import { DetailPanel } from './DetailPanel.tsx';
import { FlowChart, KIND_COLOR, KIND_LABEL } from './FlowChart.tsx';
import { buildGraph, defaultFlowConfig } from './graph.ts';
import type { FlowConfig, StatusKind } from './graph.ts';
import { createHost } from './host.ts';
import type { Theme } from './host.ts';
import { layoutGraph } from './layout.ts';
import { createNudger } from './nudge.ts';
import { canNudge, isMine, modeFromViewName, nudgeWaitMs, restrictToOwner } from './policy.ts';
import type { Access, NudgeLog } from './policy.ts';
import { SettingsForm } from './SettingsForm.tsx';
import { TaskList } from './TaskList.tsx';
import { dlog } from '@shared/devlog';

const source = createSource();
const host = createHost();
const nudger = createNudger();

const Flag = () => (
  <svg className="df-flag" viewBox="0 0 16 18" aria-hidden="true">
    <path d="M2.5 1v17" stroke="#8a8f99" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    <path d="M3.2 1.8h10l-2.6 3.4 2.6 3.4h-10z" fill="#f54a45" />
  </svg>
);

export function App() {
  const isDashConfig = host.state === 'Create' || host.state === 'Config';
  const isTableView = host.state === 'TableView';

  const [config, setConfig] = useState<FlowConfig>(defaultFlowConfig);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [records, setRecords] = useState<RawRecord[] | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('LIGHT');
  const [query, setQuery] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadedRef = useRef(false);
  const configRef = useRef(config);
  configRef.current = config;
  // 字段增删改时递增,触发重新拉字段列表
  const [fieldsTick, setFieldsTick] = useState(0);
  // 最近一次成功读到数据的时间,显示在顶部栏,方便确认数据是否新鲜
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  // 当前用户与权限;管理员可以临时"以普通用户身份预览"
  const [access, setAccess] = useState<Access>({ userId: null, isAdmin: false });
  const [previewAsUser, setPreviewAsUser] = useState(false);
  const [viewName, setViewName] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<NudgeLog[]>([]);
  const [nudgeBusy, setNudgeBusy] = useState(false);
  const [nudgeNotice, setNudgeNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [, setClock] = useState(0);
  const effAccess = useMemo<Access>(
    // 仪表盘的创建/配置界面是在编辑组件,不做权限过滤
    () => ({ userId: access.userId, isAdmin: isDashConfig || (access.isAdmin && !previewAsUser) }),
    [access, previewAsUser, isDashConfig],
  );

  // 初始化:主题、已保存配置、数据表
  useEffect(() => {
    let off = () => {};
    (async () => {
      try {
        dlog('flow init, state=', host.state);
        const accessP = getAccess().catch(() => ({ userId: null, isAdmin: false }) as Access);
        const th = await host.getTheme().catch(() => 'LIGHT' as Theme);
        setTheme(host.state === 'FullScreen' ? 'DARK' : th);
        off = host.onThemeChange((x) => setTheme(host.state === 'FullScreen' ? 'DARK' : x));
        const list = await source.getTables();
        setTables(list);
        const saved = host.state === 'Create' ? null : await host.loadConfig();
        const cur = saved?.tableId ?? (await source.currentTableId()) ?? pickTable(list)?.id;
        // 当前选中的表不一定是项目表(例如停在"人员路由"),已保存配置之外优先选名字像项目的表
        const tableId = saved?.tableId ?? (isTableView ? cur : pickTable(list)?.id ?? cur);
        setConfig({ ...defaultFlowConfig, ...saved, tableId });
        setViewName(await source.currentViewName().catch(() => undefined));
        const acc = await accessP;
        dlog('flow access', acc);
        setAccess(acc);
        loadedRef.current = true;
        setReady(true);
      } catch (e) {
        dlog('flow init error', e);
        setError(String((e as Error)?.message ?? e));
      }
    })();
    return () => off();
  }, [isTableView]);

  // 取字段并自动补全
  useEffect(() => {
    if (!ready || !config.tableId) return;
    let cancelled = false;
    source
      .getFields(config.tableId)
      .then((list) => {
        if (cancelled) return;
        setFields(list);
        const patch = autoPickFlow(list, configRef.current);
        if (Object.keys(patch).length) {
          dlog('flow autopick', patch);
          setConfig((c) => ({ ...c, ...patch }));
        }
      })
      .catch((e) => setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, config.tableId, fieldsTick]);

  // 读记录并订阅变化
  useEffect(() => {
    if (!ready || !config.tableId) return;
    const tableId = config.tableId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // 连续多次读取只采纳最新一次,避免慢请求用旧数据覆盖新数据
    const latest = createLatest();
    const reload = () =>
      latest
        .run(
          () => source.loadRecords(tableId),
          (r) => {
            if (cancelled) return;
            setRecords(r);
            setUpdatedAt(new Date());
            setError(null);
          },
        )
        .catch((e) => !cancelled && setError(String(e?.message ?? e)));
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 400);
    };
    reload();
    const off = source.subscribe(tableId, soon, () => {
      setFieldsTick((n) => n + 1);
      soon();
    });
    // 事件之外的兜底:标签页重新可见时再读一次
    const offVisible = onBecameVisible(soon);
    return () => {
      cancelled = true;
      latest.cancel();
      clearTimeout(timer);
      off();
      offVisible();
    };
  }, [ready, config.tableId]);

  // 数据表视图里,设置改动立即保存
  useEffect(() => {
    if (!ready || !loadedRef.current || !isTableView) return;
    // 只有管理员的设置会写进共享存储,普通成员只存在本机
    void host.saveConfig(config, { shared: access.isAdmin });
  }, [config, ready, isTableView, access.isAdmin]);

  // 先按全部数据建图,再按权限过滤;列表模式总是包含没有依赖的任务
  const rawGraph = useMemo(() => buildGraph(records ?? [], { ...config, showIsolated: true }), [records, config]);
  // 显示方式:设置里明确选了就用它;否则看视图名字;再否则有依赖关系画流程图,没有就列表
  const mode: 'flow' | 'list' =
    config.viewMode === 'flow' || config.viewMode === 'list'
      ? config.viewMode
      : (modeFromViewName(isTableView ? viewName : undefined) ??
        (rawGraph.edges.length > 0 || !records ? 'flow' : 'list'));
  const fullGraph = useMemo(
    () => (mode === 'list' ? rawGraph : buildGraph(records ?? [], config)),
    [mode, rawGraph, records, config],
  );
  const graph = useMemo(
    () => (effAccess.isAdmin ? fullGraph : restrictToOwner(fullGraph, effAccess.userId)),
    [fullGraph, effAccess],
  );
  const recordById = useMemo(() => new Map((records ?? []).map((r) => [r.recordId ?? '', r])), [records]);
  const selected = useMemo(() => graph.tasks.find((t) => t.id === selectedId) ?? null, [graph, selectedId]);
  const nudgeAllowed = !!selected && canNudge(selected, graph, effAccess);
  const layout = useMemo(() => layoutGraph(graph.tasks, graph.edges), [graph]);
  const cycleKeys = useMemo(() => new Set(graph.cycleEdges.map((e) => `${e.from}>${e.to}`)), [graph]);

  // 选中的任务消失(被过滤或删除)时关闭面板
  useEffect(() => {
    if (selectedId && records && !selected) setSelectedId(null);
  }, [selectedId, selected, records]);

  // 打开可催办的任务时,读一次催办记录用来判断冷却;冷却中每 30 秒刷新一次倒计时
  useEffect(() => {
    setNudgeNotice(null);
    if (!selectedId || !nudgeAllowed) return;
    let dead = false;
    nudger
      .history()
      .then((l) => !dead && setLogs(l))
      .catch(() => {});
    const timer = setInterval(() => setClock((n) => n + 1), 30000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [selectedId, nudgeAllowed]);

  const sendNudge = useCallback(
    async (message: string) => {
      if (!selected) return;
      setNudgeBusy(true);
      setNudgeNotice(null);
      try {
        const ok = await nudger.check();
        if (!ok.ok) {
          setNudgeNotice({ kind: 'err', text: ok.reason });
          return;
        }
        // 发送前重新读一次记录,避免两个人同时点导致重复催
        const fresh = await nudger.history();
        setLogs(fresh);
        if (nudgeWaitMs(fresh, selected.id, effAccess.userId, Date.now()) > 0) return;
        await nudger.send({ task: selected, message, nudgerId: effAccess.userId });
        setLogs(await nudger.history());
        setNudgeNotice({ kind: 'ok', text: `已发出催办,系统会通知${selected.owner || '负责人'}。` });
      } catch (e) {
        setNudgeNotice({ kind: 'err', text: `催办失败:${String((e as Error)?.message ?? e)}` });
      } finally {
        setNudgeBusy(false);
      }
    },
    [selected, effAccess.userId],
  );

  // 展示状态下告知仪表盘已渲染完成
  useEffect(() => {
    if (ready && records && !isDashConfig) void host.setRendered().catch(() => {});
  }, [ready, records, isDashConfig]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme === 'DARK' ? 'dark' : 'light';
    document.body.setAttribute('theme-mode', theme === 'DARK' ? 'dark' : 'light');
  }, [theme]);

  const update = useCallback((p: Partial<FlowConfig>) => {
    setSaved(false);
    setConfig((c) => ({ ...c, ...p }));
  }, []);
  const onTable = useCallback((tableId: string) => {
    setSaved(false);
    setRecords(null);
    setFields([]);
    setConfig((c) => ({
      ...defaultFlowConfig,
      milestoneKeywords: c.milestoneKeywords,
      showIsolated: c.showIsolated,
      tableId,
    }));
  }, []);
  const confirm = useCallback(async () => {
    setSaving(true);
    try {
      setSaved(await host.saveConfig(config));
    } finally {
      setSaving(false);
    }
  }, [config]);

  if (error && !records) return <div className="bm-center">出错了: {error}</div>;
  if (!ready) return <div className="bm-center">加载中…</div>;

  const counts = graph.tasks.filter((t) => mode === 'flow' || !t.external).reduce<Record<StatusKind, number>>(
    (m, t) => ((m[t.kind] += 1), m),
    { done: 0, doing: 0, blocked: 0, todo: 0 },
  );
  const noDep = !config.depFieldId && mode === 'flow';
  const empty = records !== null && !noDep && mode === 'flow' && graph.edges.length === 0;

  const chart = (
    <div className="df-root">
      {records === null ? null : mode === 'list' ? (
        <TaskList tasks={graph.tasks} query={query} selectedId={selectedId} onSelect={setSelectedId} />
      ) : (
        <FlowChart
          layout={layout}
          edges={graph.edges}
          cycleKeys={cycleKeys}
          query={query}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      <div className="df-bar">
        <span className="df-title">{mode === 'list' ? '任务列表' : '依赖关系'}</span>
        <span className="df-stat">
          {mode === 'list'
            ? `${graph.tasks.filter((t) => !t.external).length} 个任务`
            : `${graph.tasks.length} 个任务 · ${graph.edges.length} 条依赖`}
          {!effAccess.isAdmin ? ' · 仅显示与你相关的' : ''}
        </span>
        {updatedAt ? (
          <span className="df-updated" title="数据最近一次刷新时间,表里有改动会自动刷新">
            更新于 {updatedAt.toLocaleTimeString('zh-CN', { hour12: false })}
          </span>
        ) : null}
        {graph.cycleEdges.length ? <span className="df-warn">⚠ {graph.cycleEdges.length} 处循环依赖(红色虚线)</span> : null}
        <span className="df-grow" />
        {isDashConfig ? null : (
          <>
            <input className="df-search" placeholder="搜索任务" value={query} onChange={(e) => setQuery(e.target.value)} />
            {mode === 'flow' ? (
              <label className="df-toggle">
                <input
                  type="checkbox"
                  checked={config.showIsolated}
                  onChange={(e) => update({ showIsolated: e.target.checked })}
                />
                含无依赖任务{effAccess.isAdmin && !config.showIsolated && graph.isolated > 0 ? `(${graph.isolated})` : ''}
              </label>
            ) : null}
            {access.isAdmin && isTableView ? (
              <label className="df-toggle" title="用普通成员的视角看看他们会看到什么">
                <input type="checkbox" checked={previewAsUser} onChange={(e) => setPreviewAsUser(e.target.checked)} />
                以普通成员预览
              </label>
            ) : null}
            {isTableView && access.isAdmin ? (
              <button className="df-icon-btn" onClick={() => setDrawer((v) => !v)}>
                设置
              </button>
            ) : null}
          </>
        )}
      </div>

      {isTableView && access.isAdmin && drawer ? (
        <div className="df-drawer">
          <SettingsForm config={config} tables={tables} fields={fields} onChange={update} onTable={onTable} />
        </div>
      ) : null}

      {selected ? (
        <DetailPanel
          task={selected}
          record={recordById.get(selected.id)}
          fields={fields}
          full
          onClose={() => setSelectedId(null)}
          nudge={{
            state: !nudgeAllowed
              ? 'hidden'
              : nudgeWaitMs(logs, selected.id, effAccess.userId, Date.now()) > 0
                ? 'wait'
                : 'ready',
            waitMs: nudgeWaitMs(logs, selected.id, effAccess.userId, Date.now()),
            busy: nudgeBusy,
            notice: nudgeNotice,
            onSend: sendNudge,
          }}
        />
      ) : null}

      <div className="df-legend">
        {(Object.keys(KIND_COLOR) as StatusKind[]).map((k) => (
          <span key={k}>
            <i style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]} {counts[k]}
          </span>
        ))}
        <span>
          <Flag />
          里程碑
        </span>
      </div>

      {noDep ? <div className="df-empty">请先选择“依赖字段”(关联到本表的字段)</div> : null}
      {records !== null && !effAccess.isAdmin && graph.tasks.length === 0 ? (
        <div className="df-empty">
          <div>没有找到你负责的任务</div>
          <div>
            {effAccess.userId
              ? '负责人字段里没有你,或者你的任务还没有依赖关系'
              : '没能识别当前用户,请联系管理员'}
          </div>
        </div>
      ) : null}
      {empty && (effAccess.isAdmin || graph.tasks.length > 0) ? (
        <div className="df-empty">
          <div>没有找到依赖关系</div>
          <div>在“{fields.find((f) => f.id === config.depFieldId)?.name ?? '依赖字段'}”里填上前置任务后会自动画出</div>
        </div>
      ) : null}
    </div>
  );

  if (!isDashConfig) return chart;
  return (
    <ConfigLayout
      preview={chart}
      form={<SettingsForm config={config} tables={tables} fields={fields} onChange={update} onTable={onTable} />}
      onConfirm={confirm}
      saving={saving}
      saved={saved}
      disabled={!config.tableId || !config.depFieldId}
    />
  );
}
