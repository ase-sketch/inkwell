import {computed, readonly, ref} from "vue";
import type {ComputedRef, Ref} from "vue";
import type {Component} from "vue";
import {getInstalledTheme, getInstalledThemes} from "./theme-loader";
import type {InstalledTheme} from "./theme-loader";

/**
 * 主题会话：已装主题里当前激活哪一套。
 *
 * 与配色 store（`src/colorway/colorway-store.ts`）是两条独立的轴：配色管颜色，
 * 主题管形状 / 节奏 / 装饰 / 角色映射，任意组合都应该成立。
 *
 * 「一个主题都没装」和「装了但没激活」都是**受支持的状态**，不是降级：
 * 此时 `src/tokens.css` 的裸 `:root` 默认值生效，界面能用，只是没有设计感。
 * 所以这里不做「找不到就回退到第一个」这种自作主张——`current` 为 null 就是 null。
 */

export type ThemeStore = {
    /** 当前激活的主题 id；null = 没有激活任何主题 */
    current: Readonly<Ref<string | null>>;
    /** 当前主题的完整登记项，未激活时为 undefined */
    active: ComputedRef<InstalledTheme | undefined>;
    /** 已装主题列表（按装载顺序） */
    themes: ComputedRef<InstalledTheme[]>;
    /** 当前主题提供的组件覆盖表，未激活时是空对象 */
    components: ComputedRef<Record<string, Component>>;
    setTheme: (id: string | null) => void;
    /** app 根组件挂载时调用一次：从 localStorage 恢复上次选择并应用 */
    initTheme: () => void;
};

export type ThemeStoreOptions = {
    /** localStorage 键，各消费应用唯一（如 "nb-template-theme"） */
    storageKey: string;
    /** 首次进入时激活哪一套；不给则不激活任何主题 */
    defaultId?: string;
    /** 已下线主题 id 的迁移映射，只作用于读取旧的持久化值 */
    aliases?: Record<string, string>;
};

export function createThemeStore(options: ThemeStoreOptions): ThemeStore {
    const current = ref<string | null>(null);
    // 已装主题是模块层可变状态，用一个计数把它接进响应式系统，免得列表变了 UI 不更新
    const revision = ref(0);

    const themes = computed(() => {
        void revision.value;
        return getInstalledThemes();
    });
    const active = computed(() => {
        void revision.value;
        return current.value === null ? undefined : getInstalledTheme(current.value);
    });
    const components = computed(() => active.value?.components ?? {});

    /**
     * 只写 `data-nb-theme`。明暗分档由配色 store 写的 `data-nb-appearance` 承担——
     * 主题要响应的是配色的**明暗属性**，不是配色的**身份**，绑身份对自定义配色一律失效。
     */
    function applyToDocument(id: string | null): void {
        if (id === null) {
            delete document.documentElement.dataset.nbTheme;
            return;
        }
        document.documentElement.dataset.nbTheme = id;
    }

    function resolveStoredId(value: string | null): string | null {
        if (value === null) {
            return options.defaultId ?? null;
        }
        const aliased = options.aliases?.[value] ?? value;
        // 没装的主题不激活，也不静默换成别的：切回来的路径是把它装上，不是猜一个替身
        return getInstalledTheme(aliased) === undefined ? (options.defaultId ?? null) : aliased;
    }

    function setTheme(id: string | null): void {
        current.value = id;
        revision.value += 1;
        if (typeof document === "undefined") {
            return;
        }
        applyToDocument(id);
        try {
            if (id === null) {
                localStorage.removeItem(options.storageKey);
            } else {
                localStorage.setItem(options.storageKey, id);
            }
        } catch {
            // 隐私模式等场景 localStorage 不可用时静默忽略
        }
    }

    function initTheme(): void {
        if (typeof document === "undefined") {
            return;
        }
        let stored: string | null = null;
        try {
            stored = localStorage.getItem(options.storageKey);
        } catch {
            stored = null;
        }
        setTheme(resolveStoredId(stored));
    }

    return {
        current: readonly(current) as Readonly<Ref<string | null>>,
        active,
        themes,
        components,
        setTheme,
        initTheme,
    };
}
