# LifeOS 移动端响应式适配计划

> 版本: v1.0 · 日期: 2026-07-20
> 目标: 手机浏览器（微信外浏览器 / Safari / Chrome）获得可用、舒适的体验；配合 PWA 可"添加到主屏幕"当 App 用

---

## 1. 现状审计

- ✅ 所有页面已有 `<meta name="viewport" content="width=device-width, initial-scale=1.0">`
- ⚠️ `css/style.css` 仅有 6 处 `@media`，覆盖不足；桌面优先设计
- ❌ 侧边栏导航（Sidebar.js）在窄屏无降级方案
- ❌ 四象限（tasks.html）桌面为 2×2 栅格，手机上会挤
- ❌ timeline.html 左侧任务 dock + 拖拽交互依赖鼠标
- ❌ 弹窗（modal）按桌面宽度设计，手机上过宽、表单多列过挤
- ❌ 拖拽任务到时间轴（HTML5 drag & drop）在触屏上基本不可用

---

## 2. 断点策略

| 断点 | 范围 | 定位 |
|------|------|------|
| mobile | ≤ 480px | 手机竖屏：单列、底部导航、bottom sheet |
| tablet | 481–768px | 平板/手机横屏：双列可选、侧边栏折叠 |
| desktop | ≥ 769px | 现有设计保持不变 |

实现方式：在 `style.css` 末尾集中新增 `@media (max-width: 768px)` 和 `@media (max-width: 480px)` 区块，**不改桌面端任何现有样式**（移动覆盖层）。

---

## 3. 全局改造（所有页面）

### 3.1 导航
- 手机端：顶部侧边栏 → **底部 Tab Bar**（首页 / 任务 / 时间轴 / 习惯 / 设置 五个入口，图标 + 文字）
- 固定 `position: fixed; bottom: 0`，页面底部预留 `padding-bottom: 64px` 防遮挡
- Sidebar.js 增加视口判断：≤768px 渲染 tab bar 而非 sidebar

### 3.2 布局
- 所有多列栅格（dashboard grid、卡片列表）→ 单列
- 页面水平内边距收窄：`24px → 12px`
- 卡片圆角、阴影保留（设计系统不变）

### 3.3 触控与可读性
- 可点目标 ≥ 44×44px（按钮、checkbox、tab）
- 表单 `input/select/textarea` 字号 ≥ 16px（防 iOS 聚焦自动放大）
- 禁用长按选中弹系统的混乱体验：按钮类元素 `user-select: none`

### 3.4 弹窗 → Bottom Sheet
- 手机端所有 `.modal` 改为底部弹出层：全宽、最高 85vh、顶部圆角 16px、上滑出现
- 标题栏加拖动指示条 + 大关闭按钮
- 弹窗内多列表单 → 单列纵向排布
- 重点重做：番茄钟 XP 分配弹窗、任务详情/编辑弹窗、自然语言创建任务弹窗、子任务弹窗

---

## 4. 分页改造清单

### 4.1 index.html（首页仪表板）
- 仪表板多列网格 → 单列纵向：角色状态卡 → 今日概览 → 技能雷达 → 快捷操作
- 技能雷达图（canvas）按屏宽缩放，`max-width: 100%`
- 自然语言输入框全宽，发送按钮不挤压输入区

### 4.2 tasks.html（四象限）
- 2×2 象限栅格 → **象限切换 Tab**（横滑）：「重要紧急 | 重要不紧急 | ...」+ 当前象限单列任务卡
- 备选方案：保留 2×2 但卡片压缩为迷你卡（仅标题+checkbox），点击展开
- 推荐 Tab 方案，信息密度更适合手机
- 任务卡内操作按钮（完成/撤回/删除）加大，改为图标按钮横向排

### 4.3 timeline.html（时间轴）
- 左侧任务 dock → 「＋安排任务」按钮唤起的**抽屉/bottom sheet**，点选任务 + 点选时间格完成安排（替代拖拽）
- 拖拽保留桌面端；手机端检测 `('ontouchstart' in window)` 时启用点选模式
- 时间轴主体横向可滚动或压缩时段宽度；当前时段统计卡片移至顶部折叠区

### 4.4 habits.html / skills.html / reviews.html / learning.html / characters.html
- 卡片列表单列化
- 成长曲线等图表 `max-width: 100%; height: auto`
- 习惯打卡按钮加大（每日高频操作，放拇指热区）

### 4.5 settings.html
- 设置分组纵向排列；同步配置区（新）天然单列，注意 key 输入框全宽

---

## 5. PWA 体验补强

- `manifest.webmanifest` 确认 `display: standalone`、图标含 192/512px
- iOS 特殊处理：`<meta name="apple-mobile-web-app-capable" content="yes">` + apple-touch-icon
- 启动画面背景色与主题色一致
- 部署到 EdgeOne Pages 后 SW 正常注册（https 环境），离线可用

---

## 6. 实施顺序（建议 3 个迭代）

| 迭代 | 内容 | 验收 |
|------|------|------|
| M1 | 全局：底部 Tab Bar、单列布局、触控目标、bottom sheet 弹窗框架 | 手机上所有页面能正常浏览、无横向滚动条 |
| M2 | 分页：tasks 象限 Tab、timeline 点选安排、各图表缩放 | 核心动线（建任务→排时间→打卡）手机可完成 |
| M3 | PWA 补强 + 真机细节打磨（字号、间距、动画） | 添加主屏幕后体验接近原生 |

---

## 7. 人工验证：需要什么工具和信息

### 工具（按优先级）
1. **Chrome DevTools 设备模式**（`F12 → Ctrl+Shift+M`）：选 iPhone 14 / Pixel 7 预设，覆盖 80% 验证工作；可模拟触屏、DPR、断网
2. **真机 + 局域网**：电脑跑 `start.bat`，手机连同一 Wi-Fi 访问 `http://<电脑IP>:8000` —— 最真实的验证，必做
3. **WebBridge 截图**：让我（Kimi）自动打开页面、切到移动视口、截图核对布局 —— 适合每次改动后的回归
4. 可选：BrowserStack（多机型云真机，个人项目一般不必）

### 需要你提供/决策的信息
- **你的手机型号 + 常用浏览器**（决定首要测试目标，如 iPhone Safari 对 PWA/弹窗有特殊坑）
- **高频使用场景排序**：手机上你最常做什么？（如"路上快速记任务 + 打卡习惯"，则 M2 优先 tasks/habits）
- **是否接受底部 Tab Bar** 作为手机端主导航（vs 汉堡菜单抽屉）
- 象限展示偏好：Tab 切换 vs 迷你 2×2（§4.2）

---

## 8. 不做的事（本期）

- 不做原生 App（Capacitor 打包留待后续评估）
- 不改桌面端任何现有样式与交互
- 不做横屏平板专属布局（按 tablet 断点通用处理）
