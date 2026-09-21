# 112 - NeuroBook Passport 与官方站点改造

> 状态：**A/B/C 三阶段已实施（2026-07-22），待浏览器验收**。

## Relative documents refs

- **接口唯一真相源**：nb-workshop 仓 `reference/passport/api-v1.md`（术语表 / 设备授权流 / scope / 授权管理 / Backup API / Prisma 草案 / 实例客户端合同）。
- nb-workshop 现状：nb-workshop 仓 `PROJECT-STATUS.md`；Workshop 平台设计真相源 `docs/tasks/88-workshop-platform/README.md`。
- 实例 State Root 构成（备份对象）：`server/runtime/paths/runtime-paths.ts`、`docs/deployment.md`（Portable 下 State Root = `data/`）。
- 部署鉴权（实例密码 `auth: true`）：`docs/tasks/100-deployment-auth-and-source-carry/README.md`。

## User Request / Topic

1. 为 NeuroBook 建统一账号体系（NeuroBook 通行证），打通 llmlint、nb-workshop。
2. nb-workshop 改造为 NeuroBook 官方站点：不只提供 OAuth 身份认证，还承载创意工坊等在线服务。
3. 本任务范围（用户指定）：
   - 能通过普通账号密码创建账号；OAuth 关联、邮箱注册后续做。
   - NeuroBook 用户面板，能关联 NeuroBook 服务（实例授权管理）。
   - 第一个在线功能：**备份与恢复**（备份整个实例 data / State Root）。
4. 最重要的是把接口设计好并落实到 spec（后续会经常引用该文档）。
5. **记忆系统本任务不碰**（讨论中明确排除）。

## Goal

nb-workshop 完成官方站点改造：按 `reference/passport/api-v1.md` 实现 Passport Module（账号密码注册保留邀请码、设备授权流、token 轮换与撤链、实例授权管理面板）与 Backup Module（State Root 归档的上传/列表/下载/删除 + 配额），neuro-book 实例侧完成关联面板与备份客户端；以真实 HTTP 集成测试覆盖设备码流全状态机（pending/approved/denied/expired/slow_down/重放撤链）与备份往返（上传-下载 sha256 一致、配额与 rotate），typecheck/build 全绿。约束：现有 Workshop API 与匿名浏览边界零回归；离线写作不因未关联而降级。接口变更必须先改 spec 再改代码。

## Current State

- nb-workshop：Workshop 模块已建成（API v1 + 邀请码注册 + zip 上传下载 + 全量页面，53 测试）；无 OAuth/OIDC、无 PAT、无设备授权、无备份。`User + passwordHash + cookie session` 即 Passport Account 种子，零迁移。
- neuro-book：本地账号是实例门禁（`auth: true`，Task 100），与 Passport 无关；State Root = `workspace/`（含 `.nbook` 应用库）+ `config.yaml` + `.env` + `logs/`。
- llmlint：转向 skill 端收集数据，本任务不实施其贡献链路（Contribution Module 在 spec 中仅预留）。

## Decisions / Discussion（拍板，勿重议）

产品讨论（2026-07-21，三轮）结论：

