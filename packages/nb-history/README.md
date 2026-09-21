# @notnotype/nb-history

Workspace 操作日志与文件历史模块:**append-only 事件溯源 + 内容寻址快照**(SQLite / libsql)。为「人类用户、多个 AI 会话、平台系统、外部工具」共同编辑的文件工作区提供:

1. **单文件版本时间线**——任意版本查看 / diff / 恢复,跨改名追踪;
2. **误删找回**——已删除文件列表 + 一键恢复;
3. **用户审查收件箱**——看到 AI 改了什么(diff 基准精确),接受或一键还原;
4. **会话级"未见变更"**——AI 会话重新打开时能知道别人(用户 / 其他会话 / 外部)改了什么,含"用户还原了我的修改"的通知。

> 状态:**spike 已完成验收**。场景测试 T1–T12 全绿(29 tests),性能 smoke P1–P3 达标,Windows 句柄释放实测通过;集成期通用化改造后 49 tests 全绿。契约与验收标准见派发任务书(NeuroBook 仓 `.agents/tasks/91-operation-log-file-history/GOAL.md`);实现中的契约发现与集成期决策见 [NOTES.md](NOTES.md)。

## 快速上手

```ts
import {WorkspaceHistory} from "@notnotype/nb-history";

const history = await WorkspaceHistory.open({
    databasePath: "/path/to/.nbook/history.sqlite", // 独立库文件,模块全权管理
    // path 语义由宿主决定:默认 path 即磁盘路径(绝对路径);
    // 有自己的根目录概念时注入 resolvePath(日志里记录的是调用方传入的字符串)
    resolvePath: (path) => `/path/to/workspace/${path}`,
    config: {retentionFullDays: 90},                // 可选,全部参数可注入
});

// 写入(模块代落盘 + 记账;宿主已自行落盘则用 registerWrite 系列只补记账)
await history.performWrite({kind: "agent", sessionId: "s1"}, "manuscript/ch1.md", "正文…");

// 观察型记账:宿主(watcher / 事件门)拿不到写前内容时,只提供写后内容,
// before 由模块从账面末态自动推断;与账面一致返回 null(吸收回声)
await history.registerObservedWrite({kind: "agent", sessionId: "s1"}, "manuscript/ch1.md", "正文…");

// 用户审查
const inbox = await history.inbox("u1");        // 待审文件组(diff 基准 + 逐条归因)
await history.accept("u1", "manuscript/ch1.md"); // 接受
await history.revert("u1", "manuscript/ch1.md"); // 或一键还原到已接受基线

// HTTP/GUI 客户端应携带它看到的最后 entry id,避免旧页面接受或还原新变化。
await history.acceptAtRevision("u1", "manuscript/ch1.md", revision);
await history.revertAtRevision("u1", "manuscript/ch1.md", revision);

// 会话互知
await history.initCursor("s2");                  // 新会话:游标置于当前头部
const unseen = await history.unseenChanges("s2"); // 别人改了什么(不含自己)
await history.advanceCursor("s2", maxEntryId);    // 提醒送达后显式推进

// 文件历史
const timeline = await history.timeline("manuscript/ch1.md", {followRenames: true});
const gone = await history.deletedFiles();
await history.restore({kind: "user", userId: "u1"}, "manuscript/ch1.md", sourceEntryId);

await history.close(); // close 后库文件在 Windows 上可直接删除
```

## 运行

```bash
bun install
bun test            # 29 个场景 + 性能测试
bun run typecheck   # tsc --noEmit (strict)
bun run demo        # 可读的完整走查(时间线→收件箱→多会话→误删找回)
```

## API 概览

