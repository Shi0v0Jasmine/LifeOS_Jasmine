# Step 6: 习惯打卡（Habit Tracker）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建多邻国风格月历热力图 + 习惯列表 + 连续天数（Streak）+ 角色激励

---

## 一、为什么这么做？

### 1.1 为什么用多邻国风格月历（热力图）？

**多邻国（Duolingo）的日历热力图**是行为设计学的经典案例：

| 设计元素 | 心理学原理 | 效果 |
|---------|----------|------|
| 颜色深浅表示完成度 | **视觉反馈强化** | 绿色越浓 = 成就感越强 |
| 7xN 网格布局 | **模式识别** | 一眼看出"周二总是完不成"的规律 |
| 当天高亮边框 | **当下聚焦** | 引导用户关注"今天"而非焦虑过去 |
| 小圆点代表习惯 | **多维度信息** | 一眼看出"今天完成了3个习惯中的2个" |

**为什么不直接用列表？** 列表只能看到"今天做了什么"，但无法回答"我这个月做得怎么样"。热力图把**时间维度**和**完成度维度**压缩到一个二维平面，符合人类视觉系统的模式识别能力。

**为什么用 5 级颜色而非 2 级（完成/未完成）？**
- 2 级：只有"全完成"和"没完成"，导致"80%完成"和"0%完成"看起来一样 → 挫败感
- 5 级：即使只完成了 1 个习惯，也有浅绿色奖励 → **渐进式激励**
- 颜色映射：空 → 浅绿 → 绿 → 深绿 → 斯莱特林绿（象征"完美一天"）

### 1.2 为什么连续天数（Streak）是习惯养成的核心？

**"Don't Break the Chain"** 是 Jerry Seinfeld 的习惯养成法：

> 每天完成一个习惯，就在日历上画一个 X。几天后你会得到一条链。你的唯一任务就是——**不要打断这条链**。

| Streak 天数 | 心理阶段 | 放弃成本 |
|------------|---------|---------|
| 1-3 天 | 新鲜感期 | 低，随时可能放弃 |
| 7 天 | 第一周里程碑 | 中，开始感到"有点可惜" |
| 21 天 | 习惯固化期 | 高，大脑已形成自动化回路 |
| 66+ 天 | 行为科学认定的"真正习惯" | 极高，中断会产生焦虑 |

**为什么显示 "🔥 7 天" 火焰标记？** 7 天是一个心理门槛——超过 7 天后，用户会产生"我已经坚持一周了，不能放弃"的沉没成本效应。火焰标记是**社会认同**的视觉化（像游戏里的成就徽章）。

### 1.3 为什么角色激励在习惯打卡中触发？

任务管理（Step 5）的激励是"完成率阈值"（75%/85%），属于**结果导向**。习惯打卡的激励是**过程导向**：

| 触发条件 | 意义 | 角色台词类型 |
|---------|------|------------|
| 单个习惯连续 ≥7 天 | 认可坚持 | encourage（个性化鼓励台词） |
| 今日所有习惯 100% 完成 | 认可完美 | 特别庆祝台词 |

**为什么分开设计？** 习惯需要比任务更频繁的鼓励。任务一天最多激励 2 次（75% 和 85%），但习惯每天可以激励多次（每次打卡都可能触发）。

---

## 二、技术实现

### 2.1 热力图颜色层级算法

```javascript
// 5 级颜色映射：基于当天完成习惯数 / 总习惯数
const ratio = completedCount / totalHabits;
let level = 0;
if (ratio >= 1)       level = 4;  // 全部完成 → 斯莱特林绿
else if (ratio >= 0.75) level = 3;  // 75%+ → 深绿
else if (ratio >= 0.5)  level = 2;  // 50%+ → 中绿
else if (ratio > 0)     level = 1;  // 部分 → 浅绿
else                    level = 0;  // 空 → 灰色
```

**CSS 类映射**（通过 `:style` 或 `class` 绑定）：
```css
.level-0 { background: rgba(241,245,249,0.8); }  /* 空 */
.level-1 { background: var(--color-mint-light); } /* 浅绿 */
.level-2 { background: var(--color-mint); }        /* 中绿 */
.level-3 { background: var(--color-mint-deep); color: white; }
.level-4 { background: var(--color-slytherin-green); color: white; }
```

**为什么用 5 级而非更多？** 人类视觉系统对 5 级以内的颜色差异敏感，超过 5 级会"糊成一片"。

### 2.2 月历网格生成算法

```javascript
const firstDay = new Date(year, month, 1);
const lastDay = new Date(year, month + 1, 0);
const startOffset = firstDay.getDay(); // 0=周日（与中文习惯一致）

// 空白天（补齐第一周）
for (let i = 0; i < startOffset; i++) days.push({ type: 'empty' });

// 实际日期
for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const level = calculateLevel(dateStr);  // 基于打卡记录
    days.push({ day: d, date: dateStr, level, isToday: dateStr === today });
}
```

**为什么用 `padStart(2, '0')`？** 确保日期格式统一为 `2024-01-05` 而非 `2024-1-5`，因为 IndexedDB 的字符串比较依赖字典序。

### 2.3 连续天数（Streak）算法

