const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============ 复用现有测试框架（与 subtask.test.js 相同） ============
class ObjectStoreNames extends Array {
    contains(name) { return this.includes(name); }
}

class FakeIndexedDB {
    constructor() {
        this.databases = new Map();
    }
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
                request.onupgradeneeded({ target: { result: db, transaction: { objectStore: (n) => db.stores.get(n) } }, oldVersion });
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
                if (!storeNames.includes(name)) throw new Error('Store ' + name + ' not in transaction');
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
        this.indexNames = new ObjectStoreNames();
    }
    createIndex(name, keyPath, options = {}) {
        this.indexes.set(name, { keyPath, multiEntry: !!options.multiEntry, records: new Map() });
        this.indexNames.push(name);
    }
    put(data) {
        const key = data[this.keyPath];
        this.records.set(key, structuredClone(data));
        for (const [idxName, idx] of this.indexes) {
            const idxKey = data[idx.keyPath];
            if (idxKey !== undefined && idxKey !== null) {
                if (!idx.records.has(idxKey)) idx.records.set(idxKey, []);
                const arr = idx.records.get(idxKey) || [];
                const filtered = arr.filter(item => item[this.keyPath] !== key);
                filtered.push(structuredClone(data));
                idx.records.set(idxKey, filtered);
            }
        }
        const request = { result: key };
        setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
        return request;
    }
    get(key) {
        const request = { result: this.records.get(key) };
        setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
        return request;
    }
    delete(key) {
        const record = this.records.get(key);
        if (record) {
            for (const [idxName, idx] of this.indexes) {
                const idxKey = record[idx.keyPath];
                if (idxKey !== undefined && idx.records.has(idxKey)) {
                    const arr = idx.records.get(idxKey);
                    idx.records.set(idxKey, arr.filter(item => item[this.keyPath] !== key));
                }
            }
        }
        this.records.delete(key);
        const request = {};
        setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
        return request;
    }
    getAll() {
        const request = { result: Array.from(this.records.values()) };
        setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
        return request;
    }
    getAllRecords() { return Array.from(this.records.values()); }
    index(name) {
        const idx = this.indexes.get(name);
        return {
            getAll: (value) => {
                const request = { result: idx ? (idx.records.get(value) || []) : [] };
                setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
                return request;
            }
        };
    }
    openCursor() {
        const entries = Array.from(this.records.entries());
        let i = 0;
        const request = {};
        setTimeout(() => {
            request.result = {
                get value() { return entries[i] ? structuredClone(entries[i][1]) : undefined; },
                update: (data) => { entries[i][1] = structuredClone(data); },
                continue: () => { i++; if (request.onsuccess) request.onsuccess(); }
            };
            if (request.onsuccess) request.onsuccess();
        }, 0);
        return request;
    }
    clear() {
        this.records.clear();
        for (const idx of this.indexes.values()) idx.records.clear();
        const request = {};
        setTimeout(() => { if (request.onsuccess) request.onsuccess(); }, 0);
        return request;
    }
}
function loadLifeOS() {
    const context = vm.createContext({
        window: {},
        document: {},
        console: { log: () => {}, warn: () => {}, error: () => {} },
        indexedDB: new FakeIndexedDB(),
        crypto: { randomUUID: () => 'test-' + Math.random().toString(36).substr(2, 9) },
        URL: { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} },
        Blob: class Blob {},
        FileReader: class FileReader { readAsText() {} readAsDataURL() {} },
        fetch: () => Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('{}') }),
        structuredClone: (obj) => JSON.parse(JSON.stringify(obj)),
        setTimeout: (fn, ms) => setTimeout(fn, ms || 0),
        clearTimeout: (id) => clearTimeout(id),
        AbortController: class AbortController { abort() {} get signal() { return {}; } },
        navigator: {},
        location: { protocol: 'file:' }
    });
    context.window = context;
    const code = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'js', 'core.js'), 'utf8');
    vm.runInContext(code, context);
    return context.LifeOS;
}

// ============ F-123 起床/睡觉打卡 ============

