<script setup lang="ts">
import {ref} from "vue";
import {Button, Dialog, FormField, FormInput, IconButton, Panel, SegmentedControl, SwitchField} from "../../../src/components";

const dialogOpen = ref(false);
const enabled = ref(true);
const mode = ref("manual");
const name = ref("manual import");
</script>

<template>
    <main class="min-h-screen bg-[var(--bg-main)] p-6 text-[var(--text-main)]">
        <Panel class="mx-auto max-w-xl space-y-4">
            <h1 class="text-xl font-semibold">Manual component imports</h1>
            <SegmentedControl v-model="mode" :options="[{label: '手动导入', value: 'manual'}, {label: '自动注册', value: 'auto'}]" />
            <SwitchField v-model="enabled" label="手动导入开关" />
            <FormField label="名称">
                <FormInput v-model="name" />
            </FormField>
            <IconButton title="打开 Dialog" variant="accent" @click="dialogOpen = true">
                <span class="i-lucide-panel-top-open h-4 w-4"></span>
            </IconButton>
            <Button variant="secondary" @click="dialogOpen = true">手动导入 Button</Button>
        </Panel>
        <Dialog v-model="dialogOpen" title="手动导入 Dialog" show-cancel>
            <p>这个页面用于验证 components barrel 导出的组件值可以被宿主手动导入。</p>
        </Dialog>
    </main>
</template>