| 方法 | 作用 |
|---|---|
| `WorkspaceHistory.open(options)` | 打开 / 建库建表;注入 config、时钟与 resolvePath(路径语义) |
| `performWrite / performDelete / performRename(actor, …)` | 模块代落盘 + 记账(写盘在先,记账紧随) |
| `registerWrite / registerDelete / registerRename(actor, …)` | 宿主已自行落盘,只补记账 |
| `registerObservedWrite(actor, path, after)` | 观察型记账:宿主无写前内容时用,before 从账面末态推断;与账面一致返回 null(吸收回声) |
| `revert(userId, path)` | 收件箱还原到已接受基线,记 `file.revert`(一等事件,其他会话可见) |
| `revertAtRevision(userId, path, revision)` | 在同一写锁内复核 revision 与磁盘末态后还原；过期时抛 `HistoryInboxMutationError` |
| `restore(actor, path, sourceEntryId)` | 恢复任意历史版本 / 删除找回,记 `file.restore` |
| `reconcile(path, current)` | 对账:与账面末态不一致时补 `external` 条目;一致 no-op(吸收 watcher 回声) |
| `timeline(path, {followRenames, limit})` | 单文件时间线(升序),可跨 rename 链 |
| `snapshotBody(hash)` / `textDiff(a, b)` | 取任意版本内容 / 两版文本 diff(缺失、二进制返回明确标记) |
| `deletedFiles()` | 当前已删除且可恢复的文件列表 |
| `inbox(userId)` / `accept(userId, path)` | 用户审查收件箱 / 推进接受位点 |
| `acceptAtRevision(...)` / `acceptAllAtRevision(...)` | 条件式接受单项 / 在单个事务中接受整个已确认收件箱 |
| `unseenChanges(sessionId)` / `initCursor` / `advanceCursor` | 会话未见变更 / 游标管理(显式推进,不隐式) |
| `entry(id)` | 按 id 读单条日志 |
| `prune()` | 执行保留策略(稀疏化 + 快照引用计数 GC) |
| `purgePaths(predicate)` | 宿主收紧路径范围时，原子删除匹配日志、acceptance 与孤儿快照；cursor 保留 |
| `close()` | 释放句柄(含 libsql/bun/Windows 的 GC 协助释放) |

## 语义要点

- **path 语义由宿主决定**(通用化):日志记录调用方传入的 path 字符串,模块只做防御校验(拒绝空 / NUL)。同文件始终同字符串由宿主保证——有自己的根目录时注入 `resolvePath` 映射到磁盘,或直接传绝对路径。模块不做路径过滤策略,哪些文件值得记录由宿主调用侧决定。
- **actor 四类**:`user(userId)` / `agent(sessionId)` / `system(source)` / `external`,判别联合,非法组合不可表示;数据库行读回时同样校验,坏行抛错。
- **操作六型**:`file.create / edit / delete / rename / revert / restore`;rename 只表示改名(内容不变);revert 带 `revertedEntryIds`,restore 带 `sourceEntryId`。
- **收件箱**:某文件在接受位点之后存在 **agent / system** 条目时出现;组内含位点以来**全部**条目(用户 / 外部的也在,如实归因);diff 基准 = 位点后第一条的 before 态。用户 / 外部条目本身不触发收件箱。
- **游标**:unseen = `id > 游标` 且非本会话自己;每组 diff 基准 = 第一条未见条目的 before 态(数学上 = 该会话最后见过的状态)。游标只经 `initCursor` / `advanceCursor` 显式推进——宿主应在提醒成功送达后才推进,崩溃回合的变更下次仍会浮现。
- **写路径内建对账**:所有写入口(perform* / register* / revert / restore)在记账前比对磁盘与账面末态,不一致自动先补一条 `external` 条目——beforeHash 链恒精确,崩溃丢账由下次任意写入或 `reconcile` 自愈。`registerObservedWrite` 是唯一例外:before 直接取自账面末态(构造性一致,无对账噪声),宿主提供写前内容的精度与它无关。
- **保留策略**(全部可配):窗口内(默认 90 天)全量;窗口外每文件每日保留末条;**永不删除**:未接受的收件箱段、活跃游标(窗口内活跃)位点之后的条目、每文件最新一条。快照按引用计数 GC。稀疏化后相邻条目 before/after 链会断开,渲染方不得假设连续,应按各版本快照取内容。

## 数据模型

| 表 | 内容 |
|---|---|
| `operation_log` | 正常记账 append-only；删除只允许 retention `prune` 与显式 `purgePaths`;rename 的 contentHash 同写 before/after 两列,使「after_hash = 操作后内容」对除 delete/revert 外的类型统一成立 |
| `file_snapshot` | 内容寻址快照:`hash = sha256(原始字节)`,`body` BLOB;超限 / 二进制只记 hash 行(body NULL) |
| `session_cursor` | 每会话已见位点 + `updated_at`(保留策略据此判断活跃) |
| `file_acceptance` | 每 (用户, 路径) 已接受位点;rename 后位点沿历史名字取最大值迁移 |

