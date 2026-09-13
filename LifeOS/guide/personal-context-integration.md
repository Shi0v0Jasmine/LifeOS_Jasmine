# Personal Context Infrastructure 接入说明

LifeOS 只承担跨设备、只读的端到端加密摘要窗口。独立仓库位于 `D:\FUN_VibeCoding\PersonalContextInfrastructure`，运行数据位于 `D:\PersonalContextData`。

完整聊天、文档正文、附件、审批状态和本机路径均不进入 LifeOS 同步集合。CloudBase `context_projections` 只保存 owner、投影类型、日期、更新时间、密钥版本、nonce 与 ciphertext；写入只允许签名云函数，浏览器只读当前登录 owner 的记录。

上线前必须完成 CloudBase 集合规则、云函数环境变量、LifeOS 账号 owner UID、端侧 recovery code 和移动端/离线/错误密钥复测。源码版本为 v7.0.0，未完成这些门槛前不得标记为已发布。

## v7 本地候选的持久化边界（2026-09-14）

- IndexedDB v5 迁移保留业务数据及 `contextProjectionKey`，删除旧 `contextProjectionCache`/`contextProjectionIdentity`，更新本机修订号。
- 所有 `contextProjection*` 设置均从导出和本机后端快照排除，导入忽略这些字段。旧备份不自动重写，已泄露过的密钥需通过本机控制台轮换。
- 摘要缓存绑定 envId、ownerUid、keyVersion、SHA-256 密钥指纹与 revision；在线验证身份后才能保存。离线只读取匹配的已验证缓存，身份不明或权限错误不回退显示旧摘要。
- `Database.contextState(expected, update)` 在同一 IndexedDB 事务内比较上下文身份并写缓存；密钥/账号/环境/后端变化同时清除缓存与身份凭证。BroadcastChannel 仅传失效信号，不携带私密数据。
- 数据层等待事务 complete 后返回成功并广播失效，事务 abort 必须拒绝。显式认证过期/权限失败同时清除离线身份和摘要；普通网络失败仅在身份已验证且缓存绑定匹配时回退。
- `server.js` 对读取、写入、恢复和新建备份统一过滤 `contextProjection*` 设置，静态 `/data` 仅公开参考食物/角色 JSON。旧备份文件不自动改写。后端测试通过 `LIFEOS_DATA_DIR` 使用临时目录。
- 测试使用合成数据与模拟 CloudBase/AI；发布前必须以真实 owner 验证只读集合规则、拒绝其他 owner、签名函数的写入权限和密钥轮换流程。关闭旧版本全部标签页再升级；v5 数据库不能直接由旧 v4 页面打开。

## 2026-09-14 发布门槛核验

只读抓取公共文件：线上 SW 为 `lifeos-static-v20260824-1`，core.js 仍为 IndexedDB v4，context.html 已存在。这只说明早期上下文代码已上线，不代表当前候选已发布。

CLI 调用 `DescribeSafeRule` 查询 `context_projections` 被拒绝：`No valid identity information`，需要用户恢复 CLI 登录后继续只读验证。不要据本地示例推定线上规则已应用。接口见 [腾讯云查询数据库安全规则](https://cloud.tencent.com/document/product/876/128118)。

后续依次验证：`context_projections` owner-only 读取与浏览器写入拒绝；`context_projection_nonces` 客户端读写拒绝；签名写入函数配置 `CONTEXT_OWNER_UID` 与 `CONTEXT_HMAC_KEYS` 是否齐全（报告仅记录是否配置，不打印值）；真实两设备和上游 AI/HTTP 网关。当前候选 SW 为 `lifeos-static-v20260914-2`，部署、提交、推送仍待单独授权。
