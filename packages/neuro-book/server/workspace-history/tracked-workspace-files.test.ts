import {randomUUID} from "node:crypto";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import { testHostPath } from "@notnotype/neuro-book-test-support/test-path"
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {
    closeAllProjects,
    requireReadyModuleHandle,
    requireReadyProject,
    resetProjectSessionsForTest,
} from "nbook/server/workspace-files/project-session";
import {openProjectForTest} from "nbook/server/workspace-files/project-session-test-utils";
import {writeProjectManifest as writeProjectManifestAtRoot} from "nbook/server/workspace-files/project-workspace";
import {resolveRuntimeWorkspaceRoot, setWorkspaceRuntimeRootContextForTest} from "nbook/server/workspace-files/workspace-runtime-root";
import {
    projectWorkspaceRef,
    resolveProjectWorkspaceRoot,
    type WorkspaceRelativePath,
} from "nbook/server/workspace-files/project-identity";
import {collectReleasedSqliteHandles} from "nbook/server/workspace-files/sqlite-handle-release";
import type {WorkspaceFileTarget} from "nbook/server/workspace-files/workspace-file-target";
import {
    PROJECT_FILE_INDEX_MODULE_TOKEN,
    type ProjectFileIndexHandle,
} from "nbook/server/workspace-files/project-file-index";
import {
    PROJECT_HISTORY_MODULE_TOKEN,
    resetWorkspaceHistoryForTest,
    setHistoryEnabledOverrideForTest,
    type ProjectHistoryHandle,
} from "nbook/server/workspace-history/project-history";
import {
    USER_LOCAL_ACTOR,
    convertWorkspaceFileToDirectoryTracked,
    createWorkspaceDirectoryTracked,
    createWorkspaceFileTracked,
    deleteWorkspacePathTracked,
    recordUploadedFiles,
    renameWorkspacePathTracked,
    writeWorkspaceTextFileTracked,
} from "nbook/server/workspace-history/tracked-workspace-files";

/** 测试Adapter：复用当前隔离Runtime Workspace Root，不恢复生产旧resolver。 */
function resolveProjectAbsolutePath(projectRoot: string) {
    return resolveProjectWorkspaceRoot(resolveRuntimeWorkspaceRoot(), projectWorkspaceRef(projectRoot));
}

async function writeProjectManifest(projectRoot: string, manifest: Parameters<typeof writeProjectManifestAtRoot>[2]) {
    return writeProjectManifestAtRoot(resolveRuntimeWorkspaceRoot(), projectWorkspaceRef(projectRoot), manifest);
}

type OpenProjectFixture = {
    projectRoot: WorkspaceRelativePath;
    target: Extract<WorkspaceFileTarget, {kind: "project-workspace"}>;
    history: ProjectHistoryHandle;
    fileIndex: ProjectFileIndexHandle;
};

