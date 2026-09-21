/**
 * nb-workflow 公共合同。
 *
 * Core 只拥有 Workflow Run、Activity identity 和 replay 语义；Session/Agent
 * 类型属于兼容 Extension，不是所有 Workflow 的必需状态。
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type BackendDurability = "memory" | "durable" | "distributed";

/** Backend 能力必须显式声明；Memory Backend 不能冒充可跨进程恢复。 */
export type BackendCapabilities = {
    durability: BackendDurability;
    processRestart: boolean;
    concurrentExecution: boolean;
    multiWorker: boolean;
    leases: boolean;
    durableSignals: boolean;
    durableTimers: boolean;
    childWorkflows: boolean;
    externalReceipts: boolean;
    outbox: boolean;
    valueReferences: boolean;
};

export type BackendRequirements = Partial<
    Omit<BackendCapabilities, "durability">
> & {
    durability?: BackendDurability;
};

export type WorkflowDefinitionReference = {
    key: string;
    version: string;
    manifestHash: string;
};

/** 对齐 NeuroBook：SessionEntryId 是字符串，SessionId 是数字 */
export type EntryId = string;
export type SessionId = number;

/** Agent Extension 使用的 Session 元数据。 */
export type SessionMeta = {
    sessionId: SessionId;
    profileKey: string;
    kind: "chat" | "workflow" | "system";
    tags: string[];
    /** 为空表示顶层 session；否则挂在父 session 子树下（UI 聚合用） */
    parentSessionId?: SessionId;
    title?: string;
    archived: boolean;
};

/** Agent Extension 当前支持的 append-only message entry。 */
export type SessionEntry = {
    id: EntryId;
    parentId: EntryId | null;
    type: "message";
    role: "user" | "assistant";
    /** 自然语言正文；结构化输入走 input */
    message?: string;
    /** 本轮 payload（对齐 invoke_agent 的 input） */
    input?: JsonValue;
    /** assistant 结构化输出（对齐 report_result.data） */
    data?: JsonValue;
    /** workflow 表示由 workflow append/invoke 写入；direct 表示用户直接对话 */
    origin: "workflow" | "direct";
};

/** invoke 返回，对齐现有 invoke_agent 工具合同（waiting 是普通返回值，不是失败） */
export type InvokeResult = {
    status: "completed" | "waiting";
    result: {
        message: string;
        /** 结构化输出；completed 且 responder 返回 data 时非空 */
        data: JsonValue | null;
    };
};

export type InvokeOptions = {
    mode?: "prompt" | "continue" | "steer" | "followup";
    message?: string | null;
    input?: JsonValue;
    /** Run 取消信号；AgentPort 应将它绑定到本次精确 invocation。 */
    signal?: AbortSignal;
};

export type ValueRef = {
    key: string;
    hash: string;
    byteSize: number;
    mediaType: "application/json";
};

export type WorkflowValue =
    | {
        kind: "inline";
        value: JsonValue;
    }
    | {
        kind: "ref";
        ref: ValueRef;
    };

/** journal 中一条成功的 Activity；失败不会进入 journal，恢复时会重试。 */
export type ActivityRecord = {
    /** `${path}#${seq}` */
    key: string;
    /** 分支路径：root 或 root/<mapSeq>:<index> 递归 */
    path: string;
    /** 路径内序号（每条路径独立计数，并发完成序不影响身份） */
    seq: number;
    kind: string;
    /** 规范化参数的 SHA-256；不把参数正文放进 fingerprint。 */
    fingerprint: string;
    /** canonical JSON 观测参数；不参与 Activity identity，应用公共投影可移除。 */
    params?: string;
    /** 小值 inline；大值只保存内容寻址引用。 */
    result: WorkflowValue;
};

export type ActivityIdentity = Omit<ActivityRecord, "result" | "params">;

export type ActivityCallOptions = {
    /** 宿主可用的稳定业务键；不替代 Kernel 的 path/sequence identity。 */
    key?: string;
    timeoutMs?: number;
    metadata?: JsonValue;
};

export type CheckpointOptions = {
    key?: string;
};

export type ChildWorkflowOptions = {
    key?: string;
    wait?: boolean;
    cancelPolicy?: "propagate" | "abandon";
};

export type ChildWorkflowCallResult<TOutput extends JsonValue = JsonValue> =
    | {
        runId: string;
        status: "started";
    }
    | {
        runId: string;
        status: "completed";
        result: TOutput;
    };

export type ParallelOptions = {
    concurrency?: number;
};

export type WorkflowEventEnvelope = {
    type: string;
    version: string;
    payload: JsonValue;
};

/** 挂起中的 ask，等用户应答后经 resume 写回 journal */
export type PendingAsk = {
    key: string;
    path: string;
    seq: number;
    fingerprint: string;
    spec: AskSpec;
};

