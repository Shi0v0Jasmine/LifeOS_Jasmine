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

// 固定「今天」：2026-07-25 是周六，所在自然周为 07-20(周一) ~ 07-26(周日)
const TODAY = '2026-07-25';
const rec = (habitId, date, completed = true) => ({ id: `${habitId}_${date}`, habitId, date, completed });

// ============ F-117 周期型计划 ============

function testWeekMonthRange() {
    const LifeOS = loadLifeOS();
    const HP = LifeOS.HabitPlan;

    const week = HP.weekRange(TODAY);
    assert.strictEqual(week.start, '2026-07-20', '周六所在自然周应从周一开始');
    assert.strictEqual(week.end, '2026-07-26', '周六所在自然周应在周日结束');
    const weekMon = HP.weekRange('2026-07-20');
    assert.strictEqual(weekMon.start, '2026-07-20', '周一当天属于本周');
    const weekSun = HP.weekRange('2026-07-26');
    assert.strictEqual(weekSun.start, '2026-07-20', '周日仍属于本周');

    const month = HP.monthRange(TODAY);
    assert.strictEqual(month.start, '2026-07-01', '自然月起');
    assert.strictEqual(month.end, '2026-07-31', '自然月止');

    console.log('✓ 周期口径：自然周(周一~周日)/自然月');
}

function testWeeklyMonthlyProgress() {
    const LifeOS = loadLifeOS();
    const HP = LifeOS.HabitPlan;

    const habit = { id: 'h1', plan: { type: 'weekly', times: 3, startDate: '2026-07-01', stopDate: null }, pauses: [] };
    const records = [
        rec('h1', '2026-07-19'), // 上周日，不计入本周
        rec('h1', '2026-07-20'),
        rec('h1', '2026-07-23'),
        rec('h1', '2026-07-23', false), // 未完成不计
        rec('h2', '2026-07-24')  // 其他习惯不计
    ];
    const p = HP.getPlanProgress(habit, records, TODAY);
    assert.strictEqual(p.done, 2, '本周完成 2 次');
    assert.strictEqual(p.target, 3);
    assert.strictEqual(p.status, 'active');

    const recordsFull = [...records, rec('h1', '2026-07-25')];
    assert.strictEqual(HP.getPlanProgress(habit, recordsFull, TODAY).status, 'finished', '达标后 finished');

    const mHabit = { id: 'h1', plan: { type: 'monthly', times: 2, startDate: '2026-07-01', stopDate: null }, pauses: [] };
    const mp = HP.getPlanProgress(mHabit, [rec('h1', '2026-06-30'), rec('h1', '2026-07-19'), rec('h1', '2026-07-25')], TODAY);
    assert.strictEqual(mp.done, 2, '上月记录不计入本月');
    assert.strictEqual(mp.status, 'finished');

    // 停止日到达后计划自动结束
    const stopHabit = { id: 'h1', plan: { type: 'weekly', times: 5, startDate: '2026-07-01', stopDate: '2026-07-24' }, pauses: [] };
    assert.strictEqual(HP.planStatus(stopHabit, [], TODAY), 'finished', '超过停止日计划结束');
    assert.strictEqual(HP.planStatus(stopHabit, [], '2026-07-24'), 'active', '停止日当天仍进行中');

    console.log('✓ F-117 周期型：周/月进度与停止日');
}

// ============ F-118 限时型计划 ============

function testLimitedPlan() {
    const LifeOS = loadLifeOS();
    const HP = LifeOS.HabitPlan;

    assert.strictEqual(HP.isValidLimitedWindow('2026-07-25', '2026-08-24'), true, '30 天窗口合法');
    assert.strictEqual(HP.isValidLimitedWindow('2026-07-25', '2026-08-25'), false, '31 天窗口非法');
    assert.strictEqual(HP.isValidLimitedWindow('2026-07-25', '2026-07-24'), false, '截止早于开始非法');

    const habit = { id: 'h1', plan: { type: 'limited', times: 2, startDate: '2026-07-20', endDate: '2026-07-26' }, pauses: [] };
    const p = HP.getPlanProgress(habit, [rec('h1', '2026-07-21'), rec('h1', '2026-07-19')], TODAY);
    assert.strictEqual(p.done, 1, '窗口外记录不计入');
    assert.strictEqual(p.periodStart, '2026-07-20');
    assert.strictEqual(p.periodEnd, '2026-07-26');

    // 到期未达成 → failed，不再持续拉低
    assert.strictEqual(HP.planStatus(habit, [rec('h1', '2026-07-21')], '2026-07-27'), 'failed', '到期未达成为 failed');
    // 提前达标 → finished
    assert.strictEqual(HP.planStatus(habit, [rec('h1', '2026-07-21'), rec('h1', '2026-07-22')], TODAY), 'finished', '提前达标为 finished');

    console.log('✓ F-118 限时型：30 天窗口 / 未达成 / 提前达标');
}

// ============ F-119 暂停 ============