1. **单实例单用户**。现有本地多用户名存实亡，改造为「账号槽位」：一个槽位持有一份 Passport 授权，用户可切换（笔名场景）。**槽位只管在线身份，不管本地数据可见性**——projects 等本地数据实例级共享。多用户以后再考虑。
2. **实例密码与 Passport 分离**：`auth: true` 只是进门验证；Passport Account 管在线服务身份。二者显式关联，绝不合表；离线写作不强制登录。
3. **设备授权流（Device Authorization Grant）是实例关联的唯一流程**——自部署实例 origin 任意、无法预注册 redirect URI；设备码流对 web/桌面/无头部署一条链路通吃。实例是 public client，不持有 client secret。
4. **Token 按槽位存**（App SQLite，表结构带 slotId，v1 只实现默认槽位）；refresh token 轮换 + 重放撤链；scope 从第一天就窄（v1 只发 `workshop:publish` / `backup:read` / `backup:write`）。
5. **面板「已连接实例」管理页（吊销 + 重命名 + lastUsedAt）属 v1 验收范围**——公网实例失守时用户唯一的自救手段。
6. nb-workshop 定位升级为官方站点，Workshop 降级为站内模块；仓库改名后置。匿名浏览/下载保持无登录墙；邀请码闸门保留。
7. **备份归属账号级而非授权级**（灾难恢复 = 旧实例没了换新实例恢复；吊销授权不删备份）；服务端把归档当 opaque blob，归档格式合同归客户端（zip State Root，排除 logs/锁/wal，根放 `nb-backup.json`）。
8. 大架构原则（前置讨论）：统一身份、统一检索、**分离事实源**；账号体系不做「大一统记忆数据库」。记忆系统（Memory Core、应用级/项目级事实源）单独立项，本任务不碰。
9. **恢复应用机制 = staging 目录 + 手动停机替换**（2026-07-22 实施前拍板）：实例把归档解包到 State Root 同级 `restore-<ts>/`，UI 给三步停机替换指引；不接 Manager 停机事务。
10. **云备份端到端加密由 Task 128 接管**（2026-07-27 拍板）：当前实现会把包含 `.env` / `config.yaml` 的 `encryption: "none"` zip 上传到官方站，只适合本地开发验证，不能进入真实私有内测。Task 128 将先改 wire spec，再硬切为 NeuroBook 本地随机生成 256 位 Backup Master Key、AES-256-GCM 流式加密、用户恢复码和官方站只存密文；不保留明文云备份兼容路径。

## Verification / Test

已执行（2026-07-22）：

- **nb-workshop 集成测试**（`tests/passport-backup.integration.test.ts`，真实 build 产物 + 独立 server/DB）：19 用例覆盖设备码全状态机（pending/slow_down/批准兑换/双兑 invalid_grant/二次批准 409/deny→access_denied/过期→expired_token[直改库中 expiresAt，类型自适配]/scope 非法/限流 429）、refresh 轮换与旧 token 重放整链撤销、Bearer 面（publish token 过四端点、错 scope 403 `insufficient_scope`、admin 拒 Bearer、revoke/面板吊销后全 401）、备份往返（上传-下载 sha256 一致、meta 不符 400、份数满 413 `quota_exceeded`、rotate 只淘汰同 label auto 且 manual 幸存、单份超限 413、越权 404、匿名 401、删除幂等）。**全量 72 测试绿（19 新 + 53 旧回归）**——旧 53 全绿证明 Bearer 化未破坏 cookie 契约。时序稳定手段：`NB_PASSPORT_POLL_INTERVAL_SECONDS=60` 放大间隔使 slow_down 判定确定化。
- **nb-workshop typecheck** 绿。
- **neuro-book 单测**（`server/backup/`，9 用例）：排除规则与 zip-slip 纯函数直测；假 State Root（含真实 SQLite）打包→解包断言条目集/排除生效/sha256 一致/VACUUM INTO 快照可打开可查询；恢复服务本地起 http 假站点覆盖正常恢复落点、sha256 不符拒收、zip-slip 条目拒绝且无逃逸文件。
- **neuro-book typecheck**：本任务全部新增/改动文件零错误（工作区残留 7 个 Task 111 workflow 相关既有错误，与本任务无关，见「与计划出入」）。
- **端到端真实冒烟（脚本，已跑通后删除）**：neuro-book `PassportClientService` 直连真实 nb-workshop build 产物——startLink→pending 轮询→站点 cookie 会话批准（中文实例名）→兑换落库 App SQLite→getAccessToken→Bearer 调备份列表（quota 附带）→unlink 回未关联态，全链 PASS。

待用户执行：浏览器验收（官网 /link 页 + me 四 tab；NeuroBook 顶栏“个人中心”的关联/备份/恢复全流程 + 恢复指引卡片）；大体量 State Root 的备份内存/耗时观察。

## Implementation Walkthrough

实施于 2026-07-22，批次 0→A1→A2→B→测试→C1→C2 顺序落地。

### 批次 0：spec 三处补订

`reference/passport/api-v1.md`：§6.3 补 /link 页三个站内端点；§10 `PassportDeviceCode` 加 `authorizationId`（批准即建授权回写，兑换只签发 token，批准后面板立刻可见）；§9.2 补 sha256 为 64 位小写 hex + 列表响应附 `quota` 对象。

