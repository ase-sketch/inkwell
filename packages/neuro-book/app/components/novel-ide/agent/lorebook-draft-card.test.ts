import {describe, expect, it} from "vitest";
import {
    LOREBOOK_DRAFT_CATEGORY_LABELS,
    MAX_LOREBOOK_DRAFT_ALIASES,
    type LorebookDraftInput,
} from "nbook/shared/lorebook-draft";
import {
    LOREBOOK_DRAFT_CARD_SCHEMA,
    LOREBOOK_DRAFT_CARD_STORAGE_PREFIX,
    applyLorebookCardAction,
    buildLorebookConfirmMessage,
    formatLorebookDraftAliases,
    lorebookCardStorageKey,
    lorebookDraftCategoryOptions,
    lorebookDraftFields,
    lorebookDraftIssue,
    parseLorebookDraftAliases,
    parseLorebookDraftInput,
    readLorebookCardState,
    resolveLorebookDraftSlug,
    writeLorebookCardState,
    type LorebookCardStorage,
    type LorebookDraftFields,
} from "nbook/app/components/novel-ide/agent/lorebook-draft-card";

/**
 * 设定卡确认卡的纯逻辑测试（M6-T-B）。
 *
 * 卡片自身的渲染不进这里（.vue 不进测试）；这里钉的是四件事：
 * 工具产出怎么变成卡上字段、三态怎么迁移、确认消息是否带全最终字段与落盘口径、
 * 以及取消为什么是零副作用。
 */

/** 一份合法草稿；各用例只改自己关心的字段。 */
function draft(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: "青霜剑",
        category: "item",
        aliases: ["家传古剑", "断岳剑"],
        summary: "主角的家传兵器，剑身如秋水初泓。",
        body: "## 概要\n\n青霜剑是主角从父亲手里接过的传家之物。",
        sourceExcerpt: "作者：那把剑要不就叫青霜？——顾问：可以，正好跟断岳剑的旧名接上。",
        ...overrides,
    };
}

/** 内存里的存储替身；计数读写次数，用来验证取消到底碰没碰东西。 */
function memoryStorage(initial: Record<string, string> = {}): LorebookCardStorage & {writes: number; removes: number} {
    const store = new Map(Object.entries(initial));
    return {
        writes: 0,
        removes: 0,
        getItem: (key: string) => store.get(key) ?? null,
        setItem(key: string, value: string) {
            this.writes += 1;
            store.set(key, value);
        },
        removeItem(key: string) {
            this.removes += 1;
            store.delete(key);
        },
    };
}

// —— 工具产出 → 卡上字段 ——

describe("草稿解析与卡上初始字段", () => {
    it("完整参数解析成契约草稿", () => {
        const parsed = parseLorebookDraftInput(JSON.stringify(draft({suggestedSlug: "qingshuang-sword"})));

        expect(parsed?.title).toBe("青霜剑");
        expect(parsed?.category).toBe("item");
        expect(parsed?.suggestedSlug).toBe("qingshuang-sword");
    });

    it("流式半截 JSON 也能解析出已经写全的字段（卡片早一层显现）", () => {
        const half = '{"title":"青霜剑","category":"item","aliases":["家传古剑"],"summary":"家传兵器","body":"正文","sourceExcerpt":"原话"';
        const parsed = parseLorebookDraftInput(half);

        expect(parsed?.title).toBe("青霜剑");
        expect(parsed?.aliases).toEqual(["家传古剑"]);
    });

    it("字段缺失或类目不在九类里一律不解析，界面据此不渲染空壳卡", () => {
        expect(parseLorebookDraftInput(undefined)).toBeNull();
        expect(parseLorebookDraftInput("{")).toBeNull();
        expect(parseLorebookDraftInput(JSON.stringify(draft({category: "species"})))).toBeNull();
        const missing = draft();
        delete (missing as Record<string, unknown>).body;
        expect(parseLorebookDraftInput(JSON.stringify(missing))).toBeNull();
    });

    it("草稿转卡上字段时别名拷成新数组，改卡不会碰到原草稿", () => {
        const input = parseLorebookDraftInput(JSON.stringify(draft())) as LorebookDraftInput;
        const fields = lorebookDraftFields(input);
        fields.aliases.push("青霜");

        expect(input.aliases).toEqual(["家传古剑", "断岳剑"]);
        expect(fields.aliases).toEqual(["家传古剑", "断岳剑", "青霜"]);
    });

    it("类目下拉给的正好是九类，显示的是一眼能懂的说法", () => {
        const options = lorebookDraftCategoryOptions();

        expect(options).toHaveLength(9);
        expect(options.map((option) => option.value)).toContain("character");
        expect(options.every((option) => option.label === LOREBOOK_DRAFT_CATEGORY_LABELS[option.value])).toBe(true);
        expect(options.every((option) => !option.label.includes(option.value))).toBe(true);
    });

    it("别名文本三种分隔都认，去空白、去重", () => {
        expect(parseLorebookDraftAliases("家传古剑、断岳剑")).toEqual(["家传古剑", "断岳剑"]);
        expect(parseLorebookDraftAliases("家传古剑,断岳剑，青霜")).toEqual(["家传古剑", "断岳剑", "青霜"]);
        expect(parseLorebookDraftAliases("家传古剑\n断岳剑\n家传古剑")).toEqual(["家传古剑", "断岳剑"]);
        expect(parseLorebookDraftAliases("  ")).toEqual([]);
        expect(parseLorebookDraftAliases(undefined)).toEqual([]);
    });

    it("别名列表与卡上文本可往返", () => {
        expect(formatLorebookDraftAliases(["家传古剑", "断岳剑"])).toBe("家传古剑、断岳剑");
        expect(parseLorebookDraftAliases(formatLorebookDraftAliases(["家传古剑", "断岳剑"]))).toEqual(["家传古剑", "断岳剑"]);
        expect(formatLorebookDraftAliases([])).toBe("");
    });
});

