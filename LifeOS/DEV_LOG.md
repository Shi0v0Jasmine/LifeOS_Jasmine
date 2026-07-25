# Life OS — 开发日志（Dev Log）

> **日期**: 2026-07-08  
> **当前版本**: v5.2.1（已发布；本章旧记 v1.x，对照见 VERSIONING.md）
> **最后更新**: 【2026-07-25】
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
│   ├── core.js         # 数据层：DAO + 预置角色 (79KB) ← v1.3 升级 DB v3 + 打戳/软删除
│   ├── sync.js         # 多端同步引擎（v1.3 新增，Supabase PostgREST）
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

### ✅ v1.2 子任务管理实现【2026-07-09 14:30】

| 功能 | 文件 | 说明 |
|------|------|------|
| **F-095 子任务管理** | `core.js` + `tasks.html` + `css/style.css` | 子任务作为独立记录，支持独立标题、完成状态、截止日期、备注；基于自身 DDL/priority 计算四象限，无值时回退继承亲任务；DDL ≤ 7 天作为独立卡片显示 |
| **F-096 亲任务与子任务完成联动** | `core.js` + `tasks.html` | 全部子任务完成时弹出确认框，用户确认后同步完成亲任务；亲任务可独立标记完成/撤回 |
| **F-097 子任务时间轴联动** | `core.js` | 子任务完成时自动在时间轴实际列创建事件（标题、当前时间、继承亲任务类别）；撤回完成时删除当日对应事件 |
| **F-098 AI 任务拆解** | `core.js` + `tasks.html` | 任务详情弹窗新增"AI 拆解"按钮，调用 `LifeOS.AIPlanner.breakdownTask`，返回可编辑建议列表，用户勾选后保存为子任务 |
| **F-099 自然语言创建多日任务** | `core.js` + `index.html` + `css/style.css` | 首页 Dashboard 新增自然语言输入面板，支持"三天读完 300 页论文"等输入，AI 生成多日亲任务与可选子任务，预览编辑后一键创建 |
| **F-100 循环任务中的子任务** | `core.js` | 循环亲任务挂载非循环子任务，每日副本复制非循环子任务；循环子任务完成时生成明日副本；删除亲任务时级联删除子任务 |
| **数据库迁移** | `core.js` | IndexedDB 版本从 1 升级到 2，`tasks` store 新增 `parentId`/`isSubtask`/`order`/`note` 字段与索引；`onupgradeneeded` 中遍历旧任务并写入默认值 |
| **新 API** | `core.js` | `LifeOS.Task.getSubtasks`、`createSubtask`、`updateSubtask`、`deleteSubtask`、`toggleSubtaskComplete`、`createTasksFromPlan`；`LifeOS.AIPlanner.breakdownTask`、`createPlanFromNaturalLanguage`；`LifeOS.Utils.parseJSONSafe` |
| **语法/静态检查** | `node --check` | `core.js`、`tasks.html` 内联脚本、`index.html` 内联脚本均通过语法检查 |

### ⬜ v1.2 待验证/可能有 bug

| 功能 | 文件 | 状态 | 备注 |
|------|------|------|------|
| 时间轴事件保存 | timeline.html | ⚠️ 待验证 | 已加 `JSON.parse(JSON.stringify())` 深拷贝 |
| 循环事件自动展开 | core.js | ✅ 数据层已测 | 已覆盖开始日前不展开、结束日后不展开、取消重复后不再展开 |
| GRAI 分析生成 | review.html | ⚠️ 待验证 | 已重写为数据驱动版 |
| 每日回顾保存 | review.html | ✅ 数据层已测 | `Review.save()` 保留 `createdAt` 并更新 `updatedAt` |
| 番茄钟弹窗关闭 | timeline.html | ⚠️ 待验证 | 用户报告 Claude 已修复 |
| 子任务四象限显示 | tasks.html | ⚠️ 待验证 | 需确认 DDL ≤ 7 天子任务正确出现在对应象限 |
| 子任务完成联动提示 | tasks.html | ⚠️ 待验证 | 需确认全部子任务完成后弹窗正常 |
| AI 拆解建议保存 | tasks.html | ⚠️ 待验证 | 需确认勾选 AI 建议后保存为子任务 |
| 自然语言创建多日任务 | index.html | ⚠️ 待验证 | 需确认 AI 配置正常时生成计划并创建任务 |
| 循环任务子任务复制 | core.js | ⚠️ 待验证 | 需确认非循环子任务随每日副本复制 |

### ⬜ v1.1 已知未实现

