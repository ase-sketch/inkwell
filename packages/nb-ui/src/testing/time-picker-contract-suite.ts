import {mount} from "@vue/test-utils";
import {describe, expect, it} from "vitest";
import {nextTick} from "vue";
import type {Component} from "vue";

/**
 * `time-picker@1` 的契约测试套件——**主题作者的自证手段**。
 *
 * 写了一个时间选择器实现想让主题用？把它传进 `runTimePickerContract`，全绿才算真的
 * 实现了这个契约。库自己的默认实现和 macOS 主题的滚轮跑的是同一份用例。
 *
 * ```ts
 * import {runTimePickerContract} from "@notnotype/nb-ui/testing";
 * runTimePickerContract("my-wheel", MyTimePicker);
 * ```
 *
 * 用例只从两个地方下手：`role="combobox"`（a11y 契约的一部分）与 v-model。
 * **不断言任何标签、class 或 DOM 层级**——Radix Themes 的直接反例是公开 props 一个没改、
 * 内部 HTML 重构照样破坏了依赖它的覆盖。契约管数据和行为，不管长相。
 */

/** 契约只保证触发器带 role="combobox"，所以测试也只认这一个入口 */
function trigger(wrapper: ReturnType<typeof mount>) {
    return wrapper.get('[role="combobox"]');
}

function lastValue(wrapper: ReturnType<typeof mount>): string | undefined {
    const emitted = (wrapper.emitted("update:modelValue") ?? []).map((args) => (args as [string | undefined])[0]);
    return emitted.at(-1);
}

export function runTimePickerContract(name: string, component: Component): void {
    describe(`time-picker@1 contract: ${name}`, () => {
        it("adjusts by step on ArrowDown / ArrowUp", async () => {
            const wrapper = mount(component, {props: {modelValue: "09:00", step: 15}});

            await trigger(wrapper).trigger("keydown", {key: "ArrowDown"});
            expect(lastValue(wrapper)).toBe("09:15");

            await wrapper.setProps({modelValue: "09:15"});
            await trigger(wrapper).trigger("keydown", {key: "ArrowUp"});
            expect(lastValue(wrapper)).toBe("09:00");
        });

        it("starts from min when there is no value yet", async () => {
            // 从 00:00 起步会让「营业时间 09:00 开始」这类场景第一下就落在范围外
            const wrapper = mount(component, {props: {modelValue: undefined, min: "09:00", step: 30}});

            await trigger(wrapper).trigger("keydown", {key: "ArrowDown"});

            expect(lastValue(wrapper)).toBe("09:00");
        });

        it("clamps to min and max", async () => {
            const low = mount(component, {props: {modelValue: "09:00", min: "09:00", max: "17:00", step: 30}});
            await trigger(low).trigger("keydown", {key: "ArrowUp"});
            expect(lastValue(low)).toBe("09:00");

            const high = mount(component, {props: {modelValue: "17:00", min: "09:00", max: "17:00", step: 30}});
            await trigger(high).trigger("keydown", {key: "ArrowDown"});
            expect(lastValue(high)).toBe("17:00");
        });

        it("ignores keyboard input while disabled", async () => {
            const wrapper = mount(component, {props: {modelValue: "09:00", disabled: true}});

            await trigger(wrapper).trigger("keydown", {key: "ArrowDown"});
            await trigger(wrapper).trigger("keydown", {key: "Enter"});

            expect(wrapper.emitted("update:modelValue")).toBeUndefined();
        });

        it("opens on Enter and reports it through aria-expanded", async () => {
            const wrapper = mount(component, {props: {modelValue: "09:00"}, attachTo: document.body});

            expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
            await trigger(wrapper).trigger("keydown", {key: "Enter"});
            expect(trigger(wrapper).attributes("aria-expanded")).toBe("true");

            wrapper.unmount();
        });

        it("rolls back to the value at focus time on Escape", async () => {
            const wrapper = mount(component, {props: {modelValue: "09:00", step: 30}, attachTo: document.body});

            await trigger(wrapper).trigger("focus");
            await trigger(wrapper).trigger("keydown", {key: "ArrowDown"});
            await wrapper.setProps({modelValue: "09:30"});
            await trigger(wrapper).trigger("keydown", {key: "ArrowDown"});
            await wrapper.setProps({modelValue: "10:00"});

            await trigger(wrapper).trigger("keydown", {key: "Escape"});

            expect(lastValue(wrapper)).toBe("09:00");
            wrapper.unmount();
        });

        it("returns focus to the trigger after closing", async () => {
            // 关闭后不还焦点，键盘用户会掉回文档开头
            const wrapper = mount(component, {props: {modelValue: "09:00"}, attachTo: document.body});

            await trigger(wrapper).trigger("keydown", {key: "Enter"});
            await trigger(wrapper).trigger("keydown", {key: "Enter"});
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(document.activeElement).toBe(trigger(wrapper).element);
            wrapper.unmount();
        });

        it("closes on an outside click without changing the value", async () => {
            /*
             * 「点外面关掉」是弹出层这个形态自带的期待，不做的话点了别处它还开着。
             *
             * 断言刻意分两半：关掉 + **值不动**。这两件事很容易被写成一件——
             * 把点外面接到 Escape 的处理上就会连值一起回滚，那是「算了」不是「就这样吧」。
             */
            const wrapper = mount(component, {props: {modelValue: "09:00"}, attachTo: document.body});
            const outside = document.createElement("button");
            document.body.append(outside);

            await trigger(wrapper).trigger("keydown", {key: "Enter"});
            expect(trigger(wrapper).attributes("aria-expanded")).toBe("true");

            outside.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
            await nextTick();

            expect(trigger(wrapper).attributes("aria-expanded")).toBe("false");
            expect(wrapper.emitted("update:modelValue")).toBeUndefined();

            outside.remove();
            wrapper.unmount();
        });

        it("does not swallow Tab", () => {
            const wrapper = mount(component, {props: {modelValue: "09:00"}});
            const event = new KeyboardEvent("keydown", {key: "Tab", cancelable: true, bubbles: true});

            trigger(wrapper).element.dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
        });

        it("exposes aria-controls pointing at the popup it announces", () => {
            const wrapper = mount(component, {props: {modelValue: "09:00"}});

            expect(trigger(wrapper).attributes("aria-controls")).toBeTruthy();
        });
    });
}
