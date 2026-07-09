# Step 0: 项目初始化与环境搭建

> LifeOS 日常跟踪/记录 App —— 从零构建指南
> 目标：搭建项目骨架，创建第一个可运行的页面

---

## 一、为什么这么做？

### 1.1 为什么用 Vue 3 CDN + ES Modules，而不是 Vite/Webpack 构建工具？

| 方案 | 优点 | 缺点 | 我们的选择 |
|------|------|------|----------|
| **Vite + npm 构建** | 热更新、Tree-shaking、TypeScript | 需要 Node.js 环境、学习构建配置、编译步骤 | 对初学者门槛高，且本项目是纯前端静态网页 |
| **Vue 3 CDN (ESM)** | 零构建、直接浏览器运行、现代 ES Module 导入、共享组件 | 无热更新、首次加载稍慢 | ✅ **选中**：最透明、最易学，浏览器 DevTools 直接调试 |
| **纯 Vanilla JS** | 无依赖、完全透明 | 多模块大型应用时代码组织困难 | 不适合本项目 5 大模块 + 共享组件的复杂度 |

**核心决策**：我们希望"打开浏览器就能运行"，不依赖任何构建工具。同时 Vue 3 的组件系统让多页面共享侧边栏、导航、数据模块变得优雅。通过 `type="importmap"` 让浏览器原生支持 ES Module 导入，每个页面独立创建 Vue 应用，共享组件通过 `import` 引用。

### 1.2 为什么是多页面（Multi-Page）而非单页应用（SPA）？

| 方案 | 优点 | 缺点 | 我们的选择 |
|------|------|------|----------|
| **SPA (Vue Router)** | 切换流畅无刷新、状态持久 | 路由配置复杂、首屏加载大、URL 需要 history 模式配置 | 不需要，每个模块深度功能独立 |
| **Multi-Page** | 每个页面独立加载、URL 直观（`tasks.html`）、DevTools 调试简单 | 页面切换有刷新感 | ✅ **选中**：简单直观，适合本地文件直接打开 |

**核心决策**：这是个人工具，不是公网产品。用户直接在浏览器打开 `index.html` 就能用，不需要服务器配置路由。每个模块（时间轴、任务、习惯等）功能深度足够独立，单独页面更清晰。

### 1.3 为什么 IndexedDB 而不是 LocalStorage？

| 方案 | 容量 | 数据类型 | 查询能力 | 事务 | 选择 |
|------|------|----------|----------|------|------|
| **LocalStorage** | ~5MB | 仅字符串 | 无 | 无 | ❌ 容量小、只能存字符串 |
| **IndexedDB** | 数百MB+ | 结构化对象 | 索引、范围查询 | 支持 | ✅ **选中**：原生对象存储、支持索引、异步不阻塞 UI |

**核心决策**：我们需要存储图片（base64）、富文本、大量历史记录。IndexedDB 是唯一能在浏览器中存储结构化大数据的方案。

### 1.4 为什么补 PWA，而不是只保留普通 HTML 页面？【2026-07-09 14:38】

PWA 是本地工具体验的增强层，不改变多页面架构。它解决两个问题：

| 能力 | 对 LifeOS 的价值 | 当前实现 |
|------|------------------|----------|
| 安装到桌面 | 用户可以像打开本机应用一样打开 LifeOS | `manifest.webmanifest` 提供名称、图标、启动页、主题色 |
| 离线可用 | 没有网络时仍能打开核心页面和静态资源 | `sw.js` 缓存 HTML/CSS/JS/SVG，并运行时缓存 CDN Vue |
| HTTP 环境增强 | `node server.js` 或静态服务器下可注册 Service Worker | `js/pwa.js` 在 `http:`/`https:` 下注册，`file://` 下自动跳过 |

**核心决策**：PWA 不能破坏 `file://` 的低门槛使用方式。因此 `js/pwa.js` 会先判断协议，只有在本地服务或正式部署环境中才注册 Service Worker；双击 HTML 打开时不会报错。

---

## 二、目录结构

```
LifeOS/
├── index.html              # 首页 Dashboard（仪表盘）
├── timeline.html           # 时间轴管理
├── tasks.html              # 任务管理
├── habits.html             # 习惯打卡
├── review.html             # 每日回顾
├── learning.html           # 学习日记
├── characters.html         # 角色库（人物信息库）
├── settings.html           # 设置（API 配置等）
├── manifest.webmanifest    # PWA 安装配置
├── sw.js                   # Service Worker 离线缓存
├── css/
│   └── style.css           # 全局样式系统（CSS 变量、配色、字体、布局）
├── js/
│   ├── db.js               # IndexedDB 数据库封装（核心数据层）
│   ├── pwa.js              # PWA 注册与安装提示状态
│   ├── api.js              # 通用 AI API 客户端封装
│   ├── utils.js            # 工具函数（日期、格式化、防抖等）
│   ├── components/         # 共享 Vue 组件
│   │   ├── Sidebar.js      # 侧边栏导航组件
│   │   └── RichEditor.js   # 富文本/ Markdown 双模式编辑器
│   └── stores/             # 数据状态/逻辑层
│       └── characterStore.js  # 角色数据管理
├── data/
│   └── characters.json       # 预置角色数据（排球少年/Fate/EVA/柯南）
├── assets/
│   └── icons/              # 图标资源（SVG），含 lifeos-app.svg PWA 图标
└── guide/                  # 教学指南（本文件所在目录）
    ├── step-00-project-setup.md      # 本文件
    ├── step-01-ui-design-system.md   # 全局样式系统
    ├── step-02-indexeddb-layer.md    # 数据存储层
    └── ...
```

