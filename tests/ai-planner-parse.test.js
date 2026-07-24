/* 模拟 AIPlanner 解析健壮性测试 */
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

function normalizePlan(parsed) {
    const result = extractArrayFromJSON(parsed) || parsed;
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
    { name: '直接数组', text: '[{"title":"A","deadline":"2026-07-10","description":"","subtasks":[]}]' },
    { name: '对象包裹 tasks', text: '{"tasks":[{"title":"A","deadline":"2026-07-10","description":"","subtasks":[]}]}' },
    { name: 'markdown 代码块', text: '```json\n[{"title":"A","deadline":"2026-07-10"}]\n```' },
    { name: '空数组', text: '[]' },
    { name: '纯对象无数组', text: '{"title":"A","deadline":"2026-07-10"}' },
    { name: 'JSON 前后有文本', text: '这是结果：[{"title":"A","deadline":"2026-07-10"}] 结束' },
];

let pass = 0;
for (const c of cases) {
    try {
        const parsed = parseJSONSafe(c.text, []);
        const plan = normalizePlan(parsed);
        console.log(`✅ ${c.name}: ${plan.length} 项`);
        pass++;
    } catch (e) {
        console.log(`❌ ${c.name}: ${e.message}`);
    }
}
console.log(`\n通过 ${pass}/${cases.length}`);
