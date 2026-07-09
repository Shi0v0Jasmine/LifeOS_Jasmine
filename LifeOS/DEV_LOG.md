# Life OS — 开发日志（Dev Log）

> **日期**: 2026-07-08  
> **当前版本**: v1.2（开发中）
> **最后更新**: 【2026-07-09 10:35】
> **项目路径**: `D:\FUN_VibeCoding\LifeOS\LifeOS\`  
> **PRD**: `D:\FUN_VibeCoding\LifeOS\PRD_LifeOS.md`

---

## 1. 项目概览

### 1.1 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3.4.21 CDN 全局版 (`vue.global.js`) |
| 构建工具 | **无** — 纯 HTML/CSS/JS，无 webpack/vite |
| 后端服务 | Node.js + Express（可选本机后端） |
| 运行方式 | 推荐 `node server.js` → `http://localhost:3000`；也支持 `file://` 或 Python 静态服务器降级 |
| 样式 | 纯 CSS + CSS 变量（水彩/霍格沃茨主题） |
| 数据存储 | IndexedDB（`LifeOSDB`，10 个 Object Store）+ 本机 JSON 文件（`LifeOS/data/lifeos-db.json`） |
| 模块系统 | **无 ES Module** — 全局 IIFE + `window.LifeOS` |

### 1.2 核心约束（⚠️ 必须遵守）

1. **禁用 `import/export`** — 所有 JS 用 `<script src="">` 引入
2. **禁用 Vue Router history 模式** — `file://` 不支持，用 `href="xxx.html"` 切换页面
3. **禁用 ES Module `<script type="module">`** — 浏览器安全策略禁止本地 import
4. **日期格式统一** — 全程使用 `YYYY-MM-DD` 字符串，避免 `new Date()` 时区问题
5. **头像存储** — base64 压缩（400px, JPEG 0.8）存入 IndexedDB
6. **所有数据本地存储** — 不上传外部服务器；本机后端只写入本地 JSON 文件

---

## 2. 项目结构

```
LifeOS/
├── index.html          # Dashboard 首页 (29KB)
├── timeline.html       # 时间轴 (72KB) ← v1.1 改动最多，当前有 bug
├── tasks.html          # 任务管理 (34KB)
├── habits.html         # 习惯打卡 (38KB) ← v1.1 新增日期切换+补打卡
├── review.html         # 每日回顾 (40KB) ← v1.1 GRAI 分析增强
├── learning.html       # 学习日记 (41KB)
├── characters.html     # 角色库 (21KB)
├── settings.html       # 设置 (29KB)
├── test.html           # 测试页面 (2KB)
├── manifest.webmanifest # PWA 安装配置
├── sw.js               # Service Worker 离线缓存
├── ../server.js        # v1.2 本机 Express 后端
├── ../package.json     # Node 启动配置
├── ../tests/           # 数据层回归测试
├── css/
│   └── style.css       # 全局样式 (40KB)
├── js/
│   ├── core.js         # 数据层：DAO + 预置角色 (79KB)
│   ├── pwa.js          # PWA 注册与安装提示状态
│   ├── db.js           # IndexedDB 底层封装 (6KB)
│   ├── utils.js        # 工具函数 (4KB)
│   └── components/
│       └── Sidebar.js  # 侧边栏组件
├── guide/              # 开发指南 step-00 ~ step-10
└── ../PRD_LifeOS.md    # 产品需求文档
```

---

## 3. 功能完成状态

### ✅ v1.0 已完成（9 个页面全部可用）

| 页面 | 核心功能 | 状态 |
|------|---------|------|
| **Dashboard** | 5 张统计卡片、今日时间轴预览、月历视图、快速操作 | ✅ |
| **时间轴** | 预计/实际双列、点击创建事件、计时器自动记录、弹窗编辑 | ✅ |
| **任务** | 卡片列表、四象限自动分类、倒计时进度条、完成标记 | ✅ |
| **习惯** | 打卡切换、连续天数 streak、月历热力图、角色激励 | ✅ |
| **回顾** | DID/GOOD/BAD/THOUGHTS 四栏、情绪天气、GRAI 分析 | ✅ |
| **学习** | 技能树 CRUD、XP 升级系统、学习笔记、统计面板 | ✅ |
| **角色库** | 50+ 预置角色、头像上传、台词编辑、优先级排序 | ✅ |
| **设置** | API 配置、数据导入/导出（merge/overwrite）、数据库重置 | ✅ |

### ✅ v1.1 已完成（本次对话实现）

