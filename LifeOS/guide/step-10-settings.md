# Step 10: 设置模块（Settings）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建完整的设置页面，包含 AI 配置、数据管理、通知体验、API 调用历史、关于信息

---

## 一、为什么这么做？

### 1.1 为什么设置是 v1.0 的 Must Have？

**设置不是"锦上添花"，而是"基础设施"。** 没有设置页面，以下功能无法使用：

| 功能 | 为什么需要设置页面 | 没有设置的后果 |
|------|------------------|--------------|
| **AI 分析** | 需要配置 Base URL + API Key + 模型 | GRAI 分析、饮食 AI、学习关键词提取全部不可用 |
| **数据备份** | 需要导出/导入入口 | 用户数据困在 IndexedDB 中，换设备/换浏览器时丢失 |
| **数据库重置** | 需要清除入口 | 测试数据污染后无法清理，只能手动删除 IndexedDB |
| **角色激励开关** | 用户可能不想被打扰 | 强制弹窗会降低用户体验，导致用户关闭整个 App |
| **离线模式** | 没有网络时的降级策略 | API 调用失败时应用崩溃或无限重试 |

**为什么不是 v1.1 而是 v1.0？** 因为数据安全是底线（F-008 Must Have），API 配置是 AI 功能的前提（F-009 Must Have），而 AI 分析又是 PRD 中的核心功能（F-062 GRAI 分析）。没有设置页面，这些 Must Have 功能无法完整交付。

### 1.2 为什么 API 配置存储在 IndexedDB 而非 localStorage？

| 存储方式 | 优点 | 缺点 | 适用场景 |
|---------|------|------|---------|
| **localStorage** | 简单易用 | 同步 API 阻塞主线程，容量限制 5MB，明文存储无加密 | 简单配置项 |
| **IndexedDB** | 异步不阻塞，容量大（通常 50MB+），结构化存储 | API 较复杂 | 大量数据、敏感数据 |

**API Key 是敏感信息**。虽然 IndexedDB 也不是加密存储（任何能访问浏览器的代码都能读取），但至少：
1. 不会出现在 `localStorage` 的明文视图中（开发者工具 → Application → Local Storage 一眼可见）
2. 与业务数据统一存储，便于导出/导入时一起备份
3. 支持结构化查询（`settings` store 的 `key` 作为索引）

### 1.3 为什么 API 调用历史是 Should Have 而非 Nice to Have？

**API 调用历史解决三个真实问题**：

| 问题 | 场景 | 历史记录的价值 |
|------|------|--------------|
| **费用监控** | "我这个月 AI 用了多少钱？" | 查看调用次数和模型，估算 token 消耗 |
| **故障排查** | "为什么 GRAI 分析突然不工作了？" | 查看最近几次调用的状态码，定位是网络问题还是 API 配额耗尽 |
| **调试开发** | "我昨天测试了哪个模型？" | 回顾测试历史，避免重复尝试 |

**为什么只保留最近 50 条？** 50 条大约覆盖一周的使用（假设每天 5-10 次 AI 调用），既满足排查需求，又不会占用过多存储空间。超过 50 条后自动丢弃旧记录，这是**固定窗口滑动（Fixed Window）**的日志策略。

### 1.4 为什么导入策略要区分"合并"和"覆盖"？

| 策略 | 行为 | 适用场景 | 风险 |
|------|------|---------|------|
| **合并** | 保留现有数据，只添加备份中不存在的记录（基于 ID 判断） | 换设备后恢复数据、多人共享数据 | 可能出现重复 ID 冲突（概率极低，因为 UUID 唯一） |
| **覆盖** | 先清空所有数据，再写入备份 | 数据损坏后完全恢复、重置到某个历史状态 | 会丢失备份生成后新增的数据 |

**为什么默认是"合并"？** 因为用户最常见的场景是"换浏览器/换设备时恢复数据"，此时不希望丢失新设备上已创建的记录。"覆盖"是高级操作，需要用户明确确认。

---

## 二、技术实现

### 2.1 设置项的数据模型

```javascript
// settings store 的 key-value 结构
{
    key: 'apiBaseUrl',      value: 'https://api.openai.com/v1',
    key: 'apiKey',          value: 'sk-...',
    key: 'apiModel',        value: 'gpt-4o',
    key: 'apiCustomModel',  value: 'qwen2.5-72b',
    key: 'enableEncourage', value: true,
    key: 'offlineMode',     value: false,
    key: 'autoSave',        value: true,
    key: 'apiHistory',      value: [{ time, success, endpoint, status }, ...]
}
```

