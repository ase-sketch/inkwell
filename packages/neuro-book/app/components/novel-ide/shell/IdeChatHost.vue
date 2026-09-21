<script setup lang="ts">
/**
 * 对话宿主：给 AgentChatSurface 一个不随主区情境切换而重挂载的父元素。
 *
 * 主区形态（居中 / 右侧伴随栏 / 主区互换）由宿主的 flex 与宽度决定；这个组件本身
 * 只负责把 surface 撑满，并用 CSS 调整消息正文的阅读宽度。surface 内部逻辑不在这里改。
 */
withDefaults(defineProps<{
    /** 对话是否占据主区中央。 */
    centered?: boolean;
}>(), {
    centered: false,
});
</script>

<template>
    <!-- 对话宿主 -->
    <div
        class="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--bg-panel)]"
        :class="centered ? 'ide-chat-host--centered' : ''"
        data-role="ide-chat-host"
    >
        <slot />
    </div>
</template>

<style scoped>
/* 对话居中时收窄消息与输入区的阅读宽度，保留留白；伴随栏宽度不变。 */
.ide-chat-host--centered :deep(.agent-chat-flow) > *,
.ide-chat-host--centered :deep(.agent-composer) {
    width: 100%;
    max-width: 720px;
    margin-left: auto;
    margin-right: auto;
}
</style>
