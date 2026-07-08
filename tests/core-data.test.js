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

function loadLifeOS() {
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
        structuredClone: global.structuredClone
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

const tests = [
    testRecurringEventsDoNotAppearBeforeStartDate,
    testUpdatingRecurringEventToNonRecurringClearsRecurringFlag,
    testHabitStreakSkipsFutureRecordsAndStopsAtMissedToday,
    testReviewUpdatePreservesCreatedAt
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