---

## 三、核心文件创建

### 3.1 `index.html` —— 第一个可运行的页面

这是 Dashboard 首页骨架。关键设计点：

- **`<script type="importmap">`**：浏览器原生 ES Module 导入映射，让 `import { createApp } from 'vue'` 直接指向 CDN，无需 npm install。
- **`type="module"`**：所有 JS 代码以 ES Module 运行，天然支持 `import`/`export`。
- **Vue 3 `createApp`**：每个页面独立创建一个 Vue 应用实例，互不干扰。
- **响应式数据**：`ref()` 和 `reactive()` 让 UI 自动响应数据变化。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LifeOS — 仪表盘</title>
    <!-- Vue 3 CDN (ES Module 版本) -->
    <script type="importmap">
    {
        "imports": {
            "vue": "https://cdn.jsdelivr.net/npm/vue@3.4.21/dist/vue.esm-browser.js"
        }
    }
    </script>
    <!-- 全局样式 -->
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <div id="app">
        <!-- 侧边栏导航 -->
        <aside class="sidebar" :class="{ 'collapsed': sidebarCollapsed }">
            <div class="sidebar-header">
                <h1 class="app-title">LifeOS</h1>
                <button class="toggle-btn" @click="sidebarCollapsed = !sidebarCollapsed">
                    {{ sidebarCollapsed ? '→' : '←' }}
                </button>
            </div>
            <nav class="sidebar-nav">
                <a v-for="item in navItems" :key="item.id"
                   :href="item.url"
                   :class="['nav-item', { 'active': item.active }]">
                    <span class="nav-icon">{{ item.icon }}</span>
                    <span class="nav-text" v-show="!sidebarCollapsed">{{ item.name }}</span>
                </a>
            </nav>
            <!-- 可滑动时间轴流预览（左侧区域） -->
            <div class="sidebar-timeline" v-show="!sidebarCollapsed">
                <h3>今日时间轴</h3>
                <div class="timeline-preview">
                    <p class="placeholder">时间轴预览加载中...</p>
                </div>
            </div>
        </aside>

        <!-- 主内容区域 -->
        <main class="main-content" :class="{ 'expanded': sidebarCollapsed }">
            <!-- 顶栏仪表盘 -->
            <header class="dashboard-header">
                <h2>今日概览</h2>
                <div class="date-display">{{ todayDate }}</div>
            </header>

            <!-- 顶栏仪表盘卡片 -->
            <section class="dashboard-cards">
                <div class="card" v-for="card in statCards" :key="card.id">
                    <div class="card-icon">{{ card.icon }}</div>
                    <div class="card-info">
                        <div class="card-value">{{ card.value }}</div>
                        <div class="card-label">{{ card.label }}</div>
                    </div>
                </div>
            </section>

            <!-- 右下日历视图（主区域） -->
            <section class="calendar-section">
                <h3>日历视图</h3>
                <div class="calendar-grid">
                    <!-- 日历占位 -->
                    <p>日历视图加载中...</p>
                </div>
            </section>
        </main>
    </div>

    <script type="module">
        import { createApp, ref, computed } from 'vue';

        createApp({
            setup() {
                // 响应式状态：侧边栏折叠状态
                const sidebarCollapsed = ref(false);

                // 导航项数据
                const navItems = ref([
                    { id: 'dashboard', name: '仪表盘', url: 'index.html', icon: '📊', active: true },
                    { id: 'timeline', name: '时间轴', url: 'timeline.html', icon: '⏰', active: false },
                    { id: 'tasks', name: '任务', url: 'tasks.html', icon: '📋', active: false },
                    { id: 'habits', name: '习惯', url: 'habits.html', icon: '✅', active: false },
                    { id: 'review', name: '回顾', url: 'review.html', icon: '📝', active: false },
                    { id: 'learning', name: '学习', url: 'learning.html', icon: '🎓', active: false },
                    { id: 'characters', name: '角色库', url: 'characters.html', icon: '👤', active: false },
                    { id: 'settings', name: '设置', url: 'settings.html', icon: '⚙️', active: false }
                ]);

                // 计算属性：今日日期格式化
                const todayDate = computed(() => {
                    const d = new Date();
                    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
                    return d.toLocaleDateString('zh-CN', options);
                });

                // 仪表盘卡片数据（示例）
                const statCards = ref([
                    { id: 'completion', icon: '📈', value: '0%', label: '今日完成率' },
                    { id: 'streak', icon: '🔥', value: '0 天', label: '连续打卡' },
                    { id: 'tasks', icon: '📋', value: '0', label: '待办任务' },
                    { id: 'xp', icon: '⭐', value: '0', label: '今日学习 XP' },
                    { id: 'mood', icon: '🌤️', value: '—', label: '今日情绪' }
                ]);

                return {
                    sidebarCollapsed,
                    navItems,
                    todayDate,
                    statCards
                };
            }
        }).mount('#app');
    </script>
