<script setup lang="ts">
import {nextTick, ref, watch} from "vue";
import {inspectTarget, type LabInspection} from "./inspect";

/** 检查页签：结构检查 + 真实计算样式读数。采样时机由外部 revision 驱动（useLabSampler）。 */
const props = defineProps<{
    targetSelector: string;
    sceneInvalid: boolean;
    revision: number;
}>();

const inspection = ref<LabInspection>({groups: [], checks: []});

function inspect(): void {
    const element = document.querySelector<HTMLElement>(props.targetSelector);
    const canvas = document.querySelector<HTMLElement>(".lab-canvas");
    inspection.value = inspectTarget(element, canvas, props.sceneInvalid, props.targetSelector);
}

watch(() => [props.targetSelector, props.sceneInvalid, props.revision], () => {
    void nextTick(inspect);
}, {immediate: true, flush: "post"});
</script>

<template>
    <div class="lab-checks">
        <section class="lab-checks__section">
            <h3 class="lab-panel-title">结构检查</h3>
            <div v-for="check in inspection.checks" :key="check.label" class="lab-check">
                <span class="lab-check__dot" :class="check.pass ? 'is-pass' : 'is-fail'" aria-hidden="true"></span>
                <div class="lab-check__body">
                    <span class="lab-check__label">{{ check.label }}</span>
                    <span class="lab-check__detail">{{ check.detail }}</span>
                </div>
            </div>
        </section>

        <section v-for="group in inspection.groups" :key="group.id" class="lab-checks__section">
            <h3 class="lab-panel-title">{{ group.label }}</h3>
            <dl class="lab-readout">
                <div v-for="item in group.items" :key="item.label" class="lab-readout__row">
                    <dt class="lab-readout__label">
                        <span v-if="item.swatch" class="lab-readout__swatch" :style="{background: item.swatch}" aria-hidden="true"></span>
                        {{ item.label }}
                    </dt>
                    <dd class="lab-readout__value" :title="item.value">{{ item.value }}</dd>
                </div>
            </dl>
        </section>
    </div>
</template>
