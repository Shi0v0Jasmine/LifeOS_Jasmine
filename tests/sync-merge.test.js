/**
 * 多端同步 — 合并逻辑与 DB 层同步行为测试
 * 运行：node tests/sync-merge.test.js
 *
 * 覆盖：
 * - LifeOS.Sync._mergeRecord 纯函数：LWW / 近似平局主设备 / ask 冲突队列 / 墓碑传播
 * - DB 层：put 自动打戳、软删除墓碑、getAll/get 过滤墓碑、putRaw 免打戳、purgeDeleted
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============ 浏览器 API 模拟（与 tests/core-data.test.js 同款） ============
class ObjectStoreNames extends Array {
    contains(name) { return this.includes(name); }
}

class FakeIndexedDB {
    constructor() { this.databases = new Map(); }
    open(name, version) {
        const request = {};
        setTimeout(() => {
            let db = this.databases.get(name);
            const oldVersion = db ? db.version : 0;
            if (!db) {
                db = new FakeDB(name, version);
                this.databases.set(name, db);
            }
            if (oldVersion < version && request.onupgradeneeded) {
                request.onupgradeneeded({ target: { result: db, oldVersion } });
            }
            request.result = db;
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
}

class FakeDB {
    constructor(name, version) {
        this.name = name;
        this.version = version;
        this.objectStoreNames = new ObjectStoreNames();
        this.stores = new Map();
    }
    createObjectStore(name, options) {
        this.objectStoreNames.push(name);
        const store = new FakeStore(name, options.keyPath);
        this.stores.set(name, store);
        return store;
    }
    transaction(storeNames) {
        return {
            objectStore: (name) => {
                if (!storeNames.includes(name)) throw new Error(`Store ${name} not in transaction`);
                return this.stores.get(name);
            }
        };
    }
}

class FakeStore {
    constructor(name, keyPath) {
        this.name = name;
        this.keyPath = keyPath;
        this.records = new Map();
        this.indexes = new Map();
    }
    createIndex(name, keyPath, options = {}) {
        this.indexes.set(name, { keyPath, multiEntry: !!options.multiEntry });
    }
    put(data) {
        const request = {};
        setTimeout(() => {
            const key = data[this.keyPath];
            this.records.set(key, structuredClone(data));
            request.result = key;
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    get(id) {
        const request = {};
        setTimeout(() => {
            const value = this.records.get(id);
            request.result = value ? structuredClone(value) : undefined;
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    delete(id) {
        const request = {};
        setTimeout(() => {
            this.records.delete(id);
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    clear() {
        const request = {};
        setTimeout(() => {
            this.records.clear();
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    getAll() {
        const request = {};
        setTimeout(() => {
            request.result = Array.from(this.records.values()).map((value) => structuredClone(value));
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    index(name) {
        const indexDef = this.indexes.get(name);
        if (!indexDef) throw new Error(`Missing index ${name}`);
        return {
            getAll: (value) => {
                const request = {};
                setTimeout(() => {
                    request.result = Array.from(this.records.values())
                        .filter((record) => {
                            const indexedValue = record[indexDef.keyPath];
                            return indexDef.multiEntry && Array.isArray(indexedValue)
                                ? indexedValue.includes(value)
                                : indexedValue === value;
                        })
                        .map((record) => structuredClone(record));
                    if (request.onsuccess) request.onsuccess();
                }, 0);
                return request;
            }
        };
    }
}

function loadLifeOSWithContext() {
    const context = {
        window: {},
        console,
        indexedDB: new FakeIndexedDB(),
        crypto: {
            randomUUID: (() => {
                let counter = 0;
                return () => `test-id-${++counter}`;
            })()
        },
        Blob: class Blob {},
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
        document: { createElement: () => ({ click() {} }), head: { appendChild() {} } },
        setTimeout,
        clearTimeout,
        AbortController: global.AbortController,
        structuredClone: global.structuredClone,
        fetch: function() {
            return Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Server Error',
                text: function() { return Promise.resolve('{}'); },
                json: function() { return Promise.resolve({}); }
            });
        }
    };
    vm.createContext(context);
    const corePath = path.join(__dirname, '..', 'LifeOS', 'js', 'core.js');
    vm.runInContext(fs.readFileSync(corePath, 'utf8'), context, { filename: corePath });
    const syncPath = path.join(__dirname, '..', 'LifeOS', 'js', 'sync.js');
    vm.runInContext(fs.readFileSync(syncPath, 'utf8'), context, { filename: syncPath });
    return { LifeOS: context.window.LifeOS, context };
}

function loadLifeOS() {
    return loadLifeOSWithContext().LifeOS;
}

// ============ 合并纯逻辑测试 ============
// ctx 基准：上次同步 2026-07-20T00:00:00Z，本设备 dev-local，非主设备，LWW
const LAST_SYNC = '2026-07-20T00:00:00.000Z';
const BEFORE_SYNC = '2026-07-19T12:00:00.000Z';

function makeCtx(overrides = {}) {
    return {
        lastSyncAt: LAST_SYNC,
        conflictPolicy: 'lww',
        isMainDevice: false,
        deviceId: 'dev-local',
        ...overrides
    };
}

function rec(updatedAt, updatedBy, extra = {}) {
    return { id: 'r1', title: '记录', updatedAt, updatedBy, deletedAt: null, ...extra };
}

async function testRemoteNewerWithoutLocalChangesUsesRemote() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 本地自上次同步后未改动，远端更新 → 采用远端
    const local = rec(BEFORE_SYNC, 'dev-local');
    const remote = rec('2026-07-21T10:00:00.000Z', 'dev-other');
    const result = merge(local, remote, makeCtx());
    assert.strictEqual(result.action, 'remote', '远端更新且本地未改动时应采用远端');
}

async function testLocalNewerKeepsLocal() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 双端都在 lastSyncAt 后改过（真冲突），本地更新 → LWW 保留本地
    const local = rec('2026-07-22T10:00:00.000Z', 'dev-local');
    const remote = rec('2026-07-21T10:00:00.000Z', 'dev-other');
    const result = merge(local, remote, makeCtx());
    assert.strictEqual(result.action, 'local', '真冲突中本地较新时应保留本地');
}

async function testBothChangedRemoteNewerWins() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 双端都改过（真冲突），远端更新 → LWW 远端赢
    const local = rec('2026-07-21T10:00:00.000Z', 'dev-local');
    const remote = rec('2026-07-22T10:00:00.000Z', 'dev-other');
    const result = merge(local, remote, makeCtx());
    assert.strictEqual(result.action, 'remote', '真冲突中远端较新时应采用远端');
}

async function testNearTieMainDeviceWins() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 双端都改过且 updatedAt 差值 < 2s（近似平局）→ 主设备版本获胜
    const local = rec('2026-07-21T10:00:00.500Z', 'dev-local');
    const remote = rec('2026-07-21T10:00:01.000Z', 'dev-other'); // 比本地新 0.5s

    const mainResult = merge(local, remote, makeCtx({ isMainDevice: true }));
    assert.strictEqual(mainResult.action, 'local', '近似平局时主设备（本机）应获胜');

    const nonMainResult = merge(local, remote, makeCtx({ isMainDevice: false }));
    assert.strictEqual(nonMainResult.action, 'remote', '近似平局时非主设备应让远端获胜');
}

async function testAskPolicyQueuesConflict() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 真冲突 + conflictPolicy = 'ask' → 进冲突队列（不自动裁决）
    const local = rec('2026-07-22T10:00:00.000Z', 'dev-local');
    const remote = rec('2026-07-21T10:00:00.000Z', 'dev-other');
    const result = merge(local, remote, makeCtx({ conflictPolicy: 'ask' }));
    assert.strictEqual(result.action, 'conflict', 'ask 策略下真冲突应返回 conflict');
}

async function testTombstonePropagates() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 远端墓碑（deletedAt 非空）且本地未改动 → 采用远端（本地随之软删除）
    const local = rec(BEFORE_SYNC, 'dev-local');
    const remoteTombstone = rec('2026-07-21T10:00:00.000Z', 'dev-other', { deletedAt: '2026-07-21T10:00:00.000Z' });
    const result = merge(local, remoteTombstone, makeCtx());
    assert.strictEqual(result.action, 'remote', '远端墓碑应传播到本地');
    assert.ok(remoteTombstone.deletedAt, '远端记录应携带 deletedAt 墓碑');

    // 本地不存在 + 远端墓碑 → 直接写入（保持双端一致，设计文档 §4.3「本地不存在 → 直接写入」）
    const missingResult = merge(null, remoteTombstone, makeCtx());
    assert.strictEqual(missingResult.action, 'remote', '本地不存在时应直接写入远端记录（含墓碑）');
}

async function testLocalMissingUsesRemote() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    const remote = rec('2026-07-21T10:00:00.000Z', 'dev-other');
    const result = merge(null, remote, makeCtx());
    assert.strictEqual(result.action, 'remote', '本地不存在时应采用远端');
}

async function testEqualTimestampsNoop() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    const ts = '2026-07-21T10:00:00.000Z';
    const result = merge(rec(ts, 'dev-local'), rec(ts, 'dev-local'), makeCtx());
    assert.strictEqual(result.action, 'none', '时间戳一致时无需动作');
}

async function testOwnEchoIsNotConflict() {
    const LifeOS = loadLifeOS();
    const merge = LifeOS.Sync._mergeRecord;
    // 远端是本设备修改的回显（updatedBy === deviceId）→ 普通 LWW，不判冲突
    const local = rec('2026-07-21T10:00:00.000Z', 'dev-local');
    const remote = rec('2026-07-22T10:00:00.000Z', 'dev-local');
    const result = merge(local, remote, makeCtx({ conflictPolicy: 'ask' }));
    assert.strictEqual(result.action, 'remote', '本设备回显不应判为冲突');
}

// ============ DB 层同步行为测试 ============

async function testPutStampsSyncFields() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const task = await LifeOS.Task.create({ title: '打戳测试' });
    assert.ok(task.updatedAt, 'put 应自动写入 updatedAt');
    assert.ok(/^dev-/.test(task.updatedBy), 'put 应自动写入 dev- 开头的 updatedBy，实际: ' + task.updatedBy);
    assert.strictEqual(task.deletedAt, null, 'put 应补充 deletedAt = null');

    const stored = await LifeOS.Database.getIncludingDeleted('tasks', task.id);
    assert.strictEqual(stored.updatedBy, task.updatedBy, '打戳字段应持久化');

    // deviceId 应持久化到 settings 且稳定
    const deviceId = await LifeOS.Settings.get('deviceId', null);
    assert.strictEqual(deviceId, task.updatedBy, 'deviceId 应持久化到 settings');
}

async function testSoftDeleteAndTombstoneFiltering() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const task = await LifeOS.Task.create({ title: '待删除' });
    await LifeOS.Task.delete(task.id);

    // getAll / get / getByIndex 默认过滤墓碑
    assert.strictEqual((await LifeOS.Task.getAll()).length, 0, 'getAll 应过滤墓碑');
    assert.strictEqual(await LifeOS.Database.get('tasks', task.id), undefined, 'get 应跳过墓碑');
    assert.strictEqual((await LifeOS.Task.getByDate(task.date)).length, 0, 'getByIndex 应过滤墓碑');

    // 含墓碑读取：墓碑存在且带打戳
    const all = await LifeOS.Database.getAllIncludingDeleted('tasks');
    assert.strictEqual(all.length, 1, 'getAllIncludingDeleted 应包含墓碑');
    assert.ok(all[0].deletedAt, '软删除应置 deletedAt');
    assert.ok(all[0].updatedBy, '软删除应打戳 updatedBy');

    const tombstone = await LifeOS.Database.getIncludingDeleted('tasks', task.id);
    assert.ok(tombstone && tombstone.deletedAt, 'getIncludingDeleted 应能读到墓碑');
}

async function testPutRawSkipsStamping() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // putRaw 模拟 pull 落库：必须保留远端原始打戳，不得覆盖
    const remoteRecord = {
        id: 'remote-1',
        title: '远端记录',
        updatedAt: '2026-01-01T00:00:00.000Z',
        updatedBy: 'dev-other',
        deletedAt: null
    };
    await LifeOS.Database.putRaw('tasks', remoteRecord);

    const stored = await LifeOS.Database.getIncludingDeleted('tasks', 'remote-1');
    assert.strictEqual(stored.updatedAt, '2026-01-01T00:00:00.000Z', 'putRaw 不得改写 updatedAt');
    assert.strictEqual(stored.updatedBy, 'dev-other', 'putRaw 不得改写 updatedBy');
}

async function testPurgeDeleted() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const task = await LifeOS.Task.create({ title: '墓碑清理' });
    await LifeOS.Task.delete(task.id);
    assert.strictEqual((await LifeOS.Database.getAllIncludingDeleted('tasks')).length, 1, '删除后应有墓碑');

    await new Promise((resolve) => setTimeout(resolve, 5));
    const purged = await LifeOS.Database.purgeDeleted('tasks', 0);
    assert.strictEqual(purged, 1, 'purgeDeleted 应清理 1 条墓碑');
    assert.strictEqual((await LifeOS.Database.getAllIncludingDeleted('tasks')).length, 0, '清理后墓碑应物理消失');
}

async function testStoreTableMapping() {
    const LifeOS = loadLifeOS();
    // vm 跨 realm 对象原型不同，先序列化回本 realm 再比较
    const map = JSON.parse(JSON.stringify(LifeOS.Sync._STORE_TABLE_MAP));
    assert.deepStrictEqual(map, {
        tasks: 'tasks',
        timeline: 'timeline',
        habits: 'habits',
        habitRecords: 'habit_records',
        reviews: 'reviews',
        skills: 'skills',
        notes: 'notes',
        characters: 'characters',
        moments: 'moments',
        nutrition: 'nutrition'
    }, 'store ↔ 表名映射应与设计文档一致');
}

// ============ 双后端 adapter 测试 ============

function makeCloudBaseMock(capture) {
    capture.currentUser = capture.currentUser || null;
    capture.loginCalls = capture.loginCalls || [];
    capture.logoutCalls = capture.logoutCalls || 0;
    capture.anonymousSignIn = capture.anonymousSignIn || 0;
    return {
        init({ env }) {
            capture.env = env;
            return {
                auth() {
                    return {
                        getLoginState: async () => ({ user: capture.currentUser }),
                        signInWithUsernameAndPassword: async (username, password) => {
                            capture.loginCalls.push({ username, password });
                            capture.currentUser = { uid: 'uid-' + username, isAnonymous: false };
                        },
                        signOut: async () => {
                            capture.logoutCalls++;
                            capture.currentUser = null;
                        },
                        anonymousAuthProvider() {
                            return {
                                signIn: async () => {
                                    capture.anonymousSignIn++;
                                    capture.currentUser = { uid: 'anon-uid', isAnonymous: true };
                                }
                            };
                        }
                    };
                },
                database() {
                    return {
                        command: { gt: (v) => ({ $gt: v }) },
                        collection(name) {
                            return {
                                doc(id) {
                                    return {
                                        set: async (payload) => {
                                            capture.sets.push({ collection: name, id, payload });
                                            return {};
                                        }
                                    };
                                },
                                where(cond) {
                                    capture.whereConds.push({ collection: name, cond });
                                    return {
                                        skip() {
                                            return {
                                                limit() {
                                                    return { get: async () => ({ data: capture.queryData || [] }) };
                                                }
                                            };
                                        }
                                    };
                                },
                                limit() { return { get: async () => ({ data: [] }) }; }
                            };
                        }
                    };
                }
            };
        }
    };
}

async function testProviderSelection() {
    const LifeOS = loadLifeOS();
    const create = (p, cfg) => LifeOS.Sync._createAdapterFrom(p, cfg);

    assert.strictEqual(create('none', {}), null, 'provider=none 应禁用');
    assert.strictEqual(create('unknown', {}), null, '未知 provider 应禁用');
    assert.strictEqual(create('supabase', { url: '', anonKey: '' }), null, 'supabase 配置不完整应禁用');
    const supa = create('supabase', { url: 'https://x.supabase.co', anonKey: 'k' });
    assert.strictEqual(supa.name, 'supabase', 'supabase 配置完整应返回 SupabaseAdapter');
    assert.strictEqual(create('cloudbase', { cloudbaseEnvId: '' }), null, 'cloudbase 缺 envId 应禁用');
    const cb = create('cloudbase', { cloudbaseEnvId: 'env-1' });
    assert.strictEqual(cb.name, 'cloudbase', 'cloudbase 配置完整应返回 CloudBaseAdapter');
}

async function testInitDisabledWhenProviderNone() {
    const { LifeOS } = loadLifeOSWithContext();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    // 默认无配置 → provider=none → 静默禁用，不发起任何网络请求
    const enabled = await LifeOS.Sync.init();
    assert.strictEqual(enabled, false, 'provider=none 时 init 应返回 false');
    assert.strictEqual(LifeOS.Sync.isEnabled(), false, 'provider=none 时应保持禁用');
}

async function testCloudBaseAdapterUpsertAndFetch() {
    const { LifeOS, context } = loadLifeOSWithContext();
    const capture = {
        sets: [],
        whereConds: [],
        queryData: [
            { _id: 'abc', data: { title: '远端记录' }, updated_at: '2026-07-21T00:00:00.000Z', updated_by: 'dev-a', deleted_at: null }
        ]
    };
    context.window.cloudbase = makeCloudBaseMock(capture);

    const adapter = LifeOS.Sync._createAdapterFrom('cloudbase', { cloudbaseEnvId: 'env-test' });
    await adapter.upsert('habit_records', [{
        id: 'r1',
        data: { habitId: 'h1', date: '2026-07-21' },
        updated_at: '2026-07-21T00:00:00.000Z',
        updated_by: 'dev-b',
        deleted_at: null
    }]);

    assert.strictEqual(capture.env, 'env-test', '应以 envId 初始化 SDK');
    assert.ok(capture.anonymousSignIn > 0, '应执行匿名登录');
    assert.strictEqual(capture.sets[0].collection, 'habit_records', '集合名应与表名映射一致');
    assert.strictEqual(capture.sets[0].id, 'r1', 'doc _id 应为记录 id');
    // vm 跨 realm 对象，序列化后比较
    const payload = JSON.parse(JSON.stringify(capture.sets[0].payload));
    assert.deepStrictEqual(payload, {
        data: { habitId: 'h1', date: '2026-07-21' },
        updated_at: '2026-07-21T00:00:00.000Z',
        updated_by: 'dev-b',
        deleted_at: null
    }, 'upsert 文档结构应与统一行格式一致');

    const rows = await adapter.fetchSince('habit_records', '2026-07-20T00:00:00.000Z');
    assert.strictEqual(capture.whereConds[0].collection, 'habit_records', 'fetchSince 应查询同名集合');
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].id, 'abc', 'doc._id 应映射回 row.id');
    assert.strictEqual(rows[0].updated_by, 'dev-a', '行格式应与 Supabase 侧同构');
}

async function testLastSyncAtPerProvider() {
    const { LifeOS } = loadLifeOSWithContext();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    assert.strictEqual(LifeOS.Sync._lastSyncKey('supabase'), 'lastSyncAt_supabase');
    assert.strictEqual(LifeOS.Sync._lastSyncKey('cloudbase'), 'lastSyncAt_cloudbase');

    await LifeOS.Settings.set('lastSyncAt_cloudbase', '2026-07-01T00:00:00.000Z');
    await LifeOS.Settings.set('lastSyncAt_supabase', '2026-07-02T00:00:00.000Z');

    await LifeOS.Settings.set('syncProvider', 'cloudbase');
    let cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.lastSyncAt, '2026-07-01T00:00:00.000Z', 'cloudbase 应读自己的 lastSyncAt 分键');

    await LifeOS.Settings.set('syncProvider', 'supabase');
    cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.lastSyncAt, '2026-07-02T00:00:00.000Z', 'supabase 应读自己的 lastSyncAt 分键');
}

async function testLastSyncAtLegacyFallback() {
    const { LifeOS } = loadLifeOSWithContext();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // 旧版数据：只有 lastSyncAt（无分键），provider=supabase 时应回退
    await LifeOS.Settings.set('syncProvider', 'supabase');
    await LifeOS.Settings.set('lastSyncAt', '2026-06-01T00:00:00.000Z');
    const cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.lastSyncAt, '2026-06-01T00:00:00.000Z', 'supabase 分键缺失时应回退到旧版 lastSyncAt');
}

// ============ 设备管理（F-109~F-112）测试 ============

function makeDeviceMockAdapter(deviceDoc, options = {}) {
    const calls = { deviceGet: 0, deviceUpsert: [], deviceDelete: [], upsert: [], fetchSince: 0 };
    const adapter = {
        name: 'mock',
        testConnection: async () => ({ ok: true, message: 'ok' }),
        upsert: async (table, rows) => { calls.upsert.push({ table, rows }); },
        fetchSince: async () => { calls.fetchSince++; return []; },
        deviceGet: async (id) => {
            calls.deviceGet++;
            return deviceDoc
                ? { id, data: JSON.parse(JSON.stringify(deviceDoc)), updated_at: '2026-07-22T00:00:00.000Z' }
                : null;
        },
        deviceUpsert: async (row) => { calls.deviceUpsert.push(JSON.parse(JSON.stringify(row))); },
        deviceList: async () => options.deviceList || [],
        deviceDelete: async (id) => { calls.deviceDelete.push(id); }
    };
    return { calls, adapter };
}

async function setupSyncWithMock(LifeOS, adapter, { isMainDevice = false } = {}) {
    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('deviceId', 'dev-self');
    await LifeOS.Settings.set('deviceName', '测试机');
    await LifeOS.Settings.set('isMainDevice', isMainDevice);
    await LifeOS.Settings.set('syncProvider', 'cloudbase');
    await LifeOS.Settings.set('cloudbaseEnvId', 'env-test');
    if (isMainDevice) {
        await LifeOS.Settings.set('accountUid', 'uid-test');
    }
    LifeOS.Sync._enabled = true;
    LifeOS.Sync._deviceStatusCache = null;
    LifeOS.Sync._ensureAdapter = async () => adapter;
    await LifeOS.Sync._loadConfig();
}

async function testDeviceHeartbeatCreatesActiveRecord() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter(null); // 云端无本机记录
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: true });

    await LifeOS.Sync._heartbeat();

    assert.strictEqual(calls.deviceUpsert.length, 1, '心跳应 upsert 一条设备记录');
    const row = calls.deviceUpsert[0];
    assert.strictEqual(row.id, 'dev-self', 'doc id 应为 deviceId');
    assert.strictEqual(row.data.status, 'active', '首次注册应为 active');
    assert.strictEqual(row.data.name, '测试机', '应上报设备名');
    assert.strictEqual(row.data.isMaster, true, '应上报主设备标记');
    assert.ok(row.data.firstSeenAt && row.data.lastSeenAt, '应有首次/最近活跃时间');
    assert.ok(row.data.appVersion, '应上报应用版本');
}

async function testDeviceHeartbeatPreservesCloudStatus() {
    const { LifeOS } = loadLifeOSWithContext();
    // 云端记录：主设备已把本机休眠
    const { calls, adapter } = makeDeviceMockAdapter({
        status: 'sleeping',
        firstSeenAt: '2026-07-01T00:00:00.000Z',
        name: '旧名字'
    });
    await setupSyncWithMock(LifeOS, adapter);

    await LifeOS.Sync._heartbeat();

    assert.strictEqual(calls.deviceUpsert.length, 1);
    const data = calls.deviceUpsert[0].data;
    assert.strictEqual(data.status, 'sleeping', '心跳不得覆盖云端的休眠状态');
    assert.strictEqual(data.firstSeenAt, '2026-07-01T00:00:00.000Z', 'firstSeenAt 应保留云端原值');
    assert.notStrictEqual(data.lastSeenAt, '2026-07-01T00:00:00.000Z', 'lastSeenAt 应更新为当前时间');
}

async function testSleepingDeviceBlockedFromPush() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'sleeping' });
    await setupSyncWithMock(LifeOS, adapter);

    const allowed = await LifeOS.Sync._checkDeviceAllowed();
    assert.strictEqual(allowed, false, 'sleeping 设备应被阻断');

    const result = await LifeOS.Sync.push();
    assert.strictEqual(result.blocked, true, 'push 应返回 blocked');
    assert.strictEqual(calls.upsert.length, 0, '被休眠设备不得写入云端');

    const pullResult = await LifeOS.Sync.pull();
    assert.strictEqual(pullResult.blocked, true, 'pull 应返回 blocked');
    assert.strictEqual(calls.fetchSince, 0, '被休眠设备不得拉取云端');
}

async function testRevokedDeviceDisablesSync() {
    const { LifeOS } = loadLifeOSWithContext();
    const { adapter } = makeDeviceMockAdapter({ status: 'revoked' });
    await setupSyncWithMock(LifeOS, adapter);

    const allowed = await LifeOS.Sync._checkDeviceAllowed();
    assert.strictEqual(allowed, false, 'revoked 设备应被阻断');
    assert.strictEqual(LifeOS.Sync.isEnabled(), false, 'revoked 后同步引擎应停用');
    assert.strictEqual(await LifeOS.Settings.get('syncProvider'), 'none', 'revoked 后同步配置应复位为 none');
    const err = await LifeOS.Settings.get('lastSyncError', null);
    assert.ok(err && /移除/.test(err.message), 'lastSyncError 应记录被移除原因');
}

async function testSetDeviceStatusMasterGuard() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'active' });
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: false });

    await assert.rejects(
        () => LifeOS.Sync.setDeviceStatus('dev-other', 'sleeping'),
        /仅主设备/,
        '非主设备不得管理他机'
    );

    await LifeOS.Settings.set('isMainDevice', true);
    await LifeOS.Settings.set('accountUid', 'uid-test');
    await LifeOS.Sync._loadConfig();

    await assert.rejects(
        () => LifeOS.Sync.setDeviceStatus('dev-self', 'sleeping'),
        /不能修改本机/,
        '主设备不得修改本机状态'
    );

    await assert.rejects(
        () => LifeOS.Sync.setDeviceStatus('dev-other', 'bogus'),
        /非法状态/,
        '非法状态应被拒绝'
    );

    const res = await LifeOS.Sync.setDeviceStatus('dev-other', 'sleeping');
    assert.strictEqual(res.ok, true, '主设备应能修改他机状态');
    assert.strictEqual(calls.deviceUpsert.length, 1);
    assert.strictEqual(calls.deviceUpsert[0].data.status, 'sleeping', '他机状态应被改为 sleeping');
}

async function testDeviceStatusCacheReuse() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'active' });
    await setupSyncWithMock(LifeOS, adapter);

    await LifeOS.Sync._fetchOwnDeviceDoc(false);
    await LifeOS.Sync._fetchOwnDeviceDoc(false);
    assert.strictEqual(calls.deviceGet, 1, '缓存窗口内第二次查询应命中缓存');

    await LifeOS.Sync._fetchOwnDeviceDoc(true);
    assert.strictEqual(calls.deviceGet, 2, 'force=true 应强制刷新');
}

async function testCloudBaseAdapterLoginLogout() {
    const { LifeOS, context } = loadLifeOSWithContext();
    const capture = { sets: [], whereConds: [], queryData: [] };
    context.window.cloudbase = makeCloudBaseMock(capture);

    const adapter = LifeOS.Sync._createAdapterFrom('cloudbase', { cloudbaseEnvId: 'env-login' });
    const loginResult = await adapter.login('jasmine', 'secret');
    assert.strictEqual(loginResult.ok, true, '登录应返回 ok');
    assert.strictEqual(capture.loginCalls.length, 1, '应调用一次用户名密码登录');
    assert.strictEqual(capture.loginCalls[0].username, 'jasmine', '用户名应透传');
    assert.strictEqual(capture.loginCalls[0].password, 'secret', '密码应透传');

    const user = await adapter.getCurrentUser();
    assert.ok(user, 'getCurrentUser 应返回用户');
    assert.strictEqual(user.uid, 'uid-jasmine', 'uid 应由 mock 生成');
    assert.strictEqual(user.isAnonymous, false, '账号登录后不应为匿名');

    const logoutResult = await adapter.logout();
    assert.strictEqual(logoutResult.ok, true, '登出应返回 ok');
    assert.strictEqual(capture.logoutCalls, 1, '应调用一次登出');
    const afterLogout = await adapter.getCurrentUser();
    assert.ok(afterLogout, '登出后 getCurrentUser 应降级为匿名登录');
    assert.strictEqual(afterLogout.isAnonymous, true, '登出后应为匿名用户');
}

async function testAccountLoginWritesUidAndMasterRequiresSwitch() {
    const { LifeOS, context } = loadLifeOSWithContext();
    const capture = { sets: [], whereConds: [], queryData: [] };
    context.window.cloudbase = makeCloudBaseMock(capture);

    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('deviceId', 'dev-self');
    await LifeOS.Settings.set('deviceName', '测试机');
    await LifeOS.Settings.set('isMainDevice', false);
    await LifeOS.Settings.set('syncProvider', 'cloudbase');
    await LifeOS.Settings.set('cloudbaseEnvId', 'env-test');

    const result = await LifeOS.Sync.accountLogin('jasmine', 'secret');
    assert.strictEqual(result.ok, true, 'accountLogin 应返回 ok');
    assert.strictEqual(await LifeOS.Settings.get('accountUid'), 'uid-jasmine', '登录后应写入 accountUid');

    // 新逻辑：主设备 = 本机开关 && 已登录账号；仅登录不自动变主设备
    const cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.isMainDevice, false, '仅登录账号不自动获得主设备权限（需本机开关）');
    assert.strictEqual(cfg.accountUid, 'uid-jasmine', '配置中 accountUid 应同步');

    // 打开本机开关后才是主设备
    await LifeOS.Settings.set('isMainDevice', true);
    const cfg2 = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg2.isMainDevice, true, '本机开关 && 已登录账号 = 主设备');
}

async function testAccountLogoutClearsUid() {
    const { LifeOS, context } = loadLifeOSWithContext();
    const capture = { sets: [], whereConds: [], queryData: [] };
    context.window.cloudbase = makeCloudBaseMock(capture);

    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('deviceId', 'dev-self');
    await LifeOS.Settings.set('syncProvider', 'cloudbase');
    await LifeOS.Settings.set('cloudbaseEnvId', 'env-test');
    await LifeOS.Settings.set('accountUid', 'uid-jasmine');

    await LifeOS.Sync.accountLogout();
    assert.strictEqual(await LifeOS.Settings.get('accountUid'), '', '登出后 accountUid 应清空');
    const cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.isMainDevice, false, '清空 accountUid 且本机开关关闭时不再是主设备');
}

async function testHeartbeatIncludesAccountUid() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter(null);
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: false });
    await LifeOS.Settings.set('accountUid', 'uid-jasmine');
    await LifeOS.Sync._loadConfig();

    await LifeOS.Sync._heartbeat();

    assert.strictEqual(calls.deviceUpsert.length, 1, '心跳应 upsert 一条设备记录');
    assert.strictEqual(calls.deviceUpsert[0].data.accountUid, 'uid-jasmine', '心跳设备记录应包含 accountUid');
}

async function testHardDeleteDeviceMasterGuard() {
    const { LifeOS } = loadLifeOSWithContext();
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'revoked' });
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: false });

    await assert.rejects(
        () => LifeOS.Sync.hardDeleteDevice('dev-other'),
        /仅主设备/,
        '非主设备不得彻底删除他机'
    );

    await LifeOS.Settings.set('isMainDevice', true);
    await LifeOS.Settings.set('accountUid', 'uid-test');
    await LifeOS.Sync._loadConfig();

    await assert.rejects(
        () => LifeOS.Sync.hardDeleteDevice('dev-self'),
        /不能删除本机/,
        '主设备不得彻底删除本机'
    );

    const res = await LifeOS.Sync.hardDeleteDevice('dev-other');
    assert.strictEqual(res.ok, true, '主设备应能彻底删除他机');
    assert.strictEqual(calls.deviceDelete.length, 1, '应调用一次 deviceDelete');
    assert.strictEqual(calls.deviceDelete[0], 'dev-other', '删除目标应正确');
}

async function testCleanupRevokedDevices() {
    const { LifeOS } = loadLifeOSWithContext();
    const now = Date.now();
    const thirtyOneDaysAgo = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    const twentyDaysAgo = new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString();
    const deviceList = [
        { id: 'dev-old-revoked', data: { status: 'revoked', lastSeenAt: thirtyOneDaysAgo }, updated_at: thirtyOneDaysAgo },
        { id: 'dev-new-revoked', data: { status: 'revoked', lastSeenAt: twentyDaysAgo }, updated_at: twentyDaysAgo },
        { id: 'dev-active', data: { status: 'active', lastSeenAt: twentyDaysAgo }, updated_at: twentyDaysAgo },
        { id: 'dev-self', data: { status: 'revoked', lastSeenAt: thirtyOneDaysAgo }, updated_at: thirtyOneDaysAgo }
    ];
    const { calls, adapter } = makeDeviceMockAdapter(null, { deviceList });
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: true });

    const result = await LifeOS.Sync._cleanupRevokedDevices();

    assert.strictEqual(result.cleaned, 1, '应清理 1 台超期 revoked 设备');
    assert.strictEqual(calls.deviceDelete.length, 1, '应调用一次 deviceDelete');
    assert.strictEqual(calls.deviceDelete[0], 'dev-old-revoked', '应删除 31 天前的 revoked 设备');
}

async function testSetMainDeviceGlobalUnique() {
    const { LifeOS } = loadLifeOSWithContext();
    const deviceList = [
        { id: 'dev-self', data: { status: 'active', isMaster: false }, updated_at: '2026-07-25T00:00:00.000Z' },
        { id: 'dev-other', data: { status: 'active', isMaster: true }, updated_at: '2026-07-25T00:00:00.000Z' }
    ];
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'active' }, { deviceList });
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: false });
    await LifeOS.Settings.set('accountUid', 'uid-jasmine');
    await LifeOS.Sync._loadConfig();

    const result = await LifeOS.Sync.setMainDevice();

    assert.strictEqual(result.ok, true, 'setMainDevice 应返回 ok');
    assert.strictEqual(await LifeOS.Settings.get('isMainDevice'), true, '本地开关应打开');
    // 本机 upsert isMaster=true，其他设备 upsert isMaster=false
    const selfUpsert = calls.deviceUpsert.find(r => r.id === 'dev-self');
    const otherUpsert = calls.deviceUpsert.find(r => r.id === 'dev-other');
    assert.ok(selfUpsert, '本机应有 upsert 记录');
    assert.strictEqual(selfUpsert.data.isMaster, true, '本机 isMaster 应为 true');
    assert.ok(otherUpsert, '其他设备应有 upsert 记录');
    assert.strictEqual(otherUpsert.data.isMaster, false, '其他设备 isMaster 应为 false');

    const cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.isMainDevice, true, '配置中 isMainDevice 应为 true（开关 && 账号）');
}

async function testHeartbeatDemotesWhenMasterFalse() {
    const { LifeOS } = loadLifeOSWithContext();
    // 云端记录：本机 isMaster 已被其他设备置为 false
    const { calls, adapter } = makeDeviceMockAdapter({ status: 'active', isMaster: false });
    await setupSyncWithMock(LifeOS, adapter, { isMainDevice: true });
    await LifeOS.Settings.set('accountUid', 'uid-jasmine');
    await LifeOS.Sync._loadConfig();

    await LifeOS.Sync._heartbeat();

    assert.strictEqual(await LifeOS.Settings.get('isMainDevice'), false, '被降级后本地开关应自动关闭');
    const cfg = await LifeOS.Sync._loadConfig();
    assert.strictEqual(cfg.isMainDevice, false, '配置中 isMainDevice 应为 false');
    const row = calls.deviceUpsert[0];
    assert.strictEqual(row.data.isMaster, false, '心跳上报 isMaster 应为 false');
}

// ============ v4.0.5：pull 回声 push + 冷启动超时 ============

async function testPulledEchoRecordsAreNotRePushed() {
    const { LifeOS } = loadLifeOSWithContext();
    const remoteRow = {
        id: 'task-remote-1',
        data: { id: 'task-remote-1', title: '他端任务', date: '2026-07-25', completed: false },
        updated_at: '2026-07-25T10:00:00.000Z',
        updated_by: 'dev-other',
        deleted_at: null
    };
    const { calls, adapter } = makeDeviceMockAdapter(null);
    adapter.fetchSince = async (table) => table === 'tasks' ? [remoteRow] : [];
    await setupSyncWithMock(LifeOS, adapter);

    // 本机另有一条真实改动
    await LifeOS.Task.create({ title: '本机改动', date: '2026-07-25', deadline: '2026-07-25', priority: 5 });

    await LifeOS.Sync.pull();
    const localCopy = await LifeOS.Database.get('tasks', 'task-remote-1');
    assert.ok(localCopy, 'pull 应落库远端记录');

    const pushResult = await LifeOS.Sync.push();
    const pushedIds = calls.upsert.flatMap(c => c.rows.map(r => r.id));
    assert.ok(!pushedIds.includes('task-remote-1'), '当轮 pull 落库的记录不得回声 push');
    assert.ok(pushedIds.length > 0, '本机真实改动仍应 push');
    assert.ok(pushResult.pushed >= 1);

    // 本地再编辑该记录后（updatedAt 变化），应恢复可 push
    const edited = { ...localCopy, title: '本机编辑过', updatedAt: '2026-07-25T12:00:00.000Z' };
    await LifeOS.Database.putRaw('tasks', edited);
    await LifeOS.Sync.push();
    const pushedIds2 = calls.upsert.flatMap(c => c.rows.map(r => r.id));
    assert.ok(pushedIds2.includes('task-remote-1'), '本地编辑后应正常 push');
}

function testColdStartUsesRelaxedTimeout() {
    const src = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'js', 'sync.js'), 'utf8');
    assert.ok(/INIT_TIMEOUT_MS\s*=\s*45000/.test(src), '应定义 45s 冷启动超时');
    const initCalls = src.match(/withInitTimeout\(getApp\(\)/g) || [];
    assert.strictEqual(initCalls.length, 8, 'getApp() 全部 8 处调用应走放宽超时');
    assert.ok(!/withTimeout\(getApp\(\)/.test(src), 'getApp() 不应再走 15s 常规超时');
}

const tests = [
    testRemoteNewerWithoutLocalChangesUsesRemote,
    testLocalNewerKeepsLocal,
    testBothChangedRemoteNewerWins,
    testNearTieMainDeviceWins,
    testAskPolicyQueuesConflict,
    testTombstonePropagates,
    testLocalMissingUsesRemote,
    testEqualTimestampsNoop,
    testOwnEchoIsNotConflict,
    testPutStampsSyncFields,
    testSoftDeleteAndTombstoneFiltering,
    testPutRawSkipsStamping,
    testPurgeDeleted,
    testStoreTableMapping,
    testProviderSelection,
    testInitDisabledWhenProviderNone,
    testCloudBaseAdapterUpsertAndFetch,
    testLastSyncAtPerProvider,
    testLastSyncAtLegacyFallback,
    testDeviceHeartbeatCreatesActiveRecord,
    testDeviceHeartbeatPreservesCloudStatus,
    testSleepingDeviceBlockedFromPush,
    testRevokedDeviceDisablesSync,
    testSetDeviceStatusMasterGuard,
    testDeviceStatusCacheReuse,
    testCloudBaseAdapterLoginLogout,
    testAccountLoginWritesUidAndMasterRequiresSwitch,
    testAccountLogoutClearsUid,
    testHeartbeatIncludesAccountUid,
    testHardDeleteDeviceMasterGuard,
    testCleanupRevokedDevices,
    testSetMainDeviceGlobalUnique,
    testHeartbeatDemotesWhenMasterFalse,
    testPulledEchoRecordsAreNotRePushed,
    testColdStartUsesRelaxedTimeout
];

(async () => {
    for (const test of tests) {
        await test();
        console.log(`PASS ${test.name}`);
    }
    console.log(`\n同步引擎测试全部通过（${tests.length} 项）✓`);
    // sync.js 会安装心跳/状态轮询计时器；测试断言完成后显式退出，避免 CI 被后台计时器挂住。
    process.exit(0);
})().catch((error) => {
    console.error(`FAIL ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
