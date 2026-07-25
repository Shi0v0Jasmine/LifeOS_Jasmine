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

// 固定「今天」：2026-07-25（周六，Q3）
const TODAY = '2026-07-25';
const rec = (habitId, date, completed = true, metrics) => {
    const r = { id: `${habitId}_${date}`, habitId, date, completed };
    if (metrics) r.metrics = metrics;
    return r;
};

// ============ F-120 度量值解析/格式化 ============

function testDurationParseFormat() {
    const HP = loadLifeOS().HabitPlan;
    assert.strictEqual(HP.parseDuration('1:23:45'), 5025);
    assert.strictEqual(HP.parseDuration('23:45'), 1425);
    assert.strictEqual(HP.parseDuration('45'), 45, '纯数字按秒');
    assert.strictEqual(HP.parseDuration('1时23分45秒'), 5025);
    assert.strictEqual(HP.parseDuration(90), 90);
    assert.strictEqual(HP.parseDuration('abc'), null);
    assert.strictEqual(HP.parseDuration('90:30'), 5430, '两分位制分钟可超 60（长跑）');
    assert.strictEqual(HP.parseDuration('1:90'), null, '秒位 ≥60 非法');
    assert.strictEqual(HP.parseDuration(''), null);

    assert.strictEqual(HP.formatDuration(5025), '1:23:45');
    assert.strictEqual(HP.formatDuration(1425), '23:45');
    assert.strictEqual(HP.formatDuration(45), '0:45');
    console.log('✓ F-120 时长解析/格式化');
}

function testParseMetricValue() {
    const HP = loadLifeOS().HabitPlan;
    assert.strictEqual(HP.parseMetricValue('number', '95.5'), 95.5);
    assert.strictEqual(HP.parseMetricValue('number', 'abc'), null);
    assert.strictEqual(HP.parseMetricValue('duration', '30:15'), 1815);
    assert.strictEqual(HP.parseMetricValue('text', ' 感觉不错 '), '感觉不错');
    assert.strictEqual(HP.parseMetricValue('text', '   '), null);
    assert.strictEqual(HP.parseMetricValue('number', ''), null);

    const def = { key: '时长', label: '时长', type: 'duration' };
    assert.strictEqual(HP.formatMetricValue(def, 1815), '30:15');
    assert.strictEqual(HP.formatMetricValue({ key: '距离', label: '距离', type: 'number', unit: 'km' }, 5.2), '5.2 km');
    console.log('✓ F-120 度量值归一/展示');
}

// ============ F-122 聚合 ============

function testAggregateRecords() {
    const HP = loadLifeOS().HabitPlan;
    const habit = {
        id: 'h1',
        metrics: [
            { key: '距离', label: '距离', type: 'number', unit: 'km' },
            { key: '时长', label: '时长', type: 'duration' },
            { key: '心得', label: '心得', type: 'text' }
        ]
    };
    const records = [
        rec('h1', '2026-07-20', true, { '距离': 5, '时长': 1800 }),
        rec('h1', '2026-07-22', true, { '距离': 3.5 }),
        rec('h1', '2026-07-22', false, { '距离': 99 }), // 未完成记录的度量不计入
        rec('h1', '2026-06-15', true, { '距离': 2 }),
        rec('h2', '2026-07-21', true, { '距离': 7 })
    ];

    // 周视图：7 个日桶，周一 07-20 起
    const week = HP.aggregateRecords(habit, records, 'week', TODAY);
    assert.strictEqual(week.length, 7);
    assert.strictEqual(week[0].date, '2026-07-20');
    assert.strictEqual(week[0].count, 1);
    assert.strictEqual(week[0].metrics['距离'], 5);
    assert.strictEqual(week[2].count, 1, '周三桶一条完成记录');
    assert.strictEqual(week[2].metrics['距离'], 3.5, '未完成记录的度量不计入');
    assert.strictEqual(week[6].count, 0);

    // 月视图：31 个日桶
    const month = HP.aggregateRecords(habit, records, 'month', TODAY);
    assert.strictEqual(month.length, 31);
    assert.strictEqual(month.reduce((s, b) => s + b.count, 0), 2, '仅本月完成记录');

    // 季视图：Q3 = 7/8/9 月，3 个月桶
    const quarter = HP.aggregateRecords(habit, records, 'quarter', TODAY);
    assert.strictEqual(quarter.length, 3);
    assert.strictEqual(quarter[0].label, '7月');
    assert.strictEqual(quarter[0].count, 2);
    assert.strictEqual(quarter[0].metrics['距离'], 8.5, '季度月桶度量求和');
    assert.strictEqual(quarter[0].metrics['时长'], 1800);
    assert.strictEqual(quarter[1].count, 0);

    // 年视图：12 个月桶
    const year = HP.aggregateRecords(habit, records, 'year', TODAY);
    assert.strictEqual(year.length, 12);
    assert.strictEqual(year[5].label, '6月');
    assert.strictEqual(year[5].count, 1);
    assert.strictEqual(year[6].metrics['距离'], 8.5);
    console.log('✓ F-122 周/月/季/年聚合与度量求和');
}

