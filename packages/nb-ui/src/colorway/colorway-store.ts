import {readonly, ref} from "vue";
import type {Ref} from "vue";
import {applyColorway} from "./apply-colorway";
import type {NbColorwayVars} from "./colorway-contract";
import {NB_DEFAULT_COLORWAY_ID, nbColorwayMeta, nbColorways, retiredColorwayAliases, type NbColorwayId, type ColorwayAppearance} from "./presets";

/** 配色元信息：展示名与明暗归属 */
export type ColorwayMeta = {label: string; appearance: ColorwayAppearance};

export type ColorwayStore<Id extends string> = {
    /** 当前配色 id（只读） */
    current: Readonly<Ref<Id>>;
    colorwayIds: Id[];
    colorwayMeta: Record<Id, ColorwayMeta>;
    colorways: Record<Id, NbColorwayVars>;
    /** 切换配色并持久化到 localStorage */
    setColorway: (id: Id) => void;
    /** app 根组件挂载时调用一次：从 localStorage 恢复上次选择并应用 */
    initColorway: () => void;
};

export type ColorwayStoreOptions<Id extends string> = {
    /** localStorage 键，各消费应用唯一（如 "nb-template-colorway"） */
    storageKey: string;
    defaultId?: Id;
    /** 缺省用 nb-ui 内置 5 套配色；派生项目可传自己的配色表 */
    colorways?: Record<Id, NbColorwayVars>;
    meta?: Record<Id, ColorwayMeta>;
    /**
     * 已下线配色 id 的迁移映射，只作用于读取旧的持久化值。
     * 缺省用 nb-ui 内置的 retiredColorwayAliases；传自定义配色表时应一并传自己的映射。
     */
    aliases?: Record<string, Id>;
};

/**
 * 创建配色会话（应用/持久化/启动恢复的单一来源）。
 *
 * 消费方在模块层调用一次即得全局单例：
 * ```ts
 * const store = createColorwayStore({storageKey: "my-app-colorway"});
 * export function useColorway() { return store; }
 * ```
 */
export function createColorwayStore<Id extends string = NbColorwayId>(options: ColorwayStoreOptions<Id>): ColorwayStore<Id> {
    // 缺省绑定内置配色；Id 默认为 NbColorwayId 时这两个断言恒真
    const colorways = options.colorways ?? (nbColorways as Record<Id, NbColorwayVars>);
    const meta = options.meta ?? (nbColorwayMeta as Record<Id, ColorwayMeta>);
    const colorwayIds = Object.keys(meta) as Id[];
    const defaultId = options.defaultId ?? (NB_DEFAULT_COLORWAY_ID as Id);
    const aliases = options.aliases ?? (retiredColorwayAliases as Record<string, Id>);
    const current = ref(defaultId) as Ref<Id>;

    function isColorwayId(value: string | null): value is Id {
        return value !== null && (colorwayIds as string[]).includes(value);
    }

    /**
     * 解析持久化下来的配色 id。
     * 已下线的 id 走别名映射落到接替它的配色，而不是静默回退默认配色——
     * 后者会让原本用 Dracula 的人某天打开变成米黄纸，且没有任何提示。
     */
    function resolveStoredId(value: string | null): Id {
        if (isColorwayId(value)) {
            return value;
        }
        if (value !== null && Object.hasOwn(aliases, value)) {
            const mapped = aliases[value];
            if (mapped !== undefined && isColorwayId(mapped)) {
                return mapped;
            }
        }
        return defaultId;
    }

    /**
     * 把配色变量写入 <html> 与 <body>，并同步明暗两条通道：
     *
     * - `style.colorScheme` 影响浏览器**原生 UI**（滚动条、原生下拉、表单控件）的明暗表现。
     * - `data-nb-appearance` 影响**主题**：CSS 选不了 colorScheme，主题要按明暗分档
     *   （玻璃配方在暗色下方向是反的）就只能靠这个属性。
     *
     * 两者必须都写：主题依赖的是配色的**明暗属性**而不是配色的**身份**——
     * 绑身份的写法（`[data-nb-colorway="dark"]`）对用户自定义的配色一律失效。
     */
    function applyToDocument(id: Id): void {
        const vars = colorways[id];
        applyColorway(document.documentElement, vars);
        applyColorway(document.body, vars);
        document.documentElement.style.colorScheme = meta[id].appearance;
        document.documentElement.dataset.nbAppearance = meta[id].appearance;
    }

    function setColorway(id: Id): void {
        current.value = id;
        if (typeof document === "undefined") {
            return;
        }
        applyToDocument(id);
        try {
            localStorage.setItem(options.storageKey, id);
        } catch {
            // 隐私模式等场景 localStorage 不可用时静默忽略
        }
    }

    function initColorway(): void {
        if (typeof document === "undefined") {
            return;
        }
        let stored: string | null = null;
        try {
            stored = localStorage.getItem(options.storageKey);
        } catch {
            stored = null;
        }
        current.value = resolveStoredId(stored);
        applyToDocument(current.value);
    }

    return {
        current: readonly(current) as Readonly<Ref<Id>>,
        colorwayIds,
        colorwayMeta: meta,
        colorways,
        setColorway,
        initColorway,
    };
}