</body>
</html>
```

**为什么 `computed` 用于 `todayDate`？**  
`computed` 是 Vue 的"计算属性"，它缓存计算结果。日期只需要在页面加载时计算一次，之后不会变化，用 `computed` 比 `ref` + 手动更新更高效。

**为什么 `ref` 用于 `sidebarCollapsed`？**  
`ref` 创建一个响应式引用。当用户点击折叠按钮时，`sidebarCollapsed.value` 变化 → Vue 自动检测到 → 重新渲染侧边栏和主内容的 CSS 类。如果用普通变量，UI 不会响应。

---

### 3.2 `css/style.css` —— 全局样式系统

这是整个应用的"视觉宪法"。所有颜色、字体、间距都通过 **CSS 变量（CSS Custom Properties）** 定义，确保全应用一致性。

**为什么用 CSS 变量而非 Tailwind CDN？**  
参考项目使用了 Tailwind CDN，但 CDN 版本在离线时无法加载。我们选择 **纯 CSS 变量 + 自定义类**，零外部依赖（除 Vue CDN），离线可用。

**核心设计决策**：
- **色彩系统**：水蓝 `#7DD3FC`、青绿 `#34D399`、鹅黄 `#FDE68A` 作为主色，Ravenclaw（蓝铜）和 Slytherin（绿银）的霍格沃茨学院感
- **字体栈**：英文 `Minion Pro, Georgia, serif`（有衬线），中文 `STSong, 华文书宋, SimSun, serif`
- **玻璃拟态（Glassmorphism）**：`backdrop-filter: blur(12px)` + 半透明背景，营造霍格沃茨魔药课的朦胧感
- **布局**：侧边栏固定 240px，主内容区自适应，CSS Grid 和 Flexbox 混合使用

