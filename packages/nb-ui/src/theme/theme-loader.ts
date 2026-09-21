import type {Component} from "vue";
import type {NbColorwayVars} from "../colorway/colorway-contract";
import {nbColorwayVarKeys} from "../colorway/colorway-contract";
import type {ColorwayMeta} from "../colorway/colorway-store";
import {nbColorwayIds, nbColorwayMeta} from "../colorway/presets";
import {NB_UI_VERSION} from "../version";
import {NB_COMPONENT_CONTRACTS, isComponentKey, nbComponentKeys} from "./contracts";
import {satisfiesRange} from "./semver-range";
import {checkSvgDefs, collectSvgDefsIds, mountSvgDefs, unmountSvgDefs} from "./svg-defs";
import type {NbThemeManifest, NbThemeModule} from "./theme-manifest";
import {nbReservedTokens} from "./tokens";

/**
 * 主题装载器。
 *
 * 全部校验都是「**拒绝 + 明确报错**」，一条都不静默降级。理由是市场场景：
 * 写主题的人和改库的人不是同一个人，一个半装成功的主题在用户眼里就是产品的 bug，
 * 而且没有任何线索指回主题。宁可装不上并说清哪一条不满足。
 *
 * 装载 ≠ 激活。`installTheme` 只做登记（注入 fallback、收下配色与组件实现），
 * 哪一套当前生效由 `./theme-store.ts` 决定——市场形态下「装了 N 套、激活 1 套」是常态。
 */

export type NbThemeInstallReason =
    /** hostVersion 与当前 nb-ui 版本不匹配，或范围写法不受支持 */
    | "host-version"
    /** declares 里有一项没写 fallback */
    | "declaration-missing-fallback"
    /** declares 重复声明了配色契约或设计 token 已有的变量 */
    | "declaration-collides"
    /** overrides 里有不在契约登记表中的组件 key */
    | "unknown-component"
    /** overrides 的契约 id 与登记表的版本不符 */
    | "contract-mismatch"
    /** manifest 与运行期入口对不上：声明了覆盖却没给实现，或给了实现却没声明 */
    | "override-mismatch"
    /** 自带配色对不上：manifest 的 providesColorways 与入口给的表不符，或 defaultColorway 指向不存在的配色 */
    | "colorway-mismatch"
    /** svgDefs 含白名单以外的标签、事件属性或外部引用 */
    | "unsafe-svg-defs"
    /** svgDefs 里的 id 与另一套已装主题重名。id 是全文档级的，撞了会静默串用 */
    | "svg-defs-id-collides"
    /** 已经装过同 id 的主题 */
    | "duplicate-id";

export class NbThemeInstallError extends Error {
    readonly themeId: string;
    readonly reason: NbThemeInstallReason;

    constructor(themeId: string, reason: NbThemeInstallReason, message: string) {
        super(`主题 "${themeId}" 装载失败（${reason}）：${message}`);
        this.name = "NbThemeInstallError";
        this.themeId = themeId;
        this.reason = reason;
    }
}

export type InstalledTheme = {
    manifest: NbThemeManifest;
    components: Record<string, Component>;
    colorways: Record<string, NbColorwayVars>;
    colorwayMeta: Record<string, ColorwayMeta>;
    svgDefs?: string;
};

const installed = new Map<string, InstalledTheme>();

/** fallback 兜底层的 <style> 元素 id。所有已装主题的 declares 合并写在这一个元素里。 */
const FALLBACK_STYLE_ID = "nb-theme-var-fallbacks";

/** 已被占用的变量名：配色契约 + 设计 token。主题不能重复声明它们。 */
function reservedVarNames(): Set<string> {
    return new Set<string>([...(nbColorwayVarKeys as readonly string[]), ...(nbReservedTokens as readonly string[])]);
}

