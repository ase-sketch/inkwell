<script setup lang="ts">
import {useFormFieldContext} from "./form-field-context";

const props = withDefaults(defineProps<{
    modelValue?: string;
    id?: string;
    name?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    autofocus?: boolean;
    rows?: number;
    minlength?: number;
    maxlength?: number;
}>(), {
    modelValue: "",
    id: "",
    name: "",
    placeholder: "",
    disabled: false,
    readonly: false,
    required: false,
    autofocus: false,
    rows: 4,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
}>();

const field = useFormFieldContext();
</script>

<template>
    <textarea
        :value="props.modelValue"
        :id="props.id || field?.inputId.value || undefined"
        :name="props.name || undefined"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :required="props.required || field?.required.value"
        :autofocus="props.autofocus"
        :rows="props.rows"
        :minlength="props.minlength"
        :maxlength="props.maxlength"
        :aria-describedby="field?.ariaDescribedby.value"
        :aria-invalid="field?.invalid.value || undefined"
        class="nb-ui-control w-full resize-y rounded-[var(--radius-control)] border bg-[var(--control-surface)] px-3 py-2 text-sm text-[var(--text-main)] outline-none transition-colors placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed disabled:opacity-60"
        :class="field?.invalid.value ? 'nb-ui-control-invalid' : ''"
        @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    ></textarea>
</template>
