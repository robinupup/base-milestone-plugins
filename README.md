# 飞书多维表格 · 仪表盘里程碑插件

仪表盘自定义插件基于《多维表格 - 仪表盘插件 - 开发指南》开发(React + Vite + TypeScript + Semi UI)。

| 插件 | 目录 | 作用 |
|---|---|---|
| 里程碑总览 | `milestone-overview/` | 一张卡片同时显示带里程碑的整体进度条,以及下一个里程碑(日期、名称、剩余天数);格子很小时自动收成进度条 + 一行下一个里程碑 |
| 依赖关系流程图 | `dependency-flow/`、`dependency-flow-view/` | 按关联字段自动画流程图;可作为仪表盘插件,也可打包成数据表视图插件 |

共用代码在 `shared/`(状态机、取数、里程碑解析、i18n、配置表单组件)。

## 表格数据约定

里程碑直接来自甘特图所在的任务表(仪表盘插件读不到甘特视图的设置,只能读底层表):

- 一个**里程碑标记字段**:勾选框,或"类型"单选。在配置里选出哪些值代表"里程碑"。
- 一个**日期字段**(甘特图的结束日期即可)和一个**名称字段**。
- 一个**状态字段**,并指定哪些值代表"已完成"。插件 2 的状态字段可选,不选时过期的里程碑视为已完成。

在甘特图里新增一行并标记为里程碑,里程碑总览会立刻显示出来。

> 数据由仪表盘服务端聚合(按字段分组 + 计数),不会把全量记录拉到前端。记录特别多时,"名称字段"会让分组变多,必要时在表里用视图或筛选缩小范围。

## 本地开发与调试

```bash
npm install
npm run dev:overview   # http://localhost:5173(端口被占用时 vite 会自动换)
npm test               # 里程碑解析 / 日期计算的单元测试
```

**用模拟数据看效果**(不依赖飞书):在地址后加 `?mock&state=...`

- `state=Create | Config | View | FullScreen`:四种仪表盘状态
- `theme=DARK`、`empty=1`(没有里程碑)、`lang=en | ja`
- 在 `Create` 里选好字段点"确定",再切到 `state=View` 就能看到保存后的展示效果

**在真实多维表格里调试**:打开任意仪表盘 → 添加组件 → 更多 → 添加自定义插件 → 填入运行地址(例如 `http://localhost:5173`)。

## 部署

插件都是纯静态前端,`vite.config.ts` 里的 `base: './'` 不能删。

```bash
npm run build
# milestone-overview/dist 即为静态产物,任意静态托管都可以
```

- **GitHub Pages**:推送到 GitHub 的 `main` 分支,仓库里启用 Pages(Source 选 GitHub Actions),`.github/workflows/pages.yml` 会发布到 `/overview/` 和 `/flow/`。
- **Vercel**:建项目,Root Directory 选 `milestone-overview`,并打开"Include source files outside of the Root Directory",因为共用了 `shared/`。
- 拿到固定地址后,回到仪表盘用"添加自定义插件"填入。

## 发布到插件市场(可选)

按指南的 Check list 准备:插件名、代码地址、简短描述、类别(效率)、图标、20 秒内的录屏。中、日、英三语文案已在 `shared/src/i18n.ts`。