| 功能 | 文件 | 说明 |
|------|------|------|
| **日期导航** | timeline.html | ‹ › 切换 + 日历选择器 + "回到今天" |
| **按月总览** | timeline.html | 月视图日历，点击日期跳转日视图 |
| **循环事件** | timeline.html + core.js | 每天/每周/每月重复，支持自定义星期 |
| **番茄钟** | timeline.html | 25min 专注计时，进度条，完成后弹窗 |
| **番茄钟 XP 分配** | timeline.html | 完成弹窗选择技能 + XP 数值，自动 `addXP()` |
| **时间统计图表** | timeline.html | 日/周/月饼图 + 堆叠条形图，未记录时段控制 |
| **习惯日期切换** | habits.html | 任意日期查看 + 补打卡 |
| **GRAI 数据驱动分析** | review.html | 拉取当日任务/习惯/时间轴数据生成分析 |
| **重叠事件并排** | timeline.html | 类似 Toggl Track，贪心算法分配列 |

### ✅ v1.1 TDD 收尾修复【2026-07-08 10:53】

| 修复项 | 文件 | 说明 |
|------|------|------|
| 循环事件边界 | core.js | `Timeline.getByDate()` 不再把循环事件展开到开始日期之前；结束日期之后仍跳过 |
| 循环状态同步 | core.js | `Timeline.update()` 在 `repeatRule` 变化时同步维护 `isRecurring`，避免取消重复后仍继续展开 |
| 习惯 streak 计算 | core.js | `Habit.getStreak()` 忽略未来记录，并在今天明确未完成时返回 0 |
| 回顾保存元数据 | core.js | `Review.save()` 二次保存保留原始 `createdAt`，只刷新 `updatedAt` |
| 数据层回归测试 | tests/core-data.test.js | 新增纯 Node + 内存 IndexedDB 测试，覆盖上述数据层风险 |

### ✅ v1.1 任务管理重复显示修复【2026-07-08 15:37】

| 修复项 | 文件 | 说明 |
|------|------|------|
| 已完成筛选入口统一 | tasks.html | 删除「四象限中显示已完成任务」复选框，保留状态筛选里的「已完成」，四象限显示直接服从状态筛选 |
| 循环任务完成后重复显示 | tasks.html | 只从过去日期的未完成循环任务补今天副本，避免完成后生成的明日副本反向补成今日重复任务；同日同循环任务显示时去重，优先展示已完成项 |
| 撤回完成 | core.js + tasks.html | 完成按钮支持「撤回完成」提示和键盘触发；撤回循环任务完成时移除本次完成自动生成的下一日副本 |
| 回归测试 | tests/core-data.test.js | 新增循环任务完成/撤回测试，覆盖生成下一日副本与撤回删除副本 |
| 验证 | 本地服务 + Browser | `node tests\core-data.test.js` 全部通过；Browser 验证完成后今日只显示 1 张完成卡，测试数据已清理 |

### ✅ v1.2 本机后端持久化验证【2026-07-08 15:44】

| 项目 | 文件 | 说明 |
|------|------|------|
| Express 后端 | server.js | 静态托管 `LifeOS/`，提供 `/api/db`、`/api/db/:store`、`/api/status`、`/api/backups` |
| JSON 文件持久化 | LifeOS/data/lifeos-db.json | 后端启动时自动初始化；保存全量数据库快照；已加入 `.gitignore`，避免提交用户数据 |
| 自动备份 | LifeOS/data/backups/ | 写入前自动备份，最多保留最近 20 份；目录已加入 `.gitignore` |
| 前端同步 | LifeOS/js/core.js | `BackendSync` 在 HTTP(S) 环境下启用，监听 `db.put()` / `db.delete()` 并 debounce 保存到后端 |
| 启动脚本 | start.bat | 优先使用 Node.js 启动 `http://localhost:3000`；无 Node.js 时降级为 Python 静态服务器 |
| 验证 | API + 静态页面 | `/api/status`、`/api/db`、`POST /api/db`、`GET /api/db/timeline`、`/index.html` 均验证通过；测试数据已清理 |

### ✅ v1.2 PRD 功能补全【2026-07-09 10:35】

