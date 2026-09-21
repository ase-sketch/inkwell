import {mkdtemp, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {setup, teardown} from "@notnotype/neuro-book-test-support/vitest";
import {TEST_HOST_PATHS_DIR, testHostPath} from "@notnotype/neuro-book-test-support/test-path";

const cleanupRoots: string[] = [];
const SAVED_ENV: Record<string, string | undefined> = {};
const MANAGED_KEYS = ["NBOOK_AGENT_TEMP_ROOT", "NBOOK_TEST_RUN_ID", "NBOOK_TEST_TMPDIR"] as const;

function saveEnv(): void {
    for (const key of MANAGED_KEYS) SAVED_ENV[key] = process.env[key];
}

function restoreEnv(): void {
    for (const key of MANAGED_KEYS) {
        if (SAVED_ENV[key] === undefined) delete process.env[key];
        else process.env[key] = SAVED_ENV[key];
    }
}

afterEach(async () => {
    restoreEnv();
    await Promise.all(cleanupRoots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("vitest global setup 的宿主路径准备", () => {
    it("fresh Agent Temp 下 setup 创建 testHostPath 父目录，mkdtemp 可直接工作", async () => {
        const host = await mkdtemp(join(tmpdir(), "nbook-tss-setup-"));
        cleanupRoots.push(host);
        const agentRoot = join(host, "agent");
        saveEnv();
        process.env.NBOOK_AGENT_TEMP_ROOT = agentRoot;
        delete process.env.NBOOK_TEST_RUN_ID;
        delete process.env.NBOOK_TEST_TMPDIR;
        try {
            await setup();
            const info = await stat(resolve(agentRoot, TEST_HOST_PATHS_DIR));
            expect(info.isDirectory()).toBe(true);
            const created = await mkdtemp(testHostPath("fresh-host-"));
            expect(created).toBe(resolve(agentRoot, TEST_HOST_PATHS_DIR, `fresh-host-${created.split("-").at(-1)}`));
            await rm(created, {recursive: true, force: true});
            await teardown();
        } finally {
            restoreEnv();
        }
    });
});
