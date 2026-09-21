import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {randomUUID} from "node:crypto";
import {createHash} from "node:crypto";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {
    acquireAgentSessionStoreExclusiveLease,
    agentSessionStoreSentinelPath,
    type AgentSessionStoreSentinel,
} from "nbook/server/agent/session/agent-session-store";
import {
    requireReadyAgentSessionStore,
    startAgentSessionStoreRuntime,
    stopAgentSessionStoreRuntime,
} from "nbook/server/agent/session/agent-session-store-runtime";

describe("Agent Session Store runtime owner", () => {
    const roots: string[] = [];

    afterEach(async () => {
        await stopAgentSessionStoreRuntime();
        await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
    });

    it("未启动时拒绝提供ready capability", async () => {
        const root = await readyRoot();

        expect(() => requireReadyAgentSessionStore(root)).toThrow("尚未完成启动");
    });

    it("同root并发启动共享owner并持有lease到显式stop", async () => {
        const root = await readyRoot();
        const [first, second] = await Promise.all([
            startAgentSessionStoreRuntime(root),
            startAgentSessionStoreRuntime(root),
        ]);

        expect(first).toBe(second);
        expect(requireReadyAgentSessionStore(root)).toBe(first);
        await expect(acquireAgentSessionStoreExclusiveLease(root)).rejects.toMatchObject({code: "ELOCKED"});

        await stopAgentSessionStoreRuntime(root);
        const releaseMigration = await acquireAgentSessionStoreExclusiveLease(root);
        await releaseMigration();
    });

    it("不同Workspace Root各自独立持有capability与lease", async () => {
        const first = await readyRoot();
        const second = await readyRoot();

        const firstReady = await startAgentSessionStoreRuntime(first);
        const secondReady = await startAgentSessionStoreRuntime(second);

        expect(firstReady).not.toBe(secondReady);
        expect(requireReadyAgentSessionStore(first)).toBe(firstReady);
        expect(requireReadyAgentSessionStore(second)).toBe(secondReady);

        // 单独关闭一个root不影响另一个root的capability与物理锁。
        await stopAgentSessionStoreRuntime(first);
        expect(() => requireReadyAgentSessionStore(first)).toThrow("尚未完成启动");
        expect(requireReadyAgentSessionStore(second)).toBe(secondReady);
        const releaseFirst = await acquireAgentSessionStoreExclusiveLease(first);
        await releaseFirst();
        await expect(acquireAgentSessionStoreExclusiveLease(second)).rejects.toMatchObject({code: "ELOCKED"});
    });

    it("start-stop-start严格按调用顺序重新取得lease，不发布已释放handle", async () => {
        const root = await readyRoot();
        const firstStart = startAgentSessionStoreRuntime(root);
        const stopping = stopAgentSessionStoreRuntime(root);
        const secondStart = startAgentSessionStoreRuntime(root);

        await Promise.all([firstStart, stopping, secondStart]);
        expect(requireReadyAgentSessionStore(root)).toBe(await secondStart);
        await expect(acquireAgentSessionStoreExclusiveLease(root)).rejects.toMatchObject({code: "ELOCKED"});
    });

    it("并发stop共享线性化关闭边界", async () => {
        const root = await readyRoot();
        await startAgentSessionStoreRuntime(root);

        await Promise.all([stopAgentSessionStoreRuntime(root), stopAgentSessionStoreRuntime(root)]);
        expect(() => requireReadyAgentSessionStore(root)).toThrow("尚未完成启动");
        const releaseMigration = await acquireAgentSessionStoreExclusiveLease(root);
        await releaseMigration();
    });

    it("无参stop关闭本进程全部owner", async () => {
        const first = await readyRoot();
        const second = await readyRoot();
        await startAgentSessionStoreRuntime(first);
        await startAgentSessionStoreRuntime(second);

        await stopAgentSessionStoreRuntime();

        expect(() => requireReadyAgentSessionStore(first)).toThrow("尚未完成启动");
        expect(() => requireReadyAgentSessionStore(second)).toThrow("尚未完成启动");
        for (const root of [first, second]) {
            const release = await acquireAgentSessionStoreExclusiveLease(root);
            await release();
        }
    });

    /** 创建带schema v2 complete sentinel的隔离Workspace Root。 */
    async function readyRoot(): Promise<string> {
        const root = testHostPath("agent-session-store-runtime-test", randomUUID());
        roots.push(root);
        const path = agentSessionStoreSentinelPath(root);
        await mkdir(dirname(path), {recursive: true});
        const sentinel: AgentSessionStoreSentinel = {
            sentinelVersion: 1,
            state: "complete",
            sourceSchemaVersion: 1,
            targetSchemaVersion: 2,
            runId: "runtime-test",
            manifestPath: ".nbook/agent/migrations/session-v2/runtime-test/manifest.json",
            manifestHash: "b".repeat(64),
            checkpointCursor: 1,
        };
        const manifestPath = resolve(root, ...sentinel.manifestPath.split("/"));
        const manifestText = `${JSON.stringify({
            runId: sentinel.runId,
            appliedSeq: sentinel.checkpointCursor,
            status: "report_written",
        })}\n`;
        await mkdir(dirname(manifestPath), {recursive: true});
        await writeFile(manifestPath, manifestText, "utf8");
        sentinel.manifestHash = createHash("sha256").update(manifestText).digest("hex");
        await writeFile(path, JSON.stringify(sentinel), "utf8");
        return root;
    }
});
