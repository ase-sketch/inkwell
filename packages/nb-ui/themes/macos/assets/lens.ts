/**
 * Liquid Glass 的边缘折射（lensing）位移图与两档滤镜。
 *
 * 为什么这是**资源**而不是样式：feDisplacementMap 只能定义在文档里，CSS 只能用
 * `url("#nb-lens")` 引用它。没有主题资源这条通道，一个只想做玻璃的声明式主题就得升到
 * 插件档——为了一段静态标记付出执行任意 JS 的代价。
 *
 * Apple 的 Liquid Glass 与旧式 vibrancy 的**根本区别**就在这里：旧材料只是把背景均匀散焦，
 * Liquid Glass 会在边缘把背景**弯曲、挤压**，靠折射而不是靠白边来表达轮廓。
 * 只做 `blur + 白色半透明` 得到的是 2013 年式 frosted glass，不是 Liquid Glass。
 *
 * 做法：feDisplacementMap 按位移图的 R 通道移 x、G 通道移 y（128 = 不动）。
 * 这张图中间留 128、四边推到 0/255，位移因此**只集中在边缘**，正是玻璃的 rim lensing。
 * 两个渐变分别只画红、只画绿，再用 screen 合成——screen 对 0 是恒等，所以能干净地
 * 把 R 与 G 装进同一张图而互不污染。
 *
 * 两档强度对应容器尺寸——Apple 的规则是大块玻璃折射更明显。
 *
 * 兼容性写在明处：`backdrop-filter: url(#...)` **只有 Chromium 支持**，Safari / Firefox 都不支持
 * （WebKit bug 245510 长期未解）。所以 vars.css 把它放在 @supports 分支里做渐进增强，
 * 退化后仍有镜面高光，不是必需项。
 */
const LENS_MAP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" preserveAspectRatio="none">
<defs>
<linearGradient id="x" x1="0" y1="0" x2="1" y2="0">
<stop offset="0" stop-color="#ff0000"/><stop offset="0.18" stop-color="#800000"/>
<stop offset="0.82" stop-color="#800000"/><stop offset="1" stop-color="#000000"/>
</linearGradient>
<linearGradient id="y" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#00ff00"/><stop offset="0.18" stop-color="#008000"/>
<stop offset="0.82" stop-color="#008000"/><stop offset="1" stop-color="#000000"/>
</linearGradient>
</defs>
<rect width="240" height="240" fill="url(#x)"/>
<rect width="240" height="240" fill="url(#y)" style="mix-blend-mode:screen"/>
</svg>`;

/*
 * 位移图走 data URI 而不是文档里的第二个 <svg>：装载器的白名单允许 href 指向 data:，
 * 而 feImage 引用同文档另一个元素在各浏览器里行为不一致。
 */
const lensMapHref = `data:image/svg+xml;utf8,${encodeURIComponent(LENS_MAP_SVG)}`;

/** 交给 installTheme 的 svgDefs：只含滤镜定义，无脚本、无事件属性、无外部引用。 */
export const macosSvgDefs = `
<filter id="nb-lens" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
    <feImage href="${lensMapHref}" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" result="map" />
    <feDisplacementMap in="SourceGraphic" in2="map" scale="26" xChannelSelector="R" yChannelSelector="G" />
</filter>
<filter id="nb-lens-sm" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
    <feImage href="${lensMapHref}" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" result="map" />
    <feDisplacementMap in="SourceGraphic" in2="map" scale="12" xChannelSelector="R" yChannelSelector="G" />
</filter>
`;
