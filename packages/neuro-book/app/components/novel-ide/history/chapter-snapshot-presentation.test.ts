import {describe, expect, it} from "vitest";
import {
    emptySnapshotDiffView,
    snapshotDiffView,
    snapshotRestoreConfirm,
    snapshotRestoreSuccess,
    snapshotRow,
    snapshotRows,
    snapshotTime,
    snapshotTitle,
    type ChapterSnapshotRow,
} from "nbook/app/components/novel-ide/history/chapter-snapshot-presentation";
import type {ChapterSnapshotDiffDto, ChapterSnapshotDto} from "nbook/shared/dto/chapter-snapshot.dto";
import zhCN from "../../../i18n/locales/zh-CN";
import enUS from "../../../i18n/locales/en-US";

/**
 * 章节快照的界面投影口径（M7）。
 *
 * 这些断言就是作者看到的那几行字：这条快照叫什么、什么时候打的、内容还能不能取、
 * 能不能看差异 / 还原、确认框怎么说。中文英文各测一遍，保证两边口径一致。
 */

/** 极简 i18n：命中返回译文（带参数替换），缺 key 时像 vue-i18n 一样原样返回 key。 */
function translator(locale: {[key: string]: any}) {
    return (key: string, params?: {[key: string]: string | number}): string => {
        const value = key.split(".").reduce<any>((node, segment) => node?.[segment], locale);
        if (typeof value !== "string") {
            return key;
        }
        return params
            ? value.replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ""))
            : value;
    };
}

const zhT = translator(zhCN);
const enT = translator(enUS);

/** 固定「现在」，避免测试依赖真实时钟。 */
const NOW = new Date(2026, 8, 29, 14, 30, 0);

function snapshot(overrides: Partial<ChapterSnapshotDto> = {}): ChapterSnapshotDto {
    return {
        id: 12,
        path: "manuscript/卷一/第三章/index.md",
        entryId: 345,
        note: null,
        createdAt: new Date(2026, 8, 29, 10, 5, 0).toISOString(),
        restorable: true,
        ...overrides,
    };
}

describe("快照兜底标题", () => {
    it("作者起了名就用名字，不看时间", () => {
        expect(snapshotTitle(snapshot({note: "初稿定稿"}), zhT, NOW)).toBe("初稿定稿");
    });

    it("没起名就按拍摄时间兜底（同年不带年份）", () => {
        expect(snapshotTitle(snapshot({note: null}), zhT, NOW)).toBe("9月29日 10:05");
    });

    it("备注是空串或纯空白都当没起名", () => {
        expect(snapshotTitle(snapshot({note: ""}), zhT, NOW)).toBe("9月29日 10:05");
        expect(snapshotTitle(snapshot({note: "   "}), zhT, NOW)).toBe("9月29日 10:05");
    });

    it("跨年的兜底标题才带年份", () => {
        const lastYear = new Date(2025, 11, 31, 23, 5, 0).toISOString();
        expect(snapshotTitle(snapshot({createdAt: lastYear}), zhT, NOW)).toBe("2025年12月31日 23:05");
    });

    it("时间戳坏掉时如实退回「没起名的存档点」，不显示原始脏串", () => {
        expect(snapshotTitle(snapshot({note: null, createdAt: "not-a-date"}), zhT, NOW)).toBe("没起名的存档点");
    });
});

describe("人话时间", () => {
    it("一分钟内说「刚刚」", () => {
        const justNow = new Date(NOW.getTime() - 30_000).toISOString();
        expect(snapshotTime(justNow, NOW, zhT)).toBe("刚刚");
    });

    it("同一天带「今天」", () => {
        expect(snapshotTime(new Date(2026, 8, 29, 9, 7, 0).toISOString(), NOW, zhT)).toBe("今天 09:07");
    });

    it("前一天带「昨天」", () => {
        expect(snapshotTime(new Date(2026, 8, 28, 23, 59, 0).toISOString(), NOW, zhT)).toBe("昨天 23:59");
    });

    it("今年更早的只说月日，跨年才带年份", () => {
        expect(snapshotTime(new Date(2026, 2, 3, 8, 0, 0).toISOString(), NOW, zhT)).toBe("3月3日 08:00");
        expect(snapshotTime(new Date(2025, 2, 3, 8, 0, 0).toISOString(), NOW, zhT)).toBe("2025年3月3日 08:00");
    });

    it("时间戳坏掉时原样退回，不让整行消失", () => {
        expect(snapshotTime("not-a-date", NOW, zhT)).toBe("not-a-date");
    });
});

