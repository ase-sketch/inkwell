<script setup lang="ts">
import type {DropdownItem} from "nbook/app/components/common/dropdown.types";
import Dropdown from "nbook/app/components/common/Dropdown.vue";
import type {AuthUserDto} from "nbook/shared/dto/auth.dto";

const props = withDefaults(defineProps<{
    currentUser: AuthUserDto | null;
    rootClass?: string;
    menuClass?: string;
    /** 触发器形态：圆形头像（窄栏）或整行「头像 + 用户名」（宽侧栏）。 */
    variant?: "avatar" | "row";
}>(), {
    rootClass: "relative w-8 shrink-0",
    menuClass: "right-0 top-full mt-2 w-40",
    variant: "avatar",
});

const emit = defineEmits<{
    (event: "open-profile"): void;
    (event: "open-admin"): void;
    (event: "logout"): void;
}>();

const {t} = useI18n();

const menuItems = computed<DropdownItem[]>(() => {
    const items: DropdownItem[] = [{
        label: t("ide.header.profile"),
        value: "profile",
        iconClass: "i-lucide-user-round",
    }];
    if (props.currentUser?.role === "admin") {
        items.push({
            label: t("ide.header.openAdmin"),
            value: "admin",
            iconClass: "i-lucide-shield",
        });
    }
    items.push({
        label: t("ide.header.localLogout"),
        value: "logout",
        iconClass: "i-lucide-log-out",
    });
    return items;
});

/** 当前本地登录用户的头像文字。 */
const userInitial = computed(() => {
    const name = props.currentUser?.displayName || props.currentUser?.username || "U";
    return name.trim().slice(0, 1).toLocaleUpperCase();
});

/** 宽侧栏里的用户名；没有登录态时由调用方决定回退文案。 */
const userName = computed(() => props.currentUser?.displayName || props.currentUser?.username || "");

/** 将账户菜单动作交给页面宿主执行。 */
function selectMenuItem(value: string): void {
    if (value === "profile") {
        emit("open-profile");
        return;
    }
    if (value === "admin") {
        emit("open-admin");
        return;
    }
    if (value === "logout") {
        emit("logout");
    }
}
</script>

<template>
    <!-- 本地账户菜单：个人中心、管理员后台与本地退出的唯一入口实现。 -->
    <div :class="props.variant === 'row' ? 'min-w-0 flex-1' : 'w-8 shrink-0'">
        <Dropdown :items="menuItems" :root-class="props.rootClass" :menu-class="props.menuClass" @select="selectMenuItem">
            <button
                type="button"
                class="flex items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-main)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-main)]"
                :class="props.variant === 'row'
                    ? 'h-9 w-full min-w-0 gap-2 rounded-md px-2 text-left'
                    : 'h-8 w-8 justify-center rounded-full border border-[var(--border-color)] bg-[var(--bg-input)] hover:border-[var(--border-strong)]'"
                :title="t('ide.header.accountMenu')"
            >
                <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-bg)] text-[11px] font-semibold text-[var(--accent-text)]">{{ userInitial }}</span>
                <span v-if="props.variant === 'row'" class="min-w-0 flex-1 truncate text-[12px]">{{ userName || t('ide.header.accountMenu') }}</span>
            </button>
        </Dropdown>
    </div>
</template>