### A1+A2+B（nb-workshop）

- **Schema**：一次 migration `20260722012218_passport_and_backup` 建四表（PassportDeviceCode / PassportAuthorization / PassportToken / InstanceBackup，status 用 String 不引 enum）。
- **utils**：`server/utils/passport.ts`（token 生成/sha256 摘要/Crockford userCode 生成与归一化/撤链 `revokeAuthorizationChain`；TTL 常量全部 env 可覆写）、`rate-limit.ts`（进程内固定窗口）、`passport-dto.ts` + `shared/dto/passport.dto.ts`、`passport-guard.ts`（`requireAccess(event, scope)`：Bearer 查表校验+scope+lastUsedAt 懒更新 fire-and-forget，无 Bearer 回落 cookie session）。
- **端点**：`api/v1/passport/` 下 device/code、token（核心状态机：approved 消费与 refresh 轮换都用 `updateMany` 条件守卫防并发双花，双花走撤链；轮换事务顺带惰性清扫过期 access）、revoke、device/[userCode] GET+approve+deny（approve 事务内建授权+条件回写，输者整体回滚）、authorizations 三端点。
- **Bearer 化**：items POST / versions POST / items PATCH / me/items GET 换 `requireAccess(event, "workshop:publish")`；`requireOwnedItem(event, slug, user?)` 加可选参数跳过内部取会话。
- **Backup**：`backup-upload.ts` 用 **busboy 流式**解析（拒用 readMultipartFormData 的全内存缓冲；Content-Length 预检+流中实测双保险，超限销毁流删 tmp）；上传端点=tmp 收好后交互事务查配额（rotate 在事务内逐个淘汰同 label 最旧 auto）→落行（storagePath 同事务回写 `<userId>/<id>.zip`）→提交后 rename（失败补偿删行，对齐 versions.post 模式）；列表附 quota；下载 `sendStream` + `x-nb-sha256`；删除幂等。
- **前端**：`/link` 批准页（query 预填、实例名可改、scope 自然语言说明、四终态）；me.vue 扩为四 tab，新增 `PassportAuthorizationPanel.vue`（列表/行内重命名/两步确认吊销/显示已吊销开关）与 `BackupPanel.vue`（配额条/下载 `<a>` 走 cookie/两步确认删除）；`app/utils/passport-scopes.ts` scope 文案映射；登录页与 auth 中间件加 `?redirect=` 回跳（防开放跳转只收站内路径）；useWorkshopApi 追加 9 个调用。
- 新依赖：busboy + @types/busboy。

### C1（neuro-book 关联链路）

- **App 库**：`PassportCredential` 只保存默认槽位、官网账号展示信息、scope 与 refresh token，不保存上游地址。2026-07-27 前向迁移重建表，只复制地址严格等于 `https://nbook.notnotype.com` 的旧凭据并删除 `siteBaseUrl`；官网凭据继续有效，旧自定义站点凭据被丢弃。真相 schema 是 `schema.sqlite.prisma`，`schema.prisma` 是 fallback 副本，两份同步。
- **服务**：`server/passport/passport-client-service.ts`（class + 全局单例）：startLink（deviceCode 只留服务端内存会话）/pollLink（每调一次只转发一次上游 grant；slow_down 间隔+5 透传）/unlink（best-effort revoke 后删本地）/getAccessToken（**refresh 单飞 in-flight 去重——并发双刷会导致旧 token 双花触发官方站整链撤销**；新 refresh 先落库再更新缓存；invalid_grant 清凭据抛 `PassportUnlinkedError`）。`passport-errors.ts` 含 `wrapPassportErrors`（路由层转 409 `passport_unlinked`）。
- **路由**：`api/passport/` status / link/start / link/poll / unlink。
- **UI**：Passport 与云备份已从技术设置迁入独立“个人中心”。IDE 顶栏和无 Project 的项目选择页复用同一账户菜单；Profile 面板覆盖未关联/等待批准/已关联，并把状态请求明确拆成 loading/error/loaded 三态，错误详情在面板内持久显示并可重试。

### C2（neuro-book 备份/恢复）

