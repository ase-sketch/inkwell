/**
 * 可被主题覆盖的组件登记表——库侧唯一真相源。
 *
 * 只有出现在这里的组件才允许被主题替换实现，加载器按它校验 manifest 的 `overrides`。
 * 契约 id 的形式是 `<组件 key>@<契约版本>`：组件的 props / emits / 键盘与 a11y 行为变了就升版本，
 * 老主题因此会被明确拒绝，而不是渲染出一个半坏的控件。
 *
 * **本轮只登记一个。** 28 个基础组件还没在阶段 2 重写，现在冻白名单等于冻空气；
 * 而且市场一旦跑起来，登记过的组件 API 就不能随便改了——这是这个方向真正的长期成本，
 * 缓解手段就是极小起步。
 *
 * 什么适合进这张表（阶段 2 之后再定）：数据契约清晰的表单类控件。
 * 什么不适合：Dialog / Panel / Tabs / ContextMenu / Table 这类契约是 slots 和布局的，
 * 以及 Button / Badge / Spinner 这类太薄、变量层就够表达的。
 *
 * **DOM 结构不进契约。** Radix Themes 有直接反例：公开 props 一个没改，
 * 内部 HTML 重构照样破坏了依赖它的覆盖。契约只钉 props / emits / 键盘 / a11y。
 */
export const NB_COMPONENT_CONTRACTS = {
    "time-picker": "time-picker@1",
} as const;

export type NbComponentKey = keyof typeof NB_COMPONENT_CONTRACTS;

/** 登记表里的组件 key 列表，用于加载器报错时列出合法名单。 */
export const nbComponentKeys = Object.keys(NB_COMPONENT_CONTRACTS) as NbComponentKey[];

export function isComponentKey(value: string): value is NbComponentKey {
    return Object.hasOwn(NB_COMPONENT_CONTRACTS, value);
}
