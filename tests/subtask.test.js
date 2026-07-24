const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============ 复用现有测试框架 ============
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

// ============ 子任务专项测试 ============

async function testSubtaskCRUD() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const parent = await LifeOS.Task.create({ title: '日语学习', deadline: '2025-07-15', priority: 7 });
    assert.strictEqual(parent.isSubtask, false, '亲任务 isSubtask 应为 false');
    assert.strictEqual(parent.parentId, null, '亲任务 parentId 应为 null');

    const sub1 = await LifeOS.Task.createSubtask(parent.id, { title: '看第7课', deadline: '2025-07-10', note: 'N4语法' });
    assert.strictEqual(sub1.isSubtask, true, '子任务 isSubtask 应为 true');
    assert.strictEqual(sub1.parentId, parent.id, '子任务 parentId 应指向亲任务');

    const subs = await LifeOS.Task.getSubtasks(parent.id);
    assert.strictEqual(subs.length, 1, '应返回1个子任务');
    assert.strictEqual(subs[0].title, '看第7课', '子任务标题正确');

    const updated = await LifeOS.Task.updateSubtask(sub1.id, { note: 'N4语法 - 重点' });
    assert.strictEqual(updated.note, 'N4语法 - 重点', '子任务备注更新成功');

    await assert.rejects(
        () => LifeOS.Task.updateSubtask(sub1.id, { parentId: 'fake-id' }),
        (err) => err.message.includes('Cannot change subtask parentId'),
        '应禁止修改子任务 parentId'
    );

    const deleted = await LifeOS.Task.deleteSubtask(sub1.id);
    assert.strictEqual(deleted.id, sub1.id, 'deleteSubtask 返回被删除对象');
    const remaining = await LifeOS.Task.getSubtasks(parent.id);
    assert.strictEqual(remaining.length, 0, '子任务删除后应为空');

    console.log('PASS testSubtaskCRUD');
}

async function testSubtaskQuadrantInheritance() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const parent = await LifeOS.Task.create({ title: '长期项目', deadline: '2025-08-01', priority: 8 });
    const subNoDeadline = await LifeOS.Task.createSubtask(parent.id, { title: '子任务A' });
    assert.strictEqual(subNoDeadline.quadrant, parent.quadrant, '无deadline子任务应继承父象限');

    const subWithDeadline = await LifeOS.Task.createSubtask(parent.id, { title: '子任务B', deadline: '2025-07-09', priority: 8 });
    assert.ok(subWithDeadline.quadrant, '有deadline子任务应有象限');

    console.log('PASS testSubtaskQuadrantInheritance');
}

async function testDeleteParentCascadesSubtasks() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const parent = await LifeOS.Task.create({ title: '父任务' });
    const sub1 = await LifeOS.Task.createSubtask(parent.id, { title: '子任务1' });
    const sub2 = await LifeOS.Task.createSubtask(parent.id, { title: '子任务2' });

    await LifeOS.Task.delete(parent.id);

    const allTasks = await LifeOS.Task.getAll();
    const remainingIds = allTasks.map(t => t.id);
    assert.ok(!remainingIds.includes(parent.id), '亲任务应被删除');
    assert.ok(!remainingIds.includes(sub1.id), '子任务1应被级联删除');
    assert.ok(!remainingIds.includes(sub2.id), '子任务2应被级联删除');

    console.log('PASS testDeleteParentCascadesSubtasks');
}

async function testCompletionRateExcludesSubtasks() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const today = LifeOS.Utils.formatDate();
    const parent = await LifeOS.Task.create({ title: '父任务', date: today });
    const sub = await LifeOS.Task.createSubtask(parent.id, { title: '子任务', date: today });

    await LifeOS.Task.toggleSubtaskComplete(sub.id);
    const rate = await LifeOS.Task.getCompletionRate();
    assert.strictEqual(rate, 0, '子任务完成不应计入完成率');

    await LifeOS.Task.toggleComplete(parent.id);
    const rate2 = await LifeOS.Task.getCompletionRate();
    assert.strictEqual(rate2, 100, '父任务完成后完成率应为100%');

    console.log('PASS testCompletionRateExcludesSubtasks');
}

async function testToggleSubtaskCompleteCreatesTimeline() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const parent = await LifeOS.Task.create({ title: '父任务', category: '学习' });
    const sub = await LifeOS.Task.createSubtask(parent.id, { title: '子任务' });

    const result = await LifeOS.Task.toggleSubtaskComplete(sub.id);
    assert.strictEqual(result.sub.completed, true, '子任务应标记完成');
    assert.strictEqual(result.allCompleted, true, '全部子任务完成标志应为true');
    assert.strictEqual(result.parentTitle, '父任务', '返回父任务标题');

    const today = LifeOS.Utils.formatDate();
    const events = await LifeOS.Timeline.getByDate(today);
    const taskEvents = events.filter(e => e.taskId === sub.id && e.type === 'actual');
    assert.strictEqual(taskEvents.length, 1, '应创建1个实际时间轴事件');
    assert.strictEqual(taskEvents[0].title, '子任务', '时间轴标题应为子任务标题');

    const undoResult = await LifeOS.Task.toggleSubtaskComplete(sub.id);
    assert.strictEqual(undoResult.sub.completed, false, '子任务应撤回完成');
    assert.strictEqual(undoResult.allCompleted, false, '全部完成标志应为false');

    console.log('PASS testToggleSubtaskCompleteCreatesTimeline');
}

