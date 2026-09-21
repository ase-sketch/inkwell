<script setup lang="ts">
import FormTextarea from "nbook/app/components/common/form/FormTextarea.vue";
import type {LowCodeFieldDto, LowCodeJsonValue} from "nbook/shared/dto/low-code-form.dto";

const props = withDefaults(defineProps<{
    field: LowCodeFieldDto;
    modelValue?: LowCodeJsonValue;
    disabled?: boolean;
}>(), {
    modelValue: "",
    disabled: false,
});
const emit = defineEmits<{
    (e: "update:modelValue", value: LowCodeJsonValue): void;
}>();

const textValue = computed(() => typeof props.modelValue === "string" ? props.modelValue : "");
</script>

<template>
    <FormTextarea :model-value="textValue" :rows="props.field.rows ?? 3" :placeholder="props.field.placeholder" :class="props.disabled ? 'pointer-events-none opacity-75' : ''" @update:model-value="emit('update:modelValue', $event)" />
</template>