| 功能 | 说明 |
|------|------|
| 时间微调 ±15min | F-022 |
| 任务与时间轴联动 | F-027，任务完成同步更新时间轴 | 已部分实现：子任务完成自动创建时间轴事件；亲任务完成尚未联动 |
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
| `LifeOS.Task` | `create(task)`, `update(id, updates)`, `toggleComplete(id)`, `delete(id)`, `getSubtasks(parentId)`, `createSubtask(parentId, subtask)`, `updateSubtask(id, updates)`, `deleteSubtask(id)`, `toggleSubtaskComplete(id)`, `createTasksFromPlan(plan)`, `getByDate(date)`, `getTodayTasks()` | 任务管理，自动四象限分类，子任务独立记录 |
| `LifeOS.AIPlanner` | `breakdownTask(title, description)`, `createPlanFromNaturalLanguage(input, generateSubtasks)` | 任务拆解与自然语言规划 |
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
LifeOS.Utils.parseJSONSafe(str, fallback)  // 解析 AI 返回的 JSON（支持 Markdown 代码块）
```

### 4.4 IndexedDB Schema（10 个 Object Store）

| Store | Key | Indexes |
|-------|-----|---------|
| `timeline` | `id` | `date`, `type`, `taskId` |
| `tasks` | `id` | `quadrant`, `completed`, `deadline`, `date`, `parentId`, `isSubtask` |
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
| `TaskStore` | 新增子任务相关方法、循环任务子任务复制、级联删除、完成联动 | 支持 F-095~F-100 |
| `AIPlanner` | 新增对象 | 任务拆解与自然语言规划 |

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
5. **IndexedDB 版本升级** — v1.2 子任务功能将 `LifeOSDB` 版本升级到 2，新增 `parentId`/`isSubtask` 索引；首次打开时会自动迁移旧数据，旧数据不丢失
6. **AI 功能依赖 API 配置** — AI 拆解和自然语言创建任务需要先在 `settings.html` 配置 Base URL、API Key 和模型

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
| 子任务完成率统计 | index.html | 低 | 已过滤 `isSubtask`，但需验证待办任务数、完成率、日历统计均正确排除子任务 |
| 循环子任务副本归属 | core.js | 中 | 循环子任务完成时生成明日副本，需验证 `parentId` 正确指向明日副本 |
| AI 返回解析 | core.js | 低 | `parseJSONSafe` 已处理 Markdown 代码块，但需验证不同模型返回格式 |

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
4. **子任务/AI 功能收尾验证** — 在浏览器中实际测试子任务 CRUD、完成联动、AI 拆解、自然语言创建多日任务、循环任务子任务复制行为
5. **AI 判定 XP 分配** — 番茄钟完成后分析复盘内容，LLM 评估难度自动分配 XP（需配置 AI API）
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
| 多端同步架构设计 | `D:\FUN_VibeCoding\LifeOS\LifeOS\guide\multi-device-sync-design.md` |
| 移动端响应式计划 | `D:\FUN_VibeCoding\LifeOS\LifeOS\guide\mobile-responsive-plan.md` |
| Supabase 建库脚本 | `D:\FUN_VibeCoding\LifeOS\LifeOS\guide\supabase-setup.sql` |
| 版本管理 | `D:\FUN_VibeCoding\LifeOS\LifeOS\VERSIONING.md` |

---

## 9. v1.3 开发记录（2026-07-20）— 多端同步 + 移动端规划

### 9.1 本次目标

让 LifeOS 从"单设备本地应用"升级为"多端同步应用"：电脑（新加坡）/ 手机（国内）/ 任意浏览器均可使用，数据自动同步；国内免 VPN 访问。

### 9.2 平台选型（2026-07 调研核实）

| 决策项 | 结论 | 理由 |
|--------|------|------|
| 静态托管 | **EdgeOne Pages**（备选 CloudBase 静态托管） | Vercel `*.vercel.app` 2021 年起被 DNS 污染国内不可直连；EdgeOne 免备案、免费、国内可流畅访问 |
| 同步后端 | **双后端可切换：CloudBase（国内，默认）+ Supabase（国际）** | 用户基本在国内使用：CloudBase 国内节点 20-40ms、自带静态托管、免费体验环境；Supabase 保留给国际场景。adapter 架构，设置页下拉切换，进度分键独立记录 |

### 9.3 架构与改动

**Local-First**：IndexedDB 仍是唯一读写源，`LifeOS.Sync` 后台推拉；离线可用，联网自动补同步。

| 文件 | 变更 |
|------|------|
| `js/core.js` | DB v2→v3：业务 store 记录自动打戳 `updatedAt`/`updatedBy`（设备 ID）；`delete` 改软删除（墓碑）；`get/getAll/getByIndex` 默认过滤墓碑；新增 `putRaw`/`hardDelete`/`purgeDeleted`/`getAllIncludingDeleted` 等同步专用 API；旧数据自动迁移补字段 |
| `js/sync.js`（新建） | SyncEngine：push（增量 upsert）/ pull（增量拉取 + LWW 合并）/ 写操作后防抖 5s 自动 push / 启动与 `online` 事件自动 sync / 每 5 分钟定时 pull / `testConnection` / 冲突队列与 `resolveConflict`；pull 落库走 `putRaw` 不再打戳，杜绝同步死循环。**双后端 adapter 架构**：`SupabaseAdapter`（PostgREST 纯 fetch）+ `CloudBaseAdapter`（官方 Web SDK 懒加载 CDN 双源 fallback、匿名登录、`doc(id).set()` upsert、skip/limit 分页拉全、15s 超时与错误归一化）；按 `syncProvider` 切换，`lastSyncAt` 按 provider 分键存储 |
| `settings.html` | 新增「多端同步」卡片：**同步后端下拉（关闭/Supabase/CloudBase）+ 按 provider 条件渲染配置区**（Supabase→URL+Key；CloudBase→envId）、设备命名、测试连接、主设备开关、冲突策略（LWW/询问）、立即同步、冲突队列 UI（展示两个版本的来源设备名 + 修改时间，主设备带徽标） |
| 8 个 HTML 页面 | 引入 `js/sync.js` 并在 mount 前 `LifeOS.Sync.init()`（test.html 除外） |
| `guide/supabase-setup.sql`（新建） | 9 张同构表（id text pk + data jsonb + updated_at + updated_by + deleted_at）+ 索引 + RLS 注释 |
| `guide/cloudbase-setup.md`（新建） | CloudBase 配置指引：建免费体验环境 → 9 集合 → 开匿名登录 → 安全规则 → 填 envId |
| `guide/multi-device-sync-design.md`（新建） | 同步架构完整设计（双后端选型、协议、冲突策略、风险；§1/§4.5/§7 已更新为双后端） |
| `guide/mobile-responsive-plan.md`（新建） | 移动端响应式计划（底部 Tab Bar、象限 Tab、弹窗改 bottom sheet、M1–M3 迭代、验证工具） |
| `tests/sync-merge.test.js`（新建） | 19 个用例（14 合并逻辑 + 5 双后端：provider 选择/none 禁用/CloudBase 映射/行格式对齐/lastSyncAt 分键） |
| `PRD_LifeOS.md` | 新增 §4.1.12 多端云同步模块（F-101~F-108）、用户故事 US-025/US-026、Checklist 5 行、MoSCoW 8 行、非功能需求 NF-014~NF-017 |

### 9.4 冲突解决策略（需求确认）

1. 默认 **Last-Write-Wins**（按 `updatedAt`）
2. **主设备**：设置页可切换；双端 `updatedAt` 差 < 2s 的近似平局时主设备版本获胜
3. **人工选择**：`conflictPolicy = 'ask'` 时真冲突进入冲突队列，用户选择保留哪条（界面注明各版本来自哪台设备）

### 9.5 验证结果

```
node tests/core-data.test.js   → 8/8 PASS
node tests/subtask.test.js     → 9/9 PASS
node tests/sync-merge.test.js  → 19/19 PASS（含 5 个双后端用例）
node --check LifeOS/js/sync.js → OK
```

### 9.6 待用户完成 / 下一步

- [x] **国内默认**：注册腾讯云 → 开通 CloudBase 免费体验环境（envId: `lifeos-d5gxoyi3o79a3518c`，上海）→ 建 9 集合 + 自定义安全规则 `auth != null` + 开匿名登录（2026-07-21 完成）
- [x] 设置页后端选 CloudBase 填 envId，连接测试通过（2026-07-21，见 §9.8）
- [ ] （可选/国际场景）注册 Supabase → 执行 `guide/supabase-setup.sql` → 后端选 Supabase 填 URL + anon key
- [x] 部署静态托管（CloudBase 静态托管，2026-07-21 完成，见 §9.8 部署记录）
- [ ] 手机验证访问 + PWA 添加到主屏幕（部署已通，待用户真机复测）
- [ ] 真·双设备实测（手机+电脑各改一条任务验证 LWW 与冲突队列；单设备双向已验证，见 §9.8）
- [ ] 移动端响应式 M1 迭代（待用户确认：手机型号/浏览器、高频场景、Tab Bar vs 抽屉菜单）
- [ ] ⚠️ Supabase key / CloudBase envId 属半敏感信息，仅存各设备 IndexedDB，**不得提交公开仓库**
- [ ] ⏰ CloudBase 免费环境每 6 个月需手动续期（下次约 2027-01），建议设提醒

### 9.8 端到端实测记录（2026-07-21，WebBridge 自动化）

环境：本地 `py -m http.server 8000` + Chrome + WebBridge v1.11.3。

| 步骤 | 结果 |
|------|------|
| SDK 懒加载（static.cloudbase.net） | ✅ |
| 匿名登录 | ✅ 首次 ~2s |
| `testConnection` | ✅ 4.4s「连接成功，tasks 集合可访问」 |
| 首次 sync | ✅ 6.6s（本 origin 无数据，pushed 0 符合预期） |
| 本地建任务 → push → 云端可查 | ✅ pushed 1，云端标题一致 |
| 云端改标题（模拟他端）→ pull → LWW 合并 | ✅ 本地标题与 updatedBy 均更新 |
| 测试数据清理（双端硬删） | ✅ |

**实测发现的问题（记入 v4.0.1 候选）：**

1. **冷启动超时**：首次点测试连接时 SDK 加载 + 首次匿名登录叠加 > 15s 超时上限，报「CloudBase 连接超时（15s）」；SDK 缓存后重试即成功。→ 首次调用应放宽超时或分步提示
2. **Pull 回声 push**：pull 落库的记录 `updatedAt > lastSyncAt`，会被下一轮 push 原样推回（幂等无害但浪费调用）。→ push 扫描应排除刚 pull 的记录或改用独立 lastPushAt
3. **⚠️ Origin 数据孤岛（重要使用约束）**：IndexedDB 按 origin 隔离——`file://`、`localhost:3000`、`localhost:8000`、部署后的域名**各自是独立数据库**。用户必须固定一种访问方式（建议：部署后统一用托管域名；本地开发统一 `localhost:8000`），否则数据分散在多个孤岛。若已有数据在 file:// 旧孤岛，可用导出 JSON → 新 origin 导入的方式迁移