async function testRecurringTaskSubtaskCopy() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const today = LifeOS.Utils.formatDate();
    const tomorrow = LifeOS.Utils.formatDate(new Date(Date.now() + 86400000));

    const parent = await LifeOS.Task.create({
        title: '每日日语',
        isRecurring: true,
        recurringRule: { type: 'daily' },
        date: today
    });

    const sub = await LifeOS.Task.createSubtask(parent.id, { title: '看课', deadline: '2025-07-15' });
    const recurringSub = await LifeOS.Task.createSubtask(parent.id, {
        title: '背单词',
        isRecurring: true,
        recurringRule: { type: 'daily' }
    });

    await LifeOS.Task.toggleComplete(parent.id);

    const allTasks = await LifeOS.Task.getAll();
    const tomorrowTasks = allTasks.filter(t => t.date === tomorrow && t.title === '每日日语');
    assert.strictEqual(tomorrowTasks.length, 1, '应生成明日亲任务副本');

    const nextParent = tomorrowTasks[0];
    assert.strictEqual(nextParent.isSubtask, false, '副本应为亲任务');
    assert.strictEqual(nextParent.parentId, null, '副本parentId应为null');
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(nextParent, 'subtasks'),
        false,
        '循环亲任务副本不应保留subtasks数组'
    );

    const nextSubs = await LifeOS.Task.getSubtasks(nextParent.id);
    assert.strictEqual(nextSubs.length, 1, '只应复制非循环子任务');
    assert.strictEqual(nextSubs[0].title, '看课', '复制的子任务标题正确');
    assert.strictEqual(nextSubs[0].isSubtask, true, '复制的子任务标记正确');
    assert.strictEqual(nextSubs[0].completed, false, '复制的子任务应重置completed');

    const recurringNextSubs = nextSubs.filter(s => s.isRecurring);
    assert.strictEqual(recurringNextSubs.length, 0, '循环子任务不应被复制到副本');

    console.log('PASS testRecurringTaskSubtaskCopy');
}

async function testRecurringInstanceOmitsNestedSubtasks() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const source = await LifeOS.Task.create({
        title: '每日论文',
        isRecurring: true,
        recurringRule: { type: 'daily' },
        date: '2026-07-08',
        subtasks: [{ title: '旧兼容子任务' }]
    });

    const instance = await LifeOS.Task._generateRecurringTaskInstance(source, '2026-07-09');
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(instance, 'subtasks'),
        false,
        '返回的循环副本不应保留subtasks数组'
    );

    const stored = await LifeOS.Database.get('tasks', instance.id);
    assert.strictEqual(
        Object.prototype.hasOwnProperty.call(stored, 'subtasks'),
        false,
        '数据库中的循环副本不应保留subtasks数组'
    );

    console.log('PASS testRecurringInstanceOmitsNestedSubtasks');
}

async function testCreateTasksFromPlan() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const plan = [
        {
            title: '任务A',
            description: '描述A',
            deadline: '2025-07-15',
            subtasks: [
                { title: '子任务A1', note: '备注1' },
                { title: '子任务A2' }
            ]
        },
        {
            title: '任务B',
            subtasks: []
        }
    ];

    const created = await LifeOS.Task.createTasksFromPlan(plan);
    assert.strictEqual(created.length, 2, '应创建2个亲任务');

    const tree = await LifeOS.Task.getTaskTree(created[0].id);
    assert.strictEqual(tree.subtasks.length, 2, '任务A应有2个子任务');
    assert.strictEqual(tree.subtasks[0].title, '子任务A1', '子任务标题正确');
    assert.strictEqual(tree.subtasks[0].note, '备注1', '子任务备注正确');

    console.log('PASS testCreateTasksFromPlan');
}

async function testParseJSONSafe() {
    const LifeOS = loadLifeOS();

    assert.strictEqual(JSON.stringify(LifeOS.Utils.parseJSONSafe('[1,2,3]')), JSON.stringify([1, 2, 3]));
    assert.strictEqual(JSON.stringify(LifeOS.Utils.parseJSONSafe('```json\n[1,2,3]\n```')), JSON.stringify([1, 2, 3]));
    assert.strictEqual(JSON.stringify(LifeOS.Utils.parseJSONSafe('Here is result: [1,2,3]')), JSON.stringify([1, 2, 3]));
    assert.strictEqual(LifeOS.Utils.parseJSONSafe('not json', 'fallback'), 'fallback');
    assert.strictEqual(LifeOS.Utils.parseJSONSafe(null, 'fallback'), 'fallback');

    console.log('PASS testParseJSONSafe');
}

// ============ 运行所有测试 ============
const tests = [
    testSubtaskCRUD,
    testSubtaskQuadrantInheritance,
    testDeleteParentCascadesSubtasks,
    testCompletionRateExcludesSubtasks,
    testToggleSubtaskCompleteCreatesTimeline,
    testRecurringTaskSubtaskCopy,
    testRecurringInstanceOmitsNestedSubtasks,
    testCreateTasksFromPlan,
    testParseJSONSafe
];

(async () => {
    for (const test of tests) {
        await test();
    }
    console.log('\n========================================');
    console.log('所有 ' + tests.length + ' 个子任务专项测试通过');
    console.log('========================================');
})().catch((error) => {
    console.error('\nFAIL: ' + error.message);
    console.error(error.stack);
    process.exit(1);
});
