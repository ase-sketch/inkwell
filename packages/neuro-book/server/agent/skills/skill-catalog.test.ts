import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {randomUUID} from "node:crypto";
import {mkdir, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {consola} from "consola";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {SkillCatalog} from "nbook/server/agent/skills/skill-catalog";

describe("SkillCatalog", () => {
    let root: string;
    let installRoot: string;
    let projectRoot: string;

    beforeEach(async () => {
        root = testHostPath("agent-skill-catalog-test", randomUUID());
        installRoot = join(root, "state", "workspace", ".nbook", "agent", "skills");
        projectRoot = join(root, "workspace", "project");
    });

    afterEach(async () => {
        await rm(root, {recursive: true, force: true});
    });

    it("只扫描 .nbook skill root，并读取 frontmatter", async () => {
        await writeSkill(installRoot, "writer", `---
name: Writer Skill
description: Write prose.
when_to_use:
  - 用户需要写正文时
  - 用户显式提到写作 skill 时
---
# Body
`);
        await writePackage(installRoot, "writer", "1.2.3");
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.get("writer")).resolves.toEqual(expect.objectContaining({
            key: "writer",
            name: "Writer Skill",
            description: "Write prose.",
            whenToUse: "用户需要写正文时；用户显式提到写作 skill 时",
            version: "1.2.3",
            source: "install",
        }));
    });

    it("当前 Project 同名 skill 目录整体覆盖 Install Skill", async () => {
        const userRoot = join(projectRoot, ".nbook", "agent", "skills");
        await writeSkill(installRoot, "writer", `---
name: System Writer
---
`);
        await writeSkill(userRoot, "writer", `---
name: User Writer
---
`);
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.list(projectRoot)).resolves.toEqual([
            expect.objectContaining({
                key: "writer",
                name: "User Writer",
                source: "project",
            }),
        ]);
    });

    it("缺少 SKILL.md 的目录不可见", async () => {
        await mkdir(join(installRoot, "empty"), {recursive: true});
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.get("empty")).resolves.toBeNull();
    });

    it("runnable Skill 拒绝非 SemVer package 版本", async () => {
        await writeSkill(installRoot, "broken", `---
name: Broken Skill
description: Broken version fixture.
---
`);
        await writePackage(installRoot, "broken", "latest");
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.list()).rejects.toThrow("package.json.version 必须是 SemVer");
    });

    it("无效 Project Skill 只隔离自身并继续遮蔽同名 Install Skill", async () => {
        const userRoot = join(projectRoot, ".nbook", "agent", "skills");
        await writeSkill(installRoot, "writer", `---
name: System Writer
---
`);
        await writePackage(installRoot, "writer", "1.0.0");
        await writeSkill(installRoot, "editor", `---
name: System Editor
---
`);
        await writeSkill(userRoot, "writer", `---
name: Broken Project Writer
---
`);
        await writePackage(userRoot, "writer", "latest");
        const warn = vi.spyOn(consola, "warn").mockImplementation(() => undefined);
        const catalog = new SkillCatalog(installRoot);

        try {
            await expect(catalog.list(projectRoot)).resolves.toEqual([
                expect.objectContaining({key: "editor", source: "install"}),
            ]);
            expect(warn).toHaveBeenCalledWith(
                expect.objectContaining({skillKey: "writer", rootPath: join(userRoot, "writer")}),
                "Project Skill package 无效，已隔离该 Skill",
            );
        } finally {
            warn.mockRestore();
        }
    });

    it("硬切下线的 legacy skill key 不再进入 catalog", async () => {
        const userRoot = join(projectRoot, ".nbook", "agent", "skills");
        await writeSkill(installRoot, "anti-ai-slop", `---
name: anti-ai-slop
---
`);
        await writeSkill(userRoot, "anti-ai-slop", `---
name: project anti-ai-slop
---
`);
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.get("anti-ai-slop", projectRoot)).resolves.toBeNull();
    });

    it("Install catalog 读取 runnable package 版本", async () => {
        await writeSkill(installRoot, "novel-data", `---
name: novel-data
---
`);
        await writePackage(installRoot, "novel-data", "1.0.0");
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.get("novel-data")).resolves.toEqual(expect.objectContaining({
            key: "novel-data",
            name: "novel-data",
            version: "1.0.0",
            source: "install",
        }));
    });

    it("Install catalog 包含已安装 skills", async () => {
        await writeSkill(installRoot, "profile-system-guide", `---
name: Profile System Guide
description: harness guide
---
`);
        await writeSkill(installRoot, "novel-writing", `---
name: novel-writing
---
`);
        await writePackage(installRoot, "novel-writing", "1.0.0");
        const catalog = new SkillCatalog(installRoot);

        const skills = await catalog.list();
        expect(skills.map((skill) => skill.key)).toEqual(["novel-writing", "profile-system-guide"]);
        expect(skills.find((item) => item.key === "profile-system-guide")).toEqual(expect.objectContaining({
            source: "install",
            skillPath: join(installRoot, "profile-system-guide", "SKILL.md"),
            description: "harness guide",
        }));
    });

    it("作者级 .nbook/skills 优先扫描并遮蔽 Install Skill", async () => {
        const authorRoot = join(projectRoot, ".nbook", "skills");
        await writeSkill(installRoot, "writer", `---\nname: System Writer\n---\n`);
        await writeSkill(authorRoot, "writer", `---\nname: Author Writer\n---\n`);
        const catalog = new SkillCatalog(installRoot);

        await expect(catalog.list(projectRoot)).resolves.toEqual([
            expect.objectContaining({
                key: "writer",
                name: "Author Writer",
                source: "project",
                skillPath: join(authorRoot, "writer", "SKILL.md"),
            }),
        ]);
    });

    it("三级遮蔽优先级：.nbook/skills > .nbook/agent/skills > install", async () => {
        const authorRoot = join(projectRoot, ".nbook", "skills");
        const agentRoot = join(projectRoot, ".nbook", "agent", "skills");

        // skill1: 同时存在于三层，author 胜出
        await writeSkill(installRoot, "skill1", "---\nname: Install 1\n---\n");
        await writeSkill(agentRoot, "skill1", "---\nname: Agent 1\n---\n");
        await writeSkill(authorRoot, "skill1", "---\nname: Author 1\n---\n");

        // skill2: 存在于 agent 和 install，agent 胜出
        await writeSkill(installRoot, "skill2", "---\nname: Install 2\n---\n");
        await writeSkill(agentRoot, "skill2", "---\nname: Agent 2\n---\n");

        // skill3: 仅存在于 author
        await writeSkill(authorRoot, "skill3", "---\nname: Author 3\n---\n");

        // skill4: 仅存在于 install
        await writeSkill(installRoot, "skill4", "---\nname: Install 4\n---\n");

        const catalog = new SkillCatalog(installRoot);
        const result = await catalog.list(projectRoot);

        expect(result).toEqual([
            expect.objectContaining({key: "skill1", name: "Author 1", source: "project"}),
            expect.objectContaining({key: "skill2", name: "Agent 2", source: "project"}),
            expect.objectContaining({key: "skill3", name: "Author 3", source: "project"}),
            expect.objectContaining({key: "skill4", name: "Install 4", source: "install"}),
        ]);
    });

    it("作者级 .nbook/skills 损坏时隔离自身并继续遮蔽同名下层 skill", async () => {
        const authorRoot = join(projectRoot, ".nbook", "skills");
        const agentRoot = join(projectRoot, ".nbook", "agent", "skills");

        await writeSkill(installRoot, "writer", "---\nname: System Writer\n---\n");
        await writePackage(installRoot, "writer", "1.0.0");
        await writeSkill(agentRoot, "writer", "---\nname: Agent Writer\n---\n");
        await writePackage(agentRoot, "writer", "1.0.0");
        await writeSkill(authorRoot, "writer", "---\nname: Broken Author Writer\n---\n");
        await writePackage(authorRoot, "writer", "invalid-version");

        const warn = vi.spyOn(consola, "warn").mockImplementation(() => undefined);
        const catalog = new SkillCatalog(installRoot);

        try {
            await expect(catalog.list(projectRoot)).resolves.toEqual([]);
            expect(warn).toHaveBeenCalledWith(
                expect.objectContaining({skillKey: "writer", rootPath: join(authorRoot, "writer")}),
                "Project Skill package 无效，已隔离该 Skill",
            );
        } finally {
            warn.mockRestore();
        }
    });
});

async function writeSkill(root: string, key: string, source: string): Promise<void> {
    await mkdir(join(root, key), {recursive: true});
    await writeFile(join(root, key, "SKILL.md"), source, "utf8");
}

async function writePackage(root: string, key: string, version: string): Promise<void> {
    await writeFile(join(root, key, "package.json"), JSON.stringify({name: key, version}), "utf8");
}
