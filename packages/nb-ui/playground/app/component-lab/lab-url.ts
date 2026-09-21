import {
    getLabComponent,
    isLabComponentId,
    isLabViewportId,
    labComponents,
    type LabComponentId,
    type LabViewportId,
} from "./registry";

/** 裸基线主题的显式 URL 值：不用空参数表示「没装主题」，链接才具备可复现性 */
export const LAB_BARE_THEME = "bare";

export type LabUrlState = {
    component: LabComponentId;
    scene: string;
    viewport: LabViewportId;
    /** LAB_BARE_THEME 或已装主题 id；归一化后永不缺省 */
    theme: string;
    /** 已登记配色 id；归一化后永不缺省 */
    colorway: string;
};

export type LabNormalizeContext = {
    themeIds: readonly string[];
    colorwayIds: readonly string[];
    /** URL 未指定（或非法）时继承的当前值，通常是 store 现状 */
    fallbackTheme: string;
    fallbackColorway: string;
};

function queryString(value: unknown): string | null {
    return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 非法 URL 值首屏归一化：component/scene/viewport 落到登记表的默认值，
 * theme/colorway 继承 fallback（store 当前值）。纯函数，vitest 直接覆盖矩阵。
 */
export function normalizeLabQuery(query: Record<string, unknown>, ctx: LabNormalizeContext): LabUrlState {
    const rawComponent = queryString(query.component);
    const component: LabComponentId = rawComponent !== null && isLabComponentId(rawComponent) ? rawComponent : labComponents[0]!.id;

    const scenes = getLabComponent(component).scenes;
    const rawScene = queryString(query.scene);
    const scene = rawScene !== null && scenes.some((candidate) => candidate.id === rawScene) ? rawScene : scenes[0]!.id;

    const rawViewport = queryString(query.viewport);
    const viewport: LabViewportId = rawViewport !== null && isLabViewportId(rawViewport) ? rawViewport : "responsive";

    const rawTheme = queryString(query.theme);
    const theme = rawTheme === LAB_BARE_THEME || (rawTheme !== null && ctx.themeIds.includes(rawTheme)) ? rawTheme : ctx.fallbackTheme;

    const rawColorway = queryString(query.colorway);
    const colorway = rawColorway !== null && ctx.colorwayIds.includes(rawColorway) ? rawColorway : ctx.fallbackColorway;

    return {component, scene, viewport, theme, colorway};
}
