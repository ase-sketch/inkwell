import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {mkdir, rm, symlink} from "node:fs/promises";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";

import {
    formatStateRootIntegrityWarning,
    inspectInstallationStateIntegrity,
    stateRootIntegrityFailed,
} from "#manager/state-integrity";

const roots: string[] = [];

describe("State Root完整性", () => {
    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
    });

    it("区分相同State Root与无影子目录", async () => {
        const root = await fixture("same");
        const sameRoot = await inspectInstallationStateIntegrity(root, root);
        const clean = await inspectInstallationStateIntegrity(root, join(root, "data"));

        expect(sameRoot.kind).toBe("same-state-root");
        expect(clean.kind).toBe("clean");
        expect(stateRootIntegrityFailed(sameRoot)).toBe(false);
        expect(stateRootIntegrityFailed(clean)).toBe(false);
    });

    it("根workspace与真实Workspace Root分叉时报告", async () => {
        const root = await fixture("shadow");
        const stateRoot = join(root, "data");
        await mkdir(join(root, "workspace"), {recursive: true});
        await mkdir(join(stateRoot, "workspace"), {recursive: true});

        const result = await inspectInstallationStateIntegrity(root, stateRoot);

        expect(result).toMatchObject({
            kind: "shadow-workspace",
            checkedWorkspaceRoot: join(root, "workspace"),
            expectedWorkspaceRoot: join(stateRoot, "workspace"),
        });
        expect(stateRootIntegrityFailed(result)).toBe(true);
        if (!stateRootIntegrityFailed(result)) {
            throw new Error("测试fixture应产生State Root完整性失败");
        }
        expect(formatStateRootIntegrityWarning(result)).toContain("不会自动复制、合并、删除或重命名用户数据");
    });

    it("同目标junction或symlink不误报", async () => {
        const root = await fixture("link");
        const stateRoot = join(root, "data");
        const expectedPath = join(stateRoot, "workspace");
        await mkdir(expectedPath, {recursive: true});
        await symlink(expectedPath, join(root, "workspace"), process.platform === "win32" ? "junction" : "dir");

        const result = await inspectInstallationStateIntegrity(root, stateRoot);

        expect(result.kind).toBe("same-target-link");
        expect(stateRootIntegrityFailed(result)).toBe(false);
    });

    it("失效链接返回可诊断的检查错误", async () => {
        const root = await fixture("dangling-link");
        const stateRoot = join(root, "data");
        await mkdir(join(stateRoot, "workspace"), {recursive: true});
        await symlink(join(root, "missing-workspace"), join(root, "workspace"), process.platform === "win32" ? "junction" : "dir");

        const result = await inspectInstallationStateIntegrity(root, stateRoot);

        expect(result).toMatchObject({
            kind: "inspection-error",
            operation: "realpath-checked",
            errorCode: "ENOENT",
        });
        expect(stateRootIntegrityFailed(result)).toBe(true);
        if (!stateRootIntegrityFailed(result)) {
            throw new Error("测试fixture应产生State Root检查错误");
        }
        expect(formatStateRootIntegrityWarning(result)).toContain("检查链接目标和目录权限");
    });
});

async function fixture(name: string): Promise<string> {
    const root = testHostPath(`manager-state-${name}-${crypto.randomUUID()}`);
    roots.push(root);
    await mkdir(root, {recursive: true});
    return root;
}