### 9.9 静态托管部署记录（2026-07-21，CloudBase CLI）

| 项目 | 内容 |
|------|------|
| 工具 | CloudBase CLI（`tcb`）3.6.4，npm 全局安装，device flow 登录 |
| 构建 | robocopy 到临时目录（排除 `guide/`、`data/`、`*.md`、`test.html`），共 28 个文件 |
| 部署命令 | `tcb hosting deploy <临时目录> "/" -e lifeos-d5gxoyi3o79a3518c` |
| 线上地址 | https://lifeos-d5gxoyi3o79a3518c-1456250880.tcloudbaseapp.com |
| 验证 | `index/settings/sw.js/js/sync.js/manifest` 全部 HTTP 200；WebBridge 打开首页渲染正常（Dashboard 卡片、侧边栏、控制台无 error） |
| ⚠️ 关键坑 | Git Bash 会把 CLI 的 `/` 参数转成 MSYS 根路径（导致误传 `C:\` 整盘文件！），所有 tcb 命令前必须 `export MSYS_NO_PATHCONV=1`；首次误传的垃圾文件已用 `tcb hosting delete` 清理并核对云端文件列表无残留 |
| ⚠️ 默认域名限制 | `*.tcloudbaseapp.com` 官方标注"仅开发测试"，个人自用够用；免费版自定义域名配额 0 |
| 后续更新流程 | 改代码 → robocopy 重建临时目录 → 重新 `tcb hosting deploy`（覆盖式） |

### 9.10 v4.0.1 修复：移动端无导航入口 + SW 缓存漏收（2026-07-21）

| 修复项 | 文件 | 说明 |
|------|------|------|
| 移动端无法打开侧边栏 | `js/mobile-nav.js`（新建）+ `css/style.css` + 8 个 HTML | 手机上报「没有 sidebar，进不了设置页」。根因：≤768px 时侧边栏 translateX(-100%) 隐藏，但全站没有任何打开它的按钮。修复：纯 JS IIFE 注入悬浮汉堡按钮（左上角，仅 ≤768px 显示）+ 半透明遮罩；点击切换 `.sidebar.open`，点遮罩/导航项/窗口拉宽自动收起；与 Vue 渲染时序解耦（点击时才查 DOM），8 个页面各加一行 `<script src="js/mobile-nav.js">` |
| SW 静态缓存漏收文件 | `sw.js` | `STATIC_ASSETS` 补上 `./js/sync.js` 与 `./js/mobile-nav.js`（sync.js 自 v4.0.0 起就漏收）；缓存版本号 `v20260709-1` → `v20260721-1`，利用既有 skipWaiting + clients.claim 机制强制旧客户端刷新 |
| 移动端内容区顶距 | `css/style.css` | ≤768px 时 `.main-content` `padding-top: 68px`，给汉堡按钮留位 |
| 验证 | WebBridge | 本地 `localhost:8000` 实测：按钮注入 ✅、点击开（`.open` + 遮罩 visible）✅、再点关 ✅、导航项 8 个 ✅；重新部署后线上 `index.html`/`mobile-nav.js`/`style.css`/`sw.js` 全部 200 且内容为新版本 |
| ⚠️ 同类坑追加 | robocopy | Git Bash 同样会把 robocopy 的 `/E`、`/XD` 等参数转成路径（报"无效参数"），也必须 `export MSYS_NO_PATHCONV=1`（已写入本节备忘） |

### 9.11 v4.0.2 修复：汉堡按钮遮挡侧边栏标题（2026-07-21）

| 修复项 | 文件 | 说明 |
|------|------|------|
| 汉堡按钮展开时遮挡 "Life OS" 标题 | `js/mobile-nav.js` + `css/style.css` | 用户反馈「按钮挡住 logo」。根因：按钮 fixed top-left，菜单展开时正好压在侧边栏 header 上。修复：开合双态——展开时按钮右移到侧边栏右缘外侧（`left: calc(var(--sidebar-width) + 12px)`，带过渡动画）并变为 ✕；收起回到左上角 ☰ |
| SW 缓存再升版 | `sw.js` | `v20260721-1` → `v20260721-2`，确保线上旧客户端拿到双态修复 |
| 验证 | WebBridge | 本地实测：开 → `.open` + ✕ ✅；关 → ☰ ✅；清 SW/缓存后线上 3 文件内容校验为新版本 ✅ |

### 9.12 线上数据播种：导入 2026-07-09 备份（2026-07-21）

| 步骤 | 结果 |
|------|------|
| 备份文件 | `LifeOS/data/lifeos-backup-2026-07-09.json`（v2 格式，48KB）：characters 60、habitRecords 12、habits 3、tasks 3、timeline 2、settings 5 |
| 导入方式 | 线上域名设置页，WebBridge 注入 File 对象调 `ExportImport.importFile(file, 'merge')`；v2 旧记录经 `db.put()` 自动补戳 `updatedAt`/`updatedBy` |
| 导入后本地核对 | IndexedDB 计数与备份完全一致（settings 9 = 导入 5 + 同步配置 4） |
| 云端同步配置 | 线上域名：`syncProvider=cloudbase` + envId + `deviceName=Jasmine 的电脑`，`testConnection` ✅ |
| 首次 sync | 页面加载时启动自动 sync 已全部推送（手动再 sync 返回 pushed 0 属预期）；云端拉全量核对：tasks 3 / timeline 2 / habits 3 / habit_records 12 / characters 60 ✅ |
| 结论 | **云端已播种完成**。手机端配置同一 envId 后首次同步即可拉下全部数据 |
| 注意 | ⚠️ 手机端首次配置前不要在手机上新建数据，或接受 merge（LWW 按 updatedAt，新数据不会丢，但建议先拉后写） |

### 9.13 v4.0.3 修复：AI 501 误报 + 移动端弹窗裁剪（2026-07-21）

| 修复项 | 文件 | 说明 |
|------|------|------|
| AI 测试连接报 501 HTML 错误页 | `js/core.js` | 用户反馈「连不上 AI API」。根因：`AIClient._shouldUseProxy()` 只看 `http://localhost` 就走路由 `/api/proxy/ai`，但本地若是 Python http.server 等纯静态服务器（无该接口），POST 会收到 Python 的 501「Unsupported method」HTML 页——请求根本没到 AI API。修复：新增 `_probeProxy()` 探测 `/api/status`（仅 Express server.js 实现，结果按会话缓存），探测失败自动改直连 Base URL |
| 移动端弹窗确认按钮被地址栏遮挡 | `css/style.css` | 用户反馈任务弹窗底部按钮被手机浏览器底栏裁掉。根因：`.modal` 无高度上限，超高弹窗被 flex 居中上下裁剪；`100vh` 在移动端含浏览器工具栏高度。修复：`.modal` 加 `max-height: calc(100dvh - 40px)`（dvh 随工具栏动态变化）+ `overflow-y: auto` + `overscroll-behavior: contain` + iOS `safe-area-inset-bottom` 底部缓冲；全局生效（任务/事件/确认等所有弹窗） |
| SW 缓存升版 | `sw.js` | `v20260721-2` → `v20260721-3` |
| 验证 | 测试套件 + WebBridge + 线上校验 | core-data 8 ✅ / sync-merge 19 ✅ / subtask 9 ✅；localhost:8000 实测 `_shouldUseProxy()=true` 但 `_probeProxy()=false` → 自动直连 ✅；线上 sw.js/core.js/style.css 内容校验为新版本 ✅ |
| 旁证 | curl 直连 | 从本机直接 POST `api.kimi.com/coding/v1/chat/completions` 返回标准 401 JSON（nginx），证明端点与网络正常，501 确系本地静态服务器误路由 |
| 注意 | 使用约束 | AI 配置（Base URL/API Key/模型）按 origin 存 IndexedDB，线上域名需重新填一次；线上 HTTPS 环境 `_shouldUseProxy()` 为 false，本就直连，不受此 bug 影响 |

