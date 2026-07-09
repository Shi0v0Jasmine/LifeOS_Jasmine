# Step 4: 时间轴模块（Timeline）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建双列时间轴（预计/实际），支持计时器、事件添加/编辑、任务关联

---

## 一、为什么这么做？

### 1.1 为什么时间轴用"像素定位"而非 CSS Grid 行？

| 方案 | 实现方式 | 问题 | 选择 |
|------|---------|------|------|
| **CSS Grid 行** | 每个30分钟一格，事件占 N 行 | 事件开始时间不是整点（如 09:15）时无法精确对齐 | ❌ 粒度不够 |
| **绝对定位（像素）** | 计算像素 `top` 和 `height` | 支持任意开始时间（09:15、09:23），精确到分钟 | ✅ |

**核心决策**：每个30分钟时间格固定 **40px 高度**。事件块的 `top` 位置通过公式计算：

```javascript
// 09:15 的 top 位置：
// (9 * 2 + 0) * 40 + (15 / 30) * 40 = 720 + 20 = 740px
top = (hour * 2 + (minute >= 30 ? 1 : 0)) * 40 + (minute % 30) / 30 * 40

// 持续 45 分钟的高度：
// 45 / 30 * 40 = 60px
height = durationMinutes / 30 * 40
```

这种方式让事件可以精确到任意分钟开始，不受30分钟粒度限制。代价是需要用 `position: absolute` 覆盖在时间格上方。

### 1.2 为什么计时器用 `setInterval` 而非 `Date.now()` 差值？

| 方案 | 实现 | 问题 |
|------|------|------|
| **每秒 `setInterval`** | `setInterval(() => elapsed++, 1000)` | 累计误差（如果页面挂起/休眠，interval 可能变慢） |
| **`Date.now()` 差值** | `elapsed = Math.floor((Date.now() - startTime) / 1000)` | 无累计误差，即使页面休眠后恢复也准确 | ✅ |

**我们的方案**：结合两者——`setInterval` 用于每秒更新 UI，但计算公式是 `Date.now() - startTime`：

```javascript
setInterval(() => {
    timerElapsed.value = Math.floor((Date.now() - timerStartTime.value) / 1000);
}, 1000);
```

这样既保证 UI 每秒更新，又避免累计误差。用户切走页面再回来，计时仍然准确。

### 1.3 为什么用 `prompt` 输入计时器名称而非弹窗？

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **自定义弹窗** | 美观、统一风格 | 需要额外模板和状态管理 | 可后续优化 |
| **`prompt()`** | 一行代码、立即获取输入 | 样式受浏览器控制、不够美观 | ✅ **MVP 阶段** |

**核心决策**：MVP 阶段用浏览器原生 `prompt` 快速实现。后续版本可以替换为自定义的 Vue 弹窗组件，与事件编辑弹窗风格统一。

---

## 二、核心代码解析

### 2.1 时间格生成

```javascript
const timeSlots = ref([]);
const SLOT_HEIGHT = 40; // 每个30分钟格的高度

for (let h = 0; h < 24; h++) {
    for (let m of [0, 30]) {
        const hour = String(h).padStart(2, '0');
        const minute = String(m).padStart(2, '0');
        timeSlots.value.push({
            time: `${hour}:${minute}`,   // 显示文本 "09:00"
            hour: h,                     // 数字 9
            minute: m,                   // 数字 0
            top: (h * 2 + (m === 30 ? 1 : 0)) * SLOT_HEIGHT  // 像素位置
        });
    }
}
```

**为什么预生成而非动态计算？** 时间格是静态的（0:00 到 23:30），预生成一次即可复用。Vue 的 `ref` 让它们在响应式系统中可用，但数据本身不会变化。

### 2.2 事件块的绝对定位计算

```javascript
const getEventStyle = (evt) => {
    const start = parseTime(evt.startTime);  // { hour: 9, minute: 15 }
    const end = parseTime(evt.endTime);      // { hour: 10, minute: 30 }
    
    // 计算 top 像素位置
    const top = (start.hour * 2 + (start.minute >= 30 ? 1 : 0)) * SLOT_HEIGHT 
              + (start.minute % 30) / 30 * SLOT_HEIGHT;
    
    // 计算持续时间（分钟）
    const duration = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute);
    
    // 计算高度（最小 24px，确保短事件也能显示文字）
    const height = Math.max(duration / 30 * SLOT_HEIGHT, 24);
    
    return { top: `${top}px`, height: `${height}px` };
};
```

