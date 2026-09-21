/**
 * 检查器内核：读真实目标元素的计算样式与 DOM 属性，做结构检查。
 * 纯函数、与 Vue 解耦，UI 层（LabChecks）只负责渲染结果。
 */

export type LabReadoutItem = {
    label: string;
    value: string;
    /** 颜色类读数携带的色板值，UI 渲染 swatch */
    swatch?: string;
};

export type LabReadoutGroup = {
    id: string;
    label: string;
    items: LabReadoutItem[];
};

export type LabCheck = {
    label: string;
    pass: boolean;
    detail: string;
};

export type LabInspection = {
    groups: LabReadoutGroup[];
    checks: LabCheck[];
};

function attr(element: HTMLElement, name: string): string {
    return element.getAttribute(name) ?? "—";
}

function accessibleName(element: HTMLElement): string {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
        const text = labelledBy.split(/\s+/u).map((id) => document.getElementById(id)?.textContent ?? "").join(" ").trim();
        if (text) return text;
    }
    if (element.id) {
        const label = Array.from(document.querySelectorAll("label")).find((candidate) => candidate.htmlFor === element.id);
        if (label?.textContent?.trim()) return label.textContent.trim();
    }
    return element.closest("label")?.textContent?.trim() || element.textContent?.trim() || "";
}

/**
 * @param sceneInvalid 当前场景是否要求 invalid 语义（registry 的场景 flag，不做字符串匹配）
 * @param canvas 预览画布元素；预览边界检查用 rect 包含判定。portal 出去的浮层不纳入。
 */
export function inspectTarget(
    element: HTMLElement | null,
    canvas: HTMLElement | null,
    sceneInvalid: boolean,
    targetSelector: string,
): LabInspection {
    if (element === null) {
        return {
            groups: [],
            checks: [{label: "目标存在", pass: false, detail: targetSelector}],
        };
    }

    const styles = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const groups: LabReadoutGroup[] = [
        {id: "size", label: "尺寸", items: [
            {label: "尺寸", value: `${Math.round(rect.width)} × ${Math.round(rect.height)} px`},
            {label: "内边距", value: styles.padding},
        ]},
        {id: "color", label: "颜色", items: [
            {label: "背景", value: styles.backgroundColor, swatch: styles.backgroundColor},
            {label: "文字", value: styles.color, swatch: styles.color},
        ]},
        {id: "border", label: "描边与圆角", items: [
            {label: "描边", value: styles.border},
            {label: "圆角", value: styles.borderRadius},
        ]},
        {id: "effects", label: "阴影与滤镜", items: [
            {label: "阴影", value: styles.boxShadow || "none"},
            {label: "背景滤镜", value: styles.backdropFilter || "none"},
        ]},
        {id: "type", label: "排版", items: [
            {label: "字体", value: styles.fontFamily},
            {label: "字号", value: styles.fontSize},
            {label: "行高", value: styles.lineHeight},
        ]},
        {id: "aria", label: "ARIA 与属性", items: [
            {label: "role", value: attr(element, "role")},
            {label: "可访问名称", value: accessibleName(element) || "—"},
            {label: "id", value: element.id || "—"},
            {label: "aria-describedby", value: attr(element, "aria-describedby")},
            {label: "aria-invalid", value: attr(element, "aria-invalid")},
            {label: "aria-expanded", value: attr(element, "aria-expanded")},
            {label: "aria-checked", value: attr(element, "aria-checked")},
            {label: "disabled", value: attr(element, "disabled")},
            {label: "readonly", value: attr(element, "readonly")},
        ]},
    ];

    const idCount = element.id === "" ? 0 : Array.from(document.querySelectorAll("[id]")).filter((candidate) => candidate.id === element.id).length;
    const describedBy = (element.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean);
    const describedByExists = describedBy.every((id) => document.getElementById(id) !== null);
    const invalidActual = element.getAttribute("aria-invalid") === "true";
    const expanded = element.getAttribute("aria-expanded");
    const isCombobox = element.getAttribute("role") === "combobox";
    const listboxExists = document.querySelector("[role='listbox']") !== null;
    const name = accessibleName(element);

    // 预览边界：rect 包含判定（1px 容差），替代旧的 scrollWidth 弱判定
    const fitsCanvas = canvas === null
        || (rect.left >= canvas.getBoundingClientRect().left - 1 && rect.right <= canvas.getBoundingClientRect().right + 1);

    const checks: LabCheck[] = [
        {label: "目标存在", pass: true, detail: targetSelector},
        {label: "可访问名称", pass: name.length > 0, detail: name || "缺少名称"},
        {label: "id 唯一", pass: element.id === "" || idCount === 1, detail: element.id ? `${element.id} × ${idCount}` : "未设置 id"},
        {label: "aria-describedby 引用", pass: describedByExists, detail: describedBy.length === 0 ? "未设置" : describedBy.join(", ")},
        {label: "invalid 语义", pass: !sceneInvalid || invalidActual, detail: sceneInvalid ? `期望 true，实际 ${attr(element, "aria-invalid")}` : "当前场景不要求"},
        {label: "combobox 展开关系", pass: !isCombobox || expanded !== "true" || listboxExists, detail: !isCombobox ? "目标不是 combobox" : expanded === "true" ? `listbox ${listboxExists ? "存在" : "缺失"}` : "未展开"},
        {label: "预览边界", pass: fitsCanvas, detail: fitsCanvas ? "未超出预览边界" : "目标超出预览边界"},
    ];

    return {groups, checks};
}
