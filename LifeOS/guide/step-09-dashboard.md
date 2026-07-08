# Step 9: Dashboard 首页（数据聚合概览）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建首页数据聚合 Dashboard，整合 5 大模块的每日概览

---

## 一、为什么这么做？

### 1.1 为什么 Dashboard 是"聚合视图"而非独立模块？

**Dashboard 不创造新数据，只展示已有数据**。这是信息架构学的核心原则：**单一来源（Single Source of Truth）**。如果 Dashboard 有自己的数据库表，就会出现"Dashboard 显示完成率 75%，但任务页面显示 80%"的数据不一致。

**Dashboard 的角色 = 每日晨会的信息看板**。用户每天早上打开 App，Dashboard 回答 5 个问题：

| 问题 | 数据来源 | 卡片 |
|------|---------|------|
| 我今天有多少事情要做？ | 任务模块 | 待办任务数 |
| 这些事情完成了多少？ | 任务模块 | 今日完成率 |
| 我的习惯养成得怎么样？ | 习惯模块 | 连续打卡天数 |
| 我的学习进度如何？ | 学习模块 | 总学习 XP |
| 我今天的心情怎么样？ | 回顾模块 | 今日情绪 |

**为什么不是 6 张卡片（加上时间轴）？** 时间轴是"实时流动"的数据，不是"汇总指标"。把实时数据放到静态卡片中会产生认知冲突——"时间轴显示 3 个事件，但卡片说 0"（因为卡片是加载时的快照）。时间轴更适合以**列表流**形式展示，所以放在左栏。

### 1.2 为什么日历是"聚合"视图？

**传统日历**只显示"有没有安排"。**聚合日历**显示"这一天过得怎么样"——它不是日程表，而是**生活质量仪表盘**。

每个日期格聚合三个维度的数据：

| 数据源 | 视觉元素 | 信息量 |
|--------|---------|--------|
| 回顾模块 | 情绪表情（😄😌😴） | 1bit：今天心情好/坏/累 |
| 习惯模块 | 绿色小圆点（1-4个） | 2-4bit：完成了几个习惯 |
| 任务模块 | 完成率百分比（75%） | 7bit：效率高低 |

**为什么三种数据源用不同视觉编码？** 因为人脑对**形状+颜色+位置**的多通道编码比单一通道更高效。如果三种数据都用颜色深浅，会糊成一片。用表情（形状）+ 圆点（数量）+ 数字（精确值），一眼就能区分三个维度。

### 1.3 为什么快速操作按钮在 Dashboard 而非每个模块？

**用户行为路径**：早上打开 App → 看 Dashboard → 决定"今天要做什么" → 快速添加任务/记录习惯/开始计时。

如果快速操作分散在各个模块内，用户需要：
1. 先判断"我现在需要做什么"
2. 然后切换到对应模块
3. 再找到添加按钮

Dashboard 的快速操作把**决策-执行**的延迟从 3 步压缩到 1 步。

---

## 二、技术实现

### 2.1 数据聚合的加载策略

```javascript
// 错误：串行加载（5 个请求排队，总延迟 = 5 × 查询时间）
const tasks = await LifeOS.Task.getAll();      // 100ms
const habits = await LifeOS.Habit.getAll();      // 100ms
const skills = await LifeOS.Skill.getAll();     // 100ms
const review = await LifeOS.Review.get(today);  // 50ms
const events = await LifeOS.Timeline.getByDate(today); // 100ms
// 总延迟：450ms

// 正确：并行加载（Promise.all，总延迟 = 最大单个查询时间）
const [allTasks, habits, skills, review, events] = await Promise.all([
    LifeOS.Task.getAll(),
    LifeOS.Habit.getAll(),
    LifeOS.Skill.getAll(),
    LifeOS.Review.get(today),
    LifeOS.Timeline.getByDate(today)
]);
// 总延迟：~100ms（最长的那个）
```

**为什么用 `Promise.all`？** IndexedDB 的查询是**异步 IO**，但底层操作在单个线程中执行，所以并行查询不会真正并发。不过浏览器的事件循环会在每个查询的回调之间切换，所以 `Promise.all` 仍然比串行快（因为 IndexedDB 操作在原生层是异步的，不会阻塞 JS 线程）。

### 2.2 日历数据的多源聚合