### 9.14 v4.1.0 云端 AI 代理（CloudBase 云函数）（2026-07-21）

**背景**：v4.0.3 修复误路由后，用户反馈电脑端「Failed to fetch」、手机端「Load failed」。诊断：从线上域名浏览器 fetch `api.kimi.com` 返回 TypeError，而本机 curl 同 endpoint 返回正常 401 JSON——**浏览器 CORS 拦截**（Kimi API 不对浏览器跨域放行）。这是浏览器安全模型限制，前端无法绕过，必须经服务端转发。

| 项目 | 内容 |
|------|------|
| 云函数 | `cloud-functions/ai-proxy/index.js`（Nodejs18.15，128MB，30s 超时）：契约与本机 Express `/api/proxy/ai` 一致（POST `{endpoint, apiKey, payload}` → 透传上游状态码与 body）；CORS Origin 白名单反射（线上域名 + localhost:3000/8000）；处理 OPTIONS 预检；强制 https endpoint；**不存储任何密钥**（API Key 随请求携带） |
| 部署配置 | `cloudbaserc.json`（envId + functionRoot + 函数清单），`tcb fn deploy ai-proxy` |
| HTTP 路由 | `tcb service create -p ai-proxy -f ai-proxy` → https://lifeos-d5gxoyi3o79a3518c-1456250880.ap-shanghai.app.tcloudbase.com/ai-proxy |
| AIClient 改造 | `js/core.js`：代理优先级 **本机 Express（探测）> 云端代理（`aiProxyUrl` 设置 / 内置默认）> 直连**；`aiProxyUrl` 语义：null=默认代理、空串=强制直连、URL=自定义代理；`defaults.proxyUrl` 内置默认地址，全端零配置可用 |
| 设置页 | AI 配置卡片新增「云端代理地址（可选）」输入（空=默认、`-`=直连、URL=自定义） |
| 「添加子任务」按钮弱化 | `tasks.html` + `css/style.css`：新增 `.btn-add-subtask`（0.78rem 深灰小字、半透明底），原为未定义的 `btn-sm` 类（浏览器默认样式） |
| 测试 | 新增 `testAIClientRoutesViaConfiguredProxy`（代理路由 + 不带 Authorization 头 + 空串强制直连）；既有直连用例显式 `proxyUrl: ''`；core-data 9 / sync-merge 19 / subtask 9 全绿 |
| 验证 | ① curl 经云函数转发 → 上游 401 JSON 透传 + CORS 头正确反射 ✅ ② 线上域名浏览器 `testConnection`（无效 key）→ 标准 401 AI_API_ERROR（不再是 Failed to fetch）✅ |
| SW 缓存 | `v20260721-3` → `v20260721-4` |
| 资源点影响 | 云函数调用次数 + 外网出流量进入计费；AI 调用为低频操作，免费额度内（参见 §9.2 估算） |
| ⚠️ 观察项 | 云端 `tasks` 出现 5 条「日语学习」（备份 3 条 + 手机端 15:05 新增 2 条，deviceId `dev-6fc3e968e96a`）：疑似手机端打开任务页时循环任务「补今天副本」逻辑生成的新 id 副本。非 sync bug（id 不同），但需用户确认展示是否符合预期；列入 v4.0.4 排查 |

