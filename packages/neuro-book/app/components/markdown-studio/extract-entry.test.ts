import {describe, expect, it} from "vitest";
import {
    buildMessageExtractInstruction,
    buildSelectionExtractInstruction,
    EXTRACT_DRAFT_SOURCE,
    EXTRACT_INSTRUCTION_BODY,
    SUBMIT_LOREBOOK_DRAFT_TOOL_NAME,
} from "nbook/app/utils/extract-entry";

const SELECTION_REF = "[[manuscript/001-volume/002-dawn/index.md#L12-L20]]";
const SELECTION_PATH = "manuscript/001-volume/002-dawn/index.md";

/** 指令里必须齐全的要素，两种粒度都要有。 */
const REQUIRED_INSTRUCTION_ELEMENTS = [
    SUBMIT_LOREBOOK_DRAFT_TOOL_NAME,
    "别名",
    "摘要",
    "类目",
    "不要写入",
    `source: "${EXTRACT_DRAFT_SOURCE}"`,
];

describe("整条消息粒度的提取指令", () => {
    it("带上整条消息原文，并用引用块把原文与指令分开", () => {
        const message = buildMessageExtractInstruction({content: "他把伞留在了门口。"});

        expect(message).toContain("> 他把伞留在了门口。");
        // 指令在原文之后，模型不会把引导语当成要提取的内容。
        expect(message.indexOf("> 他把伞留在了门口。")).toBeLessThan(message.indexOf(SUBMIT_LOREBOOK_DRAFT_TOOL_NAME));
    });

    it("多行原文逐行加引用前缀，原文结构不被压平", () => {
        const message = buildMessageExtractInstruction({content: "第一行\n\n第三行"});

        expect(message).toContain("> 第一行\n> \n> 第三行");
    });

    it("指令要素齐全：工具名、草稿字段、不落盘约束、来源标注", () => {
        const message = buildMessageExtractInstruction({content: "世界规则：潮汐决定魔法强度。"});

        for (const element of REQUIRED_INSTRUCTION_ELEMENTS) {
            expect(message, `指令里缺少「${element}」`).toContain(element);
        }
    });

    it("没有出处时不编造出处行", () => {
        const message = buildMessageExtractInstruction({content: "他把伞留在了门口。"});

        expect(message).not.toContain("出处：");
    });

    it("给了出处就带上，便于回看这条设定是从哪段讨论里提出来的", () => {
        const message = buildMessageExtractInstruction({
            content: "他把伞留在了门口。",
            sourceRef: SELECTION_REF,
            sourceLabel: "第三章 清晨",
        });

        expect(message).toContain("出处：第三章 清晨（" + SELECTION_REF + "）");
    });

    it("空白内容不给出半条指令，直接报错让调用方先拦住", () => {
        expect(() => buildMessageExtractInstruction({content: "   "})).toThrow();
        expect(() => buildMessageExtractInstruction({content: ""})).toThrow();
    });
});

describe("划词选段粒度的提取指令", () => {
    it("带上选段原文与出处（人话名字 + chip 路径行号）", () => {
        const message = buildSelectionExtractInstruction({
            ref: SELECTION_REF,
            path: SELECTION_PATH,
            text: "她说：「潮水退下去之前，别碰那盏灯。」",
            sourceLabel: "第三章 清晨",
        });

        expect(message).toContain("> 她说：「潮水退下去之前，别碰那盏灯。」");
        expect(message).toContain("出处：第三章 清晨（" + SELECTION_REF + "）");
        expect(message).toContain(SELECTION_PATH);
    });

    it("没有人话名字时至少报出文件路径，出处不能整条丢掉", () => {
        const message = buildSelectionExtractInstruction({
            ref: SELECTION_REF,
            path: SELECTION_PATH,
            text: "潮水退下去之前，别碰那盏灯。",
        });

        expect(message).toContain("出处：" + SELECTION_REF);
    });

    it("与整条消息粒度共用同一套指令正文，不各写一份措辞", () => {
        const selection = buildSelectionExtractInstruction({
            ref: SELECTION_REF,
            path: SELECTION_PATH,
            text: "潮水退下去之前，别碰那盏灯。",
        });
        const whole = buildMessageExtractInstruction({content: "潮水退下去之前，别碰那盏灯。"});

        for (const element of REQUIRED_INSTRUCTION_ELEMENTS) {
            expect(selection).toContain(element);
            expect(whole).toContain(element);
        }
        expect(selection.endsWith(EXTRACT_INSTRUCTION_BODY)).toBe(true);
        expect(whole.endsWith(EXTRACT_INSTRUCTION_BODY)).toBe(true);
    });

    it("缺 chip 或缺文件路径时直接报错，不发出无法定位的提取请求", () => {
        expect(() => buildSelectionExtractInstruction({ref: "", path: SELECTION_PATH, text: "正文"})).toThrow();
        expect(() => buildSelectionExtractInstruction({ref: SELECTION_REF, path: "  ", text: "正文"})).toThrow();
        expect(() => buildSelectionExtractInstruction({ref: SELECTION_REF, path: SELECTION_PATH, text: " "})).toThrow();
    });
});
