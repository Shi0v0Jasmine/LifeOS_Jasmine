# LifeOS — 日常跟踪与记录 App

> 一款融合动漫角色激励、四象限任务管理、习惯打卡、每日复盘与学习技能树的个人效率管理工具。
> 水彩风格 UI + 霍格沃茨 Ravenclaw/Slytherin 配色，离线可用，数据本地存储。

---

## 📦 项目结构

```
D:\FUN_VibeCoding\LifeOS\
├── LifeOS\                      ← 应用主目录
│   ├── index.html               ← Dashboard 首页
│   ├── timeline.html            ← 时间轴管理
│   ├── tasks.html               ← 任务管理（四象限）
│   ├── habits.html              ← 习惯打卡
│   ├── review.html              ← 每日回顾
│   ├── learning.html            ← 学习日记 / 技能树
│   ├── characters.html          ← 角色库
│   ├── settings.html            ← 设置（AI 配置 / 数据管理）
│   ├── manifest.webmanifest     ← PWA 安装配置
│   ├── sw.js                    ← Service Worker 离线缓存
│   ├── css\style.css            ← 全局样式
│   ├── js\                      ← 核心脚本
│   │   ├── core.js              ← 数据库 + DAO + 导入导出
│   │   ├── pwa.js               ← PWA 注册与安装提示状态
│   │   ├── db.js                ← IndexedDB 封装
│   │   ├── utils.js             ← 工具函数
│   │   └── components\          ← Vue 组件
│   │       └── Sidebar.js       ← 共享侧边栏
│   ├── data\                    ← 数据目录
│   │   ├── lifeos-backup-*.json ← 手动备份文件
│   │   └── lifeos-db.json       ← 本机后端 JSON 数据库（运行后生成，git 忽略）
│   ├── assets\                  ← 静态资源
│   └── guide\                   ← 从零构建指南（Step 0-10）
├── tests\                       ← 数据层回归测试
├── server.js                    ← 本机 Express 后端（静态托管 + JSON 持久化 API）
├── package.json                 ← Node/Express 启动配置
├── PRD_LifeOS.md                ← 产品需求文档
├── LifeOS/data/character_dialogue_styles.json ← 角色台词风格数据
└── README.md                    ← 本文件
```

---

## 🚀 快速开始

### 1. 打开应用

**方式一：直接双击打开**
1. 打开文件资源管理器，导航到 `D:\FUN_VibeCoding\LifeOS\LifeOS\`
2. 双击 `index.html`，或在浏览器地址栏输入：
   ```
   file:///D:/FUN_VibeCoding/LifeOS/LifeOS/index.html
   ```

**方式二：启动本机后端（推荐，支持 JSON 文件持久化）**
```bash
cd D:\FUN_VibeCoding\LifeOS
node server.js
# 然后浏览器访问 http://localhost:3000
```

也可以双击 `start.bat`，脚本会优先使用 Node.js 启动后端；如果没有 Node.js，会降级为 Python 静态服务器。

**方式三：启动静态服务器（无后端持久化）**
```bash
cd D:\FUN_VibeCoding\LifeOS\LifeOS
python -m http.server 8080
# 然后浏览器访问 http://localhost:8080
```

### 2. 首次使用：导入备份数据

⚠️ **重要**：数据库已从 `OkComputerDB` 迁移至 `LifeOSDB`。旧浏览器数据不会自动迁移，需要从备份恢复。

**步骤：**
1. 打开 `index.html`（Dashboard）
2. 点击右上角 **⚙️ 设置**
3. 或在 Dashboard 首页点击 **「导入数据」** 快速操作按钮
4. 选择文件：`D:\FUN_VibeCoding\LifeOS\LifeOS\data\lifeos-backup-2026-07-03.json`
5. 导入策略选择 **「合并」**（保留现有，添加新数据）或 **「覆盖」**（清空后重新写入）
6. 导入完成后刷新页面

> 💡 如果没有备份，也可以进入 **角色库** 页面，点击 **「导入预置角色」** 按钮，系统会自动加载内置的 50+ 动漫角色数据。

---

## ✨ 功能概览

| 模块 | 核心功能 |
|------|---------|
| **📊 Dashboard** | 今日概览、完成率、连续打卡、待办任务、学习 XP、情绪天气 |
| **⏱️ 时间轴** | 预计/实际双列时间轴、任务拖拽排期、计时器自动记录、事件复盘 |
| **📝 任务** | 四象限分类（自动/手动）、短期/长期任务、倒计时进度条 |
| **✅ 习惯** | 每日打卡、月历热力图（多邻国风格）、连续天数统计 |
| **🌙 每日回顾** | DID/GOOD/BAD/THOUGHTS 结构化复盘、情绪天气、GRAI AI 分析 |
| **🌲 学习日记** | RPG 技能树、XP 经验值、学习笔记、统计面板 |
| **🎭 角色库** | 50+ 预置角色（排球少年/Fate/EVA/柯南）、激励对话、互动优先级 |
| **⚙️ 设置** | AI API 配置（Base URL/Key/模型）、通用 AI 客户端测试、数据导入/导出/重置 |
| **📲 PWA** | manifest + Service Worker，可安装到桌面，并缓存核心静态资源 |

### 🎯 激励系统

- **完成率 ≥ 75%**：随机角色弹出鼓励对话（个性化台词）
- **完成率 ≥ 85%**：多角色互动对话，互道晚安

---

## 💾 数据安全与备份

### 存储方式
- 所有数据存储在浏览器 **IndexedDB**（`LifeOSDB`）中
- 通过 `node server.js` 启动时，会额外同步到本机 JSON 文件：`LifeOS/data/lifeos-db.json`
- 后端备份保存在 `LifeOS/data/backups/`，最多保留最近 20 份自动备份
- 纯本地存储，不上传至外部服务器
- 存储容量受浏览器限制（约 50MB ~ 数百MB）

### 定期备份建议
1. 进入 Dashboard → 点击 **「导出数据」**
2. 或进入 **设置** → **数据管理** → **导出全部数据**
3. 系统会下载一个 `lifeos-backup-YYYY-MM-DD.json` 文件
4. 建议每周至少备份一次，保存到安全位置

### ⚠️ 数据丢失风险
- 浏览器清理缓存/历史记录时可能清除 IndexedDB
- 隐私模式/无痕模式下数据不会被保留
- 重装系统或更换浏览器后数据不迁移

---

## 🔧 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (CDN) | 前端框架 |
| 自定义 CSS | 全局样式与水彩/霍格沃茨主题 |
| IndexedDB | 本地数据持久化 |
| Node.js + Express | 可选本机后端，静态托管 + JSON 文件持久化 API |
| PWA Service Worker | 离线缓存本地页面、核心资源与运行时 CDN Vue |
| 全局 IIFE (`window.LifeOS`) | 运行入口，兼容 `file://` 协议 |

