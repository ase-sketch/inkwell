<script setup lang="ts">
import IconButton from "../../../src/components/controls/IconButton.vue";
import type {LabEventEntry} from "./useLabEvents";

const props = defineProps<{
    events: LabEventEntry[];
    limit: number;
}>();

const emit = defineEmits<{
    (event: "clear"): void;
}>();
</script>

<template>
    <div class="lab-events">
        <div class="lab-events__header">
            <span class="lab-events__count">{{ props.events.length }}/{{ props.limit }}</span>
            <IconButton title="清空事件日志" size="sm" :disabled="props.events.length === 0" @click="emit('clear')">
                <span class="i-lucide-trash-2" aria-hidden="true"></span>
            </IconButton>
        </div>
        <div v-if="props.events.length === 0" class="lab-events__empty">与组件交互后事件会出现在这里</div>
        <div v-for="entry in props.events" :key="entry.id" class="lab-events__row">
            <time class="lab-events__time">{{ entry.time }}</time>
            <code class="lab-events__name">{{ entry.name }}</code>
            <span class="lab-events__payload" :title="entry.payload">{{ entry.payload }}</span>
        </div>
    </div>
</template>