export type PendingWait = {
    kind: "signal" | "timer" | "child";
    key: string;
    path: string;
    seq: number;
    fingerprint: string;
    reference: string;
};

export type AskSpec = {
    kind: "select" | "text" | "approve";
    title: string;
    /** 可选 Markdown 说明；为空表示仅展示标题。 */
    description?: string;
    options?: { id: string; label: string }[];
    multi?: boolean;
};

export type RunStatus = "running" | "waiting" | "completed" | "failed" | "cancelled";

/** Workflow 定义；脚本沙箱由宿主负责，phases 仅用于可选骨架投影。 */
export type WorkflowDefinition<
    TArgs = JsonValue,
    TResult = JsonValue,
    TContext extends WorkflowContext = WorkflowContext,
> = {
    key: string;
    /** 未指定时按 "1" 处理；持久 Run 永远保存解析后的显式版本。 */
    version?: string;
    /**
     * 构建/注册表提供的内容身份。未指定时 Kernel 对定义元数据和函数源码计算
     * SHA-256；跨构建部署应显式提供发布 manifest hash。
     */
    manifestHash?: string;
    /** Run 创建前检查，不满足时不得执行 Workflow 代码。 */
    requires?: BackendRequirements;
    /** 声明骨架（投影一），可选 */
    phases?: { key: string; title: string }[];
    run: (workflow: TContext, args: TArgs) => Promise<TResult>;
};

export type AgentWorkflowDefinition<
    TArgs = JsonValue,
    TResult = JsonValue,
> = WorkflowDefinition<TArgs, TResult, AgentWorkflowContext>;

export type AnyWorkflowDefinition =
    | WorkflowDefinition
    | AgentWorkflowDefinition;

export type ProgressState = { phase?: string; done?: number; total?: number };

/**
 * 状态图操作（`wf.chart` 发出的观测事件载荷，非 journaled）。
 * 设计要点：
 * - node/edge 是**增量声明**：可以运行前由宿主预置（声明骨架），也可以代码运行中随时补（动态分支/每项子状态），同一套 API。
 * - enter/leave/move 以 **token** 表达并发：一个 token = 一条并行执行线（默认 "main"；map 分支用 item id 当 token），
 *   多个 token 同时停在不同/相同节点 = 并发在图上可见。
 * - token 可附 sessionId：展示「哪个 agent session 正在这个状态上干活」。
 */
export type ChartOp =
    | { op: "node"; key: string; title?: string }
    | { op: "edge"; from: string; to: string; label?: string }
    | { op: "enter"; key: string; token: string; sessionId?: SessionId }
    | { op: "leave"; key: string; token: string }
    /** leave(from)+enter(to)，并确保 from→to 边存在 */
    | { op: "move"; from: string; to: string; token: string; sessionId?: SessionId; label?: string };

