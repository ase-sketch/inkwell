/**
 * 主题 SVG 资源的校验与注入。
 *
 * 为什么需要这条通道：滤镜、渐变、遮罩这类东西只能在文档里定义、只能被 CSS 用 `url("#id")`
 * 引用——Liquid Glass 的边缘折射靠 `feDisplacementMap`，纯 CSS 表达不出来。没有这条通道，
 * 一个只想做「玻璃」的声明式主题就得升到插件档，那是为了一段静态标记付了执行任意 JS 的代价。
 *
 * 为什么要白名单：注入第三方标记等于给了它一块 DOM。SVG 里可以写 `<script>`、
 * `<foreignObject>` 里可以塞 HTML、`on*` 属性可以挂事件、`<use href>` 能拉外部文档。
 * 所以只放行画滤镜和渐变真正需要的那批标签，其余**拒绝装载并说明是哪一个**。
 *
 * 这不是沙箱，也不冒充沙箱：它只把第一档主题的资源面收窄到「静态图形定义」。
 * 第二、三档（带 JS）的安全边界要靠市场侧的审核与签名，不在这一层。
 */

/** 放行的标签：滤镜原语 + 渐变 + 基础图元 + 容器。 */
const ALLOWED_TAGS = new Set([
    "svg",
    "defs",
    "filter",
    "femerge",
    "femergenode",
    "feimage",
    "fedisplacementmap",
    "fegaussianblur",
    "fecolormatrix",
    "fecomposite",
    "feblend",
    "feflood",
    "feoffset",
    "feturbulence",
    "fedropshadow",
    "fetile",
    "fecomponenttransfer",
    "fefunca",
    "fefuncb",
    "fefuncg",
    "fefuncr",
    "lineargradient",
    "radialgradient",
    "stop",
    "mask",
    "clippath",
    "pattern",
    "g",
    "rect",
    "circle",
    "ellipse",
    "path",
    "polygon",
    "polyline",
    "line",
]);

export type SvgDefsRejection = {tag?: string; attribute?: string; message: string};

/**
 * 取出一段 SVG 资源里定义的所有 id。
 *
 * 用途是**跨主题查重**。每套主题的资源各占一个隐藏容器，但容器不隔离 id——id 在整个文档里
 * 是全局的。两套主题都定义 `<filter id="nb-lens">` 时，文档里就有两个同 id 元素，
 * CSS 的 `url(#nb-lens)` 静默解析到先装的那一个：表现是「装了 A 之后 B 的折射强度变了」，
 * 没有任何报错，也没有任何线索指回主题。所以这一条必须在装载时就拒掉。
 *
 * 只看顶层与 defs 里的定义即可——嵌在滤镜内部的渐变 id 同样是全局的，所以一律收进来。
 */
export function collectSvgDefsIds(markup: string): string[] {
    if (typeof DOMParser === "undefined") {
        // 非浏览器环境（SSR / 构建期）不注入，也就不会撞
        return [];
    }

    const document_ = new DOMParser().parseFromString(
        `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`,
        "image/svg+xml",
    );
    if (document_.querySelector("parsererror") !== null) {
        return [];
    }

    const ids: string[] = [];
    for (const element of document_.querySelectorAll("[id]")) {
        const id = element.getAttribute("id");
        if (id !== null && id !== "") {
            ids.push(id);
        }
    }
    return ids;
}

/**
 * 校验一段 SVG 标记是否只含放行的静态图形定义。
 *
 * @returns 通过时返回 null，否则返回可读的拒绝原因
 */
export function checkSvgDefs(markup: string): SvgDefsRejection | null {
    if (typeof DOMParser === "undefined") {
        // 非浏览器环境（SSR / 构建期）不做校验，因为也不会注入
        return null;
    }

    const document_ = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`, "image/svg+xml");
    const parseError = document_.querySelector("parsererror");
    if (parseError !== null) {
        return {message: `SVG 解析失败：${parseError.textContent?.trim() ?? "标记不是合法的 XML"}`};
    }

    for (const element of document_.querySelectorAll("*")) {
        const tag = element.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
            return {tag, message: `<${tag}> 不在 SVG 资源白名单里`};
        }
        for (const attribute of element.attributes) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith("on")) {
                return {tag, attribute: attribute.name, message: `<${tag}> 上的事件属性 ${attribute.name} 不允许出现`};
            }
            // href 只放行文档内引用与 data URI：外部 URL 会把主题变成一个可追踪的外链
            if ((name === "href" || name === "xlink:href") && !/^(#|data:)/.test(attribute.value.trim())) {
                return {
                    tag,
                    attribute: attribute.name,
                    message: `<${tag}> 的 ${attribute.name} 只能指向文档内片段（#id）或 data URI`,
                };
            }
        }
    }

    return null;
}

/** 每个主题的 SVG 资源各占一个隐藏容器，按主题 id 挂载与移除。 */
function containerId(themeId: string): string {
    return `nb-theme-svg-${themeId}`;
}

export function mountSvgDefs(themeId: string, markup: string): void {
    if (typeof document === "undefined") {
        return;
    }

    let host = document.getElementById(containerId(themeId));
    if (host === null) {
        host = document.createElementNS("http://www.w3.org/2000/svg", "svg") as unknown as HTMLElement;
        host.id = containerId(themeId);
        host.setAttribute("width", "0");
        host.setAttribute("height", "0");
        host.setAttribute("aria-hidden", "true");
        host.setAttribute("focusable", "false");
        host.setAttribute("style", "position:absolute");
        document.body.append(host);
    }
    host.innerHTML = markup;
}

export function unmountSvgDefs(themeId: string): void {
    if (typeof document === "undefined") {
        return;
    }
    document.getElementById(containerId(themeId))?.remove();
}
