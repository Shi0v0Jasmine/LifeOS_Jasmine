const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createLifeOS() {
    const records = new Map();
    let counter = 0;
    const database = {
        async put(store, value) {
            assert.strictEqual(store, 'nutrition');
            records.set(value.id, structuredClone({ ...value, updatedAt: '2026-07-30T00:00:00.000Z', updatedBy: 'dev-test', deletedAt: null }));
            return value.id;
        },
        async get(store, id) {
            const value = records.get(id);
            return value && !value.deletedAt ? structuredClone(value) : undefined;
        },
        async getByIndex(store, index, value) {
            return Array.from(records.values())
                .filter(row => !row.deletedAt && row[index] === value)
                .map(value => structuredClone(value));
        },
        async delete(store, id) {
            const value = records.get(id);
            if (value) value.deletedAt = '2026-07-30T00:00:00.000Z';
        }
    };
    const LifeOS = {
        Utils: {
            generateId: () => `id-${++counter}`,
            formatDate: (date = new Date(2026, 6, 30)) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            },
            now: () => '2026-07-30T00:00:00.000Z',
            parseJSONSafe: (text, fallback) => {
                try {
                    const cleaned = text.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
                    const start = cleaned.indexOf('{');
                    const end = cleaned.lastIndexOf('}');
                    return JSON.parse(cleaned.slice(start, end + 1));
                } catch {
                    return fallback;
                }
            }
        },
        Database: database,
        AIClient: {
            async chat() { throw new Error('AI unavailable in local test'); }
        }
    };
    const context = vm.createContext({ window: { LifeOS }, console, Date, Math, Number, Object, Array, String, JSON, Error });
    const source = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'js', 'nutrition.js'), 'utf8');
    vm.runInContext(source, context);
    return { LifeOS, records };
}

async function testBMRAndTargets() {
    const { LifeOS } = createLifeOS();
    const engine = LifeOS.NutritionEngine;
    assert.strictEqual(engine.calculateBMR({ sex: 'female', age: 30, heightCm: 165, weightKg: 60 }), 1320);
    const targets = engine.calculateTargets({ sex: 'female', age: 30, heightCm: 165, weightKg: 60, activityLevel: 'light', goal: 'lose' }, 300, 200);
    assert.strictEqual(targets.calories, 1515);
    assert.ok(targets.carbsG > targets.proteinG);
}

async function testScaleAndSumFood() {
    const { LifeOS } = createLifeOS();
    const engine = LifeOS.NutritionEngine;
    const rice = engine.scaleFood({ id: 'rice', name: '米饭', per100g: { calories: 130, carbsG: 28, proteinG: 2.7, fatG: 0.3 } }, 150);
    assert.strictEqual(rice.calories, 195);
    assert.strictEqual(engine.sumFoods([rice, rice]).calories, 390);
}

async function testMealParserNormalizesJsonObject() {
    const { LifeOS } = createLifeOS();
    const parsed = LifeOS.NutritionEngine.parseMealAnalysis('```json\n{"foods":[{"name":"鸡胸肉","amountG":120,"kcal":198,"protein":37.2}],"summary":"估算"}\n```');
    assert.strictEqual(parsed.foods.length, 1);
    assert.strictEqual(parsed.foods[0].proteinG, 37.2);
    assert.strictEqual(parsed.totals.calories, 198);
}

async function testExerciseParser() {
    const { LifeOS } = createLifeOS();
    const parsed = LifeOS.NutritionEngine.parseExerciseAnalysis('{"exerciseType":"跑步","duration":30,"kcal":260,"distance":5}');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(parsed)), {
        type: '跑步', durationMin: 30, caloriesBurned: 260, distanceKm: 5, confidence: 0.7
    });
}

async function testMealPersistenceDropsImage() {
    const { LifeOS, records } = createLifeOS();
    const meal = await LifeOS.Nutrition.saveMeal({
        date: '2026-07-30',
        mealType: '午餐',
        source: 'ai',
        photo: 'data:image/jpeg;base64,secret',
        dataUrl: 'data:image/jpeg;base64,secret',
        foods: [{ name: '米饭', amountG: 100, calories: 130, carbsG: 28 }]
    });
    const persisted = records.get(meal.id);
    assert.strictEqual(persisted.photo, undefined);
    assert.strictEqual(persisted.dataUrl, undefined);
    assert.strictEqual(persisted.kind, 'meal');
}

async function testProfileAndDailyQuery() {
    const { LifeOS } = createLifeOS();
    await LifeOS.Nutrition.saveProfile({ sex: 'male', age: 28, heightCm: 178, weightKg: 72, activityLevel: 'moderate', goal: 'maintain' });
    await LifeOS.Nutrition.saveMeal({ date: '2026-07-30', mealType: '早餐', foods: [{ name: '燕麦', amountG: 60, calories: 230 }] });
    await LifeOS.Nutrition.saveExercise({ date: '2026-07-30', type: '步行', durationMin: 40, caloriesBurned: 160 });
    const day = await LifeOS.Nutrition.getByDate('2026-07-30');
    assert.strictEqual(day.meals.length, 1);
    assert.strictEqual(day.exercises.length, 1);
    assert.strictEqual((await LifeOS.Nutrition.getProfile()).goal, 'maintain');
}

async function testWeekRangeUsesNaturalMonday() {
    const { LifeOS } = createLifeOS();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(LifeOS.NutritionEngine.weekRange('2026-07-30'))), {
        start: '2026-07-27', end: '2026-08-02'
    });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(LifeOS.NutritionEngine.previousWeek('2026-07-30'))), {
        start: '2026-07-20', end: '2026-07-26'
    });
}

async function testLocalWeeklyReport() {
    const { LifeOS } = createLifeOS();
    const report = LifeOS.NutritionEngine.buildLocalWeeklyReport([
        { foods: [{ calories: 500, fiberG: 8, vitaminCmg: 60, calciumMg: 300, ironMg: 4 }] }
    ], { sex: 'female' }, { start: '2026-07-20', end: '2026-07-26' });
    assert.strictEqual(report.source, 'local');
    assert.strictEqual(report.mealCount, 1);
    assert.ok(report.nutrients.fiberG.status);
    assert.ok(report.suggestions.length > 0);
}

async function testWeeklyReportIsIdempotentAndFallsBack() {
    const { LifeOS } = createLifeOS();
    for (let i = 0; i < 3; i++) {
        await LifeOS.Nutrition.saveMeal({ date: `2026-07-2${i}`, mealType: '午餐', foods: [{ name: '米饭', amountG: 100, calories: 130 }] });
    }
    const range = { start: '2026-07-20', end: '2026-07-26' };
    const first = await LifeOS.Nutrition.generateWeeklyReport(range, { useAI: true });
    const second = await LifeOS.Nutrition.generateWeeklyReport(range, { useAI: true });
    assert.strictEqual(first.id, second.id);
    assert.strictEqual(first.source, 'local');
    assert.ok(first.fallbackReason.includes('AI unavailable'));
}

const tests = [
    testBMRAndTargets,
    testScaleAndSumFood,
    testMealParserNormalizesJsonObject,
    testExerciseParser,
    testMealPersistenceDropsImage,
    testProfileAndDailyQuery,
    testWeekRangeUsesNaturalMonday,
    testLocalWeeklyReport,
    testWeeklyReportIsIdempotentAndFallsBack
];

(async () => {
    for (const test of tests) {
        await test();
        console.log(`✓ ${test.name}`);
    }
    console.log(`\nAI 饮食测试全部通过（${tests.length} 项）✓`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
