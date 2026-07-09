# Step 2: IndexedDB 数据层完整封装 + 导入导出

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建数据存储核心（DAO 层）、导入导出系统、预置角色数据

---

## 一、为什么这么做？

### 1.1 为什么用 `core.js` 全局变量而非 ES Module `import`？

| 方案 | 文件打开方式 | 本地 JS 导入 | 实际效果 | 我们的选择 |
|------|------------|------------|---------|----------|
| **ES Module (`import` + `importmap`)** | `file://` 双击打开 | ❌ 浏览器安全策略禁止 `import` 本地文件 | Vue 加载成功，但 `import './Sidebar.js'` 报错，脚本中断 | ❌ 不可用 |
| **ES Module + 本地服务器** | `http://localhost:8000` | ✅ 服务器环境下允许 | 完美运行，但需要 `npx serve` 或 Python `http.server` | 可用但增加门槛 |
| **`<script src>` 全局变量** | `file://` 双击打开 | ✅ 不依赖 `import`，直接加载 | 完全可行，但所有代码在一个文件（或按 `<script src>` 顺序加载） | ✅ **选中** |

**核心决策**：`core.js` 使用 **IIFE (Immediately Invoked Function Expression)** 封装：

```javascript
(function() {
    'use strict';
    // ... 所有代码
    window.LifeOS = { ... };
})();
```

**为什么用 IIFE？**
1. **隔离作用域**：IIFE 创建私有作用域，内部变量不会污染全局 `window` 对象
2. **`'use strict'`**：严格模式，捕获潜在错误（如未声明变量、禁止 `with` 语句等）
3. **`window.LifeOS = { ... }`**：只暴露一个全局变量 `LifeOS`，包含所有 API（`LifeOS.Database`, `LifeOS.Task`, `LifeOS.Habit` 等）
4. **后续可迁移**：部署到服务器时，可直接将 `core.js` 改为 ES Module 导出，无需重写业务逻辑

### 1.2 为什么每个模块一个 DAO 对象而非全部用 `db.get`/`db.put`？

| 方式 | 代码示例 | 问题 |
|------|---------|------|
| **直接调用底层** | `db.put('tasks', { id, title, ... })` | 每个页面都需要自己构建数据对象，字段容易遗漏，格式不一致 |
| **DAO 封装** | `Task.create({ title, deadline })` | DAO 自动填充默认值、自动计算派生字段（如四象限）、统一字段格式 |

**核心决策**：DAO (Data Access Object) 层封装了每个业务模块的数据操作：
- `Task.create()` → 自动计算 `quadrant`、填充默认值、生成 `id`
- `Habit.checkIn()` → 自动构建打卡记录 ID（`habitId_YYYY-MM-DD`），方便按日期查询
- `Character.importPresetData()` → 批量导入预置角色，自动跳过已存在的

### 1.3 为什么数据库名从 `OkComputerDB` 改为 `LifeOSDB`？

产品名已改为 **Life OS**，数据库名也应同步。IndexedDB 的数据库名是独立的命名空间，改名后：
- 旧数据（`OkComputerDB`）仍然存在于浏览器中，不会自动迁移
- 首次打开会创建新的 `LifeOSDB` 数据库
- 如果需要迁移旧数据，可导出旧库 JSON 再导入新库

---

## 二、核心代码解析

### 2.1 `core.js` 整体架构

```javascript
window.LifeOS = {
    Utils,           // 工具函数：日期、UUID、四象限计算、Markdown 转换等
    Database,        // IndexedDB 封装：初始化、CRUD、索引查询
    Timeline,        // 时间轴 DAO
    Task,            // 任务 DAO
    Habit,           // 习惯 DAO
    Review,          // 每日回顾 DAO
    Skill,           // 学习技能树 DAO
    Character,       // 角色库 DAO
    Moment,          // 特殊事件 DAO
    Settings,        // 设置 DAO
    AIClient,        // 通用 OpenAI-compatible AI 客户端（v1.2 补充）
    BackendSync,     // 本机后端 JSON 同步（v1.2 补充）
    ExportImport     // 导入导出系统
};
```

**v1.2 补充【2026-07-09 14:38】**：`AIClient` 虽然不直接写业务数据，但它统一读取 `Settings` 中的 API 配置，并把调用历史写回 `apiHistory`；因此放在 `core.js` 的公共服务层最合适。页面侧不应再手写 `fetch(baseUrl + '/chat/completions')`，而应统一调用 `LifeOS.AIClient.chat()` / `complete()` / `testConnection()`。

