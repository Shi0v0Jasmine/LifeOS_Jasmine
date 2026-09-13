# LifeOS 顺手记录、日内心情与抗遗忘计时可行性调研

## Executive Summary

- **三个方向都值得保留，但应按两条产品线处理。** “顺手 Spark + 日内心情”应合并为统一的时间点事件流；“计时抗遗忘”应优先使用本地持久化、提醒和回来后的人工校正。它们不需要穿戴设备即可交付主要价值。
- **现有时间轴只覆盖了一部分，不等同于顺手记录。** 时间轴适合有起止时间的计划/实际活动块；Spark 是没有持续时长、可在数秒内完成的时间点记录。LifeOS 已有 `moments` 数据层雏形，以及时间轴/习惯记录的图片字段，但缺少可用入口、富文本、附件持久化和 AI 关联确认流程。
- **一天多次心情记录应保留原始事件，不应被压成一个 emoji。** 每日回顾继续保存用户主观选择的“今日总体心情”；日内打卡另存多条。系统可计算均值、波动和最新心情，但必须标为“已记录心情摘要”，避免把不规则采样误称为全天真实情绪。
- **Web/PWA 无法可靠知道现实中的中断原因。** 页面隐藏只说明用户切走了 LifeOS，不等于接电话、跑腿或停止当前任务。LifeOS 可以在返回时询问“保留 / 截断 / 拆分”，不能静默替用户做决定。
- **穿戴设备仅建议作为后续、只读、可撤销的数据来源。** HealthKit 和 Health Connect 都要求原生应用能力；Oura/Fitbit/Garmin 等云 API 是设备先同步到厂商云，再由 LifeOS 拉取，通常不是实时流。它们适合补充睡眠、活动和心率上下文，不适合自动完成习惯、任务或停止计时。

## 1. 调研问题与判断口径

本调研服务于一个决策：LifeOS 是否应把以下雏形纳入待开发规划，以及如何避免与已有时间轴、习惯、任务和每日回顾重复。

范围截至 **2026 年 8 月 2 日**，判断口径包括：

1. 当前代码和 PRD 是否已有同类数据、入口或交互。
2. 纯 Web/PWA 是否能完成核心流程。
3. 市面产品采用了什么交互和技术路径。
4. 是否需要新的高敏权限、原生应用或后端能力。
5. 自动化错误是否会产生不可接受的副作用。

文中的“重复率”为需求映射估算，不是用户行为统计。它同时区分：

- **结构复用度**：已有 DAO、对象字段、AI 客户端或页面是否可复用。
- **可用流程覆盖率**：用户今天是否已经能从入口完成该需求的完整闭环。

## 2. 现有功能重复度：有不少骨架，但完整体验仍是新功能

| 需求 | 结构复用度 | 可用流程覆盖率 | 结论 |
|---|---:|---:|---|
| 顺手 Spark / 随笔 / 图片 | 约 60% | 约 29% | 数据骨架较多，但入口、富文本、图片持久化、浏览与 AI 关联均未闭环 |
| 日内多次心情打卡 | 约 40% | 约 40% | 已有每日单条心情、原因和月历；一日多条、日内走势与聚合口径均未实现 |
| 计时抗遗忘与突发中断处理 | 约 35% | 对新增保障约 0% | 已有计时和停止后落时间轴；运行态持久化、恢复、超时提醒、拆分均不存在 |
| 穿戴设备联动 | 低于 10% | 0% | 健康数据模型可部分复用，但没有授权、适配器、同步或设备 API |

### 2.1 顺手 Spark 不是现有时间轴，但应与时间轴共同展示

当前时间轴已经支持：

- 计划/实际双列、标题、起止时间、类别和任务关联。
- `timeline` 记录具有 `description` 与 `images` 字段（`LifeOS/js/core.js`）。
- 事件弹窗目前只渲染纯文本 `<textarea>`，没有图片选择器（`LifeOS/timeline.html`）。

更接近 Spark 的其实是数据层里的 `moments`：它已经有独立 ID、文本、Hashtag、图片数组、日期与创建时间，并参与导入导出和云同步；但全站没有调用 `LifeOS.Moment` 的用户入口，设置页只把它显示为同步统计中的“时刻”。因此它是**后端雏形，不是可用功能**。

PRD 中 F-069~F-072 已经规划“特殊事件 + Hashtag + 图片 + 总览”，与 Spark 高度重叠。最佳做法不是新增第三套记录模块，而是把 `moments` 升级为统一事件流：

