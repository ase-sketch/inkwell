<script setup lang="ts">
import AgentChatFlowEmptyState from "nbook/app/components/novel-ide/agent/AgentChatFlowEmptyState.vue";
import type {AuthUserDto} from "nbook/shared/dto/auth.dto";

const props = defineProps<{
    /** 当前选中了 session（未选中时提示去列表里挑一个）。 */
    selected: boolean;
    currentUser: AuthUserDto | null;
    profileKey?: string | null;
}>();

const emit = defineEmits<{
    (event: "start-interview"): void;
}>();

const {t} = useI18n();

/**
 * 问候语用当前用户名，让空态第一行就是「对你说的话」；没有登录态时退回中性问候。
 */
const greetingName = computed(() => props.currentUser?.displayName || props.currentUser?.username || "");
const isInterview = computed(() => props.profileKey === "interview.new-book");
</script>

<template>
    <!-- 空态：居中大标题问候语 + 居中的访谈入口卡（输入药丸由对话组件自己渲染在下方） -->
    <div class="flex flex-col items-center gap-6 px-4 py-8 text-center" data-role="ide-chat-empty">
        <div v-if="props.selected" class="flex flex-col items-center gap-1.5">
            <template v-if="isInterview">
                <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
                    {{ greetingName ? t("ide.shell.greetingInterviewNamed", {name: greetingName}) : t("ide.shell.greetingInterview") }}
                </h1>
                <p class="text-[13px] text-[var(--text-muted)]">{{ t("ide.shell.greetingInterviewQuestion") }}</p>
            </template>
            <template v-else>
                <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
                    {{ greetingName ? t("ide.shell.greetingNamed", {name: greetingName}) : t("ide.shell.greeting") }}
                </h1>
                <p class="text-[13px] text-[var(--text-muted)]">{{ t("ide.shell.greetingQuestion") }}</p>
            </template>
        </div>
        <div v-else class="flex flex-col items-center gap-1.5">
            <h1 class="text-[22px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">{{ t("agent.chat.unselectedTitle") }}</h1>
            <p class="text-[13px] text-[var(--text-muted)]">{{ t("agent.chat.unselectedDescription") }}</p>
        </div>

        <AgentChatFlowEmptyState v-if="props.selected" :hide-interview-card="isInterview" @start-interview="emit('start-interview')" />
    </div>
</template>
