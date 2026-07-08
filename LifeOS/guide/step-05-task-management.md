# Step 5: 任务管理（Task Management）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建四象限任务管理页面，支持完成率计算、角色激励触发、倒计时可视化

---

## 一、为什么这么做？

### 1.1 为什么四象限是任务管理的核心？

**艾森豪威尔矩阵**（Eisenhower Matrix）是时间管理的经典框架：

| | 紧急 | 不紧急 |
|---|------|--------|
| **重要** | 🔴 立即做 | 🔵 计划做 |
| **不重要** | 🟡 委托做 | ⚪ 删除 |

**为什么用四象限而非纯列表？** 纯列表（如 Todoist）无法区分"重要但不紧急"（长期规划）和"紧急但不重要"（打断）。四象限强迫用户在创建任务时思考优先级，避免"瞎忙一天但重要的事情没做"的陷阱。

**自动 vs 手动分类**：
- **自动**：基于截止日期（紧急性）和优先级（重要性）计算
- **手动**：用户可以在弹窗中直接调整象限，覆盖自动结果
- 为什么允许手动？因为"重要/紧急"是主观判断，AI 无法完全替代用户的价值观。例如，"给妈妈打电话"对 AI 来说可能"不重要不紧急"，但对用户来说"重要"。

### 1.2 为什么角色激励在任务管理中触发？

| 场景 | 完成率 | 触发行为 | 情感效果 |
|------|--------|---------|---------|
| 完成当天 75% 任务 | ≥ 75% | 角色单人鼓励对话 | 成就感、被认可 |
| 完成当天 85% 任务 | ≥ 85% | 角色互道晚安（多角色互动） | 深度情感连接、仪式感 |
| 未完成 | < 75% | 无激励 | 轻度紧迫感（次日有动力） |

**为什么用"跨越阈值"而非"固定时间检查"？** 如果用户早上就完成了 85%，晚上 22:00 才统一检查，激励效果大打折扣。"实时跨越"确保用户在完成那一刻立即获得反馈，强化"完成任务 = 获得奖励"的条件反射。

### 1.3 倒计时进度条的视觉语义

```css
.countdown-fill { width: 75%; background: #34D399; }  /* 绿色：充裕 */
.countdown-fill { width: 90%; background: #FBBF24; }  /* 黄色：警告 */
.countdown-fill { width: 100%; background: #EF4444; } /* 红色：紧急 */
```

**为什么进度条从右到左填充？** 进度条长度 = 时间流逝比例。刚创建任务时（距离截止还有30天），进度条约 5%（绿色）。截止当天，进度条 100%（红色）。这是"时间正在流失"的可视化，催促用户行动。

---

## 二、核心代码解析

### 2.1 四象限自动计算

```javascript
const calculateQuadrant = (deadline, priority = 5) => {
    const daysUntil = daysBetween(new Date(), new Date(deadline));
    
    // 紧急性：距截止天数映射到 0-1
    let urgency;
    if (daysUntil <= 1) urgency = 1.0;
    else if (daysUntil <= 3) urgency = 0.8;
    else if (daysUntil <= 7) urgency = 0.6;
    else if (daysUntil <= 14) urgency = 0.4;
    else urgency = 0.2;
    
    // 重要性：优先级映射到 0-1
    const importance = priority / 10;
    
    // 象限判断
    if (importance >= 0.7 && urgency >= 0.7) return 'urgent-important';
    if (importance >= 0.7 && urgency < 0.7) return 'important-not-urgent';
    if (importance < 0.7 && urgency >= 0.7) return 'urgent-not-important';
    return 'not-urgent-not-important';
};
```

**算法解释**：
- 截止日期 ≤ 1 天：urgency = 1.0（极度紧急）
- 截止日期 2-3 天：urgency = 0.8（紧急）
- 截止日期 4-7 天：urgency = 0.6（较紧急）
- 截止日期 8-14 天：urgency = 0.4（一般）
- 截止日期 > 14 天：urgency = 0.2（不紧急）

- 优先级 ≥ 7：importance = 0.7+（重要）
- 优先级 < 7：importance = 0.6-（不重要）

**示例**：
- "明天考试复习"：deadline=1天 → urgency=1.0, priority=9 → importance=0.9 → **🔴 重要紧急**
- "学习日语 N2"：deadline=无 → urgency=0.2, priority=8 → importance=0.8 → **🔵 重要不紧急**
- "回复邮件"：deadline=2天 → urgency=0.8, priority=4 → importance=0.4 → **🟡 紧急不重要**

### 2.2 完成率实时计算

