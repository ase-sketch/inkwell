<script setup lang="ts">
import type {AuthUserDto} from "nbook/shared/dto/auth.dto";

const props = defineProps<{
    currentUser: AuthUserDto | null;
}>();

const {t} = useI18n();

/**
 * 问候语用当前用户名，让空态第一行就是「对你说的话」；没有登录态时退回中性问候。
 */
const greeting = computed(() => props.currentUser?.displayName || props.currentUser?.username || "");
</script>

<template>
    <!-- 空态问候：位于对话流之上、输入药丸之下，越安静越好。 -->
    <div class="flex shrink-0 flex-col items-center gap-1.5 px-4 pb-5 pt-6 text-center" data-role="ide-chat-greeting">
        <h1 class="text-[26px] font-semibold leading-tight tracking-tight text-[var(--text-main)]">
            {{ greeting ? t("ide.shell.greetingNamed", {name: greeting}) : t("ide.shell.greeting") }}
        </h1>
        <p class="text-[13px] text-[var(--text-muted)]">{{ t("ide.shell.greetingQuestion") }}</p>
    </div>
</template>
