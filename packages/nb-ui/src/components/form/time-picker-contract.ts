/**
 * 时间选择器契约 v1（契约 id `time-picker@1`，见 src/theme/contracts.ts）。
 *
 * 这是第一个允许主题覆盖的组件，也是「契约定在哪一层」这个问题的答案：
 *
 * · **数据层进契约**：props / emits / 键盘行为 / a11y 角色。
 * · **交互形态不进契约**：默认实现是输入框 + 下拉时间列表，macOS 主题是 iOS 式滚轮，
 *   两者 v-model 完全一致、键盘完全一致，长相和操作手感完全不同。这正是要证明的事。
 * · **DOM 结构不进契约**。直接反例：Radix Themes 的公开 props 一个没改，
 *   内部 HTML 重构照样破坏了依赖它的覆盖。所以契约测试只从 role 和 v-model 下手，
 *   不断言任何标签或 class。
 * · **不含 slot**。slot 会把布局锁死，主题就没法换形态了。
 *
 * `modelValue` 用字符串不用 `Date`：一天中的时刻没有日期，用 Date 得编一个假日期；
 * 字符串跨契约边界也天然可序列化。格式只认一种——`"HH:mm"` 24 小时制，补零。
 */
export type TimePickerProps = {
    /** `"HH:mm"` 24 小时制。undefined = 未选择 */
    modelValue?: string;
    /** 可选范围下界，含。默认 `"00:00"` */
    min?: string;
    /** 可选范围上界，含。默认 `"23:59"` */
    max?: string;
    /** 步进，单位分钟。↑↓ 的增量，也是候选列表的粒度 */
    step?: number;
    disabled?: boolean;
    invalid?: boolean;
    placeholder?: string;
    /** 与外部 <label for> 关联。不给时回落到 FormField 注入的 id */
    id?: string;
};

export type TimePickerEmits = {
    "update:modelValue": [value: string | undefined];
};

/**
 * 键盘契约（两个实现必须一致）：
 *
 * · ↑ / ↓      按 step 调整当前值，立即 emit。没有值时从 min 开始
 * · Enter      关闭浮层并把焦点还给触发器；已关闭时打开
 * · Esc        回滚到**获得焦点那一刻**的值，关闭浮层，焦点回触发器
 * · Tab        原生移焦，不拦截
 *
 * a11y 契约：触发器带 `role="combobox"` + `aria-expanded` + `aria-controls`，
 * 关闭后焦点必须回到触发器——否则键盘用户会掉进文档开头。
 */
export const TIME_PICKER_DEFAULT_MIN = "00:00";
export const TIME_PICKER_DEFAULT_MAX = "23:59";
export const TIME_PICKER_DEFAULT_STEP = 30;

/** 严格解析 `"HH:mm"`。任何别的写法都返回 null，不做猜测——猜错比拒绝更难查 */
export function parseTimeToMinutes(value: string | undefined): number | null {
    if (value === undefined) {
        return null;
    }
    const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
    if (match === null) {
        return null;
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        return null;
    }
    return hours * 60 + minutes;
}

export function formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function clampMinutes(minutes: number, min: string | undefined, max: string | undefined): number {
    const lower = parseTimeToMinutes(min ?? TIME_PICKER_DEFAULT_MIN) ?? 0;
    const upper = parseTimeToMinutes(max ?? TIME_PICKER_DEFAULT_MAX) ?? 24 * 60 - 1;
    return Math.min(Math.max(minutes, lower), upper);
}

/**
 * 候选时刻列表：从 min 起按 step 递增到 max。
 *
 * 从 min 起而不是从 00:00 起，是因为 min 通常本身就是一个用户想选的时刻
 * （「营业时间 09:00 开始」），从 00:00 起步会让它落不到刻度上。
 */
export function timeOptions(min: string | undefined, max: string | undefined, step: number): string[] {
    const lower = parseTimeToMinutes(min ?? TIME_PICKER_DEFAULT_MIN) ?? 0;
    const upper = parseTimeToMinutes(max ?? TIME_PICKER_DEFAULT_MAX) ?? 24 * 60 - 1;
    const safeStep = Number.isFinite(step) && step > 0 ? Math.floor(step) : TIME_PICKER_DEFAULT_STEP;

    const options: string[] = [];
    for (let minutes = lower; minutes <= upper; minutes += safeStep) {
        options.push(formatMinutes(minutes));
    }
    return options;
}