| 功能 | 文件 | 说明 |
|------|------|------|
| F-006 PWA 配置 | `manifest.webmanifest` + `sw.js` + `js/pwa.js` + 全部 HTML | 新增 PWA manifest、SVG app icon、Service Worker 静态缓存、后端 GET 缓存、CDN Vue 运行时缓存；`file://` 下自动降级不注册 |
| F-021 拖拽任务到时间轴 | `timeline.html` + `css/style.css` | 时间轴日视图新增当前日期未完成任务条；任务卡片可拖到预计列 30 分钟时间格，自动创建标题一致、关联 `taskId` 的预计事件 |
| F-084 通用 AI 客户端封装 | `js/core.js` + `settings.html` | 新增 `LifeOS.AIClient`，统一读取 Base URL/API Key/模型，封装 OpenAI-compatible `/chat/completions` 请求、错误归一、重试、超时、文本提取和调用历史；设置页测试连接改为调用该客户端 |
| 回归测试 | `tests/core-data.test.js` | 新增 AIClient 请求格式、调用历史、重试与缺配置校验测试；数据层测试总数 8 项 |
| 验证 | Node + 本地服务 + Browser | `node --check` 覆盖核心/PWA/SW；`node tests\core-data.test.js` 8 项通过；Browser 验证时间轴页渲染任务拖拽条、manifest 和 `js/pwa.js` 已挂载 |

### ✅ v1.1 任务管理「撤回完成」UI 显性化【2026-07-08 16:00】

| 修复项 | 文件 | 说明 |
|------|------|------|
| 卡片右侧动作按钮 | tasks.html | 已完成任务显示红色「撤回完成」标签按钮；未完成任务显示绿色「完成」按钮；点击均触发确认弹窗 |
| 弹窗状态条 | tasks.html | 编辑弹窗顶部新增状态信息：「当前状态」徽章（已完成/未完成）、完成时间戳；已完成任务额外显示「撤回完成」按钮 |
| 弹窗撤回联动 | tasks.html | 点击弹窗内「撤回完成」→ 确认后自动关闭弹窗，刷新页面数据；依赖 `toggleComplete` 返回 `true`/`false` 控制流 |
| 辅助方法 | tasks.html | 新增 `undoCompleteFromModal`、`formatDate` 方法；暴露到 `return` 供模板使用 |
| 样式系统 | css/style.css | 新增 `.task-card-actions`、`.task-action-btn`（complete/undo 双态）、`.task-status-bar`、`.status-badge` 等 20+ 条规则，延续水彩主题 |
| 验证 | 本地服务 + Browser + 测试 | `node tests\core-data.test.js` 5 项全部通过；Browser 验证卡片右侧按钮、弹窗状态条、确认弹窗、完成率刷新均正常；测试数据已清理 |

### ⬜ v1.1 待验证/可能有 bug

| 功能 | 文件 | 状态 | 备注 |
|------|------|------|------|
| 时间轴事件保存 | timeline.html | ⚠️ 待验证 | 已加 `JSON.parse(JSON.stringify())` 深拷贝 |
| 循环事件自动展开 | core.js | ✅ 数据层已测 | 已覆盖开始日前不展开、结束日后不展开、取消重复后不再展开 |
| GRAI 分析生成 | review.html | ⚠️ 待验证 | 已重写为数据驱动版 |
| 每日回顾保存 | review.html | ✅ 数据层已测 | `Review.save()` 保留 `createdAt` 并更新 `updatedAt` |
| 番茄钟弹窗关闭 | timeline.html | ⚠️ 待验证 | 用户报告 Claude 已修复 |

### ⬜ v1.1 已知未实现

| 功能 | 说明 |
|------|------|
| 时间微调 ±15min | F-022 |
| 任务与时间轴联动 | F-027，任务完成同步更新时间轴 |
| 四象限散点图 | F-032，ECharts |
| 经历日记 AI 生成 | F-065，需 LLM API |
| 技能树可视化 | F-079，Canvas/SVG 树状图 |
| 饮食 AI 分析 | F-049，多模态图片识别 |

---

## 4. 数据层 API（`window.LifeOS`）

### 4.1 数据库初始化

```javascript
await LifeOS.Database.init(); // 幂等，多次调用返回同一 Promise
```

### 4.2 各模块 Store

