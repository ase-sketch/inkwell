import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import zhCN from "nbook/app/i18n/locales/zh-CN";
import enUS from "nbook/app/i18n/locales/en-US";

/**
 * 设定卡确认卡的接线契约（M6-T-B）。
 *
 * 这里只钉三件在仓内跑不出运行时断言的事：卡片挂在主聊天流哪一层、确认动作走的是
 * 哪条既有通道、以及 i18n 中英是否成对。卡片自身的逻辑不在这里测——那些归
 * lorebook-draft-card.test.ts。
 */

const registryPath = fileURLToPath(new URL("./tool-render-registry.ts", import.meta.url));
const toolBubblePath = fileURLToPath(new URL("./AgentToolBubble.vue", import.meta.url));
const surfacePath = fileURLToPath(new URL("./AgentChatSurface.vue", import.meta.url));
const cardPath = fileURLToPath(new URL("./LorebookDraftCard.vue", import.meta.url));
const logicPath = fileURLToPath(new URL("./lorebook-draft-card.ts", import.meta.url));

describe("设定卡挂载契约", () => {
    it("submit_lorebook_draft 走主聊天流按工具名特化渲染，常驻可见并带上会话身份", async () => {
        const registry = await readFile(registryPath, "utf8");
        expect(registry).toContain("import { SUBMIT_LOREBOOK_DRAFT_TOOL } from \"nbook/shared/lorebook-draft\";");
        expect(registry).toContain("import LorebookDraftCard from \"nbook/app/components/novel-ide/agent/LorebookDraftCard.vue\";");
        expect(registry).toContain("[SUBMIT_LOREBOOK_DRAFT_TOOL]: {");
        // message 模式：卡常驻可见、自带折叠，字段编辑与确认不藏在折叠头后面。
        expect(registry).toContain('mode: "message",');
        expect(registry).toContain("component: markRaw(LorebookDraftCard),");
        expect(registry).toContain('collapsedPreviewKey: "ide.lorebookDraft.card.title",');

        // 会话身份由 AgentToolBubble 传给 message 模式的卡片（卡片状态按会话分区）。
        const bubble = await readFile(toolBubblePath, "utf8");
        expect(bubble).toContain(':is="renderConfig.component" :tool-call="props.toolCall" :session-id="props.sessionId"');
    });

    it("确认动作走既有发送通道：宿主 provide，卡片 inject 后发消息进当前会话", async () => {
        const surface = await readFile(surfacePath, "utf8");
        expect(surface).toContain("import {AGENT_SESSION_MESSAGE_CONTEXT_KEY} from \"nbook/app/components/novel-ide/agent/agent-session-message-context\";");
        expect(surface).toContain("provide(AGENT_SESSION_MESSAGE_CONTEXT_KEY, {");
        expect(surface).toContain("sendMessage: sendSessionMessageFromCard,");
        // 复用作者手打那条路径：设置输入内容后走同一个 send()，不另造 HTTP 调用。
        expect(surface).toContain("inputText.value = message;");
        expect(surface).toContain("await send();");

        const card = await readFile(cardPath, "utf8");
        expect(card).toContain("inject(AGENT_SESSION_MESSAGE_CONTEXT_KEY, null)");
        expect(card).toContain("await sessionMessage.sendMessage(outcome.message);");
    });

    it("两个动作齐备，且都是登记式按钮而不是写盘动作", async () => {
        const card = await readFile(cardPath, "utf8");
        expect(card).toContain('@click="confirmDraft"');
        expect(card).toContain('@click="cancelDraft"');
        expect(card).toContain("applyLorebookCardAction({action: \"confirm\", status: status.value, fields: fields.value})");
        expect(card).toContain("applyLorebookCardAction({action: \"cancel\", status: status.value, fields: fields.value})");

        // 卡片与确认链路本身绝不写文件：没有文件保存/写接口，只有构造消息。
        expect(card).not.toContain("saveCurrentFile");
        expect(card).not.toContain("agentApi");
        expect(card).not.toContain("workspaceFile");
    });

    it("确认失败留在待确认：只有发出去之后才落状态", async () => {
        const card = await readFile(cardPath, "utf8");
        const sendIndex = card.indexOf("await sessionMessage.sendMessage(outcome.message);");
        const persistIndex = card.indexOf("status.value = outcome.status;");

        expect(sendIndex).toBeGreaterThan(0);
        expect(persistIndex).toBeGreaterThan(sendIndex);
        // 发送抛错时先返回（catch 分支），不落到已确认。
        expect(card.slice(sendIndex, persistIndex)).toContain("return;");
    });

    it("卡片状态只落本机浏览器存储，确认消息由卡上当前值现算", async () => {
        const card = await readFile(cardPath, "utf8");
        expect(card).toContain("readLorebookCardState(window.localStorage, storageKey.value)");
        expect(card).toContain("writeLorebookCardState(window.localStorage, storageKey.value, next)");

        const logic = await readFile(logicPath, "utf8");
        // 确认消息从卡上字段算，不复读工具参数原文——作者改过的值必须生效。
        expect(logic).toContain("export function buildLorebookConfirmMessage(fields: LorebookDraftFields): string {");
        expect(logic).not.toContain("argsText");
        expect(logic).not.toContain("node:fs");
    });
});

