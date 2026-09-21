<script setup lang="ts">
import {computed, nextTick, ref, watch} from "vue";
import {onClickOutside} from "@vueuse/core";
import {useAnchoredPopup} from "../../../src/composables/useAnchoredPopup";
import {NB_Z_INDEX} from "../../../src/theme/z-index";
import {
    TIME_PICKER_DEFAULT_STEP,
    clampMinutes,
    formatMinutes,
    parseTimeToMinutes,
} from "../../../src/components/form/time-picker-contract";
import type {TimePickerEmits, TimePickerProps} from "../../../src/components/form/time-picker-contract";

/**
 * macOS 主题的时间选择器：iOS 式滚轮。
 *
 * 与库默认实现（输入框 + 下拉列表）刻意做成**最大反差**——
 * 那个能直接打字、候选是一条竖列表；这个不能打字、小时和分钟是两根独立的滚轮。
 * 而 props、v-model、↑↓/Enter/Esc/Tab 的行为完全一致，两者跑的是同一份契约测试。
 *
 * 这正是要证明的事：**契约定在数据层，交互形态归主题**。
 * 如果契约里写了「有一个可输入的文本框」，这个实现根本不可能存在。
 *
 * 滚轮的滚动位置由 v-model 派生，不自己存一份——两份状态一定会漂移。
 * 用 scroll-snap 而不是手写惯性：浏览器原生的贴合已经够，自己实现只会在触控板上更差。
 */
const props = withDefaults(defineProps<TimePickerProps>(), {
    modelValue: undefined,
    min: undefined,
    max: undefined,
    step: TIME_PICKER_DEFAULT_STEP,
    disabled: false,
    invalid: false,
    placeholder: "--:--",
    id: undefined,
});

const emit = defineEmits<TimePickerEmits>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const wheel = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
/** Esc 要回滚到的值：在触发器获得焦点的那一刻记下 */
const anchor = ref<string | undefined>(props.modelValue);

const listId = computed(() => `${props.id ?? "nb-time-picker"}-wheel`);
const label = computed(() => props.modelValue ?? props.placeholder);

const lowerBound = computed(() => parseTimeToMinutes(props.min ?? "00:00") ?? 0);
const upperBound = computed(() => parseTimeToMinutes(props.max ?? "23:59") ?? 24 * 60 - 1);
const current = computed(() => parseTimeToMinutes(props.modelValue));

/** 小时轮：只列范围内真正取得到的整点 */
const hours = computed(() => {
    const list: number[] = [];
    for (let h = Math.floor(lowerBound.value / 60); h <= Math.floor(upperBound.value / 60); h += 1) {
        list.push(h);
    }
    return list;
});

/** 分钟轮：按 step 分档，与列表实现的粒度口径一致 */
const minutes = computed(() => {
    const safeStep = Number.isFinite(props.step) && props.step > 0 ? Math.floor(props.step) : TIME_PICKER_DEFAULT_STEP;
    const list: number[] = [];
    for (let m = 0; m < 60; m += safeStep) {
        list.push(m);
    }
    return list;
});

const activeHour = computed(() => (current.value === null ? null : Math.floor(current.value / 60)));
const activeMinute = computed(() => (current.value === null ? null : current.value % 60));

function commit(value: number): void {
    emit("update:modelValue", formatMinutes(clampMinutes(value, props.min, props.max)));
}

/** ↑↓ 的增量。没有当前值时从 min 起步，与库默认实现同口径 */
function adjust(direction: 1 | -1): void {
    if (current.value === null) {
        commit(lowerBound.value);
        return;
    }
    commit(current.value + direction * props.step);
}

async function focusTrigger(): Promise<void> {
    await nextTick();
    trigger.value?.focus();
}

function close(): void {
    open.value = false;
    void focusTrigger();
}

/*
 * 点外面关掉。与 Esc 刻意不同的两点：**不回滚值**（点外面是「就这样吧」，Esc 才是「算了」），
 * **不抢回焦点**（用户刚点了别的东西，把焦点拽回来会跟他抢）。库默认实现同款。
 *
 * ignore 必须带上滚轮本体：它已经被传送到 body，DOM 上不再是 root 的后代，
 * 不排除的话「先选小时再选分钟」会在选完小时那一下就被判成点了外面。
 */