### 9.15 v4.0.4 排查与修复：循环任务副本重复 + 添加子任务按钮重设计（2026-07-22）

**排查结论**（拉取云端 tasks 全字段还原）：

| # | id 尾缀 | 角色 | 来源 |
|---|---------|------|------|
| A | `95a3d992` | 原始任务（07-08 建，daily 循环，未完成） | 备份 |
| B | `f326b996` | **第二条原始任务**（07-08 晚 10 秒创建，内容同 A）——历史遗留重复，备份里就有 | 备份 |
| C | `6ad8a441` | A 的 07-09 副本（genFrom A） | 备份 |
| #4 | `1a6af8f0` | 手机补的 07-21 今日副本（genFrom C），**已被用户完成** | 手机 15:04 |
| #5 | `0a9c2926` | 完成 #4 时自动生成的 07-22 副本 | 手机 15:05 |

即：3→5 全是循环副本机制「按设计」运行的结果（补今日副本 + 完成生成明日副本），**不是 sync bug**；但暴露出两个真问题——

| 修复项 | 文件 | 说明 |
|------|------|------|
| 跨设备副本竞态 | `js/core.js` | `_generateRecurringTaskInstance` 改用**确定性 ID**（`源实例ID_日期`）：两台设备各自补副本/生成明日副本时得到相同 ID，云端 upsert 收敛为一条；此前各设备生成随机 ID → 同一天的副本在云端变两条 |
| 链上多实例重复触发 | `tasks.html` | 补今日副本的生成源从「链上每个历史实例」改为「**每链只取最新实例**」（按 标题+截止+象限+类别 分组取 max date），配合确定性 ID 双保险 |
| 「添加子任务」按钮重设计 | `tasks.html` + `css/style.css` | 用户反馈按钮丑。从头部的独立按钮改为列表底部的**虚线虚位行**（dashed placeholder row，全宽居中、0.82rem 灰字），语义为「列表的延续」，虚线沿用全站可填充区域语言（同文件上传虚线框）；表单展开时自动隐藏 |
| 测试 | `tests/core-data.test.js` | 新增 `testRecurringInstanceIdIsDeterministic`（同源同日收敛同一 ID、同天仅 1 条、不同日期不同实例）；core-data 10 / subtask 9 / sync-merge 19 全绿 |
| SW 缓存 | `sw.js` | `v20260721-4` → `v20260721-5` |
| 待用户决策 | 数据清理 | 建议软删除 B（`f326b996`，多余原始任务）与 C（`6ad8a441`，过期副本），保留 A + #4(已完成) + #5(明天)。软删除会同步墓碑，30 天内可恢复 |

### 9.16 v4.1.1 AI 规划 prompt 自检指令 + kimi 模型对比测试（2026-07-22）

**背景**：v4.1.0 时用 mimo-v2.5-pro 跑用户的「毕业周自然语言拆任务」prompt，只拆出 5 个论文任务，生活事务（洗衣/排球/搬家/拍照/机场）全丢、无子任务。用户要求：① prompt 加自检指令；② 换 kimi-for-coding-highspeed 重测对比。

| 项目 | 内容 |
|------|------|
| prompt 自检指令 | `js/core.js` `AIPlanner._buildPrompt('plan')` 末尾新增：「返回前自查：输入中明确提到的每件事（生活事务/工作/外出/社交）是否都有对应主任务？有遗漏先补上再返回」；breakdown prompt 不动 |
| 数据清理（§9.15 遗留） | 已软删除多余任务 B、C 并验证云端：日语学习链收敛为 A + #4(已完成) + #5(明天) ✅ |
| 测试 | core-data 10 / sync-merge 19 / subtask 9 全绿 |
| 部署 | SW `v20260721-5` → `v20260722-1`；全量 deploy 300s 超时改单文件 deploy（core.js/sw.js），线上 curl 校验 ✅ |

**对比测试**（同一段毕业周 prompt，线上域名 + CloudBase 代理真机环境）：

| 轮次 | 模型 | prompt | 结果 | 耗时 |
|------|------|--------|------|------|
| 07-21 | mimo-v2.5-pro | 旧 | 5 主任务（全论文向），生活事务全丢，无子任务 | ~22s |
| 今天 run1 | mimo-v2.5-pro | 新（含自检） | 3 主任务（全洗衣向），其余全丢，无子任务 | 18.8s |
| 今天 run2 | mimo-v2.5-pro | 新（含自检） | 0 任务（返回 2225 tokens 但解析不出任务数组，疑为解释性文字/非 JSON） | 21.8s |
| 今天 run3 | **kimi-for-coding-highspeed** | 新（含自检） | 0 任务（API 连通 200，但返回内容解析为空），且明显更慢 | 53.4s |