describe("草稿穿公开投影之后卡片仍解析得出来", () => {
    it("按契约上限取满的草稿经投影重建后仍是同一张卡（否则卡片会静默变空壳）", async () => {
        // M3 的教训：自定义工具的参数走 generic 有界预览（256 节点 / 24 KiB），
        // 超预算的字段会被投影成 unsupported，前端解析不出草稿、卡片静默不渲染。
        const shared = await import("nbook/shared/lorebook-draft");
        const {createPublicProjectionBudget, projectPublicToolArgs} = await import("nbook/server/agent/events/public-tool-projection");
        const {PUBLIC_TOOL_ARGS_TEXT_BYTES} = await import("nbook/server/agent/events/public-event-policy");
        const {publicToolArgsJsonValue} = await import("nbook/app/components/novel-ide/agent/agent-message");
        const {parseLorebookDraftInput} = await import("nbook/app/components/novel-ide/agent/lorebook-draft-card");

        const worst = {
            title: "字".repeat(shared.MAX_LOREBOOK_DRAFT_TITLE_LENGTH),
            category: "character",
            aliases: Array.from({length: shared.MAX_LOREBOOK_DRAFT_ALIASES}, () => "字".repeat(shared.MAX_LOREBOOK_DRAFT_ALIAS_LENGTH)),
            summary: "字".repeat(shared.MAX_LOREBOOK_DRAFT_SUMMARY_LENGTH),
            body: "字".repeat(shared.MAX_LOREBOOK_DRAFT_BODY_LENGTH),
            sourceExcerpt: "字".repeat(shared.MAX_LOREBOOK_DRAFT_SOURCE_EXCERPT_LENGTH),
            suggestedSlug: "a".repeat(shared.MAX_LOREBOOK_DRAFT_SLUG_LENGTH),
        };
        expect(shared.LorebookDraftInputSchema.safeParse(worst).success).toBe(true);

        // 前端拿到的是投影重建出来的参数文本（runtime 是原始 args，durable 历史走这条路）。
        const projected = projectPublicToolArgs("submit_lorebook_draft", worst, createPublicProjectionBudget(PUBLIC_TOOL_ARGS_TEXT_BYTES));
        const rebuilt = JSON.stringify(publicToolArgsJsonValue(projected));
        const parsed = parseLorebookDraftInput(rebuilt);

        expect(parsed).not.toBeNull();
        expect(parsed?.title).toBe(worst.title);
        expect(parsed?.category).toBe("character");
        expect(parsed?.aliases).toEqual(worst.aliases);
        expect(parsed?.summary).toBe(worst.summary);
        expect(parsed?.body).toBe(worst.body);
        expect(parsed?.sourceExcerpt).toBe(worst.sourceExcerpt);
        expect(parsed?.suggestedSlug).toBe(worst.suggestedSlug);
    }, 120_000);

    it("一份普通草稿经投影重建后字段一字不差", async () => {
        const {createPublicProjectionBudget, projectPublicToolArgs} = await import("nbook/server/agent/events/public-tool-projection");
        const {PUBLIC_TOOL_ARGS_TEXT_BYTES} = await import("nbook/server/agent/events/public-event-policy");
        const {publicToolArgsJsonValue} = await import("nbook/app/components/novel-ide/agent/agent-message");
        const {parseLorebookDraftInput} = await import("nbook/app/components/novel-ide/agent/lorebook-draft-card");

        const draft = {
            title: "青霜剑",
            category: "item",
            aliases: ["家传古剑", "断岳剑"],
            summary: "主角的家传兵器，剑身如秋水初泓。",
            body: "## 概要\n\n青霜剑是主角从父亲手里接过的传家之物。",
            sourceExcerpt: "作者：那把剑要不就叫青霜？——顾问：可以。",
            suggestedSlug: "qingshuang-sword",
        };
        const projected = projectPublicToolArgs("submit_lorebook_draft", draft, createPublicProjectionBudget(PUBLIC_TOOL_ARGS_TEXT_BYTES));

        expect(parseLorebookDraftInput(JSON.stringify(publicToolArgsJsonValue(projected)))).toEqual(draft);
    }, 120_000);
});

