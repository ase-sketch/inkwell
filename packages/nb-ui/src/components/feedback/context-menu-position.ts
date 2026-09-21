/**
 * 右键菜单视口边界计算（纯函数，便于单测）。
 */

export type MenuSize = {width: number; height: number};
export type ViewportSize = {width: number; height: number};

/**
 * 把主菜单位置钳制进视口：右/下溢出时向内收，最小不小于 padding。
 */
export function clampMenuPosition(x: number, y: number, menu: MenuSize, viewport: ViewportSize, padding = 8): {x: number; y: number} {
    let nextX = x;
    let nextY = y;
    if (x + menu.width > viewport.width - padding) {
        nextX = viewport.width - menu.width - padding;
    }
    if (y + menu.height > viewport.height - padding) {
        nextY = viewport.height - menu.height - padding;
    }
    return {x: Math.max(padding, nextX), y: Math.max(padding, nextY)};
}

export type SubmenuAnchor = {top: number; left: number; right: number};

/**
 * 计算子菜单位置：默认贴在父项右侧（overlap 像素咬合），
 * 右侧放不下时翻到父项左侧，底部溢出时贴底，最终钳制进视口。
 */
export function computeSubmenuPosition(anchor: SubmenuAnchor, submenu: MenuSize, viewport: ViewportSize, padding = 8, overlap = 1): {x: number; y: number} {
    let nextX = anchor.right - overlap;
    let nextY = anchor.top - 4;
    if (nextX + submenu.width > viewport.width - padding) {
        nextX = anchor.left - submenu.width + overlap;
    }
    if (nextY + submenu.height > viewport.height - padding) {
        nextY = viewport.height - submenu.height - padding;
    }
    return {x: Math.max(padding, nextX), y: Math.max(padding, nextY)};
}
