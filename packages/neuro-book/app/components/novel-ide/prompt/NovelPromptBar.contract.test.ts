import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";

const promptBarPath = fileURLToPath(new URL("../NovelPromptBar.vue", import.meta.url));

describe("NovelPromptBar proposal integration contract", () => {
    it("正确引入 InlineProposalCard 并透传 proposal 状态与生命周期事件", async () => {
        const source = await readFile(promptBarPath, "utf-8");

        // 组件引入与类型导入
        expect(source).toContain("InlineProposalCard from \"nbook/app/components/novel-ide/prompt/InlineProposalCard.vue\"");
        expect(source).toContain("type {InlineProposalState}");

        // Props / Emits 契约
        expect(source).toContain("proposal?: InlineProposalState | null");
        expect(source).toContain("(e: \"accept-edit\", index: number): void");
        expect(source).toContain("(e: \"reject-edit\", index: number, note?: string): void");
        expect(source).toContain("(e: \"accept-all\"): void");
        expect(source).toContain("(e: \"reject-all\", note?: string): void");
        expect(source).toContain("(e: \"request-revision\", note: string): void");

        // 模板接入与事件绑定
        expect(source).toContain("<InlineProposalCard");
        expect(source).toContain(":proposal=\"props.proposal\"");
        expect(source).toContain("@accept-edit=\"emit('accept-edit', $event)\"");
        expect(source).toContain("@reject-edit=\"(idx, note) => emit('reject-edit', idx, note)\"");
        expect(source).toContain("@accept-all=\"emit('accept-all')\"");
        expect(source).toContain("@reject-all=\"emit('reject-all', $event)\"");
        expect(source).toContain("@request-revision=\"emit('request-revision', $event)\"");
    });
});
