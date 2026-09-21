<script setup lang="ts">
export type IconButtonVariant = "default" | "danger" | "accent" | "secondary";
export type IconButtonSize = "sm" | "md" | "lg";

const props = withDefaults(defineProps<{
    title?: string;
    ariaLabel?: string;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    disabled?: boolean;
    iconClass?: string;
}>(), {
    title: "",
    ariaLabel: "",
    variant: "default",
    size: "md",
    disabled: false,
    iconClass: "",
});

/*
 * 尺寸与材质消费主题 token（现代极简平滑方案 2：浓度跃升与丝滑平移）：
 * 零 Layout Shift，禁用态禁止任何缩放。
 */
function sizeClass(): string {
    if (props.size === "sm") {
        return "h-[26px] w-[26px] text-xs rounded-[6px]";
    }
    if (props.size === "lg") {
        return "h-[38px] w-[38px] text-base rounded-[10px]";
    }
    return "h-[32px] w-[32px] text-sm rounded-[8px]";
}

function variantClass(): string {
    if (props.variant === "danger") {
        return "text-[var(--text-muted)] hover:bg-[color-mix(in_srgb,var(--status-danger)_16%,transparent)] hover:text-[var(--status-danger)] active:bg-[color-mix(in_srgb,var(--status-danger)_24%,transparent)]";
    }
    if (props.variant === "accent") {
        return "text-[var(--accent-text)] hover:bg-[color-mix(in_srgb,var(--accent-main)_16%,transparent)] hover:text-[var(--accent-main)] active:bg-[color-mix(in_srgb,var(--accent-main)_24%,transparent)]";
    }
    if (props.variant === "secondary") {
        return "bg-[color-mix(in_srgb,var(--text-main)_8%,transparent)] text-[var(--text-main)] hover:bg-[color-mix(in_srgb,var(--text-main)_18%,transparent)] active:bg-[color-mix(in_srgb,var(--text-main)_24%,transparent)]";
    }
    return "text-[var(--text-secondary)] hover:bg-[color-mix(in_srgb,var(--text-main)_15%,transparent)] hover:text-[var(--text-main)] active:bg-[color-mix(in_srgb,var(--text-main)_24%,transparent)]";
}
</script>

<template>
    <!-- 通用紧凑图标按钮 -->
    <button
        type="button"
        :title="props.title"
        :aria-label="props.ariaLabel || props.title"
        :disabled="props.disabled"
        class="nb-ui-focus-ring inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border-[length:var(--border-w)] border-transparent box-border transition-[background-color,color,transform,box-shadow] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] not-disabled:active:scale-[0.93] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:transform-none cursor-pointer"
        :class="[
            sizeClass(),
            variantClass(),
        ]"
    >
        <span v-if="props.iconClass" :class="props.iconClass" class="h-[1.25em] w-[1.25em] shrink-0" aria-hidden="true" />
        <slot />
    </button>
</template>