> 说明：`LifeOS/js/db.js`、`LifeOS/js/utils.js`、`LifeOS/js/components/Sidebar.js` 保留了早期 ES Module 写法，但当前页面实际加载的是 `LifeOS/js/core.js`，各页面内联 Sidebar 组件。

---

## 📖 开发指南

### 从零构建
查看 `LifeOS/guide/` 目录下的 Step-by-Step 构建指南：
- `step-00-project-setup.md` — 项目初始化
- `step-01-sidebar-icons-pages.md` — 侧边栏 + 页面骨架
- `step-02-data-layer.md` — IndexedDB 数据层
- `step-06-habit-tracker.md` — 习惯打卡
- `step-07-daily-review.md` — 每日回顾
- `step-08-learning-diary.md` — 学习日记
- `step-09-dashboard.md` — Dashboard 首页
- `step-10-settings.md` — 设置页面

### 数据库结构
```
LifeOSDB (IndexedDB)
├── timeline        ← 时间轴事件
├── tasks           ← 任务
├── habits          ← 习惯
├── habitRecords    ← 习惯打卡记录
├── reviews         ← 每日回顾
├── skills          ← 学习技能树
├── notes           ← 学习笔记
├── characters      ← 角色库
├── settings        ← 应用设置
└── moments         ← 特殊事件
```

### 开发测试

当前没有前端构建流程。后端和测试都使用 Node.js 直接运行：

```bash
node tests/core-data.test.js
node --check server.js
node --check LifeOS/js/core.js
node --check LifeOS/js/pwa.js
node --check LifeOS/sw.js
```

测试覆盖：
- 循环时间轴事件不应在开始日期之前展开
- 取消循环后 `isRecurring` 同步更新
- 习惯 streak 忽略未来记录，并正确处理中断
- 每日回顾二次保存保留 `createdAt`
- 循环任务完成/撤回时生成与清理下一日副本
- 通用 `LifeOS.AIClient` 发送 OpenAI-compatible 请求、记录历史、重试与配置校验

后端 smoke test 建议：

```bash
node server.js
# 新开终端访问：
# http://localhost:3000/api/status
```

---

## 🗂️ 相关文件

- `PRD_LifeOS.md` — 完整产品需求文档（功能清单、验收标准、MoSCoW 优先级）
- `LifeOS/data/character_dialogue_styles.json` — 31 位核心角色的台词风格描述与示例台词

---

> 版本：v1.2-dev | 作者：Jasmine | 最后更新：【2026-07-09 10:35】
