const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

class ObjectStoreNames extends Array {
    contains(name) {
        return this.includes(name);
    }
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

function loadLifeOS(fetchImpl) {
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
        document: { createElement: () => ({ click() {} }) },
        setTimeout,
        clearTimeout,
        AbortController: global.AbortController,
        structuredClone: global.structuredClone,
        fetch: fetchImpl || function() {
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
    return context.window.LifeOS;
}

async function testRecurringEventsDoNotAppearBeforeStartDate() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    await LifeOS.Timeline.create({
        title: 'Daily focus',
        startTime: '09:00',
        endTime: '10:00',
        type: 'planned',
        date: '2026-07-08',
        category: 'learning',
        repeatRule: { type: 'daily' },
        repeatEndDate: '2026-07-10'
    });

    const beforeStart = await LifeOS.Timeline.getByDate('2026-07-07');
    const startDate = await LifeOS.Timeline.getByDate('2026-07-08');
    const nextDate = await LifeOS.Timeline.getByDate('2026-07-09');
    const afterEnd = await LifeOS.Timeline.getByDate('2026-07-11');

    assert.strictEqual(beforeStart.length, 0, 'recurring event must not appear before its start date');
    assert.strictEqual(startDate.length, 1, 'original recurring event should appear on its start date');
    assert.strictEqual(startDate[0]._isRecurringInstance, undefined, 'start date should use the original event');
    assert.strictEqual(nextDate.length, 1, 'recurring event should expand on matching dates after start');
    assert.strictEqual(nextDate[0]._isRecurringInstance, true, 'expanded date should be marked as a recurring instance');
    assert.strictEqual(afterEnd.length, 0, 'recurring event must not appear after repeatEndDate');
}

async function testUpdatingRecurringEventToNonRecurringClearsRecurringFlag() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const event = await LifeOS.Timeline.create({
        title: 'Weekly focus',
        startTime: '09:00',
        endTime: '10:00',
        type: 'planned',
        date: '2026-07-08',
        category: 'learning',
        repeatRule: { type: 'daily' }
    });

    await LifeOS.Timeline.update(event.id, { repeatRule: null, repeatEndDate: null });
    const stored = (await LifeOS.Timeline.getAll())[0];
    const future = await LifeOS.Timeline.getByDate('2026-07-09');

    assert.strictEqual(stored.isRecurring, false, 'isRecurring should track the updated repeatRule');
    assert.strictEqual(future.length, 0, 'event should stop expanding after repeatRule is removed');
}

async function testHabitStreakSkipsFutureRecordsAndStopsAtMissedToday() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const habit = await LifeOS.Habit.create({ name: 'Read' });
    const today = LifeOS.Utils.formatDate();
    const yesterday = LifeOS.Utils.formatDate(new Date(Date.now() - 86400000));
    const tomorrow = LifeOS.Utils.formatDate(new Date(Date.now() + 86400000));

    await LifeOS.Habit.checkIn(habit.id, yesterday, { completed: true });
    await LifeOS.Habit.checkIn(habit.id, today, { completed: false });
    await LifeOS.Habit.checkIn(habit.id, tomorrow, { completed: true });

    const streak = await LifeOS.Habit.getStreak(habit.id);

    assert.strictEqual(streak, 0, 'an explicit missed record today should break the current streak');
}

async function testRecurringInstanceIdIsDeterministic() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const source = await LifeOS.Task.create({
        title: '日语学习',
        deadline: '2027-07-01',
        date: '2026-07-09',
        isRecurring: true,
        recurringRule: { type: 'daily' }
    });

    // 模拟两台设备各自为同一源实例补同一天副本：应收敛为同一 ID（upsert 合并），而非两条
    const copyA = await LifeOS.Task._generateRecurringTaskInstance(source, '2026-07-21');
    const copyB = await LifeOS.Task._generateRecurringTaskInstance(source, '2026-07-21');

    assert.strictEqual(copyA.id, copyB.id, 'same source + same date should produce deterministic id');
    assert.strictEqual(copyA.id, `${source.id}_2026-07-21`);

    const sameDay = await LifeOS.Task.getByDate('2026-07-21');
    const copies = sameDay.filter(t => t.title === '日语学习' && !t.isSubtask);
    assert.strictEqual(copies.length, 1, 'cross-device generation must converge to a single record');

    // 不同日期仍生成不同实例
    const nextDay = await LifeOS.Task._generateRecurringTaskInstance(source, '2026-07-22');
    assert.notStrictEqual(nextDay.id, copyA.id);
}

