import { useMemo } from 'react';
import type { FlowTask } from './graph.ts';
import { KIND_COLOR, KIND_LABEL } from './FlowChart.tsx';

const NO_DATE = '9999-99-99';

/** 任务列表:按日期从近到远,没有日期的排在最后 */
export function TaskList({
  tasks,
  query,
  selectedId,
  onSelect,
}: {
  tasks: FlowTask[];
  query: string;
  selectedId: string | null;
  onSelect(id: string | null): void;
}) {
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => !t.external && (!q || t.name.toLowerCase().includes(q) || t.owner.toLowerCase().includes(q)))
      .sort((a, b) => (a.dateText || NO_DATE).localeCompare(b.dateText || NO_DATE) || a.name.localeCompare(b.name));
  }, [tasks, query]);

  if (!rows.length) return <div className="df-empty">没有可显示的任务</div>;
  return (
    <div className="df-list" onClick={() => onSelect(null)}>
      <table>
        <thead>
          <tr>
            <th>任务</th>
            <th>状态</th>
            <th>负责人</th>
            <th>日期</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr
              key={t.id}
              className={t.id === selectedId ? 'is-selected' : ''}
              style={{ ['--kind' as string]: KIND_COLOR[t.kind] }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(t.id);
              }}
            >
              <td className="df-list-name" title={t.name}>
                {t.name}
              </td>
              <td>
                <span className="df-chip">
                  <i />
                  {t.status || KIND_LABEL[t.kind]}
                </span>
              </td>
              <td>{t.owner}</td>
              <td className="df-date">{t.dateText}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