**关键设计**：`Math.max(..., 24)` 确保即使事件只有 15 分钟，也能显示至少 24px 高度，包含标题和时间文字。如果没有这个限制，15 分钟事件只有 20px，文字会溢出或截断。

### 2.3 计时器实现

```javascript
const startTimer = () => {
    const name = prompt('请输入计时事件名称：', '专注时间');
    if (!name) return;
    timerEventName.value = name;
    timerRunning.value = true;
    timerStartTime.value = Date.now();  // 记录开始时间戳
    timerElapsed.value = 0;
    
    // 每秒更新 elapsed
    timerInterval = setInterval(() => {
        timerElapsed.value = Math.floor((Date.now() - timerStartTime.value) / 1000);
    }, 1000);
};

const stopTimer = async () => {
    clearInterval(timerInterval);
    const now = new Date();
    const startTime = new Date(now.getTime() - timerElapsed.value * 1000);
    
    // 自动创建实际事件
    await LifeOS.Timeline.create({
        title: timerEventName.value,
        startTime: `${startTime.getHours()}:${startTime.getMinutes()}`,
        endTime: `${now.getHours()}:${now.getMinutes()}`,
        category: 'work',  // 默认工作类别
        description: `自动计时记录，持续 ${timerDisplay.value}`,
        type: 'actual'      // 自动记录到实际列
    });
    
    timerRunning.value = false;
    await loadEvents();  // 刷新时间轴显示
};
```

**为什么计时器事件默认 category = 'work'？** 计时器通常用于专注工作/学习。用户停止计时后可以在弹窗中编辑，改为正确的类别。

### 2.4 点击时间格添加事件

```javascript
const openAddEvent = (type, slot) => {
    // slot = { time: '09:00', hour: 9, minute: 0, top: 720 }
    const nextHour = slot.minute === 30 ? slot.hour + 1 : slot.hour;
    const nextMinute = slot.minute === 30 ? 0 : 30;
    
    eventForm.value = {
        title: '',
        startTime: `${slot.hour}:${slot.minute}`,      // 点击格的时间
        endTime: `${nextHour}:${nextMinute}`,           // 默认持续30分钟
        category: 'other',
        description: '',
        taskId: '',
        type: type  // 'planned' 或 'actual'
    };
    showEventModal.value = true;
};
```

**为什么默认持续30分钟？** 因为时间轴以30分钟为粒度。用户点击 "09:00" 格，默认事件从 9:00 到 9:30。用户可以在弹窗中手动调整为任意时间。

### 2.5 事件与任务关联

```javascript
// 弹窗中提供下拉框，选择今日任务
<select v-model="eventForm.taskId">
    <option value="">不关联任务</option>
    <option v-for="task in todayTasks" :key="task.id" :value="task.id">
        {{ task.title }}
    </option>
</select>
```

**为什么关联任务？** 时间轴中的事件可能来自 To Do List 的任务。例如，用户在任务列表中创建了"写论文"，然后将这个任务安排到时间轴的 9:00-11:00。`taskId` 字段建立这种关联，后续可以：
- 点击时间轴事件直接跳转到任务详情
- 任务完成时自动标记时间轴事件为完成
- 统计某任务实际花费的时间

### 2.6 从任务条拖拽到预计时间轴（v1.2 补充）【2026-07-09 14:38】

F-021 的落点在时间轴页面：日视图顶部展示当前日期的未完成任务条，用户把任务拖到"预计安排"列的某个 30 分钟时间格后，系统自动创建一条 planned 事件。

模板结构：

```html
<section class="task-sidebar-list timeline-task-dock" data-testid="timeline-task-dock">
    <div v-for="task in schedulableTasks"
         class="task-sidebar-item timeline-task-drag-item"
         draggable="true"
         :data-task-id="task.id"
         @dragstart="onTaskDragStart(task, $event)"
         @dragend="onTaskDragEnd">
        <span class="task-name">{{ task.title }}</span>
    </div>
</section>

<div v-for="slot in timeSlots"
     class="time-slot"
     @dragenter.prevent="onSlotDragEnter('planned', slot, $event)"
     @dragover.prevent="onSlotDragOver('planned', slot, $event)"
     @drop.prevent.stop="onTaskDrop('planned', slot, $event)">
</div>
```

