import { UnsupportedActivityExecutor } from "./activities";
import {
    MemoryWorkflowBackend,
    SystemClock,
    SystemRandomSource,
    UuidIdGenerator,
    assertBackendCapabilities,
    type WorkflowBackend,
} from "./backend";
import { UnsupportedChildWorkflowStore } from "./children";
import {
    MemoryDefinitionRegistry,
} from "./definitions";
import { UnsupportedEventSink } from "./events";
import { assertJsonValue } from "./fingerprint";
import type {
    ActivityExecutor,
    ChildWorkflowStore,
    Clock,
    DefinitionRegistry,
    EventSink,
    IdGenerator,
    RandomSource,
    SignalStore,
    TimerStore,
    WorkflowPorts,
} from "./ports";
import {
    runRecordToView,
    type RunRecord,
} from "./run-record";
import {
    RunnerRunStore,
} from "./runner-run-store";
import {
    archiveEphemeralSessions,
    bindExternalAbort,
    isTerminal,
    markCancelled,
    unbindExternalAbort,
    validateConcurrencyPolicy,
    type WorkflowRunnerOptions,
    type WorkflowSignalOptions,
    type WorkflowStartOptions,
} from "./runner-support";
import { WorkflowCancelledError } from "./runtime";
import { executeWorkflowRun } from "./runner-execution";
import type {
    RunEnv,
} from "./runtime-events";
import { emitWorkflowEvent } from "./runtime-events";
import {
    UnsupportedSignalStore,
    validateSignalReference,
} from "./signals";
import { UnsupportedTimerStore } from "./timers";
import type {
    AnyWorkflowDefinition,
    BackendCapabilities,
    JsonValue,
    RunView,
} from "./types";
import { WorkflowValueCodec } from "./values";

export class WorkflowRunner {
    private readonly inFlight = new Set<string>();
    private readonly controlInFlight = new Set<string>();
    private readonly backend: WorkflowBackend;
    private readonly definitions: DefinitionRegistry;
    private readonly activities: ActivityExecutor;
    private readonly children: ChildWorkflowStore;
    private readonly events: EventSink;
    private readonly signals: SignalStore;
    private readonly timers: TimerStore;
    private readonly values: WorkflowValueCodec;
    private readonly clock: Clock;
    private readonly ids: IdGenerator;
    private readonly random: RandomSource;
    private readonly defaultConcurrency: number;
    private readonly maxConcurrency: number;
    private readonly capabilities: BackendCapabilities;
    private readonly runStore: RunnerRunStore;

    constructor(
        private readonly ports: WorkflowPorts = {},
        private readonly env: RunEnv = {},
        options: WorkflowRunnerOptions = {},
    ) {
        this.clock = options.clock ?? new SystemClock();
        this.ids = options.ids ?? new UuidIdGenerator();
        this.random = options.random ?? new SystemRandomSource();
        this.maxConcurrency = options.maxConcurrency ?? 16;
        this.defaultConcurrency = options.defaultConcurrency ?? 4;
        validateConcurrencyPolicy(
            this.defaultConcurrency,
            this.maxConcurrency,
        );
        this.backend = options.backend ?? new MemoryWorkflowBackend();
        this.definitions = options.definitions
            ?? new MemoryDefinitionRegistry();
        this.activities = options.activities
            ?? new UnsupportedActivityExecutor();
        this.children = options.children
            ?? new UnsupportedChildWorkflowStore();
        this.events = options.events ?? new UnsupportedEventSink();
        this.signals = options.signals ?? new UnsupportedSignalStore();
        this.timers = options.timers ?? new UnsupportedTimerStore();
        this.values = new WorkflowValueCodec(
            options.values,
            options.inlineValueLimitBytes,
        );
        this.capabilities = {
            ...this.backend.capabilities,
            durableSignals:
                this.backend.capabilities.durableSignals
                && options.signals !== undefined,
            durableTimers:
                this.backend.capabilities.durableTimers
                && options.timers !== undefined,
            childWorkflows:
                this.backend.capabilities.childWorkflows
                && options.children !== undefined,
            externalReceipts:
                this.backend.capabilities.externalReceipts
                && options.activities !== undefined,
            outbox:
                this.backend.capabilities.outbox
                && options.events !== undefined,
            valueReferences:
                this.backend.capabilities.valueReferences
                && this.values.supportsReferences,
        };
        this.runStore = new RunnerRunStore(
            this.backend,
            this.definitions,
            this.values,
            this.clock,
            this.capabilities,
        );
    }

