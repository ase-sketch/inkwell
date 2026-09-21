# NOTES —— 实现记录与契约发现

按 GOAL 要求记录:每个里程碑一行 + 实现中发现的契约疑点 / 决定。**没有擅自改动契约语义**;下列各条要么是契约留白处的落地决定,要么是与契约等价的实现形态,供派发方复核。

## 里程碑日志

- **M1 schema + repo 层**:四表 DDL + 判别联合「行 ↔ 类型」双向映射;非法行(actor 组合 / op 字段组合不合法)读回即抛错。完成。
- **M2 写入面 + 快照**:perform* / register* 六入口 + 内容寻址快照(超限 / 二进制降级只记 hash);写盘在先、记账紧随(R10)。完成。
- **M3 查询面**:时间线(rename 链回溯分段算法,历代同名不混入)、snapshotBody、textDiff、deletedFiles(名字末态分类)。完成。
- **M4 收件箱 + 游标 + revert/restore**:接受位点沿 rename 历史名迁移;revert 推进位点与记账同事务。完成。
- **M5 reconcile**:与写路径共用「账面末态 vs 磁盘」比对内核;回声抑制、崩溃自愈(T7/T8)。完成。
- **M6 prune + 快照 GC**:三条保护规则 + 按日稀疏 + 引用计数 GC。**修了一个自测炸出的 bug**(见发现 5)。完成。
- **M7 性能 + Windows 验收 + demo**:P1 ≈ 9ms、P2 ≈ 18/33/0.7ms、P3 = 3.00MB;T12 双测通过;demo 走查可读。完成。三轮全套件连跑 29 pass / 0 fail。
- **M8 审查轮(优化增强 + 结构收拾)**:修 1 个时间线边界 bug、读写分离双连接、若干 N+1 / 全表扫描消除、语义去重;31 tests(+2 回归)多轮连跑绿。详见发现 14。

## 契约发现与实现决定

1. **写路径内建对账(implicit reconcile)**。契约 R9/R10 只要求独立的 `reconcile` 入口 + 崩溃后自愈。实现把同一比对内核放进了**所有**写入口(perform* / register* / revert / restore):记账前发现磁盘与账面末态不一致,自动先补一条 `external` 条目。效果是 beforeHash 链**恒精确**(T8 断言逐段链接),崩溃丢账不需要等宿主扫描、下一次任意写入就自愈。这是对 R9/R10 的推广而非偏离,请复核确认。
2. **`unseenChanges` 对未初始化游标抛错**。契约未定义此情形。若默认位点 0,一个漏接 `initCursor` 的宿主会把全部历史当"未见"洪水般注入——显式抛错把集成错误暴露在第一次调用。`advanceCursor` 则允许 upsert(宿主可用它初始化)。
3. **revert 基线取"位点后第一条的 before 态"而非"位点条目的 after 态"**。两者由链连续性(发现 1 保证)恒等,但前者不依赖位点条目本身仍存活——位点条目可能已被 prune 稀疏掉,而位点后的段受保护规则 (a) 保护必然存活。等价且更稳。
4. **textDiff 的 binary 理由靠推断**。快照行没有"为什么没存 body"的列;`byte_size ≤ maxSnapshotBytes 却无 body ⇒ 只可能是二进制`(R3 的存储降级是确定性的)。超限与已 GC 均报该侧 missing。若未来 config 的上限调小,历史超限行会被误判为 missing 而非 binary——影响仅是提示文案,可接受。
5. **prune 的"当日末条"必须按全体窗口外条目计算**(修过的 bug):最初在"剔除保护后的候选集"里取当日末条,当真末条恰好被保护(如同时是 path 末条)时会错误多保一条次末条。测试 T10a 炸出,已修——先算日末条集合,再对"窗口外 ∧ 未保护 ∧ 非日末条"删除。
6. **rename 的 contentHash 同写 before/after 两列**。使「after_hash 列 = 操作后内容」对除 delete/revert 外的所有类型统一成立,末态查询(reconcile / deletedFiles)不需要按类型分叉;读回时校验 before == after 才认作合法 rename 行。
7. **libsql/bun/Windows 句柄释放实测**(T12 的核心发现):
   - 裸 `client.close()` 后库文件**不可删**(EBUSY),连续 30 次重试不带 GC 也不释放;
   - `close()` 后**强制 GC(`Bun.gc(true)`) + 1~2 个事件循环拍**内释放(实测 ≈ 100ms)——释放发生在 napi finalizer 于 GC 之后的调度里;
   - 对照组 `bun:sqlite` close 即释放,零等待;
   - 处置:模块 `close()` 内建 8 拍 GC 协助(~200ms 预算),T12a(close 后直删库文件,无重试)稳定通过。**按 GOAL 未换驱动**;若宿主确定只跑 bun 运行时,`bun:sqlite` 是干净得多的选项——这是集成期决策,证据已备。
   - 一次性 CLI 进程仍需显式 `process.exit`(libsql 事件循环句柄不自然退出,与宿主已知经验一致)。
