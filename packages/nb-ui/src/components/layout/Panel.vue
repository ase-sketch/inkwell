<script setup lang="ts">
export type PanelTone = "default" | "subtle";
export type PanelPadding = "none" | "sm" | "md";

const props = withDefaults(defineProps<{
    as?: string;
    tone?: PanelTone;
    padding?: PanelPadding;
}>(), {
    as: "section",
    tone: "default",
    padding: "md",
});

/** none 用于表格/列表满铺场景：去内边距并裁剪内容以保住圆角 */
function paddingClass(): string {
    if (props.padding === "none") {
        return "overflow-hidden";
    }
    if (props.padding === "sm") {
        return "p-3";
    }
    return "p-5";
}
</script>

<template>
    <component
        :is="props.as"
        class="rounded-lg border border-[var(--panel-outline)]"
        :class="[
            props.tone === 'subtle' ? 'bg-[var(--bg-subtle)]' : 'bg-[var(--panel-surface)] shadow-[var(--shadow-panel)]',
            paddingClass(),
        ]"
    >
        <slot />
    </component>
</template>