**结论**：kimi-for-coding-highspeed 为编码专精模型，规划指令遵循差且慢，**不采用**；自检指令对 mimo 覆盖率无稳定改善（3 轮结果 5/3/0 波动大）。AI 配置维持 mimo 不变，用户给的临时 key 未落库。

| 发现 | 说明 |
|------|------|
| settings 不参与云同步 | `STORE_TABLE_MAP`（sync.js）只含 9 个业务集合——AI 配置/设备名/同步配置均按设备各自存 IndexedDB，换设备需各配一次（手机端 AI 配置与电脑端互不影响） |
| WebBridge 脚本改配置未落库 | 页面内 `Settings.set` 同页 get 生效，但新开页面读到旧值（DB 行 updatedAt 未变）；疑 UI 层缓存或未落盘，待查。**脚本化测试建议用 `createPlanFromNaturalLanguage(text, true, {baseUrl, apiKey, model})` overrides 直传**，不碰设置项（run3 即用此法确认走的 kimi） |
| PRD 更新 | 新增 §4.1.13 设备管理模块（F-109 设备注册与心跳 / F-110 设备列表 / F-111 休眠唤醒 / F-112 软吊销删除）+ US-027 + MoSCoW + Checklist + §5.2 版本规划（默认 v5.0.0，可并 v4.2）；`devices` 集合尚未创建，实现前需先在 CloudBase 建集合 |

### 9.17 v5.0.0 设备管理：注册心跳 / 列表 / 休眠唤醒 / 软吊销（2026-07-22）

**背景**：用户要求主设备可管理已登录设备（查看/删除/休眠-唤醒），PRD §4.1.13（F-109~F-112、US-027）。按版本规则「新功能 → 大版本」，发布 v5.0.0。

| 项目 | 内容 |
|------|------|
| 云端 `devices` 集合 | CLI 创建：`tcb db nosql execute -c '[{"TableName":"devices","CommandType":"COMMAND","Command":"{\"create\":\"devices\"}"}]'`；安全规则 `auth != null` 读写（与其他集合一致）。**坑**：`ModifyDatabaseACL` 不接受 `Rule` 参数（UnknownParameter），设置自定义规则须用 `ModifySafeRule`（manager commonService 同款 Action） |
| adapter 层 | `js/sync.js` CloudBase/Supabase 双 adapter 新增 `deviceUpsert(row)` / `deviceGet(id)` / `deviceList()`；CloudBase 侧 doc id 即 deviceId，Supabase 侧 `devices` 表（guide/supabase-setup.sql 已补建表语句，国际版备用未实测） |
| F-109 注册与心跳 | `Sync._heartbeat()`：每次 sync 成功后 upsert 本机记录（deviceId/设备名/userAgent/firstSeenAt/lastSeenAt/isMaster/status/appVersion）。**保留云端 status 与 firstSeenAt**——心跳不覆盖主设备的休眠/吊销操作 |
| F-111/F-112 状态自查 | `Sync._checkDeviceAllowed()` 挂在 push()/pull()/sync() 入口：sleeping → 阻断本次同步并广播 `lifeos:device-blocked`；revoked → 停用引擎 + `syncProvider` 复位 `none` + 写 lastSyncError 提示重新授权。自查结果 5 分钟缓存（`DEVICE_STATUS_CACHE_MS`），查询失败回退旧缓存不阻断同步 |
| F-110 设备列表 + 主设备守卫 | `Sync.listDevices()`（按 lastSeenAt 排序）；`Sync.setDeviceStatus()` 应用层校验：仅主设备、不可改本机、状态白名单 active/sleeping/revoked |
| 设置页 UI | `settings.html` 多端同步卡片新增「设备管理」区：设备列表（名称/ID/最近活跃/版本/状态徽标/本机·主设备标记）、刷新按钮；主设备对他机显示「💤 休眠 / ⏰ 唤醒」「🗑 删除」（删除有二次确认，注明可改回活跃）；监听 `lifeos:device-blocked` 显示休眠/吊销提示；手动同步成功后自动刷新列表 |
| 测试 | `tests/sync-merge.test.js` +6 用例：心跳首次创建 active、心跳保留云端 sleeping/firstSeenAt、sleeping 阻断 push+pull、revoked 停用引擎+复位配置、setDeviceStatus 主设备/本机/非法状态三守卫、状态缓存复用与强制刷新。sync-merge **25** / core-data 10 / subtask 9 / ai-planner-parse 5/6（设计预期）全绿 |
| 部署 | SW `v20260722-1` → `v20260722-2`；单文件部署 sync.js/settings.html/sw.js，线上 curl 校验 ✅ |
| 验证状态 | 集合创建 + 安全规则 + 空集合查询 CLI 验证 ✅；**真机心跳 E2E 待用户下次打开 app 自动触发**（页面加载 → sync → 心跳 → 设备入列），届时设置页「设备管理」应能看到本机设备 |
| ⚠️ 已知局限 | CloudBase 匿名登录无法在服务端真正吊销凭证，F-112 为应用层约束（PRD 已注明）；被休眠设备最长 5 分钟后才感知状态变化（缓存窗口）；Supabase 侧 devices 表未实测 |
| ⚠️ 部署观察项 | 上线后用户报「LifeOS.Sync.listDevices is not a function」：SW 更新滞后——新 settings.html 已到，但页面仍被旧 SW 控制、加载旧缓存 sync.js（诊断时缓存三代并存 v20260721-4/v20260722-1/v20260722-2，新 SW 卡在 installing 等旧页面关闭）。解法：关闭全部 LifeOS 标签页/PWA 后重开（或 Ctrl+Shift+R）。另：网络差时 CloudBase SDK CDN 加载失败会导致 init 静默禁用（_enabled=false），重载即恢复 |

### 9.18 v5.0.1 移动端 UI 适配三修复（2026-07-24）

**背景**：用户手机端截图反馈三处 UI 问题。逐一排查修复，WebBridge + CDP 设备模拟（390×844）截图验证通过。

