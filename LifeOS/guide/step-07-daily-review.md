# Step 7: 每日回顾（Daily Review）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建 DID/GOOD/BAD/THOUGHTS 结构化复盘 + GRAI AI 分析框架 + 情绪追踪

---

## 一、为什么这么做？

### 1.1 为什么用 DID/GOOD/BAD/THOUGHTS 四栏框架？

**四栏框架**是结合了反思日记（Reflective Journal）和 OKR 回顾的混合体：

| 栏位 | 功能 | 心理学原理 | 典型内容 |
|-----|------|----------|---------|
| **DID** | 事实记录 | **认知卸载** — 把大脑中的待办/完成事项写下来，释放工作记忆 | 今天完成的任务、读的书、见的人 |
| **GOOD** | 正向强化 | **积极心理学** — 刻意关注做得好的地方，对抗负面偏差 | 效率高的时刻、好的决策、情绪管理 |
| **BAD** | 问题识别 | **成长型思维** — 不自我批评，而是客观记录改进点 | 拖延的触发器、分心的场景、未完成的计划 |
| **THOUGHTS** | 灵感捕获 | **创造性思维** — 闪念通常只存在 5-30 秒，必须立即记录 | 金句、顿悟、新的方法论、有趣的观察 |

**为什么不是纯自由日记？** 纯自由日记（如"今天过得还行..."）在回顾时**不可检索**。四栏框架强制结构化输入，使后续 AI 分析有明确的信号源。例如：
- 想知道"我最近哪几天效率最高" → 搜索 GOOD 栏
- 想知道"什么场景让我分心" → 搜索 BAD 栏
- 想知道"我的灵感通常在什么时候出现" → 搜索 THOUGHTS 栏 + 时间戳

**为什么 Diary（随笔）是第五栏？** 四栏是**结构化**，Diary 是**非结构化**。有些情绪/感受无法归类到 DID/GOOD/BAD/THOUGHTS 中，例如"今天下雨了，我想起了小时候..."——这些属于 Diary，是完整的自我叙事。

### 1.2 为什么追踪情绪？

**情绪是行为的先行指标**。心理学研究表明：
- 焦虑情绪 → 决策质量下降 30-40%（工作记忆被占用）
- 积极情绪 → 创造力提升（Broaden-and-Build 理论）
- 疲劳 → 意志力（ego depletion）耗尽，更容易放弃习惯

| 情绪 | 典型行为模式 | 应对策略 |
|-----|------------|---------|
| 焦虑 | 反复检查手机、拖延重要任务 | 降低任务粒度、先做5分钟最简单的 |
| 疲惫 | 放弃习惯打卡、吃垃圾食品 | 允许减量完成（如"只读1页"） |
| 兴奋 | 过度承诺、列太多计划 | 把额外能量记录下来，留给明天 |
| 低落 | 否定所有成就、放弃复盘 | 强制阅读 GOOD 栏，用事实对抗情绪 |

**为什么用表情选择而非 1-10 分评分？** 表情选择更直觉（takes <1 秒），而数字评分需要"翻译"情绪为抽象数字，增加认知负担。8 个表情覆盖主要情绪空间：开心/平静/疲惫/焦虑/低落/生气/兴奋/感恩。

### 1.3 为什么用 GRAI 框架做 AI 分析？

**GRAI = Goal · Result · Analysis · Insight**，是项目复盘（Retrospective）的经典框架：

| 维度 | 问题 | 数据来源 |
|-----|------|---------|
| **Goal** | 今天的主要目标是什么？ | DID 栏中提取第一行/最重要项 |
| **Result** | 目标完成了多少？ | DID 栏统计完成项数 + 任务完成率 |
| **Analysis** | 为什么成功/失败？ | GOOD 和 BAD 对比分析 |
| **Insight** | 学到了什么？下次怎么做？ | THOUGHTS 栏提取核心领悟 |

**为什么 GRAI 比纯总结更适合 AI？** AI 的弱点是"幻觉"（编造不存在的内容）。GRAI 框架的每个维度都有**明确的数据来源**，限制 AI 只能在用户提供的素材上加工，而不是自由发挥。这是**结构化提示工程（Structured Prompting）**的实践。

