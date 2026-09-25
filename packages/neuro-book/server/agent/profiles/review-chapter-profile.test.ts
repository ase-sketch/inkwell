import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import reviewChapterProfileDefinition, {
    llmlintCheckTool,
    submitCritiquesTool,
} from "../../../assets/workspace/.nbook/agent/profiles/builtin/review.chapter.profile";
import {SUBMIT_CRITIQUES_TOOL} from "nbook/profile-sdk";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {assertProfileWriteScope, hasProfileWriteScope} from "nbook/server/workspace-files/profile-write-scope";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const PROFILE_SOURCE_PATH = resolve(
    "assets",
    "workspace",
    ".nbook",
    "agent",
    "profiles",
    "builtin",
    "review.chapter.profile.tsx",
);

const reviewChapterProfile = normalizeAgentProfile(reviewChapterProfileDefinition);

/** 红线声明必须在 System 区出现，与 leader.default / interview.stuck 同口径。 */
const REQUIRED_REDLINE_DECLARATIONS = [
    "skill（技能包）仅作分析参照，一律不输出正文",
    "你没有正文目录的写入权限",
] as const;

/** 审这一章的严口径：连写工具都不挂，bash 更不挂。 */
const FORBIDDEN_TOOL_KEYS = [
    "write",
    "edit",
    "apply_patch",
    "bash",
    "execute_world",
    "execute_sql",
    "create_agent",
    "invoke_agent",
    "save_story_act",
    "save_story_chapter",
    "save_story_thread",
    "save_story_scene",
    "save_story_promise",
    "save_promise_beat",
    "save_story_decision",
] as const;

const REQUIRED_PLOT_READ_TOOL_KEYS = [
    "get_story_tree",
    "get_story_thread",
    "get_story_scene_context",
    "get_scene_world_context",
    "get_story_chapter",
    "get_chapter_writer_brief",
    "get_story_promise",
    "get_story_decision",
] as const;

/** llmlint 的八条语义规则：窄工具查不到，必须写进提示词让模型读全文判断。 */
const LLMLINT_SEMANTIC_RULE_IDS = [
    "hollow-summary-paragraph",
    "hidden-actor",
    "mechanical-elevation-ending",
    "over-explaining-reader",
    "quotable-punchline",
    "register-mismatch",
    "monotone-rhythm",
    "low-specificity",
] as const;