    begin(
        definition: AnyWorkflowDefinition,
        args: JsonValue,
        options: WorkflowStartOptions = {},
    ): { runId: string; done: Promise<RunView> } {
        assertJsonValue(args);
        if (options.budget !== undefined) {
            assertJsonValue(options.budget);
        }
        if (
            options.callerSessionId !== undefined
            && options.callerSessionId !== null
            && !Number.isSafeInteger(options.callerSessionId)
        ) {
            throw new Error(
                "Workflow callerSessionId must be a safe integer "
                + "or null.",
            );
        }
        if (
            options.defaultModel !== undefined
            && options.defaultModel !== null
            && typeof options.defaultModel !== "string"
        ) {
            throw new Error(
                "Workflow defaultModel must be a string or null.",
            );
        }
        assertBackendCapabilities(
            this.capabilities,
            definition.requires,
        );
        this.definitions.register(definition);
        const abortController = new AbortController();
        const now = this.clock.now().toISOString();
        const run: RunRecord = {
            runId: this.ids.nextId("run"),
            def: definition,
            args: structuredClone(args),
            callerSessionId: options.callerSessionId ?? null,
            abortController,
            defaultModel: options.defaultModel ?? null,
            workspace: options.workspace ?? null,
            ephemeralSessions: new Set(),
            status: "running",
            cancelRequestedAt: null,
            budget: options.budget === undefined
                ? null
                : structuredClone(options.budget),
            checkpoint: null,
            journal: new Map(),
            pendingAsks: [],
            pendingWaits: [],
            logs: [],
            progress: null,
            revision: 0,
            createdAt: now,
            updatedAt: now,
            initialization: Promise.resolve(),
            persistence: Promise.resolve(),
        };
        this.runStore.add(run);
        bindExternalAbort(
            run,
            options.signal,
            this.clock,
            () => this.cancel(run.runId),
            (error) => emitWorkflowEvent(this.env, {
                type: "control_error",
                runId: run.runId,
                operation: "external_cancel",
                error: error instanceof Error
                    ? error.message
                    : String(error),
            }),
        );
        run.initialization = this.runStore.initialize(run);
        return {
            runId: run.runId,
            done: this.initializeAndExecute(run),
        };
    }

    async start(
        definition: AnyWorkflowDefinition,
        args: JsonValue,
        options: WorkflowStartOptions = {},
    ): Promise<RunView> {
        return await this.begin(definition, args, options).done;
    }

    async resume(
        runId: string,
        answers: Record<string, JsonValue>,
    ): Promise<RunView> {
        return await this.withControl(runId, async () => {
            const run = await this.runStore.loadRecord(runId);
            if (this.inFlight.has(runId)) {
                throw new Error(`run ${runId} 正在执行中`);
            }
            if (run.status !== "waiting") {
                throw new Error(
                    `run ${runId} 非 waiting 状态，当前为 ${run.status}`,
                );
            }
            if (run.pendingAsks.length === 0) {
                throw new Error(
                    `run ${runId} 没有可应答的 pending ask`,
                );
            }
            const answered = run.pendingAsks.map((ask) => {
                const answer = answers[ask.key];
                if (answer === undefined) {
                    throw new Error(
                        `缺少 ask 应答: ${ask.key}`
                        + `（${ask.spec.title}）`,
                    );
                }
                return { ask, answer };
            });
            const encoded = await Promise.all(answered.map(
                async ({ ask, answer }) => ({
                    ask,
                    result: await this.values.encode(answer),
                }),
            ));
            for (const { ask, result } of encoded) {
                run.journal.set(ask.key, {
                    key: ask.key,
                    path: ask.path,
                    seq: ask.seq,
                    kind: "ask",
                    fingerprint: ask.fingerprint,
                    result,
                });
            }
            run.status = "running";
            run.pendingAsks = [];
            await this.persist(run);
            return await this.execute(run);
        });
    }

    async rerun(runId: string): Promise<RunView> {
        return await this.withControl(runId, async () => {
            const run = await this.runStore.loadRecord(runId);
            if (run.status === "cancelled") {
                throw new Error(`run ${runId} 已取消，不能 rerun`);
            }
            if (
                run.status === "waiting"
                && run.pendingAsks.length > 0
            ) {
                throw new Error(
                    `run ${runId} 等待用户应答，不能 rerun`,
                );
            }
            if (
                run.status === "running"
                && !this.backend.capabilities.processRestart
            ) {
                throw new Error(`run ${runId} 正在执行，不能 rerun`);
            }
            return await this.execute(run);
        });
    }

