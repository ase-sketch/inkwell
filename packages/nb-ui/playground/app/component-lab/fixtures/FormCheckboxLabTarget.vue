<script setup lang="ts">
import {computed, provide} from "vue";
import FormCheckbox from "../../../../src/components/form/FormCheckbox.vue";
import {NB_FORM_FIELD_CONTEXT_KEY} from "../../../../src/components/form/form-field-context";

const props = withDefaults(defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
    label?: string;
    invalid?: boolean;
    id: string;
}>(), {
    modelValue: false,
    disabled: false,
    label: "",
    invalid: false,
});

const emit = defineEmits<{
    (event: "update:modelValue", value: boolean): void;
    (event: "focus", focusEvent: FocusEvent): void;
}>();

const errorId = computed(() => props.invalid ? `${props.id}-error` : undefined);
provide(NB_FORM_FIELD_CONTEXT_KEY, {
    inputId: computed(() => undefined),
    descriptionId: computed(() => undefined),
    errorId,
    ariaDescribedby: errorId,
    required: computed(() => false),
    invalid: computed(() => props.invalid),
});
</script>

<template>
    <FormCheckbox
        :id="props.id"
        :model-value="props.modelValue"
        :disabled="props.disabled"
        :label="props.label"
        @focus="emit('focus', $event)"
        @update:model-value="emit('update:modelValue', $event)"
    />
    <span v-if="props.invalid" :id="errorId" class="text-xs text-[var(--status-danger)]">必须确认自动保存策略</span>
</template>
