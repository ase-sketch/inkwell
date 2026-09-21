<script setup lang="ts">
import {computed, nextTick, ref, watch} from "vue";
import type {FileTreeMove, FileTreeNode, FileTreeVisibleNode} from "./file-tree.types";

const props = withDefaults(defineProps<{
    nodes: FileTreeNode[];
    selectedId?: string | null;
    expandedIds: string[];
    ariaLabel?: string;
    draggable?: boolean;
    indent?: number;
}>(), {
    selectedId: null,
    ariaLabel: "文件树",
    draggable: false,
    indent: 18,
});

const emit = defineEmits<{
    (e: "update:expandedIds", value: string[]): void;
    (e: "select", node: FileTreeNode): void;
    (e: "activate", node: FileTreeNode): void;
    (e: "move", payload: FileTreeMove): void;
    (e: "contextmenu", node: FileTreeNode, event: MouseEvent): void;
    (e: "root-contextmenu", event: MouseEvent): void;
}>();

const treeRef = ref<HTMLElement | null>(null);
const focusedId = ref<string | null>(props.selectedId);
const draggedId = ref<string | null>(null);
const dropTargetId = ref<string | null>(null);
const dropPosition = ref<FileTreeMove["position"] | null>(null);
const expandedSet = computed(() => new Set(props.expandedIds));

const nodeById = computed(() => {
    const map = new Map<string, FileTreeNode>();
    const visit = (nodes: FileTreeNode[]): void => {
        for (const node of nodes) {
            map.set(node.id, node);
            visit(node.children ?? []);
        }
    };
    visit(props.nodes);
    return map;
});

const parentById = computed(() => {
    const map = new Map<string, string | null>();
    const visit = (nodes: FileTreeNode[], parentId: string | null): void => {
        for (const node of nodes) {
            map.set(node.id, parentId);
            visit(node.children ?? [], node.id);
        }
    };
    visit(props.nodes, null);
    return map;
});

const visibleNodes = computed<FileTreeVisibleNode[]>(() => {
    const visible: FileTreeVisibleNode[] = [];
    const visit = (nodes: FileTreeNode[], depth: number, parentId: string | null): void => {
        for (const node of nodes) {
            visible.push({node, depth, parentId});
            if (node.kind === "directory" && expandedSet.value.has(node.id)) {
                visit(node.children ?? [], depth + 1, node.id);
            }
        }
    };
    visit(props.nodes, 0, null);
    return visible;
});

function isBranch(node: FileTreeNode): boolean {
    return node.kind === "directory";
}

function isExpanded(node: FileTreeNode): boolean {
    return isBranch(node) && expandedSet.value.has(node.id);
}

function toggle(node: FileTreeNode): void {
    if (!isBranch(node) || node.disabled) {
        return;
    }
    const next = new Set(props.expandedIds);
    if (next.has(node.id)) {
        next.delete(node.id);
    } else {
        next.add(node.id);
    }
    emit("update:expandedIds", [...next]);
}

function select(node: FileTreeNode): void {
    if (node.disabled) {
        return;
    }
    focusedId.value = node.id;
    emit("select", node);
}

function focusNode(id: string): void {
    focusedId.value = id;
    void nextTick(() => {
        treeRef.value?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.focus();
    });
}

function handleKeydown(event: KeyboardEvent, entry: FileTreeVisibleNode): void {
    const index = visibleNodes.value.findIndex((candidate) => candidate.node.id === entry.node.id);
    let nextId: string | null = null;
    if (event.key === "ArrowDown") {
        nextId = visibleNodes.value[Math.min(index + 1, visibleNodes.value.length - 1)]?.node.id ?? null;
    } else if (event.key === "ArrowUp") {
        nextId = visibleNodes.value[Math.max(index - 1, 0)]?.node.id ?? null;
    } else if (event.key === "Home") {
        nextId = visibleNodes.value[0]?.node.id ?? null;
    } else if (event.key === "End") {
        nextId = visibleNodes.value.at(-1)?.node.id ?? null;
    } else if (event.key === "ArrowRight" && isBranch(entry.node)) {
        if (!isExpanded(entry.node)) {
            toggle(entry.node);
        } else {
            nextId = visibleNodes.value[index + 1]?.node.id ?? null;
        }
    } else if (event.key === "ArrowLeft") {
        if (isExpanded(entry.node)) {
            toggle(entry.node);
        } else {
            nextId = entry.parentId;
        }
    } else if (event.key === "Enter") {
        emit("activate", entry.node);
    } else if (event.key === " ") {
        select(entry.node);
    } else {
        return;
    }
    event.preventDefault();
    if (nextId) {
        focusNode(nextId);
    }
}

function isDescendant(ancestorId: string, candidateId: string): boolean {
    let current: string | null | undefined = candidateId;
    while (current) {
        if (current === ancestorId) {
            return true;
        }
        current = parentById.value.get(current);
    }
    return false;
}

function clearDrag(): void {
    draggedId.value = null;
    dropTargetId.value = null;
    dropPosition.value = null;
}

function startDrag(node: FileTreeNode, event: DragEvent): void {
    if (!props.draggable || node.disabled) {
        event.preventDefault();
        return;
    }
    draggedId.value = node.id;
    event.dataTransfer?.setData("text/plain", node.id);
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
    }
}