| 修复项 | 文件 | 根因与方案 |
|------|------|-----------|
| 每日回顾心情换行参差（7+1） | `review.html` | 8 个心情 flex-wrap 在窄屏换行为 7+1。改 4×2 固定网格（≤480px：`repeat(4, 1fr)`）。**附带发现**：`.date-display min-width:200px` 撑出横向溢出（情绪第 4 列被挤出屏幕），同步修复：日期导航允许换行收缩 + 四栏复盘手机单列 |
| 子任务表单日期/备注重叠、按钮竖排 | `css/style.css` | 桌面端 `.add-subtask-form` 用显式 grid 归位（date=col1/row2, note=col2/row2）；移动端改为单列后未重置归位，`grid-column:2` 创建隐式第二列导致重叠。修复：≤768px 下所有子项重置 `grid-column: 1 / -1; grid-row: auto` |
| 时间轴页完全无移动端适配 | `timeline.html` | **根因：缺 `<meta name="viewport">`**——手机按 980px 渲染桌面布局，全局移动端 CSS（隐藏侧边栏/汉堡菜单/单栏）全部失效。修复：① 补 viewport meta ② 新增预计/实际单栏 Tab 切换（`mobileTab` 状态 + `timeline-mobile-tabs`，桌面端隐藏）③ 时间格压缩：槽高 40→30px、半小时标签隔行隐藏（整点仍可见） |
| SW 缓存 | `sw.js` | `v20260722-2` → `v20260724-1` |
| 验证 | WebBridge + CDP 设备模拟 | 三页面 390×844 视口截图逐项核对 ✅（timeline 单栏+Tab+汉堡、review 4×2 网格+无横向溢出、子任务表单全宽无重叠） |
| 部署插曲 | — | 系统 `tcb` 命令失效（早上还可用，原因未查明，疑 npm 全局环境变化），改用 `npx -y -p @cloudbase/cli tcb` 等效替代 |

### 9.19 v5.0.2 子任务表单纤细化（2026-07-24）

| 项目 | 内容 |
|------|------|
| 用户反馈 | 移动端子任务表单「还是有点大，不够纤细，尤其字体太大」 |
| 调整（仅 ≤768px） | `css/style.css`：表单 padding 12→10px、gap 8→6px；输入框 padding 10/14→7/10px、字号 0.95→0.82rem（与虚线「添加子任务」入口字号一致，视觉上从属于主表单）；保存/取消按钮 padding 与字号同步缩小（0.8rem） |
| SW 缓存 | `v20260724-1` → `v20260724-2` |
| 备注 | 0.82rem ≈ 13px < iOS 16px 阈值，聚焦输入框时 iOS 会自动放大页面（全站表单均如此，主表单 0.95rem 同样低于阈值）；如后续要根治需全站表单字号≥16px，列入移动端 M3 打磨 |

### 9.20 v5.0.3 子任务日期框 iOS 空白占位回归（2026-07-24）

| 项目 | 内容 |
|------|------|
| 用户反馈 | 手机端子任务表单中间出现「无标识白框」 |
| 根因 | **iOS Safari 对自定义小字号的 `input[type=date]` 不渲染占位文字**（年/月/日消失）——v5.0.2 把字号调到 0.82rem 后触发；Chromium 模拟器无法复现（Chromium 正常渲染占位），属 iOS 特有问题 |
| 修复 | `tasks.html`：子任务日期框平时以 `type="text"` 显示占位「截止日期（可选）」，`onfocus` 切换为 `type="date"` 唤起原生日期选择，空值失焦切回 text（`nl-plan-subtask-input-date` 同模式待后续统一，本期未动） |
| SW 缓存 | `v20260724-2` → `v20260724-3` |
| 部署/校验 | tasks.html + sw.js 单文件部署，curl 校验 ✅ |

### 9.21 v5.1.0 账号密码登录与主设备权限跟随账号（2026-07-25）

**背景**：F-105 主设备开关绑定在本机 IndexedDB，换浏览器/清缓存/换域名后需重设。v5.1.0 通过 CloudBase 用户名密码登录把主设备权限提升到账号属性，同时保留 deviceId 按浏览器独立（同步归因需要）。

| 项目 | 内容 |
|------|------|
| F-113 账号登录/登出 | `settings.html` 新增「账号」卡片：未登录时显示用户名/密码表单 + CloudBase 控制台预建账号提示；已登录时显示 UID、匿名/主设备权限徽标 + 登出按钮。`sync.js` CloudBase adapter 新增 `login(username, password)` / `logout()` / `getCurrentUser()`，使用 SDK `auth.signInWithUsernameAndPassword()` |
| F-114 主设备权限跟随账号 | `_loadConfig()` 中 `isMainDevice = 本机开关 || !!accountUid`；登录成功后 `accountUid` 写入 settings，引擎 `reload()` 使新配置与主设备判定立即生效；登出后 `accountUid` 清空并 `reload()` 回退 |
| 匿名登录降级 | `getApp()` 保持「已有账号 session 复用账号，无则匿名登录」；未登录设备作为普通设备仍可同步 |
| 心跳 accountUid | `Sync._heartbeat()` 设备记录写入 `accountUid`，云端 devices 集合可按账号识别所有者设备 |
| 安全规则 | F-115 `auth.uid == '所有者uid'` 收紧本期未执行：当前仍保持 `auth != null`，待用户确认所有在用设备已完成登录后再手动迁移 |
| 测试 | `tests/sync-merge.test.js` 新增 4 用例：CloudBase adapter login/logout、accountLogin 后写入 uid 且变主设备、accountLogout 清空 uid、心跳包含 accountUid；sync-merge **29**/29 PASS，core-data 10、subtask 9、ai-planner-parse 5/6（设计预期）全绿 |
| SW 缓存 | `v20260724-3` → `v20260725-1` |
| 部署/校验 | settings.html / js/sync.js / sw.js 单文件部署，curl 校验线上内容均含新代码 ✅ |
| 已知局限 | CloudBase 用户名密码登录需控制台预先创建用户；Passkey（F-116）本期 Won't；安全规则收紧需用户后续手动执行 |

**发布后测试验证（2026-07-25）**：

| 项目 | 内容 |
|------|------|
| 验证方式 | WebBridge 打开线上设置页，截图检查「账号」卡片渲染、CloudBase 后端切换、已登录状态显示 |
| 发现问题 | SDK 已有账号登录态但 settings `accountUid` 未写入时，UI 未显示「主设备权限」徽标，主设备开关也未联动 |
| 修复 | `sync.js` `getAccountInfo()` 检测到非匿名账号登录态且 `accountUid` 不一致时自动写入 settings 并刷新配置；`settings.html` 账号卡片「主设备权限」徽标改为基于 `syncForm.accountUid`，主设备开关下方增加账号权限提示 |
| SW 缓存 | `v20260725-1` → `v20260725-2` |
| 测试 | sync-merge 29/29 PASS（未新增用例，行为变更已覆盖） |
| 部署/校验 | sync.js / settings.html / sw.js 重新部署，curl 校验通过 ✅ |
| ⚠️ 部署工具链坑 | CloudBase CLI 在 Windows 下每次经 `npx -y -p @cloudbase/cli` 运行都会触发 device flow 重新授权；根因是 CLI 的 `xdg-basedir` 在部分代码路径下回退到 `os.tmpdir() + '/.config'`，导致凭据读不到。解决：设置 `XDG_CONFIG_HOME=C:/Users/21136/.config` 后复用已有凭据，部署成功 |