### 2.2 数据库初始化（幂等设计）

```javascript
class Database {
    constructor() {
        this.dbName = 'LifeOSDB';
        this.version = 1;
        this.db = null;
        this._initPromise = null;  // 关键：缓存 Promise，防止多次 open
    }

    init() {
        if (this._initPromise) return this._initPromise;  // 已初始化，直接返回
        
        this._initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            // ... onerror, onsuccess, onupgradeneeded
        });
        return this._initPromise;
    }
}
```

**为什么缓存 `Promise`？**
- 页面加载时可能同时触发多个数据请求（如 Dashboard 加载任务数、习惯数、回顾等）
- 如果每个请求都调用 `indexedDB.open()`，会创建多个数据库连接，可能导致竞争条件
- 缓存 `Promise` 确保所有并发调用等待同一个 `open` 完成
- 这是 IndexedDB 的**最佳实践**之一

### 2.3 `onupgradeneeded` — 数据库版本迁移的唯一入口

```javascript
request.onupgradeneeded = (event) => {
    const db = event.target.result;
    // 只有在这里才能创建 Object Store 和 Index！
    // open() 的 onsuccess 中创建会报错
};
```

**为什么只能在 `onupgradeneeded` 中创建 Store？**
- IndexedDB 的设计原则：数据库结构（Schema）只能在版本升级时修改
- 一旦数据库打开（version 1），后续调用 `open('LifeOSDB', 1)` 不会触发 `onupgradeneeded`
- 如果需要新增 Store（如未来添加"预算管理"模块），必须：
  1. 递增 `version` 到 2
  2. 在 `onupgradeneeded` 中检查 `event.oldVersion`，为新版本添加 Store
  3. 现有数据不受影响

### 2.4 10 个 Object Store 设计

| Store | 键 | 索引 | 用途 |
|-------|-----|------|------|
| `timeline` | `id` (UUID) | `date`, `type`, `taskId` | 时间轴事件 |
| `tasks` | `id` (UUID) | `quadrant`, `completed`, `deadline`, `isRecurring`, `date` | 任务管理 |
| `habits` | `id` (UUID) | `category` | 习惯定义 |
| `habitRecords` | `id` (`habitId_YYYY-MM-DD`) | `habitId`, `date` | 每日打卡记录 |
| `reviews` | `date` (YYYY-MM-DD) | — | 每日回顾（每天一条） |
| `skills` | `id` (UUID) | `parentId` | 技能树节点 |
| `notes` | `id` (UUID) | `skillId`, `date` | 学习笔记 |
| `characters` | `id` (UUID) | `series` | 角色库 |
| `settings` | `key` (字符串) | — | 键值对设置 |
| `moments` | `id` (UUID) | `date`, `hashtag` (multiEntry) | 特殊事件 |

**关键设计决策**：

1. **`reviews` 以 `date` 为键**：每天只有一条回顾，天然去重。多次保存会覆盖（符合用户预期）。
2. **`habitRecords` 的复合键 `habitId_YYYY-MM-DD`**：方便直接通过 `get()` 查询某日某习惯的打卡状态，无需遍历索引。
3. **`moments.hashtag` 使用 `multiEntry: true`**：如果一条记录有 `['#Fandom', '#Anime']`，`multiEntry` 会为每个标签创建独立索引项。查询 `getByIndex('moments', 'hashtag', '#Fandom')` 能正确匹配。

### 2.5 DAO 层设计模式

以 `TaskStore` 为例：

```javascript
const TaskStore = {
    async create(task) {
        const data = {
            id: Utils.generateId(),  // 自动生成 UUID
            title: task.title || '未命名任务',
            priority: task.priority || 5,
            quadrant: task.quadrant || Utils.calculateQuadrant(task.deadline, task.priority),
            // ... 自动填充所有字段
            createdAt: Utils.now(),
            updatedAt: Utils.now()
        };
        await db.put('tasks', data);
        return data;  // 返回完整对象，方便上层直接使用
    },

    async toggleComplete(id) {
        const task = await db.get('tasks', id);
        if (!task) return null;
        task.completed = !task.completed;
        task.completedAt = task.completed ? Utils.now() : null;
        task.updatedAt = Utils.now();
        await db.put('tasks', task);
        return task;  // 返回更新后的对象
    },

    async getCompletionRate() {
        const today = await this.getTodayTasks();
        if (!today.length) return 0;
        return Math.round((today.filter(t => t.completed).length / today.length) * 100);
    }
};
```