function validate(module: NbThemeModule): void {
    const {manifest} = module;
    const id = manifest.id;

    if (installed.has(id)) {
        throw new NbThemeInstallError(id, "duplicate-id", "同名主题已经装过，请先卸载");
    }

    // ① 宿主版本
    let hostOk: boolean;
    try {
        hostOk = satisfiesRange(NB_UI_VERSION, manifest.hostVersion);
    } catch (error) {
        throw new NbThemeInstallError(id, "host-version", error instanceof Error ? error.message : String(error));
    }
    if (!hostOk) {
        throw new NbThemeInstallError(
            id,
            "host-version",
            `要求宿主 "${manifest.hostVersion}"，当前 nb-ui 是 ${NB_UI_VERSION}`,
        );
    }

    // ② 变量声明必须自带 fallback，且不得与已有变量重名
    const reserved = reservedVarNames();
    for (const declaration of manifest.declares ?? []) {
        if (typeof declaration.fallback !== "string" || declaration.fallback.trim() === "") {
            throw new NbThemeInstallError(
                id,
                "declaration-missing-fallback",
                `变量 ${declaration.name} 没有 fallback。每个新变量都必须给一个能从配色契约派生的兜底值，` +
                    `否则换一套配色就会塌`,
            );
        }
        if (reserved.has(declaration.name)) {
            throw new NbThemeInstallError(
                id,
                "declaration-collides",
                `变量 ${declaration.name} 已经在配色契约或设计 token 里，主题只能给它新的取值，不能重新声明`,
            );
        }
    }

    // ③④ 组件覆盖：key 必须在登记表里，契约版本必须一致
    const overrides = manifest.overrides ?? {};
    for (const [key, contractId] of Object.entries(overrides)) {
        if (!isComponentKey(key)) {
            throw new NbThemeInstallError(
                id,
                "unknown-component",
                `组件 "${key}" 不在可覆盖登记表里。当前允许覆盖的是：${nbComponentKeys.join("、") || "（无）"}`,
            );
        }
        const expected = NB_COMPONENT_CONTRACTS[key];
        if (contractId !== expected) {
            throw new NbThemeInstallError(
                id,
                "contract-mismatch",
                `组件 "${key}" 声明的契约是 "${contractId}"，宿主当前是 "${expected}"。` +
                    `契约版本变了意味着 props / emits / 键盘行为变了，主题需要跟着更新`,
            );
        }
    }

    // manifest 与运行期入口必须对得上，否则市场索引到的能力与实际装出来的不是一回事
    const components = module.components ?? {};
    for (const key of Object.keys(overrides)) {
        if (!Object.hasOwn(components, key)) {
            throw new NbThemeInstallError(
                id,
                "override-mismatch",
                `manifest 声明覆盖了 "${key}"，但入口没有提供对应实现`,
            );
        }
    }
    for (const key of Object.keys(components)) {
        if (!Object.hasOwn(overrides, key)) {
            throw new NbThemeInstallError(
                id,
                "override-mismatch",
                `入口提供了 "${key}" 的实现，但 manifest 没有声明。manifest 是市场唯一能读到的东西，漏声明等于隐藏能力`,
            );
        }
    }

    // ⑤ 自带配色：manifest 与入口必须一一对上，默认配色必须指向真实存在的一套
    validateColorways(module);

    // ⑥ SVG 资源只能是静态图形定义
    if (module.svgDefs !== undefined) {
        const rejection = checkSvgDefs(module.svgDefs);
        if (rejection !== null) {
            throw new NbThemeInstallError(id, "unsafe-svg-defs", rejection.message);
        }
        validateSvgDefsIds(id, module.svgDefs);
    }
}

/**
 * SVG 资源的 id 不得与另一套已装主题重名。
 *
 * 与「两套主题声明同一个 CSS 变量名」刚好相反，那一条是**允许**的：CSS 变量按特异性分胜负，
 * 结果是确定的，而且重名本身是「配色契约漏了一个角色」的有用信号。SVG 的 id 没有这层机制——
 * `url(#x)` 取文档里第一个匹配的元素，谁先装谁赢，且换个装载顺序结果就变。
 *
 * 现象会是「装了 macos 之后 nbook 的边缘折射变弱了」，浏览器不报任何错。所以这里拒绝装载，
 * 并直接告诉作者该怎么改（加主题前缀），而不是留给他去猜。
 */
function validateSvgDefsIds(themeId: string, markup: string): void {
    const incoming = collectSvgDefsIds(markup);
    if (incoming.length === 0) {
        return;
    }

    for (const theme of installed.values()) {
        if (theme.svgDefs === undefined) {
            continue;
        }
        const taken = new Set(collectSvgDefsIds(theme.svgDefs));
        const collided = incoming.filter((id) => taken.has(id));
        if (collided.length > 0) {
            throw new NbThemeInstallError(
                themeId,
                "svg-defs-id-collides",
                `svgDefs 里的 ${collided.join("、")} 与已装主题 "${theme.manifest.id}" 重名。`
                    + `SVG 的 id 是全文档级的，重名时 url(#id) 会取先装的那一套且不报错。`
                    + `请给 id 加上主题前缀，例如 "${themeId}-${collided[0]}"`,
            );
        }
    }
}

/**
 * 自带配色的一致性校验。
 *
 * 与 override-mismatch 同源：manifest 是市场唯一能读到的东西，它说有两套配色而实际装出来
 * 只有一套，用户在市场页看到的就是假的。默认配色写错则表现为「装上后颜色不对」——
 * 静默降级的话没有任何线索指回主题。
 */
