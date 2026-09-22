import {resolve} from "node:path";
import {describe, expect, it} from "vitest";
import leaderDefaultProfileDefinition from "../../../assets/workspace/.nbook/agent/profiles/builtin/leader.default.profile";
import interviewProfileDefinition from "../../../assets/workspace/.nbook/agent/profiles/builtin/interview.new-book.profile";
import interviewStuckProfileDefinition from "../../../assets/workspace/.nbook/agent/profiles/builtin/interview.stuck.profile";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const leaderDefaultProfile = normalizeAgentProfile(leaderDefaultProfileDefinition);
const interviewProfile = normalizeAgentProfile(interviewProfileDefinition);
const interviewStuckProfile = normalizeAgentProfile(interviewStuckProfileDefinition);

/** 交互型 profile 都必须摘掉的工具 key。 */
const FORBIDDEN_TOOL_KEYS = ["bash"] as const;

/** 红线声明必须在 System 区出现的两条原句。 */
const REQUIRED_DECLARATIONS = [
    "skill（技能包）仅作分析参照，一律不输出正文",
    "你没有正文目录的写入权限",
] as const;

/** leader.default 的 settings schema 无可选字段，必须给全。 */
const LEADER_DEFAULT_SETTINGS = {
    collaborationMode: "default",
    neuroBookFamiliarity: "default",
    questionStrategy: "default",
    leaderPersonaPreset: "personas/caihui-lite.md",
    customTopSystemPrompt: "",
    fileChangeAwareness: "full",
} as const;

type PreparedRedlinePrompt = Readonly<{
    systemPrompt: string;
    appendingText: string;
}>;

/**
 * 每个 case 自带一个已绑定的 prepare 闭包。
 *
 * 不把两个 profile 放进同一个联合类型再调用 prepare：两个 profile 的 settings
 * schema 不同，联合签名会让 settings 退化成两者必填字段的交集。
 */
async function prepareLeaderDefaultPrompt(): Promise<PreparedRedlinePrompt> {
    const prepared = await leaderDefaultProfile.prepare!({
        session: testSession({
            profileKey: "leader.default",
            currentProjectRoot: "interactive-profile-redline",
            customState: {},
            linkedAgents: [],
            archived: false,
            agentMode: "normal",
        }),
        initial: {},
        vars: createTestVariableAccessor(),
        catalog: {profiles: [], issues: []},
        skills: [],
        settings: LEADER_DEFAULT_SETTINGS,
    });
    return {
        systemPrompt: prepared.systemPrompt ?? "",
        appendingText: (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n"),
    };
}

async function prepareInterviewPrompt(): Promise<PreparedRedlinePrompt> {
    const prepared = await interviewProfile.prepare!({
        session: testSession({
            profileKey: "interview.new-book",
            currentProjectRoot: "interactive-profile-redline",
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
    return {
        systemPrompt: prepared.systemPrompt ?? "",
        appendingText: (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n"),
    };
}

async function prepareInterviewStuckPrompt(): Promise<PreparedRedlinePrompt> {
    const prepared = await interviewStuckProfile.prepare!({
        session: testSession({
            profileKey: "interview.stuck",
            currentProjectRoot: "interactive-profile-redline",
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
    return {
        systemPrompt: prepared.systemPrompt ?? "",
        appendingText: (prepared.appendingMessages ?? []).map((message) => JSON.stringify(message)).join("\n"),
    };
}

describe("交互型 profile 红线：摘 bash + 置顶声明", () => {
    const cases = [
        {
            key: "leader.default",
            rootToolKeys: leaderDefaultProfile.rootToolKeys,
            prepare: prepareLeaderDefaultPrompt,
        },
        {
            key: "interview.new-book",
            rootToolKeys: interviewProfile.rootToolKeys,
            prepare: prepareInterviewPrompt,
        },
        {
            key: "interview.stuck",
            rootToolKeys: interviewStuckProfile.rootToolKeys,
            prepare: prepareInterviewStuckPrompt,
        },
    ] as const;

    for (const current of cases) {
        it(`${current.key} 工具清单不含 bash`, () => {
            for (const forbidden of FORBIDDEN_TOOL_KEYS) {
                expect(current.rootToolKeys).not.toContain(forbidden);
            }
        });

        it(`${current.key} 仍保留文件写工具与读工具`, () => {
            expect(current.rootToolKeys).toEqual(expect.arrayContaining(["read", "write", "edit", "apply_patch"]));
        });

        it(`${current.key} System 区带红线声明`, async () => {
            const {systemPrompt} = await current.prepare();

            for (const declaration of REQUIRED_DECLARATIONS) {
                expect(systemPrompt).toContain(declaration);
            }
            expect(systemPrompt).toContain("manuscript/");
        });

        it(`${current.key} 不在 AppendingSet 注入红线声明`, async () => {
            const {appendingText} = await current.prepare();

            for (const declaration of REQUIRED_DECLARATIONS) {
                expect(appendingText).not.toContain(declaration);
            }
        });
    }
});