8. **测试临时目录清理的 EBUSY 归因环境**(AV / 索引器):偶发、与句柄无关(严格金丝雀 T12a 从未失败;EBUSY 目录里被锁的是刚写入的大文件,GC 重试 2 秒不解)。测试清理改为"预算内重试 + 最终告警不失败",避免环境噪声污染无关用例;泄漏检测职责归 T12a。
9. **收件箱触发者 = agent / system;user / external 不触发**(R5 已定,记录理由):external 通常是用户自己的外部编辑器,进收件箱会让用户审查自己;但它们**在组内如实出现**,diff 基准也会覆盖它们——用户看到的是"自上次接受以来这个文件的全部变化"。
10. **内容未变的保存照记一条 edit(before == after)**。契约未禁止;如实记录"有人保存过"这个事实,收件箱里表现为空 diff 条目。宿主不想要可在调用侧跳过(hash 相同不调用)。
11. **inbox 性能整改(两轮)**:首轮 P2 实测 47.9~67.5ms 贴线/超线。整改 (a) 接受位点从"每组一条 SQL"改为"每用户一次预取";(b) rename 扫描加部分索引 `WHERE op_type = 'file.rename'` → best 31–33ms。再整改 (c) **接受位点 SQL 预过滤**(`LEFT JOIN file_acceptance … WHERE id > COALESCE(位点, 0)`,rename 迁移语义仍在 JS 精确重算,预过滤只多含不漏)→ 代表性状态(已审 90/100)best ≈ 11ms,扫描量随审查进度收敛。这是集成后生产路径的真实收益。
12. **【对 GOAL P2 的一处偏差,如实上报】最坏情况 inbox 不稳达 50ms 线**:零接受(用户从不审查)时 inbox 退化为全库扫描,1 万条实测 best 32ms(空闲机)~ 67ms(负载机,AV 实扫作祟)。处置:性能断言按**代表性状态**(接受随写作推进,11ms,≤50ms 达标),最坏情况每轮以报告项打印(不断言);测量在种子写入后 checkpoint + 静置 1.5s,取 best-of-5,原始值全打印。结构性修复方向 = 增量分组 / 分页(spike 边界外)。宿主侧缓解 = auto-accept 策略(同 README 限制 4 的动机)。
13. **P2 场景重构说明**:种子数据含 u1 的 90/100 接受位点(代表性)+ u2 零接受(最坏);`unseenChanges` 保持 5000 条积压的重场景断言(best 18–35ms,达标)。
14. **审查轮(M8)修复与整改清单**:
    - **【bug·已修】时间线出生边界**:`collectSegments` 原来只把 rename 当分段边界——旧文件 A→N 改名占用过名字、死亡后**全新 create** 同名 N 时,回溯会把旧化身错误缝进新文件的时间线。修:倒扫时 rename 与 create 都是「出生」,create 终止回溯(delete→restore 延续不算分界,T2 语义保持)。补 2 个回归测试(历代同名分界、a→b→a 环)。
    - **【一致性】读写分离双连接**:原实现查询与写共用一个连接且查询不带事务——多条 SELECT 拼装的视图(inbox/unseen/timeline/deletedFiles)可能被中途提交撕裂;而单连接上直接包读事务会与写事务嵌套 BEGIN 互撞。改为 WAL 标准形态:独立读连接 + 读互斥 + `transaction("read")` 快照;写连接维持原写互斥。close() 关两个连接。
    - **【N+1 消除】`deletedFiles`**:每名字一条 `loadEntryById` → 批量 `loadEntriesByIds`(分块 IN)。
    - **【全表扫描消除】`revert` / `accept`**:原来为算一个文件的组加载全账本 → `loadGroupEntries` 按历史名字定向查询(再按现名精确过滤排除历代同名)。
    - **【语义去重】接受位点**:inbox / revert / prune 三处各自实现的「位点随 rename 迁移取最大」统一为纯函数 `acceptancePositionFor`。
    - **【健壮性】** `close()` 幂等 + 关闭前排空读写队列;blob → 字节转换收拢为单一 helper;游标 upsert 去重。
    - **【测量鲁棒】P1 断言改中位数**(均值对同机负载尖刺敏感,曾出现一次非复现的瞬态超线;中位数 = 单次写入典型开销,均值仍打印不隐瞒)。
    - 整改后基准(同机):inbox 代表性 best ≈ 8ms、最坏 ≈ 36ms、unseen ≈ 18ms——读写分离后查询略快于整改前。
