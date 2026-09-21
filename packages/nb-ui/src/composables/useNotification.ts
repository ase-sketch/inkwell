import {readonly, ref} from "vue";

export type NotificationTone = "success" | "warning" | "info" | "error";

export type NotificationAction = {
    label: string;
    run: () => void;
};

export type NotificationInput = {
    message: string;
    title?: string;
    tone?: NotificationTone;
    action?: NotificationAction;
    duration?: number;
};

export type NotificationItem = Required<Pick<NotificationInput, "tone" | "duration">> & NotificationInput & {
    id: string;
};

const notifications = ref<NotificationItem[]>([]);
const timers = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
// 自动关闭到期时间戳；pause 时据此换算剩余时长
const deadlines = new Map<string, number>();

function createId(): string {
    return `notice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 启动/重启某条通知的自动关闭计时 */
function schedule(id: string, duration: number, remove: (id: string) => void): void {
    deadlines.set(id, Date.now() + duration);
    timers.set(id, globalThis.setTimeout(() => remove(id), duration));
}

/**
 * 全局轻量通知队列。宿主应用只需挂一个 NotificationViewport。
 */
export function useNotification() {
    function remove(id: string): void {
        const timer = timers.get(id);
        if (timer) {
            globalThis.clearTimeout(timer);
            timers.delete(id);
        }
        deadlines.delete(id);
        notifications.value = notifications.value.filter((item) => item.id !== id);
    }

    /** 暂停自动关闭（悬停时调用），记录剩余时长 */
    function pause(id: string): void {
        const timer = timers.get(id);
        if (!timer) {
            return;
        }
        globalThis.clearTimeout(timer);
        timers.delete(id);
    }

    /** 恢复自动关闭：按暂停时的剩余时长重新计时（至少留 800ms 反应时间） */
    function resume(id: string): void {
        const deadline = deadlines.get(id);
        if (deadline === undefined || timers.has(id)) {
            return;
        }
        schedule(id, Math.max(deadline - Date.now(), 800), remove);
    }

    function notify(input: NotificationInput | string): string {
        const normalized = typeof input === "string" ? {message: input} : input;
        const item: NotificationItem = {
            id: createId(),
            message: normalized.message,
            title: normalized.title,
            tone: normalized.tone ?? "info",
            action: normalized.action,
            duration: normalized.duration ?? 3200,
        };
        notifications.value = [...notifications.value, item];
        if (item.duration > 0) {
            schedule(item.id, item.duration, remove);
        }
        return item.id;
    }

    /** 清空全部通知与计时器（测试隔离、登出清屏等场景） */
    function clearAll(): void {
        for (const timer of timers.values()) {
            globalThis.clearTimeout(timer);
        }
        timers.clear();
        deadlines.clear();
        notifications.value = [];
    }

    return {
        notifications: readonly(notifications),
        notify,
        remove,
        clearAll,
        pause,
        resume,
        success: (message: string, options?: Omit<NotificationInput, "message" | "tone">) => notify({...options, message, tone: "success"}),
        warning: (message: string, options?: Omit<NotificationInput, "message" | "tone">) => notify({...options, message, tone: "warning", duration: options?.duration ?? 4200}),
        error: (message: string, options?: Omit<NotificationInput, "message" | "tone">) => notify({...options, message, tone: "error", duration: options?.duration ?? 5200}),
        info: (message: string, options?: Omit<NotificationInput, "message" | "tone">) => notify({...options, message, tone: "info"}),
    };
}