// —— 条目目录名 ——

describe("条目目录名", () => {
    it("建议目录名合法就直接用", () => {
        expect(resolveLorebookDraftSlug({title: "青霜剑", suggestedSlug: "qingshuang-sword"})).toBe("qingshuang-sword");
    });

    it("建议目录名缺失或不合形态时按标题现算", () => {
        expect(resolveLorebookDraftSlug({title: "Qing Shuang Sword"})).toBe("qing-shuang-sword");
        expect(resolveLorebookDraftSlug({title: "Qing Shuang Sword", suggestedSlug: "青霜剑"})).toBe("qing-shuang-sword");
        expect(resolveLorebookDraftSlug({title: "青霜剑", suggestedSlug: "QingShuang"})).toBe("");
    });

    it("中文标题不猜音译：留空，由落盘时再定", () => {
        expect(resolveLorebookDraftSlug({title: "青霜剑"})).toBe("");
    });
});

// —— 卡面校验 ——

describe("卡面校验", () => {
    const base: LorebookDraftFields = {
        title: "青霜剑",
        category: "item",
        aliases: [],
        summary: "家传兵器",
        body: "正文",
        sourceExcerpt: "原话",
    };

    it("名称、一句话摘要、条目正文缺一不可", () => {
        expect(lorebookDraftIssue(base)).toBeNull();
        expect(lorebookDraftIssue({...base, title: "   "})).toBe("title");
        expect(lorebookDraftIssue({...base, summary: ""})).toBe("summary");
        expect(lorebookDraftIssue({...base, body: "\n "})).toBe("body");
        expect(lorebookDraftIssue(null)).toBe("title");
    });

    it("别名可以不填：非角色类条目本来就可能没有别的叫法", () => {
        expect(lorebookDraftIssue({...base, aliases: []})).toBeNull();
    });
});

// —— 三态迁移 + 确认消息 ——