关键状态：

```javascript
const todayTasks = ref([]);
const draggingTask = ref(null);
const scheduledTaskIds = computed(() => new Set(
    plannedEvents.value.map(e => e.taskId).filter(Boolean)
));
const schedulableTasks = computed(() => todayTasks.value.filter(task => (
    !task.completed && !scheduledTaskIds.value.has(task.id)
)));
```

**为什么用当前日期的任务，而不是固定今日任务？** 时间轴已经支持日期切换。如果用户切到明天，任务条也应显示明天的任务，否则拖拽会把"今天的任务"误排到其他日期。加载时使用：

```javascript
todayTasks.value = await LifeOS.Task.getByDate(currentDate.value);
```

拖拽 payload：

```javascript
event.dataTransfer.setData('application/x-lifeos-task', JSON.stringify({
    id: task.id,
    title: task.title,
    description: task.description || '',
    category: task.category || ''
}));
```

落点创建事件：

```javascript
await LifeOS.Timeline.create({
    title: task.title,
    description: task.description || '',
    startTime: range.startTime,
    endTime: range.endTime,
    type: 'planned',
    date: currentDate.value,
    category: inferTaskCategory(task),
    taskId: task.id
});
```

**为什么只允许 drop 到预计列？** F-021 是"规划今天"场景。实际列代表已经发生的记录，仍应由计时器或手动填写创建，避免把未执行任务误记为已发生。

---

## 三、CSS 关键设计

### 3.1 时间轴网格

```css
.timeline-body {
    display: flex;
    flex: 1;
    overflow-y: auto;   /* 可滚动 */
    position: relative;  /* 事件块的定位上下文 */
}

.time-grid {
    flex: 1;
    position: relative;  /* 事件块绝对定位于此 */
    background: rgba(255, 255, 255, 0.3);
}
```

**为什么 `.time-grid` 需要 `position: relative`？** 事件块使用 `position: absolute`，其定位参考的是最近的 `position: relative` 祖先。如果没有这个设置，事件块会相对于整个页面定位，导致位置错乱。

### 3.2 事件块悬停效果

```css
.timeline-event {
    position: absolute;
    z-index: 10;
    transition: all 0.2s;
}

.timeline-event:hover {
    transform: translateX(-2px);  /* 微微向左偏移 */
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
    z-index: 20;  /* 悬停时提升层级，避免被其他事件遮挡 */
}
```

**为什么 `z-index: 20` 只在 hover 时？** 默认 `z-index: 10` 让所有事件块在同一层。当用户悬停某个事件时，提升到 20，确保它显示在其他可能重叠的事件之上。这是时间轴 UI 的常见模式（类似 Google Calendar）。

### 3.3 类别颜色系统

```css
.category-learning { background: rgba(125, 211, 252, 0.35); }  /* 水蓝 */
.category-work { background: rgba(52, 211, 153, 0.35); }       /* 青绿 */
.category-rest { background: rgba(253, 230, 138, 0.45); }     /* 鹅黄 */
.category-sport { background: rgba(251, 191, 36, 0.35); }     /* 琥珀 */
.category-other { background: rgba(148, 163, 184, 0.25); }   /* 灰色 */
```

**为什么用半透明背景？** 时间轴上有时间格的分割线（`border-bottom`），半透明背景让分割线隐约可见，增强"时间流逝"的视觉感。同时彩色事件块在白色背景上不会过于刺眼。

### 3.4 任务拖拽条与投放反馈（v1.2 补充）

```css
.timeline-task-dock {
    margin-bottom: 12px;
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    background: var(--bg-card);
}

.timeline-task-dock-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
}

.timeline-task-drag-item {
    flex: 0 0 auto;
    max-width: 220px;
    cursor: grab;
}

.time-slot.drag-over {
    background: rgba(52, 211, 153, 0.18);
    box-shadow: inset 0 0 0 2px rgba(52, 211, 153, 0.35);
}
```

**为什么横向滚动而非独立侧栏？** 当前时间轴页面已经是双列主结构，再加真正的侧边栏会压缩时间轴宽度。横向任务条占用较少垂直空间，也不会改动双列布局。

---

## 四、验证步骤

### 4.1 验证时间轴页面

