import {join, resolve} from "node:path";
import {randomUUID} from "node:crypto";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {createStoredUserMessage} from "nbook/server/agent/messages/message-utils";
import {SkillCatalog} from "nbook/server/agent/skills/skill-catalog";
import leaderDefaultProfileDefinition, {LeaderDefaultSettingsForm} from "../../../assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {
    createProjectWorkspaceKey,
    projectWorkspaceRef,
    resolvedProjectWorkspace,
} from "nbook/server/workspace-files/project-identity";
import type {ReadyProjectSessionRef} from "nbook/server/workspace-files/project-session-types";
import {
    materializeProfileTurnContexts,
    SKILL_ACTIVATION_MAX_CHARS,
    type ProfileTurnContextPlan,
} from "./profile-turn-context";

// leader.default 的 Import 节点要求显式仓库根。
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= resolve(import.meta.dirname, "..", "..", "..", "..", "..");

const mocks = vi.hoisted(() => ({
    warn: vi.fn(async () => undefined),
}));

vi.mock("nbook/server/app-logs/logger", () => ({
    appLogger: {
        warn: mocks.warn,
        info: vi.fn(async () => undefined),
        error: vi.fn(async () => undefined),
    },
}));

vi.mock("nbook/server/workspace-files/project-session", () => ({
    requireReadyModuleHandle: () => {
        throw new Error("module unavailable");
    },
    activateReadyProjectModule: async () => {
        throw new Error("lazy module unavailable");
    },
}));

vi.mock("nbook/server/workspace-history/project-history", () => ({
    PROJECT_HISTORY_MODULE_TOKEN: {name: "history", kind: "required"},
    readUnseenForAgent: vi.fn(async () => [] as unknown[]),
    advanceAgentCursor: vi.fn(async () => undefined),
}));

/** 从存储消息中取出注入正文。 */
function injectedText(message: {content: unknown[]}): string {
    const block = message.content[0] as {type: string; text: string};
    return block.text;
}

/** 写入一个带 SKILL.md 的假技能包。 */
async function writeSkill(installRoot: string, key: string, body: string): Promise<void> {
    const directory = join(installRoot, key);
    await mkdir(directory, {recursive: true});
    await writeFile(join(directory, "SKILL.md"), body, "utf-8");
}

