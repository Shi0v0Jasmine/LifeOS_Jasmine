# LifeOS 多端同步架构设计文档

> 版本: v1.0 · 日期: 2026-07-20
> 目标: 电脑（新加坡）/ 手机（国内）/ 任意浏览器 多端使用，数据自动同步

---

## 1. 托管平台选型（国内免 VPN 直连）

### 调研结论（2026-07 核实）

| 平台 | 国内直连 | 说明 |
|------|---------|------|
| Vercel (`*.vercel.app`) | ❌ | 2021 年起被 DNS 污染，国内无法直连；绑自有域名 + `cname-china.vercel-dns.com` 可缓解，但需购域名且速度不稳 |
| Netlify | ⚠️ 不稳定 | 未被彻底封禁但速度/稳定性差 |
| GitHub Pages | ⚠️ 不稳定 | 间歇性访问困难 |
| **EdgeOne Pages（腾讯）** | ✅ | 海外 CDN 节点、免备案、免费、目前国内可流畅访问，自带默认域名 |
| 腾讯云 CloudBase 静态托管 | ✅ | 国内节点最快，免费 1GB 存储 + 5GB 流量/月；自定义域名需 ICP 备案（默认域名不需要）；注意仅中国站提供，国际站无此服务 |
| 腾讯云 COS / 阿里 OSS 静态网站 | ✅ | 需备案域名，配置繁琐，不适合本项目 |

### 决策

**静态托管：EdgeOne Pages（首选）**
- 免备案、免 VPN、免费、国内可直连、部署简单（拖文件夹或连 Git）
- 备选：CloudBase 静态托管（若追求国内最快速度）

**同步后端：双后端可切换（国内 CloudBase / 国际 Supabase）**
- 同步引擎按传输层抽象为 adapter 接口（`testConnection / upsert / fetchSince`），核心 push/pull/LWW/冲突队列逻辑两边完全复用
- 设置页 → 多端同步 →「同步后端」下拉切换：`关闭 / Supabase（国际）/ 腾讯云 CloudBase（国内）`
- **腾讯云 CloudBase（国内版）**：国内节点速度快、免 VPN；Web SDK 经官方 CDN（static.cloudbase.net / imgcache.qq.com）懒加载，匿名登录鉴权；配置步骤见 `guide/cloudbase-setup.md`
- **Supabase（国际版，新加坡区域）**：国内可直连（无国内节点，速度略慢但够用）；免费额度（500MB 数据库 + 2GB 带宽/月）充裕；PostgREST 纯 `fetch` 即可调用；建表脚本见 `guide/supabase-setup.sql`
- 两个后端的表/集合结构**同构同名**（见 §4.5），`lastSyncAt` 按 provider 分键存储（`lastSyncAt_supabase` / `lastSyncAt_cloudbase`），切换后端后首次同步自动全量 push，不会漏数据

---