**为什么不用一个 JSON 对象存储所有设置？** 如果用一个对象 `settings: { apiBaseUrl, apiKey, ... }`，每次修改任何一个字段都需要重写整个对象。用独立的 key-value 对，可以：
- 单独读取/修改某个设置（如只改 `enableEncourage` 而不影响 API 配置）
- 避免并发修改时的覆盖问题（虽然 IndexedDB 是单线程的，但逻辑上更清晰）

### 2.2 数据库重置的实现

```javascript
async reset() {
    await this.init();
    const stores = Array.from(this.db.objectStoreNames);
    for (const name of stores) {
        await new Promise((resolve, reject) => {
            const tx = this.db.transaction([name], 'readwrite');
            const store = tx.objectStore(name);
            const req = store.clear();  // 清空 store，但保留结构
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}
```

**为什么用 `store.clear()` 而非 `deleteDatabase()`？** `deleteDatabase()` 会删除整个数据库（包括结构、版本号、索引），下次打开时需要重新执行 `onupgradeneeded`，重新创建所有 Object Store。`store.clear()` 只删除数据，保留结构，重置后应用可以直接使用，无需重新初始化。

### 2.3 API 测试连接的实现

```javascript
const testConnection = async () => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model || 'gpt-4o-mini',
            messages: [{ role: 'user', content: 'Hi' }],
            max_tokens: 5  // 最小请求，减少 token 消耗
        })
    });
    // 200 OK = 配置正确；4xx = 配置错误（Key 无效/模型不存在）；5xx = 服务端问题
};
```

**为什么用 `max_tokens: 5`？** 测试连接只需要验证"能连通"，不需要完整响应。`max_tokens: 5` 使请求成本极低（通常 < 0.001 美元），且响应速度极快（几乎无生成延迟）。

**为什么测试请求也记录到调用历史？** 测试请求是真实的 API 调用，会消耗 token 和配额。记录到历史有助于用户追踪"我为了测试花了多少钱"。

### 2.4 开关按钮的交互设计

```css
.toggle-switch {
    width: 44px; height: 24px; border-radius: 12px;
    background: var(--border-light);  /* 关闭状态：灰色 */
    cursor: pointer; transition: background 0.2s;
}
.toggle-switch.on {
    background: var(--color-mint);     /* 开启状态：绿色 */
}
.toggle-switch::after {
    content: ''; width: 20px; height: 20px; border-radius: 50%;
    background: white; transition: transform 0.2s;
    /* 关闭时在左侧，开启时滑动到右侧 */
}
.toggle-switch.on::after { transform: translateX(20px); }
```

**为什么用 CSS 伪元素 `::after` 做滑块而非一个独立的 div？** 减少 DOM 节点数。一个 `div` 即可完成背景和滑块两种视觉元素，通过伪元素实现滑块，CSS 纯动画，无需 JS 干预。

### 2.5 设置项的默认值策略

```javascript
const loadSettings = async () => {
    const baseUrl = await LifeOS.Settings.get('apiBaseUrl', '');      // 默认空字符串
    const apiKey = await LifeOS.Settings.get('apiKey', '');             // 默认空字符串
    const model = await LifeOS.Settings.get('apiModel', 'gpt-4o');     // 默认 GPT-4o
    const encourage = await LifeOS.Settings.get('enableEncourage', true); // 默认开启
    const offline = await LifeOS.Settings.get('offlineMode', false);    // 默认关闭
    const autoSave = await LifeOS.Settings.get('autoSave', true);        // 默认开启
};
```

**为什么每个设置项都有默认值？** 避免首次使用时 `undefined` 导致 UI 显示异常。例如 `enableEncourage` 默认 `true` 是因为角色激励是 App 的核心特色，新用户应该默认体验。`offlineMode` 默认 `false` 是因为在线 AI 功能更强大，只有在用户明确选择时才降级。

---

## 三、文件结构

```
LifeOS/
├── settings.html          ← 设置页面（本 Step 生成）
│   ├── 通用 AI 配置卡片：Base URL / API Key / 模型选择 / 测试连接
│   ├── 数据管理卡片：导出 / 导入（合并/覆盖）/ 清除全部数据
│   ├── 通知与体验卡片：角色激励开关 / 离线模式 / 自动保存
│   ├── API 调用历史卡片：时间/成功/端点/状态码列表
│   └── 关于卡片：版本信息 / 开源链接
├── js/core.js
│   └── Database.reset()  ← 清空所有 Object Store 的数据
└── css/style.css          ← 复用全局变量
```