**为什么每个 DAO 方法返回完整对象？**
- Vue 的响应式系统需要完整的对象引用才能正确触发更新
- 如果返回 `true/false`，上层需要重新查询才能获取最新数据
- 返回对象后，可以直接 `task.value = await Task.create({ ... })`

### 2.6 习惯连续打卡计算

```javascript
async getStreak(habitId) {
    const records = await this.getRecordsByHabit(habitId);
    if (!records.length) return 0;
    records.sort((a, b) => b.date.localeCompare(a.date));  // 从最新到最旧
    
    let streak = 0;
    const today = Utils.formatDate();
    const yesterday = Utils.formatDate(new Date(Date.now() - 86400000));
    
    // 如果今天没打卡，从昨天开始算连续天数
    let checkDate = records[0].date === today ? today : yesterday;
    
    for (const r of records) {
        if (r.date === checkDate && r.completed) {
            streak++;
            // 往前推一天
            checkDate = Utils.formatDate(new Date(new Date(checkDate).getTime() - 86400000));
        } else if (r.date === checkDate && !r.completed) {
            break;  // 有一天没打卡，连续中断
        }
    }
    return streak;
}
```

**核心逻辑**：
1. 获取某习惯的所有历史打卡记录
2. 按日期倒序排列（最新的在前）
3. 检查今天是否打卡：如果打了，从今天开始算；如果没打，从昨天开始算（允许今天还没打卡但昨天已连续）
4. 往前逐天检查，遇到 `completed === false` 就中断
5. 返回连续天数

### 2.7 导入导出系统

**导出**：
```javascript
async export() {
    const data = await db.exportAll();  // 遍历所有 Store，获取全部数据
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);  // 创建临时 URL
    const a = document.createElement('a');
    a.href = url;
    a.download = `lifeos-backup-${Utils.formatDate()}.json`;
    a.click();  // 触发下载
    URL.revokeObjectURL(url);  // 释放内存
}
```

**为什么用 `URL.createObjectURL`？**
- 不需要后端服务器，纯前端生成文件
- 支持大文件（数百 MB），因为数据在内存中
- 下载后自动释放 URL，不占用内存

**导入**：
```javascript
async importFile(file, strategy = 'merge') {
    const text = await file.text();
    const data = JSON.parse(text);
    // 验证：检查 data._meta.app === 'LifeOS'
    await db.importAll(data, strategy);  // strategy: 'merge' | 'overwrite'
}
```

**合并策略 `merge`**：
- 现有数据保留
- 新 ID 的数据添加
- 相同 ID 的数据 **覆盖**（因为导入的可能是用户在其他设备上的更新）

**为什么不用 `merge` 做字段级合并？** 因为 IndexedDB 的 `put` 是整对象替换，没有内置的字段级合并。如果需要更精细的合并，需要手动读取现有对象，合并字段，再 `put`。当前版本采用简单策略，因为数据量不大。

### 2.8 预置角色数据

```javascript
CharacterStore.PRESET_DATA = [
    { name: '泽村大地', series: '排球少年', jerseyNumber: '1', ... },
    { name: '菅原孝支', series: '排球少年', jerseyNumber: '2', ... },
    // ... 约 50+ 角色
];

async importPresetData() {
    for (const char of preset) {
        const existing = await db.getAll('characters');
        if (existing.find(c => c.name === char.name)) continue;  // 已存在，跳过
        await this.create(char);
    }
}
```

**为什么用 `name` 而非 `id` 判断重复？** 因为预置数据在开发时生成，用户可能已经在其他页面创建了同名角色。用 `name` 判断更符合业务逻辑（用户不会创建两个"及川彻"）。

---

## 三、验证步骤

### 3.1 验证数据库初始化

1. 打开 `index.html`（强制刷新 Ctrl + F5）
2. 打开 DevTools → Application → IndexedDB
3. 应看到 `LifeOSDB` 数据库，包含 10 个 Object Store

### 3.2 验证数据操作（Console 中执行）

