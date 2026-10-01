# LifeOS — 版本管理（VERSIONING）

## v6.2.0（发布候选，未发布）

- 2026-10-01：用户决定 **Personal Context 暂缓**（不是废弃，v7.0.0 编号保留给它的正式发布）。本次发版按小版本（MINOR）处理，编号 **v6.2.0**：投影集合、签名云函数、密钥配置、recovery code、双设备投影复测本次全部不做；`context.html` / `js/context-client.js` 代码保留休眠随包发布。当日为核验临时创建的两个投影空集合已删除回收。
- 2026-09-14：上下文密钥/缓存/本机元数据从导出、导入和后端快照排除；离线摘要校验账号、环境和密钥，跨标签页失效与异步写回保护。
- IndexedDB 源码升级 v5：保留业务记录和恢复密钥，清除无归属绑定的历史摘要缓存；显示摘要实际日期、缓存时间和部分解密失败状态。
- AI 代理对无效请求返回 400，避免 JSON 解析错误回显凭据片段。
- 后续复核：服务器端过滤私密上下文字段及新备份，保护静态数据库文件；上下文写入等待事务完成，显式认证失败清除缓存。14 套件和原生浏览器事务回滚/PDF/TIFF 验证通过。
- 健康报告导入修复：50MB/文件、20 文件/100 页；混选 PDF 与图片、长截图分段、多页 TIFF/HEIC 保留、AI 失败续跑和停止；不新增持久化字段，IndexedDB 仍 v5。
- 2026-09-30：数据库初始化容错——init 补 onblocked/VersionError 识别/20s 超时，失败清空 `_initPromise` 可重试，全局横幅替代"静默空白"；空库后端恢复成功后自动刷新（修 458 竞态）；SW 接管提示与 `storage.persist()`。推版 + IndexedDB 升级不再表现为"丢数据"。core-data 测试 12→19 项。
- 当前 Service Worker：`lifeos-static-v20260930-1`。基线 `6ca332b` 已推送；健康报告修复、初始化容错与版本重编待提交，云端发布待用户授权。

- PATCH：移动端时间轴按真实显示区间计算碰撞分栏；短事件取消强制最小卡片高度，避免相邻事件视觉重叠。健康"报告档案"改为说明与导入按钮上下居中布局；设置页补齐窄屏宽度约束。
- 早期候选草稿使用 IndexedDB v4 与 `lifeos-static-v20260824-1`；已由上述候选更新替代。

## v7.0.0（规划中，暂缓）

- Personal Context 只读窗口（`context.html` + `js/context-client.js`）：端侧 recovery code 解密 `context_projections` 密文，只展示摘要、待办与采集状态；不加载原始聊天或文档，不提供远程审批；完整能力留在本机控制台。源码已备，**发布暂缓**——届时需补：投影集合/安全规则（CloudBase 键名用不带点的 `read`/`write`，语义参考 PersonalContextInfrastructure 仓库示例）、`context-projection` 签名云函数（环境变量 `CONTEXT_OWNER_UID` + `CONTEXT_HMAC_KEYS`，值不外泄）与真实双设备复测。

Current source version: `6.2.0`（发布候选，未发布；Personal Context 暂缓，v7.0.0 编号保留）
Latest documented release: `6.1.1`（2026-08-11）。2026-09-14 核验线上公共资源为 `lifeos-static-v20260824-1`、IndexedDB v4，且包含 context.html，已有部分早期候选改动；完整发布状态不能仅据历史记录认定。当前 v6.2.0 候选未部署。