describe("确认消息构造", () => {
    function fields(overrides: Partial<LorebookDraftFields> = {}): LorebookDraftFields {
        return {
            title: "青霜剑",
            category: "item",
            aliases: ["家传古剑", "断岳剑"],
            summary: "主角的家传兵器，剑身如秋水初泓。",
            body: "## 概要\n\n青霜剑是主角从父亲手里接过的传家之物。",
            sourceExcerpt: "作者：那把剑要不就叫青霜？",
            ...overrides,
        };
    }

    it("带全卡上最终字段：名称、类别、别名、摘要、正文、原文摘录", () => {
        const message = buildLorebookConfirmMessage(fields());

        expect(message).toContain("青霜剑");
        expect(message).toContain(LOREBOOK_DRAFT_CATEGORY_LABELS.item);
        expect(message).toContain("家传古剑");
        expect(message).toContain("断岳剑");
        expect(message).toContain("主角的家传兵器，剑身如秋水初泓。");
        expect(message).toContain("## 概要");
        expect(message).toContain("作者：那把剑要不就叫青霜？");
    });

    it("以卡上当前值为准：作者改过的类目与文字原样进消息，不是草稿初始值", () => {
        const message = buildLorebookConfirmMessage(fields({
            title: "青霜（改过的名字）",
            category: "character",
            aliases: ["青霜"],
            summary: "改过的摘要",
            body: "改过的正文",
            suggestedSlug: "qingshuang",
        }));

        expect(message).toContain("青霜（改过的名字）");
        expect(message).toContain(LOREBOOK_DRAFT_CATEGORY_LABELS.character);
        expect(message).toContain("改过的摘要");
        expect(message).toContain("改过的正文");
        expect(message).not.toContain(LOREBOOK_DRAFT_CATEGORY_LABELS.item);
    });

    it("写清落盘口径：写到哪、frontmatter 怎么填、来源怎么标、写完要回报路径", () => {
        const message = buildLorebookConfirmMessage(fields({suggestedSlug: "qingshuang-sword"}));

        expect(message).toContain("lorebook/item/qingshuang-sword/index.md");
        expect(message).toContain("status: active");
        expect(message).toContain("governance.source: manual");
        expect(message).toContain("frontmatter");
        expect(message).toMatch(/告诉|回报/);
    });

    it("每个类目都落到自己的目录下", () => {
        for (const [category, label] of Object.entries(LOREBOOK_DRAFT_CATEGORY_LABELS)) {
            const message = buildLorebookConfirmMessage(fields({
                category: category as LorebookDraftFields["category"],
                suggestedSlug: "entry-dir",
            }));
            expect(message, category).toContain(`lorebook/${category}/entry-dir/index.md`);
            expect(message, category).toContain(label);
        }
    });

    it("没有别名时如实说明留空列表，不假装有", () => {
        const message = buildLorebookConfirmMessage(fields({aliases: []}));

        expect(message).toContain("别名：");
        expect(message).toContain("留空");
    });

    it("没有原文摘录就不编一段出来", () => {
        const message = buildLorebookConfirmMessage(fields({sourceExcerpt: ""}));

        expect(message).not.toContain("原文摘录");
    });

    it("中文标题算不出目录名时要求落盘方按名称另取，而不是自己音译", () => {
        const message = buildLorebookConfirmMessage(fields({title: "青霜剑", suggestedSlug: undefined}));

        expect(message).toContain("条目目录名：");
        expect(message).toMatch(/小写英文目录名/);
        expect(message).not.toContain("lorebook/item/青霜剑/");
    });

    it("卡面还缺内容时拒绝构造，逼调用方先提示作者补", () => {
        expect(() => buildLorebookConfirmMessage(fields({title: ""}))).toThrow();
        expect(() => buildLorebookConfirmMessage(fields({summary: " "}))).toThrow();
        expect(() => buildLorebookConfirmMessage(fields({body: ""}))).toThrow();
    });

    it("别名超过上限的做法不在这里兜底：卡上切分后如实带上模型给的那几条", () => {
        const many = Array.from({length: MAX_LOREBOOK_DRAFT_ALIASES}, (_item, index) => `别称${index}`);
        const message = buildLorebookConfirmMessage(fields({aliases: many}));

        for (const alias of many) {
            expect(message).toContain(alias);
        }
    });
});

describe("三态迁移", () => {
    const base: LorebookDraftFields = {
        title: "青霜剑",
        category: "item",
        aliases: [],
        summary: "家传兵器",
        body: "正文",
        sourceExcerpt: "原话",
    };

    it("待确认时确认：算出确认消息并给出已确认状态", () => {
        const outcome = applyLorebookCardAction({action: "confirm", status: "pending", fields: base});

        expect(outcome.kind).toBe("confirm");
        if (outcome.kind !== "confirm") {
            return;
        }
        expect(outcome.status).toBe("confirmed");
        expect(outcome.message).toContain("青霜剑");
        expect(outcome.fields).toEqual(base);
    });

    it("待确认时取消：只给已取消状态，不产生任何消息", () => {
        const outcome = applyLorebookCardAction({action: "cancel", status: "pending", fields: base});

        expect(outcome.kind).toBe("cancelled");
        expect(Object.keys(outcome)).not.toContain("message");
        if (outcome.kind !== "cancelled") {
            return;
        }
        expect(outcome.status).toBe("cancelled");
    });

    it("卡面缺内容时确认被挡下，并说清缺哪一项", () => {
        const outcome = applyLorebookCardAction({action: "confirm", status: "pending", fields: {...base, body: "  "}});

        expect(outcome.kind).toBe("invalid");
        if (outcome.kind !== "invalid") {
            return;
        }
        expect(outcome.issue).toBe("body");
    });

    it("已确认 / 已取消的卡不再受理任何动作（重开历史也不会被再点一次）", () => {
        expect(applyLorebookCardAction({action: "confirm", status: "confirmed", fields: base}).kind).toBe("ignored");
        expect(applyLorebookCardAction({action: "cancel", status: "confirmed", fields: base}).kind).toBe("ignored");
        expect(applyLorebookCardAction({action: "confirm", status: "cancelled", fields: base}).kind).toBe("ignored");
        expect(applyLorebookCardAction({action: "cancel", status: "cancelled", fields: base}).kind).toBe("ignored");
    });
});

