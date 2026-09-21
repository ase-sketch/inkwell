<script setup lang="ts">
import {ref} from "vue";
import WorldEngineSubjectStateViewer from "nbook/app/components/novel-ide/world-engine/WorldEngineSubjectStateViewer.vue";
import type {WorldPreviewSchemaType} from "nbook/app/utils/world-engine-preview";
import type {SubjectStateDto} from "nbook/app/components/novel-ide/world-engine/world-engine-workbench.types";

const mockSchemaType: WorldPreviewSchemaType = {
    type: "character",
    desc: "角色",
    attrs: [
        { name: "hp", kind: "scalar", type: "number", desc: "生命值" },
        { name: "maxHp", kind: "scalar", type: "number", desc: "最大生命值" },
        { name: "level", kind: "scalar", type: "number", desc: "等级" },
        { name: "location", kind: "scalar", type: "string", desc: "ref:location" },
        { name: "mentor", kind: "scalar", type: "string", desc: "ref:character" },
        { name: "skills", kind: "collection", itemType: "string", desc: "技能列表（无序集合）" },
        { 
            name: "equipment", 
            kind: "object", 
            desc: "装备栏",
            fields: {
                weapon: { name: "weapon", kind: "scalar", type: "string", desc: "主武器" },
                armor: { 
                    name: "armor", 
                    kind: "object", 
                    desc: "防具",
                    fields: {
                        name: { name: "name", kind: "scalar", type: "string", desc: "防具名称" },
                        def: { name: "def", kind: "scalar", type: "number", desc: "防御力" }
                    }
                }
            }
        },
        { name: "memory", kind: "object", desc: "记忆库（K-V）" },
        { name: "events", kind: "list", itemType: "string", desc: "经历事件" },
        { name: "emptyAttr", kind: "scalar", type: "string", desc: "带默认值的空属性", default: "默认数值提示" },
        { name: "anotherUndefinedAttr", kind: "scalar", type: "number", desc: "无默认值的空属性" }
    ]
};

const mockState: SubjectStateDto = {
    subjectId: "subject_elena_001",
    type: "character",
    attrs: {
        hp: 85,
        maxHp: 100,
        level: 5,
        location: "loc_library_01",
        mentor: "subject_orlando_001",
        skills: ["剑术", "初级火球术", "侦察"],
        equipment: {
            weapon: "精灵长剑",
            armor: {
                name: "学徒法袍",
                def: 12
            }
        },
        memory: {
            "m1": { text: "第一天来到了这里", vector: [] },
            "m2": { text: "打败了一只史莱姆", vector: [] }
        },
        events: [
            "2023-01-01: 离开新手村",
            "2023-01-02: 遇到奥兰多"
        ]
    }
};

const mockSubjectNameMap = new Map<string, string>([
    ["loc_library_01", "大图书馆"],
    ["subject_orlando_001", "导师奥兰多"]
]);
</script>

<template>
    <div class="flex h-screen w-full flex-col bg-[var(--bg-main)] text-[var(--text-main)]">
        <header class="flex shrink-0 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-panel)] px-4 py-3">
            <span class="i-lucide-box h-5 w-5 text-[var(--accent-main)]"></span>
            <h1 class="text-[14px] font-semibold">Subject State Viewer Preview</h1>
        </header>
        
        <main class="min-h-0 flex-1 overflow-auto p-6">
            <div class="mx-auto max-w-4xl">
                <WorldEngineSubjectStateViewer
                    subject-id="subject_elena_001"
                    subject-name="艾莉娜·晨曦"
                    :schema-type="mockSchemaType"
                    :state="mockState"
                    :subject-name-map="mockSubjectNameMap"
                />
            </div>
        </main>
    </div>
</template>
