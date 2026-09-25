import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import enUS from "nbook/app/i18n/locales/en-US";
import zhCN from "nbook/app/i18n/locales/zh-CN";

const agentSurfacePath = fileURLToPath(new URL("./AgentChatSurface.vue", import.meta.url));
const agentSessionDialogPath = fileURLToPath(new URL("./AgentSessionDialog.vue", import.meta.url));

describe("卡文追问 profile 的前端显示映射", () => {
    it("新建菜单提供卡文追问入口，并配上显示名与图标", async () => {
        const surface = await readFile(agentSurfacePath, "utf8");

        expect(surface).toContain('{profileKey: "interview.stuck"');
        expect(surface).toContain('case "interview.stuck": return t("agent.profiles.interviewStuck");');
        expect(surface).toContain('case "interview.stuck": return "i-lucide-life-buoy";');
    });

    it("会话列表沿用同一套卡文追问显示名", async () => {
        const dialog = await readFile(agentSessionDialogPath, "utf8");

        expect(dialog).toContain('case "interview.stuck": return t("agent.profiles.interviewStuck");');
    });

    it("中文与英文目录的 profile 显示名一一对应，卡文追问两套都在", () => {
        expect(zhCN.agent.profiles.interviewStuck).toBe("卡文追问");
        expect(enUS.agent.profiles.interviewStuck).toBe("Stuck-Point Interview");
        expect(Object.keys(zhCN.agent.profiles).sort()).toEqual(Object.keys(enUS.agent.profiles).sort());
    });
});

describe("审这一章 profile 的前端显示映射", () => {
    it("新建菜单提供审稿入口，并配上显示名与图标", async () => {
        const surface = await readFile(agentSurfacePath, "utf8");

        expect(surface).toContain('{profileKey: "review.chapter"');
        expect(surface).toContain('case "review.chapter": return t("agent.profiles.reviewChapter");');
        expect(surface).toContain('case "review.chapter": return "i-lucide-search-check";');
    });

    it("会话列表沿用同一套审稿显示名", async () => {
        const dialog = await readFile(agentSessionDialogPath, "utf8");

        expect(dialog).toContain('case "review.chapter": return t("agent.profiles.reviewChapter");');
    });

    it("中文与英文目录都带审稿显示名，且两边键集合一致", () => {
        expect(zhCN.agent.profiles.reviewChapter).toBe("审这一章");
        expect(enUS.agent.profiles.reviewChapter).toBe("Review This Chapter");
        expect(Object.keys(zhCN.agent.profiles).sort()).toEqual(Object.keys(enUS.agent.profiles).sort());
    });
});
