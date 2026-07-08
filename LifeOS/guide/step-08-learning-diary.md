# Step 8: 学习日记（Learning Diary）— RPG 技能树 + 经验值系统

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：将学习进度游戏化，用 RPG 技能树 + XP 升级系统驱动持续学习动力

---

## 一、为什么这么做？

### 1.1 为什么用 RPG 技能树而非纯打卡？

**传统学习打卡**（如"今天学习了 3 小时"）的问题是：**时间 ≠ 能力成长**。刷题 3 小时和走神 3 小时在打卡记录中是一样的。用户会逐渐发现"我打卡了但水平没提高"，导致动力衰减。

**RPG 技能树**的核心假设：**能力成长 = 技能点（XP）积累 + 等级突破（Level Up）**。它把抽象的学习过程转化为具体的、可视化的进度：

| 传统打卡 | RPG 技能树 |
|---------|-----------|
| "今天学了 2 小时 Python" | "Python 技能 +50 XP，进度 45% → Lv.2" |
| 进度不可见，容易放弃 | 进度条实时反馈，接近升级时更有动力 |
| 跨领域学习无法比较 | 总等级 / 总 XP 提供统一的能力度量 |
| 缺乏成就感 | Level Up 时的庆祝动画 + 角色台词 = 多巴胺峰值 |

**为什么叫"技能树"而非"技能列表"？** "树"暗示了**依赖关系**和**分支选择**——例如"React 进阶"需要先解锁"JavaScript 基础"。虽然目前 v1.0 只有层级结构（根-子-孙），但数据模型预留了 `parentId` 字段，v1.1 可以扩展为真正的依赖解锁机制。

### 1.2 为什么 XP 升级用指数递增（1.5 倍）？

```javascript
skill.xpToNext = Math.floor(skill.xpToNext * 1.5); // 每级递增 1.5 倍
```

**等级设计的心理学**（参考《魔兽世界》《原神》等 RPG）：

| 等级 | 升级所需 XP | 心理定位 | 策略 |
|-----|------------|---------|------|
| Lv.1 → Lv.2 | 100 | 新手期，快速反馈 | 让用户迅速获得第一次升级，建立正循环 |
| Lv.2 → Lv.3 | 150 | 成长期 | 稍有挑战，但仍可较快达成 |
| Lv.3 → Lv.4 | 225 | 熟练期 | 需要持续投入，但进度可见 |
| Lv.5+ | 500+ | 精通期 | 每级成为里程碑，升级有仪式感 |

**为什么用 1.5 倍而非线性（每级固定 100 XP）？** 线性增长会导致后期升级太容易，失去挑战感。1.5 倍指数增长使前期快速、后期缓慢，符合**学习曲线**（先快后慢）。Lv.10 需要约 10,000 总 XP，意味着用户需要长期投入——这是设计意图。

### 1.3 为什么快捷 XP 按钮是 +10 / +50 / +100？

这三个数值是**常用学习粒度的标准化**：

| 数值 | 对应场景 | 时间/内容 |
|-----|---------|----------|
| +10 | 碎片学习 | 读一篇短文、复习 10 个单词、看一个短视频 |
| +50 | 标准学习 | 完成一节网课、刷一组练习题、阅读 20 页书 |
| +100 | 深度学习 | 完成一个项目模块、写一篇论文段落、模拟考试一次 |

**为什么不用"自动从时间轴计算"？**（虽然 PRD 中 F-077 要求时间轴联动）自动计算需要精确识别"学习时间"并评估内容难度，这涉及复杂的 AI 判断（看 1 小时视频 ≠ 有效学习 1 小时）。手动输入 XP 更诚实、更可控，也是 v1.0 的务实选择。

### 1.4 为什么学习笔记叫"果实"？

**笔记 = 挂在技能树上的果实**。每个技能节点有 `notes` 数组（笔记列表），笔记越多"树越茂盛"。这个隐喻来自《进击的巨人》的"道路"和《原神》的天赋树——能力不是抽象的数值，而是**具体的、可回顾的学习记录**。

| 功能 | 隐喻 | 情感效果 |
|------|------|---------|
| 添加笔记 | 树上结出新果实 | 即时成就感 |
| 查看笔记列表 | 回顾丰收 | 积累感、证明自己在成长 |
| 高等级 + 多笔记 | 参天大树 | 身份认同（"我是 Python 专家"） |

