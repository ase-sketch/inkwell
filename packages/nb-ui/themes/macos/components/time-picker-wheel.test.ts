import {mount} from "@vue/test-utils";
import {describe, expect, it} from "vitest";
import {nextTick} from "vue";
import {runTimePickerContract} from "../../../src/testing/time-picker-contract-suite";
import TimePickerWheel from "./TimePickerWheel.vue";

/**
 * macOS 主题的滚轮实现跑的是与库默认实现**完全同一份**用例。
 *
 * 这就是主题作者的自证方式：从 `@notnotype/nb-ui/testing` 拿套件，套自己的实现，
 * 全绿才算实现了 `time-picker@1`。库这边不需要知道有哪些第三方实现存在。
 *
 * 两个实现的长相和操作完全不同——一个能打字、候选是竖列表，一个不能打字、
 * 小时分钟是两根滚轮——却过同一份用例，正说明契约钉的是数据和行为，不是 DOM。
 */
runTimePickerContract("macos-wheel", TimePickerWheel);

describe("macos wheel: 两步选择", () => {
    it("选完小时不关闭，还能接着选分钟", async () => {
        /*
         * 这条只属于滚轮，进不了契约：列表实现点一个候选就是选完了，本来就该关。
         *
         * 但它盯住的是一个真实的塌陷路径——滚轮被传送到了 body，DOM 上已经不是根元素的后代，
         * 「点外面关闭」如果不把滚轮本身排除掉，选完小时那一下就会被判成点了外面，
         * 分钟永远选不上。
         */
        const wrapper = mount(TimePickerWheel, {
            props: {modelValue: "09:00", step: 30},
            attachTo: document.body,
        });

        await wrapper.get('[role="combobox"]').trigger("keydown", {key: "Enter"});
        await nextTick();

        const hour = document.querySelector<HTMLElement>('[aria-label="小时"] [role="option"]:nth-child(11)');
        expect(hour?.textContent?.trim()).toBe("10");
        hour?.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
        await nextTick();

        expect(wrapper.get('[role="combobox"]').attributes("aria-expanded")).toBe("true");
        expect((wrapper.emitted("update:modelValue")?.at(-1) as [string])[0]).toBe("10:00");

        wrapper.unmount();
    });
});