function updateDrop(node: FileTreeNode, event: DragEvent): void {
    if (!props.draggable || !draggedId.value || draggedId.value === node.id || isDescendant(draggedId.value, node.id)) {
        return;
    }
    event.preventDefault();
    const row = event.currentTarget as HTMLElement;
    const ratio = (event.clientY - row.getBoundingClientRect().top) / Math.max(row.getBoundingClientRect().height, 1);
    dropTargetId.value = node.id;
    dropPosition.value = node.kind === "directory" && ratio >= 0.25 && ratio <= 0.75
        ? "inside"
        : ratio < 0.5 ? "before" : "after";
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

function commitDrop(event: DragEvent): void {
    event.preventDefault();
    if (draggedId.value && dropTargetId.value && dropPosition.value) {
        emit("move", {sourceId: draggedId.value, targetId: dropTargetId.value, position: dropPosition.value});
    }
    clearDrag();
}

function rootDrop(event: DragEvent): void {
    if ((event.target as HTMLElement | null)?.closest("[data-tree-id]")) {
        return;
    }
    event.preventDefault();
    if (props.draggable && draggedId.value) {
        emit("move", {sourceId: draggedId.value, targetId: null, position: "root"});
    }
    clearDrag();
}

function rootContextMenu(event: MouseEvent): void {
    if (!(event.target as HTMLElement | null)?.closest("[data-tree-id]")) {
        emit("root-contextmenu", event);
    }
}

watch([visibleNodes, () => props.selectedId], () => {
    const visibleIds = new Set(visibleNodes.value.map((entry) => entry.node.id));
    if (props.selectedId && visibleIds.has(props.selectedId)) {
        focusedId.value = props.selectedId;
    } else if (!focusedId.value || !visibleIds.has(focusedId.value)) {
        focusedId.value = visibleNodes.value[0]?.node.id ?? null;
    }
}, {immediate: true});
</script>

<template>
    <!-- 受控文件树：消费方持有选择、展开和数据变更。 -->
    <div
        ref="treeRef"
        role="tree"
        :aria-label="props.ariaLabel"
        class="relative min-h-10 select-none py-1 text-sm text-[var(--text-main)]"
        @dragover.prevent
        @drop="rootDrop"
        @dragend="clearDrag"
        @contextmenu.prevent="rootContextMenu"
    >
        <div v-if="visibleNodes.length === 0" class="px-3 py-5 text-center text-xs text-[var(--text-muted)]">
            <slot name="empty">暂无文件</slot>
        </div>
        <button
            v-for="entry in visibleNodes"
            :key="entry.node.id"
            type="button"
            role="treeitem"
            :data-tree-id="entry.node.id"
            :aria-level="entry.depth + 1"
            :aria-expanded="isBranch(entry.node) ? isExpanded(entry.node) : undefined"
            :aria-selected="props.selectedId === entry.node.id"
            :tabindex="focusedId === entry.node.id ? 0 : -1"
            :disabled="entry.node.disabled"
            :draggable="props.draggable && !entry.node.disabled"
            class="nb-ui-focus-ring relative flex h-8 w-full min-w-0 items-center gap-1.5 rounded-[var(--radius-control)] border-y border-transparent pr-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            :class="props.selectedId === entry.node.id ? 'bg-[var(--accent-bg)] text-[var(--accent-text)]' : 'hover:bg-[var(--bg-hover)]'"
            :style="{paddingLeft: `${8 + entry.depth * props.indent}px`}"
            @focus="focusedId = entry.node.id"
            @click="select(entry.node)"
            @dblclick="emit('activate', entry.node)"
            @keydown="handleKeydown($event, entry)"
            @dragstart="startDrag(entry.node, $event)"
            @dragover="updateDrop(entry.node, $event)"
            @drop.stop="commitDrop"
            @contextmenu.prevent.stop="emit('contextmenu', entry.node, $event)"
        >
            <span v-if="dropTargetId === entry.node.id && dropPosition === 'before'" class="absolute inset-x-1 top-0 h-0.5 bg-[var(--accent-main)]"></span>
            <span v-if="dropTargetId === entry.node.id && dropPosition === 'after'" class="absolute inset-x-1 bottom-0 h-0.5 bg-[var(--accent-main)]"></span>
            <span v-if="isBranch(entry.node)" class="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-[var(--bg-subtle)]" @click.stop="toggle(entry.node)">
                <span class="i-lucide-chevron-right h-3.5 w-3.5 transition-transform" :class="isExpanded(entry.node) ? 'rotate-90' : ''"></span>
            </span>
            <span v-else class="h-5 w-5 shrink-0"></span>
            <span
                :class="entry.node.iconClass || (entry.node.kind === 'directory' ? (isExpanded(entry.node) ? 'i-lucide-folder-open' : 'i-lucide-folder') : 'i-lucide-file')"
                class="h-4 w-4 shrink-0 text-[var(--text-muted)]"
            ></span>
            <span class="min-w-0 flex-1 truncate">
                <slot name="node" :node="entry.node" :depth="entry.depth" :expanded="isExpanded(entry.node)" :selected="props.selectedId === entry.node.id">
                    {{ entry.node.label }}
                </slot>
            </span>
            <slot name="trailing" :node="entry.node" :selected="props.selectedId === entry.node.id"></slot>
            <span v-if="dropTargetId === entry.node.id && dropPosition === 'inside'" class="pointer-events-none absolute inset-0 rounded-[var(--radius-control)] ring-1 ring-inset ring-[var(--accent-main)]"></span>
        </button>
    </div>
</template>