### 1.5 为什么升级时触发角色激励？

升级是**学习过程中最强烈的正反馈时刻**。对比：
- 任务完成：一次性事件（"任务做完了"）
- 习惯打卡：日常重复（"又打卡一天"）
- 技能升级：里程碑事件（"我从 Lv.3 变成 Lv.4 了！"）

**角色台词选择**：使用 `encourage`（鼓励），因为升级是"超越自我"的场景，与任务完成/打卡的"完成今日目标"不同。例如：
- 及川彻：「YaHoo⭐~！又变强了呢～不过，可别得意忘形哦，因为我会比你更耀眼！」
- 菅原孝支：「没关系的，你已经做得很好了。接下来，只要再相信自己一点点就好。」
- 木兔光太郎：「Hey Hey Hey!!! 这才是学习该有的样子！最棒了！」

---

## 二、技术实现

### 2.1 树形数据结构与递归渲染

```javascript
// SkillStore 数据模型
{
    id: 'uuid', name: 'Python 进阶', parentId: 'uuid-js-basics', // 父技能 ID
    xp: 45, level: 2, xpToNext: 150,
    isShortTerm: true, deadline: '2024-03-15',
    color: '#7DD3FC', notes: [{ id, text, date }]
}
```

**为什么用 `parentId` 而非嵌套数组？** 嵌套数组（`children: []`）在数据库中存储时会导致深层更新困难（需要递归更新整个树）。扁平结构（`parentId`）使每个节点独立存储，CRUD 操作简单。前端渲染时再根据 `parentId` 组装为树形。

**递归渲染组件**：
```javascript
const SkillCard = {
    props: ['skill', 'children', 'expanded', 'level'],
    // 模板中：
    // 1. 渲染自身卡片
    // 2. 如果 expanded && children.length，递归渲染 <skill-card> 子组件
};
```

**为什么用 `expandedSkills` 对象而非每个组件独立维护展开状态？** 父组件统一管理展开状态，使"一键展开/收起全部"成为可能。`expandedSkills` 是 `{ [skillId]: boolean }` 的对象，Vue 的响应式系统自动追踪变化。

### 2.2 XP 自动升级算法

```javascript
async addXP(id, amount) {
    const skill = await db.get('skills', id);
    if (!skill) return null;
    skill.xp += amount;
    while (skill.xp >= skill.xpToNext) {
        skill.xp -= skill.xpToNext;  // 扣除升级所需 XP，保留余量
        skill.level++;                // 等级 +1
        skill.xpToNext = Math.floor(skill.xpToNext * 1.5); // 下一级更难
    }
    skill.updatedAt = Utils.now();
    await db.put('skills', skill);
    return skill;
}
```

**关键设计**：`skill.xp` 是**当前等级内的 XP**，不是总 XP。例如：
- Lv.2, xp: 45/150 → 当前等级有 45 XP，再得 105 XP 就升级
- 不是"总 XP = 245（Lv.1 的 100 + 当前 45 + 150）"

**为什么这样设计？** 如果 XP 是累计总量，那么进度条计算会变成 `(总XP - 之前所有等级所需XP) / 当前等级所需XP`，代码复杂且容易出错。每级独立 XP 使进度条计算简单：`xp / xpToNext`。

### 2.3 升级检测与动画触发

```javascript
const addXP = async (id, amount) => {
    const before = await LifeOS.Skill.getAll();
    const beforeSkill = before.find(s => s.id === id);
    const beforeLevel = beforeSkill ? beforeSkill.level : 1;

    const updated = await LifeOS.Skill.addXP(id, amount);  // 更新数据库
    await loadSkills();  // 重新拉取所有技能

    if (updated && updated.level > beforeLevel) {
        showLevelUpDialog(updated);  // 升级了！触发弹窗
    }
};
```

**为什么需要 `beforeLevel`？** `addXP` 返回的 `updated` 对象已经包含新等级。比较 `beforeLevel` 和 `updated.level` 才能判断是否发生了升级。这是**数据库事务的边界检测**：在写入前后读取状态，比较差异。

**升级动画**：`levelUpPulse` CSS keyframe 动画——先放大 2%（overshoot），然后回弹，配合金色边框发光。这种"弹性"反馈是游戏 UI 的标准做法（如《原神》角色升级时的闪光效果）。