// ============ F-121 AI 解析 ============

function testBuildPromptAndParse() {
    const HP = loadLifeOS().HabitPlan;
    const habit = {
        id: 'h1', name: '跑步',
        metrics: [
            { key: '距离', label: '距离', type: 'number', unit: 'km' },
            { key: '时长', label: '时长', type: 'duration' },
            { key: '平均心率', label: '平均心率', type: 'number', unit: 'bpm' }
        ]
    };
    const prompt = HP.buildMetricsParsePrompt(habit);
    assert.ok(prompt.includes('距离') && prompt.includes('km'), 'prompt 含字段与单位');
    assert.ok(prompt.includes('JSON'), 'prompt 要求 JSON 输出');

    // 标准 JSON
    let parsed = HP.parseMetricsFromAI('{"距离": 5.2, "时长": "28:30", "平均心率": 145}', habit.metrics);
    assert.strictEqual(parsed['距离'], 5.2);
    assert.strictEqual(parsed['时长'], 1710, '时长字符串归一为秒');
    assert.strictEqual(parsed['平均心率'], 145);

    // markdown 代码块 + 多余文字
    parsed = HP.parseMetricsFromAI('识别结果如下：\n```json\n{"距离": "5.2", "时长": "0:28:30"}\n```\n请确认。', habit.metrics);
    assert.strictEqual(parsed['距离'], 5.2, '字符串数字可归一');
    assert.strictEqual(parsed['时长'], 1710);

    // 无效值剔除、未定义字段忽略、数组返回空
    parsed = HP.parseMetricsFromAI('{"距离": "abc", "未知字段": 1}', habit.metrics);
    assert.deepStrictEqual(Object.keys(parsed), []);
    parsed = HP.parseMetricsFromAI('[1,2,3]', habit.metrics);
    assert.deepStrictEqual(Object.keys(parsed), []);
    console.log('✓ F-121 prompt 生成与 AI 返回解析');
}

// ============ 数据层集成 ============

async function testMetricsStoreIntegration() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const habit = await LifeOS.Habit.create({
        name: '灵活脑学校',
        metrics: [
            { key: '总分', label: '总分', type: 'number' },
            { key: '直觉', label: '直觉', type: 'number' }
        ]
    });
    assert.strictEqual(habit.metrics.length, 2, 'metrics 字段定义落库');

    await LifeOS.Habit.checkIn(habit.id, TODAY, { completed: true, metrics: { '总分': 880, '直觉': 92 } });
    const record = await LifeOS.Habit.getRecord(habit.id, TODAY);
    assert.strictEqual(record.metrics['总分'], 880);
    assert.strictEqual(record.images.length, 0, 'F-121 图片只解析不存储，images 保持空');

    // 老习惯（无 metrics 字段）兼容：默认空数组
    const old = await LifeOS.Habit.create({ name: '老习惯' });
    assert.strictEqual(old.metrics.length, 0, '默认空 metrics');

    const all = await LifeOS.Habit.getRecordsByHabit(habit.id);
    const agg = LifeOS.HabitPlan.aggregateRecords(habit, all, 'week', TODAY);
    const todayBucket = agg.find(b => b.date === TODAY);
    assert.strictEqual(todayBucket.count, 1);
    assert.strictEqual(todayBucket.metrics['总分'], 880);
    console.log('✓ 数据层：metrics 定义与打卡值落库、聚合');
}

// ============ 运行 ============

(async () => {
    try {
        testDurationParseFormat();
        testParseMetricValue();
        testAggregateRecords();
        testBuildPromptAndParse();
        await testMetricsStoreIntegration();
        console.log('\n习惯度量与数据面板测试全部通过（5 项）✓');
    } catch (e) {
        console.error('测试失败:', e);
        process.exit(1);
    }
})();
