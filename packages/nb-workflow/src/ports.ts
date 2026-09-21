import type {
    ActivityCallOptions,
    ActivityIdentity,
    AnyWorkflowDefinition,
    ChildWorkflowOptions,
    EntryId,
    InvokeOptions,
    JsonValue,
    SessionEntry,
    SessionId,
    SessionMeta,
    ValueRef,
    WorkflowDefinitionReference,
    WorkflowEventEnvelope,
} from "./types";

/** session 被其他持有者占用（workflow run 或用户直接对话） */
export class SessionBusyError extends Error {
    constructor(sessionId: SessionId, holder: string) {
        super(`session ${sessionId} 正被 ${holder} 占用`);
        this.name = "SessionBusyError";
    }
}

/**
 * Session 存储端口：内核对 session 树的全部依赖面。
 *
 * 语义合同（内存实现与 NeuroBook JsonlSessionRepository 适配器都必须遵守）：
 * - append 落在显式 parentId 上（F2 游标锚定），并把 active leaf 自动移到新 entry；
 * - setActiveLeaf 只移游标不写内容（= NeuroBook moveLeaf）；
 * - transcript 从 fromLeaf 沿 parentId 回溯到根，时间正序，只含消息类 entry（内核视图）；
 * - lock 抛 SessionBusyError 表示被占用；同持有者重入幂等；锁是运行时态，不持久化。
 */
export interface SessionPort {
    createSession(init: {
        profileKey: string;
        kind: SessionMeta["kind"];
        tags: string[];
        /** profile 初始输入（真实 profile 需要；内存实现忽略） */
        initial?: JsonValue;
        parentSessionId?: SessionId;
        title?: string;
        /** 指定该 session 的模型（"provider/model" key）；为空用 profile 默认。宿主实现负责校验与落位 */
        model?: string;
    }): Promise<SessionMeta>;
    meta(sessionId: SessionId): Promise<SessionMeta>;
    /** 持久参与者寻址：按 (profileKey, tag) 找未归档 session；没有返回 null */
    findByTag(profileKey: string, tag: string): Promise<SessionMeta | null>;
    /**
     * 原子 find-or-create：并发调用同一 (profileKey, tag) 必须恰好创建一个
     * session。宿主 adapter 必须保证该组合的原子性，不能先 find 再 create。
     */
    acquireByTag(init: {
        profileKey: string;
        tag: string;
        parentSessionId?: SessionId;
    }): Promise<{
        sessionId: SessionId;
        leafId: EntryId | null;
        created: boolean;
    }>;
    activeLeaf(sessionId: SessionId): Promise<EntryId | null>;
    setActiveLeaf(sessionId: SessionId, entryId: EntryId): Promise<void>;
    append(sessionId: SessionId, parentId: EntryId | null, entry: {
        role: "user" | "assistant";
        message?: string;
        input?: JsonValue;
        data?: JsonValue;
        origin: "workflow" | "direct";
    }): Promise<EntryId>;
    transcript(sessionId: SessionId, fromLeaf: EntryId | null): Promise<SessionEntry[]>;
    archive(sessionId: SessionId): Promise<void>;
    lock(sessionId: SessionId, holder: string): Promise<void>;
    releaseAll(holder: string): Promise<void>;
}

/** 一次真实模型调用的完整 token/cost 用量；随 journal 持久供宿主汇总。 */
export type AgentInvokeUsage = {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    cacheWrite1hTokens?: number;
    reasoningTokens?: number;
    totalTokens: number;
    cost: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
    };
};

/** 一次 agent invoke 的结果（journal 落这个形状） */
export type AgentInvokeOutcome = {
    status: "completed" | "waiting";
    message: string;
    /** completed 且有结构化输出时非空 */
    data: JsonValue | null;
    /** invoke 后 session 的新游标：completed = assistant entry；waiting = user entry（等待补充输入） */
    newLeaf: EntryId | null;
    /** 本轮 token 用量（真实模型才有；mock/未知为空）。随 journal 持久，宿主据此汇总 run 级用量 */
    usage?: AgentInvokeUsage | null;
};

