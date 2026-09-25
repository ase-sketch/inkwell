import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {testHostPath} from "@notnotype/neuro-book-test-support/test-path";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import type {ProfileToolExecutionContext} from "nbook/profile-sdk/contracts";
import {llmlintCheckTool} from "../../../assets/workspace/.nbook/agent/profiles/builtin/review.chapter.profile";
import {absoluteFsPath} from "nbook/server/runtime/paths/file-path";
import {
    LLMLINT_CHECK_REVIEWS,
    normalizeLlmlintReview,
    resolveBunExecutable,
    resolveLlmlintBinPath,
    resolveLlmlintTargetPath,
} from "nbook/server/agent/profiles/review-chapter-llmlint";

/**
 * 一章带典型 AI 味的夹具正文：机械列举过渡 + 虚指量词。
 * 具体命中由 llmlint 规则库决定，断言只认「有命中且字段齐」。
 */
const FIXTURE_CHAPTER = [
    "# 第一章 破晓",
    "",
    "晨光微熹，少年推开了老旧的柴门。他深吸一口气，心中五味杂陈。",
    "",
    "首先，他需要弄清楚自己身处何方；其次，他要找到回去的路；最后，他必须活下去。",
    "",
    "这一切，都像是一场无法醒来的梦。他的心中，涌起一股难以言喻的情绪。",
    "",
].join("\n");