```javascript
// 1. 确保数据库已初始化
await LifeOS.Database.init();

// 2. 创建测试任务
const task = await LifeOS.Task.create({
    title: '测试任务',
    deadline: '2026-07-05',
    priority: 9
});
console.log('创建任务:', task);
// 应自动计算 quadrant = 'urgent-important'（3天后截止 + 高优先级）

// 3. 查询今日任务
const tasks = await LifeOS.Task.getTodayTasks();
console.log('今日任务:', tasks);

// 4. 切换完成状态
const updated = await LifeOS.Task.toggleComplete(task.id);
console.log('完成状态:', updated.completed);

// 5. 创建习惯
const habit = await LifeOS.Habit.create({ name: '喝水', category: 'health' });
console.log('创建习惯:', habit);

// 6. 打卡
const record = await LifeOS.Habit.checkIn(habit.id, LifeOS.Utils.formatDate(), { completed: true });
console.log('打卡记录:', record);

// 7. 计算连续打卡
const streak = await LifeOS.Habit.getStreak(habit.id);
console.log('连续打卡:', streak, '天');

// 8. 导入预置角色
const count = await LifeOS.Character.importPresetData();
console.log('导入角色:', count, '个');

// 9. 查看所有角色
const chars = await LifeOS.Character.getAll();
console.log('角色总数:', chars.length);

// 10. 导出数据
await LifeOS.ExportImport.export();  // 应下载 JSON 文件
```

### 3.3 验证 Dashboard 数据展示

1. 执行上述操作后，刷新 `index.html`
2. Dashboard 卡片应显示：
   - 今日任务数 = 1（或更多，如果你创建了多个）
   - 完成率 = 根据完成的任务比例计算
   - 连续打卡 = 如果今日有打卡，显示天数
3. 侧边栏"今日时间轴"预览应显示时间轴事件（如果有）

### 3.4 验证导入导出

1. 点击 Dashboard 上的 **"导出备份"** 按钮
2. 浏览器应下载 `lifeos-backup-2026-07-02.json`（文件名含日期）
3. 打开文件，确认包含 `_meta` 和 10 个 Store 的数据
4. 点击 **"导入数据"** 按钮，选择刚导出的文件
5. 数据应成功导入，页面自动刷新

---

## 四、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `LifeOS is not defined` | `core.js` 未加载或加载失败 | 检查 `<script src="js/core.js">` 路径是否正确，确认文件存在 |
| `IndexedDB 打开失败` | 浏览器隐私模式或存储空间已满 | 退出隐私模式，检查浏览器存储权限 |
| 预置角色导入为 0 | 已存在同名角色（首次初始化后） | 这是预期行为，避免重复。如需重新导入，先清空 characters store |
| 导出文件为空或只有 `_meta` | 数据库尚未初始化或数据为空 | 先创建至少一条记录，再导出 |
| `importFile` 报错 "不是 Life OS 备份文件" | 选择的 JSON 文件缺少 `_meta.app === 'LifeOS'` | 确认是 Life OS 导出的文件，而非其他应用数据 |
| Dashboard 数据始终为 0 | `onMounted` 中异步加载未完成 | 检查 DevTools Console 是否有错误。`await LifeOS.Database.init()` 必须在所有操作之前 |

---

## 五、下一步预告

**Step 3: 角色库页面（characters.html）**
- 角色列表展示（卡片/表格）
- 角色详情编辑（性格标签、台词、优先级）
- 头像上传与圆形裁剪（FileReader + Canvas）
- 角色互动优先级排序（拖拽）

**Step 4: 时间轴模块（timeline.html）**
- 双列时间轴（预计/实际）
- 从任务拖拽到时间轴
- 开始计时自动记录
- 事件详情弹窗（富文本 + 图片）

**Step 5: 任务管理（tasks.html）**
- 四象限卡片展示
- 任务添加/编辑/删除
- 倒计时可视化 + 进度条
- 完成率计算 + 角色激励触发

---

> 本文件位置：`guide/step-02-data-layer.md`
> 对应新增/修改：
> - 新增：`js/core.js`（全局数据管理器：Utils + Database + 8个DAO + 导入导出 + 预置角色数据）
> - 修改：`index.html`（引入 core.js，Dashboard 展示真实数据，导出/导入按钮，加载状态）
> - 修改：`timeline.html` / `tasks.html` / `habits.html` / `review.html` / `learning.html` / `characters.html` / `settings.html`（引入 core.js）
> - 修改：`css/style.css`（加载状态、快速操作按钮、弹窗、迷你时间轴事件）
