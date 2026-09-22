import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import interviewStuckProfileDefinition from "../../../assets/workspace/.nbook/agent/profiles/builtin/interview.stuck.profile";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";
import {SkillCatalog} from "nbook/server/agent/skills/skill-catalog";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const ASSETS_AGENT_ROOT = resolve("assets", "workspace", ".nbook", "agent");
const PROFILE_SOURCE_PATH = resolve(ASSETS_AGENT_ROOT, "profiles", "builtin", "interview.stuck.profile.tsx");
const SKILL_PATH = resolve(ASSETS_AGENT_ROOT, "skills", "ka-wen", "SKILL.md");

const interviewStuckProfile = normalizeAgentProfile(interviewStuckProfileDefinition);

/** 红线声明必须在 System 区出现的两条原句，与 leader.default / interview.new-book 同口径。 */
const REQUIRED_REDLINE_DECLARATIONS = [
    "skill（技能包）仅作分析参照，一律不输出正文",
    "你没有正文目录的写入权限",
] as const;

/** 卡文追问只能读 Plot：写入型 Plot 工具与 bash 一律不得挂载。 */
const FORBIDDEN_TOOL_KEYS = [
    "bash",
    "report_result",
    "execute_world",
    "execute_sql",
    "create_agent",
    "invoke_agent",
    "save_story_scene",
    "save_story_thread",
    "save_story_chapter",
    "save_story_act",
    "save_story_promise",
    "save_promise_beat",
    "save_story_decision",
] as const;

/** Plot 只读工具必须齐备：卡文时只读剧情结构与未决伏笔。 */
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

async function prepareInterviewStuckPrompt() {
    return interviewStuckProfile.prepare!({
        session: testSession({
            profileKey: "interview.stuck",
            currentProjectRoot: "interview-stuck-profile",
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

describe("interview.stuck 卡文追问 profile", () => {
    it("manifest 用 ASCII key 与作者可读的显示名", () => {
        expect(interviewStuckProfile.manifest.key).toBe("interview.stuck");
        expect(interviewStuckProfile.manifest.name).toBe("卡文追问");
        expect(interviewStuckProfile.manifest.description).toContain("卡住");
    });

    it("工具清单：读 + 限域写 + 阻塞追问 + Plot 只读，不挂 bash / report_result / Plot 写工具", () => {
        const rootToolKeys = interviewStuckProfile.rootToolKeys;

        expect(rootToolKeys).toEqual(expect.arrayContaining([
            "read",
            "write",
            "edit",
            "apply_patch",
            "request_user_input",
            ...REQUIRED_PLOT_READ_TOOL_KEYS,
        ]));
        for (const forbidden of FORBIDDEN_TOOL_KEYS) {
            expect(rootToolKeys).not.toContain(forbidden);
        }
    });

    it("System 区带红线声明，且红线不出现在 AppendingSet", async () => {
        const prepared = await prepareInterviewStuckPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";
        const appendingText = (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n");

        for (const declaration of REQUIRED_REDLINE_DECLARATIONS) {
            expect(systemPrompt).toContain(declaration);
            expect(appendingText).not.toContain(declaration);
        }
        expect(systemPrompt).toContain("manuscript/");
        expect(systemPrompt).not.toContain("bash");
    }, 60_000);

    it("System 区内联卡文三连问与阻塞式追问铁律", async () => {
        const prepared = await prepareInterviewStuckPrompt();
        const systemPrompt = prepared.systemPrompt ?? "";

        expect(systemPrompt).toContain("意图 → 阻力 → 代价");
        expect(systemPrompt).toContain("每轮回复的末尾必须调用 request_user_input");
        expect(systemPrompt).toContain("绝不代写正文");
    }, 60_000);

    it("AppendingSet 声明 promise-ledger / mentioned-entities / skill-activation 三种 turn context", async () => {
        const prepared = await prepareInterviewStuckPrompt();
        const kinds = (prepared.turnContexts ?? []).map((context) => context.kind);

        expect(kinds).toEqual(expect.arrayContaining(["promise-ledger", "mentioned-entities", "skill-activation"]));
    }, 60_000);

    it("HistorySet 导入 AGENTS.md 与 lorebook 锚点规范", async () => {
        const prepared = await prepareInterviewStuckPrompt();
        const historyText = (prepared.historyInitMessages ?? []).map((message) => JSON.stringify(message)).join("\n");

        expect(historyText).toContain("AGENTS.md");
        expect(historyText).toContain("reference/content/lorebook-anchors.md");
    }, 60_000);

    it("红线声明直接内联在 profile 源码里（与 leader.default 同口径，可静态核对）", async () => {
        const source = await readFile(PROFILE_SOURCE_PATH, "utf8");

        for (const declaration of REQUIRED_REDLINE_DECLARATIONS) {
            expect(source).toContain(declaration);
        }
    });
});

describe("ka-wen 技能包载荷", () => {
    it("SkillCatalog 用目录名作 key，并解析出 name / description", async () => {
        const catalog = new SkillCatalog(resolve(ASSETS_AGENT_ROOT, "skills"));
        const skill = await catalog.get("ka-wen");

        expect(skill).toMatchObject({
            key: "ka-wen",
            name: "ka-wen",
            source: "install",
        });
        expect(skill?.description).toContain("卡住");
        expect(skill?.skillPath).toBe(SKILL_PATH);
    });

    it("正文先讲怎么用，并覆盖意图 / 阻力 / 代价三问", async () => {
        const body = await readFile(SKILL_PATH, "utf8");

        expect(body).toContain("## 怎么用");
        expect(body).toContain("第一问：意图");
        expect(body).toContain("第二问：阻力");
        expect(body).toContain("第三问：代价");
        // 软引用 M2a 注入物：只做文字引用，不做插值。
        expect(body).toContain("未决伏笔账本");
        expect(body).not.toContain("${");
    });

    it("不代写正文的纪律写死在技能包里", async () => {
        const body = await readFile(SKILL_PATH, "utf8");

        expect(body).toContain("不代写正文");
        expect(body).toContain("不替作者拍板");
    });
});
