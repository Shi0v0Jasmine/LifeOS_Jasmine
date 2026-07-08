# Step 3: 角色库页面（Character Library）

> Life OS 日常跟踪/记录 App —— 从零构建指南
> 目标：构建完整的角色库页面，展示/编辑/上传头像/管理预置数据

---

## 一、为什么这么做？

### 1.1 为什么角色库要先做？

| 模块 | 依赖角色库？ | 原因 |
|------|-----------|------|
| **任务管理** | ✅ | 75%/85% 完成率触发角色激励，需要角色数据才能工作 |
| **每日回顾** | ❌ | 不依赖角色 |
| **时间轴** | ❌ | 不依赖角色 |
| **学习日记** | ❌ | 不依赖角色 |

**核心决策**：角色激励系统是贯穿整个应用的情感核心。如果先做了任务管理但角色库为空，完成率达标后不会有任何角色出现——用户体验断层。所以先让角色库"有料可用"，再做任务管理时激励系统直接可用。

### 1.2 为什么头像用 base64 存储而非 URL 路径？

| 方案 | 优点 | 缺点 | 选择 |
|------|------|------|------|
| **图片文件放在 assets/** | 简单、可缓存 | 需要管理文件系统、文件名冲突、删除时残留 | ❌ |
| **base64 存入 IndexedDB** | 自包含、备份时一并导出、无文件管理负担 | 图片大时数据库膨胀（但压缩后可控） | ✅ |
| **上传到云存储** | 不占用本地空间 | 需要联网、依赖第三方服务、隐私问题 | ❌ |

**核心决策**：用 `FileReader.readAsDataURL()` 读取图片为 base64，再用 Canvas 压缩（缩放到 400px 宽，JPEG 质量 0.8），最终每张头像约 20-50KB。IndexedDB 存储 50 个角色的头像约 1-2MB，完全在可接受范围。

**为什么压缩到 400px？** 头像在 UI 中最大显示 100px（弹窗大头像），400px 提供 4x 的清晰度保证，同时避免原始照片（4MB+）直接存入数据库。

### 1.3 为什么圆形头像用 CSS 而非 Canvas 裁剪？

| 方案 | 实现方式 | 缺点 | 选择 |
|------|---------|------|------|
| **Canvas 圆形裁剪** | `ctx.arc()` + `clip()` + 重绘 | 复杂、需要处理图片加载异步 | ❌ 过度设计 |
| **CSS `border-radius: 50%`** | 一行 CSS | 简单、任意图片形状都能优雅显示、配合 `object-fit: cover` | ✅ |

**核心决策**：CSS `border-radius: 50%` 将任何矩形图片裁剪为圆形，配合 `object-fit: cover` 保持图片比例并填充整个圆形。不需要在 JS 中做任何图像处理，将复杂度留给 CSS。

---

## 二、页面结构解析

### 2.1 整体布局

```
┌─────────────────────────────────────┐
│  Life OS  [Sidebar]                   │
│  📊 仪表盘  ⏰ 时间轴  📋 任务...      │
│                                     │
├─────────────────────────────────────┤
│  角色库              50 位 · 4 个系列 │
│  [📥 导入预置]  [➕ 添加角色]          │
│                                     │
│  🔍 搜索角色...                     │
│  [全部] [排球少年] [Fate] [EVA] [柯南]│
│                                     │
│  ┌────┐  ┌────┐  ┌────┐  ┌────┐   │
│  │ 及 │  │ 菅 │  │ 影 │  │ 日 │   │
│  │川彻│  │原孝│  │山飞│  │向翔│   │
│  │ 70 │  │ 支 │  │ 雄 │  │ 阳 │   │
│  │雪豹│  │萨摩│  │杜宾│  │博美│   │
│  └────┘  └────┘  └────┘  └────┘   │
│                                     │
│  ... 更多角色卡片 ...                │
└─────────────────────────────────────┘
```

### 2.2 核心交互流程

```
页面加载 → onMounted → loadCharacters()
    ↓
Database.init() → 检查角色数
    ↓
角色数 = 0 → 自动调用 importPresetData() → 50+ 角色导入
    ↓
显示角色卡片网格
    ↓
点击卡片 → 打开详情弹窗（编辑模式）
    ↓
可编辑：姓名/作品/背号/年级/位置/动物塑/生日/性格标签/台词/优先级/头像
    ↓
保存 → 更新 IndexedDB → 刷新列表
```

---

## 三、核心代码解析

### 3.1 自动导入预置数据

```javascript
const loadCharacters = async () => {
    await LifeOS.Database.init();
    characters.value = await LifeOS.Character.getAll();
    // 如果没有任何角色，自动导入预置数据
    if (characters.value.length === 0) {
        await LifeOS.Character.importPresetData();
        characters.value = await LifeOS.Character.getAll();
    }
};
```

**为什么自动导入？** 用户第一次打开角色库页面时，数据库是空的。如果显示"暂无角色"，用户需要手动点击"导入预置角色"——多了一步操作。自动导入让首次体验无缝，50+ 角色立即可见。

### 3.2 筛选系统（系列 + 搜索）

```javascript
const filteredCharacters = computed(() => {
    let result = characters.value;
    
    // 系列筛选
    if (activeSeries.value !== 'all') {
        if (activeSeries.value === '其他') {
            result = result.filter(c => !['排球少年','Fate','EVA','柯南'].includes(c.series));
        } else {
            result = result.filter(c => c.series === activeSeries.value);
        }
    }
    
    // 搜索筛选（支持姓名、动物塑、系列）
    if (searchQuery.value.trim()) {
        const q = searchQuery.value.toLowerCase();
        result = result.filter(c => 
            c.name.toLowerCase().includes(q) ||
            (c.animal && c.animal.toLowerCase().includes(q)) ||
            (c.series && c.series.toLowerCase().includes(q))
        );
    }
    return result;
});
```

**为什么用 `computed`？** 筛选是派生状态——依赖 `characters.value`（原始数据）、`activeSeries.value`（筛选条件）、`searchQuery.value`（搜索关键词）。Vue 的 `computed` 自动追踪这些依赖，任一变化时自动重新计算。如果用 `ref` + 手动更新，需要在每个事件监听器中调用更新逻辑，容易遗漏。

### 3.3 头像上传与压缩

```javascript
const handleAvatarUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const base64 = await LifeOS.Utils.fileToBase64(file);     // 原始 base64
        const compressed = await LifeOS.Utils.compressImage(base64, 400, 0.8);  // 压缩
        editForm.value.avatar = compressed;  // 存入表单
    } catch (e) {
        alert('图片处理失败: ' + e.message);
    }
};
```

**压缩流程**：
1. `FileReader.readAsDataURL(file)` → 读取图片为 Data URL（base64）
2. `new Image()` → 创建图片对象
3. `canvas.drawImage(img, 0, 0, width, height)` → 将图片绘制到 Canvas（缩小到 400px 宽）
4. `canvas.toDataURL('image/jpeg', 0.8)` → 导出 JPEG base64，质量 80%
5. 存入 IndexedDB

**为什么质量选 0.8？** 80% 是 JPEG 的"甜点"——人眼几乎看不出质量损失，但文件大小比原图小 80% 以上。

### 3.4 优先级颜色系统

```javascript
const getPriorityColor = (p) => {
    if (!p) return '#94A3B8';
    if (p >= 80) return '#EF4444';      // 高优先级 - 红
    if (p >= 60) return '#F59E0B';      // 中优先级 - 琥珀
    if (p >= 40) return '#34D399';      // 普通 - 绿
    return '#94A3B8';                    // 低 - 灰
};
```

**视觉语义**：红色 = 经常互动的角色（高优先级），灰色 = 很少互动（低优先级）。颜色Badge在头像右下角，一目了然。

### 3.5 性格标签输入

```javascript
// 输入框显示时用逗号分隔的字符串
// 编辑时自动拆分为数组
const tagString = computed(() => (editForm.value.personalityTags || []).join('，'));

// 输入时：将逗号分隔的字符串转为数组
onInput(e) {
    editForm.value.personalityTags = e.target.value
        .split(/[,，]/)           // 支持中英文逗号
        .map(s => s.trim())       // 去除空格
        .filter(Boolean);         // 去除空字符串
}
```

**为什么用 `/[,，]/` 正则？** 中文用户可能输入"温柔，自恋"或"温柔，自恋"（中文逗号 vs 英文逗号）。正则同时支持两种。

---

## 四、CSS 关键设计

### 4.1 卡片网格（CSS Grid）

```css
.characters-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
}
```

**为什么用 `auto-fill` 而非 `auto-fit`？**
- `auto-fill`：创建尽可能多的列，即使最后一行只有 1 个元素，也会留出空位
- `auto-fit`：合并空列，最后一行可能拉伸得很宽
- 角色卡片固定 160px 宽度，响应式自动换行

### 4.2 圆形头像（CSS 实现）

```css
.character-avatar {
    width: 72px;
    height: 72px;
    border-radius: 50%;      /* 圆形 */
    object-fit: cover;       /* 保持比例，填充整个圆形 */
    border: 3px solid rgba(255, 255, 255, 0.8);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
