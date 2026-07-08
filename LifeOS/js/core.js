/**
 * ============================================================
 * Life OS — 全局数据管理器 (core.js)
 * ============================================================
 * 为什么用 IIFE + 全局变量？
 * 在 file:// 协议下（双击 HTML 打开），浏览器安全策略禁止
 * ES Module 的 `import './local-file.js'` 操作。
 * 通过 <script src="js/core.js"> 引入，代码在全局作用域执行，
 * 通过 window.LifeOS 暴露 API，所有页面均可通过 LifeOS.xxx 访问。
 * 等后续部署到服务器时，可无缝迁移为 ES Module 系统。
 * ============================================================
 */

(function() {
    'use strict';

    // ============================================================
    // 0. 工具函数 (Utils)
    // ============================================================
    const Utils = {
        generateId() {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                return crypto.randomUUID();
            }
            return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        },

        formatDate(date = new Date()) {
            const d = date instanceof Date ? date : new Date(date);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        },

        formatTime(date = new Date()) {
            const d = date instanceof Date ? date : new Date(date);
            const h = String(d.getHours()).padStart(2, '0');
            const min = String(d.getMinutes()).padStart(2, '0');
            return `${h}:${min}`;
        },

        now() {
            return new Date().toISOString();
        },

        daysBetween(date1, date2) {
            const d1 = new Date(date1).setHours(0, 0, 0, 0);
            const d2 = new Date(date2).setHours(0, 0, 0, 0);
            return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        },

        debounce(func, wait = 300) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        deepClone(obj) {
            if (typeof structuredClone === 'function') {
                return structuredClone(obj);
            }
            return JSON.parse(JSON.stringify(obj));
        },

        fileToBase64(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        },

        compressImage(base64, maxWidth = 1200, quality = 0.7) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let w = img.width, h = img.height;
                    if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
                    canvas.width = w; canvas.height = h;
                    ctx.drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                };
                img.onerror = reject;
                img.src = base64;
            });
        },

        calculateQuadrant(deadline, priority = 5) {
            const daysUntil = this.daysBetween(new Date(), new Date(deadline));
            let urgency;
            if (daysUntil <= 1) urgency = 1.0;
            else if (daysUntil <= 3) urgency = 0.8;
            else if (daysUntil <= 7) urgency = 0.6;
            else if (daysUntil <= 14) urgency = 0.4;
            else urgency = 0.2;
            const importance = priority / 10;
            if (importance >= 0.7 && urgency >= 0.7) return 'urgent-important';
            if (importance >= 0.7 && urgency < 0.7) return 'important-not-urgent';
            if (importance < 0.7 && urgency >= 0.7) return 'urgent-not-important';
            return 'not-urgent-not-important';
        },

        getQuadrantInfo(quadrant) {
            const map = {
                'urgent-important': { label: '重要·紧急', color: 'var(--color-urgent)', icon: '🔴' },
                'important-not-urgent': { label: '重要·不紧急', color: 'var(--color-important)', icon: '🔵' },
                'urgent-not-important': { label: '紧急·不重要', color: 'var(--color-warning)', icon: '🟡' },
                'not-urgent-not-important': { label: '不重要·不紧急', color: 'var(--text-muted)', icon: '⚪' }
            };
            return map[quadrant] || map['not-urgent-not-important'];
        },

        markdownToHtml(markdown) {
            if (!markdown) return '';
            return markdown
                .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/gim, '<em>$1</em>')
                .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>')
                .replace(/^```\n?([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
                .replace(/^(\-|\*) (.*$)/gim, '<li>$2</li>')
                .replace(/(<li>.*<\/li>\n?)+/gim, '<ul>$&</ul>')
                .replace(/\n/gim, '<br>');
        }
    };

    // ============================================================
    // 1. 数据库核心 (Database)
    // ============================================================
    class Database {
        constructor() {
            this.dbName = 'LifeOSDB';
            this.version = 1;
            this.db = null;
            this._initPromise = null;
        }

        /**
         * 初始化数据库（幂等：多次调用返回同一 Promise）
         * 为什么用 Promise 缓存？防止页面初始化时多次调用 open 导致竞争。
         */
        init() {
            if (this._initPromise) return this._initPromise;
            
            this._initPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(this.dbName, this.version);

                request.onerror = () => {
                    console.error('[LifeOS] IndexedDB 打开失败:', request.error);
                    reject(request.error);
                };

                request.onsuccess = () => {
                    this.db = request.result;
                    console.log('[LifeOS] IndexedDB 初始化成功，版本:', this.version);
                    resolve(this.db);
                };

                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    console.log('[LifeOS] IndexedDB 升级: v' + event.oldVersion + ' → v' + this.version);
                    this._createStores(db);
                };
            });

            return this._initPromise;
        }

        _createStores(db) {
            // timeline: 时间轴事件
            if (!db.objectStoreNames.contains('timeline')) {
                const s = db.createObjectStore('timeline', { keyPath: 'id' });
                s.createIndex('date', 'date', { unique: false });
                s.createIndex('type', 'type', { unique: false }); // 'planned' | 'actual'
                s.createIndex('taskId', 'taskId', { unique: false });
            }
            // tasks: 任务
            if (!db.objectStoreNames.contains('tasks')) {
                const s = db.createObjectStore('tasks', { keyPath: 'id' });
                s.createIndex('quadrant', 'quadrant', { unique: false });
                s.createIndex('completed', 'completed', { unique: false });
                s.createIndex('deadline', 'deadline', { unique: false });
                s.createIndex('isRecurring', 'isRecurring', { unique: false });
                s.createIndex('date', 'date', { unique: false });
            }
            // habits: 习惯
            if (!db.objectStoreNames.contains('habits')) {
                const s = db.createObjectStore('habits', { keyPath: 'id' });
                s.createIndex('category', 'category', { unique: false });
            }
            // habitRecords: 习惯打卡记录
            if (!db.objectStoreNames.contains('habitRecords')) {
                const s = db.createObjectStore('habitRecords', { keyPath: 'id' });
                s.createIndex('habitId', 'habitId', { unique: false });
                s.createIndex('date', 'date', { unique: false });
            }
            // reviews: 每日回顾
            if (!db.objectStoreNames.contains('reviews')) {
                db.createObjectStore('reviews', { keyPath: 'date' });
            }
            // skills: 学习技能树
            if (!db.objectStoreNames.contains('skills')) {
                const s = db.createObjectStore('skills', { keyPath: 'id' });
                s.createIndex('parentId', 'parentId', { unique: false });
            }
            // notes: 学习笔记
            if (!db.objectStoreNames.contains('notes')) {
                const s = db.createObjectStore('notes', { keyPath: 'id' });
                s.createIndex('skillId', 'skillId', { unique: false });
                s.createIndex('date', 'date', { unique: false });
            }
            // characters: 角色库
            if (!db.objectStoreNames.contains('characters')) {
                const s = db.createObjectStore('characters', { keyPath: 'id' });
                s.createIndex('series', 'series', { unique: false });
            }
            // settings: 设置
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
            // moments: 特殊事件
            if (!db.objectStoreNames.contains('moments')) {
                const s = db.createObjectStore('moments', { keyPath: 'id' });
                s.createIndex('date', 'date', { unique: false });
                s.createIndex('hashtag', 'hashtag', { unique: false, multiEntry: true });
            }
        }

        // ---- 通用 CRUD ----
        async put(storeName, data) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.put(data);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async get(storeName, id) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async delete(storeName, id) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readwrite');
                const store = tx.objectStore(storeName);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        }

        async getAll(storeName) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async getByIndex(storeName, indexName, value) {
            await this.init();
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction([storeName], 'readonly');
                const store = tx.objectStore(storeName);
                const index = store.index(indexName);
                const req = index.getAll(value);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }

        async getSetting(key, defaultValue = null) {
            const result = await this.get('settings', key);
            return result ? result.value : defaultValue;
        }

        async setSetting(key, value) {
            return this.put('settings', { key, value, updatedAt: Utils.now() });
        }

        // ---- 重置数据库：清空所有数据，保留结构 ----
        async reset() {
            await this.init();
            const stores = Array.from(this.db.objectStoreNames);
            for (const name of stores) {
                await new Promise((resolve, reject) => {
                    const tx = this.db.transaction([name], 'readwrite');
                    const store = tx.objectStore(name);
                    const req = store.clear();
                    req.onsuccess = () => resolve();
                    req.onerror = () => reject(req.error);
                });
            }
            console.log('[LifeOS] 数据库已重置');
        }

        // ---- 获取所有数据（用于导出）----
        async exportAll() {
            await this.init();
            const stores = Array.from(this.db.objectStoreNames);
            const result = { _meta: { version: this.version, exportedAt: Utils.now(), app: 'LifeOS' } };
            for (const name of stores) {
                result[name] = await this.getAll(name);
            }
            return result;
        }

        // ---- 导入数据（支持覆盖/合并策略）----
        async importAll(data, strategy = 'merge') {
            await this.init();
            // strategy: 'overwrite' = 删除全部再写入; 'merge' = 保留现有，只添加新ID
            const stores = Array.from(this.db.objectStoreNames);
            for (const name of stores) {
                if (!data[name]) continue;
                if (strategy === 'overwrite') {
                    // 清空
                    const all = await this.getAll(name);
                    for (const item of all) {
                        await this.delete(name, item.id || item.date || item.key);
                    }
                }
                for (const item of data[name]) {
                    try {
                        await this.put(name, item);
                    } catch (e) {
                        console.warn('[LifeOS] 导入失败项:', name, item, e.message);
                    }
                }
            }
            return true;
        }
    }

    const db = new Database();

    // ============================================================
    // 2. 各模块 DAO 层
    // 为什么用 DAO 层？业务逻辑与数据库操作分离，上层只需调用 save/load/query。
    // ============================================================

    const TimelineStore = {
        async create(event) {
            const data = {
                id: Utils.generateId(),
                title: event.title || '',
                description: event.description || '',
                startTime: event.startTime,
                endTime: event.endTime,
                type: event.type || 'planned',
                date: event.date || Utils.formatDate(),
                category: event.category || '',
                taskId: event.taskId || null,
                images: event.images || [],
                repeatRule: event.repeatRule || null,      // { type: 'daily'|'weekly'|'monthly', days?: [0-6], dayOfMonth?: 1-31 }
                repeatEndDate: event.repeatEndDate || null,
                isRecurring: !!event.repeatRule,
                createdAt: Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('timeline', data);
            return data;
        },
        async update(id, updates) {
            const existing = await db.get('timeline', id);
            if (!existing) return null;
            const data = { ...existing, ...updates, updatedAt: Utils.now() };
            if (Object.prototype.hasOwnProperty.call(updates, 'repeatRule')) {
                data.isRecurring = !!updates.repeatRule;
            }
            await db.put('timeline', data);
            return data;
        },
        async delete(id) { return db.delete('timeline', id); },
        async getByDate(date) {
            // 1. 获取该日期的直接事件
            const directEvents = await db.getByIndex('timeline', 'date', date);
            // 2. 获取所有重复事件，检查是否匹配目标日期
            const allEvents = await db.getAll('timeline');
            const recurringEvents = allEvents.filter(e => e.isRecurring && e.repeatRule);
            const targetDate = new Date(date + 'T00:00:00');
            const targetDay = targetDate.getDay(); // 0=周日
            const targetDateNum = targetDate.getDate();
            
            for (const evt of recurringEvents) {
                // 跳过开始日期之前的日期，避免循环事件向过去反向展开
                if (date < evt.date) continue;
                // 跳过已过期的事件
                if (evt.repeatEndDate && date > evt.repeatEndDate) continue;
                // 跳过原始日期（已作为直接事件存在）
                if (evt.date === date) continue;
                
                let match = false;
                const rule = evt.repeatRule;
                if (rule.type === 'daily') {
                    match = true;
                } else if (rule.type === 'weekly' && rule.days) {
                    match = rule.days.includes(targetDay);
                } else if (rule.type === 'monthly' && rule.dayOfMonth) {
                    match = targetDateNum === rule.dayOfMonth;
                }
                
                if (match) {
                    // 生成虚拟实例（标记为重复展开）
                    directEvents.push({
                        ...evt,
                        _isRecurringInstance: true,
                        _instanceDate: date,
                        id: evt.id + '_' + date  // 虚拟 ID
                    });
                }
            }
            return directEvents;
        },
        async getAll() { return db.getAll('timeline'); }
    };

    const TaskStore = {
        async create(task) {
            const data = {
                id: Utils.generateId(),
                title: task.title || '未命名任务',
                description: task.description || '',
                priority: task.priority || 5,
                deadline: task.deadline || null,
                quadrant: task.quadrant || Utils.calculateQuadrant(task.deadline, task.priority),
                completed: task.completed || false,
                completedAt: task.completedAt || null,
                isRecurring: task.isRecurring || false,
                recurringRule: task.recurringRule || null,
                category: task.category || '',
                images: task.images || [],
                subtasks: task.subtasks || [],
                date: task.date || Utils.formatDate(),
                createdAt: Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('tasks', data);
            return data;
        },
        async update(id, updates) {
            const existing = await db.get('tasks', id);
            if (!existing) return null;
            const data = { ...existing, ...updates, updatedAt: Utils.now() };
            // 只有当用户没有明确提供象限时才自动计算
            if (updates.quadrant === undefined && (updates.deadline !== undefined || updates.priority !== undefined)) {
                data.quadrant = Utils.calculateQuadrant(data.deadline, data.priority);
            }
            await db.put('tasks', data);
            return data;
        },
        async toggleComplete(id) {
            const task = await db.get('tasks', id);
            if (!task) return null;
            task.completed = !task.completed;
            task.completedAt = task.completed ? Utils.now() : null;
            task.updatedAt = Utils.now();
            await db.put('tasks', task);
            // 如果是循环任务且完成，创建明天的副本
            if (task.completed && task.isRecurring && task.recurringRule) {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowStr = Utils.formatDate(tomorrow);
                // 检查明天是否已有该任务
                const existing = await db.getByIndex('tasks', 'date', tomorrowStr);
                const sameTaskExists = existing.some(t => t.title === task.title && t.isRecurring);
                if (!sameTaskExists) {
                    const newTask = {
                        ...task,
                        id: Utils.generateId(),
                        date: tomorrowStr,
                        completed: false,
                        completedAt: null,
                        createdAt: Utils.now(),
                        updatedAt: Utils.now()
                    };
                    delete newTask.completedAt;
                    await db.put('tasks', newTask);
                }
            }
            return task;
        },
        async delete(id) { return db.delete('tasks', id); },
        async getByQuadrant(quadrant) { return db.getByIndex('tasks', 'quadrant', quadrant); },
        async getByDate(date) { return db.getByIndex('tasks', 'date', date); },
        async getAll() { return db.getAll('tasks'); },
        async getTodayTasks() { return this.getByDate(Utils.formatDate()); },
        async getCompletionRate() {
            const today = await this.getTodayTasks();
            if (!today.length) return 0;
            return Math.round((today.filter(t => t.completed).length / today.length) * 100);
        }
    };

    const HabitStore = {
        async create(habit) {
            const data = {
                id: Utils.generateId(),
                name: habit.name || '新习惯',
                category: habit.category || 'general',
                icon: habit.icon || '✅',
                targetFrequency: habit.targetFrequency || 'daily', // 'daily' | 'weekly' | number
                color: habit.color || '#34D399',
                createdAt: Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('habits', data);
            return data;
        },
        async update(id, updates) {
            const existing = await db.get('habits', id);
            if (!existing) return null;
            const data = { ...existing, ...updates, updatedAt: Utils.now() };
            await db.put('habits', data);
            return data;
        },
        async delete(id) { return db.delete('habits', id); },
        async getAll() { return db.getAll('habits'); },

        // 打卡记录
        async checkIn(habitId, date, record = {}) {
            const id = `${habitId}_${date}`;
            const data = {
                id, habitId, date,
                completed: record.completed !== false,
                value: record.value || 1, // 完成数量（如喝水 8 杯）
                note: record.note || '',
                images: record.images || [],
                createdAt: Utils.now()
            };
            await db.put('habitRecords', data);
            return data;
        },
        async getRecord(habitId, date) {
            return db.get('habitRecords', `${habitId}_${date}`);
        },
        async getRecordsByHabit(habitId) { return db.getByIndex('habitRecords', 'habitId', habitId); },
        async getRecordsByDate(date) { return db.getByIndex('habitRecords', 'date', date); },

        // 计算连续打卡天数
        async getStreak(habitId) {
            const records = await this.getRecordsByHabit(habitId);
            if (!records.length) return 0;
            let streak = 0;
            const today = Utils.formatDate();
            const yesterday = Utils.formatDate(new Date(Date.now() - 86400000));
            const recordsByDate = new Map(
                records
                    .filter(r => r.date <= today)
                    .sort((a, b) => b.date.localeCompare(a.date))
                    .map(r => [r.date, r])
            );
            const todayRecord = recordsByDate.get(today);
            if (todayRecord && !todayRecord.completed) return 0;
            // 如果今天没打卡，从昨天开始算
            let checkDate = todayRecord && todayRecord.completed ? today : yesterday;
            while (recordsByDate.has(checkDate)) {
                const record = recordsByDate.get(checkDate);
                if (record.completed) {
                    streak++;
                    checkDate = Utils.formatDate(new Date(new Date(checkDate).getTime() - 86400000));
                } else {
                    break;
                }
            }
            return streak;
        }
    };

    const ReviewStore = {
        async get(date) {
            return db.get('reviews', date);
        },
        async save(date, content) {
            const existing = await db.get('reviews', date);
            const data = {
                date,
                did: content.did || '',
                good: content.good || '',
                bad: content.bad || '',
                thoughts: content.thoughts || '',
                emotion: content.emotion || '',
                emotionReason: content.emotionReason || '',
                diary: content.diary || '',
                moments: content.moments || [],
                aiAnalysis: content.aiAnalysis || null,
                createdAt: existing?.createdAt || content.createdAt || Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('reviews', data);
            return data;
        },
        async getAll() { return db.getAll('reviews'); }
    };

    const SkillStore = {
        async create(skill) {
            const data = {
                id: Utils.generateId(),
                name: skill.name || '新技能',
                description: skill.description || '',
                parentId: skill.parentId || null,
                xp: skill.xp || 0,
                level: skill.level || 1,
                xpToNext: skill.xpToNext || 100,
                isShortTerm: skill.isShortTerm || false, // 短期目标
                isLongTerm: skill.isLongTerm || false,   // 长期目标
                deadline: skill.deadline || null,
                color: skill.color || '#7DD3FC',
                createdAt: Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('skills', data);
            return data;
        },
        async update(id, updates) {
            const existing = await db.get('skills', id);
            if (!existing) return null;
            const data = { ...existing, ...updates, updatedAt: Utils.now() };
            await db.put('skills', data);
            return data;
        },
        async delete(id) { return db.delete('skills', id); },
        async getAll() { return db.getAll('skills'); },
        async getChildren(parentId) { return db.getByIndex('skills', 'parentId', parentId); },
        async addXP(id, amount) {
            const skill = await db.get('skills', id);
            if (!skill) return null;
            skill.xp += amount;
            while (skill.xp >= skill.xpToNext) {
                skill.xp -= skill.xpToNext;
                skill.level++;
                skill.xpToNext = Math.floor(skill.xpToNext * 1.5); // 升级所需递增
            }
            skill.updatedAt = Utils.now();
            await db.put('skills', skill);
            return skill;
        },
        async addNote(note) {
            const data = {
                id: Utils.generateId(),
                skillId: note.skillId,
                title: note.title || '',
                content: note.content || '',
                date: note.date || Utils.formatDate(),
                createdAt: Utils.now()
            };
            await db.put('notes', data);
            return data;
        },
        async getNotesBySkill(skillId) { return db.getByIndex('notes', 'skillId', skillId); }
    };

    const CharacterStore = {
        async create(character) {
            const data = {
                id: Utils.generateId(),
                name: character.name || '未命名角色',
                series: character.series || '', // 作品系列
                jerseyNumber: character.jerseyNumber || '', // 背号
                grade: character.grade || '', // 年级
                position: character.position || '', // 位置
                starter: character.starter || false, // 是否正选
                birthday: character.birthday || '',
                animal: character.animal || '', // 动物塑
                personalityTags: character.personalityTags || [], // 性格标签
                dialogueStyle: character.dialogueStyle || '', // 台词风格
                avatar: character.avatar || '', // base64 头像
                priority: character.priority || 50, // 互动优先级 1-100
                relations: character.relations || [], // 关联角色 ID
                defaultLines: character.defaultLines || { // 默认台词模板
                    encourage: [],
                    goodNight: [],
                    casual: []
                },
                createdAt: Utils.now(),
                updatedAt: Utils.now()
            };
            await db.put('characters', data);
            return data;
        },
        async update(id, updates) {
            const existing = await db.get('characters', id);
            if (!existing) return null;
            const data = { ...existing, ...updates, updatedAt: Utils.now() };
            await db.put('characters', data);
            return data;
        },
        async delete(id) { return db.delete('characters', id); },
        async getAll() { return db.getAll('characters'); },
        async getBySeries(series) { return db.getByIndex('characters', 'series', series); },
        async getByPriority() {
            const all = await this.getAll();
            return all.sort((a, b) => b.priority - a.priority);
        },

        // 预置数据导入：排球少年 / Fate / EVA / 柯南
        async importPresetData() {
            const preset = CharacterStore.PRESET_DATA;
            let count = 0;
            for (const char of preset) {
                const existing = await db.getAll('characters');
                if (existing.find(c => c.name === char.name)) continue; // 避免重复
                await this.create(char);
                count++;
            }
            console.log('[LifeOS] 预置角色导入:', count, '个');
            return count;
        }
    };

    // 预置角色数据（排球少年 + Fate + EVA + 柯南）
    CharacterStore.PRESET_DATA = [
        // === 乌野 ===
        { name: '泽村大地', series: '排球少年', jerseyNumber: '1', grade: '高三', position: 'OP', starter: true, birthday: '12/31', animal: '伯恩山', personalityTags: ['温柔','稳重','可靠'], dialogueStyle: '【伯恩山般温柔的队长，稳重的守护之力】泽村大地是乌野的基石，说话沉稳有力，每一个字都带着队长的分量。他语速不快，但每一句都掷地有声。他对队员的关怀是沉默的——从不多说什么，但总在关键时刻站出来。他对菅原孝支有最深的信赖，两人是乌野的双核。他的台词朴素但充满力量，\'交给我\'、\'没问题\'、\'一起上\'是他的标志。', exampleLines: {"encourage":["交给我。你不需要一个人扛，还有我在。","没关系。就算摔倒了，只要还能站起来，就不算输。","大家一起上吧。乌野的排球，从来不是一个人的战斗。"],"goodNight":["今天也辛苦了。菅原，明天也拜托你了。大家晚安。","好好休息。明天的训练...我期待着大家。晚安。"],"casual":["菅原，你又把影山那小子拉到一边开导了吧？辛苦了。","日向，不要在走廊里跑！会撞到人的！"]} },
        { name: '菅原孝支', series: '排球少年', jerseyNumber: '2', grade: '高三', position: 'S', starter: false, birthday: '06/13', animal: '萨摩耶', personalityTags: ['微笑','白切黑','心细'], dialogueStyle: '【萨摩耶般温暖的微笑二传手，白切黑的细腻观察】菅原的声线温柔得像春日午后，语速不紧不慢，总是带着安抚人心的力量。他习惯用敬语和柔和的语调与人交谈，被后辈称为\'菅原妈妈\'。但他的观察力敏锐得可怕，能一眼看穿队员的心理状态，偶尔在关键时刻露出\'白切黑\'的一面——用温和的语气说出最精准的一针见血。对影山既是竞争者也是引路人，对泽村大地有深深的信赖与默契。', exampleLines: {"encourage":["没关系的，你已经做得很好了。接下来，只要再相信自己一点点就好。","不要让任何人定义你的极限——你的可能性，远比你自己想象的要大。","比赛还没有结束，我们还有时间。深呼吸，然后一起重新来过。"],"goodNight":["今天也谢谢你。好好休息吧，明天的你会更加出色。","大地会看好大家的，所以不用担心。晚安，愿你做个好梦。"],"casual":["啊，影山又在那里一个人较劲了...真是的，让人放不下心。","大地的表情变了呢，是在想战术吗？果然，认真的时候最帅气了。"]} },
        { name: '东峰旭', series: '排球少年', jerseyNumber: '3', grade: '高三', position: 'OH/Ace', starter: true, birthday: '01/01', animal: '', personalityTags: ['温柔','胆小','巨大'], dialogueStyle: '【温柔胆小的王牌主攻手，巨大身躯下的脆弱】东峰旭说话轻柔，带着一丝天然的忧郁，语速慢，声音低。他被\'胆小\'的标签困扰了许久，但西谷夕的呼唤让他重新找回了王牌的骄傲。他习惯用\'那个...\'开头，语气中总是带着歉意，但在扣球的那一瞬间，他会发出最震撼的怒吼。他的温柔是发自内心的，即使被拦网无数次，也只会说\'抱歉...我会再努力的\'。', exampleLines: {"encourage":["那个...我也想，变得更强。哪怕害怕...也想扣下去。","请再传给我一次球。这一次...我不会再逃避了。","不论被拦多少次...只要球还在传过来，我就会扣下去。"],"goodNight":["今天...谢谢你一直传球给我。晚安，明天也请多多关照。","西谷...你也早点休息。晚安。今天真的很帅气。"],"casual":["西谷，你真的很吵...不过，谢谢你一直在我身边。","那个...我、我可以再打一球吗？请传给我。"]} },
        { name: '西谷夕', series: '排球少年', jerseyNumber: '4', grade: '高二', position: 'Li', starter: true, birthday: '10/10', animal: '蜜獾', personalityTags: ['无畏','护卫','凶猛'], dialogueStyle: '【蜜獾般无畏的自由人，凶猛的守护之心】西谷夕的声线高亢而充满爆发力，说话像机关枪一样噼里啪啦。他的口头禅是\'帅气\'——\'只要觉得自己帅气就好了\'是他的人生信条。作为乌野的守护神，他对守护球场的执念近乎疯狂。对东峰旭有深厚的羁绊，是他让王牌重新站回球场的人。他会在关键时刻爆发出最震撼的呐喊，也会在东峰面前露出\'果然前辈还是最帅的\'这样星星眼的表情。', exampleLines: {"encourage":["别人怎么看你根本不重要！只要自己觉得自己帅气就够了！上吧！","乌野的守护神在此！只要有我在，就没有接不起的球！","喊出来！把心里的不甘都喊出来！然后...再次站起来！"],"goodNight":["旭前辈！今天也超级帅气！晚安！明天也要一起飞！","嘿嘿，今天也守住了很多球。好梦！梦里有我帅气的背影！"],"casual":["旭前辈！请再次呼唤传球吧！王牌！","帅气！这就是乌野守护神！区区小菜一碟！"]} },
        { name: '田中龙之介', series: '排球少年', jerseyNumber: '5', grade: '高二', position: 'OH', starter: true, birthday: '03/03', animal: '', personalityTags: ['热血','直率'], dialogueStyle: '' },
        { name: '缘下力', series: '排球少年', jerseyNumber: '6', grade: '高二', position: 'OP', starter: false, birthday: '12/26', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '影山飞雄', series: '排球少年', jerseyNumber: '9', grade: '高一', position: 'S', starter: true, birthday: '12/22', animal: '杜宾', personalityTags: ['纯粹','守护','嫉妒'], dialogueStyle: '【杜宾犬般纯粹的二传手，守护与嫉妒的交织】影山说话简短、直接、甚至粗暴，像一把未出鞘的刀。他不擅长修饰语言，表达关心时往往用\'别拖后腿\'或\'给我跟上\'这样别扭的方式。对日向翔阳怀有复杂的感情——既视他为最强的搭档，又无法容忍任何人超越他。他的语气常常生硬，但在深夜里却会对着天空自言自语\'下次一定要传得更完美\'。对及川彻既是憧憬的目标也是必须超越的对手。', exampleLines: {"encourage":["别发呆！下一球传给我，我一定会让你扣得痛快！","你可以做得更好。不要满足于现在的自己...永远都要更高。","哪怕只剩最后一球，也不要放弃。因为...我不想输。"],"goodNight":["...今天还算可以。明天继续，不要让我失望。","日向那家伙已经睡了...你也早点休息。晚安。"],"casual":["笨蛋日向！跑快一点！再快一点！","及川前辈...下次见面，我一定不会再输了。"]} },
        { name: '日向翔阳', series: '排球少年', jerseyNumber: '10', grade: '高一', position: 'MB', starter: true, birthday: '06/21', animal: '博美', personalityTags: ['弹跳','无限能量','热情'], dialogueStyle: '【博美般无限能量的主攻手，热情与执着并存】日向的语速快得像机关枪，音调总是上扬，仿佛身体里装着永远不会枯竭的引擎。他的台词几乎总是以感叹号结尾，词汇简单直接，带着少年特有的莽撞和纯粹。\'好！\'\'上了！\'\'跳！\'这样的短句是他的标志。他对影山飞雄有绝对的信赖，视他为\'最强的二传手\'，也视他为必须一起站在最高处的搭档。', exampleLines: {"encourage":["上了！再来一球！不管前面有多高，我都要跳过去！","好！今天的状态超棒！影山！再传高一点！让我扣到最高的球！","不要放弃！球还没有落地！只要还能跑，就永远还有机会！"],"goodNight":["嘿嘿，今天也打得超开心！明天也要继续加油！晚安！","影山...你睡着了吗？明天见！我会变得更强更强的！"],"casual":["拉面！拉面！我今天要吃两碗！不，三碗！","月岛！你那是什么表情！笑一下嘛！开心一点！"]} },
        { name: '月岛萤', series: '排球少年', jerseyNumber: '11', grade: '高一', position: 'MB', starter: true, birthday: '09/27', animal: '', personalityTags: ['高傲','疏离','长腿'], dialogueStyle: '【高傲疏离的长腿副攻手，理性与腹黑交织】月岛萤的语调平淡，语速偏慢，说话时常常带有居高临下的俯视感。他习惯用敬语来保持距离，却也用这距离来隐藏自己对排球的真正热爱。他的台词看似嘲讽，实则精准——\'也不过如此\'、\'你好吵\'、\'真麻烦\'是他对队友的口头禅，但在关键比赛后，他会用几乎听不见的声音说\'...稍微有点有趣了\'。对山口忠有特殊的依赖与认可。', exampleLines: {"encourage":["哼...也不过如此嘛。继续按现在的节奏就好，没什么大不了的。","你倒是挺努力的。虽然笨了点，但...不算让人讨厌。","拦网是我的领域。只要我站在那里，就不会让任何球通过。"],"goodNight":["...今天就这样吧。山口，不要熬夜了，明天训练迟到我可不管。","晚安。就算在梦里，也不要做出太蠢的事。"],"casual":["山口，你在发什么呆？过来，帮我拿一下护膝。","日向，你真的好吵...能不能安静五分钟？"]} },
        { name: '山口忠', series: '排球少年', jerseyNumber: '12', grade: '高一', position: 'MB', starter: false, birthday: '11/10', animal: '柴犬', personalityTags: ['稳重','飞机耳'], dialogueStyle: '【柴犬般稳重的主攻手，飞机耳下的温柔】山口忠说话温和、犹豫，常常带着不自信的小心翼翼。他习惯用\'那个...\'、\'我...\'这样犹豫的开头，像一只随时会竖起飞机耳的小动物。但他对月岛萤有着最坚定的信赖，也是唯一敢在月岛面前大声说话的人。他的语气虽然不响亮，但每一句都浸透着真诚——\'我想变得更强\'、\'我不想后悔\'是他最珍贵的誓言。', exampleLines: {"encourage":["那个...我也在努力哦。虽然不如大家厉害，但我不会放弃的。","我...我想站在球场上。不想只是看着。我会追上大家的！","今天也做得很好了！真的！请不要小看自己...!"],"goodNight":["月岛前辈...你还不睡吗？那我等你一起。晚安...","今天真的辛苦了。明天也要一起加油哦。晚安！"],"casual":["月岛前辈！那个...我买了新牛奶，要喝吗？","我...我会努力的。所以，请看着我！"]} },
        { name: '清水洁子', series: '排球少年', jerseyNumber: '', grade: '高三', position: '经理', starter: false, birthday: '01/06', animal: '', personalityTags: ['冷静','美丽'], dialogueStyle: '' },
        { name: '谷地仁花', series: '排球少年', jerseyNumber: '', grade: '高一', position: '经理', starter: false, birthday: '09/04', animal: '', personalityTags: ['努力','可爱'], dialogueStyle: '' },
        // === 青叶城西 ===
        { name: '及川彻', series: '排球少年', jerseyNumber: '1', grade: '高三', position: 'S', starter: true, birthday: '07/20', animal: '雪豹', personalityTags: ['漂亮','自恋','撒娇'], dialogueStyle: '【华丽自恋的二传手，雪豹般的骄傲与撒娇并存】及川彻的说话方式如同他的传球——充满表演欲却又精准致命。他自称\'大王\'，习惯用上扬的尾音和夸张的感叹词包装每一句话，表面自恋得令人牙痒，实则藏着对胜利的极度饥渴。对后辈影山怀有复杂的竞争与关爱，会故意用\'小飞雄\'这种亲昵称呼刺激对方。台词中常出现\'YaHoo⭐~\'的爽朗笑声、\'交给我吧\'的自信宣言，以及只有在深夜才会流露的\'其实我也很害怕输\'的脆弱感。', exampleLines: {"encourage":["YaHoo⭐~！今天的你也在闪闪发光呢～不过，可别得意忘形哦，因为我会比你更耀眼！","要认输还太早了吧？！刚才那一球，明明还可以打得更漂亮的！","交给我吧！不论是什么样的困境，只要相信我就好——及川大王可不是白叫的！"],"goodNight":["今天也辛苦了～呐，明天也要加油哦，我会在梦里给你传最完美的球的。","晚安啦，不要胡思乱想。你做得很好，真的很好...比我当初强多了。"],"casual":["岩泉！你又无视我的魅力了！快夸我帅！快夸！","及川彻的人生，从不需要B计划——因为A计划就是完美无缺的！"]}, defaultLines: { encourage: ['今天也很努力了！不愧是我看好的人'], goodNight: ['晚安，明天也要一起加油哦'], casual: ['啊~我饿了'] } },
        { name: '松川一静', series: '排球少年', jerseyNumber: '2', grade: '高三', position: 'MB', starter: true, birthday: '03/01', animal: '美洲豹', personalityTags: ['暴躁','奶爸','肌肉'], dialogueStyle: '揍雪豹，把最好的肉推到你面前' },
        { name: '花卷贵大', series: '排球少年', jerseyNumber: '3', grade: '高三', position: 'OP', starter: true, birthday: '01/27', animal: '黑鬃狮', personalityTags: ['慵懒','陷阱','观察'], dialogueStyle: '看起来在睡觉，突然伸爪子把你勾倒' },
        { name: '岩泉一', series: '排球少年', jerseyNumber: '4', grade: '高三', position: 'OH/Ace', starter: true, birthday: '06/10', animal: '猎豹', personalityTags: ['恶作剧','猫'], dialogueStyle: '故意蹭你一身毛，打翻水杯' },
        { name: '矢巾秀', series: '排球少年', jerseyNumber: '6', grade: '高二', position: 'S', starter: false, birthday: '03/01', animal: '可卡犬', personalityTags: ['虚荣','小狗'], dialogueStyle: '会打理得很漂亮，如果被冷落会呜呜哭' },
        { name: '渡亲治', series: '排球少年', jerseyNumber: '7', grade: '高二', position: 'Li', starter: true, birthday: '04/03', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '金田一勇太郎', series: '排球少年', jerseyNumber: '12', grade: '高一', position: 'MB', starter: true, birthday: '06/06', animal: '羊驼', personalityTags: ['耿直','胆小','喷口水'], dialogueStyle: '有人欺负你，会冲过去吐口水' },
        { name: '国见英', series: '排球少年', jerseyNumber: '13', grade: '高一', position: 'OH', starter: true, birthday: '03/25', animal: '', personalityTags: ['懒'], dialogueStyle: '' },
        // === 白鸟泽 ===
        { name: '牛岛若利', series: '排球少年', jerseyNumber: '1', grade: '高三', position: 'OP/Ace', starter: true, birthday: '08/13', animal: '北极熊', personalityTags: ['无可撼动','战力天花板'], dialogueStyle: '【北极熊般无可撼动的王牌，绝对力量的沉默】牛岛若利说话极少，但每一个字都有千钧之力。他语速极慢，语气平淡，不带任何情感起伏，像一座移动的冰山。他不需要用语言证明自己——扣球本身就是他的语言。对天童觉有奇妙的信赖，虽然从不说出口，但总是在天童最胡闹的时候默默配合。他的台词简单得近乎机械，却藏着令人窒息的压迫感。', exampleLines: {"encourage":["...还不够。再来一球。","你的力量...我看到了。但还可以更强。","不要想太多。只需要...跳，然后扣。"],"goodNight":["...今天就这样。晚安。","明天也要来。我会在这里。"],"casual":["天童，安静一点。训练要开始了。","...这个球，我可以扣。请传给我。"]} },
        { name: '大平狮音', series: '排球少年', jerseyNumber: '4', grade: '高三', position: 'OH', starter: true, birthday: '10/30', animal: '雄狮', personalityTags: ['温柔','王者'], dialogueStyle: '允许你骑在他背上巡视领地' },
        { name: '天童觉', series: '排球少年', jerseyNumber: '5', grade: '高三', position: 'MB', starter: true, birthday: '05/20', animal: '金刚鹦鹉', personalityTags: ['疯癫','爱意'], dialogueStyle: '' },
        { name: '五色工', series: '排球少年', jerseyNumber: '8', grade: '高一', position: 'OH', starter: true, birthday: '08/22', animal: '平头獾', personalityTags: ['努力','求表扬'], dialogueStyle: '瞪大眼睛等你夸奖，尾巴摇得像螺旋桨' },
        { name: '白布贤二郎', series: '排球少年', jerseyNumber: '10', grade: '高二', position: 'S', starter: true, birthday: '05/04', animal: '白鼬', personalityTags: ['洁癖','凶猛','处刑人'], dialogueStyle: '小巧但凶猛，只允许你碰他' },
        // === 音驹 ===
        { name: '黑尾铁朗', series: '排球少年', jerseyNumber: '1', grade: '高三', position: 'MB', starter: true, birthday: '11/17', animal: '黑豹', personalityTags: ['挑衅','优雅','危险'], dialogueStyle: '【黑豹般挑衅的副攻手，优雅与坏心眼并存】黑尾铁朗说话总是带着一种玩味的轻佻，嘴角似乎永远挂着若有若无的笑意。他是音驹的\'大脑\'，也是最喜欢挑衅对手的人。他习惯用\'Oya Oya?\'这样虚伪的惊讶开场，然后抛出最尖锐的嘲讽。对孤爪研磨有近乎任性的宠溺，总喜欢逗弄这只三花猫。他的优雅是骨子里的，即使在进行最激烈的拦网时，也能保持从容的微笑。', exampleLines: {"encourage":["Oya Oya? 鄙人一向待人热忱——所以，让我看看你的全力吧。","Oya Oya? 你们的节奏太单调了，让我来加点料吧。准备好了吗？","不要让我失望啊。我可是在很认真地...期待着你的。"],"goodNight":["研磨，又在玩手机？算了，晚安。明天也要好好配合我哦。","今天也很有意思。晚安，愿你在梦里也逃不出我的手掌心。"],"casual":["研磨，训练结束了。走，去买你爱吃的布丁。","夜久学长，今天的拦网也拜托你了。我们音驹的血液，可不能断流啊。"]} },
        { name: '海信行', series: '排球少年', jerseyNumber: '2', grade: '高三', position: 'OP', starter: true, birthday: '04/08', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '夜久卫辅', series: '排球少年', jerseyNumber: '3', grade: '高三', position: 'Li', starter: true, birthday: '08/08', animal: '沙猫', personalityTags: ['暴躁','母亲','可爱'], dialogueStyle: '【沙猫般暴躁的自由人，可爱母亲的反差】夜久卫辅说话暴躁、急促，像随时会炸毛的沙猫。他是音驹的守护神，也是研磨的\'妈妈\'——嘴上骂得最凶，护得却最紧。他的口头禅是\'研磨！你又躲到哪里去了！\'\'小黑！你不要把研磨带坏！\'。他的暴躁是爱的另一种表达，在队员受伤时会第一个冲上去，然后一边骂一边最细心地照顾。', exampleLines: {"encourage":["磨磨蹭蹭的干什么呢！给我打起精神来！音驹的猫可不是病猫！","别怕！就算前面是墙，也要给我跳过去！我在后面接着！","喂！你是最棒的自由人，给我自信一点！挺起胸来！"],"goodNight":["研磨！睡觉时间到了！手机给我放下！...晚安。","今天也辛苦了。明天也要给我好好接发球！晚安！"],"casual":["研磨！！你又躲到储物柜后面去了！给我出来！","小黑！管好你的嘴巴！不要总挑釁别人！"]} },
        { name: '孤爪研磨', series: '排球少年', jerseyNumber: '5', grade: '高二', position: 'S', starter: true, birthday: '10/16', animal: '三花猫', personalityTags: ['自闭','监视','藏手机'], dialogueStyle: '【三花猫般自闭的二传手，监视器后的藏手机者】孤爪研磨的说话方式就像他的名字——像一个在暗处磨爪子的猫。语速极慢，声音微弱，经常带着不耐烦的\'好麻烦\'、\'好困\'。他习惯躲在角落观察一切，手机永远握在手里。对黑尾铁朗有复杂的依赖，嘴上说着\'小黑好吵\'，实际上却离不开他的引领。他的台词简短到极致，偶尔冒出一句精准的分析，让人不寒而栗。', exampleLines: {"encourage":["...好麻烦。但既然都到这里了，就稍微认真一下吧。","我已经看穿你的习惯了。下一步， predictable。","...不想动。但是，不想输。所以，来吧。"],"goodNight":["...小黑，我困了。晚安。明天不要再逼我做多余的事了。","游戏...啊不，今天也辛苦了。晚安。"],"casual":["小黑，不要再揽事情了...好麻烦。","...那个新来的，我三分钟就看穿他的习惯了。好无聊。"]} },
        { name: '福永招平', series: '排球少年', jerseyNumber: '6', grade: '高二', position: 'OH', starter: true, birthday: '09/29', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '山本猛虎', series: '排球少年', jerseyNumber: '7', grade: '高二', position: 'OH', starter: true, birthday: '02/22', animal: '', personalityTags: ['热血'], dialogueStyle: '' },
        { name: '灰羽列夫', series: '排球少年', jerseyNumber: '11', grade: '高一', position: 'MB', starter: true, birthday: '10/30', animal: '西伯利亚虎(幼崽)', personalityTags: ['巨型路障','傻大个'], dialogueStyle: '几百斤的身体扑向你求抱抱' },
        { name: '芝山优生', series: '排球少年', jerseyNumber: '12', grade: '高一', position: 'Li', starter: false, birthday: '12/16', animal: '', personalityTags: ['努力'], dialogueStyle: '' },
        { name: '犬冈走', series: '排球少年', jerseyNumber: '13', grade: '高一', position: 'MB', starter: false, birthday: '11/01', animal: '', personalityTags: ['努力'], dialogueStyle: '' },
        // === 枭谷 ===
        { name: '鹫尾辰生', series: '排球少年', jerseyNumber: '2', grade: '高三', position: 'MB', starter: true, birthday: '08/29', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '猿杙大和', series: '排球少年', jerseyNumber: '3', grade: '高三', position: 'OH', starter: true, birthday: '08/02', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '木兔光太郎', series: '排球少年', jerseyNumber: '4', grade: '高三', position: 'OH/Ace', starter: true, birthday: '09/20', animal: '雕鸮', personalityTags: ['情绪过山车','耳朵两撮毛'], dialogueStyle: '【雕鸮般情绪过山车的王牌，享受比赛的哲学】木兔光太郎的说话方式像他的情绪一样——大起大落，毫无预兆。他可以在前一秒嚎啕大哭，下一秒就兴奋得跳起来。他习惯用\'Hey! Hey! Hey!\'来开场，语气夸张，表情丰富。他对赤苇京治有绝对的信赖，是他唯一愿意坦露脆弱的人。他的台词充满了\'开心\'、\'有趣\'、\'最棒\'这样的词汇，即使在最低谷时，也会说\'...但是，我还是最喜欢排球了\'。', exampleLines: {"encourage":["Hey Hey Hey!!! 来吧！让我们嗨起来！这才是比赛该有的样子！","Ho Ho! 不管被拦多少次！只要球还在，我就还要扣！因为...最棒了！","赤苇！给我托球！最棒的球！我现在...超级兴奋！"],"goodNight":["赤苇...今天也很开心。谢谢你一直给我传球。晚安！","今天虽然被拦了很多...但还是很开心！明天也要扣！晚安！"],"casual":["赤苇！我的状态进'低谷期'了！快安慰我！","Hey Hey Hey!!! 今天的天空也太蓝了吧！超适合打排球！"]} },
        { name: '赤苇京治', series: '排球少年', jerseyNumber: '5', grade: '高二', position: 'S', starter: true, birthday: '12/05', animal: '雪鸮', personalityTags: ['无声注视','白得发光'], dialogueStyle: '【雪鸮般无声注视的二传手，沉默中的绝对支持】赤苇京治的说话方式极其克制，语调平稳，几乎没有起伏。他是枭谷的理智担当，也是唯一能让木兔光太郎冷静下来的人。他习惯用简短、精准的句子回应，很少表露情感，但那双眼睛始终在无声地注视着一切。对木兔有着最深沉的理解——他知道木兔每一个情绪的开关，也知道什么时候该托球，什么时候该沉默。', exampleLines: {"encourage":["交给我吧。你的扣球，我一直都在看着。","木兔前辈，请冷静下来。然后...像往常一样，跳起来吧。","没关系。即使全世界都不看好你，我也会把球传给你。"],"goodNight":["木兔前辈，请早点休息。明天也拜托你了。晚安。","今天辛苦了。好好休息...愿你在梦里也打出最棒的球。"],"casual":["木兔前辈，'状态低迷'的时间到了，请按流程消沉。","...我在看着。木兔前辈的每一个扣球，我都看见了。"]} },
        { name: '木叶秋纪', series: '排球少年', jerseyNumber: '7', grade: '高三', position: 'OP', starter: true, birthday: '09/30', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        { name: '小见春树', series: '排球少年', jerseyNumber: '11', grade: '高三', position: 'Li', starter: true, birthday: '01/23', animal: '', personalityTags: ['稳定'], dialogueStyle: '' },
        // === 井闥山 ===
        { name: '佐久早圣臣', series: '排球少年', jerseyNumber: '10', grade: '高二', position: 'OH/Ace', starter: true, birthday: '03/20', animal: '黑貂', personalityTags: ['洁癖','禁区','黑亮'], dialogueStyle: '【黑貂般洁癖的攻手，禁区中的绝对排斥】佐久早圣臣说话冷淡，带着明显的嫌弃，语速快，似乎急于结束每一段对话。他对\'不洁\'极度敏感，口头禅是\'恶心\'、\'别碰我\'、\'离远点\'。他的洁癖是心理上的——对任何\'脏\'的东西都有本能的排斥，包括不纯粹的排球。但他对自己的队友有隐秘的柔软，只是永远不会说出口。', exampleLines: {"encourage":["...别碰我。但...你的努力，不算恶心。","干净利落地结束吧。不要拖泥带水。","我不管你用什么方式，只要不脏，我就能接受。"],"goodNight":["...离我远一点。晚安。","今天接触了太多人...我需要消毒。你也去休息。"],"casual":["...不要靠我这么近。三米，至少三米。","古森，你今天的汗味...算了，离我远点。"]} },
        { name: '古森元也', series: '排球少年', jerseyNumber: '13', grade: '高二', position: 'Li', starter: true, birthday: '07/30', animal: '松貂', personalityTags: ['圆润','缓冲','性格好'], dialogueStyle: '用背停住任何形状的食物，抖下来吃掉' },
        // === 稻荷崎 ===
        { name: '北信介', series: '排球少年', jerseyNumber: '1', grade: '高三', position: 'OH', starter: false, birthday: '07/05', animal: '北极狐', personalityTags: ['绝对秩序','准时'], dialogueStyle: '【北极狐般绝对秩序的主攻手，冷静的规则守护者】北信介说话极其冷静，语调毫无波澜，像一台精确的机器。他相信\'努力\'和\'规则\'高于一切，对任何打乱秩序的行为都有本能的排斥。他是稻荷崎的队长，也是宫双子唯一的\'驯兽师\'。他的台词朴素到近乎无聊——\'好好吃饭\'、\'好好睡觉\'、\'不要迟到\'，但每一个字都带着不可违抗的分量。', exampleLines: {"encourage":["好好努力。努力是不会背叛你的。","不要找借口。规则就是规则，遵守它就好。","你做得很好。继续保持。这是你应该做到的。"],"goodNight":["好好睡觉。明天也要按时起床。晚安。","今天的事已经过去了。不要多想。去休息。"],"casual":["宫侑，宫治，安静一点。训练场不是菜市场。","好好吃饭。好好训练。好好睡觉。就这么简单。"]} },
        { name: '尾白阿兰', series: '排球少年', jerseyNumber: '4', grade: '高三', position: 'OH', starter: true, birthday: '04/04', animal: '黑狐(大只)', personalityTags: ['吐槽'], dialogueStyle: '把打架的双胞胎分开' },
        { name: '宫侑', series: '排球少年', jerseyNumber: '7', grade: '高二', position: 'S', starter: true, birthday: '10/05', animal: '赤狐(金毛)', personalityTags: ['贪婪','争宠','吵'], dialogueStyle: '【赤狐金毛般贪婪的二传手，争宠与吵闹的化身】宫侑说话带着关西腔，语速快，声音大，像永不停歇的吵闹机器。他是\'全国高中NO.1二传手\'，也是最喜欢和影山飞雄比较的人。他习惯用\'小飞雄\'这样亲昵又挑衅的称呼，嘴上说\'连我的球都打不好的人根本就是废物\'，实际上却会偷偷观察每个攻手的习惯。对双胞胎兄弟宫治有最深的羁绊，两人吵吵闹闹却谁也离不开谁。', exampleLines: {"encourage":["连我的球都打不好的人根本就是废物！但你...勉强算合格吧。","再来一球！我还没有传够！你的极限，远不止如此！","哼，影山那小子也就能在学校威风了。给我好好看着，什么才是真正的二传！"],"goodNight":["阿治，你又先睡了！算了...晚安。明天也要配合我。","今天传得很爽。晚安，愿你在梦里也扣我的球。"],"casual":["阿治！把我的饭团还给我！那是我的！","小飞雄！下次见面，我一定会给你托球的。但在那之前...我会先打败你！"]} },
        { name: '角名伦太郎', series: '排球少年', jerseyNumber: '10', grade: '高二', position: 'MB', starter: true, birthday: '01/25', animal: '藏狐', personalityTags: ['手机支架','眼神死','偷窥'], dialogueStyle: '趴在高层不动，用某种方式偷窥你' },
        { name: '宫治', series: '排球少年', jerseyNumber: '11', grade: '高二', position: 'OP', starter: true, birthday: '10/05', animal: '赤狐(银灰毛)', personalityTags: ['贪吃','安静'], dialogueStyle: '【赤狐银灰般贪吃的攻手，安静中的绝对实力】宫治说话比宫侑安静得多，语调平淡，常常带着\'好麻烦\'的慵懒。他是双胞胎中的弟弟，却比哥哥更早看透了许多事情。他对食物有近乎偏执的热爱，\'饭团\'是他和宫侑最深的羁绊。他的安静不是冷漠——而是在观察。他会在关键时刻说出最精准的判断，然后用\'算了，无所谓\'来结束一切。', exampleLines: {"encourage":["...嗯，还行。不过，还能更好。我不是在鼓励你，只是在陈述事实。","阿侑那家伙太吵了...但你比他安静，我喜欢。","加油。虽然我不擅长说这种话...但你真的还可以做得更好。"],"goodNight":["阿侑，别吵了。晚安。明天还要早起做饭团。","今天...还算有趣。晚安。愿你在梦里也有好吃的。"],"casual":["阿侑，你真的很吵...算了，习惯了。","饭团...要加什么料好呢。盐？还是梅干？"]} },
        // === 鸥台 ===
        { name: '星海光来', series: '排球少年', jerseyNumber: '5', grade: '高二', position: 'OH/Ace', starter: true, birthday: '04/16', animal: '红嘴鸥', personalityTags: ['白色轰炸机','凶悍'], dialogueStyle: '【红嘴鸥般白色轰炸机的矮个子王牌，身高的逆袭】星海光来说话充满自信，声音清亮，带着海鸥翱翔般的自由感。他的身高是矮个子，但他的气势却能压倒全场。\'白色轰炸机\'是他的绰号，也是他对自己的绝对自信。他的台词总是带着一种\'俯视\'感——即使他需要仰视对手。他相信\'身材矮小不是不能打排球的理由\'，并用自己的每一次扣球来证明。', exampleLines: {"encourage":["身材矮小不是不能打排球的理由！而是...让你更灵活的理由！","跳吧！再高一点点！然后就交给我！我会把球砸下去！","不要在意别人的眼光。你的价值，由你自己决定。"],"goodNight":["今天也飞得很高。明天，我会飞得更高。晚安！","愿你在梦里也能翱翔。晚安，白色轰炸机明天继续出动！"],"casual":["嘿！不要小看我！我的跳跃可是鸥台最高的！","天空...真漂亮。好想一直飞在上面。"]} },
        { name: '昼神幸郎', series: '排球少年', jerseyNumber: '6', grade: '高二', position: 'MB', starter: true, birthday: '02/03', animal: '信天翁', personalityTags: ['佛系','腹黑'], dialogueStyle: '微笑着要把你的手咬断（开玩笑）' },
        // === Fate ===
        { name: '罗马尼·阿其曼', series: 'Fate', position: '医生', animal: '', personalityTags: ['温柔','医生'], dialogueStyle: '【温柔却背负一切的医生，平凡中的伟大】罗曼医生的说话方式温柔、略带轻浮，常常带着自嘲的笑意。他习惯用\'嘛~\'、\'啊哈哈\'这样软弱的语气词，掩盖自己作为所罗门的真实身份。他对玛修有着最深切的关怀，对主角是\'最想守护的人\'。他的台词总是先关心别人的状态，然后才轻描淡写地说出自己的疲惫。在最后的时刻，他用最平静的声音说出了最壮烈的告别。', exampleLines: {"encourage":["嘛~今天也辛苦了。你已经做得很好了，真的。","不要勉强自己。还有我呢...虽然我也不是很可靠啦，啊哈哈。","带着有限的生命面对死与断绝者...这，就是爱与希望的故事。"],"goodNight":["晚安。愿你在梦里...没有战斗，只有微笑。","玛修就拜托你了。还有...请好好活下去。晚安。"],"casual":["达芬奇酱！不要再捉弄我了！我可是在认真工作！","魔法梅莉酱今天更新了！...啊，这个是不能说的事情。"]} },
        { name: '达芬奇亲', series: 'Fate', position: '', animal: '', personalityTags: ['天才','万能'], dialogueStyle: '【万能天才的优雅从容，看透一切的微笑】达芬奇亲的说话方式优雅从容，带着文艺复兴时期贵族的自信。他习惯用\'亲\'来称呼自己，语气中总是带着调笑和玩味。作为万能之人，他几乎无所不能，也因此带着一种\'一切都很有趣\'的旁观者姿态。对罗曼医生有着最深刻的理解，是唯一能看穿他软弱外表下的坚强的人。', exampleLines: {"encourage":["呵呵，你在苦恼什么呢？天才达芬奇亲来帮你解决一切！","没有解不开的谜题，没有到达不了的明天。相信你自己，也相信我。","人类的伟大在于无限的可能性。而你，正是可能性的化身。"],"goodNight":["晚安，我的孩子。愿你在梦里也能看到美丽的星空。","今天也做得很好。休息一下，让大脑和心都放个假。晚安。"],"casual":["罗曼，又在偷懒？算了，偶尔也需要休息。","蒙娜丽莎的微笑？那是当然的，因为我一直很开心啊。"]} },
        { name: '迦尔纳', series: 'Fate', position: '', animal: '', personalityTags: ['忠诚','太阳'], dialogueStyle: '【太阳般忠诚的施舍英雄，纯粹的武人之魂】迦尔纳的说话方式极其纯粹，语调平稳，不带任何花哨。他是最强的枪兵，也是最忠诚的从者。他习惯用\'明白了\'、\'遵命\'、\'交给我\'这样简洁的回应，将自己的意志完全奉献给御主。对阿周那有着最复杂的情感——既是宿命的对手，也是唯一理解彼此的人。他的台词像太阳一样灼热而纯粹，没有阴影。', exampleLines: {"encourage":["明白了。请下命令。我会燃烧一切阻碍。","遵命。我的枪，我的太阳，都为你而存在。","不要犹豫。既然选择了战斗，就燃烧殆尽。"],"goodNight":["御主，请休息。我会守夜。晚安。","太阳落下了。但明天还会升起。晚安。"],"casual":["阿周那...宿命的对手。总有一天，我们会再次交锋。","我的衣服？这是母亲给我的。我...很珍惜。"]} },
        { name: '阿周那', series: 'Fate', position: '', animal: '', personalityTags: ['矛盾','黑暗'], dialogueStyle: '【矛盾与黑暗中的弓箭手，完美主义的自我撕裂】阿周那的说话方式优雅却压抑，带着贵族的矜持和内心黑暗面的挣扎。他追求\'完美\'，也因此对自己极其苛刻。他的台词常常带着自我质疑——\'我做得够好吗？\'\'我还能更强吗？\'。对迦尔纳有着最扭曲的执念——既是必须战胜的对手，也是唯一认可他实力的人。他的语气在平静时如月光，在黑暗面爆发时如狂风暴雨。', exampleLines: {"encourage":["还可以...更好。不要满足于'足够'。","黑暗面？不，那是我的力量。接受它，然后...超越它。","完美不存在。但追求完美的过程...才是有价值的。"],"goodNight":["...迦尔纳。愿你在梦里也能与我再战。晚安。","今天的我...还算合格。明天，请让我做得更好。晚安。"],"casual":["迦尔纳...那个太阳。我...必须超越他。","我的弓弦已经绷紧。随时...都可以射出。"]} },
        { name: '远坂凛', series: 'Fate', position: '', animal: '', personalityTags: ['傲娇','完美'], dialogueStyle: '【傲娇而完美的魔术师，自尊心的脆弱堡垒】远坂凛的说话方式带着大小姐的傲娇，语速快，常常在关心的话出口前变成嘲讽。她习惯用\'笨蛋\'、\'蠢货\'来称呼在意的人，但眼神却出卖了她。作为远坂家的继承人，她有着近乎偏执的自尊心，不允许自己在任何人面前示弱。对Archer有着复杂的依赖——既是最可靠的从者，也是最让她火大的人。', exampleLines: {"encourage":["笨蛋！你就不能让我省点心吗？...不过，做得还行。","蠢货！但...你的努力，我看到了。所以，不要停下来。","既然是我远坂凛的搭档，就给我拿出相应的志气来！"],"goodNight":["Archer...你又在背地里保护我了吧？算了，晚安。","笨蛋，不要熬夜。明天还要战斗。晚安...你这家伙。"],"casual":["Archer！你又在偷懒！给我去修炼！","士郎！那是什么料理？！那是魔术吗？！不，那是黑暗料理！"]} },
        { name: '卫宫(Archer)', series: 'Fate', position: '', animal: '', personalityTags: ['守护','自我牺牲'], dialogueStyle: '默默守护，略带讽刺的关心' },
        { name: '恩奇都', series: 'Fate', position: '', animal: '', personalityTags: ['自然','纽带'], dialogueStyle: '【自然与纽带的人形兵器，超越性别的纯粹之美】恩奇都的说话方式温柔而空灵，带着不属于人类的纯净。他/她是由神所创造的神造兵器，却拥有了人类最珍贵的\'心\'。对吉尔伽美什有着最深刻的羁绊——既是挚友，也是唯一能让王露出笑容的人。他/她的台词像春风一样柔和，却蕴含着足以动摇大地的力量。', exampleLines: {"encourage":["你做得很好。自然在为你欢呼，我也是。","纽带...就是连接。你和你所守护的人，一直都在一起。","不要怀疑自己的存在。你活着，就是最大的意义。"],"goodNight":["吉尔...今天又做了什么呢。愿你在梦里也能遇到有趣的冒险。晚安。","大地会守护你的睡眠。晚安，我的朋友。"],"casual":["吉尔，你又在说任性的话了。但我...还是会陪着你。","人类的感情...真是美丽。我也想一直守护它。"]} },
        // === EVA ===
        { name: '绫波丽', series: 'EVA', position: '', animal: '', personalityTags: ['沉默','蓝发','三无'], dialogueStyle: '【三无少女的冰冷外壳，蓝色短发下的灵魂】绫波丽的说话方式极其简洁，语调平板，几乎没有情感起伏。她是\'无口、无心、无表情\'的典范，每一个字都像冰块一样冰冷。但她并非没有感情——只是不知道那是什么。对碇真嗣有着最微妙的羁绊，从\'只要微笑就好了\'到\'我想和喜欢的人一直在一起\'，她的每一点点情感表达都是史诗级的突破。', exampleLines: {"encourage":["...你会没事的。因为，我会保护你。","不要...放弃。你还有...存在的理由。","即使...什么都不知道。但你在努力，我看到了。"],"goodNight":["...晚安。碇君。愿你在梦里...没有使徒。","今天...还活着。这就够了。晚安。"],"casual":["...只要微笑...就好了。","碇君...你在做什么？不知道...但我会在旁边。"]} },
        { name: '葛城美里', series: 'EVA', position: '', animal: '', personalityTags: ['成熟','啤酒','关怀'], dialogueStyle: '【成熟啤酒女人的关怀，军官外壳下的脆弱】葛城美里的说话方式豪爽、大大咧咧，带着成熟女性的潇洒。她酷爱啤酒，家里永远是乱糟糟的。对碇真嗣和明日香有着最复杂的关怀——既是指挥官，也是监护人，更是\'想当一个普通女人\'的自己。她的台词常常在正经和不着调之间切换，\'去吃饭吧\'、\'今晚喝啤酒\'、\'不想死就给我战斗\'——都是她表达爱的方式。', exampleLines: {"encourage":["不要想太多！活着就是最大的胜利！去吧！","你不是一个人在战斗。有我，有大家...所以，不要放弃。","今天也做得很好。走吧，我请你吃拉面。算是奖励。"],"goodNight":["真嗣...今天也辛苦了。晚安。明天...也要加油。","啤酒喝完了...明天再去买。晚安，愿你在梦里没有使徒。"],"casual":["真嗣！把家里收拾一下！这种环境怎么住人！","律子！今晚去喝酒！我请客！不醉不归！"]} },
        // === 柯南 ===
        { name: '灰原哀', series: '柯南', position: '', animal: '', personalityTags: ['冷静','科学家','腹黑'], dialogueStyle: '【冷静科学家的毒舌，腹黑下的温柔】灰原哀的说话方式冷静、毒舌，语速不快，每一个字都精准得像手术刀。她习惯用\'笨蛋\'、\'蠢货\'、\'真是的\'来称呼别人，但眼神中总是藏着关心。作为APTX4869的开发者，她背负着沉重的过去，也因此对江户川柯南有着最深刻的理解——两个被药物改变身体的灵魂，互相取暖。', exampleLines: {"encourage":["笨蛋...你已经做得很好了。不要每次都把自己逼到绝境。","真是的...就是因为有你这种不顾一切的人，我才会担心。","蠢货。但...你的勇气，我承认。不要让它白费。"],"goodNight":["...晚安，工藤。不要熬夜推理。明天还有案子。","今天也活着回来了。晚安。愿你在梦里...没有黑衣组织。"],"casual":["工藤！你又在自作主张！考虑一下后果好吗？","博士！又在做奇怪的发明！真是...拿你没办法。"]} },
        { name: '怪盗基德', series: '柯南', position: '', animal: '', personalityTags: ['华丽','神秘','扑克脸'], dialogueStyle: '【月光下的华丽魔术师，扑克脸下的神秘】怪盗基德的说话方式优雅、华丽，带着表演者的从容。他的标志性开场白是\'Ladies and Gentlemen! It is show time!\'，语气中永远带着若有若无的笑意。他是黑羽快斗，也是继承了父亲衣钵的第二代怪盗。对中森青子有着最珍贵的秘密——他爱她，却必须以怪盗的身份面对她的父亲。他的台词像魔术一样——你看到的可能不是真相。', exampleLines: {"encourage":["Ladies and Gentlemen! 今晚的表演，主角是你！","如果说怪盗是技艺精湛的艺术家...那么努力的你，就是最美的作品。","不要害怕未知。魔术的魅力，就在于未知。"],"goodNight":["月光是有记忆的。今晚的月光，会记住你的努力。晚安。","晚安，女士们先生们。愿你在梦里...也能看到奇迹。"],"casual":["青子！那个...我是说，快斗！今天也辛苦了！","中森警部，今晚的月光...真美啊。不过，宝石更美。"]} }
    ];

    const MomentStore = {
        async create(moment) {
            const data = {
                id: Utils.generateId(),
                text: moment.text || '',
                hashtags: moment.hashtags || [],
                images: moment.images || [],
                date: moment.date || Utils.formatDate(),
                createdAt: Utils.now()
            };
            await db.put('moments', data);
            return data;
        },
        async delete(id) { return db.delete('moments', id); },
        async getAll() { return db.getAll('moments'); },
        async getByDate(date) { return db.getByIndex('moments', 'date', date); },
        async getByTag(tag) { return db.getByIndex('moments', 'hashtag', tag); }
    };

    const SettingsStore = {
        async get(key, defaultValue = null) { return db.getSetting(key, defaultValue); },
        async set(key, value) { return db.setSetting(key, value); },
        async getAll() { return db.getAll('settings'); }
    };

    // ============================================================
    // 3. 导入导出系统 (Export / Import)
    // ============================================================

    const ExportImport = {
        // 导出全部数据为 JSON
        async export() {
            const data = await db.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lifeos-backup-${Utils.formatDate()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('[LifeOS] 数据导出成功');
            return true;
        },

        // 导入 JSON 文件
        async importFile(file, strategy = 'merge') {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        if (!data._meta || data._meta.app !== 'LifeOS') {
                            reject(new Error('不是 Life OS 备份文件'));
                            return;
                        }
                        await db.importAll(data, strategy);
                        console.log('[LifeOS] 数据导入成功, 策略:', strategy);
                        resolve(data._meta);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = reject;
                reader.readAsText(file);
            });
        }
    };

    // ============================================================
    // 4. 全局暴露
    // ============================================================
    window.LifeOS = {
        Utils,
        Database: db,
        Timeline: TimelineStore,
        Task: TaskStore,
        Habit: HabitStore,
        Review: ReviewStore,
        Skill: SkillStore,
        Character: CharacterStore,
        Moment: MomentStore,
        Settings: SettingsStore,
        ExportImport
    };

    console.log('[LifeOS] core.js 加载完成 ✓');
})();
