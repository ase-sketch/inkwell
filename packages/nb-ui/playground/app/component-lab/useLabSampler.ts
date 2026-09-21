import {nextTick, watch} from "vue";

/**
 * 采样调度：主题、配色、变量覆盖、场景任一变化后，rAF 节流 + nextTick 重跑采样。
 *
 * 旧实现的缺陷是只刷新变量面板的 resolvedValues，检查器读数不跟着主题/配色走；
 * 这里把「什么时候重新采样」收拢到一处，检查器与变量面板共用同一个触发器。
 */
export function useLabSampler(sources: () => unknown, sample: () => void): void {
    let scheduled = false;
    watch(sources, () => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            void nextTick(sample);
        });
    }, {deep: true, flush: "post"});
}