```javascript
const updateCompletionRate = () => {
    const today = LifeOS.Utils.formatDate();
    const todayTasksList = allTasks.value.filter(t => t.date === today);
    if (!todayTasksList.length) {
        completionRate.value = 0;
        return;
    }
    const completed = todayTasksList.filter(t => t.completed).length;
    completionRate.value = Math.round((completed / todayTasksList.length) * 100);
};
```

**为什么只统计今日任务？** 激励系统关注的是"今天完成得怎么样"。如果统计全部历史任务，完成率会趋近于一个固定值，无法反映当日表现。只有"今日任务"才能体现每日的进步感。

### 2.3 阈值跨越检测（核心逻辑）

```javascript
const toggleComplete = async (task) => {
    const prevRate = completionRate.value;  // 记录切换前的完成率
    await LifeOS.Task.toggleComplete(task.id);
    await loadTasks();  // 重新加载数据，更新完成率
    const newRate = completionRate.value;   // 切换后的完成率
    
    // 检测是否跨越阈值
    checkEncourageTrigger(prevRate, newRate);
};

const checkEncourageTrigger = (prevRate, newRate) => {
    // 从 <75% 跨越到 ≥75%：触发单人鼓励
    if (prevRate < 75 && newRate >= 75) {
        showEncourageDialog(75);
    }
    // 从 <85% 跨越到 ≥85%：触发晚安互动
    else if (prevRate < 85 && newRate >= 85) {
        showEncourageDialog(85);
    }
};
```

**为什么用 `prevRate < 75 && newRate >= 75` 而非 `newRate === 75`？** 因为用户可能一次完成多个任务，从 60% 直接跳到 80%。用 `=== 75` 会错过这个跳跃。用 `< 75` 和 `>= 75` 确保任何跨越都被捕获。

**为什么保存 `lastRate`？** 防止同一阈值重复触发。如果用户完成率 75%，取消一个任务回到 70%，再完成回到 75%——不应该再次触发激励。`lastRate` 记录上次触发过的最高完成率。

### 2.4 角色激励弹窗

```javascript
const showEncourageDialog = async (threshold) => {
    const chars = await LifeOS.Character.getAll();
    // 筛选高优先级角色，随机排序
    const sorted = chars.filter(c => c.priority >= 50).sort(() => Math.random() - 0.5);
    const char = sorted[0] || chars[0];  // 选第一个
    encourageChar.value = char;
    
    // 生成台词（基于角色性格）
    encourageMessage.value = getEncourageLine(char);
    showEncourage.value = true;
};

const getEncourageLine = (char) => {
    const lines = [
        `今天也完成得不错嘛！不愧是我看好的你~`,
        `很棒哦！继续这样下去，你一定会变得更强的。`,
        `哼哼，你这家伙还挺能干的嘛，让我有点刮目相看了。`
    ];
    return lines[Math.floor(Math.random() * lines.length)];
};
```

**为什么是随机台词而非 AI 生成？** 当前版本是 MVP，用预设台词模板。后续可以接入 LLM API，将 `dialogueStyle` + `personalityTags` + 场景描述作为 prompt，生成更个性化的台词。但现在预设台词已经能提供基础情感反馈。

### 2.5 任务卡片设计

```html
<div class="task-card" :class="{ completed: task.completed }" @click="openDetail(task)">
    <div class="task-card-header">
        <div class="task-checkbox" @click.stop="toggleComplete(task)">
            <span v-if="task.completed">✓</span>
        </div>
        <div class="task-card-title">{{ task.title }}</div>
    </div>
    <div class="task-countdown">
        <div class="countdown-bar">
            <div class="countdown-fill" :style="{ width: getDeadlinePercent(task) + '%', background: getDeadlineColor(task) }"></div>
        </div>
        <span class="countdown-text">{{ getDeadlineText(task) }}</span>
    </div>
</div>
```

**为什么 `.task-checkbox` 有 `@click.stop`？** 点击复选框时，如果不加 `.stop`，事件会冒泡到父元素 `.task-card`，触发 `openDetail(task)`——用户只想切换完成状态，却意外打开了详情弹窗。`.stop` 阻止事件冒泡，确保点击复选框只触发 `toggleComplete`。

---

## 三、CSS 关键设计

### 3.1 四象限网格

```css
.quadrants-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 16px;
    min-height: 600px;
}
```

**为什么是 2x2 网格而非 4x1 长条？** 2x2 布局直接对应艾森豪威尔矩阵的视觉结构——左上角是"重要紧急"（第一象限），用户视线首先到达。如果做成垂直列表，象限之间的对比关系会丢失。

### 3.2 完成卡片样式