## 2. 总体架构：Local-First + 云端中继

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│  手机浏览器   │         │   Supabase    │         │  电脑浏览器   │
│  (国内)      │ ──────► │  (新加坡区域)  │ ◄────── │  (新加坡)    │
│  IndexedDB   │  push   │  Postgres 表  │  pull   │  IndexedDB   │
└─────────────┘         └──────────────┘         └─────────────┘
```

**核心原则：**
- IndexedDB 仍是所有页面的**唯一读写数据源**（现有代码零改动读写路径）
- `js/sync.js`（SyncEngine）作为后台模块：写操作后自动 push，定时/启动时 pull
- 离线可用：断网时一切照常，恢复联网后自动补同步
- 云端是"中继 + 备份"，不是主库 —— 任何一端数据丢了都能从云端或另一端恢复

---

## 3. 数据模型变更

### 3.1 记录级新增字段（所有业务 store）

| 字段 | 类型 | 说明 |
|------|------|------|
| `updatedAt` | ISO 8601 字符串 | 最后修改时间（LWW 判定依据） |
| `updatedBy` | string (deviceId) | 最后修改设备 ID（冲突界面展示"来自哪台设备"） |
| `deletedAt` | ISO 字符串 \| null | 软删除墓碑。同步场景下删除必须留痕，否则另一端会把它当新数据拉回 |

涉及 store：`tasks`、`timeline`、`habits`、`habitRecords`、`reviews`、`skills`、`notes`、`characters`、`moments`
（`settings` 为设备本地配置，**不同步**）

### 3.2 设备与同步配置（存 `settings` store，每设备独立）

| key | 说明 |
|-----|------|
| `deviceId` | 首次启动生成 `dev-xxxx`，永久不变 |
| `deviceName` | 用户可编辑，如「手机-小米」「公司电脑」 |
| `isMainDevice` | 是否主设备（见 §5 冲突策略） |
| `supabaseUrl` / `supabaseAnonKey` | 云端连接配置 |
| `lastSyncAt` | 上次成功同步时间戳 |
| `conflictPolicy` | `'lww'`（默认自动）\| `'ask'`（人工选择） |

### 3.3 IndexedDB 版本升级 v2 → v3

- 迁移：遍历所有业务 store，旧记录补 `updatedAt = createdAt || 当前时间`、`updatedBy = null`、`deletedAt = null`
- 在 DB 层 `put`/`delete` 封装中统一打戳（见 §4），业务模块无需逐个修改

---

## 4. 同步协议（SyncEngine）

### 4.1 写路径打戳

- `db.put(store, data)`：自动写入 `updatedAt = now()`、`updatedBy = deviceId`
- `db.delete(store, id)`：改为软删除 —— 读取记录 → 置 `deletedAt` → put
- SyncEngine 内部写入（pull 下来的远端数据）须跳过打戳，保留远端原始 `updatedAt`/`updatedBy`

### 4.2 Push（本地 → 云）

1. 扫描各 store 中 `updatedAt > lastSyncAt` 的记录（含墓碑）
2. 按 store 分批 `POST /rest/v1/{table}?on_conflict=id`（upsert，Prefer: resolution=merge-duplicates）
3. 全部成功后更新 `lastSyncAt`

### 4.3 Pull（云 → 本地）

1. `GET /rest/v1/{table}?updated_at=gt.{lastSyncAt}` 拉取增量
2. 逐条与本地同 id 记录比较：
   - 本地不存在 → 直接写入
   - 远端 `updatedAt` 更新 → 采用远端
   - 本地 `updatedAt` 更新 → 保留本地（等待下次 push）
   - **双端都在 lastSyncAt 之后改过（真冲突）→ 见 §5**
3. 远端墓碑（`deletedAt` 非空）→ 本地同样软删除
4. 触发 UI 刷新事件（`window.dispatchEvent(new CustomEvent('lifeos:synced'))`），各页面监听后重新加载数据

### 4.4 触发时机

| 时机 | 动作 |
|------|------|
| 页面加载完成 | 静默 sync()（pull + push） |
| 本地写操作后 | 防抖 5s 自动 push |
| 浏览器 `online` 事件 | 立即 sync() |
| 设置页「立即同步」按钮 | 手动 sync()，显示结果 |
| 每 5 分钟（页面打开时） | 定时 pull |

### 4.5 后端表结构（两版同构）

每个 store 对应一张表（Supabase）/ 一个集合（CloudBase），名称一致、结构同构：

**Supabase（Postgres）：**

```sql
create table tasks (
  id text primary key,
  data jsonb not null,          -- 完整记录 JSON
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
-- timeline / habits / habit_records / reviews / skills / notes / characters / moments 同构
-- reviews 的 id 即 date
```

**CloudBase（文档数据库）：**

```
集合名与 Supabase 表名完全一致（tasks / timeline / habits / habit_records /
reviews / skills / notes / characters / moments），每条文档：
{
  _id: "记录 id（reviews 为日期）",   -- 以记录 id 作为 doc _id
  data: { ...完整记录 JSON... },
  updated_at: "ISO 8601 字符串",
  updated_by: "dev-xxx",
  deleted_at: null | "ISO 8601 字符串"
}
```

统一行格式 `{id, data, updated_at, updated_by, deleted_at}` 由 adapter 层保证：
CloudBase adapter 读出后把 `_id` 映射回 `id`，与 Supabase 行格式对齐。

Supabase 单用户场景：可关闭 RLS（anon key 即全权访问，URL+key 不公开即可），或开启 RLS + 单条 allow-all 策略。**URL 和 anon key 属于半敏感信息，不要提交到公开仓库。**
CloudBase 单用户场景：开启匿名登录 + 安全规则「所有用户可读写」或「仅登录用户读写」，envId 不公开即可，详见 `guide/cloudbase-setup.md`。

---

## 5. 冲突解决策略

### 5.1 默认：Last-Write-Wins

- 比较 `updatedAt`，新的覆盖旧的 —— 满足"一般不会有冲突"的使用模式
- 时钟偏差防护：以个人使用场景，设备时钟误差可接受；不引入向量时钟

### 5.2 主设备（Main Device）

- 设置页可开启「本设备为主设备」（同一时间建议只有一台）
- 作用 1：冲突且两边 `updatedAt` 差值 < 2 秒（近似平局）时，**主设备版本获胜**
- 作用 2：冲突选择界面中，主设备来源的版本带「主设备」徽标，方便识别

### 5.3 人工冲突选择（conflictPolicy = 'ask'）

当同一记录双端都发生过离线修改时：
1. 冲突进入「冲突队列」（存 settings store 的 `syncConflicts`）
2. 设置页显示冲突列表，每条展示：
   - 记录类型 + 标题/摘要
   - **两个版本各自的：来源设备名、修改时间、关键字段 diff**
   - 「保留本地」/「保留远端」按钮
3. 用户选择后写入胜出版本并 push；未处理的冲突不阻塞其他数据同步

---

## 6. 实施清单

| # | 任务 | 文件 |
|---|------|------|
| 1 | DB 升级 v3 + 迁移 + put/delete 打戳 | `js/core.js` |
| 2 | SyncEngine（push/pull/合并/冲突队列） | `js/sync.js`（新建） |
| 3 | 设置页：设备信息、云端配置、主设备开关、冲突队列 UI | `settings.html` |
| 4 | 各 HTML 页引入 `js/sync.js` | 全部页面 |
| 5 | 合并逻辑单元测试 | `tests/sync-merge.test.js`（新建） |
| 6 | Supabase 建表 SQL 脚本 | `guide/supabase-setup.sql`（新建） |
| 7 | 用户配置指引（建项目、填 key） | 本文档 §7 |

---

## 7. 用户侧配置步骤（两个后端入口）

**入口：LifeOS 设置页 → 多端同步 →「同步后端」下拉，二选一。**

### 7.1 Supabase（国际版）

1. 注册 https://supabase.com（GitHub 登录即可，国内可访问控制台）
2. New Project → Region 选 **Singapore** → 记录 Project URL 和 anon public key
3. SQL Editor 中执行 `guide/supabase-setup.sql`（一次性建 9 张表）
4. 打开 LifeOS 设置页 → 多端同步 → 同步后端选 **Supabase（国际）** → 填入 URL + anon key → 测试连接 → 保存

### 7.2 腾讯云 CloudBase（国内版）

1. 注册腾讯云并进入云开发控制台，创建按量计费环境，记录 **环境 ID**
2. 创建 9 个集合（名称与 Supabase 表名一致），开启 **匿名登录**，配置数据库安全规则
3. 打开 LifeOS 设置页 → 多端同步 → 同步后端选 **腾讯云 CloudBase（国内）** → 填入环境 ID → 测试连接 → 保存
4. 详细步骤（含截图位置）见 `guide/cloudbase-setup.md`

### 通用

- 在每台设备上各填一次相同配置，并给设备起名字（如「手机」「新加坡电脑」）
- 切换后端后首次同步会把本机数据**全量推送**到新后端（`lastSyncAt` 按 provider 分键存储，互不影响）

---

## 8. 风险与限制

- **Supabase 国内速度**：无国内节点，首次全量同步可能数秒；日常增量同步 < 1s 可接受
- **anon key 安全**：相当于数据库全权凭证，仅存于各设备本地 IndexedDB，不进入代码仓库；泄露时可在 Supabase 后台重置
- **EdgeOne Pages 默认域名**：个人够用；若将来被墙可平移至 CloudBase（代码无需改动）
- **大数据量**：全量导出备份功能（已有）保留，同步不替代备份
