import type { MarkdownStudioEditorHandle } from "nbook/app/composables/useMarkdownStudioController";

type MarkdownStudioSyncController = {
    markdown: Ref<string>;
    activeEditor: Ref<"source" | "preview" | null>;
    editorsLocked: ComputedRef<boolean>;
    isPreviewVisible: ComputedRef<boolean>;
    isSourceVisible: ComputedRef<boolean>;
    commitPreviewChange: (markdown: string) => void;
    commitSourceChange: (markdown: string) => void;
    registerSourceHandle: (handle: MarkdownStudioEditorHandle | null) => void;
    registerPreviewHandle: (handle: MarkdownStudioEditorHandle | null) => void;
    setStatusText?: (text: string) => void;
};

type UseMarkdownStudioSyncOptions = {
    controller: MarkdownStudioSyncController;
    sourceEditorRef: Ref<MarkdownStudioEditorHandle | null>;
    previewEditorRef: Ref<MarkdownStudioEditorHandle | null>;
};

/**
 * 协调源码编辑器与预览编辑器之间的显式同步。
 *
 * 隐藏编辑器采用惰性同步：富文本/源码两个视图互斥（v-show 切换），
 * 给不可见编辑器实时推送全文（Monaco 全文替换重新着色、TipTap 全文重新 parse）
 * 是输入卡顿的主因之一。这里只给可见编辑器推送；不可见的记 stale 标记，
 * 切换到可见时再一次性同步最新 Markdown。
 */
export const useMarkdownStudioSync = (options: UseMarkdownStudioSyncOptions) => {
    const {t} = useI18n();
    let pendingEditorSync: "source" | "preview" | null = null;
    let pendingMarkdown = "";
    const staleEditors = new Set<"source" | "preview">();

    /**
     * 把一份 Markdown 显式推送到两个编辑器。
     */
    const syncEditors = (markdown: string, skip?: "source" | "preview" | null): void => {
        if (skip !== "preview") {
            updateEditor("preview", markdown);
        }
        if (skip !== "source") {
            updateEditor("source", markdown);
        }
    };

    /**
     * 外部同步不能把输入事件链打断；源码模式下用户可能输入临时不完整的 Markdown。
     * 目标编辑器不可见时只标记 stale，等它重新可见时补一次同步。
     */
    const updateEditor = (target: "source" | "preview", markdown: string): void => {
        const handle = target === "source" ? options.sourceEditorRef.value : options.previewEditorRef.value;
        if (!handle) {
            return;
        }

        const visible = target === "source"
            ? options.controller.isSourceVisible.value
            : options.controller.isPreviewVisible.value;
        if (!visible) {
            staleEditors.add(target);
            return;
        }
        staleEditors.delete(target);

        try {
            handle.update(markdown);
        } catch (error) {
            console.warn(`[MarkdownStudio] ${target} editor sync failed`, error);
            options.controller.setStatusText?.(target === "preview"
                ? t("markdownStudio.workbench.previewSyncFailed")
                : t("markdownStudio.workbench.sourceSyncFailed"));
        }
    };

    /**
     * 处理预览区用户输入。
     */
    const onPreviewChange = (markdown: string): void => {
        if (options.controller.activeEditor.value === "source") {
            return;
        }

        pendingEditorSync = "preview";
        pendingMarkdown = markdown;
        options.controller.commitPreviewChange(markdown);
        updateEditor("source", markdown);
    };

    /**
     * 处理源码区用户输入。
     */
    const onSourceChange = (markdown: string): void => {
        if (options.controller.activeEditor.value === "preview") {
            return;
        }

        pendingEditorSync = "source";
        pendingMarkdown = markdown;
        options.controller.commitSourceChange(markdown);
        updateEditor("preview", markdown);
    };

    watchEffect(() => {
        options.controller.registerSourceHandle(options.sourceEditorRef.value);
    });

    watchEffect(() => {
        options.controller.registerPreviewHandle(options.previewEditorRef.value);
    });

    watch([() => options.previewEditorRef.value, () => options.sourceEditorRef.value], () => {
        syncEditors(options.controller.markdown.value);
    }, { immediate: true });

    watch(() => options.controller.markdown.value, (markdown) => {
        if (pendingEditorSync && pendingMarkdown === markdown) {
            syncEditors(markdown, pendingEditorSync);
            pendingEditorSync = null;
            pendingMarkdown = "";
            return;
        }

        syncEditors(markdown);
        pendingEditorSync = null;
        pendingMarkdown = "";
    });

    // 视图切换后补同步 stale 编辑器（切换按钮点击会先触发编辑器 blur，
    // 防抖中的输入已在 blur 时结算进 controller.markdown，这里拿到的一定是最新值）
    watch(() => options.controller.isPreviewVisible.value, (visible) => {
        if (visible && staleEditors.has("preview")) {
            updateEditor("preview", options.controller.markdown.value);
        }
    });

    watch(() => options.controller.isSourceVisible.value, (visible) => {
        if (visible && staleEditors.has("source")) {
            updateEditor("source", options.controller.markdown.value);
        }
    });

    return {
        onPreviewChange,
        onSourceChange,
    };
};