describe("快照行投影", () => {
    it("内容可取时，看差异与还原都可用且没有降级说明", () => {
        const row = snapshotRow(snapshot(), zhT, NOW);
        expect(row.restorable).toBe(true);
        expect(row.viewable).toBe(true);
        expect(row.restorableAction).toBe(true);
        expect(row.unavailableHint).toBeNull();
    });

    it("内容不可取时，看差异与还原一并置灰，并如实说明原因", () => {
        const row = snapshotRow(snapshot({restorable: false}), zhT, NOW);
        expect(row.restorable).toBe(false);
        expect(row.viewable).toBe(false);
        expect(row.restorableAction).toBe(false);
        expect(row.unavailableHint).toBe("这一版的内容已经找不回来了（保留时限或清理策略），只能看到它留过的记录。");
    });

    it("降级说明用作者能懂的话，不出现版本编号一类工程词", () => {
        const row = snapshotRow(snapshot({restorable: false, note: "第一稿"}), zhT, NOW);
        expect(row.unavailableHint).not.toMatch(/entryId|entry|哈希|hash|时间线|timeline|版本号/i);
    });

    it("key 与编号稳定，供列表渲染复用", () => {
        const row = snapshotRow(snapshot({id: 88}), zhT, NOW);
        expect(row.key).toBe("88");
        expect(row.snapshotId).toBe(88);
    });

    it("空列表与 null 列表都得到空数组（调用方不必自己判 null）", () => {
        expect(snapshotRows(null, zhT, NOW)).toEqual([]);
        expect(snapshotRows(undefined, zhT, NOW)).toEqual([]);
        expect(snapshotRows([], zhT, NOW)).toEqual([]);
    });

    it("列表顺序沿用服务端顺序（最近打的在最前），不自行重排", () => {
        const rows = snapshotRows([
            snapshot({id: 3, note: "最近的"}),
            snapshot({id: 2, note: "上一次"}),
        ], zhT, NOW);
        expect(rows.map((row) => row.title)).toEqual(["最近的", "上一次"]);
    });
});