/** 宿主注入的 wf 根对象（V1 收敛面） */
export type AgentWorkflowContext = {
    args: JsonValue;
    /** 版本化外部能力；执行、重试和副作用边界由宿主 ActivityExecutor 提供。 */
    callAction<
        TOutput extends JsonValue = JsonValue,
        TInput extends JsonValue = JsonValue,
    >(
        actionReference: string,
        input: TInput,
        options?: ActivityCallOptions,
    ): Promise<TOutput>;
    /** 查询也进入 journal；replay 不重新读取变化中的外部状态。 */
    query<
        TOutput extends JsonValue = JsonValue,
        TInput extends JsonValue = JsonValue,
    >(
        queryReference: string,
        input: TInput,
        options?: ActivityCallOptions,
    ): Promise<TOutput>;
    /** journaled wall-clock value；Workflow 代码不应直接读取 Date.now。 */
    now(): Promise<string>;
    /** journaled [0, 1) value；Workflow 代码不应直接读取 Math.random。 */
    random(): Promise<number>;
    isCancelled(): boolean;
    getBudget(): JsonValue | null;
    checkpoint(
        value: JsonValue,
        options?: CheckpointOptions,
    ): Promise<void>;
    emit(
        event: WorkflowEventEnvelope,
        options?: ActivityCallOptions,
    ): Promise<void>;
    waitForSignal<TOutput extends JsonValue = JsonValue>(
        reference: string,
    ): Promise<TOutput>;
    sleep(durationMs: number): Promise<void>;
    startChildWorkflow<TOutput extends JsonValue = JsonValue>(
        workflowReference: string,
        input: JsonValue,
        options?: ChildWorkflowOptions,
    ): Promise<ChildWorkflowCallResult<TOutput>>;
    agents: {
        /** 查 profile 信息（journaled） */
        profile(profileKey: string): Promise<JsonValue>;
        /** 新建 session；ephemeral 的在 run 成功后归档；model 指定该 session 用的模型（缺省用 run 级默认，再缺省用 profile 默认） */
        create(profileKey: string, opts?: { initial?: JsonValue; tags?: string[]; parent?: SessionHandle; ephemeral?: boolean; model?: string }): Promise<SessionHandle>;
        /** 持久参与者：按 (profileKey, tag) 查未归档 session，找到复用，没有才建 */
        acquire(opts: { profileKey: string; tag: string; parent?: SessionHandle }): Promise<SessionHandle>;
        /** wf.sessions.open(id).invoke(...) 的糖 */
        invoke(sessionId: SessionId, opts: InvokeOptions): Promise<InvokeResult>;
    };
    sessions: {
        open(sessionId: SessionId): Promise<SessionHandle>;
    };
    /** 并发：注意必须传 thunk（惰性函数），同一路径下裸并发会破坏 seq 确定性 */
    all<T>(
        thunks: (() => Promise<T>)[],
        options?: ParallelOptions,
    ): Promise<T[]>;
    map<TItem, TOut>(
        items: TItem[],
        fn: (item: TItem, index: number) => Promise<TOut>,
        options?: ParallelOptions,
    ): Promise<TOut[]>;
    /** 人类参与：挂起点。无应答时抛 SuspendSignal，run 转 waiting */
    ask(spec: AskSpec): Promise<JsonValue>;
    log(message: string): void;
    progress(state: ProgressState): void;
    /** 观测：状态图（声明与指针分离；见 ChartOp 注释）。纯观测不进 journal，replay 时随代码重跑自然重建 */
    chart: {
        node(key: string, title?: string): void;
        edge(from: string, to: string, label?: string): void;
        enter(key: string, opts?: { token?: string; sessionId?: SessionId }): void;
        leave(key: string, opts?: { token?: string }): void;
        move(from: string, to: string, opts?: { token?: string; sessionId?: SessionId; label?: string }): void;
    };
    workspace: {
        /** 通过宿主 WorkspacePort 执行的 journaled 只读操作。 */
        read(path: string): Promise<string>;
    };
    /** 面 B/C：发起方 session 句柄；面 A 下调用抛错 */
    caller(): Promise<SessionHandle>;
};

export type AgentWorkflowExtension = Pick<
    AgentWorkflowContext,
    "agents" | "sessions" | "workspace" | "caller"
>;

export type WorkflowContext = Omit<
    AgentWorkflowContext,
    keyof AgentWorkflowExtension
>;

/** @deprecated 使用 WorkflowContext；需要 Agent 时显式使用 AgentWorkflowContext。 */
export type Wf = AgentWorkflowContext;

/** session 句柄：持显式游标（append/invoke 锚定游标而非全局 active leaf——发现 F2） */
export type SessionHandle = {
    readonly id: SessionId;
    /** 当前游标（同步派生态，不是 activity） */
    leaf(): EntryId | null;
    transcript(opts?: { tail?: number }): Promise<SessionEntry[]>;
    /** 统一原语：rewind / 切分支 / 恢复现场都是它；同步 session active leaf */
    checkout(entryId: EntryId): Promise<void>;
    append(msg: { role: "user" | "assistant"; message?: string; input?: JsonValue }): Promise<EntryId>;
    invoke(opts: InvokeOptions): Promise<InvokeResult>;
    /** 作用域安全旁路：进入记住原游标，结束/异常自动 checkout 回原位，旁支留树上 */
    excursion<T>(at: EntryId | "leaf", fn: (branch: SessionHandle) => Promise<T>): Promise<T>;
};

export type RunView = {
    runId: string;
    workflowKey: string;
    workflowVersion: string;
    workflowManifestHash: string;
    status: RunStatus;
    cancelRequestedAt: string | null;
    budget: JsonValue | null;
    checkpoint: WorkflowValue | null;
    result?: JsonValue;
    error?: string;
    pendingAsks: PendingAsk[];
    pendingWaits: PendingWait[];
    logs: string[];
    progress: ProgressState | null;
    journal: ActivityRecord[];
    revision: number;
    createdAt: string;
    updatedAt: string;
};

/** Backend 中的可序列化 Run 真相；不保存 Workflow 函数或宿主对象。 */
export type WorkflowRunState = {
    runId: string;
    definition: WorkflowDefinitionReference;
    input: WorkflowValue;
    /** 版本化 Extension 的不可变 JSON 启动上下文。 */
    extensionContext: JsonValue;
    status: RunStatus;
    cancelRequestedAt: string | null;
    budget: JsonValue | null;
    checkpoint: WorkflowValue | null;
    result?: WorkflowValue;
    error?: string;
    pendingAsks: PendingAsk[];
    pendingWaits: PendingWait[];
    logs: string[];
    progress: ProgressState | null;
    journal: ActivityRecord[];
    revision: number;
    createdAt: string;
    updatedAt: string;
};