    async signal(
        runId: string,
        reference: string,
        value: JsonValue,
        options: WorkflowSignalOptions = {},
    ): Promise<RunView> {
        return await this.withControl(runId, async () => {
            validateSignalReference(reference);
            assertJsonValue(value);
            const run = await this.runStore.loadRecord(runId);
            if (this.inFlight.has(runId)) {
                throw new Error(`run ${runId} 正在执行中`);
            }
            if (isTerminal(run)) {
                throw new Error(
                    `run ${runId} 已终止，不能接收 signal ${reference}`,
                );
            }
            await this.signals.publish({
                runId,
                reference,
                value,
                idempotencyKey: options.idempotencyKey
                    ?? this.ids.nextId("event"),
            });
            if (
                run.status === "waiting"
                && run.pendingWaits.some((wait) =>
                    wait.kind === "signal"
                    && wait.reference === reference
                )
            ) {
                return await this.execute(run);
            }
            return runRecordToView(run);
        });
    }

    async cancel(runId: string): Promise<RunView> {
        // 取消必须即时打断执行中的 Activity，因此不能放入 withControl
        // （执行中 rerun/signal 持有控制权时取消会永远等不到）；
        // 持久化走 run.persistence 链与执行尾部串行，事件在持久化后发出。
        const run = await this.runStore.loadRecord(runId);
        if (isTerminal(run)) {
            return runRecordToView(run);
        }
        run.abortRequested = true;
        run.cancelRequestedAt ??= this.clock.now().toISOString();
        run.abortController.abort(new WorkflowCancelledError());
        await this.children.cancelForParent(run.runId);
        if (run.status === "waiting") {
            await archiveEphemeralSessions(
                run,
                this.ports,
            ).catch(() => undefined);
            run.status = "cancelled";
            run.error = "workflow run 被取消";
            run.pendingAsks = [];
            run.pendingWaits = [];
            unbindExternalAbort(run);
        }
        await this.persist(run);
        if (run.status === "cancelled") {
            emitWorkflowEvent(this.env, {
                type: "status",
                runId: run.runId,
                status: run.status,
            });
        }
        return runRecordToView(run);
    }

    view(runId: string): RunView {
        return this.runStore.view(runId);
    }

    async loadView(runId: string): Promise<RunView> {
        return await this.runStore.loadView(runId);
    }

    list(): RunView[] {
        return this.runStore.list();
    }

    async listStored(): Promise<RunView[]> {
        return await this.runStore.listStored();
    }

    private async initializeAndExecute(run: RunRecord): Promise<RunView> {
        try {
            await run.initialization;
        } catch (error) {
            this.runStore.delete(run.runId);
            unbindExternalAbort(run);
            throw error;
        }
        if (run.abortRequested) {
            markCancelled(run);
            await this.persist(run);
            unbindExternalAbort(run);
            emitWorkflowEvent(this.env, {
                type: "status",
                runId: run.runId,
                status: run.status,
            });
            return runRecordToView(run);
        }
        return await this.execute(run);
    }

    private async execute(run: RunRecord): Promise<RunView> {
        if (this.inFlight.has(run.runId)) {
            throw new Error(`run ${run.runId} 正在执行中`);
        }
        this.inFlight.add(run.runId);
        try {
            return await executeWorkflowRun({
                run,
                ports: this.ports,
                env: this.env,
                activities: this.activities,
                children: this.children,
                events: this.events,
                signals: this.signals,
                timers: this.timers,
                values: this.values,
                clock: this.clock,
                random: this.random,
                defaultConcurrency: this.defaultConcurrency,
                maxConcurrency: this.maxConcurrency,
                persist: () => this.persist(run),
            });
        } finally {
            this.inFlight.delete(run.runId);
        }
    }

    private async persist(run: RunRecord): Promise<void> {
        await this.runStore.persist(run);
    }

    private async withControl<T>(
        runId: string,
        operation: () => Promise<T>,
    ): Promise<T> {
        if (this.controlInFlight.has(runId)) {
            throw new Error(`run ${runId} 正在处理控制命令`);
        }
        this.controlInFlight.add(runId);
        try {
            return await operation();
        } finally {
            this.controlInFlight.delete(runId);
        }
    }
}
