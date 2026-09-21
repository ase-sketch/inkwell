import {describe, expect, it} from "vitest";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import interviewProfileDefinition from "../../../assets/workspace/.nbook/agent/profiles/builtin/interview.new-book.profile";
import {normalizeAgentProfile} from "nbook/server/agent/profiles/define-agent-profile";
import {createTestRuntimeSession as testSession} from "nbook/server/agent/profiles/test/runtime-session";
import {createTestVariableAccessor} from "nbook/server/agent/variables/test-utils";
import {parseFrontmatterDocument} from "nbook/server/utils/frontmatter-document";
import {WorkspaceContentFrontmatterSchema} from "nbook/server/workspace-files/content-node-schema";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const INTERVIEW_PROFILE_SOURCE_PATH = resolve(
    import.meta.dirname,
    "../../../assets/workspace/.nbook/agent/profiles/builtin/interview.new-book.profile.tsx",
);

const interviewProfile = normalizeAgentProfile(interviewProfileDefinition);

/**
 * 访谈期落盘产出样本：story-concept 与 protagonist 两个内容节点 index.md 的完整文档。
 * 它们模拟「三块齐备后」Agent 通过写文件工具落盘的文本，必须走真实解析路径校验。
 */
const STORY_CONCEPT_INDEX_MD = `---
title: 故事概念
type: note
subtype: story-concept
status: draft
icon: book-open-text
aliases: []
tags:
  - 小说初始化
summary: "落魄少主以断岳残剑接下宗门倾轧的第一道追杀。"
refs: []
anchors: []
retrieval:
  enabled: false
  trigger: null
governance:
  source: interview
  review: proposed
ext: {}
---

## 故事概述

这是一个尚未落笔的长简介式故事概念，用于验证访谈期落盘产出的 frontmatter 契约。
`;

const PROTAGONIST_INDEX_MD = `---
title: 苏云
type: character
subtype: person
status: active
icon: user
aliases:
  - "云哥"
  - "苏楼主"
  - "断岳剑主"
tags:
  - 主角
  - 落魄少主
summary: "家道中落的少主，因一柄断岳残剑被卷入宗门倾轧。"
refs: []
anchors: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: interview
  review: proposed
ext: {}
---

## 人物档案

姓名、身份、动机、缺陷、处境与第一股压力。
`;

/** 反例样本：governance 缺少 source，只剩 review。 */
const MISSING_SOURCE_INDEX_MD = `---
title: 苏云
type: character
subtype: person
status: active
icon: user
aliases:
  - "云哥"
tags:
  - 主角
summary: "缺少来源标注的主角档案。"
refs: []
anchors: []
retrieval:
  enabled: true
  trigger: null
governance:
  review: proposed
ext: {}
---

## 人物档案

缺少 governance.source。
`;

/** 反例样本：主角条目整体缺少 aliases 字段。 */
const MISSING_ALIASES_INDEX_MD = `---
title: 苏云
type: character
subtype: person
status: active
icon: user
tags:
  - 主角
summary: "缺少别名列表的主角档案。"
refs: []
anchors: []
retrieval:
  enabled: true
  trigger: null
governance:
  source: interview
  review: proposed
ext: {}
---

## 人物档案

缺少 aliases。
`;

/** 反例样本：主角条目写出了 aliases 键但留空数组。 */
const EMPTY_ALIASES_INDEX_MD = MISSING_ALIASES_INDEX_MD.replace(
    "icon: user\ntags:",
    "icon: user\naliases: []\ntags:",
);

/**
 * 提示词契约演示校验器。
 *
 * 说明：内容节点 schema 中 anchors 是可选字段（向后兼容契约由 content-node-schema 冻结，
 * 本测试不得改动它），因此「显式写出 anchors: []」「protagonist aliases 不得为空」这两条
 * 只存在于落盘提示词的文本契约里。此函数把该文本契约机械化成逐条检查，用于演示反例确实
 * 会被判定不合格；运行时真正的强制仍来自 schema 校验与人工 reviewed。
 */
type InterviewWritebackRule = "governance-source-interview" | "aliases-declared" | "protagonist-aliases-non-empty" | "anchors-explicitly-empty" | "no-anchor-data-in-ext";