function validateColorways(module: NbThemeModule): void {
    const {manifest} = module;
    const id = manifest.id;
    const declared = manifest.providesColorways ?? [];
    const provided = Object.keys(module.colorways ?? {});

    for (const colorwayId of declared) {
        if (!provided.includes(colorwayId)) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `manifest 声明自带配色 "${colorwayId}"，但入口没有给出它的取值表`,
            );
        }
    }
    for (const colorwayId of provided) {
        if (!declared.includes(colorwayId)) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `入口给了配色 "${colorwayId}" 的取值，但 manifest 的 providesColorways 没有列出它`,
            );
        }
        if (!Object.hasOwn(module.colorwayMeta ?? {}, colorwayId)) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `配色 "${colorwayId}" 缺 colorwayMeta。展示名和明暗归属都在 meta 里，缺了它主题就无法按明暗分档`,
            );
        }
        // 覆盖内置 id 会让「切到 dark」在装不装这个主题时得到两种颜色，且用户无从知道原因
        if ((nbColorwayIds as readonly string[]).includes(colorwayId)) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `配色 "${colorwayId}" 与内置配色重名。请换一个带主题前缀的 id，例如 "${manifest.id}-${colorwayId}"`,
            );
        }
    }

    const fallback = manifest.defaultColorway;
    if (fallback === undefined) {
        return;
    }
    for (const [slot, colorwayId] of Object.entries(fallback) as ["light" | "dark", string][]) {
        const own = module.colorwayMeta?.[colorwayId];
        const builtin = (nbColorwayMeta as Record<string, ColorwayMeta>)[colorwayId];
        const meta = own ?? builtin;
        if (meta === undefined) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `defaultColorway.${slot} 指向 "${colorwayId}"，它既不在本主题自带的配色里，也不是内置配色`,
            );
        }
        if (meta.appearance !== slot) {
            throw new NbThemeInstallError(
                id,
                "colorway-mismatch",
                `defaultColorway.${slot} 指向 "${colorwayId}"，但它的 appearance 是 ${meta.appearance}`,
            );
        }
    }
}

/**
 * 把所有已装主题的变量声明重新写进兜底层。
 *
 * 选择器用 `:root`（0,1,0），主题自己的取值用 `:root[data-nb-theme="x"]`（0,2,0），
 * 靠特异性分胜负，与两者的引入顺序无关。
 *
 * 两套主题声明同一个变量名是**允许**的（macos 与 aurora 都要 --window-backdrop），
 * 此时后装的 fallback 覆盖先装的。不拒绝，是因为这不是错误而是信号：按
 * NbThemeVarDeclaration 的判据，两套以上主题都要用的变量说明配色契约漏了一个角色，
 * 该去补契约。拒绝只会逼作者改名，把信号藏起来。
 */
function syncFallbackStyles(): void {
    if (typeof document === "undefined") {
        return;
    }

    const declarations: string[] = [];
    for (const theme of installed.values()) {
        for (const declaration of theme.manifest.declares ?? []) {
            declarations.push(`    ${declaration.name}: ${declaration.fallback};`);
        }
    }

    let element = document.getElementById(FALLBACK_STYLE_ID);
    if (declarations.length === 0) {
        element?.remove();
        return;
    }
    if (element === null) {
        element = document.createElement("style");
        element.id = FALLBACK_STYLE_ID;
        document.head.append(element);
    }
    element.textContent = `:root {\n${declarations.join("\n")}\n}\n`;
}

/**
 * 装载一个主题包。
 *
 * @throws {NbThemeInstallError} 任意一条校验不过时抛出，不会半装
 */
export function installTheme(module: NbThemeModule): InstalledTheme {
    validate(module);

    const entry: InstalledTheme = {
        manifest: module.manifest,
        components: {...(module.components ?? {})},
        colorways: {...(module.colorways ?? {})},
        colorwayMeta: {...(module.colorwayMeta ?? {})},
        svgDefs: module.svgDefs,
    };
    installed.set(module.manifest.id, entry);
    syncFallbackStyles();
    if (module.svgDefs !== undefined) {
        mountSvgDefs(module.manifest.id, module.svgDefs);
    }
    return entry;
}

export function uninstallTheme(id: string): boolean {
    const removed = installed.delete(id);
    if (removed) {
        syncFallbackStyles();
        unmountSvgDefs(id);
    }
    return removed;
}

export function getInstalledTheme(id: string): InstalledTheme | undefined {
    return installed.get(id);
}

/** 按装载顺序返回。主题选择器直接遍历它，不必再维护一份名单。 */
export function getInstalledThemes(): InstalledTheme[] {
    return [...installed.values()];
}

export function isThemeInstalled(id: string): boolean {
    return installed.has(id);
}

/**
 * 汇总所有已装主题自带的配色，供配色 store 与内置 5 套合并。
 *
 * 主题带配色是常见需求（macOS 那套玻璃在通用暗色下发灰），但配色 store 的表在创建时就定死了，
 * 所以合并这一步必须由消费方做。给个 helper 免得每个消费方各写一遍 reduce。
 * 同 id 时后装的主题覆盖先装的——与 `{...a, ...b}` 的直觉一致。
 */
export function collectThemeColorways(): {
    colorways: Record<string, NbColorwayVars>;
    colorwayMeta: Record<string, ColorwayMeta>;
} {
    const colorways: Record<string, NbColorwayVars> = {};
    const colorwayMeta: Record<string, ColorwayMeta> = {};
    for (const theme of installed.values()) {
        Object.assign(colorways, theme.colorways);
        Object.assign(colorwayMeta, theme.colorwayMeta);
    }
    return {colorways, colorwayMeta};
}

/** 清空登记表。给测试用，产品代码不该调用。 */
export function resetInstalledThemes(): void {
    for (const id of installed.keys()) {
        unmountSvgDefs(id);
    }
    installed.clear();
    syncFallbackStyles();
}
