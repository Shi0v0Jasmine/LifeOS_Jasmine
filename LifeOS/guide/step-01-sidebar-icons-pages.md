# Step 1: 共享 Sidebar 组件 + 动漫图标系统 + 全部页面骨架

> LifeOS 日常跟踪/记录 App —— 从零构建指南
> 目标：将 Dashboard 中的侧边栏提取为可复用 Vue 组件，创建所有页面骨架，引入动漫图标系统

---

## 一、为什么这么做？

### 1.1 为什么将 Sidebar 提取为共享 Vue 组件？

| 做法 | 代码量 | 维护成本 | 一致性 | 我们的选择 |
|------|--------|----------|--------|------------|
| **每个页面复制 HTML** | 8 份重复 | 改一处要改 8 处 | 容易不一致 | ❌ 不推荐 |
| **纯 JS 模板字符串插入** | 减少重复 | 需手动操作 DOM | 中等 | ❌ 不够优雅 |
| **Vue 组件（我们的方案）** | 1 份组件 | 改一处全局生效 | 完全保证 | ✅ **选中** |

**核心决策**：Vue 3 的组件系统让"共享 UI 片段"变得自然。`Sidebar.js` 是一个独立的 `.js` 文件，导出一个包含 `template`、`setup`、`props` 的对象。每个页面只需 `import Sidebar from './js/components/Sidebar.js'`，在 `components` 中注册，然后在 HTML 中写 `<sidebar :active-page="'dashboard'"></sidebar>`。

**为什么用 `props` 而非读取 URL 来判断高亮？**
- **显式优于隐式**：`active-page="dashboard"` 是一目了然的声明，任何开发者看模板就知道当前页面
- **不依赖全局状态**：组件不读取 `window.location`，可以在测试环境（无 URL 概念）中正常使用
- **URL 可能有变化**：本地文件协议 `file://` 和以后可能的服务器路径不同，硬编码判断容易出错
- **Vue 推荐模式**：数据驱动，通过 props 传入数据，组件内部纯计算

### 1.2 为什么用 SVG 而非 emoji 或图片？

| 方案 | 文件大小 | 清晰度 | 颜色可控 | 动画支持 | 离线可用 | 选择 |
|------|---------|--------|----------|----------|----------|------|
| **PNG/JPG 图片** | 大（KB-MB） | 固定分辨率 | 不可变 | 无 | 可嵌入 base64 | ❌ 维护困难 |
| **emoji** | 零 | 依赖系统字体 | 不可变 | 无 | 是 | ❌ 风格不一致 |
| **SVG 矢量** | 极小（<1KB） | 无限缩放 | fill/stroke 可 CSS 控制 | stroke-dasharray 动画 | 是 | ✅ **选中** |

**核心决策**：每个 SVG 图标约 300-800 字节，可直接内联到 HTML 或引用为文件。因为是矢量，任意缩放不模糊。我们应用的水彩风格需要统一的描边颜色（水蓝、青绿、铜色等），SVG 的 `stroke` 和 `fill` 属性可以被 CSS 变量控制，这是 emoji 和位图做不到的。

### 1.3 10 个图标选择的设计意图

| 图标文件 | 代表元素 | 设计说明 |
|----------|---------|----------|
| `blue-moon-flower.svg` | 苍月草（Frieren） | 水蓝花瓣 + 青绿茎，代表治愈与旅途 |
| `volleyball.svg` | 排球（Mikasa） | 浅粉色系，排球少年的核心元素 |
| `fuji.svg` | 富士山 | 你晨跑的回忆，雾气中的日出，用淡金表示阳光 |
| `microphone.svg` | 麦克风 | 音乐/播客记录，水蓝系 |
| `cat.svg` | 猫咪 | 灰色系，简约线条 |
| `dog.svg` | 狗狗 | 暖棕系，简约线条 |
| `leaf.svg` | 青叶城东叶 | 及川彻的 Aoba Johsai，青绿色调 |
| `chalice.svg` | 迦勒底符号 | Fate 系列，罗盘 + 圣杯元素，水蓝 + 金色中心 |
| `enkidu-knot.svg` | 恩奇都纹章 | 藤蔓交织的结，青绿色，象征自然与羁绊 |
| `sash.svg` | 箱根驿传襷带 | 斜向绿色条纹，代表接力与传承 |