```javascript
const loadCalendarData = async () => {
    const yearMonth = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}`;
    
    // 并行加载三个数据源的全部数据
    const [allReviews, allRecords, allTasks] = await Promise.all([
        LifeOS.Review.getAll(),
        LifeOS.Database.getAll('habitRecords'),
        LifeOS.Task.getAll()
    ]);
    
    // 内存过滤：只保留当前月的数据
    const monthReviews = allReviews.filter(r => r.date.startsWith(yearMonth));
    const monthRecords = allRecords.filter(r => r.date.startsWith(yearMonth));
    const monthTasks = allTasks.filter(t => t.date.startsWith(yearMonth));
    
    // 聚合为日期映射对象：O(n) 时间复杂度
    const data = {};
    for (const r of monthReviews) {
        data[r.date] = { ...data[r.date], emotion: r.emotion };
    }
    for (const r of monthRecords) {
        if (r.completed) {
            data[r.date] = { ...data[r.date], habitCount: (data[r.date]?.habitCount || 0) + 1 };
        }
    }
    for (const t of monthTasks) {
        data[t.date] = { ...data[t.date], totalTasks: (data[t.date]?.totalTasks || 0) + 1 };
        if (t.completed) {
            data[t.date].completedTasks = (data[t.date]?.completedTasks || 0) + 1;
        }
    }
};
```

**为什么用 `startsWith(yearMonth)` 而非日期比较？** `YYYY-MM-DD` 格式的字符串按字典序排列等同于按时间序排列。`"2024-01-15".startsWith("2024-01")` 比 `new Date(date).getMonth() === currentMonth` 快 10 倍以上（避免创建 Date 对象）。

**为什么用对象映射而非数组过滤？** 在渲染日历时，需要从日期字符串 `dateStr` 快速查找数据。如果用数组，每次查找需要 O(n) 扫描。用对象映射，查找是 O(1)：`calendarData.value[dateStr]`。

### 2.3 情绪映射的数据解耦

```javascript
const emotionMap = {
    joy: '😄', calm: '😌', tired: '😴', anxious: '😰',
    sad: '😢', angry: '😠', excited: '🤩', grateful: '🥰'
};
const emotionText = {
    joy: '开心', calm: '平静', tired: '疲惫', anxious: '焦虑',
    sad: '低落', angry: '生气', excited: '兴奋', grateful: '感恩'
};
```

**为什么有两个映射表？** `emotionMap` 用于**视觉展示**（日历小格子里的表情），`emotionText` 用于**统计卡片**（"今日情绪：开心"）。分离它们使：
- 如果用户想更换表情风格，只需改 `emotionMap`
- 如果用户想更换文字描述，只需改 `emotionText`
- 两者互不影响，符合**单一职责原则**

### 2.4 日历格的渲染逻辑

```javascript
const calendarDays = computed(() => {
    const days = [];
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startOffset = firstDay.getDay(); // 0=周日
    
    // 补齐空白天
    for (let i = 0; i < startOffset; i++) days.push({ type: 'empty' });
    
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateStr = `${currentYear}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const data = calendarData.value[dateStr] || {};
        const taskRate = data.totalTasks ? Math.round((data.completedTasks / data.totalTasks) * 100) : null;
        
        days.push({
            day: d, date: dateStr, type: 'day',
            isToday: dateStr === today,
            emotion: data.emotion ? emotionMap[data.emotion] : null,
            habitCount: data.habitCount || 0,
            taskRate
        });
    }
    return days;
});
```

**日历格的三种数据展示优先级**：
1. 情绪表情（最高优先级，占据视觉中心）
2. 习惯圆点（中等优先级，在表情下方）
3. 任务完成率（最低优先级，最小字号，在圆点下方）

**为什么优先级这样排列？** 情绪是"定性"数据（今天整体过得怎么样），习惯是"定量"数据（完成了几个），任务是"精确"数据（75%）。从视觉层次上，定性 > 定量 > 精确，符合人脑"先整体后细节"的认知顺序。

### 2.5 统计卡片的"点击跳转"交互

```javascript
const statCards = ref([
    { id: 'completion', icon: '📈', value: '75%', label: '今日完成率', link: 'tasks.html' },
    { id: 'streak', icon: '🔥', value: '7 天', label: '最长连续', link: 'habits.html' },
    { id: 'tasks', icon: '📋', value: '5', label: '待办任务', link: 'tasks.html' },
    { id: 'xp', icon: '⭐', value: '1200', label: '总学习 XP', link: 'learning.html' },
    { id: 'mood', icon: '😄', value: '开心', label: '今日情绪', link: 'review.html' }
]);
```

每张卡片都是**可点击的入口**。这不是装饰性的交互——它解决了一个真实问题："我看到完成率 75%，想知道具体是哪些任务没完成"。点击后直接跳转到任务页面，无需重新导航。

**为什么每张卡片顶部有颜色条？** `.stat-card::before` 的 3px 顶部色条是**视觉锚点**，帮助用户建立"颜色-模块"的关联：
- 绿色 = 完成率（任务模块）
- 红色 = 连续打卡（习惯模块）
- 蓝色 = 待办任务（任务模块）
- 金色 = 学习 XP（学习模块）
- 橙色 = 情绪（回顾模块）

---

## 三、文件结构

```
LifeOS/
├── index.html              ← Dashboard 首页（本 Step 生成/重写）
│   ├── 顶栏：今日概览 + 日期
│   ├── 统计卡片（5张）：完成率/连续打卡/待办/XP/情绪
│   ├── 快速操作按钮（6个）
│   ├── 左栏：时间轴流预览（今日事件列表）
│   ├── 右栏：日历聚合视图（情绪+习惯+任务完成率）
│   └── 导入/导出弹窗
└── css/style.css           ← 复用全局变量，页面内联 <style> 补充
```

---

## 四、数据流

```
用户打开 index.html
    ↓
onMounted → loadData() → Promise.all 并行加载 5 个数据源
    ↓
Task.getAll() + Habit.getAll() + Skill.getAll() + Review.get(today) + Timeline.getByDate(today)
    ↓
计算 5 个统计指标 + 时间轴事件列表
    ↓
Vue 响应式渲染统计卡片 + 时间轴预览
    ↓
loadCalendarData() → 并行加载 Review.getAll() + habitRecords + Task.getAll()
    ↓
内存过滤当前月数据 → 聚合为日期映射对象
    ↓
computed: calendarDays → 渲染 7xN 日历网格
    ↓
用户点击日历格 → 跳转 review.html
用户点击统计卡片 → 跳转对应模块
用户点击快速操作 → 跳转对应模块
```

---

## 五、踩坑记录

### 坑 1：`LifeOS.Task.getTodayTasks()` 不存在

初期代码尝试调用 `LifeOS.Task.getTodayTasks()` 和 `LifeOS.Task.getCompletionRate()`，但这两个方法在 `core.js` 的 `TaskStore` 中并不存在。解决方案：从 `Task.getAll()` 中手动过滤和计算：

```javascript
const allTasks = await LifeOS.Task.getAll();
const todayTasks = allTasks.filter(t => t.date === today);
const completed = todayTasks.filter(t => t.completed).length;
const rate = todayTasks.length ? Math.round((completed / todayTasks.length) * 100) : 0;
```

### 坑 2：日历跨月切换时数据不刷新

```javascript
const prevMonth = () => {
    currentMonth.value--;
    if (currentMonth.value < 0) { currentMonth.value = 11; currentYear.value--; }
    loadCalendarData(); // 必须重新加载！
};
```

如果只改 `currentMonth` 而不调用 `loadCalendarData()`，日历格会显示新月份的日期，但数据还是旧月份的（因为 `calendarData` 没有更新）。

### 坑 3：时间轴事件跨午夜的时间计算

```javascript
// 危险：如果 startTime = "23:00", endTime = "01:00"（跨天），计算会得到负数
const start = new Date(`2000-01-01T${e.startTime}`);
const end = new Date(`2000-01-01T${e.endTime}`);
const hours = (end - start) / (1000 * 60 * 60); // 如果跨天，hours 为负数
```

Dashboard 中不计算时间轴 XP（学习 XP 来自 SkillStore），所以避免了这个问题。但如果后续需要从时间轴计算时长，需要处理跨天边界。

### 坑 4：数据加载时的"闪烁"问题

如果 `loading` 默认是 `false`，页面会先用占位值（"0%"、"0 天"）渲染，然后数据加载完成后瞬间跳到真实值，造成视觉闪烁。解决方案：`loading` 默认 `true`，所有数据加载完成后再设为 `false`，用 `v-if="loading"` 显示加载状态，`v-else` 显示真实数据。

### 坑 5：移动端 5 张卡片无法并排显示

```css
@media (max-width: 768px) {
    .dashboard-cards { grid-template-columns: repeat(2, 1fr); }
}
```

桌面端 5 列，移动端 2 列（自动换行）。如果移动端也用 5 列，每张卡片会压缩到无法阅读。2 列是合理的折中——"完成率+连续打卡"一行，"待办+XP+情绪"下一行（XP 和情绪会被推到第三行）。

---

## 六、v1.0 全部完成 🎉

至此，Life OS v1.0 的所有 **8 个核心模块** 全部完成：

| 模块 | 文件 | 核心功能 |
|------|------|---------|
| Dashboard | `index.html` | 数据聚合概览 + 日历 + 时间轴预览 + 快速操作 |
| 时间轴 | `timeline.html` | 双列预计/实际 + 计时器 + 事件详情 |
| 任务 | `tasks.html` | 四象限 + 卡片 + 倒计时 + 角色激励 |
| 习惯 | `habits.html` | 多邻国风格月历 + 连续天数 + 角色激励 |
| 回顾 | `review.html` | DID/GOOD/BAD/THOUGHTS + GRAI + 情绪 |
| 学习 | `learning.html` | RPG 技能树 + XP 升级 + 角色激励 |
| 角色库 | `characters.html` | 展示/编辑/头像/预置数据/个性化台词 |
| 设置 | `settings.html` | API 配置 + 数据导入导出 |

**v1.1 增强方向**：
- 四象限散点图（ECharts）
- 技能树可视化（Canvas/SVG 星图）
- 经历日记 AI 生成
- 情绪天气月历
- 多角色对话链（85% 完成率）
- 番茄钟 + 自动 XP 分配
- 饮食 AI 营养分析

**v2.0 未来方向**：
- ASR 口述生成任务
- AI 判定 XP 分配（分析内容难度）
- 云同步、社交分享、原生 App
- 可穿戴设备集成
