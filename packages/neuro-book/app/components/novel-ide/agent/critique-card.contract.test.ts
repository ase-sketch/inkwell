import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import zhCN from "nbook/app/i18n/locales/zh-CN";
import enUS from "nbook/app/i18n/locales/en-US";

/**
 * 质疑卡的接线契约（M3-T-C1）。
 *
 * 这里只钉三件在仓内跑不出运行时断言的事：卡片挂在主聊天流哪一层、
 * 证据跳转走的是哪条既有通道、以及 i18n 中英是否成对。
 * 卡片自身的逻辑不在这里测——那些归 critique-card.test.ts。
 */

const registryPath = fileURLToPath(new URL("./tool-render-registry.ts", import.meta.url));
const toolBubblePath = fileURLToPath(new URL("./AgentToolBubble.vue", import.meta.url));
const cardPath = fileURLToPath(new URL("./CritiqueCard.vue", import.meta.url));

describe("质疑卡挂载契约", () => {
    it("submit_critiques 走主聊天流按工具名特化渲染，常驻可见并带上会话身份", async () => {
        const registry = await readFile(registryPath, "utf8");
        expect(registry).toContain("import { SUBMIT_CRITIQUES_TOOL } from \"nbook/shared/chapter-critique\";");
        expect(registry).toContain("import CritiqueCard from \"nbook/app/components/novel-ide/agent/CritiqueCard.vue\";");
        expect(registry).toContain("[SUBMIT_CRITIQUES_TOOL]: {");
        // message 模式：卡片常驻可见、自带折叠，逐条处置不藏在折叠头后面。
        expect(registry).toContain('mode: "message",');
        expect(registry).toContain("component: markRaw(CritiqueCard),");

        // 会话身份由 AgentToolBubble 传给 message 模式的卡片（处置状态按会话分区）。
        const bubble = await readFile(toolBubblePath, "utf8");
        expect(bubble).toContain(':is="renderConfig.component" :tool-call="props.toolCall" :session-id="props.sessionId"');
    });

    it("证据跳转复用既有通道：先定位章节正文，再派发行跳转事件", async () => {
        const card = await readFile(cardPath, "utf8");
        expect(card).toContain("resolveCritiqueChapterNode(ideStore.workspaceTree, chapter)");
        expect(card).toContain("dispatchEditorJumpToLine(target.line)");
        expect(card).toContain("critiqueChapterBody(ideStore.selectedFileContent ?? \"\")");
        // 处置状态只落本机存储，不写项目文件。
        expect(card).toContain("readCritiqueOutcomes(window.localStorage, storageKey.value)");
        expect(card).toContain("writeCritiqueOutcomes(window.localStorage, storageKey.value, next)");
        expect(card).not.toContain("saveCurrentFile");
    });

    it("三个处置动作齐备，且都是登记式按钮而不是写盘动作", async () => {
        const card = await readFile(cardPath, "utf8");
        expect(card).toContain('{disposition: "accepted", icon: "i-lucide-check"}');
        expect(card).toContain('{disposition: "rejected", icon: "i-lucide-x"}');
        expect(card).toContain('{disposition: "noted", icon: "i-lucide-bookmark"}');
    });
});

describe("质疑卡 i18n 契约", () => {
    const flatten = (value: unknown, prefix = ""): string[] => {
        if (!value || typeof value !== "object") {
            return [prefix];
        }
        return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
    };

    it("ide.critique 中英成对，三轴与处置口径与契约一致", () => {
        const zhCritique = (zhCN as {ide: {critique: Record<string, unknown>}}).ide.critique;
        const enCritique = (enUS as {ide: {critique: Record<string, unknown>}}).ide.critique;
        const zhKeys = flatten(zhCritique).sort();
        const enKeys = flatten(enCritique).sort();
        expect(zhKeys).toEqual(enKeys);
        expect(zhKeys.length).toBeGreaterThan(0);

        // M3 中文口径：动机 / 伏笔 / AI 味；认可 / 驳回 / 记下。
        const zhCategory = zhCritique.category as Record<string, string>;
        expect(zhCategory).toMatchObject({motivation: "动机", foreshadowing: "伏笔", "ai-flavor": "AI 味"});
        const zhDisposition = zhCritique.disposition as Record<string, string>;
        expect(zhDisposition).toMatchObject({accepted: "认可", rejected: "驳回", noted: "记下"});

        const enDisposition = enCritique.disposition as Record<string, string>;
        expect(Object.keys(enDisposition).sort()).toEqual(["accepted", "noted", "rejected"]);
    });

    it("卡面文案面向作者，不出现工程术语", () => {
        const card = (zhCN as {ide: {critique: {card: Record<string, string>}}}).ide.critique.card;
        const text = Object.values(card).join(" ");
        for (const jargon of ["tool", "Tool", "schema", "profile", "Agent", "字段", "接口"]) {
            expect(text).not.toContain(jargon);
        }
        expect(card.title).toBeDefined();
        expect(card.jumpToQuote).toBeDefined();
    });
});