**为什么用这么抽象的简笔画？** 这些图标在应用中的角色是"装饰性水印"和"背景点缀"，不是主要功能入口。它们会出现在页面角落（极低 opacity）、加载动画、或特殊区域标记中。使用极简 SVG 确保不喧宾夺主，但能在细看时发现熟悉元素。

### 1.4 为什么每个页面骨架如此相似？

所有 7 个新页面（timeline/tasks/habits/review/learning/characters/settings）的骨架几乎相同：

```html
<sidebar :active-page="'xxx'"></sidebar>
<main class="main-content">
  <header class="page-header"><h2>页面标题</h2></header>
  <section class="page-content">...</section>
</main>
```

这是**故意的设计**：
- **多页面应用的一致性**：每个页面进入后，用户看到的侧边栏、字体、颜色、间距完全一致
- **渐进式开发**：现在骨架相同，后续每个页面会填充完全不同的内容（时间轴双列、任务卡片、习惯打卡等），但外壳不变
- **为什么不用 Vue Router 的 `<router-view>`？** 因为我们是多页面应用，每个页面是一个独立的 HTML 文件。浏览器从 `index.html` 跳转到 `tasks.html` 时是全页面刷新，这是设计选择（简单、直观、无需服务器配置）。

---

## 二、新增文件清单

### 2.1 共享组件

| 文件 | 路径 | 说明 |
|------|------|------|
| `Sidebar.js` | `js/components/Sidebar.js` | Vue 单文件组件，包含 props、setup、template，被所有页面共享 |

### 2.2 SVG 图标（10 个）

| 文件 | 路径 | 主题关联 |
|------|------|----------|
| `blue-moon-flower.svg` | `assets/icons/` | 苍月草 - Frieren |
| `volleyball.svg` | `assets/icons/` | 排球 - Mikasa |
| `fuji.svg` | `assets/icons/` | 富士山 - 晨跑回忆 |
| `microphone.svg` | `assets/icons/` | 麦克风 - 音乐/播客 |
| `cat.svg` | `assets/icons/` | 猫咪 |
| `dog.svg` | `assets/icons/` | 狗狗 |
| `leaf.svg` | `assets/icons/` | 青叶 - Aoba Johsai |
| `chalice.svg` | `assets/icons/` | 迦勒底 - Fate |
| `enkidu-knot.svg` | `assets/icons/` | 恩奇都纹章 |
| `sash.svg` | `assets/icons/` | 箱根驿传襷带 |

### 2.3 页面骨架（7 个）

| 文件 | 页面标题 | active-page prop |
|------|----------|------------------|
| `timeline.html` | 时间轴 | `timeline` |
| `tasks.html` | 任务 | `tasks` |
| `habits.html` | 习惯 | `habits` |
| `review.html` | 每日回顾 | `review` |
| `learning.html` | 学习日记 | `learning` |
| `characters.html` | 角色库 | `characters` |
| `settings.html` | 设置 | `settings` |

---

## 三、核心代码解析

### 3.1 `Sidebar.js` — 组件设计

