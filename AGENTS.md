# LifeOS — Agent 上下文与项目约定

> 本文件供 AI Agent 每次会话启动时读取，快速建立项目上下文。
> 最后更新：2026-07-25

---

## 1. 项目一句话

LifeOS 是一个本地优先（Local-First）的个人生活管理 PWA：Vue 3 CDN + IndexedDB，无构建步骤，通过 CloudBase（国内）/ Supabase（国际）双后端做多端同步，已部署到 CloudBase 静态托管。

---

## 2. 文件树（File Tree）

```text
D:\FUN_VibeCoding\LifeOS\
├── .gitattributes
├── .gitignore
├── AGENTS.md                    ← 本文件
├── PRD_LifeOS.md                ← 产品需求文档（功能编号 F-xxx、用户故事 US-xxx）
├── README.md                    ← 项目门面与快速说明
├── package.json
├── package-lock.json
├── server.js                    ← 本机 Express 后端（可选，静态托管 + /api/db JSON 持久化）
├── start.bat                    ← Windows 一键启动脚本
├── cloudbaserc.json             ← CloudBase CLI 部署配置（envId + 云函数清单）
├── cloud-functions/
│   └── ai-proxy/
│       ├── index.js             ← CloudBase 云函数：AI 请求代理（解浏览器 CORS）
│       └── package.json
├── tests/
│   ├── core-data.test.js        ← 数据层回归（10 项）
│   ├── subtask.test.js          ← 子任务专项（9 项）
│   ├── sync-merge.test.js       ← 同步引擎合并逻辑 + 双后端 + 设备管理 + 账号（29 项）
│   ├── habit-plan.test.js       ← 习惯周期计划与暂停（7 项）
│   ├── habit-metrics.test.js    ← 习惯度量/AI 解析/数据面板聚合（5 项）
│   └── ai-planner-parse.test.js ← AI 规划解析（5/6 项，纯对象无数组为设计预期）
└── LifeOS/                      ← 应用主目录（部署到 CloudBase 静态托管的内容）
    ├── index.html               ← Dashboard 首页
    ├── timeline.html            ← 时间轴
    ├── tasks.html               ← 任务管理
    ├── habits.html              ← 习惯打卡
    ├── review.html              ← 每日回顾
    ├── learning.html            ← 学习日记
    ├── characters.html          ← 角色库
    ├── settings.html            ← 设置（AI 配置 / 数据管理 / 账号 / 多端同步 / 设备管理）
    ├── test.html                ← 测试页
    ├── manifest.webmanifest     ← PWA 安装配置
    ├── sw.js                    ← Service Worker（静态/数据/运行时三层缓存，发版必升版本号）
    ├── user-manual.md           ← 用户手册（账号登录 Quick Start + 详细指南）
    ├── DEV_LOG.md               ← 开发日志（按版本倒序记录变更与踩坑）
    ├── VERSIONING.md            ← 版本管理规则与历史
    ├── css/
    │   └── style.css            ← 全局样式（CSS 变量 + 水彩/玻璃拟态主题）
    ├── js/
    │   ├── core.js              ← 数据层：DAO + 预置角色 + AIClient/AIPlanner（79KB）
    │   ├── db.js                ← IndexedDB 底层封装
    │   ├── sync.js              ← 多端同步引擎（push/pull/LWW/冲突队列/设备管理/账号登录）
    │   ├── utils.js             ← 工具函数（日期/UUID/四象限/JSON 解析）
    │   ├── mobile-nav.js        ← 移动端汉堡菜单注入
    │   ├── pwa.js               ← PWA 注册与安装提示
    │   └── components/
    │       └── Sidebar.js       ← 侧边栏组件（8 页面共享，内联定义）
    ├── assets/
    │   └── icons/               ← SVG 图标
    ├── data/
    │   ├── character_dialogue_styles.json  ← 角色台词风格数据
    │   ├── lifeos-backup-*.json            ← 历史数据备份（已 gitignore）
    │   └── lifeos-db.json                  ← 本机后端持久化文件（已 gitignore）
    ├── guide/                   ← 开发者指南
    │   ├── step-00-project-setup.md ~ step-10-settings.md
    │   ├── cloudbase-setup.md
    │   ├── multi-device-sync-design.md
    │   ├── mobile-responsive-plan.md
    │   └── supabase-setup.sql
    ├── references/              ← 参考截图/文档（已 gitignore）
    └── archive/                 ← 归档文档
```

---

## 3. 关键路径速查

| 用途 | 路径 |
|------|------|
| 应用源码 | `LifeOS/` |
| 数据层核心 | `LifeOS/js/core.js` |
| 同步引擎 | `LifeOS/js/sync.js` |
| 全局样式 | `LifeOS/css/style.css` |
| Service Worker | `LifeOS/sw.js` |
| 测试套件 | `tests/` |
| 本机后端 | `server.js` |
| CloudBase 云函数 | `cloud-functions/ai-proxy/` |
| PRD | `PRD_LifeOS.md` |
| 开发日志 | `LifeOS/DEV_LOG.md` |
| 版本规则 | `LifeOS/VERSIONING.md` |
| 用户手册 | `LifeOS/user-manual.md` |

---

## 4. 技术约束（必须遵守）

1. **无构建步骤**：纯 HTML/CSS/JS，禁用 `import/export`、禁用 ES Module `<script type="module">`。
2. **Vue 3 CDN 全局版**：`vue.global.js`，IIFE + `window.LifeOS` 暴露模块。
3. **日期格式统一**：全程 `YYYY-MM-DD` 字符串，避免 `new Date()` 时区问题。
4. **IndexedDB 版本**：当前 v3，升级必须写迁移逻辑并覆盖旧数据。
5. **软删除**：业务记录删除改墓碑（`deletedAt`），同步时传播。
6. **所有写操作打戳**：`updatedAt` + `updatedBy`（deviceId），同步归因需要。
7. **CSS 变量系统**：颜色用 `var(--color-*)`，不硬编码。
8. **移动端断点**：`@media (max-width: 768px)`。