onClickOutside(
    root,
    () => {
        open.value = false;
    },
    {ignore: [wheel]},
);

const popupStyle = useAnchoredPopup(trigger, wheel, open);

function onFocus(): void {
    anchor.value = props.modelValue;
}

function onKeydown(event: KeyboardEvent): void {
    if (props.disabled) {
        return;
    }
    switch (event.key) {
        case "ArrowUp": {
            event.preventDefault();
            adjust(-1);
            break;
        }
        case "ArrowDown": {
            event.preventDefault();
            adjust(1);
            break;
        }
        case "Enter": {
            event.preventDefault();
            if (open.value) {
                close();
            } else {
                open.value = true;
            }
            break;
        }
        case "Escape": {
            event.preventDefault();
            emit("update:modelValue", anchor.value);
            close();
            break;
        }
        // Tab 不拦截：原生移焦是契约的一部分
        default: {
            break;
        }
    }
}

function pickHour(hour: number): void {
    commit(hour * 60 + (activeMinute.value ?? 0));
}

function pickMinute(minute: number): void {
    commit((activeHour.value ?? Math.floor(lowerBound.value / 60)) * 60 + minute);
}

/** 打开时把选中项滚到中央。滚动位置是派生的，所以每次打开都重算而不是记住 */
const hourColumn = ref<HTMLElement | null>(null);
const minuteColumn = ref<HTMLElement | null>(null);

/*
 * 直接算 scrollTop，**不用 scrollIntoView**。
 *
 * scrollIntoView 会连带滚动所有可滚的祖先，于是「点开一个时间选择器」变成「整页跳走」——
 * 这是上一版最刺眼的毛病，而且越是把页面往下摆越明显。
 *
 * 能算得准的前提写在样式里：列的上下留白正好是「半个轮子减半个格子」，
 * 所以第 0 项的 scrollTop 恰好是 0、最后一项恰好等于最大可滚距离，首尾都对得上中央的选中带。
 */
function centerSelected(column: HTMLElement | null): void {
    const selected = column?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (column == null || selected == null) {
        return;
    }
    column.scrollTop = selected.offsetTop - (column.clientHeight - selected.offsetHeight) / 2;
}

watch(open, async (isOpen) => {
    if (!isOpen) {
        return;
    }
    await nextTick();
    centerSelected(hourColumn.value);
    centerSelected(minuteColumn.value);
});
</script>