async function prepareReviewChapterPrompt() {
    return reviewChapterProfile.prepare!({
        session: testSession({
            profileKey: "review.chapter",
            currentProjectRoot: "review-chapter-profile",
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
}

describe("review.chapter 审这一章 profile", () => {
    it("manifest 用 ASCII key 与作者可读的显示名", () => {
        expect(reviewChapterProfile.manifest.key).toBe("review.chapter");
        expect(reviewChapterProfile.manifest.name).toBe("审这一章");
        expect(reviewChapterProfile.manifest.description).toContain("质疑");
    });

    it("工具清单：只读正文 + 两个自带窄工具 + 阻塞闸门 + Plot 只读，不挂任何写工具与 bash", () => {
        const rootToolKeys = reviewChapterProfile.rootToolKeys;

        expect(rootToolKeys).toEqual(expect.arrayContaining([
            "read",
            "llmlint_check",
            "submit_critiques",
            "request_user_input",
            ...REQUIRED_PLOT_READ_TOOL_KEYS,
        ]));
        for (const forbidden of FORBIDDEN_TOOL_KEYS) {
            expect(rootToolKeys).not.toContain(forbidden);
        }
    });

    it("质疑工具名与 M3 契约同源：SDK 常量必须与 shared/chapter-critique.ts 一致", async () => {
        // profile-sdk 只导出字面量（不能 re-export 契约模块——它 import zod，会污染所有 profile artifact）。
        // 两边保持一致由这条断言钉住。
        const shared = await import("nbook/shared/chapter-critique");

        expect(SUBMIT_CRITIQUES_TOOL).toBe(shared.SUBMIT_CRITIQUES_TOOL);
        expect(SUBMIT_CRITIQUES_TOOL).toBe("submit_critiques");
        expect(submitCritiquesTool.key).toBe(shared.SUBMIT_CRITIQUES_TOOL);
    });

    it("两个自带工具是 profile 级自定义实现，携带真实执行入口", () => {
        expect(llmlintCheckTool.key).toBe("llmlint_check");
        expect(submitCritiquesTool.key).toBe("submit_critiques");
        expect(typeof llmlintCheckTool.executeWithContext).toBe("function");
        expect(typeof submitCritiquesTool.executeWithContext).toBe("function");
        // 自带工具进入 root tools 时用的是同一份实现，不是宿主 registry 的同名工具。
        expect(reviewChapterProfile.tools.llmlint_check).toBe(llmlintCheckTool);
        expect(reviewChapterProfile.tools.submit_critiques).toBe(submitCritiquesTool);
    });

    it("System 区带红线声明，且红线不出现在 AppendingSet", async () => {
        const prepared = await prepareReviewChapterPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";
        const appendingText = (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n");

        for (const declaration of REQUIRED_REDLINE_DECLARATIONS) {
            expect(systemPrompt).toContain(declaration);
            expect(appendingText).not.toContain(declaration);
        }
        expect(systemPrompt).toContain("manuscript/");
        expect(systemPrompt).toContain("审稿的产出是质疑清单，不是修改稿");
        expect(systemPrompt).toContain("绝不代改正文");
    }, 60_000);

    it("System 区内联三轴审稿契约：动机 / 伏笔 / AI 味", async () => {
        const prepared = await prepareReviewChapterPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";

        expect(systemPrompt).toContain("动机轴");
        expect(systemPrompt).toContain("伏笔轴");
        expect(systemPrompt).toContain("AI 味轴");
        expect(systemPrompt).toContain("问**埋**");
        expect(systemPrompt).toContain("问**呼**");
        expect(systemPrompt).toContain("问**收**");
        expect(systemPrompt).toContain("未决伏笔账本");
    }, 60_000);

    it("System 区把 llmlint_check 设为 AI 味轴唯一证据入口，并保留八条语义规则", async () => {
        const prepared = await prepareReviewChapterPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";

        expect(systemPrompt).toContain("必须先调用 llmlint_check 拿规则命中");
        expect(systemPrompt).toContain("命中是证据，不是判决");
        for (const ruleId of LLMLINT_SEMANTIC_RULE_IDS) {
            expect(systemPrompt).toContain(ruleId);
        }
    }, 60_000);

    it("System 区写死产出契约与逐条回应闸门", async () => {
        const prepared = await prepareReviewChapterPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";

        expect(systemPrompt).toContain("质疑必须经 submit_critiques 提交");
        expect(systemPrompt).toContain("每轮回复的末尾必须调用 request_user_input");
        expect(systemPrompt).toContain("认可");
        expect(systemPrompt).toContain("驳回");
        expect(systemPrompt).toContain("记下");
        expect(systemPrompt).toContain("原文引用");
    }, 60_000);

    it("AppendingSet 挂 promise-ledger / mentioned-entities / skill-activation 三种 turn context", async () => {
        const prepared = await prepareReviewChapterPrompt();
        const kinds = (prepared.turnContexts ?? []).map((context) => context.kind);

        expect(kinds).toEqual(expect.arrayContaining(["promise-ledger", "mentioned-entities", "skill-activation"]));
    }, 60_000);

    it("红线与三轴契约直接内联在 profile 源码里，可静态核对", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");

        for (const declaration of REQUIRED_REDLINE_DECLARATIONS) {
            expect(source).toContain(declaration);
        }
        expect(source).toContain("submit_critiques");
        expect(source).toContain("llmlint_check");
    });
});

describe("review.chapter 写域登记（M2c 红线）", () => {
    it("已登记进交互 profile 写域白名单，未登记即 fail-open 的口子被堵上", () => {
        expect(hasProfileWriteScope("review.chapter")).toBe(true);
    });

    it("写 manuscript/ 一律被拒——它连写工具都没有，登记只作 fail-closed 兜底", () => {
        const target = {
            kind: "project" as const,
            absolutePath: absoluteFsPath(resolve("test-project", "manuscript", "chapter-01.md")),
            project: {workspace: {root: "test-project", ref: {projectRoot: "test-project"}}, generation: 1} as never,
            relativePath: "manuscript/chapter-01.md",
        };

        expect(() => assertProfileWriteScope({
            profileKey: "review.chapter",
            operation: "write",
            target,
        })).toThrow(/写入域白名单拒绝写入 manuscript\/chapter-01\.md/);

        expect(() => assertProfileWriteScope({
            profileKey: "review.chapter",
            operation: "apply_patch",
            target,
        })).toThrow(/manuscript\//);
    });


describe("submit_critiques 质疑登记", () => {
    const validInput = {
        chapter: "第一章 破晓",
        summary: "这一章动作清楚，但有两处动机接不上。",
        items: [
            {
                category: "motivation",
                question: "他为什么在这里选择留下，而不是跟她说清就走？",
                evidence: {quote: "他深吸一口气，心中五味杂陈。", line: 3},
                severity: "medium",
            },
            {
                category: "ai-flavor",
                question: "「首先……其次……最后」这一串，是这一章真需要列步骤，还是顺手写下的过渡？",
                evidence: {quote: "首先，他需要弄清楚自己身处何方；其次，他要找到回去的路；最后，他必须活下去。"},
                severity: "high",
                llmLintRuleId: "firstly-secondly",
            },
            {
                category: "foreshadowing",
                question: "柴门后面的那个影子，账本上没有条目——你是还没记，还是它不打算兑现？",
                evidence: {quote: "晨光微熹，少年推开了老旧的柴门。"},
                severity: "low",
                promiseId: 7,
            },
        ],
    };

    it("合法清单被登记：返回待处置标记与结构化回显，且不写任何文件", async () => {
        const result = await submitCritiquesTool.executeWithContext!(
            null as never,
            "call-submit-1",
            validInput,
        );

        const block = result.content[0];
        expect(block?.type).toBe("text");
        const text = block && block.type === "text" ? block.text : "";
        expect(text).toContain("CRITIQUES_PENDING_AUTHOR_REVIEW");
        expect(text).toContain("已登记 3 条质疑");
        // 对模型说的是人话口径，不泄漏字段名。
        expect(text).toContain("（动机，分量 medium）");
        expect(text).toContain("（伏笔，分量 low）");
        expect(text).toContain("（AI 味，分量 high）");
        expect(text).toContain("request_user_input");

        const details = result.details as {
            marker: string;
            chapter: string;
            summary?: string;
            items: Array<{category: string; question: string; evidence: {quote: string}; severity: string; llmLintRuleId?: string; promiseId?: number}>;
        };
        expect(details.marker).toBe("CRITIQUES_PENDING_AUTHOR_REVIEW");
        expect(details.chapter).toBe(validInput.chapter);
        expect(details.summary).toBe(validInput.summary);
        expect(details.items).toHaveLength(3);
        expect(details.items[0]!.category).toBe("motivation");
        expect(details.items[1]!.llmLintRuleId).toBe("firstly-secondly");
        expect(details.items[2]!.promiseId).toBe(7);
        // 每条质疑都带着原文引用，这是契约的硬要求。
        for (const item of details.items) {
            expect(item.evidence.quote.length).toBeGreaterThan(0);
        }
    });

    it("分类、分量、原文引用、条数任一不合规都当场报错，讲清是哪一条", async () => {
        const base = {chapter: "第一章", items: [validInput.items[0]]};

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c1", {
            ...base,
            items: [{...validInput.items[0]!, category: "typo"}],
        })).rejects.toThrow(/第 1 条质疑的分类不对/);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c2", {
            ...base,
            items: [{...validInput.items[0]!, severity: "fatal"}],
        })).rejects.toThrow(/第 1 条质疑的分量不对/);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c3", {
            ...base,
            items: [{...validInput.items[0]!, evidence: {quote: "   "}}],
        })).rejects.toThrow(/第 1 条质疑缺少原文引用/);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c4", {
            chapter: "第一章",
            items: [],
        })).rejects.toThrow(/质疑清单里一条都没有/);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c5", {
            chapter: "",
            items: [validInput.items[0]],
        })).rejects.toThrow(/质疑清单缺少章节名/);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c6", {
            chapter: "第一章",
            items: [{...validInput.items[0]!, evidence: {quote: "原句", line: 0}}],
        })).rejects.toThrow(/行号不合法/);
    });

    it("条目数超过契约上限（20 条）时拒绝，避免公开投影截断整份清单", async () => {
        const many = Array.from({length: 21}, () => validInput.items[0]!);

        await expect(submitCritiquesTool.executeWithContext!(null as never, "c-many", {
            chapter: "第一章",
            items: many,
        })).rejects.toThrow(/超过单次上限 20 条/);
    });

    it("校验失败不会留下任何写入痕迹：工具本身不持文件句柄，也不写盘", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");
        const submitBlock = source.slice(source.indexOf("export const submitCritiquesTool"));

        expect(submitBlock).not.toContain("writeFile");
        expect(submitBlock).not.toContain("applyAutoFix");
        expect(submitBlock).toContain("CRITIQUES_PENDING_AUTHOR_REVIEW");
    });
});

    it("放行语义仍在：登记后写设定与结构区不被拒", () => {
        const target = {
            kind: "project" as const,
            absolutePath: absoluteFsPath(resolve("test-project", "lorebook", "hero.md")),
            project: {workspace: {root: "test-project", ref: {projectRoot: "test-project"}}, generation: 1} as never,
            relativePath: "lorebook/hero.md",
        };

        expect(() => assertProfileWriteScope({
            profileKey: "review.chapter",
            operation: "write",
            target,
        })).not.toThrow();
    });
});
