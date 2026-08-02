# LifeOS — 日常跟踪与记录 App

> 一款融合动漫角色激励、四象限任务管理、习惯打卡、每日复盘与学习技能树的个人效率管理工具。
> 水彩风格 UI + 霍格沃茨 Ravenclaw/Slytherin 配色，本地优先（Local-First），离线可用，CloudBase/Supabase 双后端多端同步。

## 🌐 线上地址（直接用）

**https://lifeos-d5gxoyi3o79a3518c-1456250880.tcloudbaseapp.com**

手机/电脑浏览器均可访问；手机端可「添加到主屏幕」安装为 PWA。详细用法见 `LifeOS/user-manual.md`（用户手册）。

---

## 📦 项目结构

```
D:\FUN_VibeCoding\LifeOS\
├── LifeOS\                      ← 应用主目录（部署到 CloudBase 静态托管）
│   ├── index.html               ← Dashboard 首页
│   ├── timeline.html            ← 时间轴管理
│   ├── tasks.html               ← 任务管理（四象限 + 统计视图）
│   ├── habits.html              ← 习惯打卡（计划/暂停/度量/数据面板）
│   ├── nutrition.html           ← 健康（报告/指标趋势/餐食/运动/目标/周报）
│   ├── review.html              ← 每日回顾（情绪月历 + GRAI）
│   ├── learning.html            ← 学习日记 / 技能树
│   ├── characters.html          ← 角色库
│   ├── settings.html            ← 设置（AI 配置 / 数据管理 / 账号 / 多端同步 / 设备管理）
│   ├── manifest.webmanifest     ← PWA 安装配置
│   ├── sw.js                    ← Service Worker 离线缓存（发版必升版本号）
│   ├── user-manual.md           ← 用户手册
│   ├── css\style.css            ← 全局样式
│   ├── js\                      ← 核心脚本
│   │   ├── core.js              ← 数据层 DAO + AIClient/AIPlanner + HabitPlan
│   │   ├── nutrition.js         ← 饮食/运动 DAO + 营养计算/解析引擎
│   │   ├── health-reports.js    ← 健康报告 PDF/图片解析 + 结构化档案 DAO
│   │   ├── sync.js              ← 多端同步引擎（push/pull/LWW/冲突/设备管理/账号）
│   │   ├── mobile-nav.js        ← 移动端汉堡菜单 + 底部 Tab Bar 注入
│   │   ├── pwa.js               ← PWA 注册与安装提示
│   │   └── components\          ← Vue 组件（Sidebar）
│   ├── data\                    ← 食物营养库 + 备份/本机 JSON（后两者 git 忽略）
│   ├── vendor\                  ← PDF.js / heic2any / UTIF 本地解码依赖
│   ├── assets\                  ← 静态资源（icons/ 含 PWA 图标 lifeos-app.svg）
│   └── guide\                   ← 从零构建指南（Step 0-10）+ 架构设计文档
├── tests\                       ← 数据层/同步/习惯/营养/健康报告回归测试（9 套件）
├── cloud-functions\ai-proxy\    ← CloudBase 云函数：AI 请求代理（解 CORS）
├── server.js                    ← 本机 Express 后端（静态托管 + JSON 持久化 API）
├── start.bat                    ← Windows 一键启动
├── package.json                 ← Node/Express 启动配置
├── PRD_LifeOS.md                ← 产品需求文档
├── AGENTS.md                    ← AI Agent 项目上下文与约定
└── README.md                    ← 本文件
```

---

## 🚀 快速开始

### 方式零：直接用线上版（推荐）

打开 https://lifeos-d5gxoyi3o79a3518c-1456250880.tcloudbaseapp.com 即可。

### 方式一：本机后端（JSON 文件持久化）
```bash
cd D:\FUN_VibeCoding\LifeOS
node server.js
# 然后浏览器访问 http://localhost:3000
```
也可以双击 `start.bat`（无 Node.js 时降级为 Python 静态服务器）。

### 方式二：直接双击打开
双击 `LifeOS/index.html`（`file://` 协议，功能可用但数据与线上/localhost 互相隔离）。

> ⚠️ IndexedDB 按「网址来源」隔离：线上地址 / localhost / file:// 各自独立，请固定一种方式使用。

### 首次使用：导入备份数据

1. 打开 `index.html`（Dashboard）
2. 点击右上角 **⚙️ 设置**，或在 Dashboard 点击 **「导入数据」**
3. 选择 `LifeOS/data/` 下的备份 JSON，策略选「合并」或「覆盖」
4. 没有备份也可进 **角色库** → **「导入预置角色」** 加载 50+ 内置角色

---

## ✨ 功能概览