## 性能实测

环境:Windows 11 + bun 1.3.14 + @libsql/client 0.17.4,本地 SSD,WAL 模式。

| 项 | 实测 | 阈值 |
|---|---|---|
| P1 单次 `performWrite`(30KB 文本,含 hash + 快照 + 记账) | **8.5–12ms**(50 次平均) | ≤ 20ms |
| P2 `unseenChanges`(1 万条目库,5000 条未见积压) | **best 18–35ms**(随机器负载浮动) | ≤ 50ms |
| P2 `inbox`(已审 90/100、10 组待审——代表性状态) | **best ≈ 8–11ms** | ≤ 50ms |
| P2 `inbox` 最坏情况(零接受,全库 1 万条扫描) | **best 32–67ms**(随机器负载;报告项,见限制 5) | 报告项 |
| P2 `timeline`(单文件 100 版) | **best ≈ 0.7–1.3ms** | ≤ 50ms |
| P3 单文件 100 版 × 30KB 库体积 | **3.00MB**(快照原文 2.86MB,开销约 5%;相同内容重写零增长) | 报告项 |

## 已知限制

1. **单进程单写者**:写路径经写互斥串行;查询走独立读连接(WAL 一写多读)+ 读事务快照,读写互不阻塞、视图不被中途提交撕裂。多进程同时打开同一库不支持。
2. **libsql/bun/Windows 句柄惯性**:`close()` 内建「强制 GC + 事件循环拍」协助释放(约 200ms 预算),close 返回后库文件可删(T12 实测)。非 bun 运行时没有 `Bun.gc`,只能等自然 GC——删除库文件前可能需要重试。一次性 CLI 进程末尾仍需显式 `process.exit`(libsql 事件循环句柄不自然退出)。对照:`bun:sqlite` 无此问题(close 即释放),若宿主未来只跑 bun 可考虑换驱动(集成决策,见 NOTES)。
3. **reconcile 不检测改名**:外部改名表现为 delete + create 两条 external 条目。
4. **收件箱阻止稀疏**:用户长期不审查时,未接受段永不 prune——宿主应提供 auto-accept 策略(如"N 天未审自动接受")兜底,否则库只增不减。
5. **inbox 扫描量随审查进度收敛,但零接受是病态全扫**:inbox 带接受位点 SQL 预过滤,用户随写随审时(代表性状态)1 万条库 ≈ 11ms;若用户**从不**审查,退化为全库扫描,1 万条实测 best 32–67ms(随机器负载),可能越过 50ms——这是当前实现对 GOAL P2 阈值的已知偏差。`unseenChanges` 无法预过滤(未见就是未见),5000 条积压 ≈ 18–35ms。十万级条目需要增量化(位点下界预过滤已做,进一步需增量分组 / 分页)——spike 明确不做,方向已记录。
6. **超限(默认 2MB)/ 二进制版本**只记事件,不可 diff / restore(调用时明确报错 / 标记)。
7. **无 delta 压缩**:快照是全文,100 版 30KB ≈ 3MB(≈原文总量 + 5%)。中长篇每章每天几十次保存的场景建议:宿主在调用侧节流(如 30s 合并)+ 定期 `prune`。如仍不可接受,相邻版本 delta 存储是明确的后续方案(未实现)。
8. **内容未变的保存也记一条 edit**(before == after):如实记录保存动作;不想要就在宿主调用侧跳过。

## 宿主集成义务

模块不做 UI、不做文件监听、不做提醒注入。宿主需要:

- 把自己的全部写入路径接到 `perform*` / `register*`(带 actor);
- 把 watcher 事件喂给 `reconcile`(模块自身落盘的回声会被 hash 比对吸收);
- 会话生命周期接 `initCursor`(创建时)/ `advanceCursor`(提醒送达后);
- 把 `unseenChanges` 结果转成提示注入给 AI;`inbox` / `timeline` / `deletedFiles` 接 UI;
- 注入保留策略配置,定期调 `prune()`;
- **隐私**:`history.sqlite` 含全文快照,严禁进入任何可分享的日志包 / 导出诊断流程。