async function testRecurringTaskUndoRemovesGeneratedNextTask() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const today = LifeOS.Utils.formatDate();
    const tomorrow = LifeOS.Utils.formatDate(new Date(Date.now() + 86400000));

    const task = await LifeOS.Task.create({
        title: 'Daily language study',
        deadline: tomorrow,
        date: today,
        isRecurring: true,
        recurringRule: { type: 'daily' }
    });

    const completed = await LifeOS.Task.toggleComplete(task.id);
    const afterComplete = await LifeOS.Task.getAll();
    const generatedNext = afterComplete.find(t => t.date === tomorrow && t.generatedFromTaskId === task.id);

    assert.strictEqual(completed.completed, true, 'task should become completed');
    assert.ok(generatedNext, 'completing a recurring task should create the next instance');
    assert.strictEqual(generatedNext.completed, false, 'generated next instance should be pending');

    const undone = await LifeOS.Task.toggleComplete(task.id);
    const afterUndo = await LifeOS.Task.getAll();

    assert.strictEqual(undone.completed, false, 'task should become pending after undo');
    assert.strictEqual(afterUndo.some(t => t.generatedFromTaskId === task.id), false, 'undo should remove the generated next instance');
}

async function testReviewUpdatePreservesCreatedAt() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const first = await LifeOS.Review.save('2026-07-08', { did: 'first save' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const second = await LifeOS.Review.save('2026-07-08', { did: 'second save' });

    assert.strictEqual(second.createdAt, first.createdAt, 'review createdAt should remain stable across updates');
    assert.notStrictEqual(second.updatedAt, first.updatedAt, 'review updatedAt should change across updates');
}

async function testAIClientSendsOpenAICompatibleChatRequest() {
    const calls = [];
    const LifeOS = loadLifeOS((url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve(JSON.stringify({
                id: 'chatcmpl-test',
                model: 'test-model',
                choices: [{ message: { role: 'assistant', content: 'pong' } }],
                usage: { total_tokens: 7 }
            }))
        });
    });
    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('apiBaseUrl', 'https://api.example.test/v1/');
    await LifeOS.Settings.set('apiKey', 'test-key');
    await LifeOS.Settings.set('apiModel', 'test-model');

    const text = await LifeOS.AIClient.complete('Ping', {
        retries: 0,
        temperature: 0.2,
        maxTokens: 12,
        proxyUrl: '' // 强制直连：本用例断言直连 endpoint 的请求格式（代理路径由 settings 覆盖语义测试）
    });
    const history = await LifeOS.Settings.get('apiHistory', []);

    assert.strictEqual(text, 'pong', 'AIClient.complete should return assistant text');
    assert.strictEqual(calls.length, 1, 'AIClient should send exactly one request');
    assert.strictEqual(calls[0].url, 'https://api.example.test/v1/chat/completions');
    assert.strictEqual(calls[0].options.method, 'POST');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer test-key');
    assert.strictEqual(calls[0].body.model, 'test-model');
    assert.deepStrictEqual(calls[0].body.messages, [{ role: 'user', content: 'Ping' }]);
    assert.strictEqual(calls[0].body.max_tokens, 12);
    assert.strictEqual(calls[0].body.temperature, 0.2);
    assert.strictEqual(history.length, 1, 'AIClient should record API history');
    assert.strictEqual(history[0].success, true);
    assert.strictEqual(history[0].tokens, 7);
}

async function testAIClientRetriesRetryableFailures() {
    let callCount = 0;
    const LifeOS = loadLifeOS(() => {
        callCount += 1;
        if (callCount === 1) {
            return Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Server Error',
                text: () => Promise.resolve(JSON.stringify({ error: { message: 'temporary outage' } }))
            });
        }
        return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: 'recovered' } }]
            }))
        });
    });
    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('apiBaseUrl', 'https://api.example.test/v1');
    await LifeOS.Settings.set('apiKey', 'test-key');
    await LifeOS.Settings.set('apiModel', 'test-model');

    const response = await LifeOS.AIClient.chat({
        prompt: 'Retry once',
        retries: 1,
        retryDelayMs: 1
    });
    const history = await LifeOS.Settings.get('apiHistory', []);

    assert.strictEqual(callCount, 2, 'AIClient should retry one retryable failure');
    assert.strictEqual(LifeOS.AIClient.extractText(response), 'recovered');
    assert.strictEqual(history.length, 1, 'AIClient should record the final successful call once');
    assert.strictEqual(history[0].success, true);
    assert.strictEqual(history[0].attempts, 2);
}

