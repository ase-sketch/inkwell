/**
 * 主题层（theme）：一个主题包提供变量声明 + 取值 + 若干配色 + 资源 + 可选的组件覆盖。
 *
 * 三层术语：
 * - **配色** colorway —— 一组颜色变量取值。见 `src/colorway/`。
 * - **主题** theme —— 本目录。形状 / 节奏 / 装饰 / 角色映射，可按配色的明暗属性分档。
 * - **插件** plugin —— 主题 + 任意 JS，单独安装与授权。本轮不做。
 *
 * `tokens.ts` 登记的是主题可以覆盖的设计 token 名单；`z-index.ts` 是浮层层级常量，
 * 两者都不随配色变化。
 */
export * from "./tokens";
export * from "./z-index";
export * from "./theme-manifest";
export * from "./theme-loader";
export * from "./contracts";
export * from "./semver-range";
export * from "./theme-store";
export * from "./component-registry";
export * from "./svg-defs";