```css
/* ==========================================
   LifeOS — 全局样式系统
   水彩 + 霍格沃茨 Ravenclaw/Slytherin 风格
   ========================================== */

/* ---- CSS 变量：色彩系统 ---- */
:root {
    /* 水彩主色（从浅到深） */
    --color-water-light: #E0F7FA;      /* 最浅水蓝 */
    --color-water: #7DD3FC;            /* 水蓝（主色） */
    --color-water-deep: #38BDF8;       /* 深水蓝 */
    --color-mint-light: #D1FAE5;       /* 最浅青绿 */
    --color-mint: #34D399;             /* 青绿（主色） */
    --color-mint-deep: #10B981;        /* 深青绿 */
    --color-gold-light: #FEF9C3;       /* 最浅鹅黄 */
    --color-gold: #FDE68A;             /* 鹅黄（主色） */
    --color-gold-deep: #F59E0B;        /* 深金黄 */
    
    /* 功能色 */
    --color-urgent: #EF4444;           /* 紧急 - 红 */
    --color-important: #3B82F6;          /* 重要 - 蓝 */
    --color-warning: #FBBF24;            /* 警告 - 琥珀 */
    --color-success: #22C55E;            /* 完成 - 绿 */
    
    /* 霍格沃茨学院色 */
    --color-ravenclaw-blue: #0E1A40;   /* Ravenclaw 深蓝 */
    --color-ravenclaw-bronze: #946B2D; /* Ravenclaw 铜色 */
    --color-slytherin-green: #1A472A;  /* Slytherin 绿 */
    --color-slytherin-silver: #AAAAAA; /* Slytherin 银 */
    
    /* 文字色 */
    --text-primary: #1E293B;           /* 主文字 - 深蓝灰 */
    --text-secondary: #64748B;          /* 次要文字 */
    --text-muted: #94A3B8;              /* 辅助文字 */
    --text-inverse: #FFFFFF;            /* 反色文字 */
    
    /* 背景色 */
    --bg-body: #F8FAFC;                /* 页面背景 */
    --bg-card: rgba(255, 255, 255, 0.75); /* 卡片背景（玻璃拟态） */
    --bg-sidebar: rgba(255, 255, 255, 0.85); /* 侧边栏背景 */
    --bg-hover: rgba(125, 211, 252, 0.15); /* 悬停背景 */
    
    /* 边框与阴影 */
    --border-light: rgba(148, 163, 184, 0.3);
    --border-card: rgba(255, 255, 255, 0.5);
    --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
    --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
    --shadow-glow: 0 0 20px rgba(125, 211, 252, 0.3); /* 水蓝光晕 */
    
    /* 字体栈 */
    --font-serif: 'Minion Pro', 'Georgia', 'Times New Roman', 'STSong', '华文书宋', 'SimSun', serif;
    --font-sans: 'Inter', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
    --font-mono: 'Fira Code', 'Consolas', 'Courier New', monospace;
    
    /* 尺寸 */
    --sidebar-width: 240px;
    --sidebar-collapsed: 60px;
    --header-height: 60px;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 24px;
}

/* ---- 基础重置 ---- */
*, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

html {
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}

body {
    font-family: var(--font-serif);  /* 正文字体：有衬线 */
    background: var(--bg-body);
    color: var(--text-primary);
    min-height: 100vh;
    overflow-x: hidden;
}

/* 水彩背景纹理：使用 CSS 渐变模拟水彩晕染效果 */
body::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: 
        radial-gradient(ellipse at 20% 30%, rgba(125, 211, 252, 0.15) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 70%, rgba(52, 211, 153, 0.1) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 50%, rgba(253, 230, 138, 0.08) 0%, transparent 60%);
    pointer-events: none;
    z-index: -1;
}

/* ---- 布局骨架 ---- */
#app {
    display: flex;
    min-height: 100vh;
}

/* ---- 侧边栏 ---- */
.sidebar {
    position: fixed;
    left: 0; top: 0; bottom: 0;
    width: var(--sidebar-width);
    background: var(--bg-sidebar);
    backdrop-filter: blur(12px);  /* 玻璃拟态：背景模糊 */
    -webkit-backdrop-filter: blur(12px);
    border-right: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    transition: width 0.3s ease;
    z-index: 100;
    overflow-y: auto;
    overflow-x: hidden;
}

.sidebar.collapsed {
    width: var(--sidebar-collapsed);
}

.sidebar-header {
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border-light);
    min-height: var(--header-height);
}

.app-title {
    font-family: var(--font-serif);
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--color-ravenclaw-blue);
    white-space: nowrap;
    letter-spacing: 0.05em;
}

.sidebar.collapsed .app-title {
    display: none;
}

.toggle-btn {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    border-radius: var(--radius-sm);
    transition: background 0.2s;
}

.toggle-btn:hover {
    background: var(--bg-hover);
}

/* 导航项 */
.sidebar-nav {
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    text-decoration: none;
    color: var(--text-secondary);
    transition: all 0.2s ease;
    font-family: var(--font-sans);  /* 导航用无衬线，更易读 */
    font-size: 0.95rem;
}

.nav-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
}

.nav-item.active {
    background: rgba(125, 211, 252, 0.25);
    color: var(--color-water-deep);
    font-weight: 600;
}

.nav-icon {
    font-size: 1.2rem;
    width: 28px;
    text-align: center;
    flex-shrink: 0;
}

.nav-text {
    white-space: nowrap;
    overflow: hidden;
}

.sidebar.collapsed .nav-item {
    justify-content: center;
    padding: 10px;
}

/* 侧边栏时间轴预览 */
.sidebar-timeline {
    padding: 16px;
    border-top: 1px solid var(--border-light);
    flex: 1;
}

.sidebar-timeline h3 {
    font-family: var(--font-sans);
    font-size: 0.85rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 12px;
}

.timeline-preview {
    font-size: 0.85rem;
    color: var(--text-muted);
}

.sidebar.collapsed .sidebar-timeline {
    display: none !important;
}

/* ---- 主内容区域 ---- */
.main-content {
    margin-left: var(--sidebar-width);
    flex: 1;
    padding: 24px 32px;
    transition: margin-left 0.3s ease;
    min-height: 100vh;
}

.main-content.expanded {
    margin-left: var(--sidebar-collapsed);
}

/* ---- 顶栏仪表盘 ---- */
.dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid var(--border-light);
}

.dashboard-header h2 {
    font-family: var(--font-serif);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--color-ravenclaw-blue);
    position: relative;
}

/* 标题下方的装饰线：霍格沃茨风格的铜色下划线 */
.dashboard-header h2::after {
    content: '';
    position: absolute;
    bottom: -6px;
    left: 0;
    width: 60px;
    height: 3px;
    background: var(--color-ravenclaw-bronze);
    border-radius: 2px;
}

.date-display {
    font-family: var(--font-sans);
    font-size: 0.95rem;
    color: var(--text-muted);
    font-weight: 400;
}

/* ---- 仪表盘卡片 ---- */
.dashboard-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
}

.card {
    background: var(--bg-card);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: var(--shadow-sm);
    transition: all 0.3s ease;
    cursor: pointer;
}

.card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-md), var(--shadow-glow);
    border-color: rgba(125, 211, 252, 0.5);
}

.card-icon {
    font-size: 2rem;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(125, 211, 252, 0.2);
    border-radius: var(--radius-md);
    flex-shrink: 0;
}

.card-info {
    flex: 1;
}

.card-value {
    font-family: var(--font-sans);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
}

.card-label {
    font-family: var(--font-sans);
    font-size: 0.8rem;
    color: var(--text-muted);
    margin-top: 4px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
}

/* ---- 日历区域 ---- */
.calendar-section {
    background: var(--bg-card);
    backdrop-filter: blur(8px);
    border: 1px solid var(--border-card);
    border-radius: var(--radius-lg);
    padding: 24px;
    box-shadow: var(--shadow-sm);
    min-height: 400px;
}

.calendar-section h3 {
    font-family: var(--font-serif);
    font-size: 1.2rem;
    margin-bottom: 16px;
    color: var(--text-primary);
}

/* ---- 响应式：移动端适配 ---- */
@media (max-width: 768px) {
    .sidebar {
        transform: translateX(-100%);
        transition: transform 0.3s ease;
    }
    
    .sidebar.open {
        transform: translateX(0);
    }
    
    .main-content {
        margin-left: 0 !important;
        padding: 16px;
    }
    
    .dashboard-cards {
        grid-template-columns: repeat(2, 1fr);
    }
    
    .card-icon {
        font-size: 1.5rem;
        width: 40px;
        height: 40px;
    }
    
    .card-value {
        font-size: 1.2rem;
    }
}

/* ---- 动画关键帧 ---- */
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to { opacity: 1; transform: translateY(0); }
}

@keyframes glowPulse {
    0%, 100% { box-shadow: 0 0 5px rgba(125, 211, 252, 0.2); }
    50% { box-shadow: 0 0 20px rgba(125, 211, 252, 0.4); }
}

/* 通用动画类 */
.fade-in {
    animation: fadeIn 0.5s ease-out;
}

/* ---- 滚动条美化 ---- */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.4);
    border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
    background: rgba(148, 163, 184, 0.6);
}
```

