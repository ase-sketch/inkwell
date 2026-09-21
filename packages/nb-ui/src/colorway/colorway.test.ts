import {describe, expect, it, vi} from "vitest";
import {applyColorway} from "./apply-colorway";
import {NB_UI_COLORWAY_HOST_CLASS, nbColorwayVarKeys} from "./colorway-contract";
import {
    defaultDarkColorway,
    nbColorwayIds,
    nbColorwayMeta,
    nbColorways,
    retiredColorwayAliases,
} from "./presets";
import {createColorwayStore} from "./colorway-store";

describe("nb-ui colorway", () => {
    it("applies colorway host class and color scheme token", () => {
        const target = document.createElement("div");

        applyColorway(target, defaultDarkColorway);

        expect(target.classList.contains(NB_UI_COLORWAY_HOST_CLASS)).toBe(true);
        expect(target.style.getPropertyValue("--color-scheme")).toBe("dark");
    });

    it("aliases the default colorway to the preset table (single source)", () => {
        expect(defaultDarkColorway).toBe(nbColorways.dark);
        expect(defaultDarkColorway["--color-scheme"]).toBe("dark");
    });

    // 兜底：新增契约键后漏补某套配色会在这里失败
    it("covers every contract key in every colorway", () => {
        for (const id of nbColorwayIds) {
            const colorway = nbColorways[id];
            for (const key of nbColorwayVarKeys) {
                expect(colorway[key], `${id} 缺少 ${key}`).toBeTruthy();
            }
            expect(colorway["--color-scheme"]).toBe(nbColorwayMeta[id].appearance);
        }
    });

    /*
     * 内置只出一套走查过的配色。代价是**库里没有亮色**：只装库不装主题的消费方
     * 在亮色系统下也会拿到暗色界面，亮色要由主题包提供（macos 自带 macos-light）。
     * 这一条断言就是那个代价的锚点——哪天想加回亮色，先来改它。
     */
    it("ships exactly one built-in colorway, and it is dark", () => {
        expect(nbColorwayIds).toEqual(["dark"]);
        expect(nbColorwayMeta.dark.appearance).toBe("dark");
    });

    // 下线的 id 必须都有接替目标，否则等于静默回退默认配色
    it("maps every retired colorway id onto a live colorway", () => {
        for (const [retired, target] of Object.entries(retiredColorwayAliases)) {
            expect(nbColorwayIds, `${retired} 的接替目标 ${target} 不存在`).toContain(target);
            expect(nbColorwayIds, `${retired} 仍在在售阵容里，不该出现在别名表`).not.toContain(retired);
        }
    });
});

describe("nb-ui colorway store", () => {
    it("applies the default colorway and persists switches", () => {
        const store = createColorwayStore({storageKey: "test-colorway-a"});

        store.initColorway();
        expect(store.current.value).toBe("dark");
        expect(document.documentElement.style.getPropertyValue("--color-scheme")).toBe("dark");

        store.setColorway("dark");
        expect(localStorage.getItem("test-colorway-a")).toBe("dark");
        expect(document.documentElement.style.colorScheme).toBe("dark");
        localStorage.removeItem("test-colorway-a");
    });

    it("restores the stored colorway on init and rejects unknown ids", () => {
        localStorage.setItem("test-colorway-b", "dark");
        const store = createColorwayStore({storageKey: "test-colorway-b"});
        store.initColorway();
        expect(store.current.value).toBe("dark");

        localStorage.setItem("test-colorway-b", "not-a-theme");
        store.initColorway();
        expect(store.current.value).toBe("dark");
        localStorage.removeItem("test-colorway-b");
    });

    /*
     * 下线配色的老用户不该某天打开变成默认配色且没有任何提示。
     * sepia / light 这两套亮色是最后一轮下线的，落差最大的正是它们的用户：整个界面从亮变暗。
     */
    it("migrates retired colorway ids through the alias layer", () => {
        const store = createColorwayStore({storageKey: "test-colorway-retired"});

        for (const retired of ["dracula", "midnight", "slate", "sepia", "light"]) {
            localStorage.setItem("test-colorway-retired", retired);
            store.initColorway();
            expect(store.current.value, `${retired} 没被别名层接住`).toBe("dark");
        }

        localStorage.removeItem("test-colorway-retired");
    });

    it("keeps working when localStorage throws", () => {
        const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota");
        });
        const store = createColorwayStore({storageKey: "test-colorway-c"});

        expect(() => store.setColorway("dark")).not.toThrow();
        expect(store.current.value).toBe("dark");
        spy.mockRestore();
    });

    it("supports custom colorway tables", () => {
        const store = createColorwayStore({
            storageKey: "test-colorway-d",
            defaultId: "brand",
            colorways: {brand: {"--color-scheme": "dark", "--bg-main": "#000"}},
            meta: {brand: {label: "Brand", appearance: "dark"}},
            aliases: {},
        });

        expect(store.colorwayIds).toEqual(["brand"]);
        store.initColorway();
        expect(store.current.value).toBe("brand");
        localStorage.removeItem("test-colorway-d");
    });

    /*
     * 主题要按明暗分档就只能靠这个属性——CSS 选不了 style.colorScheme。
     * 少写这一行的后果是玻璃配方在暗色配色下沿用亮色取值（brightness 提亮、白色高光），
     * 方向正好是反的，且不会报任何错。
     *
     * 亮色那一半得自己造一套：内置配色全是暗的，而这条断言要的正是「两个方向都写对」。
     */
    it("mirrors the colorway appearance onto data-nb-appearance", () => {
        const store = createColorwayStore({
            storageKey: "test-colorway-appearance",
            colorways: {...nbColorways, "test-light": {"--color-scheme": "light"}},
            meta: {...nbColorwayMeta, "test-light": {label: "Test Light", appearance: "light"}},
        });

        store.setColorway("dark");
        expect(document.documentElement.dataset.nbAppearance).toBe("dark");

        store.setColorway("test-light");
        expect(document.documentElement.dataset.nbAppearance).toBe("light");

        localStorage.removeItem("test-colorway-appearance");
    });
});