describe("skill-activation 物化（$skill-key 显式唤起真注入）", () => {
    let root: string;
    let installRoot: string;
    let projectRoot: string;
    let resolver: SkillCatalog;

    beforeEach(async () => {
        vi.clearAllMocks();
        root = testHostPath("nbook-skill-activation-test", randomUUID());
        installRoot = join(root, "state", "workspace", ".nbook", "agent", "skills");
        projectRoot = join(root, "workspace", "project");
        await mkdir(projectRoot, {recursive: true});
        await writeSkill(installRoot, "draft-cn", [
            "---",
            "name: 中文草稿流程",
            "description: 中文小说草稿流程。",
            "---",
            "",
            "# 中文草稿流程",
            "",
            "先列大纲，再逐场推进，不要跳步。",
            "",
        ].join("\n"));
        resolver = new SkillCatalog(installRoot);
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    function projectRef(): ReadyProjectSessionRef {
        const ref = projectWorkspaceRef("novel-skill-activation");
        return {
            workspace: resolvedProjectWorkspace(
                ref,
                absoluteFsPath(projectRoot),
                createProjectWorkspaceKey(absoluteFsPath(root), ref),
            ),
            generation: 3,
        };
    }

    async function materialize(input: {
        userText?: string | null;
        project?: ReadyProjectSessionRef | null;
        skillResolver?: {resolve(skillKey: string, projectRoot?: string): Promise<{
            key: string;
            name: string;
            source: "install" | "project";
            rootPath: string;
            skillPath: string;
            body: string;
        } | null>} | null;
        plans?: ProfileTurnContextPlan[];
    } = {}) {
        return materializeProfileTurnContexts({
            plans: input.plans ?? [{kind: "skill-activation", appendingIndex: 0}],
            project: input.project === undefined ? projectRef() : input.project,
            sessionId: 7,
            diffMaxChars: 512,
            pendingUserMessage: input.userText ? createStoredUserMessage(input.userText) : null,
            selectedFilePath: null,
            skillResolver: input.skillResolver === undefined ? resolver : input.skillResolver,
        });
    }

    it("$key 命中时注入 SKILL.md 正文，并标注来源路径与「仅作分析参照」定位语", async () => {
        const result = await materialize({userText: "用 $draft-cn 帮我梳理这一章的流程。"});

        expect(result.insertions).toHaveLength(1);
        expect(result.insertions[0]!.appendingIndex).toBe(0);
        const text = injectedText(result.insertions[0]!.message);
        expect(text).toContain("<skill-activation>");
        expect(text).toContain("## $draft-cn");
        expect(text).toContain("先列大纲，再逐场推进，不要跳步。");
        expect(text).toContain("SKILL.md");
        expect(text).toContain("仅作分析参照");
        expect(text).toContain("不是用户本轮的要求");
    });

    it("未知 key 跳过注入（未命中的提醒仍归 MentionedSkillsReminder）", async () => {
        const result = await materialize({userText: "用 $not-a-real-skill 试试看。"});

        expect(result.insertions).toEqual([]);
        expect(mocks.warn).not.toHaveBeenCalled();
    });

    it("用户输入没有 $ 时跳过注入，且不触碰解析通道", async () => {
        const resolve = vi.fn(resolver.resolve.bind(resolver));
        const result = await materialize({userText: "这一章的开头怎么改？", skillResolver: {resolve}});

        expect(result.insertions).toEqual([]);
        expect(resolve).not.toHaveBeenCalled();
    });

    it("没有 pendingUserMessage 时跳过注入", async () => {
        const result = await materialize({userText: null});

        expect(result.insertions).toEqual([]);
    });

    it("正文超过 4000 字符时截断并显式标注", async () => {
        await writeSkill(installRoot, "huge", "长".repeat(SKILL_ACTIVATION_MAX_CHARS + 500));
        const result = await materialize({userText: "用 $huge 压缩一下。"});

        const text = injectedText(result.insertions[0]!.message);
        const longestRun = Math.max(0, ...text.split(/[^长]/u).map((part) => part.length));
        expect(longestRun).toBe(SKILL_ACTIVATION_MAX_CHARS);
        expect(text).toContain("…（正文已截断）");
    });

    it("project 为 null 时 Install Root 技能仍注入", async () => {
        const result = await materialize({userText: "用 $draft-cn 帮我梳理。", project: null});

        expect(result.insertions).toHaveLength(1);
        expect(injectedText(result.insertions[0]!.message)).toContain("先列大纲");
    });

    it("项目级同名技能遮蔽 Install Skill，并优先注入项目版本", async () => {
        await writeSkill(join(projectRoot, ".nbook", "skills"), "draft-cn", "项目版正文：先写人物小传。");

        const result = await materialize({userText: "用 $draft-cn 帮我梳理。"});
        const text = injectedText(result.insertions[0]!.message);

        expect(text).toContain("项目版正文：先写人物小传。");
        expect(text).not.toContain("先列大纲");
    });

    it("解析通道抛错时 warn 跳过，不影响同轮其他 kind", async () => {
        const failing = {
            resolve: vi.fn(async () => {
                throw new Error("catalog exploded");
            }),
        };
        const result = await materialize({
            userText: "用 $draft-cn 梳理。",
            skillResolver: failing,
            plans: [
                {kind: "skill-activation", appendingIndex: 0},
                {kind: "mentioned-entities", appendingIndex: 1},
            ],
        });

        expect(result.insertions).toEqual([]);
        expect(mocks.warn).toHaveBeenCalled();
    });

    it("leader.default 在 AppendingSet 声明该节点，端到端产出注入消息", async () => {
        const profile = normalizeAgentProfile(leaderDefaultProfileDefinition);
        const prepared = await profile.prepare!({
            session: testSession({
                messages: [],
                profileKey: "leader.default",
                currentProjectRoot: "novel-skill-activation",
            }),
            initial: {},
            vars: createTestVariableAccessor(),
            catalog: {profiles: [], issues: []},
            skills: [],
            settings: LeaderDefaultSettingsForm.defaults,
            runtime: {
                now: "2026-05-23T00:00:00.000Z",
                promptUserTurnCount: 1,
                pendingUserMessage: {role: "user", content: [{type: "text", text: "用 $draft-cn 梳理流程"}], timestamp: 0},
            },
        });

        // Profile 只声明位置；正文由宿主物化。
        expect(prepared.turnContexts).toEqual(expect.arrayContaining([
            expect.objectContaining({kind: "skill-activation"}),
        ]));
        expect((prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n")).not.toContain("<skill-activation>");

        const materialized = await materialize({
            userText: "用 $draft-cn 梳理流程",
            plans: prepared.turnContexts,
        });
        const injected = materialized.insertions.find((insertion) => injectedText(insertion.message).includes("<skill-activation>"));
        expect(injected).toBeDefined();
        expect(injectedText(injected!.message)).toContain("先列大纲，再逐场推进，不要跳步。");
    });

    it("同一 key 重复出现只注入一次", async () => {
        const result = await materialize({userText: "先用 $draft-cn，再用 $draft-cn 检查一遍。"});

        expect(result.insertions).toHaveLength(1);
        expect(injectedText(result.insertions[0]!.message).match(/## \$draft-cn/gu)).toHaveLength(1);
    });
});
