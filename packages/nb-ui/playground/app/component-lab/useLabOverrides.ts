import {computed, onBeforeUnmount, onMounted, ref, watch} from "vue";
import type {ComputedRef} from "vue";
import {
    parseLabOverrideSnapshot,
    serializeLabOverrideSnapshot,
} from "./lab-overrides";

const STORAGE_KEY = "nb-ui-component-lab-overrides-v1";

/** e2e 与调试共用的断言锚点：离开 /lab 后这两样都必须不存在 */
export const LAB_STYLE_ID = "nb-ui-component-lab-overrides";
export const LAB_ACTIVE_ATTR = "data-nb-lab-active";

/**
 * /lab 的 CSS 变量覆盖层。
 *
 * 合同四条：
 * 1. 只在 /lab 生效——覆盖写进独立 <style>，挂 `:root[data-nb-lab-active]` 作用域，
 *    不碰主题 store 的 data-nb-theme 与配色 store 的 data-nb-appearance，源数据零交集。
 * 2. 本地草稿持久化在 localStorage，进入页面时恢复；草稿损坏只警告不阻塞。
 * 3. 离开页面（组件卸载）立即移除 style 元素与 data 属性，无残留。
 * 4. 导入是原子的：整份快照校验通过才替换，任何非法项拒绝且旧覆盖保持不变。
 */
export function useLabOverrides(allowedNames: ComputedRef<ReadonlySet<string>>) {
    const overrides = ref<Record<string, string>>({});
    const hydrated = ref(false);
    const count = computed(() => Object.keys(overrides.value).length);

    function renderLayer(): void {
        if (typeof document === "undefined") return;
        let style = document.getElementById(LAB_STYLE_ID) as HTMLStyleElement | null;
        if (style === null) {
            style = document.createElement("style");
            style.id = LAB_STYLE_ID;
            document.head.appendChild(style);
        }
        const declarations = Object.entries(overrides.value)
            .map(([name, value]) => `    ${name}: ${value} !important;`)
            .join("\n");
        style.textContent = declarations.length === 0
            ? ""
            : `:root[data-nb-lab-active], :root[data-nb-lab-active] body {\n${declarations}\n}`;
        document.documentElement.dataset.nbLabActive = "";
    }

    function setOverride(name: string, value: string): void {
        if (!allowedNames.value.has(name)) {
            throw new Error(`未登记的变量：${name}`);
        }
        if (value.trim() === "") {
            const next = {...overrides.value};
            delete next[name];
            overrides.value = next;
            return;
        }
        const next = parseLabOverrideSnapshot(serializeLabOverrideSnapshot({[name]: value}), new Set([name]));
        overrides.value = {...overrides.value, ...next};
    }

    function resetOverride(name: string): void {
        const next = {...overrides.value};
        delete next[name];
        overrides.value = next;
    }

    function resetAll(): void {
        overrides.value = {};
    }

    function importSnapshot(raw: string): number {
        const next = parseLabOverrideSnapshot(raw, allowedNames.value);
        overrides.value = next;
        return Object.keys(next).length;
    }

    function exportSnapshot(): string {
        return serializeLabOverrideSnapshot(overrides.value);
    }

    onMounted(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored !== null) importSnapshot(stored);
        } catch (error) {
            console.warn("[nb-ui lab] 无法恢复变量草稿", error);
        } finally {
            hydrated.value = true;
            renderLayer();
        }
    });

    watch(overrides, () => {
        renderLayer();
        if (!hydrated.value) return;
        try {
            localStorage.setItem(STORAGE_KEY, exportSnapshot());
        } catch (error) {
            console.warn("[nb-ui lab] 无法保存变量草稿", error);
        }
    }, {deep: true});

    onBeforeUnmount(() => {
        if (typeof document === "undefined") return;
        document.getElementById(LAB_STYLE_ID)?.remove();
        delete document.documentElement.dataset.nbLabActive;
    });

    return {
        overrides,
        count,
        setOverride,
        resetOverride,
        resetAll,
        importSnapshot,
        exportSnapshot,
    };
}
