<script setup lang="ts">
import {computed} from "vue";

export type NotificationTone = "info" | "success" | "warning" | "error";

const props = withDefaults(defineProps<{
    tone?: NotificationTone;
    title?: string;
    message?: string;
    dismissible?: boolean;
    actionLabel?: string;
    closeLabel?: string;
}>(), {
    tone: "info",
    title: "",
    message: "",
    dismissible: false,
    actionLabel: "",
    closeLabel: "关闭通知",
});

const emit = defineEmits<{
    (e: "dismiss"): void;
    (e: "action"): void;
}>();

const toneClass = computed(() => `nb-notification--${props.tone}`);
const iconClass = computed(() => {
    if (props.tone === "success") {
        return "i-lucide-check-circle-2";
    }
    if (props.tone === "warning") {
        return "i-lucide-alert-triangle";
    }
    if (props.tone === "error") {
        return "i-lucide-circle-x";
    }
    return "i-lucide-info";
});
</script>

<template>
    <div role="status" class="nb-notification flex w-full items-start gap-3 rounded-[var(--radius-panel)] border px-4 py-3 text-sm shadow-lg transition-[transform,opacity] [transition-duration:var(--motion-base)] [transition-timing-function:var(--ease-standard)] select-none" :class="toneClass">
        <span class="mt-0.5 h-4 w-4 shrink-0" :class="iconClass"></span>
        <span class="min-w-0 flex-1">
            <span v-if="$slots.title || props.title" class="mb-1 block font-medium text-[var(--text-main)]">
                <slot name="title">{{ props.title }}</slot>
            </span>
            <span class="block leading-relaxed text-[var(--text-secondary)]">
                <slot>{{ props.message }}</slot>
            </span>
        </span>
        <button v-if="$slots.action || props.actionLabel" type="button" class="shrink-0 text-sm font-medium text-[var(--nb-notification-tone)] hover:underline cursor-pointer" @click="emit('action')">
            <slot name="action">{{ props.actionLabel }}</slot>
        </button>
        <button v-if="props.dismissible" type="button" class="nb-ui-focus-ring -mr-1 shrink-0 rounded-[calc(var(--radius-control)*0.75)] p-0.5 text-[var(--text-muted)] transition-[background-color,color,transform] [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[color-mix(in_srgb,var(--text-main)_10%,transparent)] hover:text-[var(--text-main)] not-disabled:active:scale-[0.92] cursor-pointer" :aria-label="props.closeLabel" :title="props.closeLabel" @click="emit('dismiss')">
            <span class="i-lucide-x h-4 w-4"></span>
        </button>
    </div>
</template>

<style scoped>
.nb-notification {
    --nb-notification-tone: var(--accent-main);
    border-color: color-mix(in srgb, var(--nb-notification-tone) 28%, transparent);
    background: color-mix(in srgb, var(--nb-notification-tone) 10%, var(--bg-panel));
    color: var(--text-main);
}

.nb-notification--success {
    --nb-notification-tone: var(--status-success);
}

.nb-notification--warning {
    --nb-notification-tone: var(--status-warning);
}

.nb-notification--error {
    --nb-notification-tone: var(--status-danger);
}

.nb-notification--info {
    --nb-notification-tone: var(--accent-main);
}
</style>