### 9.22 v5.2.0 习惯周期计划与暂停（F-117~F-119，2026-07-25）

**背景**：PRD §4.1.15（US-029）。习惯需要目标型计划（每周/每月 N 次，可设停止日）、限时型计划（≤30 天窗口凑满 N 次）、以及因伤病等原因暂停且暂停期不拉低完成率。同时为后续打卡度量（F-120）、图片解析（F-121）、数据面板（F-122，PRD 已规划 v5.3）预留接口，减少未来重构。

| 项目 | 内容 |
|------|------|
| 数据模型 | habit 新增 `plan`（{type:'weekly'/'monthly'/'limited', times, startDate, stopDate?, endDate?}）与 `pauses`（[{reason, startDate, endDate\|null}] 数组保留历史）；IndexedDB 仍 v3（纯可选字段，无需迁移）；LWW 随 habits 集合自动同步 |
| `LifeOS.HabitPlan` | core.js 新增纯函数模块（不依赖 db，node 可测）：`weekRange`（自然周 周一~周日，已与用户确认口径）/`monthRange`、`getPlanProgress`（进度+状态 active/finished/failed）、`isValidLimitedWindow`（≤30 天）、`activePause`/`isPausedOn`/`activeHabitsOn`、`calcStreak`（暂停日跳过，今日明确未打卡仍清零，兼容既有语义） |
| 数据层 | `HabitStore.create` 接受 plan/pauses；`getStreak` 委托 `HabitPlan.calcStreak`；新增 `pause()`/`resume()`（恢复=暂停段 endDate 写为昨天，当天起可打卡）；`checkIn` 改扩展字段透传——F-120 的 metrics、F-121 的图片落库**无需再改 core.js** |
| UI（habits.html） | 编辑弹窗加「计划」区（类型/次数/停止日/截止日，限时截止日 max=今日+30 且校验）；卡片加计划进度 chip（本周 2/3、限时剩 X 天、未达成）与 ⏸ 暂停徽标；暂停中的习惯打卡按钮置灰；操作区加 ⏸/▶ 按钮；暂停弹窗原因必填+时段选填；完成率与热力图分母剔除当日暂停习惯 |
| 测试 | 新增 `tests/habit-plan.test.js`（6 项：周期口径/周月进度与停止日/限时窗口与未达成/暂停基础/streak 跳过/数据层集成）；core-data 10、subtask 9、sync-merge 29、ai-planner-parse 5/6（设计预期）全绿 |
| SW 缓存 | `v20260725-2` → `v20260725-3` |
| 部署/校验 | core.js / habits.html / sw.js 单文件部署，curl 校验线上含新代码 ✅ |
| PRD | F-117~119 翻绿（Checklist/MoSCoW/§5.2）；新增 §4.1.16~4.1.18 与 US-030~032、F-120~F-122 规划（v5.3.0） |

### 9.23 v5.2.1 设备管理 UI 补全与 revoked 设备自动清理（2026-07-25）

**背景**：用户截图反馈被删除设备一直显示「已删除」且按钮区仍显示「休眠/删除」，逻辑上应为「恢复/彻底删除」。同时 PRD 需明确 revoked 记录的保留与清理策略。

| 项目 | 内容 |
|------|------|
| 问题确认 | revoked 只是 `devices` 集合状态标记，不删业务数据；当前无自动清理，记录会一直保留；恢复后需重新配置同步后端（`syncProvider` 已被重置），`lastSyncAt` 保留走增量同步 |
| PRD 更新 | §4.1.13 F-112 扩展：revoked 保留 30 天供恢复，超期后由主设备每次 `sync()` 自动物理删除；主设备也可手动「彻底删除」立即硬删；补充恢复路径说明 |
| UI 补全（settings.html） | 设备管理按钮按状态渲染：active → 💤 休眠 + 🗑 删除；sleeping → ⏰ 唤醒 + 🗑 删除；revoked → ✅ 恢复 + 🗑 彻底删除；「彻底删除」有独立确认弹窗（注明业务数据不受影响） |
| `sync.js` | CloudBase/Supabase adapter 新增 `deviceDelete(id)`；`Sync.hardDeleteDevice(deviceId)` 主设备守卫（非主设备/本机拒绝）；`Sync._cleanupRevokedDevices()` 主设备每次 `sync()` 成功后扫描 `devices`，硬删 `status === 'revoked'` 且 `updatedAt` 超 30 天的记录；清理失败不阻塞同步仅 console.warn |
| 测试 | `tests/sync-merge.test.js` 新增 2 用例：`testHardDeleteDeviceMasterGuard`（非主设备/本机/正常删除三守卫）、`testCleanupRevokedDevices`（31 天前 revoked 被删、20 天前 revoked 保留、active 保留、本机跳过）；sync-merge **31**/31 PASS，core-data 10、subtask 9、ai-planner-parse 5/6、habit-plan 6 全绿 |
| SW 缓存 | `v20260725-3` → `v20260725-4` |
| 部署/校验 | sync.js / settings.html / sw.js 单文件部署，curl 校验线上含 `hardDeleteDevice`、`_cleanupRevokedDevices`、「彻底删除」「恢复」✅ |

### 9.7 与既有功能的关系

- 本机 Express 后端（v1.2 `server.js` + `BackendSync`）继续保留作本机备份；云端同步与其并存互不影响
- §6 已知问题「本地/后端冲突策略」部分缓解：v3 起所有写入均带 `updatedAt`，后续可让 BackendSync 合并也改用它
- 软删除对业务语义无影响（墓碑已在 DAO 层统一过滤）；`purgeDeleted` 默认清理 30 天前墓碑

---

*Generated by Kimi on 2026-07-07；v1.3 章节更新于 2026-07-20*
