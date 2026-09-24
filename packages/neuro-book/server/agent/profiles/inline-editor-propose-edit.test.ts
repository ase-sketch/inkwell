import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {INLINE_PROPOSAL_PENDING_MARKER, INLINE_PROPOSE_EDIT_TOOL} from "nbook/shared/inline-proposal";
import inlineEditorProfileDefinition, {
    proposeEditTool,
} from "../../../assets/workspace/.nbook/agent/profiles/builtin/inline.editor.profile";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";
import type {ProfileToolExecutionContext} from "nbook/profile-sdk/contracts";

const normalizedProfile = normalizeAgentProfile(inlineEditorProfileDefinition);

describe("inline.editor profile 定义与 prompt 约束", () => {
    it("工具集合摘掉 write、edit、apply_patch、bash，保留 read、propose_edit、report_result", () => {
        expect(normalizedProfile.rootToolKeys).toContain("read");
        expect(normalizedProfile.rootToolKeys).toContain(INLINE_PROPOSE_EDIT_TOOL);
        expect(normalizedProfile.rootToolKeys).toContain("report_result");

        expect(normalizedProfile.rootToolKeys).not.toContain("write");
        expect(normalizedProfile.rootToolKeys).not.toContain("edit");
        expect(normalizedProfile.rootToolKeys).not.toContain("apply_patch");
        expect(normalizedProfile.rootToolKeys).not.toContain("bash");
    });

    it("prompt 明确告知 LLM 只能提案、作者确认才落盘、rationale 面向作者口语禁内部术语", async () => {
        const prepared = await normalizedProfile.prepare!({
            session: testSession({
                profileKey: "inline.editor",
                currentProjectRoot: "test-novel",
                customState: {},
                linkedAgents: [],
                archived: false,
                agentMode: "normal",
            }),
            initial: {},
            vars: createTestVariableAccessor(),
            catalog: {profiles: [], issues: []},
            skills: [],
            settings: {},
        });

        const systemPrompt = prepared.systemPrompt ?? "";
        expect(systemPrompt).toContain("propose_edit");
        expect(systemPrompt).toContain("提案确认制");
        expect(systemPrompt).toContain("没有直接修改或写入文件的权限");
        expect(systemPrompt).toContain("作者确认采纳后才会真正落盘");
        expect(systemPrompt).toContain("通俗自然的口语");
        expect(systemPrompt).toContain("严禁泄漏内部字段名");
    });
});

