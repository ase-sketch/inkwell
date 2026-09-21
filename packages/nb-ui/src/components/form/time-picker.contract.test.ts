import {mount} from "@vue/test-utils";
import {describe, expect, it} from "vitest";
import {defineComponent, h, ref} from "vue";
import type {Component} from "vue";
import {runTimePickerContract} from "../../testing/time-picker-contract-suite";
import {NB_THEME_COMPONENTS, useThemeComponent} from "../../theme/component-registry";
import TimePicker from "./TimePicker.vue";
import TimePickerDefault from "./TimePickerDefault.vue";
import {clampMinutes, formatMinutes, parseTimeToMinutes, timeOptions} from "./time-picker-contract";

/*
 * 库默认实现跑的是与主题实现**完全同一份**契约用例（套件在 src/testing/）。
 * macOS 滚轮那份在 themes/macos/components/time-picker-wheel.test.ts 里跑同一个函数——
 * 依赖方向是主题依赖库，所以套件放在库里，由主题来调用。
 */
runTimePickerContract("default", TimePickerDefault);

describe("time-picker arithmetic", () => {
    it("parses only zero-padded HH:mm", () => {
        expect(parseTimeToMinutes("09:05")).toBe(545);
        expect(parseTimeToMinutes("23:59")).toBe(1439);
        // 猜测比拒绝更难查：这些一律返回 null
        for (const bad of ["9:05", "09:5", "24:00", "09:60", "0905", "", "上午九点"]) {
            expect(parseTimeToMinutes(bad), `${bad} 不该被接受`).toBeNull();
        }
        expect(parseTimeToMinutes(undefined)).toBeNull();
    });

    it("formats with padding", () => {
        expect(formatMinutes(0)).toBe("00:00");
        expect(formatMinutes(545)).toBe("09:05");
    });

    it("clamps into the allowed window", () => {
        expect(clampMinutes(0, "09:00", "17:00")).toBe(540);
        expect(clampMinutes(2000, "09:00", "17:00")).toBe(1020);
        expect(clampMinutes(600, undefined, undefined)).toBe(600);
    });

    it("lists options from min, not from midnight", () => {
        expect(timeOptions("09:00", "10:00", 30)).toEqual(["09:00", "09:30", "10:00"]);
        // step 非法时回落到默认粒度，而不是死循环
        expect(timeOptions("09:00", "10:00", 0)).toEqual(["09:00", "09:30", "10:00"]);
    });
});

describe("theme component override", () => {
    const Marker = defineComponent({
        name: "MarkerTimePicker",
        setup: () => () => h("div", {"data-impl": "theme"}),
    });

    it("renders the library default when no theme provides one", () => {
        const wrapper = mount(TimePicker, {props: {modelValue: "09:00"}});

        expect(wrapper.find('[data-nb-time-picker="default"]').exists()).toBe(true);
    });

    it("renders the theme implementation when one is registered", () => {
        const wrapper = mount(TimePicker, {
            props: {modelValue: "09:00"},
            global: {provide: {[NB_THEME_COMPONENTS as symbol]: ref({"time-picker": Marker})}},
        });

        expect(wrapper.find('[data-impl="theme"]').exists()).toBe(true);
        expect(wrapper.find('[data-nb-time-picker="default"]').exists()).toBe(false);
    });

    it("falls back per component, not per theme", () => {
        // 主题覆盖了别的组件不影响这一个：解析是按 key 逐个做的
        const wrapper = mount(TimePicker, {
            props: {modelValue: "09:00"},
            global: {provide: {[NB_THEME_COMPONENTS as symbol]: ref({"other-component": Marker})}},
        });

        expect(wrapper.find('[data-nb-time-picker="default"]').exists()).toBe(true);
    });

    it("keeps returning a renderable component when the override map empties", async () => {
        // 「切换主题不应让用户丢失核心功能」：主题只能替换实现，不能取消这个组件
        const overrides = ref<Record<string, Component>>({"time-picker": Marker});
        const Host = defineComponent({
            setup() {
                const impl = useThemeComponent("time-picker", TimePickerDefault);
                return () => h(impl.value, {modelValue: "09:00"});
            },
        });
        const wrapper = mount(Host, {global: {provide: {[NB_THEME_COMPONENTS as symbol]: overrides}}});
        expect(wrapper.find('[data-impl="theme"]').exists()).toBe(true);

        overrides.value = {};
        await wrapper.vm.$nextTick();

        expect(wrapper.find('[data-nb-time-picker="default"]').exists()).toBe(true);
    });

    it("forwards props and v-model through the resolution shell", async () => {
        // 壳不该吃掉任何东西：props 进得去，emits 出得来
        const wrapper = mount(TimePicker, {props: {modelValue: "09:00", step: 15}});

        await wrapper.get('[role="combobox"]').trigger("keydown", {key: "ArrowDown"});

        const emitted = (wrapper.emitted("update:modelValue") ?? []).map((args) => (args as [string | undefined])[0]);
        expect(emitted.at(-1)).toBe("09:15");
    });
});
