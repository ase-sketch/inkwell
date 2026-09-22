import {mkdtemp, mkdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, describe, expect, it} from "vitest";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {authorizeFileOperation} from "nbook/server/workspace-files/authorized-file-operation";
import {projectWorkspaceRef} from "nbook/server/workspace-files/project-identity";
import {closeAllProjects, openProject} from "nbook/server/workspace-files/project-session";
import type {ReadyProjectSessionRef} from "nbook/server/workspace-files/project-session-types";

/** 持有写入域白名单的交互型 profile。 */
const INTERACTIVE_PROFILES = ["leader.default", "interview.new-book", "interview.stuck"] as const;
/** 非交互型 profile：必须完全不受写入域影响。 */
const NON_INTERACTIVE_PROFILE = "leader.assets";
const WRITE_OPERATIONS = ["write", "edit", "apply_patch"] as const;

describe("交互型 profile 写入域白名单", () => {
    const roots: string[] = [];

    afterEach(async () => {
        await closeAllProjects().catch(() => undefined);
        for (const root of roots.splice(0)) {
            await rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
        }
    });

    it("放行 lorebook/、outline/、references/、agents/、.agent/plan/ 下的全部写操作", async () => {
        const {workspaceRoot, ready} = await openNovelProject();
        const allowed = [
            "lorebook/character/protagonist/index.md",
            "outline/act-1.md",
            "references/world-rules.md",
            "agents/leader.default/persona.md",
            // Plan Mode 计划文件：红线只禁正文，计划文件必须照常可写。
            ".agent/plan/feature.md",
        ];

        for (const profileKey of INTERACTIVE_PROFILES) {
            for (const relativePath of allowed) {
                for (const operation of WRITE_OPERATIONS) {
                    await expect(authorizeFileOperation(context(workspaceRoot, ready, profileKey), relativePath, operation))
                        .resolves.toMatchObject({
                            operation,
                            target: {relativePath},
                        });
                }
            }
        }
    });

    it("项目根目录下一层的 *.md 放行，嵌套 md 与根目录其他文件被拒", async () => {
        const {workspaceRoot, ready} = await openNovelProject();
        const operationContext = context(workspaceRoot, ready, "leader.default");

        await expect(authorizeFileOperation(operationContext, "PROJECT-STATUS.md", "write"))
            .resolves.toMatchObject({target: {relativePath: "PROJECT-STATUS.md"}});

        // 根目录一层以外的 Markdown 不在白名单内。
        await expect(authorizeFileOperation(operationContext, "notes/idea.md", "write"))
            .rejects.toThrow(/notes\//u);
        await expect(authorizeFileOperation(operationContext, "PROJECT-STATUS.md.bak", "write"))
            .rejects.toThrow(/PROJECT-STATUS\.md\.bak/u);
    });

    it("manuscript/ 正文目录被拒，错误信息指明被拒前缀与允许范围", async () => {
        const {workspaceRoot, ready} = await openNovelProject();

        for (const profileKey of INTERACTIVE_PROFILES) {
            const operationContext = context(workspaceRoot, ready, profileKey);
            for (const relativePath of ["manuscript/chapter.md", "manuscript/003-forge/index.md"]) {
                for (const operation of WRITE_OPERATIONS) {
                    const rejection = authorizeFileOperation(operationContext, relativePath, operation);
                    await expect(rejection).rejects.toThrow(/manuscript\//u);
                    await expect(rejection).rejects.toThrow(new RegExp(profileKey.replace(".", "\\."), "u"));
                    await expect(rejection).rejects.toThrow(/lorebook\//u);
                }
            }
        }
    });

    it(".. 逃逸变体：项目内归一化后仍按目标路径判定，越界形态维持既有 containment 拦截", async () => {
        const {workspaceRoot, ready} = await openNovelProject();
        const operationContext = context(workspaceRoot, ready, "leader.default");

        // 归一化后落在 manuscript/：不是"名字像白名单"就能过。
        await expect(authorizeFileOperation(operationContext, "lorebook/../../manuscript/chapter.md", "write"))
            .rejects.toThrow(/manuscript\//u);
        // 归一化后仍落在白名单内：放行。
        await expect(authorizeFileOperation(operationContext, "lorebook/../outline/act-1.md", "write"))
            .resolves.toMatchObject({target: {relativePath: "outline/act-1.md"}});
        // 越过文件系统根：既有 containment 语义不变。
        await expect(authorizeFileOperation(operationContext, "../outside/manuscript.md", "write"))
            .rejects.toThrow("路径越过文件系统根");
    });

    it("Windows 反斜杠形态按同一归一化规则判定", async () => {
        const {workspaceRoot, ready} = await openNovelProject();
        const operationContext = context(workspaceRoot, ready, "leader.default");

        await expect(authorizeFileOperation(operationContext, "manuscript\\chapter.md", "write"))
            .rejects.toThrow(/manuscript\//u);
        await expect(authorizeFileOperation(operationContext, "lorebook\\note\\a.md", "write"))
            .resolves.toMatchObject({target: {relativePath: "lorebook/note/a.md"}});
    });

    it("项目内绝对路径归一化后照常判定，项目外绝对路径维持既有语义不加新拒绝", async () => {
        const {root, workspaceRoot, ready} = await openNovelProject();
        const operationContext = context(workspaceRoot, ready, "leader.default");

        await expect(authorizeFileOperation(operationContext, join(ready.workspace.root, "manuscript", "chapter.md"), "write"))
            .rejects.toThrow(/manuscript\//u);
        await expect(authorizeFileOperation(operationContext, join(ready.workspace.root, "lorebook", "index.md"), "write"))
            .resolves.toMatchObject({target: {kind: "absolute", relativePath: "lorebook/index.md"}});

        const outsidePath = join(root, "outside-drive", "manuscript.md");
        await expect(authorizeFileOperation(operationContext, outsidePath, "write"))
            .resolves.toMatchObject({target: {kind: "absolute", project: null}, containmentRoot: null});
    });

    it("Workspace Root .nbook control 路径属于项目之外，不新增拒绝", async () => {
        const {workspaceRoot, ready} = await openNovelProject();
        await mkdir(join(workspaceRoot, ".nbook"), {recursive: true});

        // 写入域只约束 Project 相对路径；control 面维持既有 containment 语义，不叠加第二层门禁。
        await expect(authorizeFileOperation(context(workspaceRoot, ready, "leader.default"), "workspace/.nbook/config.json", "write"))
            .resolves.toMatchObject({target: {kind: "workspace-control", relativePath: "config.json"}});
    });

    it("Plan Mode 计划文件照常可写，而 .agent 下非 plan 路径仍被拒", async () => {
        const {workspaceRoot, ready} = await openNovelProject();

        for (const profileKey of INTERACTIVE_PROFILES) {
            const operationContext = context(workspaceRoot, ready, profileKey);
            // Plan Mode 契约：harness 为该目录开写审批豁免（planDirectoryWriteExempt）。
            await expect(authorizeFileOperation(operationContext, ".agent/plan/draft.md", "write"))
                .resolves.toMatchObject({target: {relativePath: ".agent/plan/draft.md"}});
            await expect(authorizeFileOperation(operationContext, ".agent/scratch/notes.md", "write"))
                .rejects.toThrow(/\.agent\//u);
        }
    });

    it("读操作不受写入域限制", async () => {
        const {workspaceRoot, ready} = await openNovelProject();

        for (const profileKey of INTERACTIVE_PROFILES) {
            await expect(authorizeFileOperation(context(workspaceRoot, ready, profileKey), "manuscript/chapter.md", "read"))
                .resolves.toMatchObject({operation: "read", target: {relativePath: "manuscript/chapter.md"}});
        }
    });

    it("无 profile 上下文的调用方与非交互 profile 行为不变", async () => {
        const {workspaceRoot, ready} = await openNovelProject();

        const callers = [
            {workspaceRoot, currentProject: ready},
            context(workspaceRoot, ready, NON_INTERACTIVE_PROFILE),
        ];
        for (const caller of callers) {
            for (const operation of [...WRITE_OPERATIONS, "read"] as const) {
                await expect(authorizeFileOperation(caller, "manuscript/chapter.md", operation))
                    .resolves.toMatchObject({
                        operation,
                        target: {relativePath: "manuscript/chapter.md"},
                    });
            }
        }
    });

    function context(workspaceRoot: ReturnType<typeof absoluteFsPath>, project: ReadyProjectSessionRef, profileKey: string) {
        return {workspaceRoot, currentProject: project, profileKey};
    }

    async function openNovelProject(): Promise<{
        root: string;
        workspaceRoot: ReturnType<typeof absoluteFsPath>;
        ready: ReadyProjectSessionRef;
    }> {
        const root = await mkdtemp(testHostPath("nbook-interactive-profile-write-scope-"));
        roots.push(root);
        const workspaceRoot = absoluteFsPath(join(root, "workspace"));
        const projectRoot = join(workspaceRoot, "novel");
        await mkdir(projectRoot, {recursive: true});
        await writeFile(join(projectRoot, "project.yaml"), "kind: novel\ntitle: novel\nsummary: ''\n", "utf8");
        const ready = await openProject(
            projectWorkspaceRef("novel"),
            {kind: "job", source: "interactive-profile-write-scope-test"},
            workspaceRoot,
        );
        return {root, workspaceRoot, ready};
    }
});