- `kind: spark | mood | special | interruption`
- `occurredAt`：精确到时间的发生时刻，允许补记和修改
- `contentMarkdown`：Markdown 作为 source of truth
- `attachments[]`：附件元数据，不把大图 Base64 直接塞进同步 JSON
- `links[]`：与习惯、任务、时间轴事件的显式关联
- `aiSuggestions[]`：AI 的候选关联与置信度，和已确认关联分开保存

展示上可以把 Spark 渲染为时间轴中的“时间点卡片”，但不能强迫用户填写结束时间。这样既复用时间轴的日视图，也保留“几秒钟记一下”的低摩擦体验。

### 2.2 图片和富文本在 PWA 中可行，但同步策略必须先定

浏览器可通过文件输入选择图片；移动端还可用 `accept="image/*" capture="environment"` 建议调用后置摄像头，但 `capture` 不是所有主流浏览器的 Baseline 能力，需要保留普通文件选择降级路径。[MDN：capture 属性](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture)

IndexedDB 能直接保存文件和 Blob，适合本地优先附件存储。[MDN：IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) 但浏览器存储默认是 best-effort，设备存储压力或用户清理站点数据时仍可能丢失；可请求持久存储并用 `navigator.storage.estimate()` 展示占用情况，浏览器是否批准仍由平台决定。[MDN：存储配额与清理](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

建议：

1. 新建 `attachments` Object Store，以 Blob 保存原图或压缩图，以缩略图用于列表。
2. `moments` 只保存附件 ID、类型、大小、哈希、缩略信息和同步状态。
3. 第一阶段附件本机保存并进入完整备份；不要直接跟随通用 JSON 文档同步。
4. 多端图片同步另做对象存储与端到端加密设计；未同步设备显示明确占位，不静默丢图。
5. Markdown 作为文本真源，预览时做 HTML 清洗；避免把任意 HTML 直接保存和渲染。

### 2.3 AI 自动判断可行，但应是“建议关联”，不是“自动完成”

LifeOS 已有通用 AI 客户端、任务拆解和多模态图片解析链路，可以复用。推荐采用两阶段流程：

1. **本地候选召回**：仅从当天/近期未完成任务、启用中的习惯、相邻时间轴事件中，用标题、别名、类别和时间相近度筛出少量候选。
2. **AI 重排**：只向用户配置的 AI 发送本条 Spark 与候选摘要，返回候选实体、置信度、依据和建议动作。
3. **用户确认**：允许“一键关联”“关联并打卡”“关联并完成”，但后两者必须明确确认；拒绝的候选用于本地别名/规则学习。

自动化风险并不对称：错加一条链接容易撤销，误完成任务或误打卡会污染连续天数、统计和激励。因此默认规则应是：

- AI 可以自动添加低风险标签或产生候选。
- AI 不得静默完成任务、习惯或结束计时。
- 图片、健康、心情和日记内容只有在用户主动点击“AI 分析”后才发送。
- 结果界面显示“为什么匹配”和置信度，不使用假精确的百分数来掩盖不确定性。

市面实践也更接近“捕获—分类—确认”：Rize 通过原生桌面端读取活动窗口的应用名、标题和 URL，再用 AI 分类到项目；Toggl/Clockify 会先记录活动，再让用户转换或校正时间条目，而非用网页悄悄替用户完成任务。[Rize 自动时间追踪](https://rize.io/)、[Toggl Timeline](https://support.toggl.com/en-us/article/the-timeline-feature-1txzwm1/)、[Clockify Auto Tracker](https://clockify.me/features/auto-tracker)

## 3. 日内多次心情：原始打卡与每日总结必须拆开

当前 `reviews` Object Store 以日期为主键，每天只能有一条回顾；其中包含一个 `emotion` 和一个 `emotionReason`。回顾页提供 8 个表情和情绪月历。这套模型适合“我如何评价今天”，不适合“今天 10:20 焦虑、14:30 放松、22:00 疲惫”的日内事件流。

### 3.1 推荐数据口径

每次心情打卡保存为独立事件：

```text
id
kind = mood
date = YYYY-MM-DD
occurredAt
emotionId
valence        # 愉悦度，例如 -2..2
arousal        # 唤醒度，例如 1..5
energy         # 精力，例如 1..5，可选
intensity      # 强度，例如 1..5，可选
reason
tags[]         # 人、地点、活动、身体感受等
source         # manual / imported
links[]        # 可关联任务、习惯、时间轴事件
```

每日层面保留两种不同含义的数据：

- **人工总体心情**：用户在每日回顾中回答“总体来说，今天感觉如何？”。它表达回顾时的主观整合，继续作为月历主图标的首选。
- **已记录心情摘要**：由日内打卡计算打卡数、最新心情、平均愉悦度、平均精力、波动范围和高频标签。它只描述已记录样本，不宣称代表未记录时段。

如果用户没有填写人工总体心情，月历可以用“日内记录的主导象限/中位愉悦度”作为降级值，并加上自动汇总标记。Dashboard 宜显示“最新心情 + 今日波动”，而不是只显示一个平均 emoji。

### 3.2 市面实践

- **Daylio** 把低摩擦做到了“选心情 + 选活动”，并支持备注、照片、语音、目标与统计相关性。它的关键不是 AI 猜测所有行为，而是用活动标签让一次记录兼具心情和行为上下文。[Daylio 官方功能页](https://daylio.net/)
- **How We Feel** 使用更细的情绪词和彩色矩阵，记录标签、身体感受并观察随时间变化；其产品说明还提到使用 HealthKit 的睡眠、运动和健康趋势辅助发现模式。这证明“多次细粒度打卡 + 后续模式分析”是成熟路径。[How We Feel](https://howwefeel.org/)
- **Exist** 采用另一条路线：每天一次 1–9 分总体心情，并与睡眠、步数、自定义标签做长期相关分析。它适合作为 LifeOS “每日人工总结”的参考，但不能替代日内多次记录。[Exist 情绪追踪](https://exist.io/about/mood/)、[Exist 相关性 API](https://developer.exist.io/guide/read_client/)

因此 LifeOS 不必在“一天一次”和“一天多次”之间二选一：两者分别回答“当下如何”和“回头看这一天如何”。

### 3.3 提醒如何减少忘记记录

建议从低打扰到高能力分层：

1. 首页/PWA 图标的“快速 Spark”和“心情”快捷入口。
2. 用户自选时间窗内的柔性提醒，例如上午/下午/睡前各最多一次；支持“稍后提醒”和当天静默。
3. 打开 LifeOS 时根据“距离上次打卡时长”给非阻塞提示。
4. 后续再做 Web Push；iOS/iPadOS 只有添加到主屏幕的 Web App 才能请求 Web Push，且必须由用户手势触发授权。[WebKit：iOS/iPadOS 主屏 Web App 的 Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)

普通页面通知和后台同步都不是可靠的本地定时器。Notifications API 需要用户授权，移动端应使用 Service Worker 的持久通知；Periodic Background Sync 仍是实验性、非 Baseline 能力，浏览器也不保证精确触发时间。[MDN：Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)、[MDN：Periodic Background Sync](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API)

## 4. 忘记停止计时：先修计时模型，再谈传感器

当前 `timeline.html` 把 `timerRunning`、`timerStartTime` 和 `timerElapsed` 保存在 Vue 内存中；停止时才创建实际时间轴事件。刷新、关闭页面、系统回收页面后，运行态无法恢复。这正是“忘记停”和“意外中断”会放大的结构性问题。

### 4.1 PWA 内即可实现的可靠方案

**A. 计时状态立即落盘**

- 开始时把 `startedAt`、名称、关联任务、模式、设备 ID 写入设备本地设置 `activeTimer`。
- 显示时始终用 `Date.now() - startedAt` 计算，不依赖 `setInterval` 累加。
- 刷新或重开后恢复计时条；停止后原子地创建时间轴事件并清除运行态。
- 运行态默认不跨设备同步，避免两台设备同时争夺一个计时器。

**B. 可疑长计时提醒**

- 用户为不同类别设置“通常时长”或统一阈值。
- 超过阈值时提醒：继续、停止到现在、回到某时刻截断。
- 下次打开 App 时必须显示未处理计时，而不是悄悄生成超长事件。

**C. 回来后的中断校正**

Page Visibility API 可以知道 LifeOS 文档何时隐藏/重新可见，但这只表示切换标签、最小化或被其他窗口遮挡；后台计时器也会被浏览器节流。[MDN：Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

因此当页面隐藏超过阈值并返回时，应询问：

- 保留整段计时；
- 在离开 LifeOS 时截断；
- 拆为“原任务 + 中断/跑腿 + 恢复后任务”；
- 丢弃空闲时段。

这与 Toggl 的“保留 / 丢弃空闲 / 丢弃并继续”以及 RescueTime 的 AFK 启发式相似，但 LifeOS 在纯 Web 中只能把页面隐藏当作提示信号，不能把它当作真正的键鼠空闲检测。[Toggl 浏览器扩展的 idle 处理](https://support.toggl.com/toggl-track-browser-extension)、[RescueTime 的五分钟空闲启发式](https://help.rescuetime.com/article/19-why-dont-i-see-60-minutes-in-my-by-hour)

Screen Wake Lock 可以在用户明确需要时防止屏幕变暗或锁定，但只对可见、活跃文档有效，也可能因省电或低电量被系统释放。它适合“做菜/运动时保持计时界面亮屏”，不适合作为后台计时可靠性的基础。[MDN：Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)

### 4.2 纯 Web 做不到什么

以下判断是根据公开 Web 平台能力作出的边界推论：

- 无法读取手机是否正在通话、是谁来电或通话内容。
- 无法知道用户离开电脑是在思考、开会、跑腿还是休息。
- 无法像桌面原生追踪器那样全局读取前台应用、窗口标题和键鼠 AFK。
- 无法保证 Service Worker 每分钟常驻执行或在指定秒数自动停止计时。

ActivityWatch、Rize、Toggl Timeline 之所以能做更完整的自动追踪，是因为它们依赖 Windows/macOS 原生后台程序或浏览器扩展读取活动窗口、URL、键鼠空闲等信息，而不是只运行一个普通网页。[ActivityWatch Watchers](https://docs.activitywatch.net/en/latest/watchers.html)、[Rize 隐私说明](https://rize.io/privacy-policy)、[Toggl Timeline](https://support.toggl.com/en-us/article/the-timeline-feature-1txzwm1/)

## 5. 穿戴设备联动：技术可行，产品目标需要降级

### 5.1 三条可能路径

| 路径 | 纯 PWA 可做 | 实时性 | 权限/成本 | 适合 LifeOS |
|---|---|---|---|---|
| Web Bluetooth 直连 BLE | 部分浏览器可做 | 理论上较高 | 显式授权、兼容性差、设备协议常私有、不能在 Worker 中常驻 | 不建议作为主路径 |
| 厂商云 API（Oura/Fitbit/Garmin） | 可通过后端 OAuth/Token 做 | 设备同步后延迟到达 | 厂商账号、授权、Token 安全、部分需审核/商业许可 | 可做只读实验适配器 |
| HealthKit / Health Connect | 纯 PWA 不可直接做 | 可后台读取 | 需要 iOS/Android 原生 App、清单权限、商店申报 | 只有决定做原生伴侣 App 后再做 |

Web Bluetooth 能连接 BLE 外设，但仍属非 Baseline、实验性能力，需要安全上下文、用户明确选择设备；API 也不暴露给 Web Worker，难以承担全天后台采集。[MDN：Web Bluetooth API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API)

Apple HealthKit 通过 Xcode Capability、HealthKit entitlement 和可选 Background Delivery 工作，本质上是原生 App 能力。[Apple：配置 HealthKit 访问](https://developer.apple.com/documentation/Xcode/configuring-healthkit-access) Android Health Connect 同样要求 Android SDK、`AndroidManifest.xml` 数据类型权限、运行时授权和 Play Console 健康应用申报。[Android：Health Connect 入门](https://developer.android.com/health-and-fitness/health-connect/get-started)、[Android：发布健康应用](https://developer.android.com/health-and-fitness/health-connect/publish)

厂商云 API 的门槛较低但不是实时传感器：

- Oura V2 使用 OAuth2，可读取睡眠、日活动、心率、锻炼等；设备数据先同步到 Oura App/云端，官方推荐 Webhook，应用超过 10 名用户前需要批准。[Oura API V2](https://cloud.ouraring.com/v2/docs)
- Fitbit Web API 的个人应用可读取开发者自己的分钟级心率，读取其他用户的 Intraday 数据需额外申请。[Fitbit Heart Rate Intraday](https://dev.fitbit.com/build/reference/web-api/intraday/get-heartrate-intraday-by-date-range/)
- Garmin Health API 提供心率、步数、睡眠、压力等 JSON 数据，但要先获批，商业使用还涉及许可费。[Garmin Health API](https://developer.garmin.com/gc-developer-program/health-api/)

### 5.2 穿戴数据不等于“中断检测”

心率变化、步数增加、姿态变化或离开位置都存在多重解释：接电话时可能静坐，跑腿时可能走动，正常散步也会走动。即使取得这些信号，也不能可靠推断“当前任务已经停止”。错误自动停止会破坏时间记录，错误自动打卡会污染习惯连续性。

建议把穿戴数据限制为：

- 对时间轴空白或超长计时提供“可能发生过活动/睡眠”的候选片段。
- 在每日回顾中展示睡眠、步数、运动、静息心率等上下文。
- 让用户确认后才建立时间轴事件、习惯证据或心情相关标签。
- 默认最小权限、按数据类型逐项授权、可随时断开并删除 Token 与导入数据。

不建议：

- 根据心率/步数自动结束计时。
- 自动判断来电、家庭事务或情绪原因。
- 在未确认的情况下完成任务或习惯。
- 把连续原始心率长期上传给 AI。

## 6. 推荐的产品方案

### 6.1 统一事件流，而不是再造三个模块

```text
快速入口
  ├─ Spark（文本 / Markdown / 图片）
  ├─ 心情（情绪 + 强度 + 原因 / 标签）
  └─ 中断（从运行中计时器快速拆分）
          ↓
moments 统一时间点事件流
          ↓
本地规则召回候选任务 / 习惯 / 时间轴事件
          ↓
可选 AI 重排
          ↓
用户确认链接或状态变更
          ↓
时间轴点事件 / 每日回顾 / 趋势分析
```

这样可以直接吸收 F-069/F-070/F-072，避免“时间轴事件、特殊事件、Spark、心情”各有一套编辑器、图片和筛选逻辑。

### 6.2 分阶段优先级

| 阶段 | 范围 | 价值 | 风险 |
|---|---|---|---|
| P0 | 计时状态落盘、重启恢复、超长计时校正 | 直接解决数据丢失和忘停 | 低 |
| P1 | Spark 快速入口、Markdown、精确时间、日视图点事件 | 建立低摩擦捕获主路径 | 中，涉及 `moments` 迁移 |
| P1 | 日内多次心情 + 每日人工总体心情 + 摘要 | 保留日内变化又不破坏现有回顾 | 中，需明确统计口径 |
| P1 | 本地候选关联 + 用户确认 | 不依赖 AI 也能获得基本联动 | 低到中 |
| P2 | AI 候选重排、图片理解、关联解释 | 降低手工分类成本 | 中，隐私与误判 |
| P2 | 柔性提醒、Web Push、返回后的中断拆分 | 减少漏记和超长计时 | 中，浏览器差异 |
| P3 | Oura/Fitbit 只读适配器 | 补充健康与活动上下文 | 高，OAuth、Token、厂商限制 |
| 暂缓 | HealthKit/Health Connect 原生伴侣 App | 更完整的健康数据 | 很高，偏离无构建纯 Web 架构 |
| 不做 | Web Bluetooth 全天候直连、自动推断现实中断 | 理论吸引力高但不可依赖 | 很高，兼容性和误判不可接受 |

## 7. 建议的成功指标与护栏

开发后应以真实使用数据再决定是否继续扩展：

- 快速记录从打开入口到保存的中位耗时。
- 有多少 Spark 被用户确认关联到任务/习惯；AI 建议接受率与撤销率。
- 未正常停止的计时器占比、恢复后成功校正率、超长事件占比。
- 日内心情每周有记录的天数、每个记录日的打卡次数分布。
- 通知关闭率和“当天静默”使用率，防止提醒反过来造成负担。
- 图片总存储量、备份覆盖率和跨设备缺失附件数。

隐私与正确性护栏：

- AI、通知、定位、相机、穿戴数据均按能力逐项 opt-in。
- 高敏内容默认本地处理；发送 AI 前显示本次将发送的范围。
- 所有 AI 关联可撤销；任务完成、习惯打卡、计时停止必须人工确认。
- 情绪趋势不得输出医学诊断；健康/心情相关性只描述关联，不声称因果。

## 8. 最终决策

**建议直接进入 PRD 待开发：**

- 统一 Spark/时刻快速记录与附件。
- AI/规则候选关联，默认人工确认。
- 日内多次心情记录与“人工总体 + 自动摘要”双口径。
- 计时持久化恢复、可疑长计时提醒和中断拆分。
- 可配置的低打扰提醒与 PWA 快捷入口。
- 只读、可撤销的穿戴云 API 适配器，标为探索项。

**建议明确暂缓或排除：**

- 为这批需求单独做新的“随笔页面”，导致与时间轴/特殊事件重复。
- 用不规则日内样本自动替代用户的每日总体心情。
- 根据页面隐藏、心率或步数静默结束任务、计时或习惯。
- 当前纯 Web 阶段直接接 HealthKit/Health Connect 或依赖 Web Bluetooth 全天后台运行。

