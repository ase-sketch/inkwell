<script setup lang="ts">
import ProfileTemplateVisualEditor from "nbook/app/components/profile-template-editor/ProfileTemplateVisualEditor.vue";
import {useIdeTheme} from "nbook/app/composables/useIdeTheme";
import type {IdeTheme} from "nbook/app/utils/theme/theme-tokens";

const themeHostRef = ref<HTMLElement | null>(null);
const theme = ref<IdeTheme>("light");
const {mountThemeHost} = useIdeTheme(theme);

onMounted(() => {
    mountThemeHost(themeHostRef.value);
});
</script>

<template>
    <!-- TSX Profile 可视化编辑器独立调试页 -->
    <div ref="themeHostRef" class="h-screen min-h-0 overflow-hidden">
        <ProfileTemplateVisualEditor mode="user-profile" preferred-template="builtin/leader.assets.profile.tsx" thread-profile-key="leader.assets" />
    </div>
</template>