async function testSleepWakeFlow() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // 7-27 23:30 睡觉打卡 → sleepOpen 事件
    const sleepEvt = await LifeOS.Timeline.sleepCheckIn(new Date('2026-07-27T23:30:00'));
    assert.strictEqual(sleepEvt.category, 'sleep');
    assert.strictEqual(sleepEvt.sleepOpen, true);
    assert.strictEqual(sleepEvt.date, '2026-07-27');
    assert.strictEqual(sleepEvt.startTime, '23:30');

    // 睡眠状态可查询
    const state = await LifeOS.Timeline.getSleepState();
    assert.strictEqual(state.open.id, sleepEvt.id);

    // 重复睡觉打卡 → 取最新一次，更新同一事件
    await LifeOS.Timeline.sleepCheckIn(new Date('2026-07-27T23:55:00'));
    let all = await LifeOS.Timeline.getAll();
    assert.strictEqual(all.filter(e => e.category === 'sleep').length, 1, '重复睡觉不堆叠');
    assert.strictEqual(all[0].startTime, '23:55', '睡觉时间更新为最新');

    // 7-28 07:00 起床打卡 → 闭合，date 归到起床日
    const closed = await LifeOS.Timeline.wakeCheckIn(new Date('2026-07-28T07:00:00'));
    assert.strictEqual(closed.sleepOpen, false);
    assert.strictEqual(closed.date, '2026-07-28', '跨天睡眠记到起床日');
    assert.strictEqual(closed.endTime, '07:00');

    // 时长：23:55 → 07:00 = 425 分钟
    assert.strictEqual(LifeOS.Timeline.calcSleepDuration(closed), 425);

    // 起床后无进行中睡眠
    const state2 = await LifeOS.Timeline.getSleepState();
    assert.strictEqual(state2.open, null);
    console.log('✓ F-123 睡觉→起床闭环：跨天归属/重复取最新/时长计算');
}

async function testWakeWithoutSleep() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // 无睡眠记录直接起床 → wakeOnly 单点
    const wake = await LifeOS.Timeline.wakeCheckIn(new Date('2026-07-28T06:50:00'));
    assert.strictEqual(wake.wakeOnly, true);
    assert.strictEqual(wake.title, '🌅 起床');
    assert.strictEqual(LifeOS.Timeline.calcSleepDuration(wake), null, '仅起床无睡眠时长');

    // 同日重复起床 → 更新时间
    await LifeOS.Timeline.wakeCheckIn(new Date('2026-07-28T07:10:00'));
    const all = await LifeOS.Timeline.getAll();
    assert.strictEqual(all.filter(e => e.wakeOnly).length, 1, '重复起床不堆叠');
    assert.strictEqual(all.find(e => e.wakeOnly).startTime, '07:10');
    console.log('✓ F-123 无睡眠直接起床：wakeOnly 单点 + 重复更新');
}

async function testSameDayNapDuration() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // 同日午睡 13:00 → 14:30（end > start 不加 24h）
    await LifeOS.Timeline.sleepCheckIn(new Date('2026-07-28T13:00:00'));
    const closed = await LifeOS.Timeline.wakeCheckIn(new Date('2026-07-28T14:30:00'));
    assert.strictEqual(LifeOS.Timeline.calcSleepDuration(closed), 90);

    // 未闭合事件时长为 null
    await LifeOS.Timeline.sleepCheckIn(new Date('2026-07-28T23:00:00'));
    const state = await LifeOS.Timeline.getSleepState();
    assert.strictEqual(LifeOS.Timeline.calcSleepDuration(state.open), null);
    console.log('✓ F-123 同日小睡时长 / 未闭合不计时长');
}

// ============ 运行 ============

(async () => {
    try {
        await testSleepWakeFlow();
        await testWakeWithoutSleep();
        await testSameDayNapDuration();
        console.log('\n起床/睡觉打卡测试全部通过（3 项）✓');
    } catch (e) {
        console.error('测试失败:', e);
        process.exit(1);
    }
})();
