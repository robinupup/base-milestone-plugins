// 本地调试用的模拟数据: http://localhost:5175/?mock
import type { RawRecord } from '../../shared/src/records.ts';
import type { FieldInfo, TableInfo } from '@shared';

export const MOCK_TABLES: TableInfo[] = [{ id: 'tbl_mock', name: '项目任务表' }];
export const MOCK_FIELDS: FieldInfo[] = [
  { id: 'f_name', name: '任务项', type: 1 },
  { id: 'f_status', name: '进展', type: 3 },
  { id: 'f_end', name: '完成时间', type: 5 },
  { id: 'f_owner', name: '负责人', type: 11 },
  { id: 'f_dep', name: '前置依赖', type: 21 },
];

const DAY = 24 * 3600 * 1000;
const base = new Date();
base.setHours(0, 0, 0, 0);

// [id, 名称, 状态, 距今天数, 负责人, 前置依赖]
const rows: Array<[string, string, string, number, string, string[]]> = [
  ['r1', '需求评审：场景、工艺流程、验收指标', '验收通过', -40, '王雪', []],
  ['r2', '场地可行性评估', '验收通过', -34, '佘润东', ['r1']],
  ['r3', '物料清单确认', '验收通过', -30, '王雪', ['r1']],
  ['r4', '本体 + 夹爪采购', '进行中', -3, '李然', ['r3']],
  ['r5', '测试场网络、服务器部署', '进行中', 4, '佘润东', ['r2']],
  ['r6', '场地准备：遥操室和工位', '待开启', 12, '陈默', ['r2']],
  ['r7', '本体组装与改装', '待开启', 14, '李然', ['r4']],
  ['r8', '🌟必保时间点🌟R0 本体到位（5 台）', '待开启', 18, '李然', ['r4', 'r6']],
  ['r9', '标定方案锁定', '待开启', 20, '周行', ['r5']],
  ['r10', '感知模型训练：10 个 RL 模型', '待开启', 28, '周行', ['r8', 'r9']],
  ['r11', '系统集成与联调', '依赖项目未完成', 32, '陈默', ['r7', 'r5']],
  ['r12', '部署测试', '待开启', 40, '陈默', ['r11', 'r10']],
  ['r13', '🌟必保时间点🌟东莞 5 台 R0 作业验收', '待开启', 48, '王雪', ['r12']],
  ['r14', '上海厂部署需求确认', '待开启', 50, '佘润东', ['r13']],
  ['r15', '产线改造与网络布设', '待开启', 62, '陈默', ['r14']],
  ['r16', '24 台 R0.7 交付', '待开启', 70, '李然', ['r13']],
  ['r17', '🌟必保时间点🌟R0.7 项目验收', '待开启', 85, '王雪', ['r16', 'r15']],
  ['r18', '运营交付与持续压测', '待开启', 100, '周行', ['r17']],
  ['r19', '风险复盘（无依赖）', '待开启', 10, '王雪', []],
];

export const MOCK_RECORDS: RawRecord[] = rows.map(([id, name, status, off, owner, deps]) => ({
  recordId: id,
  fields: {
    f_name: [{ type: 'text', text: name }],
    f_status: { id: status, text: status },
    f_end: base.getTime() + off * DAY,
    f_owner: [{ id: owner, name: owner }],
    f_dep: deps.length ? { recordIds: deps, tableId: 'tbl_mock', text: deps.join(','), type: 'text' } : null,
  },
}));
