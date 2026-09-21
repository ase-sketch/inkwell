/**
 * 配色层（colorway）：一组颜色变量取值。三层术语里的最底层。
 *
 * 与 `src/theme/` 的分工：这里只管颜色，主题管形状 / 节奏 / 装饰 / 组件覆盖。
 * 两条轴独立，任意组合都应该成立。
 */
export * from "./apply-colorway";
export * from "./colorway-contract";
export * from "./presets";
export * from "./colorway-store";