```javascript
const getStreakSync = (habitId) => {
    // 1. 筛选该习惯的所有完成记录，按日期倒序
    const habitRecords = records.value
        .filter(r => r.habitId === habitId && r.completed)
        .sort((a, b) => b.date.localeCompare(a.date));
    
    if (!habitRecords.length) return 0;
    
    let streak = 0;
    // 2. 从今天或昨天开始检查（如果今天没打卡，从昨天算）
    let checkDate = habitRecords[0].date === today 
        ? today 
        : formatDate(new Date(Date.now() - 86400000));
    
    // 3. 逐天回溯，检查链条是否连续
    for (const r of habitRecords) {
        if (r.date === checkDate) {
            streak++;
            // 下一天 = 当前日期 - 24小时
            checkDate = formatDate(new Date(new Date(checkDate).getTime() - 86400000));
        } else {
            break; // 链条中断
        }
    }
    return streak;
};
```

**为什么用同步版本 `getStreakSync`？** 页面渲染需要同步计算（computed 属性），而 `LifeOS.Habit.getStreak()` 是异步的。解决方案：页面加载时一次性拉取所有 `habitRecords` 到 `ref`，后续计算在内存中同步完成。

**86400000 是什么？** `24 * 60 * 60 * 1000` = 一天的毫秒数。用 `Date.now() - 86400000` 代替 `new Date().setDate(-1)`，避免跨月/闰年 bug。

### 2.4 打卡按钮的弹性动画

```css
.habit-check-btn {
    transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
    /* cubic-bezier(0.34, 1.56, 0.64, 1) = 弹性效果：
       先 overshoot 再回弹，像弹簧一样 */
}
.habit-check-btn.checked {
    transform: scale(1.05);
    /* 完成时放大 5%，给用户"确认感" */
}
```

**为什么用 `cubic-bezier` 而非 `ease`？** `ease` 是单调减速，`cubic-bezier(0.34, 1.56, 0.64, 1)` 有 overshoot（超过目标再回弹），产生"弹性"感——这是游戏 UI 中常见的反馈手法。

### 2.5 日期详情弹窗（点击热力图某天）

```javascript
const showDayDetail = (date) => {
    selectedDay.value = date;
    dayDetailHabits.value = habits.value.map(h => ({
        id: h.id, name: h.name, icon: h.icon, color: h.color,
        completed: isCompletedOnDate(h.id, date)  // 检查该日记录
    }));
    showDayModal.value = true;
};
```

**为什么每个日期都要可点击？** 用户会好奇"上周三我为什么没完成？"点击后显示当天所有习惯的完成状态，帮助用户回溯原因。

---

## 三、文件结构

```
LifeOS/
├── habits.html          ← 习惯打卡页面（本 Step 生成）
│   ├── 多邻国风格月历（热力图）
│   ├── 习惯列表 + 打卡按钮
│   ├── 连续天数计算
│   ├── 角色激励弹窗（≥7天 / 100%）
│   ├── 添加/编辑习惯弹窗
│   └── 日期详情弹窗
├── js/
│   └── core.js          ← HabitStore（DAO 层，Step 2 已定义）
│       ├── create/update/delete/getAll
│       ├── checkIn(habitId, date, { completed })
│       ├── getRecordsByHabit / getRecordsByDate
│       └── getStreak(habitId) — 异步版本
└── css/
    └── style.css        ← 复用全局变量，页面内联 <style> 补充
```

---

## 四、数据流

```
用户点击打卡按钮
    ↓
toggleHabit(habit) — 切换 completed 状态
    ↓
LifeOS.Habit.checkIn(habitId, today, { completed: true })
    ↓
IndexedDB: habitRecords store — key = `${habitId}_${date}`
    ↓
loadData() — 重新拉取 habits + records
    ↓
computed: habitsWithStreak / todayRate / maxStreak / calendarDays
    ↓
Vue 响应式更新 UI（热力图颜色 + 连续天数 + 统计卡片）
    ↓
检查激励条件：streak >= 7 || todayRate === 100
    ↓
showEncourageDialog() — 随机选择高优先级角色
    ↓
优先使用 char.exampleLines.encourage（个性化台词）
    ↓
弹窗显示：角色头像 + 台词 + 连续天数
```

---

## 五、踩坑记录

### 坑 1：`Date.getDay()` 返回 0 表示周日

中文习惯是"周一开头"，但 JS 的 `getDay()` 是 0=周日。我们在月历第一行加了 `weekday-labels = ['日','一','二','三','四','五','六']`，与 `getDay()` 的 0-6 对应，**不需要偏移**。

### 坑 2：连续天数算法的"今天没打卡"边界

如果用户**昨天完成了，但今天还没打卡**，Streak 应该从**昨天**开始算（而不是今天）。代码中通过 `records[0].date === today ? today : yesterday` 处理这个边界。

### 坑 3：`records.value.filter` 在 Vue 3 中的响应式陷阱

`records` 是 `ref([])`，所以访问记录时必须用 `records.value`，而非 `records`。在 `setup()` 内部的操作（如 `getStreakSync`）直接使用 `records.value`，但在 `template` 中 Vue 会自动解包，所以不需要 `.value`。

### 坑 4：IndexedDB 的 key 冲突

`habitRecords` 的 key 是 `${habitId}_${date}`，这意味着一个习惯一天只能有一条记录。如果用户重复打卡，会自动覆盖。这是设计意图——一天的打卡状态是唯一的（完成/未完成）。

---

## 六、下一步

Step 7：每日回顾（Review）—— DID/GOOD/BAD/THOUGHTS 四栏复盘 + GRAI AI 分析框架。
