import fs from "node:fs/promises";
import {WorkspaceHistory} from "../src";

/**
 * T12 跨进程探针:打开指定库 → 写一条 → 关闭 → 显式退出。
 * 两个先后进程各跑一遍不得出现 SQLITE_BUSY。
 *
 * 用法: bun scripts/handle-probe.ts <databasePath> <root> <marker>
 */
async function main(): Promise<number> {
    const [databasePath, root, marker] = process.argv.slice(2);
    if (databasePath === undefined || root === undefined || marker === undefined) {
        console.error("用法: bun scripts/handle-probe.ts <databasePath> <root> <marker>");
        return 1;
    }
    await fs.mkdir(root, {recursive: true});
    const history = await WorkspaceHistory.open({databasePath, resolvePath: (path) => `${root}/${path}`});
    try {
        await history.performWrite({kind: "system", source: "handle-probe"}, "probe.md", `probe-${marker}`);
        const timeline = await history.timeline("probe.md");
        console.log(`OK entries=${timeline.length}`);
        return 0;
    } finally {
        await history.close();
    }
}

// libsql native 在 bun/Windows 上 close() 后可能仍挂事件循环句柄,一次性进程必须显式退出。
process.exit(await main());