describe("propose_edit 工具级测试", () => {
    let tempRoot: string;
    let projectDir: string;
    let manuscriptFile: string;
    const initialText = [
        "# 第一章 破晓",
        "",
        "晨光微熹，少年推开了老旧的柴门。",
        "他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。",
        "晨光微熹，洒在庭院里斑驳的青石板上。",
    ].join("\n");

    beforeEach(async () => {
        tempRoot = await mkdtemp(testHostPath("inline-propose-edit-test-"));
        projectDir = join(tempRoot, "novel");
        const manuscriptDir = join(projectDir, "manuscript");
        await mkdir(manuscriptDir, {recursive: true});
        manuscriptFile = join(manuscriptDir, "chapter-01.md");
        await writeFile(manuscriptFile, initialText, "utf8");
    });

    afterEach(async () => {
        await rm(tempRoot, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
    });

    function mockToolContext(): ProfileToolExecutionContext {
        return {
            sessionId: 101,
            profileKey: "inline.editor",
            workspaceRoot: absoluteFsPath(tempRoot),
            currentProject: {
                workspace: {
                    root: projectDir,
                    ref: {projectRoot: "novel"},
                },
                generation: 1,
            } as any,
        };
    }

    it("锚点精确唯一匹配成功登记，返回 PENDING 标记与提案回显，且绝不写盘", async () => {
        const contentBefore = await readFile(manuscriptFile, "utf8");

        const proposalInput = {
            summary: "润色少年立志句，强化语气沉毅感",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。",
                    replacement: "他紧咬牙关暗自发誓，哪怕前途荆棘密布，也定要走出这条生路。",
                    rationale: "增强决绝感，让少年的心理活动更显果断沉凝。",
                },
            ],
        };

        const result = await proposeEditTool.executeWithContext!(
            mockToolContext(),
            "call-propose-1",
            proposalInput,
        );

        // 1. 返回内容包含 INLINE_PROPOSAL_PENDING_MARKER
        expect(result.content[0]?.type).toBe("text");
        const firstBlock = result.content[0];
        const resultText = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
        expect(resultText).toContain(INLINE_PROPOSAL_PENDING_MARKER);
        expect(resultText).toContain("润色少年立志句");
        expect(resultText).toContain(proposalInput.edits[0]!.rationale);

        // 2. details 包含完整结构化回显
        expect(result.details).toMatchObject({
            marker: INLINE_PROPOSAL_PENDING_MARKER,
            summary: proposalInput.summary,
            targetPath: proposalInput.targetPath,
            edits: proposalInput.edits,
        });

        // 3. 写盘断言：读取文件内容前后对比，断言磁盘文件完全未发生任何变动
        const contentAfter = await readFile(manuscriptFile, "utf8");
        expect(contentAfter).toBe(contentBefore);
        expect(contentAfter).toContain("他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。");
        expect(contentAfter).not.toContain("他紧咬牙关暗自发誓");
    });

    it("锚点不匹配时报错（match count === 0），指出具体条目并期望 LLM 修正重提，且不写盘", async () => {
        const contentBefore = await readFile(manuscriptFile, "utf8");

        const proposalInput = {
            summary: "尝试替换一段不存在的文本",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "这段文本在文稿里绝对不存在，是一段臆造的原文片段",
                    replacement: "新的文本",
                    rationale: "替换测试",
                },
            ],
        };

        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-propose-fail-1", proposalInput),
        ).rejects.toThrow(/第 1 条修改提案的 original 未在文件 .* 中匹配到任何内容/);

        // 写盘断言：发生报错时文件内容绝对不变
        const contentAfter = await readFile(manuscriptFile, "utf8");
        expect(contentAfter).toBe(contentBefore);
    });

    it("锚点多处匹配时报错（match count > 1），指出具体条目与出现次数，提示扩充上下文，且不写盘", async () => {
        const contentBefore = await readFile(manuscriptFile, "utf8");

        const proposalInput = {
            summary: "替换重复出现的短句",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "晨光微熹，",
                    replacement: "晨光微亮，",
                    rationale: "微调修饰",
                },
            ],
        };

        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-propose-fail-2", proposalInput),
        ).rejects.toThrow(/第 1 条修改提案的 original 在文件 .* 中匹配到 2 处。锚点必须唯一/);

        // 写盘断言：报错后文件内容未发生变动
        const contentAfter = await readFile(manuscriptFile, "utf8");
        expect(contentAfter).toBe(contentBefore);
    });

    it("多条提案条目时，若后续条目不匹配，整体报错指出对应条目且完全不写盘", async () => {
        const contentBefore = await readFile(manuscriptFile, "utf8");

        const proposalInput = {
            summary: "混合提案测试",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。",
                    replacement: "条目1建议替换",
                    rationale: "第1条理由",
                },
                {
                    original: "文稿中不存在的第二条锚点片段",
                    replacement: "条目2建议替换",
                    rationale: "第2条理由",
                },
            ],
        };

        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-propose-fail-3", proposalInput),
        ).rejects.toThrow(/第 2 条修改提案的 original 未在文件 .* 中匹配到任何内容/);

        const contentAfter = await readFile(manuscriptFile, "utf8");
        expect(contentAfter).toBe(contentBefore);
    });

    it("目标文件不存在时报错", async () => {
        const proposalInput = {
            summary: "不存在的文件",
            targetPath: "manuscript/non-existent.md",
            edits: [
                {
                    original: "任意文本",
                    replacement: "任意替换",
                    rationale: "理由",
                },
            ],
        };

        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-missing-file", proposalInput),
        ).rejects.toThrow(/不存在或无法读取/);
    });

    it("edits 数组为空或缺少 original 时报错", async () => {
        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-empty-edits", {
                summary: "空条目",
                targetPath: "manuscript/chapter-01.md",
                edits: [],
            }),
        ).rejects.toThrow(/edits 不能为空/);

        await expect(
            proposeEditTool.executeWithContext!(mockToolContext(), "call-empty-original", {
                summary: "空锚点",
                targetPath: "manuscript/chapter-01.md",
                edits: [{original: "", replacement: "新文本", rationale: "理由"}],
            }),
        ).rejects.toThrow(/original 不能为空/);
    });

    it("execute 在无 context 时可按绝对路径正常执行并校验", async () => {
        const contentBefore = await readFile(manuscriptFile, "utf8");

        const result = await proposeEditTool.execute!(
            "call-direct-execute",
            {
                summary: "直接执行测试",
                targetPath: manuscriptFile,
                edits: [
                    {
                        original: "他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。",
                        replacement: "直接执行改后文本",
                        rationale: "直接执行修改理由",
                    },
                ],
            },
        );

        expect(result.content[0]?.type).toBe("text");
        const firstBlock = result.content[0];
        const resultText = firstBlock && firstBlock.type === "text" ? firstBlock.text : "";
        expect(resultText).toContain(INLINE_PROPOSAL_PENDING_MARKER);

        // 写盘断言
        const contentAfter = await readFile(manuscriptFile, "utf8");
        expect(contentAfter).toBe(contentBefore);
    });

    it("Harness 调度契约：成功时 isError 为 false，校验失败时 isError 为 true 并向 LLM 回传错误信息", async () => {
        // 模拟 harness 执行工具的 try/catch 机制
        async function runViaHarness(args: unknown) {
            try {
                const result = await proposeEditTool.executeWithContext!(
                    mockToolContext(),
                    "call-harness-contract",
                    args,
                );
                return {result, isError: false};
            } catch (error) {
                return {
                    result: {
                        content: [{type: "text" as const, text: error instanceof Error ? error.message : String(error)}],
                    },
                    isError: true,
                };
            }
        }

        // 1. 成功调度
        const success = await runViaHarness({
            summary: "成功调度",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "他暗暗下定决心，无论前路多么凶险，也绝不退缩半步。",
                    replacement: "改后文本",
                    rationale: "理由",
                },
            ],
        });
        expect(success.isError).toBe(false);
        expect((success.result.content[0] as {type: "text"; text: string}).text).toContain(INLINE_PROPOSAL_PENDING_MARKER);

        // 2. 失败调度（多处匹配）
        const multiMatch = await runViaHarness({
            summary: "多处匹配失败调度",
            targetPath: "manuscript/chapter-01.md",
            edits: [
                {
                    original: "晨光微熹，",
                    replacement: "晨光微亮，",
                    rationale: "理由",
                },
            ],
        });
        expect(multiMatch.isError).toBe(true);
        expect((multiMatch.result.content[0] as {type: "text"; text: string}).text).toContain("匹配到 2 处。锚点必须唯一");
    });
});
