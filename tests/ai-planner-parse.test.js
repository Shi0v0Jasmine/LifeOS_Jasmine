/* 模拟 AIPlanner 解析健壮性测试（与 core.js Utils.parseJSONSafe/_extractArrayFromJSON/_coerceTaskArray 保持同步） */
function parseJSONSafe(str, fallback = null) {
    if (!str) return fallback;
    const trimmed = String(str).trim();
    try { return JSON.parse(trimmed); } catch (e) {}
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        try { return JSON.parse(codeBlockMatch[1].trim()); } catch (e) {}
    }
    const jsonStart = trimmed.indexOf('[');
    const jsonEnd = trimmed.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
        try { return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1)); } catch (e) {}
    }
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
        try { return JSON.parse(trimmed.slice(objStart, objEnd + 1)); } catch (e) {}
    }
    return fallback;
}

function extractArrayFromJSON(data) {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
        if (Array.isArray(data.tasks)) return data.tasks;
        if (Array.isArray(data.plans)) return data.plans;
        if (Array.isArray(data.result)) return data.result;
        if (Array.isArray(data.subtasks)) return data.subtasks;
        for (const key in data) {
            if (Array.isArray(data[key])) return data[key];
        }
    }
    return null;
}

// json_object 模式下模型可能把结果“对象化”：单任务对象或编号字典，统一兜底为数组
function coerceTaskArray(data) {
    const arr = extractArrayFromJSON(data);
    if (arr) return arr;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        if (typeof data.title === 'string' && data.title.trim()) return [data];
        const values = Object.values(data).filter(v =>
            v && typeof v === 'object' && !Array.isArray(v) &&
            typeof v.title === 'string' && v.title.trim());
        if (values.length) return values;
    }
    return null;
}

function normalizePlan(parsed) {
    const result = coerceTaskArray(parsed);
    if (!Array.isArray(result)) throw new Error('AI 返回的任务计划格式不正确');
    return result.map(item => ({
        title: item.title || '',
        description: item.description || '',
        deadline: item.deadline || null,
        subtasks: Array.isArray(item.subtasks) ? item.subtasks.map(s => ({
            title: s.title || '',
            deadline: s.deadline || null,
            note: s.note || ''
        })).filter(s => s.title) : []
    })).filter(item => item.title);
}

const cases = [
    { name: '直接数组', text: '[{"title":"A","deadline":"2026-07-10","description":"","subtasks":[]}]', expect: 1 },
    { name: '对象包裹 tasks（json_object 标准契约）', text: '{"tasks":[{"title":"A","deadline":"2026-07-10","description":"","subtasks":[]}]}', expect: 1 },
    { name: 'markdown 代码块', text: '```json\n{"tasks":[{"title":"A","deadline":"2026-07-10"}]}\n```', expect: 1 },
    { name: '空数组', text: '[]', expect: 0 },
    { name: '纯对象无数组（单任务对象兜底）', text: '{"title":"A","deadline":"2026-07-10"}', expect: 1 },
    { name: 'JSON 前后有文本', text: '这是结果：{"tasks":[{"title":"A","deadline":"2026-07-10"}]} 结束', expect: 1 },
    { name: '编号字典（{"1":{...},"2":{...}}）', text: '{"1":{"title":"A","deadline":null},"2":{"title":"B","deadline":"2026-07-11"}}', expect: 2 },
    { name: '完全非 JSON（fallback 为空计划，UI 提示未能识别）', text: '抱歉，我无法理解这个输入', expect: 0 },
];

let pass = 0;
for (const c of cases) {
    try {
        const parsed = parseJSONSafe(c.text, []);
        const plan = normalizePlan(parsed);
        if (c.expect === 'throw') {
            console.log(`❌ ${c.name}: 应抛错但解析成功（${plan.length} 项）`);
            continue;
        }
        if (plan.length !== c.expect) {
            console.log(`❌ ${c.name}: 期望 ${c.expect} 项，实际 ${plan.length} 项`);
            continue;
        }
        console.log(`✅ ${c.name}: ${plan.length} 项`);
        pass++;
    } catch (e) {
        if (c.expect === 'throw') {
            console.log(`✅ ${c.name}: 按预期抛错（${e.message}）`);
            pass++;
        } else {
            console.log(`❌ ${c.name}: ${e.message}`);
        }
    }
}
console.log(`\n通过 ${pass}/${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
