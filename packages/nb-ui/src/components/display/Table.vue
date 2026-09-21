<script setup lang="ts" generic="Row extends object">
import Spinner from "../display/Spinner.vue";
import EmptyState from "../display/EmptyState.vue";

// 轻量数据表：列配置 + 行数据的展示型表格（排序、选择、分页交给消费方组合）。
// 单元格默认直接插值 row[column.key]，自定义渲染用具名插槽 `cell-<columnKey>`。
export type TableColumn<R> = {
    key: keyof R & string;
    label: string;
    /** CSS 宽度，如 "120px" / "20%"；缺省自动分配 */
    width?: string;
    align?: "left" | "center" | "right";
};
export type TableDensity = "default" | "compact";

const props = withDefaults(defineProps<{
    columns: TableColumn<Row>[];
    rows: Row[];
    /** 行 key 字段；缺省退化为行下标（行会增删时建议提供） */
    rowKey?: keyof Row & string;
    loading?: boolean;
    emptyText?: string;
    /** 行悬停高亮 */
    hoverable?: boolean;
    density?: TableDensity;
}>(), {
    loading: false,
    emptyText: "暂无数据",
    hoverable: true,
    density: "default",
});

const emit = defineEmits<{
    (e: "row-click", row: Row, index: number): void;
}>();

// 插槽返回类型按 Vue 约定用 any；value 因列名是运行时字符串无法静态求值，用 unknown
defineSlots<{
    empty?: () => any;
} & {
    [name: `cell-${string}`]: (props: {row: Row; value: unknown; index: number}) => any;
}>();

function rowKeyOf(row: Row, index: number): string {
    if (props.rowKey) {
        return String(row[props.rowKey]);
    }
    return String(index);
}

function alignClass(column: TableColumn<Row>): string {
    if (column.align === "right") {
        return "text-right";
    }
    if (column.align === "center") {
        return "text-center";
    }
    return "text-left";
}

function cellPaddingClass(): string {
    return props.density === "compact" ? "px-3 py-1.5" : "px-3 py-2.5";
}
</script>

<template>
    <!-- 表格容器：窄屏横向滚动 -->
    <div class="w-full overflow-x-auto">
        <table class="w-full border-collapse text-sm">
            <thead>
                <tr class="border-b border-[var(--border-color)]">
                    <th
                        v-for="column in props.columns"
                        :key="column.key"
                        scope="col"
                        class="whitespace-nowrap px-3 py-2 text-xs font-medium text-[var(--text-muted)]"
                        :class="alignClass(column)"
                        :style="{width: column.width}"
                    >{{ column.label }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-if="props.loading">
                    <td :colspan="props.columns.length" class="px-3 py-10 text-center">
                        <Spinner show-label />
                    </td>
                </tr>
                <tr v-else-if="props.rows.length === 0">
                    <td :colspan="props.columns.length">
                        <slot name="empty">
                            <EmptyState :title="props.emptyText" />
                        </slot>
                    </td>
                </tr>
                <tr
                    v-else
                    v-for="(row, rowIndex) in props.rows"
                    :key="rowKeyOf(row, rowIndex)"
                    class="border-b border-[var(--border-color)] transition-colors last:border-b-0"
                    :class="props.hoverable ? 'hover:bg-[var(--bg-hover)]' : ''"
                    @click="emit('row-click', row, rowIndex)"
                >
                    <td v-for="column in props.columns" :key="column.key" class="text-[var(--text-secondary)]" :class="[alignClass(column), cellPaddingClass()]">
                        <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]" :index="rowIndex">{{ row[column.key] }}</slot>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
