-- ============================================================
-- LifeOS 多端同步 — Supabase 建表脚本
-- 对应 guide/multi-device-sync-design.md §4.5
--
-- 使用方法：
--   1. 在 Supabase 控制台创建项目（Region 建议选 Singapore）
--   2. 打开 SQL Editor，粘贴并执行本脚本（一次性建 9 张表）
--   3. 在 LifeOS 设置页 → 多端同步 填入 Project URL 和 anon public key
--
-- 表结构说明（9 张表统一同构）：
--   id         text        主键 —— 本地 IndexedDB 记录的主键
--                          （reviews 表的 id 即复盘日期 yyyy-MM-dd）
--   data       jsonb       完整记录 JSON（含 updatedAt/updatedBy/deletedAt）
--   updated_at timestamptz 最后修改时间（LWW 判定依据，增量同步过滤条件）
--   updated_by text        最后修改设备 ID（dev-xxxx）
--   deleted_at timestamptz 软删除墓碑，NULL 表示未删除
-- ============================================================

-- tasks：任务（含子任务）
create table if not exists tasks (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists tasks_updated_at_idx on tasks (updated_at);

-- timeline：时间轴事件
create table if not exists timeline (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists timeline_updated_at_idx on timeline (updated_at);

-- habits：习惯
create table if not exists habits (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists habits_updated_at_idx on habits (updated_at);

-- habit_records：习惯打卡记录（对应本地 habitRecords store）
create table if not exists habit_records (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists habit_records_updated_at_idx on habit_records (updated_at);

-- reviews：每日复盘（id 即日期 yyyy-MM-dd）
create table if not exists reviews (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists reviews_updated_at_idx on reviews (updated_at);

-- skills：学习技能树
create table if not exists skills (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists skills_updated_at_idx on skills (updated_at);

-- notes：学习笔记
create table if not exists notes (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists notes_updated_at_idx on notes (updated_at);

-- characters：角色库
create table if not exists characters (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists characters_updated_at_idx on characters (updated_at);

-- moments：特殊事件
create table if not exists moments (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null,
  updated_by text,
  deleted_at timestamptz
);
create index if not exists moments_updated_at_idx on moments (updated_at);

-- devices：设备注册表（v5.0.0 设备管理 F-109~F-112）
-- id 即 deviceId；data 为 { deviceId, name, userAgent, firstSeenAt, lastSeenAt,
-- isMaster, status('active'|'sleeping'|'revoked'), appVersion }
create table if not exists devices (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null
);
create index if not exists devices_updated_at_idx on devices (updated_at);

-- ============================================================
-- 可选：RLS（行级安全）策略
-- ============================================================
-- 单用户场景下有两种选择：
--
-- 【方案 A：保持 RLS 关闭（默认，推荐个人使用）】
--   Supabase 新建表默认不启用 RLS，anon key 即可全权读写。
--   只要不公开 Project URL + anon key，数据就是安全的。
--   无需执行任何额外语句。
--
-- 【方案 B：启用 RLS + 单条 allow-all 策略】
--   如果希望显式控制访问，可对每张表执行（以 tasks 为例）：
--
--   alter table tasks enable row level security;
--   create policy "allow all for anon" on tasks
--     for all
--     using (true)
--     with check (true);
--
--   对其余 8 张表（timeline / habits / habit_records / reviews /
--   skills / notes / characters / moments）重复同样两条语句即可。
--
--   注意：若启用 RLS 但未配策略，anon key 将被拒绝所有访问，
--   LifeOS 同步会全部失败（HTTP 401/403）。
--
-- 安全提示：anon key 相当于数据库全权凭证，只保存在各设备本地
-- IndexedDB 中，不要提交到公开仓库；泄露时可在 Supabase 后台重置。
