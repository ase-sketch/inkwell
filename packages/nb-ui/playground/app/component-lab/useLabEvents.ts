import {ref} from "vue";

export type LabEventEntry = {
    id: number;
    time: string;
    name: string;
    payload: string;
};

export const LAB_EVENT_LIMIT = 100;

function formatPayload(payload: unknown): string {
    if (payload === undefined || payload === null) return "";
    let text: string;
    try {
        text = JSON.stringify(payload);
    } catch {
        text = "不可序列化";
    }
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

/** 事件日志：只存在当前页面会话，不写 localStorage；超出上限丢弃最旧条目 */
export function useLabEvents(limit = LAB_EVENT_LIMIT) {
    const events = ref<LabEventEntry[]>([]);
    let seq = 0;

    function record(name: string, payload?: unknown): void {
        seq += 1;
        events.value.unshift({
            id: seq,
            time: new Date().toLocaleTimeString("zh-CN", {hour12: false}),
            name,
            payload: formatPayload(payload),
        });
        if (events.value.length > limit) events.value.length = limit;
    }

    function clear(): void {
        events.value = [];
    }

    return {events, record, clear, limit};
}