<template>
    <div ref="root" class="relative" data-nb-time-picker="macos-wheel">
        <button
            ref="trigger"
            type="button"
            role="combobox"
            :id="props.id || undefined"
            :disabled="props.disabled"
            :aria-expanded="open"
            :aria-controls="listId"
            aria-haspopup="listbox"
            :aria-invalid="props.invalid || undefined"
            class="nb-ui-control w-full border text-left outline-none transition-all disabled:cursor-not-allowed disabled:opacity-60"
            :style="{
                height: 'var(--control-h-md)',
                paddingInline: 'var(--control-px)',
                borderRadius: 'var(--radius-control)',
                borderWidth: 'var(--border-w)',
                borderColor: props.invalid ? 'var(--status-danger)' : 'var(--control-outline)',
                background: 'var(--control-surface)',
                backgroundImage: 'var(--surface-raise)',
                boxShadow: 'var(--inset-shadow)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-mono)',
                color: props.modelValue === undefined ? 'var(--text-muted)' : 'var(--text-main)',
            }"
            @focus="onFocus"
            @keydown="onKeydown"
            @click="open = props.disabled ? false : !open"
        >
            {{ label }}
        </button>

        <!--
            两根滚轮。传送到 body：原地绝对定位会被任何一个 overflow: hidden 的祖先切掉，
            而面板为了圆角本来就得 overflow: hidden——上一版在对照页里就只露出顶上一条边。

            外观（磨砂、圆角、描边、阴影）全部由 .nb-ui-popover-surface 一处给，
            不在这里重写——菜单、对话框、下拉都从那个登记处取，滚轮没有理由自己分叉。
        -->
        <Teleport to="body">
            <div
                v-if="open"
                ref="wheel"
                :id="listId"
                class="nb-wheel flex overflow-hidden nb-ui-popover-surface nb-ui-menu-surface"
                :style="{...popupStyle, zIndex: String(NB_Z_INDEX.popover)}"
            >
                <!--
                    中央的选中带。iOS 滚轮靠它 + 上下渐隐来表达「转到哪儿算哪儿」，
                    没有这两样就只是两列可以滚的文字。放在列前面并让列 position: relative，
                    带就压在数字底下而不是盖在上面。
                -->
                <span class="nb-wheel-band" aria-hidden="true"></span>

                <ul
                    ref="hourColumn"
                    role="listbox"
                    aria-label="小时"
                    class="nb-wheel-column"
                >
                    <li
                        v-for="hour in hours"
                        :key="hour"
                        role="option"
                        :aria-selected="hour === activeHour"
                        class="nb-wheel-item cursor-pointer"
                        :style="{
                            minWidth: '3.5rem',
                            paddingInline: 'var(--space-4)',
                            fontSize: 'var(--text-md)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: hour === activeHour ? '600' : '400',
                            color: hour === activeHour ? 'var(--text-main)' : 'var(--text-secondary)',
                        }"
                        @click="pickHour(hour)"
                    >
                        {{ String(hour).padStart(2, "0") }}
                    </li>
                </ul>

                <ul
                    ref="minuteColumn"
                    role="listbox"
                    aria-label="分钟"
                    class="nb-wheel-column"
                    :style="{borderLeft: 'var(--border-w) solid var(--divider)'}"
                >
                    <li
                        v-for="minute in minutes"
                        :key="minute"
                        role="option"
                        :aria-selected="minute === activeMinute"
                        class="nb-wheel-item cursor-pointer"
                        :style="{
                            minWidth: '3.5rem',
                            paddingInline: 'var(--space-4)',
                            fontSize: 'var(--text-md)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: minute === activeMinute ? '600' : '400',
                            color: minute === activeMinute ? 'var(--text-main)' : 'var(--text-secondary)',
                        }"
                        @click="pickMinute(minute)"
                    >
                        {{ String(minute).padStart(2, "0") }}
                    </li>
                </ul>
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
/*
 * 滚轮的几何。三个数互相咬死，改一个必须一起改：
 *   --wheel-h    一根轮子露出多高
 *   --wheel-item 一格多高（跟控件高度同档，这样轮子和触发器是同一套刻度）
 *   --wheel-pad  上下留白 = 半个轮子 − 半个格子
 *
 * --wheel-pad 不是随手给的 padding：只有正好这个值，首项和末项才能滚到轮子中央。
 * 给小了，第一项永远对不上选中带，用户会看到「选中的是这个、亮的是那个」。
 */
.nb-wheel {
    --wheel-h: 10rem;
    --wheel-item: var(--control-h-md);
    --wheel-pad: calc((var(--wheel-h) - var(--wheel-item)) / 2);
}

.nb-wheel-column {
    position: relative;
    height: var(--wheel-h);
    padding-block: var(--wheel-pad);
    overflow-y: auto;
    scroll-snap-type: y mandatory;
    /* 条会破坏「一根轮子」的隐喻，且两列各一条会挤掉数字的位置 */
    scrollbar-width: none;
    /* 上下渐隐。用 mask 而不是叠两块渐变色块：渐变块得知道背后是什么颜色，
       而这是块玻璃，背后是什么取决于页面——mask 直接抠透明度，与底色无关 */
    mask-image: linear-gradient(to bottom, transparent 0, #000 30%, #000 70%, transparent 100%);
}

.nb-wheel-column::-webkit-scrollbar {
    display: none;
}

.nb-wheel-item {
    display: flex;
    align-items: center;
    justify-content: center;
    height: var(--wheel-item);
    scroll-snap-align: center;
}

.nb-wheel-band {
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: var(--wheel-item);
    transform: translateY(-50%);
    pointer-events: none;
    border-block: var(--border-w) solid var(--divider);
    background: color-mix(in srgb, var(--text-main) 6%, transparent);
}

/* 渐隐是靠 mask 做的，而 mask 本身就是一种「看不见的动效」：
   关掉透明度偏好时把它一起收掉，否则轮子上下两端的字会永远是半透明的 */
@media (prefers-reduced-transparency: reduce) {
    .nb-wheel-column {
        mask-image: none;
    }
}
</style>
