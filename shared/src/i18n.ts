// 轻量 i18n:中文为主,英文、日文同步提供(发布到插件市场需要三语)。
type Dict = Record<string, string>;

const zh: Dict = {
  'common.confirm': '确定',
  'common.table': '数据表',
  'common.selectTable': '请选择数据表',
  'common.selectField': '请选择字段',
  'common.selectValue': '请选择值',
  'common.search': '搜索',
  'common.optional': '(可选)',
  'common.loading': '加载中…',
  'common.error': '加载失败',
  'common.notConfigured': '请先在配置中选择数据表和字段',
  'common.saving': '保存中…',
  'common.saved': '已保存',
  'field.status': '状态字段',
  'field.done': '"已完成"对应的值',
  'field.flag': '里程碑标记字段',
  'field.flagValues': '"里程碑"对应的值',
  'field.name': '里程碑名称字段',
  'field.date': '里程碑日期字段',
  'field.hintFlag': '用来区分普通任务和里程碑的字段,例如"类型"或勾选框',
  'field.noValues': '该字段暂无数据',
  'progress.title': '整体进度',
  'progress.tasksDone': '已完成 {done} / {total} 项',
  'progress.manual': '手动里程碑',
  'progress.addManual': '添加节点',
  'progress.manualName': '节点名称',
  'progress.manualDate': '日期',
  'progress.manualDone': '已完成',
  'progress.remove': '删除',
  'progress.showPercent': '显示百分比',
  'progress.showDates': '显示里程碑日期',
  'progress.empty': '暂无里程碑',
  'progress.milestoneDone': '已完成',
  'progress.milestonePending': '未完成',
  'next.title': '下一个里程碑',
  'next.daysLeft': '还有 {n} 天',
  'next.today': '就是今天',
  'next.none': '暂无后续里程碑',
  'next.overdue': '另有 {n} 个里程碑已逾期未完成',
};

const en: Dict = {
  'common.confirm': 'Confirm',
  'common.table': 'Table',
  'common.selectTable': 'Select a table',
  'common.selectField': 'Select a field',
  'common.selectValue': 'Select values',
  'common.search': 'Search',
  'common.optional': '(optional)',
  'common.loading': 'Loading…',
  'common.error': 'Failed to load',
  'common.notConfigured': 'Pick a table and fields in the settings first',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'field.status': 'Status field',
  'field.done': 'Values meaning "Done"',
  'field.flag': 'Milestone flag field',
  'field.flagValues': 'Values meaning "Milestone"',
  'field.name': 'Milestone name field',
  'field.date': 'Milestone date field',
  'field.hintFlag': 'A field that tells milestones from tasks, e.g. "Type" or a checkbox',
  'field.noValues': 'No data in this field yet',
  'progress.title': 'Overall progress',
  'progress.tasksDone': '{done} / {total} done',
  'progress.manual': 'Manual milestones',
  'progress.addManual': 'Add milestone',
  'progress.manualName': 'Name',
  'progress.manualDate': 'Date',
  'progress.manualDone': 'Done',
  'progress.remove': 'Remove',
  'progress.showPercent': 'Show percentage',
  'progress.showDates': 'Show milestone dates',
  'progress.empty': 'No milestones yet',
  'progress.milestoneDone': 'Done',
  'progress.milestonePending': 'Pending',
  'next.title': 'Next milestone',
  'next.daysLeft': '{n} days left',
  'next.today': 'Today',
  'next.none': 'No upcoming milestone',
  'next.overdue': '{n} more milestone(s) overdue',
};

const ja: Dict = {
  'common.confirm': '確定',
  'common.table': 'テーブル',
  'common.selectTable': 'テーブルを選択',
  'common.selectField': 'フィールドを選択',
  'common.selectValue': '値を選択',
  'common.search': '検索',
  'common.optional': '(任意)',
  'common.loading': '読み込み中…',
  'common.error': '読み込みに失敗しました',
  'common.notConfigured': '先に設定でテーブルとフィールドを選択してください',
  'common.saving': '保存中…',
  'common.saved': '保存しました',
  'field.status': 'ステータスフィールド',
  'field.done': '「完了」に該当する値',
  'field.flag': 'マイルストーン判定フィールド',
  'field.flagValues': '「マイルストーン」に該当する値',
  'field.name': 'マイルストーン名フィールド',
  'field.date': 'マイルストーン日付フィールド',
  'field.hintFlag': 'タスクとマイルストーンを区別するフィールド(例: 種類、チェックボックス)',
  'field.noValues': 'このフィールドにはまだデータがありません',
  'progress.title': '全体の進捗',
  'progress.tasksDone': '{done} / {total} 件完了',
  'progress.manual': '手動マイルストーン',
  'progress.addManual': 'マイルストーンを追加',
  'progress.manualName': '名称',
  'progress.manualDate': '日付',
  'progress.manualDone': '完了',
  'progress.remove': '削除',
  'progress.showPercent': 'パーセントを表示',
  'progress.showDates': 'マイルストーンの日付を表示',
  'progress.empty': 'マイルストーンはまだありません',
  'progress.milestoneDone': '完了',
  'progress.milestonePending': '未完了',
  'next.title': '次のマイルストーン',
  'next.daysLeft': 'あと {n} 日',
  'next.today': '今日',
  'next.none': '今後のマイルストーンはありません',
  'next.overdue': '期限切れのマイルストーンが他に {n} 件あります',
};

const dicts: Record<string, Dict> = { zh, en, ja };

export function detectLang(): 'zh' | 'en' | 'ja' {
  const q = new URLSearchParams(window.location.search).get('lang');
  const raw = (q || navigator.language || 'zh').toLowerCase();
  if (raw.startsWith('ja')) return 'ja';
  if (raw.startsWith('en')) return 'en';
  return 'zh';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const dict = dicts[detectLang()];
  let s = dict[key] ?? zh[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
