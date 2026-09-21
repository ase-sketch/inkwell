<script setup lang="ts">
import {useForwardPropsEmits} from "reka-ui";
import {useThemeComponent} from "../../theme/component-registry";
import TimePickerDefault from "./TimePickerDefault.vue";
import {TIME_PICKER_DEFAULT_STEP} from "./time-picker-contract";
import type {TimePickerEmits, TimePickerProps} from "./time-picker-contract";

/**
 * 时间选择器——**解析壳**，本身没有任何 UI。
 *
 * 它只做一件事：问当前主题「time-picker 你有实现吗」，有就渲染主题的，没有就渲染库默认的。
 * props 与 emits 原样转发，所以壳不需要知道任何一个实现的细节，实现换了它也不用改。
 *
 * 这是消费方唯一该 import 的入口。直接用 TimePickerDefault 也能跑，但那样就绕过了主题覆盖。
 */
const props = withDefaults(defineProps<TimePickerProps>(), {
    modelValue: undefined,
    min: undefined,
    max: undefined,
    step: TIME_PICKER_DEFAULT_STEP,
    disabled: false,
    invalid: false,
    placeholder: "--:--",
    id: undefined,
});

const emits = defineEmits<TimePickerEmits>();

const forwarded = useForwardPropsEmits(props, emits);
const impl = useThemeComponent("time-picker", TimePickerDefault);
</script>

<template>
    <component :is="impl" v-bind="forwarded" />
</template>