async function testAIClientRoutesViaConfiguredProxy() {
    const calls = [];
    const LifeOS = loadLifeOS((url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return Promise.resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            text: () => Promise.resolve(JSON.stringify({
                choices: [{ message: { role: 'assistant', content: 'proxied' } }]
            }))
        });
    });
    await LifeOS.Database.init();
    await LifeOS.Database.reset();
    await LifeOS.Settings.set('apiBaseUrl', 'https://api.example.test/v1');
    await LifeOS.Settings.set('apiKey', 'test-key');
    await LifeOS.Settings.set('apiModel', 'test-model');
    await LifeOS.Settings.set('aiProxyUrl', 'https://proxy.example.test/ai');

    const text = await LifeOS.AIClient.complete('Ping', { retries: 0 });

    assert.strictEqual(text, 'proxied');
    assert.strictEqual(calls.length, 1, 'should send exactly one request');
    assert.strictEqual(calls[0].url, 'https://proxy.example.test/ai', 'request should go to proxy URL');
    assert.strictEqual(calls[0].options.headers.Authorization, undefined, 'proxy path must not leak Authorization header');
    assert.strictEqual(calls[0].body.endpoint, 'https://api.example.test/v1/chat/completions', 'proxy body carries upstream endpoint');
    assert.strictEqual(calls[0].body.apiKey, 'test-key', 'proxy body carries apiKey');
    assert.strictEqual(calls[0].body.payload.model, 'test-model', 'proxy body carries chat payload');

    // 置空 aiProxyUrl（空字符串）= 强制直连
    calls.length = 0;
    await LifeOS.Settings.set('aiProxyUrl', '');
    await LifeOS.AIClient.complete('Ping', { retries: 0 });
    assert.strictEqual(calls[0].url, 'https://api.example.test/v1/chat/completions', 'empty aiProxyUrl forces direct connection');
    assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer test-key');
}

async function testAIClientRequiresConfiguration() {
    const LifeOS = loadLifeOS(() => {
        throw new Error('fetch should not be called without config');
    });
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    await assert.rejects(
        () => LifeOS.AIClient.chat({ prompt: 'No config' }),
        (error) => error.code === 'AI_CONFIG_MISSING',
        'AIClient should fail before fetch when config is missing'
    );
}

async function testTaskCompletionSyncsTimelineEvents() {
    const LifeOS = loadLifeOS();
    await LifeOS.Database.init();
    await LifeOS.Database.reset();

    const today = LifeOS.Utils.formatDate();
    const task = await LifeOS.Task.create({ title: '写报告', date: today, deadline: today, priority: 7 });
    // 模拟拖拽排期产生的关联事件
    const evt = await LifeOS.Timeline.create({ title: '写报告', startTime: '09:00', endTime: '10:00', type: 'planned', date: today, taskId: task.id });
    assert.strictEqual(evt.completed, false, '新事件默认未完成');

    // 任务完成 → 关联事件 completed=true
    await LifeOS.Task.toggleComplete(task.id);
    let updated = await LifeOS.Database.get('timeline', evt.id);
    assert.strictEqual(updated.completed, true, '任务完成后关联事件标记完成');

    // 撤回完成 → 还原
    await LifeOS.Task.toggleComplete(task.id);
    updated = await LifeOS.Database.get('timeline', evt.id);
    assert.strictEqual(updated.completed, false, '撤回完成后关联事件还原');

    // 无关联事件的任务不报错
    const lone = await LifeOS.Task.create({ title: '无排期任务', date: today, deadline: today, priority: 5 });
    await LifeOS.Task.toggleComplete(lone.id);
    assert.strictEqual((await LifeOS.Database.get('tasks', lone.id)).completed, true);
}

const tests = [
    testRecurringEventsDoNotAppearBeforeStartDate,
    testUpdatingRecurringEventToNonRecurringClearsRecurringFlag,
    testHabitStreakSkipsFutureRecordsAndStopsAtMissedToday,
    testRecurringInstanceIdIsDeterministic,
    testRecurringTaskUndoRemovesGeneratedNextTask,
    testReviewUpdatePreservesCreatedAt,
    testTaskCompletionSyncsTimelineEvents,
    testAIClientSendsOpenAICompatibleChatRequest,
    testAIClientRetriesRetryableFailures,
    testAIClientRoutesViaConfiguredProxy,
    testAIClientRequiresConfiguration
];

(async () => {
    for (const test of tests) {
        await test();
        console.log(`PASS ${test.name}`);
    }
})().catch((error) => {
    console.error(`FAIL ${error.message}`);
    console.error(error.stack);
    process.exit(1);
});