**CSS 技巧解释**：
- `backdrop-filter: blur()`：**玻璃拟态**的核心。让元素背后的内容模糊，营造半透明毛玻璃效果。这是霍格沃茨风格的关键视觉元素（像魔药课的玻璃瓶）。
- `radial-gradient` 多层叠加：**水彩晕染效果**。不使用图片，纯 CSS 实现多个半透明径向渐变，模拟水彩颜料在纸上扩散的随机感。
- `var(--sidebar-width)` 和过渡：`transition: width 0.3s ease` 让侧边栏折叠/展开时有丝滑的动画，0.3秒是 UI 动画的"黄金时长"——太短显得生硬，太长显得拖沓。
- `::after` 伪元素装饰线：标题下方的铜色短线，是 Ravenclaw 学院色的点缀，不用额外 HTML 元素，纯 CSS 实现。

---

### 3.3 `js/db.js` —— IndexedDB 数据库封装

这是整个应用的"数据心脏"。所有模块的数据都通过这里读写。

**为什么用 Class 封装？**  
IndexedDB 的 API 是**事件驱动**的（`onerror`, `onsuccess`, `onupgradeneeded`），回调嵌套很丑。我们用 `Promise` 将其包装为**async/await**风格，让上层代码像操作普通数据库一样简洁。

**为什么 `dbName = 'LifeOSDB'` 且 `version = 1`？**  
IndexedDB 通过**版本号**管理数据库结构变更。每次添加新的 Object Store（数据表）或修改索引时，必须升级版本号。我们在 `onupgradeneeded` 中处理迁移逻辑。