function evaluateInterviewWritebackPromptContract(
    frontmatter: Record<string, unknown>,
    options: {kind: "story-concept" | "protagonist"},
): {rule: InterviewWritebackRule; message: string}[] {
    const violations: {rule: InterviewWritebackRule; message: string}[] = [];
    const governance = frontmatter.governance;
    const governanceSource = typeof governance === "object" && governance !== null && !Array.isArray(governance)
        ? (governance as Record<string, unknown>).source
        : undefined;
    if (governanceSource !== "interview") {
        violations.push({rule: "governance-source-interview", message: "访谈期落盘必须显式写出 governance.source: interview"});
    }

    const aliases = frontmatter.aliases;
    if (!Array.isArray(aliases)) {
        violations.push({rule: "aliases-declared", message: "落盘 frontmatter 必须显式写出 aliases 字段"});
    } else if (options.kind === "protagonist" && aliases.length === 0) {
        violations.push({rule: "protagonist-aliases-non-empty", message: "protagonist 的 aliases 必须填入主角常见称呼，不得留空"});
    }

    const anchors = frontmatter.anchors;
    if (!Array.isArray(anchors)) {
        violations.push({rule: "anchors-explicitly-empty", message: "访谈期落盘必须显式写出 anchors 字段（空数组）"});
    } else if (anchors.length > 0) {
        violations.push({rule: "anchors-explicitly-empty", message: "访谈期尚无正文，anchors 不得填写锚点"});
    }

    const ext = frontmatter.ext;
    if (typeof ext === "object" && ext !== null && !Array.isArray(ext)) {
        const smuggled = Object.keys(ext).filter((key) => /anchor|chapter|quote/iu.test(key));
        if (smuggled.length > 0) {
            violations.push({rule: "no-anchor-data-in-ext", message: `锚点信息不得塞进 ext 自由对象：${smuggled.join(", ")}`});
        }
    }

    return violations;
}