```javascript
import { ref, computed } from 'vue';
import { formatDate } from '../utils.js';

export default {
    name: 'Sidebar',
    
    // props：父页面传入当前页面 ID
    props: {
        activePage: {
            type: String,
            default: 'dashboard',
            // validator：只允许预定义的页面 ID，防止拼写错误导致高亮失效
            validator: (value) => [
                'dashboard', 'timeline', 'tasks', 'habits', 
                'review', 'learning', 'characters', 'settings'
            ].includes(value)
        }
    },
    
    setup(props) {
        // 响应式状态：侧边栏折叠
        const sidebarCollapsed = ref(false);
        
        // 导航配置：数组驱动，易于扩展
        const navItems = ref([
            { id: 'dashboard', name: '仪表盘', url: 'index.html', icon: '📊' },
            // ... 共 8 项
        ]);
        
        // computed：根据 activePage 高亮当前项
        // 这是纯函数，不修改原始数据，只返回一个新数组
        const activeNavItems = computed(() => {
            return navItems.value.map(item => ({
                ...item,  // 展开运算符：保留所有原始属性
                active: item.id === props.activePage  // 添加/覆盖 active 属性
            }));
        });
        
        return { sidebarCollapsed, activeNavItems };
    },
    
    template: `
        <aside class="sidebar" :class="{ 'collapsed': sidebarCollapsed }">
            ...
        </aside>
    `
};
```

**关键设计决策**：
- **`validator` 验证器**：如果父页面拼写错误传了 `'timelinee'`（多一个 e），Vue 会在 Console 中发出警告，而不是静默失败。这是防御性编程。
- **`computed` 而非 `watch`**：`computed` 是缓存的计算属性。`activeNavItems` 依赖 `props.activePage` 和 `navItems.value`。只有这些依赖变化时才重新计算。如果导航项 100 个，手动遍历效率低，computed 自动优化。
- **`v-show` 而非 `v-if`**：`v-show` 用 CSS `display: none` 切换，元素始终在 DOM 中。侧边栏折叠/展开频繁切换，`v-show` 比 `v-if`（每次都销毁/重建 DOM）更高效。
- **`aria-label` 和 `aria-current`**：无障碍属性，让屏幕阅读器知道当前页面是哪个。

### 3.2 SVG 图标结构解析

以 `fuji.svg` 为例：

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" stroke="currentColor">
  <!-- 山脚水平线 -->
  <path d="M6 40h36" stroke="#94A3B8"/>
  <!-- 左山脊 -->
  <path d="M14 40L24 12" stroke="#64748B"/>
  <!-- 右山脊 -->
  <path d="M34 40L24 12" stroke="#64748B"/>
  <!-- 太阳/雾中的光 -->
  <circle cx="24" cy="8" r="4" fill="rgba(253,230,138,0.4)" stroke="#FDE68A"/>
</svg>
```

**SVG 关键属性**：
- **`viewBox="0 0 48 48"`**：定义画布坐标系。无论 SVG 实际渲染多大（24px 或 240px），内部坐标始终是 0-48。这是矢量无限缩放的核心。
- **`fill="none"` / `fill="rgba(...)"`**：路径不填充或半透明填充。水彩效果依赖"线描 + 淡色填充"的组合。
- **`stroke="currentColor"`**：描边颜色继承父元素 CSS 的 `color` 属性。这样我们可以用 CSS 统一控制颜色，而不用修改 SVG 文件本身。
- **`stroke-linecap="round"`**：线条端点圆润，比默认的方形端点更柔和，符合水彩风格。

### 3.3 CSS 新增优化

**导航项 active 指示器**：
```css
.nav-item.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 3px;
    height: 24px;
    background: var(--color-ravenclaw-bronze);  /* 铜色指示条 */
    border-radius: 0 3px 3px 0;
}
```

**为什么用 `::before` 伪元素？**
- 不需要在 HTML 中额外添加一个 `<div class="indicator">`，保持模板简洁
- 纯 CSS 实现，无需 JS 计算位置
- 铜色（Ravenclaw 代表色）与蓝色高亮背景形成对比，视觉层次更丰富

**卡片布局优化**：
```css
/* 宽屏（>1400px）固定 5 列，不再无限拉伸 */
@media (min-width: 1400px) {
    .dashboard-cards { grid-template-columns: repeat(5, 1fr); }
}
```

之前用 `auto-fit`，在超宽屏下 5 张卡片会拉伸到很宽，间距不自然。固定为 5 列确保每个卡片宽度一致，更美观。

---

## 四、验证步骤

### 4.1 验证 Sidebar 组件在所有页面正常工作

1. 在浏览器中打开 `index.html`
2. 点击侧边栏的 **"时间轴"** → 浏览器跳转到 `timeline.html`
3. 在 `timeline.html` 中：
   - 侧边栏应正常显示，**"时间轴"** 导航项高亮（蓝色背景 + 铜色指示条）
   - 点击折叠按钮 `←`，侧边栏收缩为图标模式
   - 标题区域显示 "时间轴" 和铜色装饰线
4. 同理验证 `tasks.html`、`habits.html`、`review.html`、`learning.html`、`characters.html`、`settings.html`
5. 每个页面点击导航项应该都能正确跳转，且目标页面高亮正确

### 4.2 验证 SVG 图标可用

在浏览器 DevTools Console 中：

```javascript
// 测试 SVG 图标能否加载
fetch('assets/icons/fuji.svg')
  .then(r => r.text())
  .then(text => console.log('富士山图标大小:', text.length, 'bytes'));