```css
.task-card.completed {
    opacity: 0.6;
    background: rgba(248, 250, 252, 0.8);
}
.task-card.completed .task-card-title {
    text-decoration: line-through;
    color: var(--text-muted);
}
```

**为什么用 `opacity: 0.6` + `line-through`？** 完成任务的视觉弱化让用户聚焦在待办任务上。`line-through` 是经典的"已完成"标记，与 `opacity` 组合提供双重视觉反馈。

### 3.3 象限顶部色条

```css
.quadrant.urgent-important { border-top: 4px solid var(--color-urgent); }
.quadrant.important-not-urgent { border-top: 4px solid var(--color-important); }
.quadrant.urgent-not-important { border-top: 4px solid var(--color-warning); }
.quadrant.not-urgent-not-important { border-top: 4px solid var(--text-muted); }
```

**为什么用 `border-top` 而非背景色？** 背景色会覆盖整个象限区域，可能让卡片显得杂乱。顶部色条（4px）是微妙的标识，保持整体清洁，同时让用户一眼识别象限。

---

## 四、验证步骤

### 4.1 验证任务创建与四象限分类

1. 打开 `tasks.html`（强制刷新 Ctrl + F5）
2. 点击 **"添加任务"** → 弹窗
3. 填写：标题 = "明天考试复习"，截止日期 = 明天，优先级 = 9
4. 保存 → 任务应出现在 **🔴 重要紧急** 象限
5. 再创建：标题 = "学习日语 N2"，截止日期 = 30天后，优先级 = 8
6. 保存 → 任务应出现在 **🔵 重要不紧急** 象限

### 4.2 验证倒计时进度条

1. 创建任务，截止日期 = 明天
2. 任务卡片底部应显示红色进度条（约 90%+）和文字"还剩 1 天"
3. 创建任务，截止日期 = 7天后
4. 进度条应为黄色（约 50%）
5. 创建任务，截止日期 = 30天后
6. 进度条应为绿色（约 5%）

### 4.3 验证角色激励触发

1. 创建 4 个今日任务（确保角色库已导入）
2. 逐个点击复选框标记完成
3. 完成第 3 个时（75%）→ 应弹出角色激励弹窗
4. 点击"谢谢鼓励！"关闭弹窗
5. 完成第 4 个时（100%，跨越 85%）→ 应弹出晚安互动弹窗
6. 如果未触发，检查 Console 是否有错误

### 4.4 验证筛选功能

1. 点击 **"显示筛选"** → 筛选栏展开
2. 切换"显示范围"为"本周" → 只显示本周截止任务
3. 切换"状态"为"待办" → 只显示未完成任务
4. 点击任务卡片 → 打开编辑弹窗，可修改象限
5. 手动将任务从 🔴 改为 🔵 → 保存后卡片移动到对应象限

---

## 五、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 任务创建后不在四象限中 | 象限未自动计算 | 检查 `calculateQuadrant` 是否被调用，确认 `deadline` 和 `priority` 有值 |
| 完成率始终 0% | 没有今日任务 | 创建任务时确认 `date` 字段是今天（`LifeOS.Utils.formatDate()`） |
| 角色激励不触发 | 角色库为空 | 先导入角色库（characters.html），或检查 `Character.getAll()` 返回值 |
| 进度条颜色不对 | `getDeadlineColor` 计算错误 | 检查 `deadline` 格式是否为 YYYY-MM-DD |
| 已完成任务没有删除线 | CSS 未生效 | 检查 `.task-card.completed` 样式是否正确加载 |
| 筛选后象限为空 | 筛选条件过严 | 检查筛选条件是否与任务数据匹配（如"本周"需要截止日期在 7 天内） |

---

## 六、下一步预告

**Step 6: 习惯打卡（habits.html）**
- 5+ 习惯打卡面板（点击切换状态）
- 月历统计视图（多邻国风格：日期格颜色深浅表示完成度）
- 连续打卡天数计算（断签重置）
- 饮食特殊分析（图片上传 → AI 分析营养素 / 手动选择）

**Step 7: 每日回顾（review.html）**
- DID/GOOD/BAD/THOUGHTS 四个输入区
- 情绪天气记录（天气图标代指情绪）
- 经历日记自动生成
- GRAI 框架 AI 分析（Goal-Result-Analysis-Insights）

---

> 本文件位置：`guide/step-05-task-management.md`
> 对应新增/修改：
> - 新增：`tasks.html`（完整任务管理页面：四象限、任务卡片、倒计时、角色激励弹窗）
> - 修改：`css/style.css`（四象限网格、任务卡片、倒计时进度条、角色激励弹窗）
> - 依赖：`js/core.js`（Task DAO、Character DAO、Utils.calculateQuadrant）