1. 打开 `timeline.html`（强制刷新 Ctrl + F5）
2. 检查：左侧"预计安排"、右侧"实际安排"两列
3. 检查：时间刻度从 00:00 到 23:30，每30分钟一格

### 4.2 验证添加事件

1. 点击"预计安排"列的 **09:00** 时间格
2. 弹窗应显示：开始时间 = 09:00，结束时间 = 09:30
3. 填写标题 = "测试事件"，类别 = "学习"，点击保存
4. 事件块应出现在预计列的 9:00 位置，水蓝色背景

### 4.3 验证计时器

1. 点击顶部 **"▶ 开始计时"** 按钮
2. 输入事件名称 = "专注学习"
3. 顶部出现绿色计时器条，显示秒数递增
4. 等待 30 秒后，点击 **"⏹ 停止计时"**
5. 实际列应出现新事件，标题 = "专注学习"，时间范围 = 当前时间往前30分钟

### 4.4 验证编辑/删除

1. 点击已创建的事件块
2. 弹窗应显示"编辑事件"，所有字段正确填充
3. 修改标题，点击保存 → 事件块标题更新
4. 再次点击事件块，点击"删除" → 事件块消失

### 4.5 验证时间轴任务条

1. 确保在任务页面（tasks.html）创建了今日任务
2. 刷新时间轴页面
3. 日视图顶部"可安排任务"区域应显示任务列表
4. 任务前的圆点：未完成 = 红色，已完成 = 绿色

### 4.6 验证拖拽任务到时间轴（v1.2 补充）

1. 在任务页面创建一个未完成任务，日期为当前时间轴日期
2. 打开 `timeline.html`，切到"日"视图
3. 在任务条中找到该任务，拖拽到"预计安排"列的任意时间格
4. 放开鼠标后，应出现一个 30 分钟事件块
5. 点击事件块，确认：
   - 标题与任务标题一致
   - `taskId` 已关联原任务
   - 类型为 `planned`
   - 日期等于当前时间轴日期

---

## 五、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 事件块位置不对（偏移） | `getEventStyle` 计算错误 | 检查 `startTime` 格式是否为 "HH:MM"，检查 `parseTime` 是否正确拆分 |
| 计时器停止后没有创建事件 | `stopTimer` 中 `create` 失败 | 检查 Console 错误，确认数据库已初始化 |
| 事件块重叠看不清 | 多个事件在同一时间段 | 这是正常情况，hover 时提升 z-index 显示当前事件 |
| 时间轴无法滚动 | `overflow-y: auto` 未生效 | 检查 `.timeline-body` 的高度是否被父元素限制 |
| 时间轴任务条为空 | 当前时间轴日期没有未完成任务，或任务已被 planned 事件关联 | 确保任务 `date` 等于 `currentDate`，且尚未被安排 |
| 拖拽后没有创建事件 | 浏览器没有触发 HTML5 Drag & Drop，或 drop 目标不是预计列 | 确认任务卡有 `draggable="true"`，时间格有 `@drop.prevent.stop`，并检查 Console |
| 已拖过的任务不再显示 | 该任务已被 planned 事件关联 | 这是预期行为；`schedulableTasks` 会过滤已安排任务，避免重复排期 |
| 事件编辑后时间未更新 | 弹窗中 `<input type="time">` 的值格式 | 检查 `v-model` 绑定是否正确，浏览器时间输入格式为 "HH:MM" |

---

## 六、下一步预告

**Step 5: 任务管理（tasks.html）**
- 四象限卡片展示（重要-紧急 / 重要-不紧急 / 紧急-不重要 / 不重要-不紧急）
- 任务添加/编辑/删除
- 倒计时可视化 + 进度条（DDL 剩余天数）
- 完成率计算 + 角色激励触发（75% 和 85% 阈值）

**Step 6: 习惯打卡（habits.html）**
- 5+ 习惯打卡面板
- 月历统计视图（多邻国风格）
- 连续打卡天数
- 饮食特殊分析（AI / 手动）

---

> 本文件位置：`guide/step-04-timeline.md`
> 对应新增/修改：
> - 新增：`timeline.html`（完整时间轴页面：双列、计时器、事件弹窗、任务关联、拖拽任务排期）
> - 修改：`css/style.css`（时间轴容器、事件块、类别颜色、计时器条、任务拖拽条）
> - 依赖：`js/core.js`（Timeline DAO、Task DAO）
