<script setup lang="ts">
import {
    EditableArea,
    EditableCancelTrigger,
    EditableEditTrigger,
    EditableInput,
    EditablePreview,
    EditableRoot,
    EditableSubmitTrigger,
} from "reka-ui";

export type EditableSize = "sm" | "md" | "lg";

const props = withDefaults(defineProps<{
    modelValue?: string;
    defaultValue?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    autoResize?: boolean;
    size?: EditableSize;
    showEditTrigger?: boolean;
}>(), {
    modelValue: undefined,
    defaultValue: "",
    placeholder: "点击编辑...",
    disabled: false,
    readonly: false,
    autoResize: false,
    size: "md",
    showEditTrigger: true,
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string): void;
    (e: "submit", value: string): void;
    (e: "cancel"): void;
}>();
</script>

<template>
    <EditableRoot
        v-slot="{ isEditing }"
        :model-value="props.modelValue"
        :default-value="props.defaultValue"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :readonly="props.readonly"
        :auto-resize="props.autoResize"
        class="inline-flex items-center gap-1.5 font-medium select-none"
        :class="[
            props.size === 'sm' ? 'text-xs' : '',
            props.size === 'md' ? 'text-sm' : '',
            props.size === 'lg' ? 'text-base font-semibold' : '',
        ]"
        @update:model-value="(val) => emit('update:modelValue', val)"
        @submit="(val) => emit('submit', val ?? '')"
        @cancel="() => emit('cancel')"
    >
        <EditableArea class="relative inline-flex items-center">
            <EditablePreview
                class="rounded-[calc(var(--radius-control)*0.75)] px-1.5 py-0.5 text-[var(--text-main)] transition-[background-color,color] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] cursor-pointer truncate max-w-full"
            />
            <EditableInput
                class="nb-ui-focus-ring rounded-[var(--radius-control)] border border-[var(--accent-main)] bg-[var(--bg-panel)] px-2 py-0.5 text-[var(--text-main)] shadow-sm outline-none transition-[border-color,box-shadow,background-color,color] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] min-w-[80px]"
            />
        </EditableArea>

        <!-- 编辑与操作按钮 -->
        <template v-if="!props.readonly && !props.disabled">
            <div v-if="!isEditing && props.showEditTrigger" class="flex items-center">
                <EditableEditTrigger
                    class="nb-ui-focus-ring flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-muted)] opacity-60 transition-[opacity,background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:opacity-100 hover:text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] not-disabled:active:scale-[0.92] cursor-pointer"
                    aria-label="编辑"
                >
                    <span class="i-lucide-pencil h-3.5 w-3.5" aria-hidden="true" />
                </EditableEditTrigger>
            </div>

            <div v-else-if="isEditing" class="flex items-center gap-1">
                <EditableSubmitTrigger
                    class="nb-ui-focus-ring flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] text-[var(--status-success)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--status-success)_14%,transparent)] not-disabled:active:scale-[0.92] cursor-pointer"
                    aria-label="保存"
                >
                    <span class="i-lucide-check h-3.5 w-3.5" aria-hidden="true" />
                </EditableSubmitTrigger>

                <EditableCancelTrigger
                    class="nb-ui-focus-ring flex h-6 w-6 items-center justify-center rounded-[var(--radius-control)] text-[var(--text-muted)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer"
                    aria-label="取消"
                >
                    <span class="i-lucide-x h-3.5 w-3.5" aria-hidden="true" />
                </EditableCancelTrigger>
            </div>
        </template>
    </EditableRoot>
</template>