describe("设定卡 i18n 契约", () => {
    const flatten = (value: unknown, prefix = ""): string[] => {
        if (!value || typeof value !== "object") {
            return [prefix];
        }
        return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
    };

    it("ide.lorebookDraft 中英成对", () => {
        const zhDraft = (zhCN as {ide: {lorebookDraft: Record<string, unknown>}}).ide.lorebookDraft;
        const enDraft = (enUS as {ide: {lorebookDraft: Record<string, unknown>}}).ide.lorebookDraft;
        const zhKeys = flatten(zhDraft).sort();
        const enKeys = flatten(enDraft).sort();

        expect(zhKeys.length).toBeGreaterThan(0);
        expect(zhKeys).toEqual(enKeys);
    });

    it("卡面文案面向作者，不出现内部类名与工程词", () => {
        const card = (zhCN as {ide: {lorebookDraft: {card: Record<string, unknown>}}}).ide.lorebookDraft.card;
        const values = Object.values(flattenValues(card)).join(" ");

        expect(values.length).toBeGreaterThan(0);
        for (const jargon of ["lorebook", "frontmatter", "governance", "category", "slug", "schema", "profile", "tool", "Tool", "字段", "接口"]) {
            expect(values, jargon).not.toContain(jargon);
        }
        expect(card.title).toBeDefined();
        expect(card.confirm).toBeDefined();
        expect(card.cancel).toBeDefined();
    });

    it("类目下拉显示中文说法，卡面看不到内部目录名", () => {
        const card = (zhCN as {ide: {lorebookDraft: {card: Record<string, unknown>}}}).ide.lorebookDraft.card;
        expect(card.categoryLabel).toBe("归类到");
        expect(Object.values(flattenValues(card)).join(" ")).not.toContain("character");
    });
});

/** 取一棵 i18n 子树的全部字符串值。 */
function flattenValues(value: unknown): Record<string, string> {
    if (!value || typeof value !== "object") {
        return {};
    }
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
        if (typeof child === "string") {
            return [[key, child]];
        }
        return Object.entries(flattenValues(child)).map(([innerKey, innerValue]) => [`${key}.${innerKey}`, innerValue]);
    }));
}
