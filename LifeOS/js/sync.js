/**
 * ============================================================
 * Life OS — 多端同步引擎 (sync.js)
 * ============================================================
 * Local-First 架构：IndexedDB 仍是唯一读写数据源，
 * 本模块作为后台同步引擎，通过可切换的后端做云端中继。
 *
 * 双后端架构（settings 的 syncProvider 控制）：
 * - 'none'      —— 关闭同步（静默禁用）
 * - 'supabase'  —— Supabase PostgREST（国际版）
 * - 'cloudbase' —— 腾讯云 CloudBase（国内版，@cloudbase/js-sdk 懒加载）
 *
 * 传输层抽象为 adapter 接口（核心 push/pull/LWW/冲突队列两边完全复用）：
 *   adapter.testConnection()          → { ok, message }
 *   adapter.upsert(table, rows)       → rows: [{id, data, updated_at, updated_by, deleted_at}]
 *   adapter.fetchSince(table, iso)    → 同构 rows
 *
 * 协议要点（详见 guide/multi-device-sync-design.md）：
 * - push：本地 updatedAt > lastSyncAt 的记录（含墓碑）upsert 到云端
 * - pull：拉取云端 updated_at > lastSyncAt 的增量，按 LWW 合并（putRaw 落库，不打戳）
 * - 冲突：conflictPolicy = 'lww' 新的赢（近似平局 < 2s 主设备赢）；= 'ask' 进冲突队列
 * - 触发：页面加载 sync()、写操作后防抖 5s push、online 事件 sync()、每 5 分钟 pull
 * - lastSyncAt 按 provider 分键存储（lastSyncAt_supabase / lastSyncAt_cloudbase），
 *   切换后端后首次同步自动全量 push，避免换端漏同步
 *
 * 无构建步骤约束：IIFE + window.LifeOS.Sync 暴露。
 * ============================================================
 */

