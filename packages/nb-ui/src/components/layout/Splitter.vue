<script setup lang="ts">
import {
    SplitterGroup,
    SplitterPanel,
    SplitterResizeHandle,
} from "reka-ui";

export interface SplitterPanelConfig {
    id?: string;
    defaultSize?: number;
    minSize?: number;
    maxSize?: number;
    collapsible?: boolean;
    collapsedSize?: number;
}

const props = withDefaults(defineProps<{
    direction?: "horizontal" | "vertical";
    autoSaveId?: string;
    disabled?: boolean;
    panels?: SplitterPanelConfig[];
}>(), {
    direction: "horizontal",
    autoSaveId: undefined,
    disabled: false,
    panels: () => [],
});

const emit = defineEmits<{
    (e: "layout", sizes: number[]): void;
}>();
</script>

<template>
    <SplitterGroup
        :direction="props.direction"
        :auto-save-id="props.autoSaveId"
        class="flex h-full w-full overflow-hidden"
        :class="props.direction === 'vertical' ? 'flex-col' : 'flex-row'"
        @layout="(sizes) => emit('layout', sizes)"
    >
        <template v-if="props.panels.length > 0">
            <template v-for="(panel, index) in props.panels" :key="panel.id || index">
                <SplitterPanel
                    :id="panel.id"
                    :default-size="panel.defaultSize"
                    :min-size="panel.minSize"
                    :max-size="panel.maxSize"
                    :collapsible="panel.collapsible"
                    :collapsed-size="panel.collapsedSize"
                    class="overflow-auto relative"
                >
                    <slot :name="`panel-${panel.id || index}`" :panel="panel" :index="index" />
                </SplitterPanel>

                <!-- 分割拖拽手柄 -->
                <SplitterResizeHandle
                    v-if="index < props.panels.length - 1"
                    :disabled="props.disabled"
                    class="group relative flex items-center justify-center bg-[var(--divider)] transition-colors [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] hover:bg-[var(--accent-main)] focus-visible:outline-none focus-visible:bg-[var(--accent-main)] data-[state=drag]:bg-[var(--accent-main)] disabled:cursor-not-allowed select-none"
                    :class="[
                        props.direction === 'vertical'
                            ? 'h-[1px] w-full cursor-row-resize after:absolute after:left-0 after:right-0 after:top-1/2 after:h-2.5 after:-translate-y-1/2'
                            : 'w-[1px] h-full cursor-col-resize after:absolute after:top-0 after:bottom-0 after:left-1/2 after:w-2.5 after:-translate-x-1/2',
                    ]"
                >
                    <div
                        class="opacity-0 group-hover:opacity-100 group-data-[state=drag]:opacity-100 transition-opacity [transition-duration:var(--motion-fast)] [transition-timing-function:var(--ease-standard)] rounded-full bg-[var(--accent-main)] shadow-[0_0_6px_color-mix(in_srgb,var(--accent-main)_50%,transparent)]"
                        :class="props.direction === 'vertical' ? 'h-1 w-6' : 'w-1 h-6'"
                    />
                </SplitterResizeHandle>
            </template>
        </template>
        <template v-else>
            <slot />
        </template>
    </SplitterGroup>
</template>