describe("差异区投影（判别联合必须穷举）", () => {
    const available: ChapterSnapshotDiffDto = {
        status: "available",
        original: "旧的一版",
        modified: "新的一版",
        changes: [],
        byteSize: 10,
        changedLineCount: 1,
    };

    it("空状态不可比对且没有说明（还没取差异时）", () => {
        const view = emptySnapshotDiffView();
        expect(view.comparable).toBe(false);
        expect(view.message).toBeNull();
        expect(view.tone).toBeNull();
    });

    it("null 差异退回空状态，不崩", () => {
        expect(snapshotDiffView(null, zhT)).toEqual(emptySnapshotDiffView());
        expect(snapshotDiffView(undefined, zhT)).toEqual(emptySnapshotDiffView());
    });

    it("available 出两侧正文，可比对", () => {
        const view = snapshotDiffView(available, zhT);
        expect(view.comparable).toBe(true);
        expect(view.original).toBe("旧的一版");
        expect(view.modified).toBe("新的一版");
        expect(view.message).toBeNull();
    });

    it("blocked（敏感路径）不携带正文，并说清为什么不显示", () => {
        const view = snapshotDiffView({status: "blocked", reason: "sensitive_path"}, zhT);
        expect(view.comparable).toBe(false);
        expect(view.original).toBe("");
        expect(view.modified).toBe("");
        expect(view.tone).toBe("warning");
        expect(view.message).toBe("这个文件涉及敏感信息，不显示内容对比。");
    });

    it("too_large 走警示语气并如实说太大", () => {
        const view = snapshotDiffView({status: "too_large", reason: "inline_limit", byteSize: 10, changedLineCount: 9}, zhT);
        expect(view.comparable).toBe(false);
        expect(view.tone).toBe("warning");
        expect(view.message).toBe("这一版太大，这里放不下完整对比。");
    });

    it("unavailable 的所有 reason 都走弱语气说明（超限/清理/禁用/二进制）", () => {
        for (const reason of ["before-missing", "after-missing", "binary", "history_disabled"] as const) {
            const view = snapshotDiffView({status: "unavailable", reason}, zhT);
            expect(view.comparable).toBe(false);
            expect(view.tone).toBe("muted");
            expect(view.message).toBe("这一版的前后内容已经找不回来了，只能看到记录。");
        }
    });

    it("任何非 available 分支都不泄露工程词", () => {
        const messages = [
            snapshotDiffView({status: "blocked", reason: "sensitive_path"}, zhT).message ?? "",
            snapshotDiffView({status: "too_large", reason: "inline_limit", byteSize: 1, changedLineCount: 1}, zhT).message ?? "",
            snapshotDiffView({status: "unavailable", reason: "history_disabled"}, zhT).message ?? "",
        ];
        for (const message of messages) {
            expect(message).not.toMatch(/sensitive_path|inline_limit|history_disabled|before-missing|after-missing|binary/i);
        }
    });
});

describe("还原确认与完成文案", () => {
    const row: ChapterSnapshotRow = snapshotRow(snapshot({note: "初稿定稿"}), zhT, NOW);

    it("确认框说清还原到哪一章的哪一版，以及反悔怎么回去", () => {
        const message = snapshotRestoreConfirm("第三章 雪夜", row, false, zhT);
        expect(message).toContain("第三章 雪夜");
        expect(message).toContain("初稿定稿");
        expect(message).toContain("反悔");
    });

    it("有未保存修改时追加提醒，告知还原会丢弃", () => {
        const message = snapshotRestoreConfirm("第三章 雪夜", row, true, zhT);
        expect(message).toContain("没保存的修改");
        expect(message).toContain("丢弃");
    });

    it("确认与完成文案都零工程词", () => {
        expect(snapshotRestoreConfirm("第三章 雪夜", row, true, zhT)).not.toMatch(/entryId|哈希|时间线|confirm|restoreId/i);
        expect(snapshotRestoreSuccess("第三章 雪夜", row, zhT)).not.toMatch(/entryId|哈希|时间线/i);
    });

    it("完成文案说清可以反悔回去", () => {
        expect(snapshotRestoreSuccess("第三章 雪夜", row, zhT)).toContain("想回去随时能回");
    });
});

describe("英文口径与中文对齐", () => {
    it("英文兜底标题与时间同样是「备注优先、时间兜底」", () => {
        expect(snapshotTitle(snapshot({note: "First draft"}), enT, NOW)).toBe("First draft");
        expect(snapshotTitle(snapshot({note: null}), enT, NOW)).toBe("9/29 10:05");
        expect(snapshotTime(new Date(2026, 8, 29, 9, 7, 0).toISOString(), NOW, enT)).toBe("Today 09:07");
    });

    it("英文降级说明同样不带工程词", () => {
        const row = snapshotRow(snapshot({restorable: false}), enT, NOW);
        expect(row.restorable).toBe(false);
        expect(row.unavailableHint).not.toMatch(/entryId|hash|timeline|snapshot id/i);
        expect(row.unavailableHint).toContain("no longer be found");
    });

    it("英文 diff 安全分支同样不泄露 reason 取值", () => {
        const view = snapshotDiffView({status: "blocked", reason: "sensitive_path"}, enT);
        expect(view.message).toBe("This file holds sensitive information, so the comparison is not shown.");
    });
});