---

## 四、数据流

```
用户打开 settings.html
    ↓
onMounted → loadSettings()
    ↓
LifeOS.Settings.get('apiBaseUrl', '') → 有值则填充表单，无值则显示占位符
    ↓
Vue 响应式渲染表单
    ↓
用户填写 API 配置 → 点击"保存配置"
    ↓
LifeOS.Settings.set('apiBaseUrl', value) → IndexedDB: settings store
    ↓
alert('配置已保存！')
    ↓
用户点击"测试连接"
    ↓
fetch(baseUrl + '/chat/completions', { ... }) → 发送最小请求
    ↓
成功：显示绿色成功提示 + 记录到 apiHistory
失败：显示红色错误提示 + 记录到 apiHistory
    ↓
用户点击"清除全部数据"
    ↓
确认弹窗 → LifeOS.Database.reset() → 清空所有 store
    ↓
alert('数据已清除') → 页面刷新
```

---

## 五、踩坑记录

### 坑 1：Database.reset() 不存在

初始代码尝试调用 `LifeOS.Database.reset()`，但 core.js 中没有这个方法。需要添加：

```javascript
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
}
```

### 坑 2：fetch 请求跨域问题

测试连接时，如果 Base URL 指向第三方 API（如 OpenAI），可能会遇到 CORS 错误：

```
Access to fetch at 'https://api.openai.com/v1/chat/completions' from origin 'file://' has been blocked by CORS policy.
```

**解决方案**：在 `file://` 协议下，fetch 到外部 API 通常会被浏览器 CORS 策略阻止。这是安全限制，无法在前端解决。实际部署到服务器时（HTTPS 域名），CORS 问题由后端代理或 API 提供商的 CORS 配置解决。在设置页面中，测试连接的失败也是有效的"测试"——它告诉用户"配置可能正确，但当前环境不允许直接访问"。

### 坑 3：文件输入的 reset

导入文件选择后，如果导入失败，再次点击"导入"需要重新选择文件。因为 `<input type="file">` 的值在导入后不会自动清空，需要手动设置 `input.value = ''`：

```javascript
const handleImportFile = (e) => { importFile.value = e.target.files[0]; };
const confirmImport = async () => {
    try { ... }
    catch (err) {
        importFile.value = null;
        if (importFileInput.value) importFileInput.value.value = ''; // 清空 input
    }
};
```

### 坑 4：API Key 的 type="password"

`<input type="password">` 会隐藏输入内容（显示圆点），但在浏览器中按 F12 查看 DOM 仍然可以读取 `value` 属性。这是浏览器的安全限制——前端无法真正隐藏数据。设置页面中的提示语"密钥仅存储在本地 IndexedDB，不会上传到任何服务器"是安全承诺，而非技术保障（因为代码本身可以读取 IndexedDB）。

### 坑 5：自定义模型名的联动显示

当用户选择"自定义"模型时，需要显示额外的输入框。Vue 的条件渲染：

```html
<div class="form-group" v-if="apiForm.model === 'custom'">
    <input v-model="apiForm.customModel" placeholder="例如：qwen2.5-72b">
</div>
```

但如果保存时选择的是自定义模型，需要将 `customModel` 的值写入 `apiModel` 设置项：

```javascript
const model = apiForm.value.model === 'custom' ? apiForm.value.customModel : apiForm.value.model;
await LifeOS.Settings.set('apiModel', model);
```

---

## 六、v1.0 全部完成 🎉

至此，Life OS v1.0 的所有 **9 个页面** 全部完成：

| 模块 | 文件 | 核心功能 |
|------|------|---------|
| Dashboard | `index.html` | 数据聚合概览 + 日历 + 时间轴预览 + 快速操作 |
| 时间轴 | `timeline.html` | 双列预计/实际 + 计时器 + 事件详情 |
| 任务 | `tasks.html` | 四象限 + 卡片 + 倒计时 + 角色激励 |
| 习惯 | `habits.html` | 多邻国风格月历 + 连续天数 + 角色激励 |
| 回顾 | `review.html` | DID/GOOD/BAD/THOUGHTS + GRAI + 情绪 |
| 学习 | `learning.html` | RPG 技能树 + XP 升级 + 自定义输入 |
| 角色库 | `characters.html` | 展示/编辑/头像/预置数据/个性化台词 |
| **设置** | `settings.html` | **AI 配置 + 数据管理 + 通知 + API 历史 + 关于** |

**v1.0 全部完成！**