describe("tracked-workspace-files 写面记账", () => {
    let tempRoot: string;

    beforeEach(async () => {
        resetProjectSessionsForTest();
        setHistoryEnabledOverrideForTest(true);
        tempRoot = testHostPath(`neuro-book-tracked-files-test-${randomUUID()}`);
        await mkdir(join(tempRoot, "workspace"), {recursive: true});
        setWorkspaceRuntimeRootContextForTest({workspaceRoot: join(tempRoot, "workspace")});
        // 测试只将 Runtime Workspace Root 指到临时根，Project identity 保持单段 root。
        vi.spyOn(process, "cwd").mockReturnValue(tempRoot);
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await closeAllProjects().catch(() => undefined);
        await resetWorkspaceHistoryForTest();
        resetProjectSessionsForTest();
        setWorkspaceRuntimeRootContextForTest(null);
        setHistoryEnabledOverrideForTest(null);
        collectReleasedSqliteHandles({force: true});
        await rm(tempRoot, {recursive: true, force: true}).catch(() => undefined);
    }, 60_000);

    /** 建立ready Project generation并取得写面所需的精确target与History handle。 */
    async function openTempProject(slug: string): Promise<OpenProjectFixture> {
        const projectRoot = projectWorkspaceRef(slug).projectRoot;
        await writeProjectManifest(projectRoot, {kind: "novel", title: slug, summary: ""});
        await openProjectForTest(projectRoot);
        const ready = requireReadyProject(projectWorkspaceRef(projectRoot));
        const history = requireReadyModuleHandle(ready, PROJECT_HISTORY_MODULE_TOKEN);
        const fileIndex = requireReadyModuleHandle(ready, PROJECT_FILE_INDEX_MODULE_TOKEN);
        return {
            projectRoot,
            target: {
                kind: "project-workspace",
                root: resolveProjectAbsolutePath(projectRoot),
                projectRoot,
            },
            history,
            fileIndex,
        };
    }

    it("写文件：首写补 before 建 create 账，二写复用 knownBefore 记 edit", async () => {
        const project = await openTempProject("write");
        await writeWorkspaceTextFileTracked({
            target: project.target, history: project.history, filePath: "manuscript/ch1.md",
            content: "正文 v1", actor: USER_LOCAL_ACTOR,
        });
        // 冲突检测路径：调用方已读到旧内容，作为 knownBefore 传入（不再读盘）
        await writeWorkspaceTextFileTracked({
            target: project.target, history: project.history, filePath: "manuscript/ch1.md",
            content: "正文 v2", actor: USER_LOCAL_ACTOR, knownBefore: "正文 v1",
        });

        const history = (await project.history.history)!;
        const timeline = await history.timeline("manuscript/ch1.md");
        expect(timeline.map((item) => item.entry.operation.type)).toEqual(["file.create", "file.edit"]);
        expect(timeline[1]!.entry.actor).toEqual(USER_LOCAL_ACTOR);
        expect(timeline[1]!.bodyAvailable).toEqual({before: true, after: true});
    });

    it("convert 文件转目录 = 一条 rename：时间线跨转换连续", async () => {
        const project = await openTempProject("convert");
        await createWorkspaceFileTracked({target: project.target, history: project.history, filePath: "lorebook/hero.md", content: "英雄设定", actor: USER_LOCAL_ACTOR});
        await convertWorkspaceFileToDirectoryTracked({target: project.target, history: project.history, filePath: "lorebook/hero.md", actor: USER_LOCAL_ACTOR});

        const history = (await project.history.history)!;
        const timeline = await history.timeline("lorebook/hero/index.md", {followRenames: true});
        expect(timeline.map((item) => item.entry.operation.type)).toEqual(["file.create", "file.rename"]);
        expect(timeline[0]!.pathAtThatTime).toBe("lorebook/hero.md");
        // 旧路径不算删除（活在新名下）
        expect(await history.deletedFiles()).toEqual([]);
    });

    it("目录 rename 展开为目录内逐文件 rename", async () => {
        const project = await openTempProject("rename-dir");
        await createWorkspaceFileTracked({target: project.target, history: project.history, filePath: "lorebook/npc/a.md", content: "甲", actor: USER_LOCAL_ACTOR});
        await createWorkspaceFileTracked({target: project.target, history: project.history, filePath: "lorebook/npc/b.md", content: "乙", actor: USER_LOCAL_ACTOR});
        await project.fileIndex.mutate(() => renameWorkspacePathTracked({
            target: project.target,
            history: project.history,
            fromPath: "lorebook/npc",
            toPath: "lorebook/cast",
            actor: USER_LOCAL_ACTOR,
        }));

        const history = (await project.history.history)!;
        for (const name of ["a.md", "b.md"]) {
            const timeline = await history.timeline(`lorebook/cast/${name}`, {followRenames: true});
            expect(timeline.map((item) => item.entry.operation.type)).toEqual(["file.create", "file.rename"]);
        }
    });

    it("目录删除展开为逐文件 delete：before 快照可找回", async () => {
        const project = await openTempProject("delete-dir");
        await createWorkspaceFileTracked({target: project.target, history: project.history, filePath: "lorebook/npc/a.md", content: "正文A", actor: USER_LOCAL_ACTOR});
        await createWorkspaceFileTracked({target: project.target, history: project.history, filePath: "lorebook/npc/b.md", content: "正文B", actor: USER_LOCAL_ACTOR});
        await deleteWorkspacePathTracked({target: project.target, history: project.history, filePath: "lorebook/npc", recursive: true, actor: USER_LOCAL_ACTOR});

        const history = (await project.history.history)!;
        expect((await history.deletedFiles()).map((f) => f.path).sort()).toEqual(["lorebook/npc/a.md", "lorebook/npc/b.md"]);

        const timeline = await history.timeline("lorebook/npc/a.md");
        const last = timeline[timeline.length - 1]!;
        expect(last.entry.operation.type).toBe("file.delete");
        if (last.entry.operation.type !== "file.delete") {
            throw new Error("unreachable");
        }
        const body = await history.snapshotBody(last.entry.operation.beforeHash);
        expect(new TextDecoder().decode(body!)).toBe("正文A");
    });

    it("createDirectory 附带 index 内容记账（目录本身不是账面对象）", async () => {
        const project = await openTempProject("mkdir");
        await createWorkspaceDirectoryTracked({target: project.target, history: project.history, dirPath: "lorebook/组织", indexContent: "# 组织", actor: USER_LOCAL_ACTOR});

        const history = (await project.history.history)!;
        const timeline = await history.timeline("lorebook/组织/index.md");
        expect(timeline.map((item) => item.entry.operation.type)).toEqual(["file.create"]);
    });

    it("upload 记账：仅 written 入账，二进制自动降级 hash-only", async () => {
        const project = await openTempProject("upload");
        const absoluteRoot = project.target.root;
        await mkdir(join(absoluteRoot, "upload"), {recursive: true});
        await writeFile(join(absoluteRoot, "upload", "a.md"), "文本内容", "utf-8");
        await writeFile(join(absoluteRoot, "upload", "b.png"), Buffer.from([0x89, 0x50, 0x00, 0x47]));

        await recordUploadedFiles({
            target: project.target,
            history: project.history,
            files: [
                {path: "upload/a.md", size: 12, action: "written"},
                {path: "upload/b.png", size: 4, action: "written"},
                {path: "upload/skip.md", size: 2, action: "skipped"},
            ],
            actor: USER_LOCAL_ACTOR,
        });

        const history = (await project.history.history)!;
        const textTimeline = await history.timeline("upload/a.md");
        expect(textTimeline).toHaveLength(1);
        expect(textTimeline[0]!.bodyAvailable.after).toBe(true);
        // 含 NUL 字节 → 模块只记 hash 行，不存 body
        const binaryTimeline = await history.timeline("upload/b.png");
        expect(binaryTimeline).toHaveLength(1);
        expect(binaryTimeline[0]!.bodyAvailable.after).toBe(false);
        expect(await history.timeline("upload/skip.md")).toHaveLength(0);
    });
});
