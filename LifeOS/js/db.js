/**
 * LifeOS IndexedDB 数据库封装
 */
class Database {
    constructor() {
        this.dbName = 'LifeOSDB';
        this.version = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB 初始化成功，版本:', this.version);
                resolve(this.db);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                console.log('IndexedDB 升级中，旧版本:', event.oldVersion, '→ 新版本:', this.version);

                if (!db.objectStoreNames.contains('timeline')) {
                    const t = db.createObjectStore('timeline', { keyPath: 'id' });
                    t.createIndex('date', 'date', { unique: false });
                    t.createIndex('type', 'type', { unique: false });
                    t.createIndex('taskId', 'taskId', { unique: false });
                }
                if (!db.objectStoreNames.contains('tasks')) {
                    const t = db.createObjectStore('tasks', { keyPath: 'id' });
                    t.createIndex('quadrant', 'quadrant', { unique: false });
                    t.createIndex('completed', 'completed', { unique: false });
                    t.createIndex('deadline', 'deadline', { unique: false });
                    t.createIndex('isRecurring', 'isRecurring', { unique: false });
                }
                if (!db.objectStoreNames.contains('habits')) {
                    const t = db.createObjectStore('habits', { keyPath: 'id' });
                    t.createIndex('category', 'category', { unique: false });
                }
                if (!db.objectStoreNames.contains('habitRecords')) {
                    const t = db.createObjectStore('habitRecords', { keyPath: 'id' });
                    t.createIndex('habitId', 'habitId', { unique: false });
                    t.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('reviews')) {
                    db.createObjectStore('reviews', { keyPath: 'date' });
                }
                if (!db.objectStoreNames.contains('skills')) {
                    const t = db.createObjectStore('skills', { keyPath: 'id' });
                    t.createIndex('parentId', 'parentId', { unique: false });
                }
                if (!db.objectStoreNames.contains('notes')) {
                    const t = db.createObjectStore('notes', { keyPath: 'id' });
                    t.createIndex('skillId', 'skillId', { unique: false });
                    t.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('characters')) {
                    const t = db.createObjectStore('characters', { keyPath: 'id' });
                    t.createIndex('series', 'series', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('moments')) {
                    const t = db.createObjectStore('moments', { keyPath: 'id' });
                    t.createIndex('date', 'date', { unique: false });
                    t.createIndex('hashtag', 'hashtag', { unique: false, multiEntry: true });
                }
            };
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readwrite');
            const store = tx.objectStore(storeName);
            const req = store.delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getByIndex(storeName, indexName, value, range = 'only') {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([storeName], 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            let req;
            if (range === 'only') req = index.getAll(value);
            else if (range === 'all') req = index.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async getSetting(key, defaultValue = null) {
        const result = await this.get('settings', key);
        return result ? result.value : defaultValue;
    }

    async setSetting(key, value) {
        return this.put('settings', { key, value });
    }
}

const db = new Database();
export default db;