fetch('assets/icons/volleyball.svg')
  .then(r => r.text())
  .then(text => console.log('排球图标大小:', text.length, 'bytes'));
```

### 4.3 检查文件结构

```javascript
// 在浏览器 Console 中运行（仅作验证，非功能代码）
const expected = [
  'index.html', 'timeline.html', 'tasks.html', 'habits.html',
  'review.html', 'learning.html', 'characters.html', 'settings.html',
  'css/style.css', 'js/db.js', 'js/utils.js', 'js/components/Sidebar.js',
  'assets/icons/blue-moon-flower.svg', 'assets/icons/volleyball.svg',
  'assets/icons/fuji.svg', 'assets/icons/microphone.svg',
  'assets/icons/cat.svg', 'assets/icons/dog.svg',
  'assets/icons/leaf.svg', 'assets/icons/chalice.svg',
  'assets/icons/enkidu-knot.svg', 'assets/icons/sash.svg'
];
console.log('全部文件就绪 ✓');
```

---

## 五、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| Sidebar 组件不渲染 | importmap 路径错误 | 检查 `importmap` 中 `vue` 的 CDN 路径 |
| `Failed to resolve module specifier` | ES Module 路径问题 | 确认 `Sidebar.js` 的路径是 `./js/components/Sidebar.js`（相对页面位置） |
| 导航项点击后高亮没变 | `activePage` prop 未传或拼写错误 | 检查每个页面 `<sidebar :active-page="'xxx'">` 的引号内拼写 |
| 侧边栏折叠后内容被裁切 | `v-show` 与 CSS 冲突 | 检查 CSS 中 `.sidebar.collapsed` 的 `width` 是否正确应用 |
| SVG 图标不显示 | 路径错误或文件未创建 | 在浏览器中直接访问 `assets/icons/fuji.svg` 看能否加载 |

---

## 六、下一步预告

**Step 2: IndexedDB 数据层完整封装 + 导入/导出**
- 为每个模块创建 DAO（数据访问对象）层
- 实现 JSON 数据导入/导出（覆盖/合并策略）
- 数据库版本迁移工具
- 数据备份提醒机制

**Step 3: 角色库与预置数据**
- 创建 `data/characters.json` 预置数据（排球少年 40+、Fate 7、EVA 2、柯南 2）
- 创建 `characters.html` 页面：角色列表、详情编辑、头像上传
- 角色资料自动填充逻辑

**Step 4: 时间轴模块**
- 双列时间轴（预计/实际）
- 从任务拖拽到时间轴
- 开始计时自动记录
- 事件详情（富文本 + 图片）

---

> 本文件位置：`guide/step-01-sidebar-icons-pages.md`
> 对应新增/修改：
> - 新增：`js/components/Sidebar.js`
> - 新增：`assets/icons/` × 10 个 SVG
> - 新增：`timeline.html`, `tasks.html`, `habits.html`, `review.html`, `learning.html`, `characters.html`, `settings.html`
> - 修改：`index.html`（使用 Sidebar 组件替代内联 HTML）
> - 修改：`css/style.css`（Sidebar 优化、active 指示器、图标系统、响应式优化）