---

## 5. 版本规则（2026-07-25 起生效）

| 级别 | 定义 | 示例 |
|------|------|------|
| **大版本（MAJOR）** | 全新功能模块/页面级插入（从 0 到 1） | 学习技能树、时间轴模块 |
| **小版本（MINOR）** | 既有板块的功能追加 | 子任务、账号登录、设备管理 |
| **PATCH** | bug 修复、样式微调、文档修正 | 循环副本竞态、iOS 日期框占位 |

> 历史版本号（v3.0.0/v4.0.0/v5.0.0/v5.1.0）保持不变，后续发版按新规则执行。

---

## 6. 常用命令

### 运行测试

```bash
cd D:/FUN_VibeCoding/LifeOS
node tests/core-data.test.js      # 数据层回归（10 项）
node tests/subtask.test.js        # 子任务专项（9 项）
node tests/sync-merge.test.js     # 同步引擎（29 项）
node tests/habit-plan.test.js     # 习惯周期计划与暂停（7 项）
node tests/habit-metrics.test.js  # 习惯度量/AI 解析/数据面板（5 项）
node tests/ai-planner-parse.test.js  # AI 规划解析（5/6 项）
```

### 本地运行

```bash
cd D:/FUN_VibeCoding/LifeOS
node server.js                    # http://localhost:3000
# 或
start.bat                         # Windows 一键启动
```

### 部署到 CloudBase

```bash
# 每个新窗口部署前都要先执行这两行（不设 XDG_CONFIG_HOME 会触发 device flow 重新授权）
export MSYS_NO_PATHCONV=1
export XDG_CONFIG_HOME="C:/Users/21136/.config"
node "C:/Users/21136/AppData/Local/npm-cache/_npx/9a8789722ddc2fbe/node_modules/@cloudbase/cli/bin/tcb" \
  hosting deploy "D:/FUN_VibeCoding/LifeOS/LifeOS/文件路径" "/云端路径" \
  -e lifeos-d5gxoyi3o79a3518c
```

> 注意：
> - `MSYS_NO_PATHCONV=1` 必须设置，否则 Git Bash 会把 `/` 转成 MSYS 根路径。
> - `XDG_CONFIG_HOME` 必须指向 `C:/Users/21136/.config`，否则 CLI 找不到已存凭证、每次都会触发 device flow 重新授权。
> - **授权机制**：凭证存于 `C:/Users/21136/.config/.cloudbase/auth.json`——refreshToken 30 天有效（到期必须重新授权一次，腾讯云硬限制），临时密钥 2 小时有效（CLI 每次运行自动用 refreshToken 换新的，无需人工干预）。**刻意不 `setx` 持久化该变量**（会影响全账户所有进程），保持每次临时 export。
> - **网络排障**：若报 `tcb_refresh ... TLS connection was established` 类错误，多为本机代理（Clash fake-ip 等）劫持了 `iaas.cloud.tencent.com`；检查/切换代理状态后重试即可（直连恢复后原命令可跑通）。
> - 改码后必须同步升级 `LifeOS/sw.js` 的缓存版本号，并部署改动文件。

---

## 7. 当前版本与状态

- **Current / Latest**：`v5.4.0`（2026-07-27 发布）
- **线上地址**：https://lifeos-d5gxoyi3o79a3518c-1456250880.tcloudbaseapp.com
- **CloudBase 环境**：`lifeos-d5gxoyi3o79a3518c`（上海，免费体验版）
- **IndexedDB 版本**：v3
- **SW 缓存版本**：`lifeos-static-v20260727-1`

---

## 8. 发版检查清单

```
□ 测试套件全绿：core-data / subtask / sync-merge / ai-planner-parse / habit-plan / habit-metrics
□ 浏览器 Ctrl+F5 验证主要页面无 JS 报错
□ 若动了数据层：IndexedDB 版本 +1 且迁移覆盖旧数据
□ sw.js 缓存版本号 +1
□ 部署改动文件到 CloudBase
□ curl 校验线上内容含新代码
□ 更新 LifeOS/VERSIONING.md（Current + 版本历史）
□ 更新 LifeOS/DEV_LOG.md（追加变更章节）
□ 更新 PRD_LifeOS.md（Checklist / MoSCoW / 版本规划）
□ git commit && git push origin main
```

---

## 9. 已知坑与备忘

1. **Origin 数据孤岛**：IndexedDB 按 origin 隔离，`file://` / `localhost:3000` / `localhost:8000` / 部署域名各自独立。用户必须固定一种访问方式。
2. **Service Worker 更新滞后**：新部署后旧 SW 可能仍在控制页面，需关闭全部标签页/PWA 后重开，或 Ctrl+Shift+R。
3. **CloudBase CLI 授权**：Windows 下必须设置 `XDG_CONFIG_HOME`，否则每次运行都触发 device flow。
4. **iOS Safari 小字号 date 输入框**：不渲染占位文字，需用 `type="text"` / `type="date"` 聚焦切换模式。
5. **移动端弹窗裁剪**：`.modal` 需 `max-height: calc(100dvh - 40px)` + `overflow-y: auto`。
6. **AI API CORS**：浏览器直连 `api.kimi.com` 会被拦截，必须经 CloudBase 云函数 `ai-proxy` 转发。

---

*本文件由 AI Agent 维护，随项目结构变化更新。*