- `server/backup/backup-archive-rules.ts`：排除与 zip-slip 纯函数（两侧共享判据）。
- `backup-archive-service.ts`：范围 = workspace/ 全量 + 顶层 config.yaml/.env；`*.sqlite` 一律 `VACUUM INTO` 冷快照（@libsql/client 独立连接；失败降级原样拷贝并记 warning）；fflate `Zip/ZipDeflate` 流式打包，ondata 回调里边写盘边算 sha256，`writableNeedDrain` 手动背压；zip 根写 `nb-backup.json`。
- `backup-restore-service.ts`：native fetch 流式下载边算 sha256（与云端元数据比对）→ fflate `Unzip` 流式解包到 **State Root 同级** `restore-<ts>/`（条目名过 `sanitizeZipEntryName`，非法即失败并清理半成品）→ 校验 manifest formatVersion。
- `backup-job-manager.ts`：进程内单任务后台管理（备份/恢复互斥 409；结构化 progress；打包前先验凭据、上传前再取一次 token 防长打包期过期；`fs.openAsBlob` 优先、整读 Blob 兜底；quota_exceeded 转友好文案）。
- 路由 `api/passport/backups/`：列表/删除代理官方站（带 `wrapPassportErrors`），创建/恢复起后台任务，jobs/[id] 轮询。
- 面板备份区：手动备份（备注可选）、任务进度行（phase 结构化→i18n 文案）、恢复完成指引卡片（解包路径+三步停机替换+机密警示）、配额条、两步确认恢复/删除。
- 2026-07-27 由 Task 128 完成端到端加密硬切：zip 流直接进入 AES-256-GCM envelope，keyring 与恢复码留在本机，官方站只保存密文；恢复先认证密文，再解密到 staging 目录。

## 2026-07-28：Passport 凭据提交补偿与轮询状态机

- 真实批准故障暴露出一次性 grant 的提交窗口：官网已经消费设备码并返回 token 后，本地 App SQLite upsert 失败，旧实现仍可能让前端继续轮询，最终只看到未处理的 `invalid_grant`。设备码和 refresh token 的一次性语义保持不变，没有把官方站协议改成可重放。
- `PassportLinkPollDto` 新增两个稳定终态：`credential_persist_failed` 表示官网已批准但本机未能保存，并附远端清理结果 `revoked | unknown`；`exchange_invalid` 表示设备码已经失效或被消费。两者都会删除进程内关联会话，禁止二次兑换。
- 首次兑换只有在凭据 upsert 成功后才进入 `linked` 并写 access-token cache。upsert 失败时使用刚收到的 refresh token best-effort revoke，不保存或记录 token；revoke 失败只把清理结果改为 `unknown`，不覆盖原始本地提交错误。
- refresh 轮换同样先落库再更新 cache。新 refresh token 落库失败时 best-effort 吊销新 token、删除旧凭据、清空 cache，并设置进程内阻断闩锁；调用方得到 `PassportUnlinkedError`，必须重新关联，不能重发已轮换的旧 token。
- 前端计时、轮询、404 对账和重试已收口到 `usePassportLink`。只有 `pending` 自动轮询；网络或未知 HTTP 错误进入保留设备码的可重试暂停态；本地提交失败停止计时并提示重新发起，远端清理未知时显示官网授权管理入口。通知和界面不暴露 Prisma 错误或 token。
- 日志只记录阶段、账号 ID、清理结果和脱敏错误；通用敏感规则新增 `deviceCode` 与 grant 内容。聚焦验证覆盖 upsert/revoke 成败、会话终止、禁止二次兑换、refresh 本地提交失败、旧凭据清理、日志脱敏，以及 fake timers 下的 pending 调度、暂停、手动重试、404 对账和 timer 清理。
- App SQLite schema 前置条件改由 Task 105/118 的统一迁移门禁保证，不增加 Passport 启动补丁。真实浏览器批准、落库、状态刷新和一次 access-token 使用仍未执行。

## 2026-07-27：官方站网络错误治理

