<script setup lang="ts">
import {computed} from "vue";
import {useFormFieldContext} from "./form-field-context";

/**
 * 复选框（FormCheckbox · macOS 原生微拟物 Squircle 规范）。
 *
 * 视觉特征：
 * 1. 形态：18px × 18px 饱满超椭圆（rounded-[5px] / Squircle）；
 * 2. 未选中态：0.5px 微边框 + 内阴影凹槽底座；
 * 3. 选中态：纯正 Apple 渐变蓝底（var(--accent-main)）+ 纯白反色加粗对勾 [✓]，支持半选 [-]（Indeterminate）；
 * 4. 触觉动效：按压 active:scale-[0.92] 物理微回弹。
 */

const props = withDefaults(defineProps<{
    modelValue?: boolean | "indeterminate";
    indeterminate?: boolean;
    label?: string;
    description?: string;
    id?: string;
    name?: string;
    disabled?: boolean;
    required?: boolean;
}>(), {
    modelValue: false,
    indeterminate: false,
    label: "",
    description: "",
    id: "",
    name: "",
    disabled: false,
    required: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: boolean): void;
    (e: "focus", event: FocusEvent): void;
}>();

const field = useFormFieldContext();
const isIndeterminate = computed(() => props.indeterminate || props.modelValue === "indeterminate");
const isChecked = computed(() => props.modelValue === true && !isIndeterminate.value);
const displayLabel = computed(() => props.label || (isChecked.value ? "true" : "false"));

function handleChange(event: Event): void {
    if (props.disabled) return;
    const target = event.target as HTMLInputElement;
    emit("update:modelValue", target.checked);
}
</script>

<template>
    <label
        class="group inline-flex items-start gap-2.5 text-[var(--text-sm)] text-[var(--text-main)] select-none transition-opacity"
        :class="props.disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'"
    >
        <input
            type="checkbox"
            :id="props.id || field?.inputId.value || undefined"
            :name="props.name || undefined"
            :checked="isChecked"
            :disabled="props.disabled"
            :required="props.required || field?.required.value"
            :aria-checked="isIndeterminate ? 'mixed' : (isChecked ? 'true' : 'false')"
            :aria-describedby="field?.ariaDescribedby.value"
            :aria-invalid="field?.invalid.value || undefined"
            class="peer sr-only"
            @focus="emit('focus', $event)"
            @change="handleChange"
        >
        <span
            class="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-[background-color,border-color,color,box-shadow,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] not-disabled:group-active:scale-[0.92] mt-0.5"
            :class="[
                (isChecked || isIndeterminate)
                    ? 'border-[var(--accent-main)] bg-[linear-gradient(180deg,var(--accent-main)_0%,color-mix(in_srgb,var(--accent-main)_88%,#000000)_100%)] text-[var(--text-inverse)] shadow-[0_2px_6px_color-mix(in_srgb,var(--accent-main)_35%,transparent)]'
                    : 'border-[color-mix(in_srgb,var(--text-main)_20%,transparent)] bg-[color-mix(in_srgb,var(--bg-panel)_90%,transparent)] text-transparent group-hover:border-[color-mix(in_srgb,var(--text-main)_35%,transparent)] shadow-[inset_0_1px_1.5px_color-mix(in_srgb,var(--shadow-color)_10%,transparent)]',
                field?.invalid.value
                    ? 'border-[color:var(--status-danger)] peer-focus-visible:border-[color:var(--status-danger)] peer-focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--status-danger)_24%,transparent)]'
                    : 'peer-focus-visible:border-[color:var(--focus-outline)] peer-focus-visible:shadow-[var(--focus-ring)]',
            ]"
        >
            <svg v-if="isIndeterminate" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                <path d="M4 8H12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
            </svg>
            <svg v-else-if="isChecked" viewBox="0 0 16 16" fill="none" class="w-3.5 h-3.5 text-white pointer-events-none">
                <path d="M3.5 8.2L6.3 11.2L12.5 4.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </span>
        <span class="inline-flex flex-col">
            <slot>{{ displayLabel }}</slot>
            <span v-if="props.description" class="text-xs text-[var(--text-muted)] mt-0.5">{{ props.description }}</span>
        </span>
    </label>
</template>