### 2.4 XP 进度条可视化

```javascript
const xpPercent = computed(() => {
    return Math.min(100, Math.round((props.skill.xp / props.skill.xpToNext) * 100));
});
```

**为什么用 `Math.min(100, ...)`？** 理论上 `xp` 不会超过 `xpToNext`（因为 `addXP` 的 `while` 循环会立即处理升级），但防御性编程确保进度条不会溢出。`Math.round` 避免小数百分比导致进度条宽度计算不精确。

**进度条动画**：`transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)`——弹性缓动函数，XP 增加时进度条像弹簧一样 overshoot 再回弹，增强"获得 XP"的反馈感。

### 2.5 技能图标随等级变化

```javascript
const skillIcon = computed(() => {
    const icons = ['🌱', '🌿', '🌳', '⭐', '👑', '🔥', '💎', '🌟'];
    return icons[Math.min(props.skill.level - 1, icons.length - 1)];
});
```

| 等级 | 图标 | 隐喻 |
|-----|------|------|
| Lv.1 | 🌱 | 种子——刚萌芽 |
| Lv.2 | 🌿 | 幼苗——开始成长 |
| Lv.3 | 🌳 | 小树——初具规模 |
| Lv.4 | ⭐ | 星星——开始闪耀 |
| Lv.5 | 👑 | 王冠——领域精通 |
| Lv.6 | 🔥 | 火焰——炉火纯青 |
| Lv.7 | 💎 | 钻石——珍贵稀有 |
| Lv.8+ | 🌟 | 超星——传说级别 |

### 2.6 递归删除与树形折叠

```javascript
const deleteRecursively = async (id) => {
    const children = getChildren(id);  // 获取所有子技能
    for (const c of children) await deleteRecursively(c.id);  // 先删子技能
    await LifeOS.Skill.delete(id);  // 再删自身
};
```

**为什么先删子后删父？** IndexedDB 的 `parentId` 外键约束没有数据库级联删除（IndexedDB 不支持外键约束），所以手动实现级联。如果先删父，子技能会变成"孤儿节点"（`parentId` 指向不存在的 ID）。

---

## 三、文件结构

```
LifeOS/
├── learning.html          ← 学习日记页面（本 Step 生成）
│   ├── 统计面板（总 XP / 总等级 / 技能数 / 最高等级）
│   ├── 视图切换（列表 / 星图 — 星图 v1.1）
│   ├── 技能卡片树（递归渲染：根技能 → 子技能 → 孙技能）
│   │   ├── 等级徽章 + 目标标签（短期/长期）
│   │   ├── XP 进度条（弹性动画）
│   │   ├── 快捷 +XP 按钮（+10 / +50 / +100）
│   │   ├── 展开/收起详情
│   │   ├── 描述 + 学习笔记（"果实"）
│   │   └── 递归子技能卡片
│   ├── 添加/编辑技能弹窗
│   │   ├── 名称、描述、父技能选择
│   │   ├── 目标类型（短期/长期）+ 截止日期
│   │   └── 颜色选择器
│   └── 升级激励弹窗（角色 + celebrate 台词）
├── js/
│   └── core.js            ← SkillStore（DAO 层，Step 2 已定义）
│       ├── create/update/delete/getAll/getChildren
│       ├── addXP(id, amount) — 自动升级 + 1.5x 递增
│       └── 数据模型：parentId, xp, level, xpToNext, notes[], color
└── css/
    └── style.css            ← 复用全局变量，页面内联 <style> 补充
```

---

## 四、数据流

```
用户打开 learning.html
    ↓
onMounted → loadSkills() → LifeOS.Skill.getAll()
    ↓
computed: rootSkills（parentId === null） + 递归子技能
    ↓
Vue 渲染技能卡片树（根技能 → 子技能 → 孙技能）
    ↓
用户点击 "+50 XP" 按钮
    ↓
addXP(skillId, 50)
    ↓
记录升级前等级 beforeLevel
    ↓
LifeOS.Skill.addXP(id, 50) → IndexedDB 更新
    ↓
loadSkills() → 重新拉取所有技能
    ↓
比较新等级 vs beforeLevel
    ↓
如果升级：showLevelUpDialog(skill)
    ↓
随机选择高优先级角色 → 使用 exampleLines.encourage（个性化庆祝台词）
    ↓
弹窗：金色星星动画 + 角色头像 + 升级台词 + "太棒了！"按钮
    ↓
用户点击"太棒了！"关闭弹窗

用户展开技能卡片 → 点击"添加笔记"输入框
    ↓
输入笔记内容 → 回车或点击添加按钮
    ↓
addNote(skillId, text) → Skill.update(skillId, { notes: [...existing, newNote] })
    ↓
loadSkills() → 笔记列表更新
    ↓
保持展开状态（expandedSkills[skillId] = true）
```