| 模块 | 核心功能 |
|------|---------|
| **📊 Dashboard** | 今日概览、完成率、连续打卡、待办任务、学习 XP、情绪、聚合月历 |
| **⏱️ 时间轴** | 预计/实际双列、任务拖拽排期、计时器、循环事件、任务完成联动（✓ 删除线） |
| **📝 任务** | 四象限分类、子任务、AI 拆解、自然语言创建、📊 周/月统计视图 |
| **✅ 习惯** | 打卡 + 月历热力图、周期/限时计划、暂停（原因必填）、成果度量（数字/时长/文字）、截图 AI 解析（只解析不存图）、周/月/季/年数据面板、习惯详情历史 |
| **💚 健康** | 健康总览、体检/化验/体重秤报告 PDF 与常见图片导入、AI 结构化解析、异常关注和指标趋势；同时保留餐食照片识别、运动、目标与营养周报；原件只解析不保存 |
| **🌙 每日回顾** | DID/GOOD/BAD/THOUGHTS 复盘、情绪 + 原因、情绪月历、GRAI AI 分析 |
| **🌲 学习日记** | RPG 技能树、XP 经验值、学习笔记、统计面板 |
| **🎭 角色库** | 50+ 预置角色（排球少年/Fate/EVA/柯南）、激励对话、互动优先级 |
| **⚙️ 设置** | AI API 配置、数据导入/导出/重置、账号登录、多端同步、设备管理 |
| **🔄 多端同步** | Local-First 增量 push/pull、LWW 冲突解决、CloudBase（国内）/Supabase（国际）双后端 |
| **📱 移动端** | 底部 Tab Bar、四象限 Tab、弹窗 bottom sheet、PWA 可安装 |

### 🎯 激励系统

- **完成率 ≥ 75%**：随机角色弹出鼓励对话（个性化台词）
- **完成率 ≥ 85%**：多角色互动对话，互道晚安

---

## 💾 数据安全与备份

### 存储方式
- 所有数据默认存浏览器 **IndexedDB**（`LifeOSDB`），纯本地优先
- 配置同步后端后，增量同步到 CloudBase（国内默认）或 Supabase
- `node server.js` 启动时额外同步到本机 JSON：`LifeOS/data/lifeos-db.json`（备份最多保留 20 份）
- 云端凭据（envId/Supabase key）仅存本地，不进代码仓库

### 定期备份建议
1. Dashboard → **「导出数据」**，或 设置 → 数据管理 → 导出全部数据
2. 建议每周至少导出一次 `lifeos-backup-YYYY-MM-DD.json` 存档
3. 云同步不替代本地备份，导出功能作为最终兜底

### ⚠️ 数据丢失风险
- 浏览器清理缓存可能清除 IndexedDB
- 隐私/无痕模式下数据不保留
- 换浏览器/清缓存后本地数据不迁移（已配置云同步的可从云端拉回）

---

## 🔧 技术栈

| 技术 | 用途 |
|------|------|
| Vue 3 (CDN) | 前端框架（无构建，IIFE + `window.LifeOS`） |
| 自定义 CSS | 全局样式与水彩/霍格沃茨主题 |
| IndexedDB | 本地数据持久化（当前 v4） |
| CloudBase / Supabase | 多端同步双后端 + 静态托管 + ai-proxy 云函数 |
| Node.js + Express | 可选本机后端，静态托管 + JSON 文件持久化 API |
| PWA Service Worker | 三层缓存（静态/数据/运行时），发版必升版本号 |

---

## 📖 开发指南

### 从零构建
查看 `LifeOS/guide/` 目录下的 Step-by-Step 构建指南（step-00 ~ step-10），以及 `cloudbase-setup.md`、`multi-device-sync-design.md` 等架构文档。

### 数据库结构
```
LifeOSDB (IndexedDB v4)
├── timeline        ← 时间轴事件（含 taskId 关联、completed 联动标记）
├── tasks           ← 任务（含子任务、循环副本）
├── habits          ← 习惯（含 plan/pauses/metrics 字段）
├── habitRecords    ← 习惯打卡记录（含 metrics 成果值）
├── reviews         ← 每日回顾（含 emotion/emotionReason）
├── skills          ← 学习技能树
├── notes           ← 学习笔记
├── characters      ← 角色库
├── settings        ← 应用设置
├── moments         ← 特殊事件
└── nutrition       ← 健康报告结构化档案/餐食/运动/个人目标/每周营养复盘
```

### 开发测试

无前端构建流程，测试用 Node.js 直接运行：

```bash
node tests/core-data.test.js       # 数据层回归（11 项）
node tests/subtask.test.js         # 子任务专项（9 项）
node tests/sync-merge.test.js      # 同步引擎（35 项）
node tests/habit-plan.test.js      # 习惯计划与暂停（7 项）
node tests/habit-metrics.test.js   # 习惯度量/AI 解析/数据面板（5 项）
node tests/sleep-checkin.test.js     # 起床/睡觉打卡（3 项）
node tests/ai-planner-parse.test.js  # AI 规划解析（8 项）
node tests/nutrition.test.js         # AI 饮食/营养计算/隐私边界（9 项）
node tests/health-report.test.js     # 健康报告解析/趋势/隐私边界（8 项）
```

后端 smoke test：

```bash
node server.js
# 新开终端访问 http://localhost:3000/api/status
```

---

## 🗂️ 相关文件

- `LifeOS/user-manual.md` — 用户手册（网页版地址、账号登录、多端同步、功能速览、FAQ）
- `PRD_LifeOS.md` — 完整产品需求文档（功能清单、验收标准、MoSCoW 优先级、版本规划）
- `AGENTS.md` — AI Agent 项目上下文（结构/命令/部署/发版清单）
- `LifeOS/VERSIONING.md` — 版本管理规则与历史
- `LifeOS/DEV_LOG.md` — 开发日志

---

> 版本：v6.1.0 | 作者：Jasmine | 最后更新：【2026-08-01】