// —— 取消零副作用 ——

describe("取消零副作用", () => {
    it("取消不产生任何要发给会话的内容", () => {
        const outcome = applyLorebookCardAction({
            action: "cancel",
            status: "pending",
            fields: {
                title: "青霜剑",
                category: "item",
                aliases: [],
                summary: "家传兵器",
                body: "正文",
                sourceExcerpt: "原话",
            },
        });

        // 只有确认动作才会带 message；取消给不出可发送的东西。
        expect(Object.keys(outcome)).not.toContain("message");
    });

    it("取消只落一次本机状态，不写项目文件、不发消息", () => {
        const storage = memoryStorage();
        const key = lorebookCardStorageKey("proj-1", 7, "call-1");
        const fields: LorebookDraftFields = {
            title: "青霜剑",
            category: "item",
            aliases: [],
            summary: "家传兵器",
            body: "正文",
            sourceExcerpt: "原话",
        };

        const outcome = applyLorebookCardAction({action: "cancel", status: "pending", fields});
        expect(outcome.kind).toBe("cancelled");
        if (outcome.kind !== "cancelled") {
            return;
        }
        writeLorebookCardState(storage, key, {
            schema: LOREBOOK_DRAFT_CARD_SCHEMA,
            status: outcome.status,
            fields: outcome.fields,
        });

        // 唯一一次写是卡片自己的本机状态；没有任何删除，也没有第二处副作用要解释。
        expect(storage.writes).toBe(1);
        expect(storage.removes).toBe(0);
        expect(readLorebookCardState(storage, key)?.status).toBe("cancelled");
    });
});

// —— 本机记忆 ——

describe("卡片状态的本机记忆", () => {
    const state = {
        schema: LOREBOOK_DRAFT_CARD_SCHEMA,
        status: "confirmed" as const,
        fields: {
            title: "青霜剑",
            category: "item" as const,
            aliases: ["家传古剑"],
            summary: "家传兵器",
            body: "正文",
            sourceExcerpt: "原话",
            suggestedSlug: "qingshuang-sword",
        },
    };

    it("键按作用域、会话与这条草稿分区，拿不到会话 id 时退化但不丢", () => {
        expect(lorebookCardStorageKey("proj-1", 7, "call-1")).toBe(`${LOREBOOK_DRAFT_CARD_STORAGE_PREFIX}:proj-1:7:call-1`);
        expect(lorebookCardStorageKey("", null, "")).toBe(`${LOREBOOK_DRAFT_CARD_STORAGE_PREFIX}:workspace-root:none:unknown`);
    });

    it("写进去的状态能原样读回：作者改过的字段与状态都不会被洗掉", () => {
        const storage = memoryStorage();
        const key = lorebookCardStorageKey("proj-1", 7, "call-1");
        writeLorebookCardState(storage, key, state);

        expect(readLorebookCardState(storage, key)).toEqual(state);
    });

    it("没写过、坏数据、版本不符、类目非法，一律当没动过", () => {
        const key = "k";
        expect(readLorebookCardState(memoryStorage(), key)).toBeNull();
        expect(readLorebookCardState(memoryStorage({[key]: "{"}), key)).toBeNull();
        expect(readLorebookCardState(memoryStorage({[key]: JSON.stringify({...state, schema: 99})}), key)).toBeNull();
        expect(readLorebookCardState(memoryStorage({[key]: JSON.stringify({...state, status: "done"})}), key)).toBeNull();
        expect(readLorebookCardState(memoryStorage({[key]: JSON.stringify({...state, fields: {...state.fields, category: "species"}})}), key)).toBeNull();
        expect(readLorebookCardState(memoryStorage({[key]: JSON.stringify({...state, fields: {...state.fields, aliases: "青霜"}})}), key)).toBeNull();
    });

    it("存储本身抛错时不往上冒，只当读不到 / 写不进", () => {
        const hostile: LorebookCardStorage = {
            getItem: () => {
                throw new Error("nope");
            },
            setItem: () => {
                throw new Error("nope");
            },
            removeItem: () => {},
        };

        expect(readLorebookCardState(hostile, "k")).toBeNull();
        expect(writeLorebookCardState(hostile, "k", state)).toBe(false);
    });
});