/**
 * Agent 执行端口：在 session 的 fromLeaf 处发起一轮 agent。
 *
 * 实现负责写入本轮产生的全部 entry（用户输入 + 助手回复），并返回新游标。
 * 内核把整次 invoke 包成一个 Activity：journal 命中时实现完全不被调用。
 */
export interface AgentPort {
    profileInfo(profileKey: string): Promise<JsonValue>;
    invoke(sessionId: SessionId, fromLeaf: EntryId | null, opts: InvokeOptions): Promise<AgentInvokeOutcome>;
}

/** workspace 只读端口（wf.workspace.read 数据源） */
export interface WorkspacePort {
    read(path: string): Promise<string>;
}

export interface Clock {
    now(): Date;
}

export interface IdGenerator {
    nextId(scope: "run" | "event" | "value"): string;
}

export interface RandomSource {
    /** 返回 [0, 1)；Kernel 会在写 journal 前校验。 */
    next(): number;
}

export interface ValueStore {
    put(value: JsonValue): Promise<ValueRef>;
    get(reference: ValueRef): Promise<JsonValue>;
}

export type EventSinkRequest = {
    event: WorkflowEventEnvelope;
    context: ActivityExecutionContext;
};

export interface EventSink {
    emit(request: EventSinkRequest): Promise<void>;
}

export type SignalPublishInput = {
    runId: string;
    reference: string;
    value: JsonValue;
    idempotencyKey: string;
};

export type SignalConsumeInput = {
    runId: string;
    reference: string;
    context: ActivityExecutionContext;
};

export type SignalConsumeResult =
    | { status: "waiting" }
    | { status: "available"; value: JsonValue };

export interface SignalStore {
    publish(input: SignalPublishInput): Promise<void>;
    consume(input: SignalConsumeInput): Promise<SignalConsumeResult>;
}

export type TimerWaitInput = {
    runId: string;
    durationMs: number;
    now: string;
    context: ActivityExecutionContext;
};

export type TimerWaitResult =
    | { status: "waiting"; dueAt: string }
    | { status: "ready"; dueAt: string };

export interface TimerStore {
    wait(input: TimerWaitInput): Promise<TimerWaitResult>;
}

export type ChildWorkflowStartInput = {
    parentRunId: string;
    workflowReference: string;
    input: JsonValue;
    options: Required<Pick<ChildWorkflowOptions, "wait" | "cancelPolicy">>
        & Pick<ChildWorkflowOptions, "key">;
    context: ActivityExecutionContext;
};

export type ChildWorkflowStartResult =
    | { status: "running"; runId: string }
    | { status: "completed"; runId: string; result: JsonValue }
    | {
        status: "failed" | "cancelled";
        runId: string;
        error: string;
    };

export interface ChildWorkflowStore {
    start(
        input: ChildWorkflowStartInput,
    ): Promise<ChildWorkflowStartResult>;
    cancelForParent(parentRunId: string): Promise<void>;
}

export type ActivityExecutionContext = {
    runId: string;
    activity: ActivityIdentity;
    idempotencyKey: string;
    signal: AbortSignal;
};

export type ActivityExecutionRequest = {
    reference: string;
    input: JsonValue;
    options: ActivityCallOptions;
    context: ActivityExecutionContext;
};

/**
 * 外部读取/副作用执行边界。Durable Host 必须按 context.idempotencyKey 提供
 * 可重放执行；Kernel 只拥有脚本 identity 和 journal。
 */
export interface ActivityExecutor {
    callAction(request: ActivityExecutionRequest): Promise<JsonValue>;
    query(request: ActivityExecutionRequest): Promise<JsonValue>;
}

/** Workflow 函数由宿主加载；Backend 只保存 Definition reference。 */
export interface DefinitionRegistry {
    register(definition: AnyWorkflowDefinition): void;
    resolve(reference: WorkflowDefinitionReference): AnyWorkflowDefinition;
}

/** 内核依赖的完整端口束 */
export type WorkflowPorts = {
    /** Agent/Session 是可选 Extension；普通 Workflow 不需要提供。 */
    sessions?: SessionPort;
    agents?: AgentPort;
};
