# Life OS — 开发日志（Dev Log）

> **日期**: 2026-07-08  
> **当前版本**: v1.1（开发中）  
> **最后更新**: 【2026-07-08 10:53】  
> **项目路径**: `D:\FUN_VibeCoding\LifeOS\LifeOS\`  
> **PRD**: `D:\FUN_VibeCoding\LifeOS\PRD_LifeOS_v1.md`

---

## 1. 项目概览

### 1.1 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Vue 3.4.21 CDN 全局版 (`vue.global.js`) |
| 构建工具 | **无** — 纯 HTML/CSS/JS，无 webpack/vite |
| 运行方式 | `file://` 协议，双击 HTML 文件打开 |
| 样式 | 纯 CSS + CSS 变量（水彩/霍格沃茨主题） |
| 数据存储 | IndexedDB（`LifeOSDB`，10 个 Object Store） |
| 模块系统 | **无 ES Module** — 全局 IIFE + `window.LifeOS` |

### 1.2 核心约束（⚠️ 必须遵守）

1. **禁用 `import/export`** — 所有 JS 用 `<script src="">` 引入
2. **禁用 Vue Router history 模式** — `file://` 不支持，用 `href="xxx.html"` 切换页面
3. **禁用 ES Module `<script type="module">`** — 浏览器安全策略禁止本地 import
4. **日期格式统一** — 全程使用 `YYYY-MM-DD` 字符串，避免 `new Date()` 时区问题
5. **头像存储** — base64 压缩（400px, JPEG 0.8）存入 IndexedDB
6. **所有数据本地存储** — 不上传服务器

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
├── css/
│   └── style.css       # 全局样式 (40KB)
├── js/
│   ├── core.js         # 数据层：DAO + 预置角色 (79KB)
│   ├── db.js           # IndexedDB 底层封装 (6KB)
│   ├── utils.js        # 工具函数 (4KB)
│   └── components/
│       └── Sidebar.js  # 侧边栏组件
├── guide/              # 开发指南 step-00 ~ step-10
└── PRD_LifeOS_v1.md    # 产品需求文档
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
| 时间轴事件拖拽 | F-021，Drag & Drop API |
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
| `HabitStore.getStreak()` | 修正连续打卡计算 | 忽略未来记录，今天明确未完成时中断 streak |
| `ReviewStore.save()` | 保留创建时间 | 二次保存保留已有 `createdAt` |
| `Database.reset()` | 新增方法 | 清空所有 Store 数据，保留结构 |

### 5.5 测试记录【2026-07-08 10:53】

```bash
node tests\core-data.test.js
```

结果：4 项数据层回归测试全部通过。

渲染健康检查：通过本地服务打开 `http://localhost:8080/timeline.html`，确认页面标题为 `Life OS — 时间轴`，日视图正常显示，控制台无 error/warn。

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

### ⚠️ 当前潜在 bug

| 问题 | 位置 | 严重程度 | 说明 |
|------|------|---------|------|
| 循环事件虚拟实例编辑 | timeline.html | 中 | 虚拟实例 ID 格式 `originalId_date`，编辑时应提取原始 ID 或创建新事件 |
| 统计视图数据刷新 | timeline.html | 低 | `statsCache` 按 period 缓存，切换日期时未完全清空 |
| 番茄钟弹窗状态残留 | timeline.html | 低 | `onMounted` 已加 `showPomodoroXPDialog.value = false`，但仍需验证 |
| 时间轴事件图片 | timeline.html | 低 | `images` 字段已存在于数据模型，但 UI 未展示 |

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

### 如果开始 v1.2 开发

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
| PRD | `D:\FUN_VibeCoding\LifeOS\PRD_LifeOS_v1.md` |
| Bug Report | `D:\FUN_VibeCoding\LifeOS\LifeOS\BUG_REPORT_v1.1.md` |
| 开发指南 | `D:\FUN_VibeCoding\LifeOS\LifeOS\guide\step-*.md` |

---

*Generated by Kimi on 2026-07-07*