| Store | 关键方法 | 说明 |
|-------|---------|------|
| `LifeOS.Timeline` | `create(event)`, `update(id, updates)`, `delete(id)`, `getByDate(date)`, `getAll()` | 时间轴事件，支持循环事件自动展开 |
| `LifeOS.Task` | `create(task)`, `update(id, updates)`, `toggleComplete(id)`, `delete(id)`, `getByDate(date)`, `getTodayTasks()` | 任务管理，自动四象限分类 |
| `LifeOS.Habit` | `create(habit)`, `update(id, updates)`, `delete(id)`, `getAll()`, `checkIn(habitId, date, record)`, `getStreak(habitId)` | 习惯打卡 |
| `LifeOS.Review` | `get(date)`, `save(date, content)`, `getAll()` | 每日回顾，key = date |
| `LifeOS.Skill` | `create(skill)`, `update(id, updates)`, `delete(id)`, `getAll()`, `addXP(id, amount)`, `addNote(note)` | 技能树，XP 升级算法 1.5x |
| `LifeOS.Character` | `create(char)`, `update(id, updates)`, `delete(id)`, `getAll()`, `getByPriority()`, `importPresetData()` | 角色库，50+ 预置数据 |
| `LifeOS.Settings` | `get(key, defaultValue)`, `set(key, value)`, `getAll()` | key-value 配置存储 |
| `LifeOS.AIClient` | `chat(options)`, `complete(prompt, options)`, `testConnection(overrides)`, `extractText(response)`, `getConfig(overrides)` | 通用 OpenAI-compatible AI 客户端 |
| `LifeOS.ExportImport` | `export()`, `importFile(file, strategy)` | strategy: 'merge' / 'overwrite' |

### 4.3 工具函数（`LifeOS.Utils`）

```javascript
LifeOS.Utils.generateId()           // UUID 或时间戳+随机数
LifeOS.Utils.formatDate(date)       // YYYY-MM-DD
LifeOS.Utils.formatTime(date)       // HH:mm
LifeOS.Utils.now()                  // ISO 字符串
LifeOS.Utils.daysBetween(d1, d2)    // 天数差
LifeOS.Utils.deepClone(obj)         // structuredClone 或 JSON
LifeOS.Utils.calculateQuadrant(deadline, priority)  // 四象限自动分类
LifeOS.Utils.markdownToHtml(md)     // 简易 Markdown 转 HTML
```

### 4.4 IndexedDB Schema（10 个 Object Store）

| Store | Key | Indexes |
|-------|-----|---------|
| `timeline` | `id` | `date`, `type`, `taskId` |
| `tasks` | `id` | `quadrant`, `completed`, `deadline`, `date` |
| `habits` | `id` | `category` |
| `habitRecords` | `id` (habitId_date) | `habitId`, `date` |
| `reviews` | `date` | — |
| `skills` | `id` | `parentId` |
| `notes` | `id` | `skillId`, `date` |
| `characters` | `id` | `series` |
| `settings` | `key` | — |
| `moments` | `id` | `date`, `hashtag` (multiEntry) |

---

## 5. v1.1 关键代码变更记录

### 5.1 `core.js` 变更

| 位置 | 变更 | 说明 |
|------|------|------|
| `TimelineStore.create()` | 新增 `repeatRule`, `repeatEndDate`, `isRecurring` 字段 | 支持循环事件 |
| `TimelineStore.update()` | 同步 `isRecurring` | `repeatRule` 变更时同步更新循环状态 |
| `TimelineStore.getByDate()` | 新增重复事件自动展开逻辑 | 检测 `isRecurring`，匹配规则后生成虚拟实例（虚拟 ID = `originalId_date`），且不向开始日期前展开 |
| `TaskStore.create()` | 保留传入 `id` 与循环实例来源字段 | 循环任务副本可记录 `generatedFromTaskId` / `recurringInstanceDate` |
| `TaskStore.toggleComplete()` | 支持撤回完成清理副本 | 完成循环任务时标记下一日副本来源；撤回完成时删除本次生成的下一日待办副本 |
| `HabitStore.getStreak()` | 修正连续打卡计算 | 忽略未来记录，今天明确未完成时中断 streak |
| `ReviewStore.save()` | 保留创建时间 | 二次保存保留已有 `createdAt` |
| `Database.reset()` | 新增方法 | 清空所有 Store 数据，保留结构 |
| `BackendSync` | 新增后端同步 | HTTP(S) 环境下连接本机 Express API，支持启动恢复与变更保存 |
| `AIClient` | 新增通用 AI 客户端 | 统一处理 OpenAI-compatible 请求、错误、重试、超时、历史记录和文本提取 |

### 5.5 测试记录【2026-07-08 10:53】

```bash
node tests\core-data.test.js
```

结果：4 项数据层回归测试全部通过。

渲染健康检查：通过本地服务打开 `http://localhost:8080/timeline.html`，确认页面标题为 `Life OS — 时间轴`，日视图正常显示，控制台无 error/warn。