**当前实现是本地模拟版，后续接入 LLM 时**：
- Prompt 模板："基于以下今日复盘，用 GRAI 框架分析。DID: [内容] GOOD: [内容] BAD: [内容] THOUGHTS: [内容]"
- 输出要求：每个维度不超过 50 字，用用户的第一人称

### 1.4 为什么角色激励在回顾时触发？

| 场景 | 角色台词类型 | 情感定位 |
|-----|------------|---------|
| 完成回顾 | `goodNight`（晚安/告别） | 一天的"结束仪式" |
| 连续 7 天回顾 | `encourage`（鼓励） | 认可坚持行为 |

**为什么用 `goodNight` 而非 `encourage`？** 回顾是一天结束时的行为，角色说"晚安"比"加油"更符合场景。例如：
- 菅原孝支："今天也谢谢你。好好休息吧，明天的你会更加出色。"
- 及川彻："今天也辛苦了～呐，明天也要加油哦，我会在梦里给你传最完美的球的。"
- 赤苇京治："今天辛苦了。好好休息...愿你在梦里也打出最棒的球。"

---

## 二、技术实现

### 2.1 四栏表单与响应式保存状态

```javascript
const reviewForm = ref({
    did: '', good: '', bad: '', thoughts: '', diary: '', emotion: '', emotionReason: ''
});

// 监听任何变化，标记未保存
watch(() => JSON.stringify(reviewForm.value), () => { saved.value = false; });
```

**为什么用 `JSON.stringify` 做 deep watch？** Vue 3 的 `watch` 默认是浅监听。`reviewForm` 是对象，修改 `reviewForm.did` 不会触发对 `reviewForm` 本身的引用变化。`JSON.stringify` 是简单的 deep equality 检测，适合小型对象。

### 2.2 日期导航与数据加载

```javascript
const loadDate = async (date) => {
    currentDate.value = date;
    const data = await LifeOS.Review.get(date);  // IndexedDB key = date (YYYY-MM-DD)
    if (data) {
        reviewForm.value = { did: data.did || '', good: data.good || '', ... };
    } else {
        reviewForm.value = { did: '', good: '', ... };  // 空表单
    }
};
```

**为什么 IndexedDB key 是 `date`（YYYY-MM-DD）而非随机 ID？** 回顾是**每天唯一**的数据。用日期作为 key 可以直接 `db.get('reviews', '2024-01-15')` 获取，无需遍历。这是**自然键（Natural Key）**的设计。

### 2.3 历史列表的摘要生成

```javascript
history.value = all.map(r => ({
    date: r.date,
    emotion: r.emotion,
    snippet: (r.did || r.good || r.thoughts || r.diary || '').slice(0, 30)
})).sort((a, b) => a.date.localeCompare(b.date));
```

**为什么摘要取前 30 字？** 历史列表是**导航辅助**，不是内容展示。30 字足够用户识别"这是哪一天的回顾"（例如"完成了论文初稿"），又不会占用过多空间。

### 2.4 GRAI 本地模拟算法

```javascript
const runGRAI = () => {
    // Goal: DID 第一行
    const goal = did.split('\n')[0].replace(/^[-\s*]+/, '').slice(0, 60);
    
    // Result: 统计行动项数
    const result = `记录了 ${did.split('\n').filter(l => l.trim()).length} 项行动`;
    
    // Analysis: GOOD vs BAD 对比
    const goodCount = good.split('\n').filter(l => l.trim()).length;
    const badCount = bad.split('\n').filter(l => l.trim()).length;
    const analysis = goodCount >= badCount ? '正面' : '需调整';
    
    // Insight: THOUGHTS 第一行
    const insight = thoughts.split('\n')[0].slice(0, 80);
};
```

**为什么是"模拟"而非真 AI？** 在 `file://` 协议下，无法直接调用外部 API（CORS 限制）。模拟版证明数据流正确，后续部署到服务器时，只需替换 `runGRAI` 为 `fetch('/api/ai-analysis', ...)`。

