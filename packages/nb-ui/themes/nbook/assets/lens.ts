/**
 * nbook 的边缘折射（lensing）位移图与两档滤镜。
 *
 * 与 `themes/macos/assets/lens.ts` 是**同一个技术、两份独立资源**，这是刻意的：
 *
 * 滤镜 id 是**全文档级**的。装载器按主题 id 给每套主题分一个隐藏容器，但容器不隔离 id——
 * 两套主题都挂 `<filter id="nb-lens">` 时，文档里就有两个同 id 元素，`url(#nb-lens)`
 * 静默解析到先装的那一个。表现是「装了 A 之后 B 的折射强度变了」，没有任何报错。
 * 所以每套主题的滤镜 id 必须自带主题前缀（这条已由装载器的 svg-defs-id-collides 校验兜住）。
 *
 * 既然 id 不能共用，就没必要为了省 30 行静态标记让 nbook import macos——那会让删掉 macos
 * 就装不上 nbook，而主题包之间不该有依赖。重复的是数据不是逻辑，两份各自演进也没有坏处。
 *
 * 原理：feDisplacementMap 按位移图的 R 通道移 x、G 通道移 y（128 = 不动）。
 * 这张图中间留 128、四边推到 0/255，位移因此**只集中在边缘**，正是玻璃的 rim lensing。
 * 两个渐变分别只画红、只画绿，再用 screen 合成——screen 对 0 是恒等，所以能干净地
 * 把 R 与 G 装进同一张图而互不污染。
 *
 * 兼容性写在明处：`backdrop-filter: url(#...)` **只有 Chromium 支持**。WebKit bug 245510
 * （2022-09 上报，2026-06 仍 open）与 297770 里 Apple 侧的解释是「加速滤镜不能用 SVG 滤镜」；
 * Firefox 同样不支持。所以 vars.css 把它放在 @supports 分支里做渐进增强，退化后仍有镜面高光。
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

/**
 * 交给 installTheme 的 svgDefs：只含滤镜定义，无脚本、无事件属性、无外部引用。
 *
 * 位移量比 macos 大一档（30 / 14 对 26 / 12）。原本的理由是「nbook 的磨砂更重，两者要配套」，
 * 而磨砂后来收薄了（48px → 18px），这个理由不再成立——但取值保留：位移作用在**糊得更轻**的
 * 背景上，边缘那一下形变反而看得更清楚，这正是玻璃与毛玻璃的分界。
 * 换句话说，这一档现在是「因为看得见所以留着」，不是「为了配合重模糊」。
 */
export const nbookSvgDefs = `
<filter id="nbook-lens" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
    <feImage href="${lensMapHref}" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" result="map" />
    <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" />
</filter>
<filter id="nbook-lens-sm" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
    <feImage href="${lensMapHref}" preserveAspectRatio="none" x="0" y="0" width="100%" height="100%" result="map" />
    <feDisplacementMap in="SourceGraphic" in2="map" scale="14" xChannelSelector="R" yChannelSelector="G" />
</filter>
`;
