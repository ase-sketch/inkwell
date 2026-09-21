import fs from "node:fs/promises";
import nodePath from "node:path";
import {WorkspaceHistory, type OperationActor, type OperationLogEntry} from "../src";

/**
 * nb-history 完整走查 demo:时间线 → 收件箱 accept/revert → 多会话互知 → 误删找回。
 * 用法: bun scripts/demo.ts   (工作区与库建在 .tmp/demo/,可重复运行)
 */

const USER: OperationActor = {kind: "user", userId: "作者"};
const AGENT_S1: OperationActor = {kind: "agent", sessionId: "写作会话-1"};

function say(title: string): void {
    console.log(`\n═══ ${title} ═══`);
}

function describeEntry(entry: OperationLogEntry): string {
    const actor = entry.actor;
    const who =
        actor.kind === "user" ? `用户(${actor.userId})`
        : actor.kind === "agent" ? `AI(${actor.sessionId})`
        : actor.kind === "system" ? `系统(${actor.source})`
        : "外部";
    const op = entry.operation;
    const what =
        op.type === "file.create" ? "创建"
        : op.type === "file.edit" ? "编辑"
        : op.type === "file.delete" ? "删除"
        : op.type === "file.rename" ? `改名 ${op.fromPath} → ${op.toPath}`
        : op.type === "file.revert" ? `还原(撤销 #${op.revertedEntryIds.join(",#")})`
        : `恢复(取自 #${op.sourceEntryId})`;
    return `#${entry.id} ${who} ${what}`;
}

async function main(): Promise<void> {
    const base = nodePath.join(import.meta.dir, "..", ".tmp", "demo");
    await fs.rm(base, {recursive: true, force: true});
    const root = nodePath.join(base, "workspace");
    await fs.mkdir(root, {recursive: true});

    const history = await WorkspaceHistory.open({
        databasePath: nodePath.join(base, "history.sqlite"),
        resolvePath: (p) => nodePath.join(root, p),
    });
    const readDisk = async (p: string): Promise<string> =>
        fs.readFile(nodePath.join(root, p), "utf-8").then((s) => JSON.stringify(s)).catch(() => "(不存在)");

    say("1. 记录与单文件时间线");
    await history.performWrite(USER, "manuscript/ch1.md", "第一章\n夜色如墨。\n");
    await history.initCursor("写作会话-1"); // AI 会话上线,游标停在当前头部
    await history.performWrite(AGENT_S1, "manuscript/ch1.md", "第一章\n夜色如墨,江风扑面。\n");
    const v3 = await history.performWrite(AGENT_S1, "manuscript/ch1.md", "第一章\n夜色如墨,江风扑面。\n远处传来钟声。\n");
    for (const item of await history.timeline("manuscript/ch1.md")) {
        console.log(`  ${describeEntry(item.entry)}`);
    }
    if (v3.operation.type === "file.edit") {
        const diff = await history.textDiff(v3.operation.beforeHash, v3.operation.afterHash);
        if (diff.available) {
            const added = diff.changes.filter((c) => c.added).map((c) => c.value.trim());
            console.log(`  最新一版新增: ${JSON.stringify(added.join(" / "))}`);
        }
    }

    say("2. 收件箱:审查 AI 改动 → 接受;再改 → 还原");
    const inbox1 = await history.inbox("作者");
    console.log(`  收件箱 ${inbox1.length} 组;ch1 待审 ${inbox1[0]!.entries.length} 条(AI 两次编辑 + 用户自己的创建,组内如实归因)`);
    await history.accept("作者", "manuscript/ch1.md");
    console.log(`  → 接受后收件箱 ${(await history.inbox("作者")).length} 组`);

    await history.performWrite(AGENT_S1, "manuscript/ch1.md", "第一章(AI 大改,面目全非)\n");
    console.log(`  AI 又改了一版,磁盘 = ${await readDisk("manuscript/ch1.md")}`);
    const reverted = await history.revert("作者", "manuscript/ch1.md");
    console.log(`  用户不满意,一键还原到已接受基线: ${describeEntry(reverted)}`);
    console.log(`  磁盘回到 = ${await readDisk("manuscript/ch1.md")}`);

    say("3. 多会话互知:AI 会话得知用户还原了它的修改");
    const unseen = await history.unseenChanges("写作会话-1");
    for (const group of unseen) {
        console.log(`  [${group.path}] 未见 ${group.entries.length} 条(不含本会话自己的写入):`);
        for (const entry of group.entries) {
            console.log(`    ${describeEntry(entry)}`);
        }
    }
    const maxSeen = Math.max(...unseen.map((g) => g.maxEntryId));
    await history.advanceCursor("写作会话-1", maxSeen);
    console.log(`  → 提醒注入成功后推进游标,再查未见 = ${(await history.unseenChanges("写作会话-1")).length} 组`);

    say("4. 误删找回");
    const deleted = await history.performDelete(USER, "manuscript/ch1.md");
    console.log(`  用户误删了 ch1,磁盘 = ${await readDisk("manuscript/ch1.md")}`);
    const list = await history.deletedFiles();
    console.log(`  已删除文件列表: ${list.map((d) => `${d.path}(可恢复=${d.recoverable})`).join(", ")}`);
    await history.restore(USER, "manuscript/ch1.md", deleted.id);
    console.log(`  从删除条目恢复,磁盘 = ${await readDisk("manuscript/ch1.md")}`);

    await history.close();
    console.log(`\n完成。历史库在 ${nodePath.join(base, "history.sqlite")},可用任意 SQLite 工具查看。`);
}

await main();
// libsql native 在 bun/Windows 上句柄释放有惯性,一次性脚本显式退出
process.exit(0);
