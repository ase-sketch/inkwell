import {describe, expect, it} from "vitest";
import {
    createSensitiveWordMatcher,
    mergeSensitiveWordLists,
    parseSensitiveWords,
    scanSensitiveWords,
} from "nbook/app/utils/sensitive-word-scan";

describe("sensitive-word-scan", () => {
    describe("parseSensitiveWords", () => {
        it("解析换行分隔的词表并去除空格", () => {
            const raw = "  敏感词A  \n敏感词B\r\n  敏感词C  ";
            expect(parseSensitiveWords(raw)).toEqual(["敏感词A", "敏感词B", "敏感词C"]);
        });

        it("忽略空行与纯空格行", () => {
            const raw = "\n\n  \n敏感词A\n\n";
            expect(parseSensitiveWords(raw)).toEqual(["敏感词A"]);
        });

        it("忽略以 # 开头的整行注释与行尾注释", () => {
            const raw = [
                "# 这是注释",
                "敏感词1",
                "  # 这是缩进注释",
                "敏感词2 # 行尾说明",
                "敏感词3",
            ].join("\n");
            expect(parseSensitiveWords(raw)).toEqual(["敏感词1", "敏感词2", "敏感词3"]);
        });

        it("空文本返回空数组", () => {
            expect(parseSensitiveWords("")).toEqual([]);
            expect(parseSensitiveWords("   # 仅有注释\n  ")).toEqual([]);
        });
    });

    describe("mergeSensitiveWordLists", () => {
        it("合并内置词表与自定义词表并去重", () => {
            const builtin = ["词1", "词2", "词3"];
            const custom = ["词2", "词4", "词1"];
            const merged = mergeSensitiveWordLists(builtin, custom);
            expect(merged).toEqual(["词1", "词2", "词3", "词4"]);
        });

        it("支持自定义表输入为原始文本并解析", () => {
            const builtin = ["内置词A"];
            const customText = "# 自定义\n自定义词B\n内置词A";
            const merged = mergeSensitiveWordLists(builtin, customText);
            expect(merged).toEqual(["内置词A", "自定义词B"]);
        });

        it("过滤空字符串与纯空白项", () => {
            const merged = mergeSensitiveWordLists(["  ", "有效词"], ["", "  "]);
            expect(merged).toEqual(["有效词"]);
        });
    });

    describe("scanSensitiveWords & matcher", () => {
        it("空词表返回空命中列表", () => {
            const matches = scanSensitiveWords("这是一段包含任何内容的文本", []);
            expect(matches).toEqual([]);
        });

        it("空正文返回空命中列表", () => {
            const matches = scanSensitiveWords("", ["测试"]);
            expect(matches).toEqual([]);
        });

        it("单词命中并准确定位行列号及上下文", () => {
            const text = "第一行正常内容\n第二行有违禁词出现\n第三行正常";
            const matches = scanSensitiveWords(text, ["违禁词"]);
            expect(matches).toHaveLength(1);
            expect(matches[0]!).toMatchObject({
                word: "违禁词",
                line: 2,
                column: 5,
                index: 12,
            });
            expect(matches[0]!.context).toContain("违禁词");
        });

        it("支持多词与多次命中", () => {
            const text = "前文违禁词A继续展开，再次出现违禁词A，以及违禁词B。";
            const matches = scanSensitiveWords(text, ["违禁词A", "违禁词B"]);
            expect(matches).toHaveLength(3);
            expect(matches.map((m) => m.word)).toEqual(["违禁词A", "违禁词A", "违禁词B"]);
        });

        it("正确识别重叠敏感词（如子串与重叠词）", () => {
            const text = "这里有非法代开发票行为";
            const matches = scanSensitiveWords(text, ["发票", "代开发票", "开发"]);
            const words = matches.map((m) => m.word).sort();
            expect(words).toEqual(["代开发票", "发票", "开发"].sort());
        });

        it("跨多行定位在 CRLF 与 LF 下准确计算行号和列号", () => {
            const text = "Line1\r\nLine2敏感词\nLine3";
            const matches = scanSensitiveWords(text, ["敏感词"]);
            expect(matches).toHaveLength(1);
            expect(matches[0]!.line).toBe(2);
            expect(matches[0]!.column).toBe(6);
        });

        it("上下文片段包含前后文本且合理截断", () => {
            const text = "0123456789ABCDE敏感词FGHIJKLMNOPQRST";
            const matches = scanSensitiveWords(text, ["敏感词"], {contextRadius: 5});
            expect(matches).toHaveLength(1);
            expect(matches[0]!.context).toBe("...ABCDE敏感词FGHIJ...");
        });

        it("createSensitiveWordMatcher 支持复用匹配器", () => {
            const matcher = createSensitiveWordMatcher(["苹果", "香蕉"]);
            expect(matcher.scan("我喜欢吃苹果")).toHaveLength(1);
            expect(matcher.scan("桌上有香蕉和苹果")).toHaveLength(2);
        });
    });
});