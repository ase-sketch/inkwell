import {describe, expect, it} from "vitest";
import {
    evolutionActor,
    evolutionOperation,
    evolutionRow,
    evolutionRows,
    evolutionSessionJump,
    evolutionTime,
} from "nbook/app/components/novel-ide/knowledge/knowledge-evolution";
import type {WorkspaceHistoryTimelineEntryDto} from "nbook/shared/dto/workspace-history.dto";
import zhCN from "../../../i18n/locales/zh-CN";
import enUS from "../../../i18n/locales/en-US";

/**
 * 条目「演进」区块的投影口径（M5）。
 *
 * 这些断言就是作者看到的那几行字：谁改的、什么时候、改了什么、能不能点开看差异。
 * 中文英文各测一遍，保证两边口径一致且都不出现工程词。
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
const NOW = new Date(2026, 8, 25, 22, 41, 30);

function entry(overrides: Partial<WorkspaceHistoryTimelineEntryDto> = {}): WorkspaceHistoryTimelineEntryDto {
    return {
        id: 7,
        occurredAt: new Date(2026, 8, 25, 22, 41, 0).toISOString(),
        actorKind: "agent",
        actorDetail: "7",
        operationType: "file.edit",
        bodyAvailable: {before: true, after: true},
        diffAvailable: true,
        agent: {sessionId: 7, title: "新书设定", profileKey: "interview.new-book", sessionExists: true},
        ...overrides,
    };
}

describe("M5 演进区块投影 · 归因", () => {
    it("访谈会话说「访谈《书名》」，对话会话说「对话《书名》」", () => {
        expect(evolutionActor(entry(), zhT).label).toBe("访谈《新书设定》");
        expect(evolutionActor(entry({agent: {sessionId: 9, title: "清代漕运研究笔记整理", profileKey: "leader.default", sessionExists: true}}), zhT).label)
            .toBe("对话《清代漕运研究笔记整理》");
        expect(evolutionActor(entry(), enT).label).toBe("Interview “新书设定”");
    });

    it("访谈与对话由会话档案键前缀区分，不靠标题猜", () => {
        // 同样是「访谈」字样的标题，档案键不是 interview.* 就按对话说。
        const titled = entry({agent: {sessionId: 3, title: "访谈记录", profileKey: "leader.writing", sessionExists: true}});
        expect(evolutionActor(titled, zhT).label).toBe("对话《访谈记录》");
    });

    it("会话已删除时说「某场访谈」并不可点，不显示编号", () => {
        const removed = entry({agent: {sessionId: 7, title: null, profileKey: "interview.new-book", sessionExists: false}});
        const actor = evolutionActor(removed, zhT);

        expect(actor.label).toBe("某场访谈（记录已删除）");
        expect(actor.clickable).toBe(false);
        expect(actor.sessionId).toBeNull();
        expect(evolutionSessionJump(actor)).toBeNull();
        // 界面上不出现会话编号。
        expect(actor.label).not.toContain("7");
    });

    it("没有档案键的旧记录按对话说，标题也缺时给不带标题的说法", () => {
        expect(evolutionActor(entry({agent: {sessionId: 7, title: null, profileKey: null, sessionExists: true}}), zhT).label)
            .toBe("某次对话");
    });

    it("四类归因各有说法：你手动编辑 / 系统 / 外部改动", () => {
        expect(evolutionActor(entry({actorKind: "user", actorDetail: "local", agent: null}), zhT).label).toBe("你手动编辑");
        expect(evolutionActor(entry({actorKind: "system", actorDetail: "template-sync", agent: null}), zhT).label).toBe("系统（template-sync）");
        expect(evolutionActor(entry({actorKind: "system", actorDetail: null, agent: null}), zhT).label).toBe("系统");
        expect(evolutionActor(entry({actorKind: "external", actorDetail: null, agent: null}), zhT).label).toBe("外部改动");
        expect(evolutionActor(entry({actorKind: "user", actorDetail: "local", agent: null}), enT).label).toBe("You edited it");
    });

    it("只有还在的 AI 会话可点，其余一律纯文本", () => {
        expect(evolutionSessionJump(evolutionActor(entry(), zhT))).toEqual({sessionId: 7});
        expect(evolutionSessionJump(evolutionActor(entry({actorKind: "user", actorDetail: "local", agent: null}), zhT))).toBeNull();
        expect(evolutionSessionJump(evolutionActor(entry({actorKind: "external", actorDetail: null, agent: null}), zhT))).toBeNull();
        expect(evolutionSessionJump(evolutionActor(entry({actorKind: "system", actorDetail: "x", agent: null}), zhT))).toBeNull();
    });

    it("将来新增的归因类型说「未知来源」，不把机器词甩给作者", () => {
        const unknown = entry({actorKind: "robot" as never, agent: null});
        expect(evolutionActor(unknown, zhT).label).toBe("未知来源");
    });
});

describe("M5 演进区块投影 · 操作", () => {
    it("六型操作都有人话说法", () => {
        expect(evolutionOperation("file.create", zhT)).toBe("新建");
        expect(evolutionOperation("file.edit", zhT)).toBe("修改");
        expect(evolutionOperation("file.delete", zhT)).toBe("删除");
        expect(evolutionOperation("file.rename", zhT)).toBe("改名");
        expect(evolutionOperation("file.revert", zhT)).toBe("还原");
        expect(evolutionOperation("file.restore", zhT)).toBe("恢复");
        expect(evolutionOperation("file.edit", enT)).toBe("Edited");
    });

    it("未登记的操作类型走兜底说法，不显示 file.xxx", () => {
        expect(evolutionOperation("file.encrypt", zhT)).toBe("有改动");
        expect(evolutionOperation("file.encrypt", zhT)).not.toContain("file.");
        expect(evolutionOperation("", zhT)).toBe("有改动");
    });
});

describe("M5 演进区块投影 · 时间", () => {
    it("刚刚 / 今天 / 昨天 / 月日 / 跨年，逐档给说法", () => {
        expect(evolutionTime(new Date(2026, 8, 25, 22, 41, 10).toISOString(), NOW, zhT)).toBe("刚刚");
        expect(evolutionTime(new Date(2026, 8, 25, 9, 5, 0).toISOString(), NOW, zhT)).toBe("今天 09:05");
        expect(evolutionTime(new Date(2026, 8, 24, 22, 41, 0).toISOString(), NOW, zhT)).toBe("昨天 22:41");
        expect(evolutionTime(new Date(2026, 8, 3, 8, 7, 0).toISOString(), NOW, zhT)).toBe("9月3日 08:07");
        // 跨年才带年份。
        expect(evolutionTime(new Date(2025, 11, 31, 23, 59, 0).toISOString(), NOW, zhT)).toBe("2025年12月31日 23:59");
        expect(evolutionTime(new Date(2026, 8, 25, 9, 5, 0).toISOString(), NOW, enT)).toBe("today 09:05");
    });

    it("时间戳读不出来时退回原样字符串，不让整行消失", () => {
        expect(evolutionTime("不是时间", NOW, zhT)).toBe("不是时间");
        expect(evolutionTime("", NOW, zhT)).toBe("");
    });

    it("未来的时间戳（时钟偏差）不显示成「刚刚」", () => {
        expect(evolutionTime(new Date(2026, 8, 25, 22, 45, 0).toISOString(), NOW, zhT)).toBe("今天 22:45");
    });
});

describe("M5 演进区块投影 · 行与可展开", () => {
    it("一行 = 时间 + 归因 + 操作，最近一次由服务端排在最前", () => {
        const rows = evolutionRows([
            entry({id: 9, operationType: "file.edit", occurredAt: new Date(2026, 8, 25, 9, 5, 0).toISOString()}),
            entry({id: 7, operationType: "file.create", occurredAt: new Date(2026, 8, 24, 22, 41, 0).toISOString()}),
        ], zhT, NOW);

        expect(rows.map((row) => [row.entryId, row.time, row.actor.label, row.operation])).toEqual([
            [9, "今天 09:05", "访谈《新书设定》", "修改"],
            [7, "昨天 22:41", "访谈《新书设定》", "新建"],
        ]);
        // key 用条目编号，同一文件内唯一。
        expect(new Set(rows.map((row) => row.key)).size).toBe(2);
    });

    it("快照不可取时不可展开，可取时可展开", () => {
        expect(evolutionRow(entry({diffAvailable: false}), zhT, NOW).expandable).toBe(false);
        expect(evolutionRow(entry({diffAvailable: true}), zhT, NOW).expandable).toBe(true);
    });

    it("新建条目虽然「修改前」为空，差异照样可看", () => {
        const created = entry({id: 11, operationType: "file.create", bodyAvailable: {before: false, after: true}, diffAvailable: true});
        expect(evolutionRow(created, zhT, NOW).expandable).toBe(true);
    });

    it("没有历史记录时给空列表，界面据此显示空态", () => {
        expect(evolutionRows([], zhT, NOW)).toEqual([]);
        expect(evolutionRows(null, zhT, NOW)).toEqual([]);
        expect(evolutionRows(undefined, zhT, NOW)).toEqual([]);
    });
});

describe("M5 演进区块 · i18n 成对与用词", () => {
    it("中英文案的 evolution key 一一对应", () => {
        expect(Object.keys(zhCN.ide.knowledge.evolution).sort())
            .toEqual(Object.keys(enUS.ide.knowledge.evolution).sort());
    });

    it("作者向文案里不出现工程术语与编号", () => {
        // 中文只允许说人话：连「条目/会话编号」这类内部叫法都不该出现。
        const forbiddenInChinese = /sessionId|entry|hash|snapshot|file\.|Task|Phase|M5|条目编号/i;
        for (const text of Object.values(zhCN.ide.knowledge.evolution)) {
            expect(forbiddenInChinese.test(text), text).toBe(false);
        }
        // 英文里 entry / conversation 是作者看得懂的普通词，只拦真正的实现术语。
        const forbiddenInEnglish = /sessionId|hash|snapshot|file\.|Task|Phase|M5/i;
        for (const text of Object.values(enUS.ide.knowledge.evolution)) {
            expect(forbiddenInEnglish.test(text), text).toBe(false);
        }
    });
});