- 新增 `official-site-transport.ts` 作为唯一官方站请求出口，覆盖设备码、token 交换/刷新、吊销、备份列表、上传、元数据、下载和删除。endpoint 只能是固定官网 origin 下不带 query/fragment 的 `/api/...` 路径。
- DNS、拒绝连接、TLS 和超时等无响应故障统一返回 HTTP 502 + `data.error="passport_site_unreachable"`，提示检查 DNS 或代理；官方站 5xx 转换为 `passport_site_unavailable`。已有 OAuth 4xx、`authorization_pending`、配额等业务错误原样保留。
- 控制面请求和流式下载取得响应头前使用 10 秒超时；下载 body 取得后不中断。备份上传不使用 10 秒整请求超时，否则大文件上传会被必然截断，这是相对原计划的有意调整。
- 失败事件直接进入 NeuroBook 既有持久日志 `passport.officialSite.requestFailed`，只记录 operation、endpoint、failure、causeCode、upstreamStatus 和 durationMs，不记录 token、请求参数或 body。本体不引入 Pino。
- Node 24 使用环境代理时，必须在启动 NeuroBook 进程之前设置环境变量并重启进程；不要把官网 IP 写死，也不要在运行后修改全局 dispatcher：

```powershell
$env:NODE_USE_ENV_PROXY = "1"
$env:NO_PROXY = "localhost,127.0.0.1,::1"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
bun run dev
```

`NODE_USE_ENV_PROXY` 必须由启动 shell、服务管理器或容器环境提供；仅在 Node 进程启动后修改无效。直连环境不需要设置代理，原始 `ENOTFOUND nbook.notnotype.com` 仍表示本机 DNS 没有解析出官网地址。

## 与计划出入

1. 初版没有写 neuro-book 客户端服务单测；2026-07-27 已补齐设备码、refresh single-flight、吊销、固定官网备份链和隔离数据库迁移回归。
2. **`prisma migrate dev` 在 App 库不可用**（旧 migration checksum 漂移会触发 reset 提示），改为手写 SQL + `migrate:deploy`，与生产链路一致；这也暴露了 dev/deploy 双轨的既有漂移，未在本任务修复。
3. **neuro-book typecheck 有 7 个既有错误**（`neuro-agent-harness.ts`×4、`profile-http-service.ts`×1、`agent-job-manager.test.ts`×2，全部是工作区里 Task 111 未提交改动的 WorkflowCatalogItem source 类型问题），与本任务无关、未处理。
4. 定时备份（kind:auto + rotate 调度）按计划刻意不进本轮，仅手动备份；服务端 rotate 语义已就绪。
5. nb-workshop 集成测试 afterAll 清理在 Windows 下会因 server 句柄未释放 EPERM——已改为重试+容忍残留（`.agent/` 下残留无害）。
6. 网络治理原计划把“10 秒连接超时”统一写成一个参数；实际 `$fetch` timeout 会覆盖整个请求。为避免 1 GiB 备份上传在 10 秒被强制中断，上传明确关闭整请求 timeout，控制面和下载响应头仍保留 10 秒门限。

## TODO / Follow-ups

- [ ] 浏览器验收（用户）：/link 页、me 四 tab、实例“个人中心”关联/备份/恢复全流程。
- [ ] 大体量 State Root（GB 级）备份的内存与耗时实测。
- [ ] 定时备份调度（kind:auto + rotate=true，Nitro 插件 setInterval）。
- [x] 云备份端到端加密、恢复码/keyring 与密文 wire contract 已由 [Task 128](../128-neuro-book-site-deployment/README.md) 完成。
- [x] 上线前回补登录防爆破 / token 端点更强限流（已由 Task 119 完成：login/register/改密限流，见 `docs/tasks/119-workshop-account-admin/README.md`）。
- [x] 官方域名与 `OFFICIAL_PASSPORT_SITE_URL` 已由 [Task 128](../128-neuro-book-site-deployment/README.md) 固定为 `https://nbook.notnotype.com`；客户端不再提供自定义地址输入，数据库也不再保存地址列。
- [ ] 后续任务（不在本任务）：邮箱注册与验证、llmlint Contribution Outbox 与摄入端、记忆系统（Task 113 讨论中）；GitHub OAuth 生产配置仍延后到 Public Invite Gate。
- [x] App 库 migration 规划与 apply 已由 Task 105/118 的统一 Application State runner 收口；`sqlite-migrate.mjs`、Manager、dev 与 Product 启动门禁消费同一 migration 目录和 `_prisma_migrations` 判断。
