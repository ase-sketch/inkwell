import { defineAsyncComponent, markRaw, type Component } from "vue";
import type {AgentToolCall} from "nbook/app/components/novel-ide/agent/agent-message";
import AgentEditFileBubble from "nbook/app/components/novel-ide/agent/AgentEditFileBubble.vue";
import AgentRequestUserInputBubble from "nbook/app/components/novel-ide/agent/AgentRequestUserInputBubble.vue";
import AgentSwitchModeBubble from "nbook/app/components/novel-ide/agent/AgentSwitchModeBubble.vue";
import AgentWriteFileBubble from "nbook/app/components/novel-ide/agent/AgentWriteFileBubble.vue";
import AgentApplyPatchBubble from "nbook/app/components/novel-ide/agent/AgentApplyPatchBubble.vue";
import AgentTaskBubble from "nbook/app/components/novel-ide/agent/AgentTaskBubble.vue";
import AgentWorkflowBubble from "nbook/app/components/novel-ide/agent/AgentWorkflowBubble.vue";
import CritiqueCard from "nbook/app/components/novel-ide/agent/CritiqueCard.vue";
import { SUBMIT_CRITIQUES_TOOL } from "nbook/shared/chapter-critique";

/** Tool 节点渲染模式。 */
export type AgentToolRenderMode = "inline" | "block" | "message" | "hidden";

/** 单个 tool 的渲染配置。 */
export type AgentToolRenderConfig = {
    mode: AgentToolRenderMode;
    typeLabel: string;
    collapsedPreview?: string;
    collapsedPreviewKey?: string;
    component?: Component;
};

const DEFAULT_TOOL_RENDER_CONFIG: AgentToolRenderConfig = {
    mode: "inline",
    typeLabel: "Tool Call",
};

const TOOL_RENDER_REGISTRY: Record<string, AgentToolRenderConfig> = {
    request_user_input: {
        mode: "block",
        typeLabel: "Question",
        collapsedPreviewKey: "agent.tool.waitingUserAnswer",
        component: markRaw(AgentRequestUserInputBubble),
    },
    switch_mode: {
        mode: "message",
        typeLabel: "Mode",
        collapsedPreviewKey: "agent.tool.modeSwitchApproval",
        component: markRaw(AgentSwitchModeBubble),
    },
    write: {
        mode: "block",
        typeLabel: "Write",
        collapsedPreviewKey: "agent.tool.writeFile",
        component: markRaw(AgentWriteFileBubble),
    },
    edit: {
        mode: "block",
        typeLabel: "Edit",
        collapsedPreviewKey: "agent.tool.editFile",
        component: markRaw(AgentEditFileBubble),
    },
    apply_patch: {
        mode: "block",
        typeLabel: "Patch",
        collapsedPreviewKey: "agent.tool.applyPatch",
        component: markRaw(AgentApplyPatchBubble),
    },
    run_workflow: {
        mode: "block",
        typeLabel: "Workflow",
        collapsedPreview: "多 Agent workflow 运行详情",
        component: markRaw(AgentWorkflowBubble),
    },
    task_create: {
        mode: "message",
        typeLabel: "Checklist",
        collapsedPreviewKey: "agent.tool.taskList",
        component: markRaw(AgentTaskBubble),
    },
    task_set_status: {
        mode: "message",
        typeLabel: "Checklist",
        collapsedPreviewKey: "agent.tool.taskStatusUpdate",
        component: markRaw(AgentTaskBubble),
    },
    // 审稿质疑卡：常驻可见、卡片自带折叠，逐条处置不该藏在折叠头后面（同 Checklist 先例）。
    [SUBMIT_CRITIQUES_TOOL]: {
        mode: "message",
        typeLabel: "Critique",
        collapsedPreviewKey: "ide.critique.card.title",
        component: markRaw(CritiqueCard),
    },
};

/**
 * 根据 tool 名字返回前端渲染配置。
 */
export const resolveToolRenderConfig = (toolCall: AgentToolCall): AgentToolRenderConfig => {
    return TOOL_RENDER_REGISTRY[toolCall.name] ?? DEFAULT_TOOL_RENDER_CONFIG;
};
