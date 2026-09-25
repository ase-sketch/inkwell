import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import {beforeAll, describe, expect, it} from "vitest";
import {SkillCatalog} from "nbook/server/agent/skills/skill-catalog";

const TEST_REPOSITORY_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
process.env.NEURO_BOOK_REPOSITORY_ROOT ??= TEST_REPOSITORY_ROOT;

const ASSETS_AGENT_ROOT = resolve("assets", "workspace", ".nbook", "agent");
const RESEARCH_SKILL_PATH = resolve(ASSETS_AGENT_ROOT, "skills", "research", "SKILL.md");

/** 研究笔记的完整笔记落点（低置信区）与毕业落点（设定库摘要条目）。 */
const REFERENCE_NOTE_DIRECTORY = "reference/research/";
const LOREBOOK_GRADUATION_DIRECTORY = "lorebook/note/research/";

/** M4 拍板选定的治理来源值：外部来源导入，毕业不改变内容来源（见 reference/content/lorebook-anchors.md）。 */
const GRADUATION_GOVERNANCE_SOURCE = "source: imported";

/** 禁止出现的「往正文目录写东西」措辞：研究笔记一律不进 manuscript/。 */
const FORBIDDEN_MANUSCRIPT_WRITE_PATTERNS = [
    /写(入|到|进)\s*manuscript/u,
    /manuscript\/[^\s`]*\.md/u,
] as const;

describe("research 公开资料研究技能包载荷", () => {
    let body = "";

    beforeAll(async () => {
        body = await readFile(RESEARCH_SKILL_PATH, "utf8");
    });

    it("SkillCatalog 用目录名作 key，并解析出 name / description / when_to_use", async () => {
        const catalog = new SkillCatalog(resolve(ASSETS_AGENT_ROOT, "skills"));
        const skill = await catalog.get("research");

        expect(skill).toMatchObject({
            key: "research",
            name: "research",
            source: "install",
        });
        expect(skill?.description).toContain("reference/research/");
        expect(skill?.whenToUse).toContain("查一下");
        expect(skill?.skillPath).toBe(RESEARCH_SKILL_PATH);
        // 非 runnable skill：不带 package.json，因此没有版本号。
        expect(skill?.version).toBeUndefined();
    });

    it("frontmatter 合法：name 与目录名一致，description 非空且说清触发场景", async () => {
        const frontmatter = body.match(/^---\r?\n([\s\S]*?)\r?\n---/u)?.[1];

        expect(frontmatter).toBeTruthy();
        expect(frontmatter).toMatch(/^name:\s*research\s*$/mu);
        expect(frontmatter).toMatch(/^description:\s*\S+/mu);
        expect(frontmatter).toMatch(/^when_to_use:\s*$/mu);
        expect(frontmatter).toMatch(/^\s+-\s+\S+/mu);
        // 技能正文只做文字引用，不做插值。
        expect(body).not.toContain("${");
    });

    it("编排纪律：主创经 invoke_agent 调 researcher，落笔由主创自己做", async () => {
        expect(body).toContain("invoke_agent");
        expect(body).toContain("researcher");
        expect(body).toContain("web_search");
        expect(body).toContain("researcher 没有文件工具");
        // 不重复造 researcher 已有的任务分流纪律，只做指针。
        expect(body).toContain("## 什么不算调研");
        expect(body).toContain("分流纪律");
    });

    it("来源纪律：至少 3 个公开来源 + 来源 URL 清单 + 单来源引文 ≤125 字符", async () => {
        expect(body).toContain("至少 3 个公开来源");
        expect(body).toContain("来源清单");
        expect(body).toContain("[页面标题](https://example.com/page)");
        expect(body).toContain("125 个字符");
        expect(body).toContain("不要编造 URL");
    });

    it("红线写死：查询词不带正文原文与未公开设定细节", async () => {
        expect(body).toContain("不得携带正文原文");
        expect(body).toContain("未公开的设定细节");
        expect(body).toContain("题材级关键词");
        // 抓回来的外部内容按不可信数据处理。
        expect(body).toContain("不可信的数据");
    });

    it("落盘：完整笔记进 reference/research/，低置信且不进自动检索", async () => {
        expect(body).toContain(REFERENCE_NOTE_DIRECTORY);
        expect(body).toContain("reference/index.md");
        expect(body).toContain("content-node-templates/note/");
        expect(body).toContain("retrieval:");
        expect(body).toContain("enabled: false");
        expect(body).toContain("status: draft");
    });

    it("毕业：经作者确认后写 lorebook/note/research/ 摘要条目，governance.source 取既有合法值", async () => {
        expect(body).toContain(LOREBOOK_GRADUATION_DIRECTORY);
        expect(body).toContain("经作者确认后");
        expect(body).toContain(GRADUATION_GOVERNANCE_SOURCE);
        // 毕业只改 review / status，不把内容来源改写成 interview / generated。
        expect(body).toContain("review: reviewed");
        expect(body).toContain("status: active");
        // 检索命中靠 title + aliases，必须穷举主题常见说法。
        expect(body).toContain("aliases");
        expect(body).toContain("常见说法");
    });

    it("不含任何往 manuscript/ 写文件的指引", async () => {
        expect(body).toContain("manuscript/");
        for (const pattern of FORBIDDEN_MANUSCRIPT_WRITE_PATTERNS) {
            expect(body).not.toMatch(pattern);
        }
    });
});