(function() {
    'use strict';

    // store 名 ↔ 云端表/集合名映射（Supabase 表与 CloudBase 集合同名，方便双端互迁）
    const STORE_TABLE_MAP = {
        tasks: 'tasks',
        timeline: 'timeline',
        habits: 'habits',
        habitRecords: 'habit_records',
        reviews: 'reviews',
        skills: 'skills',
        notes: 'notes',
        characters: 'characters',
        moments: 'moments'
    };
    const SYNC_STORES = Object.keys(STORE_TABLE_MAP);

    const TIE_WINDOW_MS = 2000;               // LWW 近似平局窗口（< 2s 主设备赢）
    const FETCH_TIMEOUT_MS = 15000;           // 网络请求超时
    const AUTO_PUSH_DEBOUNCE_MS = 5000;       // 写操作后自动 push 防抖
    const PULL_INTERVAL_MS = 5 * 60 * 1000;   // 定时 pull 间隔
    const EPOCH = '1970-01-01T00:00:00.000Z'; // 首次全量同步起点
    const DEVICE_STATUS_CACHE_MS = 5 * 60 * 1000; // 设备状态自查缓存（F-111/F-112）
    const APP_VERSION = '5.1.0';              // 心跳上报用（F-109）

    /**
     * CloudBase Web SDK CDN（官方文档来源：
     * https://cloud.tencent.com/document/product/876/34659 「云开发 CloudBase Web 端 SDK」）
     * 主：static.cloudbase.net（腾讯云开发官方静态托管，国内可直连），v3.6.3 为 npm 最新版
     * 备：imgcache.qq.com（腾讯 CDN，文档同款地址），CDN 上 1.x 系列最新为 1.7.1
     * 全局命名空间为 window.cloudbase（旧的 tcb-js-sdk / tcb.js 已废弃，勿用）。
     */
    const CLOUDBASE_SDK_URLS = [
        'https://static.cloudbase.net/cloudbase-js-sdk/3.6.3/cloudbase.full.js',
        'https://imgcache.qq.com/qcloud/cloudbase-js-sdk/1.7.1/cloudbase.full.js'
    ];

    // reviews store 的 keyPath 是 date，其余均为 id
    function keyOf(storeName, record) {
        return storeName === 'reviews' ? record.date : record.id;
    }

    function toMillis(ts) {
        if (!ts) return 0;
        const t = new Date(ts).getTime();
        return isNaN(t) ? 0 : t;
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function normalizeUrl(url) {
        return (url || '').trim().replace(/\/+$/, '');
    }

    // ============================================================
    // 合并纯逻辑（可独立单元测试）
    // ============================================================
    /**
     * 决定 pull 下来的一条远端记录如何合并进本地。
     * @param {object|null} local  本地记录（含墓碑），不存在为 null
     * @param {object}      remote 远端记录（已归一化 updatedAt/updatedBy/deletedAt）
     * @param {object}      ctx    { lastSyncAt, conflictPolicy, isMainDevice, deviceId }
     * @returns {{action: 'remote'|'local'|'conflict'|'none'}}
     *   remote   —— 采用远端版本（写入本地）
     *   local    —— 保留本地版本（等待下次 push）
     *   conflict —— 真冲突且策略为 ask，进冲突队列
     *   none     —— 无需动作
     */
    function mergeRecord(local, remote, ctx) {
        ctx = ctx || {};
        if (!remote) return { action: 'none' };
        const lastSyncMs = ctx.lastSyncAt ? toMillis(ctx.lastSyncAt) : 0;
        const remoteMs = toMillis(remote.updatedAt);

        // 本地不存在 → 直接写入远端（含远端墓碑，保持一致性）
        if (!local) return { action: 'remote' };

        const localMs = toMillis(local.updatedAt);
        const localChanged = localMs > lastSyncMs;                       // 本地在上次同步后有未同步修改
        const remoteFromOtherDevice = remote.updatedBy !== ctx.deviceId; // 远端由其他设备修改

        if (localChanged && remoteFromOtherDevice) {
            // 真冲突：双端都在 lastSyncAt 之后修改过同一记录
            if (ctx.conflictPolicy === 'ask') {
                return { action: 'conflict' };
            }
            // LWW：新的赢；近似平局（差值 < 2s）主设备赢
            const diff = remoteMs - localMs;
            if (Math.abs(diff) < TIE_WINDOW_MS) {
                return { action: ctx.isMainDevice ? 'local' : 'remote' };
            }
            return { action: diff > 0 ? 'remote' : 'local' };
        }

        // 非冲突：本地未改动（远端直接覆盖），或远端是本设备修改的回显（普通 LWW）
        if (remoteMs > localMs) return { action: 'remote' };
        if (remoteMs < localMs) return { action: 'local' };
        return { action: 'none' };
    }

    // ============================================================
    // Supabase Adapter（PostgREST 纯 fetch）
    // ============================================================
    function createSupabaseAdapter(cfg) {
        async function _fetch(path, options = {}) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            let response;
            try {
                response = await fetch(cfg.url + path, {
                    method: options.method || 'GET',
                    headers: {
                        'apikey': cfg.anonKey,
                        'Authorization': 'Bearer ' + cfg.anonKey,
                        'Content-Type': 'application/json',
                        ...(options.headers || {})
                    },
                    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
                    signal: controller.signal
                });
            } catch (err) {
                clearTimeout(timer);
                const isTimeout = err && err.name === 'AbortError';
                const e = new Error(isTimeout ? '同步请求超时（15s）' : ('网络错误: ' + (err && err.message)));
                e.code = isTimeout ? 'SYNC_TIMEOUT' : 'SYNC_NETWORK';
                throw e;
            }
            clearTimeout(timer);
            if (!response.ok) {
                const text = await response.text().catch(() => '');
                const e = new Error('Supabase 请求失败: HTTP ' + response.status + (text ? ' — ' + text.slice(0, 200) : ''));
                e.code = 'SYNC_HTTP';
                e.status = response.status;
                throw e;
            }
            const text = await response.text();
            return text ? JSON.parse(text) : null;
        }

        return {
            name: 'supabase',

            async testConnection() {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
                try {
                    const resp = await fetch(cfg.url + '/rest/v1/tasks?limit=1', {
                        headers: { 'apikey': cfg.anonKey, 'Authorization': 'Bearer ' + cfg.anonKey },
                        signal: controller.signal
                    });
                    clearTimeout(timer);
                    if (resp.ok) return { ok: true, message: '连接成功，tasks 表可访问' };
                    const text = await resp.text().catch(() => '');
                    return { ok: false, message: 'HTTP ' + resp.status + (text ? ' — ' + text.slice(0, 120) : '') };
                } catch (err) {
                    clearTimeout(timer);
                    const isTimeout = err && err.name === 'AbortError';
                    return { ok: false, message: isTimeout ? '连接超时（15s）' : ('网络错误: ' + (err && err.message)) };
                }
            },

            async upsert(table, rows) {
                await _fetch('/rest/v1/' + table + '?on_conflict=id', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates' },
                    body: rows
                });
            },

            async fetchSince(table, iso) {
                const rows = await _fetch(
                    '/rest/v1/' + table + '?updated_at=gt.' + encodeURIComponent(iso) + '&select=*'
                );
                return Array.isArray(rows) ? rows : [];
            },

            // ---- 设备注册表（F-109~F-112），表结构见 guide/supabase-setup.sql ----
            async deviceUpsert(row) {
                await _fetch('/rest/v1/devices?on_conflict=id', {
                    method: 'POST',
                    headers: { 'Prefer': 'resolution=merge-duplicates' },
                    body: [{ id: String(row.id), data: row.data, updated_at: row.updated_at }]
                });
            },

            async deviceGet(id) {
                const rows = await _fetch('/rest/v1/devices?id=eq.' + encodeURIComponent(String(id)) + '&select=*');
                return Array.isArray(rows) && rows.length ? rows[0] : null;
            },

            async deviceList() {
                const rows = await _fetch('/rest/v1/devices?select=*&order=updated_at.desc');
                return Array.isArray(rows) ? rows : [];
            },

            async deviceDelete(id) {
                await _fetch('/rest/v1/devices?id=eq.' + encodeURIComponent(String(id)), {
                    method: 'DELETE'
                });
            }
        };
    }

    // ============================================================
    // CloudBase Adapter（@cloudbase/js-sdk，懒加载 CDN）
    // ============================================================
    let _cloudbaseSdkPromise = null;

    /** 懒加载 CloudBase Web SDK：仅 provider = 'cloudbase' 时插入 <script>，带备用 CDN */
    function loadCloudBaseSdk() {
        if (typeof window !== 'undefined' && window.cloudbase) return Promise.resolve();
        if (_cloudbaseSdkPromise) return _cloudbaseSdkPromise;
        _cloudbaseSdkPromise = new Promise((resolve, reject) => {
            const tryNext = (idx) => {
                if (idx >= CLOUDBASE_SDK_URLS.length) {
                    _cloudbaseSdkPromise = null; // 允许重试
                    const e = new Error('CloudBase SDK 加载失败（所有 CDN 均不可达）');
                    e.code = 'CLOUDBASE_SDK_LOAD_FAILED';
                    reject(e);
                    return;
                }
                const script = document.createElement('script');
                script.src = CLOUDBASE_SDK_URLS[idx];
                script.onload = () => resolve();
                script.onerror = () => {
                    if (script.parentNode) script.parentNode.removeChild(script);
                    tryNext(idx + 1);
                };
                document.head.appendChild(script);
            };
            tryNext(0);
        });
        return _cloudbaseSdkPromise;
    }

    function normalizeCloudBaseError(err, label) {
        if (err && err.code === 'SYNC_TIMEOUT') return err;
        const e = new Error((label || 'CloudBase 错误') + ': ' + (err && err.message ? err.message : String(err)));
        e.code = (err && err.code) || 'CLOUDBASE_ERROR';
        return e;
    }

    function createCloudBaseAdapter(cfg) {
        let appPromise = null;

        // 初始化 + 登录（幂等，失败允许重试）
        // 策略：已有任意登录态（账号或匿名）则复用；无则匿名登录降级
        async function getApp() {
            if (!appPromise) {
                appPromise = (async () => {
                    await loadCloudBaseSdk();
                    const app = window.cloudbase.init({ env: cfg.cloudbaseEnvId });
                    const auth = app.auth();
                    // 策略：已有任意登录态（账号登录优先，匿名次之）则复用；无则匿名登录降级
                    const loginState = await auth.getLoginState();
                    if (loginState && loginState.user) {
                        return app;
                    }
                    // 无登录态 → 匿名登录降级
                    await auth.anonymousAuthProvider().signIn();
                    return app;
                })();
                appPromise.catch(() => { appPromise = null; });
            }
            return appPromise;
        }

        // 重置 appPromise（登录态变化后需要重建）
        function resetApp() { appPromise = null; }

        // SDK 调用无内建超时，统一包 15s
        function withTimeout(promise, label) {
            return Promise.race([
                promise,
                new Promise((resolve, reject) => setTimeout(() => {
                    const e = new Error(label + '超时（15s）');
                    e.code = 'SYNC_TIMEOUT';
                    reject(e);
                }, FETCH_TIMEOUT_MS))
            ]);
        }

        return {
            name: 'cloudbase',

            async testConnection() {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    await withTimeout(db.collection('tasks').limit(1).get(), 'CloudBase 查询');
                    return { ok: true, message: '连接成功，tasks 集合可访问' };
                } catch (err) {
                    const e = normalizeCloudBaseError(err, 'CloudBase 连接失败');
                    return { ok: false, message: e.message };
                }
            },

            // ---- 账号登录（F-113） ----
            async login(username, password) {
                try {
                    await loadCloudBaseSdk();
                    const app = window.cloudbase.init({ env: cfg.cloudbaseEnvId });
                    const auth = app.auth();
                    await withTimeout(auth.signInWithUsernameAndPassword(username, password), 'CloudBase 登录');
                    // 登录成功后重建 appPromise，确保后续 getApp() 复用新登录态
                    resetApp();
                    return { ok: true };
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 登录失败');
                }
            },

            async logout() {
                try {
                    await loadCloudBaseSdk();
                    const app = window.cloudbase.init({ env: cfg.cloudbaseEnvId });
                    const auth = app.auth();
                    await withTimeout(auth.signOut(), 'CloudBase 登出');
                    resetApp();
                    return { ok: true };
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 登出失败');
                }
            },

            async getCurrentUser() {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const auth = app.auth();
                    const loginState = await auth.getLoginState();
                    if (loginState && loginState.user) {
                        return { uid: loginState.user.uid, isAnonymous: loginState.user.isAnonymous || false };
                    }
                    return null;
                } catch (err) {
                    return null;
                }
            },

            async upsert(table, rows) {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    // doc(id).set() = 存在则更新、不存在则新增（upsert）
                    for (const row of rows) {
                        await withTimeout(db.collection(table).doc(String(row.id)).set({
                            data: row.data,
                            updated_at: row.updated_at,
                            updated_by: row.updated_by,
                            deleted_at: row.deleted_at || null
                        }), 'CloudBase 写入');
                    }
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 写入失败');
                }
            },

            async fetchSince(table, iso) {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    const _ = db.command;
                    // SDK 查询默认 20 条上限，limit 最大 100 —— skip/limit 循环拉全
                    const all = [];
                    let skip = 0;
                    while (true) {
                        const res = await withTimeout(
                            db.collection(table).where({ updated_at: _.gt(iso) }).skip(skip).limit(100).get(),
                            'CloudBase 查询'
                        );
                        const batch = (res && Array.isArray(res.data)) ? res.data : [];
                        all.push(...batch);
                        if (batch.length < 100) break;
                        skip += batch.length;
                    }
                    // 对齐 Supabase 行格式：doc._id → row.id
                    return all.map(doc => ({
                        id: doc._id,
                        data: doc.data,
                        updated_at: doc.updated_at,
                        updated_by: doc.updated_by,
                        deleted_at: doc.deleted_at || null
                    }));
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 查询失败');
                }
            },

            // ---- 设备注册表（F-109~F-112），集合 devices，doc id 即 deviceId ----
            async deviceUpsert(row) {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    await withTimeout(db.collection('devices').doc(String(row.id)).set({
                        data: row.data,
                        updated_at: row.updated_at
                    }), 'CloudBase 设备写入');
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 设备写入失败');
                }
            },

            async deviceGet(id) {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    const res = await withTimeout(db.collection('devices').doc(String(id)).get(), 'CloudBase 设备查询');
                    const doc = res && Array.isArray(res.data) ? res.data[0] : (res && res.data);
                    if (!doc) return null;
                    return { id: doc._id, data: doc.data, updated_at: doc.updated_at };
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 设备查询失败');
                }
            },

            async deviceList() {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    const res = await withTimeout(db.collection('devices').limit(100).get(), 'CloudBase 设备列表查询');
                    const all = (res && Array.isArray(res.data)) ? res.data : [];
                    return all.map(doc => ({ id: doc._id, data: doc.data, updated_at: doc.updated_at }));
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 设备列表查询失败');
                }
            },

            async deviceDelete(id) {
                try {
                    const app = await withTimeout(getApp(), 'CloudBase 连接');
                    const db = app.database();
                    await withTimeout(db.collection('devices').doc(String(id)).remove(), 'CloudBase 设备删除');
                } catch (err) {
                    throw normalizeCloudBaseError(err, 'CloudBase 设备删除失败');
                }
            }
        };
    }

    // ============================================================
    // SyncEngine
    // ============================================================
    const Sync = {
        _inited: false,
        _enabled: false,
        _syncing: false,
        _pushTimer: null,
        _pullTimer: null,
        _config: null,
        _adapter: null,
        _adapterSig: null,
        _deviceStatusCache: null,  // { doc, fetchedAt } 设备状态自查缓存（F-111/F-112）

        // lastSyncAt 按 provider 分键存储，切换后端后首次同步自动全量 push
        _lastSyncKey(provider) {
            return 'lastSyncAt_' + provider;
        },

        // ---- 配置 ----
        async _loadConfig() {
            const S = window.LifeOS.Settings;
            const provider = await S.get('syncProvider', 'none') || 'none';
            let lastSyncAt = await S.get(this._lastSyncKey(provider), null);
            // 兼容旧版：supabase 且分键不存在时，回退到旧的 lastSyncAt
            if (!lastSyncAt && provider === 'supabase') {
                lastSyncAt = await S.get('lastSyncAt', null);
            }
            const accountUid = await S.get('accountUid', '') || '';
            const cfg = {
                syncProvider: provider,
                url: normalizeUrl(await S.get('supabaseUrl', '')),
                anonKey: await S.get('supabaseAnonKey', '') || '',
                cloudbaseEnvId: (await S.get('cloudbaseEnvId', '') || '').trim(),
                deviceId: await S.get('deviceId', null),
                deviceName: await S.get('deviceName', '') || '',
                isMainDevice: !!(await S.get('isMainDevice', false)) && !!accountUid,
                accountUid,
                conflictPolicy: await S.get('conflictPolicy', 'lww'),
                lastSyncAt
            };
            if (!cfg.deviceId) {
                cfg.deviceId = await window.LifeOS.Database.getDeviceId();
            }
            this._config = cfg;
            return cfg;
        },

        // ---- Adapter 工厂 ----
        _createAdapter(provider, cfg) {
            if (provider === 'supabase') {
                if (!cfg.url || !cfg.anonKey) return null;
                return createSupabaseAdapter(cfg);
            }
            if (provider === 'cloudbase') {
                if (!cfg.cloudbaseEnvId) return null;
                return createCloudBaseAdapter(cfg);
            }
            return null; // 'none' 或未识别 → 禁用
        },

        _configSignature(cfg) {
            return [cfg.syncProvider, cfg.url, cfg.anonKey, cfg.cloudbaseEnvId].join('|');
        },

        // 配置未变时复用 adapter（CloudBase app 实例在 adapter 内缓存，避免反复登录）
        async _ensureAdapter() {
            const cfg = this._config || await this._loadConfig();
            const sig = this._configSignature(cfg);
            if (this._adapter && this._adapterSig === sig) return this._adapter;
            this._adapter = this._createAdapter(cfg.syncProvider, cfg);
            this._adapterSig = sig;
            return this._adapter;
        },

        /**
         * 初始化。读取 settings；provider 为 none 或配置不完整则静默禁用（返回 false）。
         * 幂等：重复调用直接返回当前状态。配置变更后用 reload() 重新初始化。
         */
        async init() {
            if (this._inited) return this._enabled;
            this._inited = true;
            try {
                const cfg = await this._loadConfig();
                const adapter = await this._ensureAdapter();
                if (!adapter) {
                    this._enabled = false;
                    console.log('[LifeOS Sync] 同步未启用（provider: ' + cfg.syncProvider + '）');
                    return false;
                }
                this._enabled = true;
                console.log('[LifeOS Sync] 同步已启用，后端:', adapter.name);

                // 页面加载后自动同步（后台，不阻塞页面）
                this.sync();

                // 浏览器恢复联网时立即同步
                if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                    window.addEventListener('online', () => { this.sync(); });
                }

                // 每 5 分钟定时 pull
                if (typeof setInterval === 'function') {
                    this._pullTimer = setInterval(() => {
                        this.pull().catch(err => console.warn('[LifeOS Sync] 定时拉取失败:', err.message));
                    }, PULL_INTERVAL_MS);
                }
                return true;
            } catch (err) {
                console.warn('[LifeOS Sync] 初始化失败:', err.message);
                this._enabled = false;
                return false;
            }
        },

        // 配置变更后重新初始化（设置页保存后调用）
        async reload() {
            this._inited = false;
            this._adapter = null;
            this._adapterSig = null;
            if (this._pullTimer && typeof clearInterval === 'function') {
                clearInterval(this._pullTimer);
                this._pullTimer = null;
            }
            return this.init();
        },

        isEnabled() { return this._enabled; },

        // 云端行 → 本地记录（以行级列为准归一化打戳字段）
        _rowToRecord(row) {
            const record = (row.data && typeof row.data === 'object') ? { ...row.data } : {};
            record.updatedAt = row.updated_at || record.updatedAt || nowIso();
            record.updatedBy = row.updated_by !== undefined ? row.updated_by : (record.updatedBy || null);
            record.deletedAt = row.deleted_at || null;
            return record;
        },

        // ---- Push：本地 → 云 ----
        async push() {
            if (!this._enabled) return { pushed: 0 };
            const cfg = await this._loadConfig();
            const adapter = await this._ensureAdapter();
            if (!adapter) return { pushed: 0 };
            if (!await this._checkDeviceAllowed()) return { pushed: 0, blocked: true };
            const db = window.LifeOS.Database;
            const since = cfg.lastSyncAt || EPOCH;
            const sinceMs = toMillis(since);
            let pushed = 0;
            for (const store of SYNC_STORES) {
                const all = await db.getAllIncludingDeleted(store);
                const dirty = all.filter(r => toMillis(r.updatedAt) > sinceMs);
                if (!dirty.length) continue;
                const rows = dirty.map(r => ({
                    id: keyOf(store, r),
                    data: r,
                    updated_at: r.updatedAt,
                    updated_by: r.updatedBy || cfg.deviceId,
                    deleted_at: r.deletedAt || null
                }));
                await adapter.upsert(STORE_TABLE_MAP[store], rows);
                pushed += rows.length;
            }
            console.log('[LifeOS Sync] push 完成:', pushed, '条');
            return { pushed };
        },

        // ---- Pull：云 → 本地 ----
        async pull() {
            if (!this._enabled) return { pulled: 0, conflicts: 0 };
            const cfg = await this._loadConfig();
            const adapter = await this._ensureAdapter();
            if (!adapter) return { pulled: 0, conflicts: 0 };
            if (!await this._checkDeviceAllowed()) return { pulled: 0, conflicts: 0, blocked: true };
            const db = window.LifeOS.Database;
            const since = cfg.lastSyncAt || EPOCH;
            let pulled = 0, conflicts = 0;
            for (const store of SYNC_STORES) {
                const rows = await adapter.fetchSince(STORE_TABLE_MAP[store], since);
                if (!Array.isArray(rows) || !rows.length) continue;
                for (const row of rows) {
                    const remote = this._rowToRecord(row);
                    const local = await db.getIncludingDeleted(store, row.id);
                    const result = mergeRecord(local, remote, {
                        lastSyncAt: cfg.lastSyncAt,
                        conflictPolicy: cfg.conflictPolicy,
                        isMainDevice: cfg.isMainDevice,
                        deviceId: cfg.deviceId
                    });
                    if (result.action === 'remote') {
                        // putRaw：保留远端打戳，不触发再次打戳/再次 push
                        await db.putRaw(store, remote);
                        pulled++;
                    } else if (result.action === 'conflict') {
                        await this._queueConflict(store, String(row.id), local, remote);
                        conflicts++;
                    }
                    // 'local' / 'none' → 不动本地
                }
            }
            console.log('[LifeOS Sync] pull 完成:', pulled, '条，冲突:', conflicts, '条');
            return { pulled, conflicts };
        },

        // ---- 完整同步：pull + push + 更新 lastSyncAt + 广播事件 ----
        async sync() {
            if (!this._enabled) return { ok: false, reason: 'disabled' };
            if (this._syncing) return { ok: false, reason: 'busy' };
            this._syncing = true;
            try {
                if (!await this._checkDeviceAllowed()) {
                    return { ok: false, reason: 'device-blocked' };
                }
                const provider = (this._config && this._config.syncProvider) || 'none';
                const pullResult = await this.pull();
                const pushResult = await this.push();
                await this._heartbeat(); // F-109：同步成功后上报设备活跃（保留云端 status）
                await this._cleanupRevokedDevices(); // F-112：主设备自动清理 30 天前 revoked 设备
                const at = nowIso();
                await window.LifeOS.Settings.set(this._lastSyncKey(provider), at);
                await window.LifeOS.Settings.set('lastSyncError', null);
                if (this._config) this._config.lastSyncAt = at;
                // 通知各页面刷新数据
                if (typeof window !== 'undefined' &&
                    typeof window.dispatchEvent === 'function' &&
                    typeof CustomEvent === 'function') {
                    window.dispatchEvent(new CustomEvent('lifeos:synced', {
                        detail: { pulled: pullResult.pulled, pushed: pushResult.pushed, conflicts: pullResult.conflicts, at, provider }
                    }));
                }
                return { ok: true, pulled: pullResult.pulled, pushed: pushResult.pushed, conflicts: pullResult.conflicts, at };
            } catch (err) {
                // 同步失败不抛到页面：console.warn + 状态存 settings
                console.warn('[LifeOS Sync] 同步失败:', err.message);
                try {
                    await window.LifeOS.Settings.set('lastSyncError', { message: err.message, at: nowIso() });
                } catch (e) { /* 静默 */ }
                return { ok: false, reason: err.message };
            } finally {
                this._syncing = false;
            }
        },

        // ---- 本地写钩子：core.js 打戳处调用，防抖 5s 自动 push ----
        notifyLocalWrite() {
            if (!this._enabled) return;
            if (this._pushTimer) clearTimeout(this._pushTimer);
            this._pushTimer = setTimeout(() => {
                this._pushTimer = null;
                this.push().catch(err => console.warn('[LifeOS Sync] 自动推送失败:', err.message));
            }, AUTO_PUSH_DEBOUNCE_MS);
        },

        // ---- 设备注册 / 心跳 / 状态自查（F-109~F-112）----
        /**
         * 读取本机的云端设备记录（5 分钟缓存）。查询失败时回退旧缓存，不阻断同步。
         * @param {boolean} force 强制刷新缓存
         */
        async _fetchOwnDeviceDoc(force) {
            const now = Date.now();
            if (!force && this._deviceStatusCache && (now - this._deviceStatusCache.fetchedAt) < DEVICE_STATUS_CACHE_MS) {
                return this._deviceStatusCache.doc;
            }
            const cfg = this._config || await this._loadConfig();
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceGet) return null;
            let doc = null;
            try {
                doc = await adapter.deviceGet(cfg.deviceId);
            } catch (err) {
                console.warn('[LifeOS Sync] 设备状态查询失败（沿用旧缓存）:', err.message);
                return this._deviceStatusCache ? this._deviceStatusCache.doc : null;
            }
            this._deviceStatusCache = { doc, fetchedAt: now };
            return doc;
        },

        /**
         * 同步前自查（F-111/F-112）：
         * sleeping → 阻断本次同步并广播事件；revoked → 停止同步、清空同步配置。
         * @returns {Promise<boolean>} true 允许继续同步
         */
        async _checkDeviceAllowed() {
            const doc = await this._fetchOwnDeviceDoc(false);
            const status = doc && doc.data && doc.data.status;
            if (status === 'sleeping') {
                console.log('[LifeOS Sync] 本设备已被主设备休眠，暂停同步');
                this._notifyDeviceBlocked('sleeping');
                return false;
            }
            if (status === 'revoked') {
                console.warn('[LifeOS Sync] 本设备已被主设备移除，同步停止');
                await this._handleRevoked();
                return false;
            }
            return true;
        },

        _notifyDeviceBlocked(status) {
            if (typeof window !== 'undefined' &&
                typeof window.dispatchEvent === 'function' &&
                typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('lifeos:device-blocked', { detail: { status } }));
            }
        },

        // 被吊销（F-112）：停用同步引擎 + 同步配置复位，等待用户重新授权
        async _handleRevoked() {
            this._enabled = false;
            if (this._pullTimer && typeof clearInterval === 'function') {
                clearInterval(this._pullTimer);
                this._pullTimer = null;
            }
            try {
                await window.LifeOS.Settings.set('syncProvider', 'none');
                await window.LifeOS.Settings.set('lastSyncError', {
                    message: '本设备已被主设备移除，同步已停止。如需恢复，请让主设备先取消删除，再在此重新配置同步。',
                    at: nowIso()
                });
            } catch (e) { /* 静默 */ }
            this._notifyDeviceBlocked('revoked');
        },

        /**
         * F-109 心跳：同步成功后 upsert 本机设备记录。
         * 保留云端 status / firstSeenAt——不覆盖主设备的休眠/吊销操作。
         */
        async _heartbeat() {
            if (!this._enabled) return;
            const cfg = this._config || await this._loadConfig();
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceUpsert) return;
            const existing = await this._fetchOwnDeviceDoc(true); // 强制刷新，顺带更新状态缓存
            const now = nowIso();
            const prev = existing && existing.data ? existing.data : {};

            // F-114：检测是否被其他设备降级——云端 isMaster=false 但本地开关仍打开
            if (prev.isMaster === false && cfg.isMainDevice) {
                console.log('[LifeOS Sync] 本设备已被降级为常用设备');
                await window.LifeOS.Settings.set('isMainDevice', false);
                cfg.isMainDevice = false;
                if (this._config) this._config.isMainDevice = false;
                this._notifyDeviceDemoted();
            }

            const doc = {
                deviceId: cfg.deviceId,
                name: cfg.deviceName || '',
                userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) || '',
                firstSeenAt: prev.firstSeenAt || now,
                lastSeenAt: now,
                isMaster: !!cfg.isMainDevice,
                status: prev.status || 'active',
                appVersion: APP_VERSION,
                accountUid: cfg.accountUid || null
            };
            try {
                await adapter.deviceUpsert({ id: cfg.deviceId, data: doc, updated_at: now });
                this._deviceStatusCache = { doc: { id: cfg.deviceId, data: doc, updated_at: now }, fetchedAt: Date.now() };
            } catch (err) {
                console.warn('[LifeOS Sync] 设备心跳失败:', err.message);
            }
        },

        _notifyDeviceDemoted() {
            if (typeof window !== 'undefined' &&
                typeof window.dispatchEvent === 'function' &&
                typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('lifeos:device-demoted'));
            }
        },

        /** F-110 设备列表（设置页「设备管理」卡片） */
        async listDevices() {
            if (!this._enabled) return { ok: false, reason: 'disabled', devices: [] };
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceList) return { ok: false, reason: 'no-adapter', devices: [] };
            const cfg = this._config || await this._loadConfig();
            const rows = await adapter.deviceList();
            const devices = rows.map(r => ({ ...(r.data || {}), deviceId: r.id, updatedAt: r.updated_at }));
            devices.sort((a, b) => toMillis(b.lastSeenAt) - toMillis(a.lastSeenAt));
            return { ok: true, devices, selfId: cfg.deviceId, isMaster: !!cfg.isMainDevice };
        },

        /**
         * F-111/F-112 主设备管理他机状态（应用层校验：仅主设备、不可改本机）。
         * @param {string} deviceId 目标设备
         * @param {'active'|'sleeping'|'revoked'} status
         */
        async setDeviceStatus(deviceId, status) {
            if (['active', 'sleeping', 'revoked'].indexOf(status) === -1) throw new Error('非法状态: ' + status);
            const cfg = this._config || await this._loadConfig();
            if (!cfg.isMainDevice) throw new Error('仅主设备可以管理其他设备');
            if (deviceId === cfg.deviceId) throw new Error('不能修改本机状态');
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceGet || !adapter.deviceUpsert) throw new Error('同步后端不可用');
            const existing = await adapter.deviceGet(deviceId);
            if (!existing || !existing.data) throw new Error('未找到设备: ' + deviceId);
            const data = Object.assign({}, existing.data, { status });
            await adapter.deviceUpsert({ id: deviceId, data, updated_at: nowIso() });
            return { ok: true, deviceId, status };
        },

        /**
         * F-112 主设备彻底删除他机记录（物理删除，不可恢复）。
         * @param {string} deviceId 目标设备
         */
        async hardDeleteDevice(deviceId) {
            const cfg = this._config || await this._loadConfig();
            if (!cfg.isMainDevice) throw new Error('仅主设备可以管理其他设备');
            if (deviceId === cfg.deviceId) throw new Error('不能删除本机');
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceDelete) throw new Error('同步后端不可用');
            await adapter.deviceDelete(deviceId);
            return { ok: true, deviceId };
        },

        /**
         * F-114 全局唯一主设备：本机设为主设备，其他已登录设备自动降级为常用设备。
         * 需要已登录账号；本地开关打开 + 云端 isMaster 唯一化。
         */
        async setMainDevice() {
            const cfg = this._config || await this._loadConfig();
            if (!cfg.accountUid) throw new Error('请先登录账号，主设备权限需要账号支持');
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceUpsert || !adapter.deviceList) throw new Error('同步后端不可用');
            const now = nowIso();

            // 本地开关打开
            await window.LifeOS.Settings.set('isMainDevice', true);

            // 云端本机记录 isMaster = true
            const existing = await adapter.deviceGet(cfg.deviceId);
            const prev = existing && existing.data ? existing.data : {};
            await adapter.deviceUpsert({
                id: cfg.deviceId,
                data: Object.assign({}, prev, {
                    deviceId: cfg.deviceId,
                    name: cfg.deviceName || prev.name || '',
                    isMaster: true,
                    status: prev.status || 'active',
                    lastSeenAt: now,
                    accountUid: cfg.accountUid
                }),
                updated_at: now
            });

            // 其他设备 isMaster = false（自动降级）
            const rows = await adapter.deviceList();
            for (const row of rows) {
                if (String(row.id) === String(cfg.deviceId)) continue;
                const data = row.data || {};
                if (!data.isMaster) continue;
                await adapter.deviceUpsert({
                    id: row.id,
                    data: Object.assign({}, data, { isMaster: false }),
                    updated_at: nowIso()
                });
            }

            // 刷新配置与缓存
            await this._loadConfig();
            this._deviceStatusCache = null;
            return { ok: true };
        },

        /**
         * F-112 自动清理：主设备每次 sync 成功后，硬删 revoked 超过 30 天的设备记录。
         * 失败不阻塞同步，仅 console.warn。
         */
        async _cleanupRevokedDevices() {
            const cfg = this._config || await this._loadConfig();
            if (!cfg.isMainDevice) return { cleaned: 0 };
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.deviceList || !adapter.deviceDelete) return { cleaned: 0 };
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            const cutoff = Date.now() - THIRTY_DAYS_MS;
            try {
                const rows = await adapter.deviceList();
                let cleaned = 0;
                for (const row of rows) {
                    const data = row.data || {};
                    if (data.status !== 'revoked') continue;
                    const updatedMs = toMillis(row.updated_at || data.lastSeenAt || data.firstSeenAt);
                    if (!updatedMs || updatedMs > cutoff) continue;
                    if (String(row.id) === String(cfg.deviceId)) continue;
                    try {
                        await adapter.deviceDelete(row.id);
                        cleaned++;
                        console.log('[LifeOS Sync] 自动清理已删除设备:', row.id);
                    } catch (err) {
                        console.warn('[LifeOS Sync] 自动清理设备失败:', row.id, err.message);
                    }
                }
                return { cleaned };
            } catch (err) {
                console.warn('[LifeOS Sync] 自动清理扫描失败:', err.message);
                return { cleaned: 0 };
            }
        },

        // ---- 冲突队列 ----
        async _queueConflict(store, key, local, remote) {
            const S = window.LifeOS.Settings;
            const conflicts = await S.get('syncConflicts', []);
            const id = store + ':' + key;
            const entry = {
                id,
                store,
                key,
                local,
                remote,
                localDeviceId: local && local.updatedBy ? local.updatedBy : null,
                remoteDeviceId: remote && remote.updatedBy ? remote.updatedBy : null,
                localUpdatedAt: local && local.updatedAt ? local.updatedAt : null,
                remoteUpdatedAt: remote && remote.updatedAt ? remote.updatedAt : null,
                createdAt: nowIso()
            };
            const idx = conflicts.findIndex(c => c.id === id);
            if (idx >= 0) conflicts[idx] = entry; else conflicts.push(entry);
            await S.set('syncConflicts', conflicts);
            return entry;
        },

        async getConflicts() {
            return window.LifeOS.Settings.get('syncConflicts', []);
        },

        /**
         * 解决冲突：应用选择结果（以当前时间打戳确保 LWW 下全局获胜）并 push。
         * @param {string}  conflictId 冲突条目 id（store:key）
         * @param {boolean} keepLocal  true 保留本机版本，false 保留云端版本
         */
        async resolveConflict(conflictId, keepLocal) {
            const S = window.LifeOS.Settings;
            const db = window.LifeOS.Database;
            const conflicts = await S.get('syncConflicts', []);
            const idx = conflicts.findIndex(c => c.id === conflictId);
            if (idx === -1) return false;
            const conflict = conflicts[idx];
            const winner = keepLocal ? conflict.local : conflict.remote;
            if (winner) {
                const data = { ...winner };
                if (data.deletedAt === undefined) data.deletedAt = null;
                await db.put(conflict.store, data); // put 打戳 updatedAt=now，确保该版本获胜
            }
            conflicts.splice(idx, 1);
            await S.set('syncConflicts', conflicts);
            try {
                await this.push();
            } catch (err) {
                console.warn('[LifeOS Sync] 冲突解决后推送失败:', err.message);
            }
            return true;
        },

        // ---- 连通性测试（设置页「测试连接」按钮）----
        /**
         * @param {object} options { provider, supabaseUrl, supabaseAnonKey, cloudbaseEnvId }
         * 兼容旧签名 testConnection(url, key) → 视为 supabase
         */
        async testConnection(options = {}) {
            if (typeof options === 'string') {
                options = { provider: 'supabase', supabaseUrl: options, supabaseAnonKey: arguments[1] };
            }
            const provider = options.provider || 'none';
            if (provider === 'none') {
                return { ok: false, message: '请先选择同步后端' };
            }
            const adapter = this._createAdapter(provider, {
                url: normalizeUrl(options.supabaseUrl),
                anonKey: options.supabaseAnonKey || '',
                cloudbaseEnvId: (options.cloudbaseEnvId || '').trim()
            });
            if (!adapter) {
                return { ok: false, message: provider === 'supabase' ? '请填写 Supabase URL 和 anon key' : '请填写 CloudBase 环境 ID' };
            }
            return adapter.testConnection();
        },

        // ---- 账号登录（F-113~F-114） ----
        async accountLogin(username, password) {
            const cfg = this._config || await this._loadConfig();
            if (cfg.syncProvider !== 'cloudbase') throw new Error('账号登录仅支持 CloudBase 后端');
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.login) throw new Error('CloudBase 后端未就绪');
            const result = await adapter.login(username, password);
            // 获取登录用户 uid 并存入 settings
            const user = await adapter.getCurrentUser();
            if (user && user.uid) {
                await window.LifeOS.Settings.set('accountUid', user.uid);
            }
            // 登录态变化后重建引擎，使新登录态与主设备判定生效，并触发一次自动同步
            await this.reload();
            return result;
        },

        async accountLogout() {
            const cfg = this._config || await this._loadConfig();
            if (cfg.syncProvider === 'cloudbase') {
                const adapter = await this._ensureAdapter();
                if (adapter && adapter.logout) {
                    await adapter.logout();
                }
            }
            await window.LifeOS.Settings.set('accountUid', '');
            // 重建引擎：清除账号登录态，回退匿名登录，主设备权限按本机开关重新判定
            await this.reload();
            return { ok: true };
        },

        async getAccountInfo() {
            const cfg = this._config || await this._loadConfig();
            if (cfg.syncProvider !== 'cloudbase') return null;
            const adapter = await this._ensureAdapter();
            if (!adapter || !adapter.getCurrentUser) return null;
            const user = await adapter.getCurrentUser();
            if (!user) return null;
            // 若 SDK 已有账号登录态但 settings 未记录 accountUid，自动同步（F-114）
            if (!user.isAnonymous && user.uid && user.uid !== cfg.accountUid) {
                try {
                    await window.LifeOS.Settings.set('accountUid', user.uid);
                    await this._loadConfig();
                } catch (e) { /* 静默 */ }
            }
            const latestCfg = this._config || await this._loadConfig();
            return { uid: user.uid, isAnonymous: user.isAnonymous, storedUid: latestCfg.accountUid };
        },

        // 暴露给单元测试与调试
        _mergeRecord: mergeRecord,
        _STORE_TABLE_MAP: STORE_TABLE_MAP,
        _createAdapterFrom: function(provider, cfg) { return this._createAdapter(provider, cfg); }
    };

    window.LifeOS = window.LifeOS || {};
    window.LifeOS.Sync = Sync;

    console.log('[LifeOS] sync.js 加载完成 ✓');
})();