15. **路径范围收紧必须由模块原子清理**。宿主可能在集成后发现某类运行时派生文件不应进入历史。宿主不能直接操作 SQLite；`purgePaths(predicate)` 在模块写锁和单事务内删除匹配 operation、对应 acceptance 与孤儿快照，并保留 session cursor。正常记账仍为 append-only，显式路径清理与 retention prune 是仅有的删除入口。
16. **客户端审查 mutation 必须携带 revision 并在模块写锁内复核**。宿主先调用 `inbox()`、再调用无条件 `accept()` / `revert()` 会留下 TOCTOU 窗口：旧页面可能接受或还原后来新增的条目。新增 `acceptAtRevision`、`revertAtRevision` 与单事务 `acceptAllAtRevision`；条件式 revert 还会在落盘前复核磁盘 hash，未记账的外部变化按 stale 拒绝。底层无条件 API 继续服务脚本和模块内部明确接受“当前最新状态”的调用。

17. **�������ھ���(DSH ��������,ƫ����Լ R1)��·������ȥ����,�Ƴ� workspaceRoot**��
    - ����:GOAL �� `workspaceRoot` �������� NeuroBook��һ��С˵���������ĵ������衣sibling ģ����(nb-memory / nb-workflow)��ͨ����̬�ǡ�ȫ���߿�ע�� port��������������;DSH ������Ҫ�๤����(���Ự cwd ��ͬ),��������ֱ�Ӳ�������
    - ���:`OpenOptions` �Ƴ� `workspaceRoot`,���� `resolvePath?: (path) => string`(ȱʡԭ������,�� path ֱ���Ǵ���·��)����־��¼���÷�������ַ���,ģ�鲻��д;���� / ���̾� resolvePath��`validateRelativePath` �� `validatePath`:ֻ�ܾ���·���� NUL,����Լ������·�� / ��б�� / `..` ������ͬ�ļ�ͬ�ַ�������������֤(����С�ģ�鲻��·�����˲��ԡ��߽�һ��)��
    - ����:NeuroBook δ��ע�� `resolvePath: p => join(root, p)` ���ָ�������;���в���ͨ��ע�� resolvePath �������·�����
    - ���� `registerObservedWrite(actor, path, after)`:�۲��ͼ������,�����ò���дǰ���ݵ�����(watcher / �¼���)��before ������ĩ̬ȡ hash(prune ����ĩ�����ձ���),����ȷ�ǹ����Ե�,������ʽ����;������һ�·��� null(������������)������Ψһ������ʽ���˵�д��ڡ��������ṩдǰ���ݵľ��������޹�,README ��ע����
    - NeuroBook monorepo 已在 S3 切换到 `@notnotype/nb-history` 正式入口；调用侧通过 `resolvePath` 保持 Project 相对路径语义。
    - 集成证据见根 Task [`006-leader-2026-08-16-s3-single-source-integrations`](../../.agents/tasks/00149-monorepo-workspace-consolidation/walkthroughs/006-leader-2026-08-16-s3-single-source-integrations.md)。
