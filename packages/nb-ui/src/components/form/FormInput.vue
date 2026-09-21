<script setup lang="ts">
import {computed} from "vue";
import {useFormFieldContext} from "./form-field-context";

export type FormInputType = "text" | "search" | "password" | "number";
export type FormInputSize = "default" | "sm" | "md";

const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    name?: string;
    type?: FormInputType;
    placeholder?: string;
    size?: FormInputSize;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    autofocus?: boolean;
    autocomplete?: string;
    iconClass?: string;
    clearable?: boolean;
    inputmode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
    minlength?: number;
    maxlength?: number;
    step?: string;
    min?: string;
    max?: string;
}>(), {
    modelValue: "",
    id: "",
    name: "",
    type: "text",
    placeholder: "",
    size: "default",
    disabled: false,
    readonly: false,
    required: false,
    autofocus: false,
    autocomplete: "",
    iconClass: "",
    clearable: false,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "focus", event: FocusEvent): void;
    (e: "clear"): void;
}>();

const field = useFormFieldContext();

const isSmall = computed(() => props.size === "sm");
const controlSizeClass = computed(() => isSmall.value
    ? "nb-ui-control-h-sm px-[calc(var(--control-px)*0.75)] text-[var(--text-xs)]"
    : "nb-ui-control-h-md nb-ui-control-px text-[var(--text-sm)]");

// prefix 与裸 input 两个分支共享同一份属性绑定，排除组件层 size prop 避免原生 HTMLInputElement size 属性类型冲突
const inputAttrs = computed(() => ({
    value: props.modelValue,
    id: props.id || field?.inputId.value || undefined,
    name: props.name || undefined,
    type: props.type,
    placeholder: props.placeholder,
    disabled: props.disabled,
    readonly: props.readonly,
    required: props.required || field?.required.value,
    autofocus: props.autofocus,
    autocomplete: props.autocomplete || undefined,
    inputmode: props.inputmode,
    minlength: props.minlength,
    maxlength: props.maxlength,
    step: props.step,
    min: props.min,
    max: props.max,
    "aria-describedby": field?.ariaDescribedby.value,
    "aria-invalid": field?.invalid.value || undefined,
}));

function handleClear(): void {
    emit("update:modelValue", "");
    emit("clear");
}
</script>

<template>
    <div
        v-if="$slots.prefix || $slots.suffix || props.iconClass || props.clearable"
        class="nb-ui-control flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-control)] border bg-[var(--control-surface)] text-[var(--text-main)] focus-within:outline-none"
        :class="[controlSizeClass, field?.invalid.value ? 'nb-ui-control-invalid' : '']"
    >
        <span v-if="props.iconClass" :class="props.iconClass" class="h-4 w-4 shrink-0 text-[var(--text-muted)] flex items-center justify-center self-center" aria-hidden="true" />
        <div v-if="$slots.prefix" class="inline-flex items-center self-center shrink-0 leading-none">
            <slot name="prefix"></slot>
        </div>
        <input
            v-bind="inputAttrs"
            class="nb-ui-native-input min-w-0 flex-1 h-full bg-transparent text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
            @focus="emit('focus', $event)"
            @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        >
        <button
            v-if="props.clearable && props.modelValue && !props.disabled && !props.readonly"
            type="button"
            class="i-lucide-x h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-main)] cursor-pointer flex items-center justify-center self-center transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
            aria-label="清空输入"
            @click="handleClear"
        />
        <div v-if="$slots.suffix" class="inline-flex items-center self-center shrink-0 leading-none">
            <slot name="suffix"></slot>
        </div>
    </div>
    <input
        v-else
        v-bind="inputAttrs"
        class="nb-ui-native-input nb-ui-control w-full rounded-[var(--radius-control)] border bg-[var(--control-surface)] text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        :class="[controlSizeClass, field?.invalid.value ? 'nb-ui-control-invalid' : '']"
        @focus="emit('focus', $event)"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    >
</template>