### 5.6 测试记录【2026-07-08 15:37】

```bash
node --check LifeOS/js/core.js
node tests\core-data.test.js
```

结果：5 项数据层回归测试全部通过。Browser 验证 `http://localhost:3000/tasks.html`：长期循环任务完成后今日只显示 1 张完成卡，完成按钮提示为「撤回完成」；QA 数据已从后端 JSON 清理。

### 5.7 后端验证记录【2026-07-08 15:44】

```bash
node tests\core-data.test.js
node server.js
```

验证结果：
- `GET /api/status` 返回 `ok: true`
- `GET /api/db` 返回完整数据库结构
- `POST /api/db` 后 `GET /api/db/timeline` 可读回写入记录
- `GET /index.html` 返回 `Life OS — 仪表盘`，包含 Vue 与 `js/core.js`
- 验证过程中生成的 `lifeos-db.json` 与备份文件已清理；运行时生成的数据文件由 `.gitignore` 排除

### 5.8 PRD 功能补全测试记录【2026-07-09 10:35】

```bash
node --check LifeOS\js\core.js
node --check LifeOS\js\pwa.js
node --check LifeOS\sw.js
node tests\core-data.test.js
node server.js
```

验证结果：
- 8 项数据层/AIClient 回归测试全部通过
- `GET /api/status`、`GET /manifest.webmanifest`、`GET /sw.js` 均返回 200
- Browser 打开 `http://localhost:3000/timeline.html`，页面标题正常，任务拖拽条渲染，双列时间格共 96 个
- 自动化坐标拖拽未能触发浏览器原生 HTML5 Drag & Drop，已用源码契约检查确认拖拽源、drop 事件、DataTransfer payload 与 `taskId` 创建字段均存在

### 5.2 `timeline.html` 变更（最复杂，当前有 bug）

| 变更 | 说明 |
|------|------|
| 日期导航栏 | `currentDate` ref + ‹ › 按钮 + 日历 input |
| 月视图 | `monthDays` computed + `loadMonthData()` |
| 统计视图 | 饼图（CSS conic-gradient）+ 堆叠条形图 |
| 循环事件弹窗 | 重复规则选择器（每天/每周/每月）+ 星期多选 + 结束日期 |
| 番茄钟 | `timerMode` ref（normal/pomodoro）+ 25min 计时 + 进度条 |
| 番茄钟 XP 弹窗 | 技能选择 + XP 数值（25/50/100/自定义） |
| 重叠事件并排 | `assignOverlapColumns()` 贪心算法 + CSS 变量 `--event-left`/`--event-width` |
| 日统计条 | 5 张卡片（预计项/实际项/总时长/主要类别/完成率） |
| 拖拽任务排期 | 当前日期未完成任务条 + HTML5 Drag & Drop 到预计列时间格 |

### 5.3 `habits.html` 变更

| 变更 | 说明 |
|------|------|
| 日期导航栏 | 同 timeline.html 风格，`< ›` + 日历选择器 |
| 补打卡 | 非今天显示"补打卡"badge，点击习惯正常打卡 |
| 月历联动 | 点击热力图日期跳转选中日期 |
| 动态标签 | "今日完成" ↔ "该日完成" |

### 5.4 `review.html` 变更

| 变更 | 说明 |
|------|------|
| GRAI 分析增强 | 拉取当日任务/习惯/时间轴实际数据，生成量化分析和具体建议 |
| 保存修复 | `JSON.parse(JSON.stringify())` 深拷贝去除 Vue Proxy |

---

## 6. 已知问题与注意事项

### ⚠️ 高频问题

1. **浏览器缓存** — `file://` 下浏览器会缓存 HTML/JS/CSS，修改后必须 **Ctrl+F5 强制刷新**
2. **Vue Proxy 序列化** — IndexedDB `put()` 不能直接存 Vue 响应式对象，必须用 `JSON.parse(JSON.stringify())` 深拷贝
3. **`file://` 编码问题** — 确保 `<meta charset="UTF-8">` 在 `<head>` 最前面，否则中文可能乱码
4. **PowerShell npm 脚本策略** — Windows PowerShell 可能拦截 `npm.ps1`，可使用 `node server.js` 或 `npm.cmd start`

### ⚠️ 当前潜在 bug