async function compileInterviewSystemPrompt(): Promise<string> {
    const prepared = await interviewProfile.prepare!({
        session: testSession({
            profileKey: "interview.new-book",
            currentProjectRoot: "interview-anchor-writeback",
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
    return prepared.systemPrompt ?? "";
}

describe("interview.new-book 落盘产出：访谈期锚点与来源规范", () => {
    describe("落盘产出走真实解析路径", () => {
        it("story-concept 的 index.md 能解析出 frontmatter 并通过内容节点 schema 校验", () => {
            const parsed = parseFrontmatterDocument(STORY_CONCEPT_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(parsed.hasFrontmatter).toBe(true);
            expect(parsed.metadata.type).toBe("note");
            expect(parsed.metadata.subtype).toBe("story-concept");
            expect(parsed.body).toContain("## 故事概述");
        });

        it("protagonist 的 index.md 能解析出 frontmatter 并通过内容节点 schema 校验", () => {
            const parsed = parseFrontmatterDocument(PROTAGONIST_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(parsed.hasFrontmatter).toBe(true);
            expect(parsed.metadata.type).toBe("character");
            expect(parsed.metadata.title).toBe("苏云");
            expect(parsed.body).toContain("## 人物档案");
        });

        it("两个访谈期条目都带 governance.source: interview 的来源标注", () => {
            const storyConcept = parseFrontmatterDocument(STORY_CONCEPT_INDEX_MD, WorkspaceContentFrontmatterSchema);
            const protagonist = parseFrontmatterDocument(PROTAGONIST_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(storyConcept.rawFrontmatter.governance).toEqual({source: "interview", review: "proposed"});
            expect(protagonist.rawFrontmatter.governance).toEqual({source: "interview", review: "proposed"});
        });

        it("protagonist 的 aliases 是非空字符串数组，story-concept 的 aliases 是显式空数组", () => {
            const storyConcept = parseFrontmatterDocument(STORY_CONCEPT_INDEX_MD, WorkspaceContentFrontmatterSchema);
            const protagonist = parseFrontmatterDocument(PROTAGONIST_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(storyConcept.metadata.aliases).toEqual([]);
            expect("aliases" in storyConcept.rawFrontmatter).toBe(true);
            expect(protagonist.metadata.aliases).toEqual(["云哥", "苏楼主", "断岳剑主"]);
        });

        it("两个条目的 anchors 都是显式留空的数组", () => {
            const storyConcept = parseFrontmatterDocument(STORY_CONCEPT_INDEX_MD, WorkspaceContentFrontmatterSchema);
            const protagonist = parseFrontmatterDocument(PROTAGONIST_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(storyConcept.metadata.anchors).toEqual([]);
            expect(protagonist.metadata.anchors).toEqual([]);
        });
    });

    describe("反例落盘产出必须被判不合格", () => {
        it("缺 governance.source 的条目过不了内容节点 schema 校验", () => {
            expect(() => parseFrontmatterDocument(MISSING_SOURCE_INDEX_MD, WorkspaceContentFrontmatterSchema))
                .toThrow(/source/u);
        });

        it("protagonist 缺 aliases 数组的条目过不了内容节点 schema 校验", () => {
            expect(() => parseFrontmatterDocument(MISSING_ALIASES_INDEX_MD, WorkspaceContentFrontmatterSchema))
                .toThrow(/aliases/u);
        });

        it("protagonist 的 aliases 留空数组会被访谈期落盘契约判不合格", () => {
            const parsed = parseFrontmatterDocument(EMPTY_ALIASES_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(parsed.metadata.aliases).toEqual([]);
            const violations = evaluateInterviewWritebackPromptContract(parsed.rawFrontmatter, {kind: "protagonist"});
            expect(violations.map((violation) => violation.rule)).toEqual(["protagonist-aliases-non-empty"]);
        });

        it("把锚点信息塞进 ext 自由对象会被访谈期落盘契约判不合格", () => {
            const violations = evaluateInterviewWritebackPromptContract(
                {
                    governance: {source: "interview", review: "proposed"},
                    aliases: ["云哥"],
                    ext: {anchor_info: "在第三章主角打妖怪的时候掉落的"},
                },
                {kind: "protagonist"},
            );

            expect(violations.map((violation) => violation.rule)).toEqual(["anchors-explicitly-empty", "no-anchor-data-in-ext"]);
        });

        it("合法样本在访谈期落盘契约下零违规", () => {
            const storyConcept = parseFrontmatterDocument(STORY_CONCEPT_INDEX_MD, WorkspaceContentFrontmatterSchema);
            const protagonist = parseFrontmatterDocument(PROTAGONIST_INDEX_MD, WorkspaceContentFrontmatterSchema);

            expect(evaluateInterviewWritebackPromptContract(storyConcept.rawFrontmatter, {kind: "story-concept"})).toEqual([]);
            expect(evaluateInterviewWritebackPromptContract(protagonist.rawFrontmatter, {kind: "protagonist"})).toEqual([]);
        });
    });

    describe("interview profile 落盘指令内联锚点规则", () => {
        it("编译后的 system prompt 内联了 governance.source / aliases / anchors 三条规则", async () => {
            const systemPrompt = await compileInterviewSystemPrompt();

            expect(systemPrompt).toContain("governance.source: interview 必须显式写出");
            expect(systemPrompt).toContain("aliases 必须显式写出");
            expect(systemPrompt).toContain("protagonist 必须填主角的常见称呼");
            expect(systemPrompt).toContain("anchors: [] 必须显式写出");
            expect(systemPrompt).toContain("绝不编造章节名或原文引用");
            expect(systemPrompt).toContain("正文产出后的沉淀才强制填写 chapter 与 quote");
        }, 60_000);

        it("落盘指令仍保留两个 index.md 与 PROJECT-STATUS.md 的归宿", async () => {
            const systemPrompt = await compileInterviewSystemPrompt();

            expect(systemPrompt).toContain("lorebook/note/story-concept/index.md");
            expect(systemPrompt).toContain("lorebook/character/protagonist/index.md");
            expect(systemPrompt).toContain("PROJECT-STATUS.md");
            expect(systemPrompt).toContain("## Pending Questions");
        }, 60_000);

        it("三条规则直接内联在 prompt 文本里，没有新增 HistorySet Import", async () => {
            const source = await readFile(INTERVIEW_PROFILE_SOURCE_PATH, "utf8");

            expect(source.match(/<Import\b/gu)?.length).toBe(2);
            expect(source).toContain("governance.source: interview 必须显式写出");
            expect(source).toContain("aliases 必须显式写出");
            expect(source).toContain("anchors: [] 必须显式写出");
        });
    });
});
