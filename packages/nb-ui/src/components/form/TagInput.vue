<script setup lang="ts">
import {computed, ref} from "vue";
import {useFormFieldContext} from "./form-field-context";

// 标签输入框：Enter/逗号添加、Backspace 删末尾、失焦落盘；值去重。
export type TagInputSize = "default" | "sm";
export type TagInputTone = "default" | "accent";

const props = withDefaults(defineProps<{
    modelValue: string[];
    id?: string;
    name?: string;
    placeholder?: string;
    disabled?: boolean;
    /** accent 用主题强调色渲染标签，default 用面板底色 */
    tone?: TagInputTone;
    /** default 对齐 nb-ui 表单控件（min-h-9 / text-sm），sm 为紧凑变体 */
    size?: TagInputSize;
}>(), {
    id: "",
    name: "",
    placeholder: "",
    disabled: false,
    tone: "default",
    size: "default",
});

const emit = defineEmits<{
    (e: "update:modelValue", value: string[]): void;
}>();

const field = useFormFieldContext();
const inputValue = ref("");

function addTag(): void {
    const value = inputValue.value.trim();
    if (value && !props.modelValue.includes(value)) {
        emit("update:modelValue", [...props.modelValue, value]);
    }
    inputValue.value = "";
}

function removeTag(index: number): void {
    if (props.disabled) {
        return;
    }
    const next = [...props.modelValue];
    next.splice(index, 1);
    emit("update:modelValue", next);
}

function handleKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        addTag();
    } else if (event.key === "Backspace" && inputValue.value === "" && props.modelValue.length > 0) {
        removeTag(props.modelValue.length - 1);
    }
}

const containerSizeClass = computed(() => (props.size === "sm" ? "min-h-7 gap-1 px-1.5 py-1" : "min-h-9 gap-1.5 px-2 py-1.5"));
const tagSizeClass = computed(() => (props.size === "sm" ? "px-1.5 py-0.5 text-[11px] rounded-[calc(var(--radius-control)*0.6)]" : "px-2 py-1 text-xs rounded-[calc(var(--radius-control)*0.75)]"));
const tagToneClass = computed(() => (props.tone === "accent"
    ? "bg-[var(--accent-bg)] text-[var(--accent-text)] border border-[color-mix(in_srgb,var(--accent-main)_30%,transparent)]"
    : "border border-[var(--control-outline)] bg-[var(--control-surface)] text-[var(--text-main)]"));
</script>

<template>
    <!-- 标签输入容器：invalid 视觉与其它表单控件一致 -->
    <div
        class="nb-ui-control flex flex-wrap items-center rounded-[var(--radius-control)] border bg-[var(--control-surface)] transition-[background-color,border-color,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)]"
        :class="[
            containerSizeClass,
            props.disabled ? 'cursor-not-allowed opacity-60' : '',
            field?.invalid.value ? 'nb-ui-control-invalid' : '',
        ]"
    >
        <span
            v-for="(tag, index) in props.modelValue"
            :key="tag"
            class="inline-flex items-center gap-1 leading-none shadow-sm transition-[transform,opacity,background-color,color] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] select-none"
            :class="[tagSizeClass, tagToneClass]"
        >
            <span class="truncate max-w-[140px]">{{ tag }}</span>
            <button
                type="button"
                class="i-lucide-x h-3 w-3 shrink-0 opacity-50 transition-[opacity,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:text-[var(--status-danger)] hover:opacity-100 not-disabled:active:scale-[0.85] disabled:cursor-not-allowed cursor-pointer"
                :disabled="props.disabled"
                :aria-label="`移除标签 ${tag}`"
                @click="removeTag(index)"
            ></button>
        </span>
        <input
            v-model="inputValue"
            type="text"
            :id="props.id || field?.inputId.value || undefined"
            :name="props.name || undefined"
            :placeholder="props.modelValue.length === 0 ? props.placeholder : ''"
            :disabled="props.disabled"
            :aria-describedby="field?.ariaDescribedby.value"
            :aria-invalid="field?.invalid.value || undefined"
            :aria-required="field?.required.value || undefined"
            class="min-w-5 flex-1 bg-transparent p-0 text-[var(--text-main)] outline-none placeholder:text-[var(--text-muted)] disabled:cursor-not-allowed"
            :class="props.size === 'sm' ? 'text-[11px]' : 'text-sm'"
            @keydown="handleKeydown"
            @blur="addTag"
        />
    </div>
</template>