```javascript
/**
 * LifeOS IndexedDB 数据库封装
 * 所有数据持久化通过此模块完成
 */

class Database {
    constructor() {
        this.dbName = 'LifeOSDB';
        this.version = 1;  // 数据库版本号，结构变更时递增
        this.db = null;    // 数据库实例
    }

    /**
     * 初始化数据库
     * 返回 Promise，resolved 时数据库可用
     * 
     * 为什么用 Promise 包装？
     * IndexedDB 的 open() 是异步事件驱动（onerror/onsuccess），
     * Promise 让我们可以用 await 以同步风格写异步代码。
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            // 打开失败（如浏览器隐私模式禁止 IndexedDB）
            request.onerror = () => {
                console.error('IndexedDB 打开失败:', request.error);
                reject(request.error);
            };

            // 打开成功
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB 初始化成功，版本:', this.version);
                resolve(this.db);
            };

            /**
             * 数据库首次创建或版本升级时触发
             * 这是定义数据结构（Object Store = 表）的唯一时机
             */
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('IndexedDB 升级中，旧版本:', event.oldVersion, '→ 新版本:', this.version);

                // ---- Object Store 1: 时间轴事件 ----
                if (!db.objectStoreNames.contains('timeline')) {
                    const timelineStore = db.createObjectStore('timeline', { keyPath: 'id' });
                    timelineStore.createIndex('date', 'date', { unique: false });      // 按日期查询
                    timelineStore.createIndex('type', 'type', { unique: false });    // 按类型查询（预计/实际）
                    timelineStore.createIndex('taskId', 'taskId', { unique: false }); // 关联任务
                }

                // ---- Object Store 2: 任务 ----
                if (!db.objectStoreNames.contains('tasks')) {
                    const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
                    taskStore.createIndex('quadrant', 'quadrant', { unique: false });     // 四象限分类
                    taskStore.createIndex('completed', 'completed', { unique: false });    // 完成状态
                    taskStore.createIndex('deadline', 'deadline', { unique: false });      // 截止日期
                    taskStore.createIndex('isRecurring', 'isRecurring', { unique: false }); // 是否循环任务
                }

                // ---- Object Store 3: 习惯 ----
                if (!db.objectStoreNames.contains('habits')) {
                    const habitStore = db.createObjectStore('habits', { keyPath: 'id' });
                    habitStore.createIndex('category', 'category', { unique: false }); // 按类别查询
                }

                // ---- Object Store 4: 习惯打卡记录 ----
                if (!db.objectStoreNames.contains('habitRecords')) {
                    const recordStore = db.createObjectStore('habitRecords', { keyPath: 'id' });
                    // id 格式: "habitId_YYYY-MM-DD"
                    recordStore.createIndex('habitId', 'habitId', { unique: false });
                    recordStore.createIndex('date', 'date', { unique: false });
                }

                // ---- Object Store 5: 每日回顾 ----
                if (!db.objectStoreNames.contains('reviews')) {
                    const reviewStore = db.createObjectStore('reviews', { keyPath: 'date' }); // 以日期为键，每天一条
                }

                // ---- Object Store 6: 学习技能树 ----
                if (!db.objectStoreNames.contains('skills')) {
                    const skillStore = db.createObjectStore('skills', { keyPath: 'id' });
                    skillStore.createIndex('parentId', 'parentId', { unique: false }); // 父子关系
                }

                // ---- Object Store 7: 学习笔记 ----
                if (!db.objectStoreNames.contains('notes')) {
                    const noteStore = db.createObjectStore('notes', { keyPath: 'id' });
                    noteStore.createIndex('skillId', 'skillId', { unique: false });  // 关联技能节点
                    noteStore.createIndex('date', 'date', { unique: false });
                }

                // ---- Object Store 8: 角色库 ----
                if (!db.objectStoreNames.contains('characters')) {
                    const charStore = db.createObjectStore('characters', { keyPath: 'id' });
                    charStore.createIndex('series', 'series', { unique: false }); // 按作品系列查询
                }

                // ---- Object Store 9: 设置 ----
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' }); // 键值对存储
                }

                // ---- Object Store 10: 特殊事件 ----
                if (!db.objectStoreNames.contains('moments')) {
                    const momentStore = db.createObjectStore('moments', { keyPath: 'id' });
                    momentStore.createIndex('date', 'date', { unique: false });
                    momentStore.createIndex('hashtag', 'hashtag', { unique: false, multiEntry: true }); // 多标签索引
                }
            };
        });
    }

    /**
     * 通用 CRUD：创建/更新（Put = 存在则更新，不存在则创建）
     * 
     * @param {string} storeName - Object Store 名称
     * @param {object} data - 要存储的数据对象
     */
    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);  // put 自动处理新增/更新

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 通用 CRUD：读取单条
     */
    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 通用 CRUD：删除单条
     */
    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 通用查询：获取全部
     */
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 通用查询：按索引查询
     * 
     * @param {string} storeName - Object Store 名称
     * @param {string} indexName - 索引名称
     * @param {any} value - 查询值
     * @param {string} range - 范围类型：'only'(精确) | 'bound'(范围) | 'all'(全部)
     */
    async getByIndex(storeName, indexName, value, range = 'only') {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index(indexName);
            
            let request;
            if (range === 'only') {
                request = index.getAll(value);  // 精确匹配
            } else if (range === 'all') {
                request = index.getAll();       // 全部
            }
            // TODO: 添加 'bound' 范围查询支持

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * 设置项：获取
     */
    async getSetting(key, defaultValue = null) {
        const result = await this.get('settings', key);
        return result ? result.value : defaultValue;
    }

    /**
     * 设置项：保存
     */
    async setSetting(key, value) {
        return this.put('settings', { key, value });
    }
}

// 导出单例实例（整个应用共享同一个数据库连接）
const db = new Database();
export default db;
```

**IndexedDB 设计决策解释**：
- **`keyPath: 'id'`**：每个数据对象必须有唯一 `id` 字段。我们用 `crypto.randomUUID()` 或 `Date.now() + random` 生成。
- **`keyPath: 'date'`（review）**：每日回顾以日期为键，天然确保每天只有一条记录。如果用户多次保存，会覆盖（这正是我们想要的）。
- **`multiEntry: true`（moment hashtag）**：特殊事件的标签数组可以被单独索引，用 `getAll('moments', 'hashtag', '#Anime')` 就能找到所有带该标签的事件。
- **10 个 Object Store**：覆盖全部 5 大模块 + 角色 + 设置。version=1 就一次性建好，后续需要新表时递增版本号。

---

### 3.4 `js/utils.js` —— 工具函数

