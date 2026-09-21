import type {Component} from "vue";
import type {NbColorwayVars} from "../colorway/colorway-contract";
import type {ColorwayMeta} from "../colorway/colorway-store";

/**
 * 主题包 manifest —— **纯数据**，可 JSON 序列化，不含函数或组件对象。
 *
 * 与运行期入口（`NbThemeModule`）分开是硬要求：市场要能在**不执行代码**的前提下
 * 索引、校验和展示主题。这是 VS Code 的做法（`package.json` 的 contributions 与 extension entry 分离）。
 * 一旦 manifest 里出现函数，索引服务就必须跑第三方代码才能知道这个主题是什么。
 */
export type NbThemeManifest = {
    id: string;
    name: string;
    tagline?: string;
    /** 一段话讲清这套主题长什么样。市场列表页只能读 manifest，没有它就只剩一个名字 */
    description?: string;
    version: string;
    author?: string;
    /**
     * 兼容的宿主版本范围，见 ./semver-range.ts 支持的四种写法。
     * 装载时校验，不匹配**直接拒绝**，不半装。
     */
    hostVersion: string;
    /** 本主题新增的 CSS 变量。每项必须自带 fallback，见 NbThemeVarDeclaration */
    declares?: NbThemeVarDeclaration[];
    /** 自带配色的 id 列表；不给则用宿主内置的 5 套 */
    providesColorways?: string[];
    /** 推荐默认配色，按明暗给。是**默认值不是约束**——用户仍可任选配色 */
    defaultColorway?: {light: string; dark: string};
    /**
     * 覆盖了哪些组件：组件 key → 契约 id，例 `{"time-picker": "time-picker@1"}`。
     * **只写契约 id，不写实现**——实现在运行期入口里，manifest 保持纯数据。
     */
    overrides?: Record<string, string>;
};

export type NbThemeVarDeclaration = {
    name: `--${string}`;
    /**
     * 必填。必须能从配色契约派生（字面值或 color-mix），保证在**任意配色**下都成立。
     *
     * 这是「派生型 vs 要求型」的分界：主题不能要求每套配色为它填一个新变量，
     * 否则用户新建配色时要面对一堆「给我没在用的主题的变量」，配色契约会被主题无限撑大。
     *
     * 判据：只有一套主题用 → 派生型，写 fallback；两套以上主题都要用 →
     * 说明配色契约漏了一个角色（例如「填充面上的文字色」），该去补契约而不是各写各的。
     */
    fallback: string;
    description?: string;
};

/**
 * 主题包的运行期入口。第一档（声明式主题）只需要 manifest + vars.css；
 * `components` 是第二档（组件实现包）才有的东西。
 *
 * 约定：入口模块自己 `import "./vars.css"`，样式交给打包器，加载器不碰 CSS 文本。
 */
export type NbThemeModule = {
    manifest: NbThemeManifest;
    /** 自带配色的取值表，key 必须覆盖 manifest.providesColorways */
    colorways?: Record<string, NbColorwayVars>;
    /** 自带配色的元信息（展示名 + 明暗归属），与 colorways 同 key */
    colorwayMeta?: Record<string, ColorwayMeta>;
    /**
     * SVG 资源：滤镜、渐变、遮罩这类**只能在文档里定义、只能被 CSS 引用**的东西。
     * 例：Liquid Glass 的边缘折射要靠 `feDisplacementMap`，CSS 只能写 `url("#nb-lens")`。
     *
     * 仍然是**纯数据**（一段 SVG 标记），不是代码——装载器按标签白名单校验后注入，
     * 越界的标签或 on* 属性一律拒绝装载。第一档主题因此也能带资源，不必升到插件档。
     */
    svgDefs?: string;
    /** 组件覆盖实现，key 必须出现在 manifest.overrides 且在契约登记表里 */
    components?: Record<string, Component>;
};
