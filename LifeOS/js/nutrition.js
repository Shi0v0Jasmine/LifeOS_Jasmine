/* ============================================================
 * LifeOS AI 饮食模块（nutrition.js）
 * 无构建步骤：IIFE + window.LifeOS.Nutrition / NutritionEngine
 *
 * 隐私约束：照片/截图只在内存中发给 AI，不写入 IndexedDB。
 * 持久化内容仅包含用户确认后的结构化食物、营养与运动数据。
 * ============================================================ */
(function () {
    'use strict';

    var LifeOS = window.LifeOS;
    if (!LifeOS) throw new Error('nutrition.js requires core.js');

    var Utils = LifeOS.Utils;
    var Database = LifeOS.Database;
    var AIClient = LifeOS.AIClient;
    var STORE = 'nutrition';

    function number(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : (fallback || 0);
    }

    function round(value, digits) {
        var factor = Math.pow(10, digits === undefined ? 1 : digits);
        return Math.round(number(value) * factor) / factor;
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, number(value)));
    }

    function dateFromString(date) {
        var parts = String(date || '').split('-').map(Number);
        return new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    }

    function addDays(date, amount) {
        var d = dateFromString(date);
        d.setDate(d.getDate() + amount);
        return Utils.formatDate(d);
    }

    function safeText(value, maxLength) {
        return String(value || '').trim().slice(0, maxLength || 120);
    }

    function parseJsonObject(raw) {
        if (raw && typeof raw === 'object') return raw;
        var parsed = Utils.parseJSONSafe(String(raw || ''), null);
        if (parsed && typeof parsed === 'object') return parsed;
        throw new Error('AI 返回内容不是有效 JSON 对象');
    }

    function normalizeFood(food, index) {
        var amount = clamp(food.amountG || food.grams || food.amount || 100, 1, 5000);
        return {
            id: safeText(food.id, 80) || ('food-' + index + '-' + Utils.generateId().slice(0, 8)),
            name: safeText(food.name || food.food || '未命名食物', 80),
            amountG: round(amount, 0),
            calories: round(clamp(food.calories || food.kcal, 0, 10000), 0),
            carbsG: round(clamp(food.carbsG || food.carbs || food.carbohydrates, 0, 1000), 1),
            proteinG: round(clamp(food.proteinG || food.protein, 0, 1000), 1),
            fatG: round(clamp(food.fatG || food.fat, 0, 1000), 1),
            fiberG: round(clamp(food.fiberG || food.fiber, 0, 500), 1),
            vitaminCmg: round(clamp(food.vitaminCmg || food.vitaminC || 0, 0, 5000), 1),
            calciumMg: round(clamp(food.calciumMg || food.calcium || 0, 0, 10000), 1),
            ironMg: round(clamp(food.ironMg || food.iron || 0, 0, 1000), 1),
            confidence: round(clamp(food.confidence === undefined ? 0.7 : food.confidence, 0, 1), 2)
        };
    }

    var NutritionEngine = {
        ACTIVITY_FACTORS: {
            sedentary: 1.2,
            light: 1.375,
            moderate: 1.55,
            active: 1.725,
            veryActive: 1.9
        },

        GOAL_ADJUSTMENTS: {
            lose: -400,
            maintain: 0,
            gain: 300
        },

        MICRO_TARGETS: {
            fiberG: { label: '膳食纤维', unit: 'g', default: 25 },
            vitaminCmg: { label: '维生素 C', unit: 'mg', default: 75 },
            calciumMg: { label: '钙', unit: 'mg', default: 1000 },
            ironMg: { label: '铁', unit: 'mg', default: 18 }
        },

        round: round,

        addDays: addDays,

        weekRange(date) {
            var d = dateFromString(date || Utils.formatDate());
            var day = d.getDay();
            var delta = day === 0 ? -6 : 1 - day;
            d.setDate(d.getDate() + delta);
            var start = Utils.formatDate(d);
            return { start: start, end: addDays(start, 6) };
        },

        previousWeek(date) {
            var current = this.weekRange(date || Utils.formatDate());
            var start = addDays(current.start, -7);
            return { start: start, end: addDays(start, 6) };
        },

        scaleFood(food, amountG) {
            var ratio = clamp(amountG, 1, 5000) / 100;
            var scaled = normalizeFood({
                id: food.id,
                name: food.name,
                amountG: amountG,
                calories: number(food.per100g && food.per100g.calories) * ratio,
                carbsG: number(food.per100g && food.per100g.carbsG) * ratio,
                proteinG: number(food.per100g && food.per100g.proteinG) * ratio,
                fatG: number(food.per100g && food.per100g.fatG) * ratio,
                fiberG: number(food.per100g && food.per100g.fiberG) * ratio,
                vitaminCmg: number(food.per100g && food.per100g.vitaminCmg) * ratio,
                calciumMg: number(food.per100g && food.per100g.calciumMg) * ratio,
                ironMg: number(food.per100g && food.per100g.ironMg) * ratio,
                confidence: 1
            }, 0);
            scaled._per100g = Object.assign({}, food.per100g || {});
            return scaled;
        },

        sumFoods(foods) {
            var keys = ['calories', 'carbsG', 'proteinG', 'fatG', 'fiberG', 'vitaminCmg', 'calciumMg', 'ironMg'];
            var result = {};
            keys.forEach(function (key) { result[key] = 0; });
            (foods || []).forEach(function (food) {
                keys.forEach(function (key) { result[key] += number(food[key]); });
            });
            keys.forEach(function (key) {
                result[key] = round(result[key], key === 'calories' ? 0 : 1);
            });
            return result;
        },

        calculateBMR(profile) {
            if (!profile) return 0;
            var weight = clamp(profile.weightKg, 25, 400);
            var height = clamp(profile.heightCm, 100, 250);
            var age = clamp(profile.age, 13, 100);
            if (!weight || !height || !age) return 0;
            var sexOffset = profile.sex === 'male' ? 5 : -161;
            return round(10 * weight + 6.25 * height - 5 * age + sexOffset, 0);
        },

        calculateTargets(profile, todayExercise, averageExercise) {
            var bmr = this.calculateBMR(profile);
            if (!bmr) return null;
            var activity = this.ACTIVITY_FACTORS[profile.activityLevel] || this.ACTIVITY_FACTORS.light;
            var exerciseDelta = number(todayExercise) - number(averageExercise);
            var maintenance = bmr * activity + exerciseDelta;
            var targetCalories = Math.max(1200, maintenance + (this.GOAL_ADJUSTMENTS[profile.goal] || 0));
            var ratios = { carbs: 0.45, protein: 0.25, fat: 0.30 };
            return {
                bmr: round(bmr, 0),
                maintenanceCalories: round(maintenance, 0),
                calories: round(targetCalories, 0),
                carbsG: round(targetCalories * ratios.carbs / 4, 0),
                proteinG: round(targetCalories * ratios.protein / 4, 0),
                fatG: round(targetCalories * ratios.fat / 9, 0),
                fiberG: round(targetCalories / 1000 * 14, 0),
                method: 'Mifflin–St Jeor + 活动系数 + 当日运动差值',
                goal: profile.goal || 'maintain'
            };
        },

        parseMealAnalysis(raw) {
            var obj = parseJsonObject(raw);
            var sourceFoods = Array.isArray(obj.foods) ? obj.foods
                : (Array.isArray(obj.items) ? obj.items : []);
            var foods = sourceFoods.map(function (source, index) {
                var normalized = normalizeFood(source, index);
                var ratio = Math.max(1, normalized.amountG) / 100;
                normalized._per100g = {
                    calories: normalized.calories / ratio,
                    carbsG: normalized.carbsG / ratio,
                    proteinG: normalized.proteinG / ratio,
                    fatG: normalized.fatG / ratio,
                    fiberG: normalized.fiberG / ratio,
                    vitaminCmg: normalized.vitaminCmg / ratio,
                    calciumMg: normalized.calciumMg / ratio,
                    ironMg: normalized.ironMg / ratio
                };
                return normalized;
            }).filter(function (food) {
                return food.name && food.calories >= 0;
            });
            if (!foods.length) throw new Error('AI 未识别出可确认的食物');
            return {
                foods: foods,
                totals: this.sumFoods(foods),
                summary: safeText(obj.summary || obj.note || '请核对食物和份量后保存。', 240),
                warnings: Array.isArray(obj.warnings) ? obj.warnings.map(function (v) {
                    return safeText(v, 120);
                }).filter(Boolean).slice(0, 4) : [],
                confidence: round(clamp(obj.confidence === undefined ? 0.7 : obj.confidence, 0, 1), 2)
            };
        },

        parseExerciseAnalysis(raw) {
            var obj = parseJsonObject(raw);
            return {
                type: safeText(obj.type || obj.exerciseType || '运动', 60),
                durationMin: round(clamp(obj.durationMin || obj.duration || 0, 0, 1440), 0),
                caloriesBurned: round(clamp(obj.caloriesBurned || obj.calories || obj.kcal || 0, 0, 10000), 0),
                distanceKm: round(clamp(obj.distanceKm || obj.distance || 0, 0, 1000), 2),
                confidence: round(clamp(obj.confidence === undefined ? 0.7 : obj.confidence, 0, 1), 2)
            };
        },

        mealMessages(dataUrl, mealType) {
            var prompt = [
                '识别这张餐食照片，估算每种食物的可食用重量和营养。',
                '餐次：' + (mealType || '未指定') + '。',
                '必须只返回 JSON 对象，结构：',
                '{"foods":[{"name":"食物","amountG":100,"calories":100,"carbsG":10,"proteinG":10,"fatG":5,"fiberG":2,"vitaminCmg":0,"calciumMg":0,"ironMg":0,"confidence":0.7}],"summary":"核对提示","warnings":[],"confidence":0.7}',
                '数值为整餐估算值，不是每 100g。无法辨认时降低 confidence，不要虚构品牌。'
            ].join('\n');
            return [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ]
            }];
        },

        exerciseMessages(dataUrl) {
            var prompt = [
                '识别这张运动 App 截图中的运动摘要。',
                '必须只返回 JSON 对象：',
                '{"type":"跑步","durationMin":30,"caloriesBurned":260,"distanceKm":5,"confidence":0.8}',
                '只使用截图可见信息；缺失字段填 0。'
            ].join('\n');
            return [{
                role: 'user',
                content: [
                    { type: 'text', text: prompt },
                    { type: 'image_url', image_url: { url: dataUrl } }
                ]
            }];
        },

        aggregateMeals(meals) {
            var allFoods = [];
            (meals || []).forEach(function (meal) {
                allFoods = allFoods.concat(meal.foods || []);
            });
            return this.sumFoods(allFoods);
        },

        aggregateExercise(exercises) {
            return round((exercises || []).reduce(function (sum, item) {
                return sum + number(item.caloriesBurned);
            }, 0), 0);
        },

        micronutrientTargets(profile, days) {
            var multiplier = Math.max(1, number(days, 7));
            return {
                fiberG: 25 * multiplier,
                vitaminCmg: 75 * multiplier,
                calciumMg: 1000 * multiplier,
                ironMg: (profile && profile.sex === 'male' ? 8 : 18) * multiplier
            };
        },

        buildLocalWeeklyReport(meals, profile, range) {
            var totals = this.aggregateMeals(meals);
            var days = 7;
            var targets = this.micronutrientTargets(profile, days);
            var nutrients = {};
            var suggestions = [];
            var self = this;
            Object.keys(this.MICRO_TARGETS).forEach(function (key) {
                var meta = self.MICRO_TARGETS[key];
                var ratio = targets[key] ? totals[key] / targets[key] : 0;
                var status = ratio >= 0.8 ? '充足' : (ratio >= 0.5 ? '关注' : '可能不足');
                nutrients[key] = {
                    label: meta.label,
                    unit: meta.unit,
                    total: round(totals[key], 1),
                    target: round(targets[key], 1),
                    ratio: round(clamp(ratio, 0, 2), 2),
                    status: status
                };
                if (ratio < 0.8) suggestions.push(meta.label);
            });
            return {
                weekStart: range.start,
                weekEnd: range.end,
                source: 'local',
                mealCount: (meals || []).length,
                nutrients: nutrients,
                highlights: (meals || []).length
                    ? ['已根据 ' + meals.length + ' 条结构化饮食记录生成。']
                    : ['本周尚无足够饮食记录。'],
                suggestions: suggestions.length
                    ? ['下周优先补充：' + suggestions.join('、') + '。', '增加食物种类，并结合真实份量持续记录。']
                    : ['本周已记录的关键营养较均衡，继续保持多样化饮食。'],
                disclaimer: '营养数值为估算，仅用于生活记录，不替代医生或营养师建议。'
            };
        },

        weeklyPrompt(localReport) {
            return [
                '你是谨慎的饮食记录助手。请基于以下本地汇总写一份简短周报。',
                '必须只返回 JSON 对象：{"highlights":["..."],"suggestions":["..."],"summary":"..."}。',
                '不能诊断疾病，不能把“可能不足”表述为医学缺乏；建议必须是常见食物层面的可执行建议。',
                JSON.stringify(localReport)
            ].join('\n');
        },

        mergeAIWeeklyReport(localReport, raw) {
            var obj = parseJsonObject(raw);
            var merged = Object.assign({}, localReport);
            merged.source = 'ai';
            merged.highlights = Array.isArray(obj.highlights)
                ? obj.highlights.map(function (v) { return safeText(v, 160); }).filter(Boolean).slice(0, 4)
                : localReport.highlights;
            merged.suggestions = Array.isArray(obj.suggestions)
                ? obj.suggestions.map(function (v) { return safeText(v, 160); }).filter(Boolean).slice(0, 5)
                : localReport.suggestions;
            merged.summary = safeText(obj.summary, 320);
            return merged;
        }
    };

    var Nutrition = {
        async getProfile() {
            return (await Database.get(STORE, 'nutrition-profile')) || null;
        },

        async saveProfile(profile) {
            var existing = await this.getProfile();
            var now = Utils.now();
            var record = {
                id: 'nutrition-profile',
                kind: 'profile',
                date: '',
                weekStart: '',
                sex: profile.sex === 'male' ? 'male' : 'female',
                age: clamp(profile.age, 13, 100),
                heightCm: clamp(profile.heightCm, 100, 250),
                weightKg: clamp(profile.weightKg, 25, 400),
                activityLevel: NutritionEngine.ACTIVITY_FACTORS[profile.activityLevel] ? profile.activityLevel : 'light',
                goal: NutritionEngine.GOAL_ADJUSTMENTS[profile.goal] !== undefined ? profile.goal : 'maintain',
                createdAt: existing ? existing.createdAt : now
            };
            await Database.put(STORE, record);
            return record;
        },

        async saveMeal(input) {
            var now = Utils.now();
            var foods = (input.foods || []).map(normalizeFood);
            var record = {
                id: input.id || Utils.generateId(),
                kind: 'meal',
                date: input.date || Utils.formatDate(),
                weekStart: NutritionEngine.weekRange(input.date || Utils.formatDate()).start,
                mealType: safeText(input.mealType || '加餐', 20),
                foods: foods,
                totals: NutritionEngine.sumFoods(foods),
                source: input.source === 'ai' ? 'ai' : 'manual',
                note: safeText(input.note, 240),
                confidence: round(clamp(input.confidence === undefined ? 1 : input.confidence, 0, 1), 2),
                createdAt: input.createdAt || now
            };
            // 显式白名单，不接受 photo/dataUrl/image 等原始图片字段。
            await Database.put(STORE, record);
            return record;
        },

        async saveExercise(input) {
            var now = Utils.now();
            var record = {
                id: input.id || Utils.generateId(),
                kind: 'exercise',
                date: input.date || Utils.formatDate(),
                weekStart: NutritionEngine.weekRange(input.date || Utils.formatDate()).start,
                type: safeText(input.type || '运动', 60),
                durationMin: round(clamp(input.durationMin, 0, 1440), 0),
                caloriesBurned: round(clamp(input.caloriesBurned, 0, 10000), 0),
                distanceKm: round(clamp(input.distanceKm, 0, 1000), 2),
                source: input.source === 'ai' ? 'ai' : 'manual',
                note: safeText(input.note, 240),
                confidence: round(clamp(input.confidence === undefined ? 1 : input.confidence, 0, 1), 2),
                createdAt: input.createdAt || now
            };
            await Database.put(STORE, record);
            return record;
        },

        async getByDate(date) {
            var rows = await Database.getByIndex(STORE, 'date', date);
            return {
                meals: rows.filter(function (row) { return row.kind === 'meal'; })
                    .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); }),
                exercises: rows.filter(function (row) { return row.kind === 'exercise'; })
                    .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); })
            };
        },

        async getMealsInRange(start, end) {
            var rows = await Database.getByIndex(STORE, 'kind', 'meal');
            return rows.filter(function (row) { return row.date >= start && row.date <= end; });
        },

        async getExercisesInRange(start, end) {
            var rows = await Database.getByIndex(STORE, 'kind', 'exercise');
            return rows.filter(function (row) { return row.date >= start && row.date <= end; });
        },

        async deleteRecord(id) {
            return Database.delete(STORE, id);
        },

        async getWeeklyReport(weekStart) {
            return (await Database.get(STORE, 'nutrition-week-' + weekStart)) || null;
        },

        async saveWeeklyReport(report) {
            var existing = await this.getWeeklyReport(report.weekStart);
            var record = Object.assign({}, report, {
                id: 'nutrition-week-' + report.weekStart,
                kind: 'weeklyReport',
                date: report.weekEnd,
                weekStart: report.weekStart,
                createdAt: existing ? existing.createdAt : Utils.now()
            });
            await Database.put(STORE, record);
            return record;
        },

        async generateWeeklyReport(range, options) {
            options = options || {};
            var existing = await this.getWeeklyReport(range.start);
            if (existing && !options.force) return existing;
            var profile = await this.getProfile();
            var meals = await this.getMealsInRange(range.start, range.end);
            var localReport = NutritionEngine.buildLocalWeeklyReport(meals, profile, range);
            var report = localReport;
            if (options.useAI !== false && meals.length >= 3) {
                try {
                    var response = await AIClient.chat({
                        prompt: NutritionEngine.weeklyPrompt(localReport),
                        responseFormat: { type: 'json_object' },
                        temperature: 0.2
                    });
                    report = NutritionEngine.mergeAIWeeklyReport(localReport, response.content);
                } catch (error) {
                    report.fallbackReason = safeText(error.message, 160);
                }
            }
            return this.saveWeeklyReport(report);
        },

        async analyzeMealPhoto(dataUrl, mealType) {
            var response = await AIClient.chat({
                messages: NutritionEngine.mealMessages(dataUrl, mealType),
                responseFormat: { type: 'json_object' },
                temperature: 0.1,
                maxTokens: 1200
            });
            return NutritionEngine.parseMealAnalysis(response.content);
        },

        async analyzeExerciseScreenshot(dataUrl) {
            var response = await AIClient.chat({
                messages: NutritionEngine.exerciseMessages(dataUrl),
                responseFormat: { type: 'json_object' },
                temperature: 0.1,
                maxTokens: 500
            });
            return NutritionEngine.parseExerciseAnalysis(response.content);
        }
    };

    LifeOS.NutritionEngine = NutritionEngine;
    LifeOS.Nutrition = Nutrition;
    console.log('[LifeOS] nutrition.js 加载完成 ✓');
})();