### 2.5 页面布局：为什么 max-width: 800px？

```css
.review-container { max-width: 800px; margin: 0 auto; }
```

**文本阅读的最优行长是 60-75 字符**（约 600-750px）。四栏卡片在宽屏下并排 2 列，在移动端堆叠为 1 列。`max-width: 800px` 保证：
- 桌面端：2 列 textarea 每列约 350px，行长舒适
- 移动端：单列 textarea 占满屏幕，易于触摸输入

---

## 三、文件结构

```
LifeOS/
├── review.html          ← 每日回顾页面（本 Step 生成）
│   ├── 日期导航（昨天/今天/日历选择）
│   ├── 情绪选择（8 表情）
│   ├── 四栏复盘卡片（DID/GOOD/BAD/THOUGHTS）
│   ├── Diary 随笔（全宽卡片）
│   ├── GRAI 分析面板（Goal/Result/Analysis/Insight）
│   ├── 保存栏 + 历史列表
│   └── 角色激励弹窗（goodNight 台词）
├── js/
│   └── core.js          ← ReviewStore（DAO 层，Step 2 已定义）
│       ├── get(date) — key = date
│       ├── save(date, content) — 含 did/good/bad/thoughts/diary/emotion/aiAnalysis
│       └── getAll() — 拉全部历史
└── css/
    └── style.css        ← 复用全局变量，页面内联 <style> 补充
```

---

## 四、数据流

```
用户打开 review.html
    ↓
onMounted → loadDate(today) → LifeOS.Review.get('2024-01-15')
    ↓
有数据 → 填充表单 | 无数据 → 空表单
    ↓
用户输入 DID/GOOD/BAD/THOUGHTS/Diary + 选择情绪
    ↓
watch 检测变化 → saved = false（显示"有未保存的更改"）
    ↓
用户点击"保存回顾"
    ↓
LifeOS.Review.save(date, { did, good, bad, thoughts, diary, emotion, aiAnalysis })
    ↓
IndexedDB: reviews store — key = date
    ↓
loadHistory() — 更新历史列表
    ↓
showEncourageDialog() — 随机角色 + goodNight 台词
    ↓
弹窗：角色头像 + 晚安台词 + "收到！"按钮
```

---

## 五、踩坑记录

### 坑 1：日期字符串的坑（再次强调）

```javascript
new Date('2024-01-05')  // UTC 0点，在+8时区显示为 1月5日 8:00
new Date('2024-01-05T00:00:00')  // 同样问题
```

解决方案：全程使用 `YYYY-MM-DD` 纯字符串，不参与任何 Date 计算时区转换。只有在显示时（如"1月5日 周三"）才用 `new Date(dateStr + 'T00:00:00')` 做本地化显示。

### 坑 2：textarea 的 placeholder 换行

HTML 中 textarea 的 placeholder 不支持 `\n` 直接换行。必须用 `&#10;`（HTML entity for LF）：
```html
<textarea placeholder="例如：&#10;- 完成了论文初稿&#10;- 阅读了30页"></textarea>
```

### 坑 3：移动端 textarea 的自动缩放

iOS Safari 的 textarea 在输入时会自动缩放页面。解决方案：
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

但 `user-scalable=no` 对可访问性不友好。折中方案：在 CSS 中固定 textarea 的 font-size ≥ 16px（iOS 不会缩放 ≥16px 的输入框）。

### 坑 4：历史列表的"今天"高亮

```javascript
:class="['history-item', { 'active': item.date === currentDate }]"
```

这里 `currentDate` 是 `ref('2024-01-15')`，`item.date` 也是字符串，所以用 `===` 比较是正确的。但如果一处用了 Date 对象、另一处用了字符串，就会永远不匹配。**统一使用字符串日期**。

---

## 六、下一步

Step 8：学习日记（Learning）—— RPG 技能树 + 学习记录 + 经验值系统。与 Step 6 的习惯打卡不同，学习日记是**能力成长**视角：不是"我今天学了多久"，而是"我的 Python 技能从 Lv.3 升级到 Lv.4"。