```

**为什么 `object-fit: cover`？** 如果用户上传的是横向风景照，不裁剪的话会压缩成椭圆形。`cover` 会自动缩放并裁剪多余部分，确保图片始终填满圆形区域。

### 4.3 优先级 Badge（绝对定位）

```css
.priority-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid white;  /* 白色边框与头像区分 */
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}
```

**绝对定位 + 负偏移**：让 Badge 稍微超出头像边界，形成"叠加"效果，更醒目。`z-index` 不需要设置，因为 DOM 顺序中 Badge 在头像之后（后渲染的在上方）。

---

## 五、验证步骤

### 5.1 验证角色库页面

1. 打开 `characters.html`（强制刷新 Ctrl + F5）
2. 页面应自动显示 **50+ 角色**（排球少年 40+、Fate 7、EVA 2、柯南 2）
3. 检查：左上角 = "Life OS"，侧边栏高亮 = "角色库"
4. 检查：页面标题 = "角色库 50 位 · 4 个系列"

### 5.2 验证筛选功能

1. 点击 **"排球少年"** 筛选标签 → 只显示排球少年角色
2. 点击 **"Fate"** → 只显示 Fate 角色（医生、达芬奇、迦尔纳等）
3. 在搜索框输入 **"及川"** → 只显示及川彻
4. 在搜索框输入 **"雪豹"** → 只显示及川彻（动物塑匹配）

### 5.3 验证编辑功能

1. 点击 **及川彻** 卡片 → 弹出详情弹窗
2. 修改 **台词风格** 为 "改一下试试"
3. 拖动 **优先级** 滑块到 100
4. 点击 **保存** → 弹窗关闭，卡片上的优先级 Badge 变为红色（100）
5. 刷新页面 → 修改仍然保留（验证 IndexedDB 持久化）

### 5.4 验证头像上传

1. 点击任意角色卡片 → 打开详情弹窗
2. 点击 **"📷 上传头像"** → 选择一张图片
3. 头像应显示为圆形（CSS 自动裁剪）
4. 保存后刷新页面 → 头像仍然显示
5. 点击 **导出备份** → 检查 JSON 中角色的 `avatar` 字段有 base64 数据

### 5.5 验证添加角色

1. 点击 **"➕ 添加角色"** → 弹出新建弹窗
2. 填写：姓名 = "原创角色"，作品 = "我的小说"，动物塑 = "龙猫"
3. 点击 **创建** → 新角色出现在卡片网格中
4. 筛选 **"其他"** → 应显示"原创角色"

---

## 六、常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| 角色库显示"暂无角色" | 首次加载时 importPresetData 失败 | 检查 Console 是否有错误，手动点击"导入预置角色"按钮 |
| 头像上传后显示空白 | 图片过大或格式不支持 | 确保上传 JPG/PNG，尝试用更小图片 |
| 筛选"排球少年"无结果 | 角色数据中 series 字段不匹配 | 检查预置数据中的 `series` 值是否为"排球少年" |
| 保存后修改不生效 | 编辑的 ID 与原始 ID 不一致 | 检查 `editForm.id` 是否正确传递 |
| 优先级 Badge 不显示颜色 | `priority` 为 null/undefined | 检查数据中是否有 priority 字段，默认值 50 |
| 搜索框输入无效 | 中文输入法问题 | 输入完成后按 Enter 或点击其他地方触发 |

---

## 七、下一步预告

**Step 4: 任务管理（tasks.html）**
- 四象限卡片展示（重要-紧急 / 重要-不紧急 / 紧急-不重要 / 不重要-不紧急）
- 任务添加/编辑/删除（拖拽到四象限）
- 倒计时可视化 + 进度条（DDL 剩余天数）
- 完成率计算 + 角色激励触发（75% 和 85% 阈值）

**Step 5: 时间轴模块（timeline.html）**
- 双列时间轴（预计/实际）
- 从任务拖拽到时间轴
- 开始计时自动记录
- 事件详情弹窗（富文本 + 图片）

---

> 本文件位置：`guide/step-03-character-library.md`
> 对应新增/修改：
> - 新增：`characters.html`（完整角色库页面：卡片网格、筛选、搜索、编辑弹窗、头像上传）
> - 修改：`css/style.css`（角色卡片、圆形头像、系列标签、筛选栏、编辑弹窗、优先级Badge）
> - 依赖：`js/core.js`（Character DAO + 50+ 预置数据）
