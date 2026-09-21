<script setup lang="ts">
import FormInput from "nbook/app/components/common/form/FormInput.vue";
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
    <FormInput :model-value="textValue" :placeholder="props.field.placeholder" :readonly="props.disabled" @update:model-value="emit('update:modelValue', $event)" />
</template>
