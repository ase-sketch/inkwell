import {computed, inject, provide} from "vue";
import type {Component, ComputedRef, InjectionKey, Ref} from "vue";

/**
 * 主题的组件覆盖登记处。
 *
 * 用 provide/inject，**不用 `app.component("TimePicker", X)` 全局覆盖**。五条理由：
 * 可能覆盖用户自己的同名组件、不支持局部主题（一个页面用另一套主题）、依赖注册顺序、
 * SSR 与客户端容易不一致、全局注册表达不了契约版本。
 *
 * 解析顺序固定：**主题实现 → 库默认实现**。没有第三层。
 * 「切换主题不应让用户丢失核心功能」是 WordPress 定下的老规矩，这里的落法是：
 * 主题只能替换实现，不能取消这个组件——`useThemeComponent` 永远返回一个可渲染的组件。
 */
export const NB_THEME_COMPONENTS: InjectionKey<Ref<Record<string, Component>>> = Symbol("nb-theme-components");

/**
 * 在应用根组件里调用一次，把当前主题的组件表接进去。
 *
 * 传 ref 而不是普通对象：切主题时表要跟着变，消费方通常直接把主题 store 的
 * `components`（一个 computed）传进来。
 */
export function provideThemeComponents(components: Ref<Record<string, Component>>): void {
    provide(NB_THEME_COMPONENTS, components);
}

/**
 * 取某个可覆盖组件的当前实现。
 *
 * @param key 契约登记表里的组件 key，见 ./contracts.ts
 * @param fallback 库自带的默认实现。没有主题、或主题没覆盖这一个时用它
 */
export function useThemeComponent(key: string, fallback: Component): ComputedRef<Component> {
    const overrides = inject(NB_THEME_COMPONENTS, null);

    return computed(() => overrides?.value[key] ?? fallback);
}