```javascript
/**
 * LifeOS 工具函数库
 * 纯函数，不依赖任何外部状态
 */

/**
 * 生成唯一 ID
 * 为什么不用 Math.random()？因为它可能重复（虽然概率极低）。
 * crypto.randomUUID() 是浏览器原生 UUID 生成，不重复。
 * 降级方案：时间戳 + 随机数（用于不支持的浏览器）。
 */
export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 格式化日期为 YYYY-MM-DD
 * 这是整个应用的标准日期格式，用于数据库查询和显示。
 */
export function formatDate(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 格式化时间 HH:MM
 */
export function formatTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 计算两个日期之间相差的天数
 * 用于任务倒计时、连续打卡计算等。
 */
export function daysBetween(date1, date2) {
    const d1 = new Date(date1).setHours(0, 0, 0, 0);
    const d2 = new Date(date2).setHours(0, 0, 0, 0);
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * 防抖函数
 * 为什么需要它？搜索输入、窗口 resize 等频繁触发的事件需要"等用户停手后再执行"，避免大量无效计算。
 * 原理：每次触发时清除之前的定时器，重新计时。只有最后一次触发后等待期满，才真正执行。
 */
export function debounce(func, wait = 300) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 * 与防抖的区别：防抖是"等停手后执行一次"，节流是"固定间隔最多执行一次"。
 * 用于滚动事件、Canvas 绘制等高频场景。
 */
export function throttle(func, limit = 100) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * 深拷贝简单对象
 * 为什么不用 JSON.parse(JSON.stringify())？它不能处理 Date、Function、undefined、循环引用。
 * 这里用结构化克隆（Structured Clone），是浏览器原生深度拷贝，支持几乎所有数据类型。
 */
export function deepClone(obj) {
    if (typeof structuredClone === 'function') {
        return structuredClone(obj);
    }
    // 降级：JSON 方式（注意限制）
    return JSON.parse(JSON.stringify(obj));
}

/**
 * 文件转 Base64
 * 用于图片上传：用户选择的图片文件 → base64 字符串 → 存入 IndexedDB。
 * 为什么用 base64？IndexedDB 可以直接存字符串，base64 是最简单的图片序列化方式。
 */
export function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);  // 读取为 Data URL (base64)
    });
}

/**
 * 压缩图片（降低 base64 大小）
 * 为什么需要？用户上传的 4MB 手机照片直接存 IndexedDB 会撑爆存储。
 * 方案：Canvas 绘制 + 降低质量/尺寸 → 生成压缩后的 base64。
 */
export function compressImage(base64, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 计算缩放后尺寸
            let width = img.width;
            let height = img.height;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转为 JPEG base64（质量 0.7，通常比原 PNG 小 80%）
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        img.src = base64;
    });
}

/**
 * 计算任务四象限分类
 * 输入：deadline（截止日期字符串）, priority（1-10）
 * 输出：象限名称
 */
export function calculateQuadrant(deadline, priority = 5) {
    const daysUntil = daysBetween(new Date(), new Date(deadline));
    
    // 紧急性：距截止日期天数（越小越紧急）
    let urgency;
    if (daysUntil <= 1) urgency = 1.0;
    else if (daysUntil <= 3) urgency = 0.8;
    else if (daysUntil <= 7) urgency = 0.6;
    else if (daysUntil <= 14) urgency = 0.4;
    else urgency = 0.2;
    
    // 重要性：优先级映射到 0-1
    const importance = priority / 10;
    
    if (importance >= 0.7 && urgency >= 0.7) return 'urgent-important';        // 重要紧急
    if (importance >= 0.7 && urgency < 0.7) return 'important-not-urgent';  // 重要不紧急
    if (importance < 0.7 && urgency >= 0.7) return 'urgent-not-important';    // 紧急不重要
    return 'not-urgent-not-important';                                         // 不重要不紧急
}

/**
 * 获取四象限的中文标签和颜色
 */
export function getQuadrantInfo(quadrant) {
    const map = {
        'urgent-important': { label: '重要·紧急', color: 'var(--color-urgent)', icon: '🔴' },
        'important-not-urgent': { label: '重要·不紧急', color: 'var(--color-important)', icon: '🔵' },
        'urgent-not-important': { label: '紧急·不重要', color: 'var(--color-warning)', icon: '🟡' },
        'not-urgent-not-important': { label: '不重要·不紧急', color: 'var(--text-muted)', icon: '⚪' }
    };
    return map[quadrant] || map['not-urgent-not-important'];
}

/**
 * Markdown 简单转 HTML（用于预览）
 * 后续 Step 会替换为更完整的 marked.js，但这里提供基础版本保证可运行。
 * 支持的语法：# 标题、**粗体**、*斜体*、- 列表、> 引用、```代码块
 */
export function markdownToHtml(markdown) {
    if (!markdown) return '';
    return markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/gim, '<em>$1</em>')
        .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
        .replace(/^```\n?([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        .replace(/^(\-|\*) (.*$)/gim, '<li>$2</li>')
        .replace(/(<li>.*<\/li>\n?)+/gim, '<ul>$&</ul>')
        .replace(/\n/gim, '<br>');
}
```

### 3.5 PWA 基础文件（v1.2 补充）【2026-07-09 14:38】

PWA 由三个文件和每个 HTML 页面的 `<head>` 挂载组成：

```html
<meta name="theme-color" content="#7DD3FC">
<link rel="manifest" href="manifest.webmanifest">
<script src="js/pwa.js"></script>
```

`manifest.webmanifest` 负责浏览器安装信息：

```json
{
  "name": "LifeOS",
  "short_name": "LifeOS",
  "start_url": "./index.html",
  "scope": "./",
  "display": "standalone",
  "theme_color": "#7DD3FC",
  "icons": [{ "src": "assets/icons/lifeos-app.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

`js/pwa.js` 只在 HTTP(S) 下注册 Service Worker：

```javascript
if ('serviceWorker' in navigator && /^https?:$/.test(window.location.protocol)) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { scope: './' });
    });
}
```

`sw.js` 使用分层缓存：

| 缓存 | 内容 | 策略 |
|------|------|------|
| `lifeos-static-*` | 本地 HTML/CSS/JS/SVG 等核心静态资源 | install 时预缓存，后续 cache-first |
| `lifeos-data-*` | 本机后端 GET 请求，如 `/api/db` | network-first，离线时读最近缓存 |
| `lifeos-runtime-*` | CDN Vue 等跨域运行时资源 | 首次在线访问后 cache-first |

**注意**：Service Worker 不能在 `file://` 下工作，所以 PWA 验证必须通过 `node server.js` 或 `python -m http.server` 打开。

