const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createLifeOS(aiOverrides = {}) {
    const records = new Map();
    let counter = 0;
    const database = {
        async put(store, value) {
            assert.strictEqual(store, 'nutrition');
            records.set(value.id, structuredClone({ ...value, updatedAt: '2026-08-01T00:00:00.000Z', updatedBy: 'dev-test', deletedAt: null }));
            return value.id;
        },
        async getByIndex(store, index, value) {
            return Array.from(records.values()).filter(row => !row.deletedAt && row[index] === value).map(structuredClone);
        },
        async delete(store, id) {
            const value = records.get(id);
            if (value) value.deletedAt = '2026-08-01T00:00:00.000Z';
        }
    };
    const LifeOS = {
        Utils: {
            generateId: () => `id-${++counter}`,
            formatDate: () => '2026-08-01',
            now: () => '2026-08-01T00:00:00.000Z',
            parseJSONSafe: (raw, fallback) => {
                try {
                    const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
                    return JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
                } catch { return fallback; }
            },
            compressImage: async value => value
        },
        Database: database,
        AIClient: {
            async chat() { throw new Error('AI not used in unit tests'); },
            extractText(response) { return response.choices[0].message.content; },
            ...aiOverrides
        }
    };
    const context = vm.createContext({ window: { LifeOS }, console, Number, String, Object, Array, Set, Map, Math, Date, JSON, Error });
    const source = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'js', 'health-reports.js'), 'utf8');
    vm.runInContext(source, context);
    return { LifeOS, records };
}

async function testParseHealthReportAnalysis() {
    const { LifeOS } = createLifeOS();
    const parsed = LifeOS.HealthReportEngine.parseAnalysis(JSON.stringify({
        reportType: 'lab', reportDate: '2026-07-20', provider: '示例医院',
        metrics: [{ name: '低密度脂蛋白胆固醇', value: '3.7', unit: 'mmol/L', referenceLow: 0, referenceHigh: 3.4, flag: '偏高', page: 2 }]
    }));
    assert.strictEqual(parsed.reportType, 'lab');
    assert.strictEqual(parsed.metrics[0].key, 'ldl_c');
    assert.strictEqual(parsed.metrics[0].numericValue, 3.7);
    assert.strictEqual(parsed.metrics[0].adviceLevel, 'attention');
}

async function testCanonicalMetricAliases() {
    const { LifeOS } = createLifeOS();
    const key = LifeOS.HealthReportEngine.canonicalMetricKey;
    assert.strictEqual(key('谷丙转氨酶'), 'alt');
    assert.strictEqual(key('体脂率'), 'body_fat_pct');
    assert.strictEqual(key('自定义指标'), key('自定义 指标'));
}

async function testMergeAnalysisDeduplicatesMetrics() {
    const { LifeOS } = createLifeOS();
    const engine = LifeOS.HealthReportEngine;
    const a = engine.parseAnalysis({ title: '年度体检', reportDate: '2026-07-20', metrics: [{ name: '体重', value: '70', unit: 'kg', page: 1 }] });
    const b = engine.parseAnalysis({ title: '健康报告', metrics: [{ name: '体重', value: '70', unit: 'kg', page: 1 }, { name: 'BMI', value: '22.1', page: 2 }] });
    const merged = engine.mergeAnalyses([a, b]);
    assert.strictEqual(merged.metrics.length, 2);
    assert.strictEqual(merged.title, '年度体检');
}

async function testPersistenceDropsOriginalFiles() {
    const { LifeOS, records } = createLifeOS();
    const report = await LifeOS.HealthReports.saveReport({
        reportType: 'body_scale', reportDate: '2026-07-19', title: '体重秤报告', sourceType: 'images', pageCount: 1,
        file: { name: 'secret.pdf' }, dataUrl: 'data:image/jpeg;base64,secret', images: ['secret'],
        metrics: [{ name: '体重', value: '70.1', numericValue: 70.1, unit: 'kg', adviceLevel: 'normal' }]
    });
    const persisted = records.get(report.id);
    assert.strictEqual(persisted.kind, 'healthReport');
    assert.strictEqual(persisted.file, undefined);
    assert.strictEqual(persisted.dataUrl, undefined);
    assert.strictEqual(persisted.images, undefined);
}

async function testOverviewAndTrend() {
    const { LifeOS } = createLifeOS();
    const engine = LifeOS.HealthReportEngine;
    const reports = [
        { id: 'a', date: '2026-06-01', metrics: [{ key: 'weight_kg', numericValue: 72, unit: 'kg', adviceLevel: 'normal' }] },
        { id: 'b', date: '2026-07-01', metrics: [{ key: 'weight_kg', numericValue: 70, unit: 'kg', adviceLevel: 'attention' }] }
    ];
    assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.overview(reports))), { normal: 1, attention: 1, followup: 0, unknown: 0 });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(engine.trend(reports, 'weight_kg').map(v => v.value))), [72, 70]);
}

async function testDeleteUsesTombstone() {
    const { LifeOS, records } = createLifeOS();
    const report = await LifeOS.HealthReports.saveReport({ reportDate: '2026-07-19', metrics: [{ name: 'BMI', value: '22.1' }] });
    await LifeOS.HealthReports.deleteReport(report.id);
    assert.ok(records.get(report.id).deletedAt);
    assert.strictEqual((await LifeOS.HealthReports.getReports()).length, 0);
}

async function testAnalyzePreparedExtractsChatResponseContent() {
    let capturedOptions = null;
    const { LifeOS } = createLifeOS({
        async chat(options) {
            capturedOptions = options;
            return { choices: [{ message: { content: JSON.stringify({
                reportType: 'lab', reportDate: '2026-07-20', title: '合成化验单',
                metrics: [{ name: '空腹血糖', value: '5.2', unit: 'mmol/L', flag: 'normal' }]
            }) } }] };
        },
        extractText(response) { return response.choices[0].message.content; }
    });
    const result = await LifeOS.HealthReports.analyzePrepared({
        sourceType: 'pdf', pageCount: 1,
        batches: [{ kind: 'text', text: 'synthetic report text', label: 'PDF 文字批次 1' }]
    });
    assert.strictEqual(result.metrics.length, 1);
    assert.strictEqual(result.metrics[0].key, 'fasting_glucose');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(capturedOptions.responseFormat)), { type: 'json_object' });
}

async function testPageIncludesLocalDecodersAndPrivacyCopy() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'LifeOS', 'nutrition.html'), 'utf8');
    assert.ok(html.includes('vendor/pdfjs/pdf.min.js'));
    assert.ok(html.includes('vendor/heic2any/heic2any.min.js'));
    assert.ok(html.includes('vendor/utif/UTIF.js'));
    assert.ok(html.includes('原件不保存'));
    assert.ok(html.includes('健康总览'));
}

const tests = [
    testParseHealthReportAnalysis,
    testCanonicalMetricAliases,
    testMergeAnalysisDeduplicatesMetrics,
    testPersistenceDropsOriginalFiles,
    testOverviewAndTrend,
    testDeleteUsesTombstone,
    testAnalyzePreparedExtractsChatResponseContent,
    testPageIncludesLocalDecodersAndPrivacyCopy
];

(async () => {
    for (const test of tests) {
        await test();
        console.log(`PASS ${test.name}`);
    }
    console.log(`\n健康报告测试全部通过（${tests.length} 项）✓`);
})().catch(error => {
    console.error(error);
    process.exit(1);
});