function testPauseBasics() {
    const LifeOS = loadLifeOS();
    const HP = LifeOS.HabitPlan;

    // 无限期暂停
    const indefinite = { id: 'h1', pauses: [{ reason: '伤病', startDate: '2026-07-20', endDate: null }] };
    assert.strictEqual(HP.isPausedOn(indefinite, '2026-07-19'), false, '暂停开始前不受影响');
    assert.strictEqual(HP.isPausedOn(indefinite, TODAY), true, '无限期暂停中');
    assert.strictEqual(HP.activePause(indefinite, TODAY).reason, '伤病');

    // 定时暂停：到期自动恢复
    const ranged = { id: 'h1', pauses: [{ reason: '生理期', startDate: '2026-07-20', endDate: '2026-07-24' }] };
    assert.strictEqual(HP.isPausedOn(ranged, '2026-07-24'), true, '暂停截止日当天仍暂停');
    assert.strictEqual(HP.isPausedOn(ranged, TODAY), false, '到期自动恢复');

    // 完成率分母剔除
    const habits = [indefinite, ranged, { id: 'h3', pauses: [] }];
    const active = HP.activeHabitsOn(habits, TODAY).map(h => h.id);
    assert.deepStrictEqual(active.sort(), ['h1', 'h3'], '无限期暂停剔除，到期恢复的保留');

    console.log('✓ F-119 暂停：无限期/定时自动恢复/分母剔除');
}

function testStreakSkipsPause() {
    const LifeOS = loadLifeOS();
    const HP = LifeOS.HabitPlan;

    const habit = { id: 'h1', pauses: [{ reason: '旅行', startDate: '2026-07-24', endDate: '2026-07-24' }] };
    const records = [rec('h1', '2026-07-22'), rec('h1', '2026-07-23'), rec('h1', '2026-07-25')];
    assert.strictEqual(HP.calcStreak(habit, records, TODAY), 3, '暂停日跳过不断 streak');

    // 无暂停时漏打卡会断
    const noPause = { id: 'h1', pauses: [] };
    assert.strictEqual(HP.calcStreak(noPause, records, TODAY), 1, '漏打卡则 streak 断');

    // 今天暂停且未打卡：从今天往前追溯不断
    const pausedToday = { id: 'h1', pauses: [{ reason: '伤病', startDate: TODAY, endDate: null }] };
    assert.strictEqual(HP.calcStreak(pausedToday, [rec('h1', '2026-07-23'), rec('h1', '2026-07-24')], TODAY), 2, '今天暂停不清零');

    console.log('✓ F-119 streak：暂停日跳过（不断也不增）');
}

// ============ 数据层集成（Fake IndexedDB） ============

async function testStoreIntegration() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    // 创建带计划的习惯
    const habit = await LifeOS.Habit.create({
        name: '跑步',
        plan: { type: 'weekly', times: 3, startDate: TODAY, stopDate: null }
    });
    assert.strictEqual(habit.plan.type, 'weekly');
    assert.strictEqual(habit.pauses.length, 0, 'pauses 默认空数组');

    // checkIn 扩展字段透传（为 F-120 metrics 预留）
    await LifeOS.Habit.checkIn(habit.id, TODAY, { completed: true, metrics: { distance: 5.2 } });
    const record = await LifeOS.Habit.getRecord(habit.id, TODAY);
    assert.strictEqual(record.metrics.distance, 5.2, '扩展字段透传落库');

    // 暂停/恢复
    await LifeOS.Habit.pause(habit.id, { reason: '膝伤', startDate: TODAY, endDate: null });
    let h = (await LifeOS.Habit.getAll())[0];
    assert.strictEqual(h.pauses.length, 1);
    assert.strictEqual(h.pauses[0].reason, '膝伤');
    assert.strictEqual(LifeOS.HabitPlan.isPausedOn(h, TODAY), true);

    await LifeOS.Habit.resume(habit.id, TODAY);
    h = (await LifeOS.Habit.getAll())[0];
    assert.strictEqual(h.pauses.length, 0, '当天开始当天恢复的暂停段被移除');

    // 昨天的 streak 经数据层计算（暂停跳过）
    await LifeOS.Habit.pause(habit.id, { reason: '旅行', startDate: '2026-07-24', endDate: '2026-07-24' });
    await LifeOS.Habit.checkIn(habit.id, '2026-07-23', { completed: true });
    const realToday = LifeOS.Utils.formatDate();
    await LifeOS.Habit.checkIn(habit.id, realToday, { completed: true });
    const streak = await LifeOS.Habit.getStreak(habit.id);
    assert.ok(streak >= 1, '数据层 getStreak 正常返回');

    console.log('✓ 数据层：plan/pauses 字段、checkIn 透传、pause/resume、getStreak');
}

// ============ 运行 ============

(async () => {
    try {
        testWeekMonthRange();
        testWeeklyMonthlyProgress();
        testLimitedPlan();
        testPauseBasics();
        testStreakSkipsPause();
        await testStoreIntegration();
        console.log('\n习惯计划与暂停测试全部通过（6 项）✓');
    } catch (e) {
        console.error('测试失败:', e);
        process.exit(1);
    }
})();
