import {NB_UI_COLORWAY_HOST_CLASS, type NbColorwayVars} from "./colorway-contract";

/**
 * 将配色变量应用到指定 DOM 节点。
 */
export function applyColorwayVars(target: HTMLElement, vars: NbColorwayVars): void {
    for (const [key, value] of Object.entries(vars)) {
        if (typeof value === "string") {
            target.style.setProperty(key, value);
        }
    }
}

/**
 * 应用 nb-ui 配色变量，并确保目标节点带有配色宿主 class。
 */
export function applyColorway(target: HTMLElement, vars: NbColorwayVars): void {
    target.classList.add(NB_UI_COLORWAY_HOST_CLASS);
    applyColorwayVars(target, vars);
}