| 问题 | 位置 | 严重程度 | 说明 |
|------|------|---------|------|
| 循环事件虚拟实例编辑 | timeline.html | 中 | 虚拟实例 ID 格式 `originalId_date`，编辑时应提取原始 ID 或创建新事件 |
| 统计视图数据刷新 | timeline.html | 低 | `statsCache` 按 period 缓存，切换日期时未完全清空 |
| 番茄钟弹窗状态残留 | timeline.html | 低 | `onMounted` 已加 `showPomodoroXPDialog.value = false`，但仍需验证 |
| 时间轴事件图片 | timeline.html | 低 | `images` 字段已存在于数据模型，但 UI 未展示 |
| 后端恢复竞态 | core.js | 中 | `BackendSync.restore()` 在 `Database.init()` 后异步执行，页面可能先渲染空 IndexedDB，恢复后未统一通知页面刷新 |
| 本地/后端冲突策略 | core.js + server.js | 中 | 当前 merge 按 id/key/date 覆盖，尚未基于 `updatedAt` 做冲突决策 |
| 后端 API 鉴权 | server.js | 低 | 当前定位本机使用，无鉴权；若暴露到局域网/公网需加鉴权和更严格校验 |

### ⚠️ 开发注意事项

1. **每个页面的 Sidebar 组件** — 当前是每个 HTML 内联定义的，非共享组件。修改 Sidebar 需要改 8 个文件
2. **CSS 变量系统** — 所有颜色用 `var(--color-*)`，不要硬编码。关键变量在 `style.css` `:root` 中定义
3. **响应式断点** — 移动端适配用 `@media (max-width: 768px)`
4. **日期处理** — 永远用 `LifeOS.Utils.formatDate()`，不要手动 `new Date().toISOString().slice(0,10)`（时区问题）

---

## 7. 下一个 Agent 建议

### 如果继续 v1.1 收尾

1. **全面测试时间轴** — 事件创建/编辑/删除/保存、循环事件展开、重叠并排显示、番茄钟完整流程
2. **验证 review.html** — GRAI 分析生成、保存回顾、历史加载
3. **修复任何发现的 bug** — 使用浏览器 DevTools Console 查看 JS 错误

### 如果继续 v1.2 后端收尾

1. **解决 BackendSync 恢复竞态** — 恢复完成后触发页面级 reload 或事件通知，让 UI 重读数据
2. **增加冲突策略** — merge 时优先使用 `updatedAt` 较新的记录，避免后端旧数据覆盖本地新数据
3. **补充 API 校验** — 限制 store 白名单、校验备份文件名、明确错误码
4. **补齐文档与启动体验** — README/PRD/DEV_LOG 已补充，后续可加入一键 smoke test

### 如果继续 v1.2 功能补全收尾

1. **接入 AI 使用点** — 将 GRAI 分析、AI 任务拆解、学习关键词提取逐步改为调用 `LifeOS.AIClient`
2. **补强拖拽自动化测试** — 引入能稳定触发 HTML5 Drag & Drop 的浏览器测试工具或专用测试页
3. **PWA 离线数据策略** — 目前缓存静态资源和后端 GET 快照；后续可补最近 30 天数据的显式预热策略

### 如果开始 v1.3 / v2.0 开发

优先级从高到低：

1. **AI 判定 XP 分配** — 番茄钟完成后分析复盘内容，LLM 评估难度自动分配 XP（需配置 AI API）
2. **技能树可视化** — Canvas/SVG 树状图 + 星图模式（F-079）
3. **经历日记 AI 生成** — 基于问答自动整理 Markdown 日记（F-065）
4. **情绪天气月历** — 日历网格展示每日情绪图标（F-067）
5. **多角色对话链** — 85% 完成率触发 2-3 角色轮流发言（F-038）
6. **四象限散点图** — ECharts 可视化坐标轴（F-032）

### 快速上手检查清单

```
□ 打开浏览器 DevTools → Console，确认无 JS 错误
□ 测试每个页面的基本功能是否正常
□ 检查 Ctrl+F5 强制刷新后是否加载最新代码
□ 确认所有 `{{ }}` 插值正常解析（无原始文本显示）
□ 确认 IndexedDB 数据持久（刷新后数据不丢失）
```

---

## 8. 参考文档

| 文档 | 路径 |
|------|------|
| PRD | `D:\FUN_VibeCoding\LifeOS\PRD_LifeOS.md` |
| Bug Report | `D:\FUN_VibeCoding\LifeOS\LifeOS\BUG_REPORT_v1.1.md` |
| 开发指南 | `D:\FUN_VibeCoding\LifeOS\LifeOS\guide\step-*.md` |

---

*Generated by Kimi on 2026-07-07*