---

## 五、踩坑记录

### 坑 1：Vue 3 递归组件的 `emit` 传递

在递归组件 `<skill-card>` 中，子组件需要通过 `$emit` 或 `emit` 函数向父组件传递事件。在 Vue 3 的 `setup` 函数中，使用 `emit` 参数：

```javascript
// 正确：setup 中定义 submitNote，返回给 template
setup(props, { emit }) {
    const submitNote = () => {
        emit('add-note', props.skill.id, newNote.value.trim());
    };
    return { submitNote, emit };
}
```

**错误做法**：在 `methods` 中使用 `this.emit`——Vue 3 的 `setup` 函数中 `this` 不指向组件实例，没有 `emit` 属性。应该使用 `setup` 返回的 `emit` 函数，或 Options API 的 `this.$emit`。

### 坑 2：递归删除的级联顺序

如果先删除父技能再删除子技能，子技能会变成"孤儿节点"（`parentId` 指向不存在的 ID）。解决方案：先递归删除所有子技能，再删除父技能。

```javascript
const deleteRecursively = async (id) => {
    const children = getChildren(id);  // 先获取子技能
    for (const c of children) await deleteRecursively(c.id);  // 递归删子
    await LifeOS.Skill.delete(id);  // 最后删自己
};
```

### 坑 3：升级动画只在内存中

`recentLevelUp` 字段是临时加到内存中的技能对象上，用于触发动画：

```javascript
s.recentLevelUp = true;
setTimeout(() => { s.recentLevelUp = false; }, 2000);
```

**不会持久化到 IndexedDB**，因为 `loadSkills()` 重新拉取数据后 `recentLevelUp` 会丢失。这是设计意图——升级动画只在升级发生的瞬间触发一次，刷新页面后不再显示。

### 坑 4：XP 进度条的百分比计算

`xpPercent` 是 `xp / xpToNext * 100`，但 `xp` 和 `xpToNext` 是整数。如果 `xp = 1, xpToNext = 3`，`1/3 = 0.333...`，`Math.round(33.333...)` = 33。这是正确的，但如果用户看到"33%"可能会觉得进度条看起来不到 1/3。用 `Math.round` 而非 `Math.floor` 是因为四舍五入更符合直觉（1/3 更接近 33% 而非 0%）。

### 坑 5：父技能选择时的循环依赖

编辑技能时，如果用户把父技能设为自己的子技能（或子技能的子技能），会导致无限循环。解决方案：编辑时排除自己和自己的所有后代：

```javascript
const availableParents = computed(() => {
    const descendants = new Set();
    const collect = (id) => {
        const children = skills.value.filter(s => s.parentId === id);
        children.forEach(c => { descendants.add(c.id); collect(c.id); });
    };
    collect(editingSkill.value.id);
    descendants.add(editingSkill.value.id);
    return skills.value.filter(s => !descendants.has(s.id));
});
```

---

## 六、下一步

**v1.0 核心模块已全部完成！**（Dashboard 首页是最后一个未完成的 Must Have，当前为占位状态）

**v1.1 增强计划**：
- 技能树星图/树状图可视化（Canvas/SVG 渲染）
- 时间轴联动 XP（自动提取学习时长 → 转化为 XP）
- 技能依赖解锁（"需要先完成 JavaScript 基础才能解锁 React"）
- 多技能并行甘特图视图
- 学习统计面板（XP 趋势、各技能时长分布）

**v2.0 未来方向**：
- ASR 口述生成任务（语音输入 → 自动创建任务）
- 技能树 AI 关键词提取（学习时间轴复盘 → 自动关联到技能节点）
- 饮食 AI 营养分析（多模态图片识别）
- 经历日记 AI 生成（问答 → 连贯 Markdown 日记）
- 云同步、社交分享、原生 App
