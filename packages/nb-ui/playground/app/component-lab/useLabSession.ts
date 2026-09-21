import {nextTick, onMounted, ref, watch} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useColorway} from "../composables/useColorway";
import {useTheme} from "../composables/useTheme";
import {LAB_BARE_THEME, normalizeLabQuery, type LabNormalizeContext, type LabUrlState} from "./lab-url";
import {getLabComponent, labComponents, type LabComponentId, type LabViewportId} from "./registry";

function queryString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * /lab 的 URL 状态合同：component、scene、viewport 进 URL 可复现；
 * theme、colorway 以 store 为运行时载体、以 URL 为真相源双向同步。
 *
 * 时序要点：app.vue 的 initTheme/initColorway 在**父级** onMounted 里，而子组件的
 * mounted 先触发——所以首屏归一化等一个 nextTick，让 store 从 localStorage 恢复完，
 * 再拿真实当前值做归一化 fallback。
 */
export function useLabSession() {
    const route = useRoute();
    const router = useRouter();
    const theme = useTheme();
    const colorway = useColorway();

    const componentId = ref<LabComponentId>(labComponents[0]!.id);
    const sceneId = ref(labComponents[0]!.scenes[0]!.id);
    const viewportId = ref<LabViewportId>("responsive");
    // 首屏归一化完成前不写 URL，避免把未归一化的状态刷进地址栏
    const ready = ref(false);

    function themeUrlValue(): string {
        return theme.current.value ?? LAB_BARE_THEME;
    }

    function context(): LabNormalizeContext {
        return {
            themeIds: theme.themes.value.map((installed) => installed.manifest.id),
            colorwayIds: colorway.colorwayIds,
            fallbackTheme: themeUrlValue(),
            fallbackColorway: colorway.current.value,
        };
    }

    function currentState(): LabUrlState {
        return {
            component: componentId.value,
            scene: sceneId.value,
            viewport: viewportId.value,
            theme: themeUrlValue(),
            colorway: colorway.current.value,
        };
    }

    function routeMatches(state: LabUrlState): boolean {
        return queryString(route.query.component) === state.component
            && queryString(route.query.scene) === state.scene
            && queryString(route.query.viewport) === state.viewport
            && queryString(route.query.theme) === state.theme
            && queryString(route.query.colorway) === state.colorway;
    }

    /** 把归一化结果应用到本地 ref 与两个 store；所有赋值先比较，幂等 */
    function applyState(state: LabUrlState): void {
        if (componentId.value !== state.component) componentId.value = state.component;
        if (sceneId.value !== state.scene) sceneId.value = state.scene;
        if (viewportId.value !== state.viewport) viewportId.value = state.viewport;
        const storeTheme = state.theme === LAB_BARE_THEME ? null : state.theme;
        if (theme.current.value !== storeTheme) theme.setTheme(storeTheme);
        if (colorway.current.value !== state.colorway) colorway.setColorway(state.colorway);
    }

    function replaceUrl(state: LabUrlState): void {
        void router.replace({query: {
            component: state.component,
            scene: state.scene,
            viewport: state.viewport,
            theme: state.theme,
            colorway: state.colorway,
        }});
    }

    function syncFromRoute(): void {
        const state = normalizeLabQuery(route.query, context());
        applyState(state);
        // 归一化结果与地址栏有差异立即 replace：非法值不停留在首屏 URL 里
        if (!routeMatches(state)) replaceUrl(state);
    }

    onMounted(() => {
        void nextTick(() => {
            syncFromRoute();
            ready.value = true;
        });
    });

    // 外部导航（后退/前进/打开分享链接）→ 重新归一化并应用
    watch(() => route.query, () => {
        if (!ready.value) return;
        syncFromRoute();
    });

    // 本地操作与全局 header 切换 → 回写 URL（replace 前比较，不循环）
    watch([componentId, sceneId, viewportId, theme.current, colorway.current], () => {
        if (!ready.value) return;
        const state = currentState();
        if (!routeMatches(state)) replaceUrl(state);
    }, {flush: "post"});

    // 切组件时场景落到新组件的默认场景
    watch(componentId, (next) => {
        const scenes = getLabComponent(next).scenes;
        if (!scenes.some((scene) => scene.id === sceneId.value)) sceneId.value = scenes[0]!.id;
    });

    return {
        componentId,
        sceneId,
        viewportId,
        ready,
        setComponent: (id: LabComponentId) => { componentId.value = id; },
        setScene: (id: string) => { sceneId.value = id; },
        setViewport: (id: LabViewportId) => { viewportId.value = id; },
        setThemeValue: (value: string) => { theme.setTheme(value === LAB_BARE_THEME ? null : value); },
        setColorwayValue: (id: string) => { colorway.setColorway(id); },
        themeUrlValue,
    };
}