---

## 四、验证步骤

### 4.1 验证 `index.html` 能正常运行

1. 在文件资源管理器中，导航到 `D:\FUN_VibeCoding\LifeOS\LifeOS\`
2. 双击 `index.html`，或在浏览器地址栏输入 `file:///D:/FUN_VibeCoding/LifeOS/LifeOS/index.html`
3. 你应该看到：
   - 左侧侧边栏：包含 8 个导航项（仪表盘、时间轴、任务、习惯、回顾、学习、角色库、设置）
   - 顶栏："今日概览" + 日期
   - 5 个仪表盘卡片（完成率、连续打卡、待办任务、学习 XP、今日情绪）
   - 右下日历区域
   - 点击侧边栏的 `←` 按钮，侧边栏会折叠为图标模式
4. 检查 DevTools Console（F12）：不应有红色报错

### 4.2 验证 `db.js` 能正确初始化

在浏览器 DevTools 的 Console 中执行：

```javascript
// 先导入 db 模块（需要 type="module" 的页面）
// 如果你在一个普通页面，可以先在 index.html 的 script 中测试：

import db from './js/db.js';
await db.init();
console.log('数据库初始化成功');

// 测试写入
await db.put('settings', { key: 'test', value: 'hello' });

// 测试读取
const result = await db.get('settings', 'test');
console.log('读取结果:', result);
// 应输出: { key: 'test', value: 'hello' }

// 查看数据库结构
console.log('Object Stores:', db.db.objectStoreNames);
// 应输出: ["timeline", "tasks", "habits", "habitRecords", "reviews", "skills", "notes", "characters", "settings", "moments"]
```

### 4.3 验证 `utils.js` 函数

```javascript
import { generateId, formatDate, calculateQuadrant, getQuadrantInfo, markdownToHtml } from './js/utils.js';

console.log('UUID:', generateId());
console.log('今日日期:', formatDate());
console.log('四象限:', calculateQuadrant('2026-07-05', 9));  // 3天后截止，高优先级 → urgent-important
console.log('象限信息:', getQuadrantInfo('urgent-important'));
console.log('Markdown转HTML:', markdownToHtml('# 标题\n**粗体**\n- 列表1'));
```

### 4.4 验证 PWA 配置

```bash
node --check LifeOS\js\pwa.js
node --check LifeOS\sw.js
node server.js
```

然后访问：

- `http://localhost:3000/manifest.webmanifest` 应返回 200
- `http://localhost:3000/sw.js` 应返回 200
- 打开 `http://localhost:3000/index.html`，DevTools → Application → Service Workers 中应能看到 LifeOS 的 Service Worker

---

## 五、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 页面空白，Console 报 `Cannot use import statement outside a module` | 没有用 `type="module"` | 确认 `<script type="module">` |
| `vue` 无法解析，报 `Failed to resolve module specifier "vue"` | importmap 未正确配置 | 确认 `<script type="importmap">` 在 `<script type="module">` 之前加载 |
| 侧边栏样式错乱 | CSS 变量未加载 | 确认 `<link rel="stylesheet" href="css/style.css">` 路径正确 |
| IndexedDB 初始化失败 | 浏览器隐私模式或存储已满 | 退出隐私模式，或检查浏览器存储权限 |
| 背景水彩效果没有 | `body::before` 被覆盖 | 检查是否有其他样式覆盖了 `body` 背景 |

---

## 六、下一步预告

**Step 1: 全局样式系统与侧边栏组件**
- 创建可复用的 `Sidebar.js` Vue 组件（被所有页面共享）
- 添加水彩动画背景（更丰富的 CSS 渐变层次）
- 添加动漫图标 SVG（苍月草、排球、富士山等）
- 完善响应式移动端适配

**Step 2: IndexedDB 数据层完整封装**
- 为每个模块创建数据访问对象（DAO）
- 添加数据导入/导出（JSON 导出、导入合并策略）
- 添加数据库版本迁移工具

**Step 3: 角色库与预置数据**
- 导入预置角色 JSON（排球少年 40+、Fate、EVA、柯南）
- 创建角色库页面（characters.html）
- 角色头像上传与圆形裁剪

---

> 本文件位置：`guide/step-00-project-setup.md`
> 对应代码：`index.html`, `css/style.css`, `js/db.js`, `js/utils.js`