describe("llmlint_check 窄工具", () => {
    let tempRoot: string;
    let projectDir: string;
    let manuscriptDir: string;

    beforeEach(async () => {
        tempRoot = await mkdtemp(testHostPath("review-chapter-llmlint-"));
        projectDir = join(tempRoot, "novel");
        manuscriptDir = join(projectDir, "manuscript");
        await mkdir(manuscriptDir, {recursive: true});
        await writeFile(join(manuscriptDir, "chapter-01.md"), FIXTURE_CHAPTER, "utf8");
    });

    afterEach(async () => {
        await rm(tempRoot, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
    });

    function mockToolContext(): ProfileToolExecutionContext {
        return {
            sessionId: 202,
            profileKey: "review.chapter",
            workspaceRoot: absoluteFsPath(tempRoot),
            currentProject: {
                workspace: {
                    root: projectDir,
                    ref: {projectRoot: "novel"},
                },
                generation: 1,
            } as never,
        };
    }

    it("真跑一章夹具：返回结构化摘要、命中条目与规则元数据，且不写盘", async () => {
        const chapterPath = join(manuscriptDir, "chapter-01.md");
        const contentBefore = await readFile(chapterPath, "utf8");

        const result = await llmlintCheckTool.executeWithContext!(
            mockToolContext(),
            "call-llmlint-1",
            {targetPath: "manuscript/chapter-01.md", review: "all"},
        );

        const block = result.content[0];
        expect(block?.type).toBe("text");
        const text = block && block.type === "text" ? block.text : "";
        expect(text).toContain("LLMLINT_CHECK_RESULT");
        expect(text).toContain("目标文件：manuscript/chapter-01.md");

        const details = result.details as {
            summary: {total: number; high: number; medium: number; low: number};
            issues: Array<{ruleId: string; line: number; column: number; match: string; context: {before: string; current: string; after: string}}>;
            rulesMeta: Array<{ruleId: string; title?: string; level?: string}>;
            review: string;
        };

        expect(details.review).toBe("all");
        expect(details.summary.total).toBeGreaterThan(0);
        expect(details.summary.total).toBe(details.summary.high + details.summary.medium + details.summary.low);
        expect(details.issues.length).toBe(details.summary.total);

        for (const issue of details.issues) {
            expect(typeof issue.ruleId).toBe("string");
            expect(issue.ruleId.length).toBeGreaterThan(0);
            expect(Number.isInteger(issue.line)).toBe(true);
            expect(issue.line).toBeGreaterThan(0);
            expect(Number.isInteger(issue.column)).toBe(true);
            expect(typeof issue.match).toBe("string");
            expect(issue.match.length).toBeGreaterThan(0);
            expect(typeof issue.context.before).toBe("string");
            expect(typeof issue.context.current).toBe("string");
            expect(typeof issue.context.after).toBe("string");
            // 命中片段必须真的出现在夹具正文里，且上下文字段与它拼得上。
            expect(contentBefore).toContain(issue.match);
            expect(`${issue.context.before}${issue.context.current}${issue.context.after}`).toContain(issue.context.current);
        }

        // 规则元数据只覆盖被引用的规则，且每条都有出处。
        const referenced = [...new Set(details.issues.map((issue) => issue.ruleId))].sort();
        expect(details.rulesMeta.map((meta) => meta.ruleId)).toEqual(referenced);
        expect(details.rulesMeta.length).toBeLessThanOrEqual(referenced.length);
        for (const meta of details.rulesMeta) {
            expect(typeof meta.title).toBe("string");
            expect(["high", "medium", "low"]).toContain(meta.level);
        }

        // 窄工具只读：夹具文件内容一字未动。
        expect(await readFile(chapterPath, "utf8")).toBe(contentBefore);
    }, 120_000);

    it("没命中的正文照样正常返回 0 条，而不是报错", async () => {
        await writeFile(join(manuscriptDir, "clean.md"), "他推门进来，把伞靠在墙角。", "utf8");

        const result = await llmlintCheckTool.executeWithContext!(
            mockToolContext(),
            "call-llmlint-clean",
            {targetPath: "manuscript/clean.md"},
        );

        const details = result.details as {summary: {total: number}; issues: unknown[]; rulesMeta: unknown[]};
        expect(details.summary.total).toBe(0);
        expect(details.issues).toEqual([]);
        expect(details.rulesMeta).toEqual([]);
        const text = result.content[0]?.type === "text" ? result.content[0].text : "";
        expect(text).toContain("没有静态规则命中");
    }, 120_000);

    it("拒绝目标路径越界：.. 与目录外绝对路径都进不来", async () => {
        await expect(llmlintCheckTool.executeWithContext!(
            mockTestContext(),
            "call-llmlint-escape",
            {targetPath: "../outside.md"},
        )).rejects.toThrow(/拒绝检查作品目录以外的文件/);

        await expect(llmlintCheckTool.executeWithContext!(
            mockTestContext(),
            "call-llmlint-absolute",
            {targetPath: join(tempRoot, "elsewhere.md")},
        )).rejects.toThrow(/拒绝检查作品目录以外的文件/);
    }, 60_000);

    it("拒绝非正文扩展名与不认识的受众", async () => {
        await writeFile(join(projectDir, "notes.json"), "{}", "utf8");

        await expect(llmlintCheckTool.executeWithContext!(
            mockToolContext(),
            "call-llmlint-ext",
            {targetPath: "notes.json"},
        )).rejects.toThrow(/只接受 .md \/ .markdown \/ .txt 目标/);

        await expect(llmlintCheckTool.executeWithContext!(
            mockToolContext(),
            "call-llmlint-review",
            {targetPath: "manuscript/chapter-01.md", review: "detect"},
        )).rejects.toThrow(/不认识的审查受众/);
    }, 60_000);

    it("参数注入面关闭：目标路径里塞参数、换行、引号都进不去", async () => {
        const injections = [
            "manuscript/chapter-01.md --write",
            'manuscript/chapter-01.md" --rule-detail',
            "manuscript/chapter-01.md\n--format stylish",
            "manuscript/chapter-01.md; detonate",
            "manuscript/chapter-01.md && whoami",
        ];

        for (const targetPath of injections) {
            await expect(llmlintCheckTool.executeWithContext!(
                mockToolContext(),
                "call-inject",
                {targetPath},
            )).rejects.toThrow(/只接受 .md \/ .markdown \/ .txt 目标|拒绝检查作品目录以外的文件/);
        }

        // 受众是白名单枚举，塞不进额外命令。
        await expect(llmlintCheckTool.executeWithContext!(
            mockToolContext(),
            "call-inject-review",
            {targetPath: "manuscript/chapter-01.md", review: "agent --write"},
        )).rejects.toThrow(/不认识的审查受众/);
    }, 60_000);

    it("命令面窄化：不暴露 detect / fix / config，也不接受调用方拼接参数", async () => {
        const source = await readFile(
            new URL("../../../assets/workspace/.nbook/agent/profiles/builtin/review.chapter.profile.tsx", import.meta.url),
            "utf8",
        );

        // 参数由 profile 内部拼装，调用方只能给目标与受众两个字段。
        expect(source).toContain('"--format", "json", "check"');
        expect(source).toContain('"--review"');
        expect(source).not.toContain('"detect"');
        expect(source).not.toContain('"fix"');
        expect(source).not.toContain('"config"');
        // 不用 shell：spawn 直连可执行文件，参数以数组传递。
        expect(source).toContain("spawn(executable, args");
        expect(source).not.toContain("execSync");
        expect(source).not.toContain("shell: true");
    });

    function mockTestContext(): ProfileToolExecutionContext {
        return {
            sessionId: 203,
            profileKey: "review.chapter",
            workspaceRoot: absoluteFsPath(tempRoot),
            currentProject: {
                workspace: {root: projectDir, ref: {projectRoot: "novel"}},
                generation: 1,
            } as never,
        };
    }
});

describe("llmlint_check 的路径与命令解析", () => {
    it("review 白名单只认 agent / human / all，且默认 agent", () => {
        expect(LLMLINT_CHECK_REVIEWS).toEqual(["agent", "human", "all"]);
        expect(normalizeLlmlintReview(undefined)).toBe("agent");
        expect(normalizeLlmlintReview("human")).toBe("human");
        expect(() => normalizeLlmlintReview("none")).toThrow(/不认识的审查受众/);
    });

    it("定位到真实存在的 llmlint 命令入口，且解析出的 Bun 可执行文件可用", () => {
        const binPath = resolveLlmlintBinPath();

        expect(binPath.endsWith(join("skill", "bin", "llmlint.ts"))).toBe(true);
        expect(resolveBunExecutable().length).toBeGreaterThan(0);
    });

    it("目标解析在根外一律拒绝，根内正常返回绝对路径", async () => {
        const tempRoot = await mkdtemp(testHostPath("review-chapter-path-"));
        try {
            await mkdir(join(tempRoot, "manuscript"), {recursive: true});
            await writeFile(join(tempRoot, "manuscript", "chapter-01.md"), "# 第一章", "utf8");

            const inside = await resolveLlmlintTargetPath(absoluteFsPath(tempRoot), "manuscript/chapter-01.md");
            expect(inside.replaceAll("\\", "/")).toContain("/manuscript/chapter-01.md");

            await expect(resolveLlmlintTargetPath(absoluteFsPath(tempRoot), "../escape.md"))
                .rejects.toThrow(/路径越过文件系统根/);
        } finally {
            await rm(tempRoot, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
        }
    });
});
