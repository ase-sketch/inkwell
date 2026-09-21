import type {
    AgentInvokeOutcome,
    AgentPort,
    SessionPort,
} from "./ports";
import type { Runtime } from "./runtime";
import type {
    EntryId,
    InvokeOptions,
    InvokeResult,
    JsonValue,
    SessionEntry,
    SessionHandle,
    SessionId,
    Wf,
} from "./types";

class Handle implements SessionHandle {
    private cursor: EntryId | null;

    constructor(
        private readonly runtime: Runtime,
        private readonly sessions: SessionPort,
        private readonly agents: AgentPort,
        readonly id: SessionId,
        initialLeaf: EntryId | null,
    ) {
        this.cursor = initialLeaf;
    }

    leaf(): EntryId | null {
        return this.cursor;
    }

    async transcript(opts?: { tail?: number }): Promise<SessionEntry[]> {
        const full = await this.runtime.activity(
            "sessions.transcript",
            {
                id: this.id,
                cursor: this.cursor,
                tail: opts?.tail ?? null,
            },
            async () => await this.sessions.transcript(
                this.id,
                this.cursor,
            ) as unknown as JsonValue,
        );
        const entries = full as unknown as SessionEntry[];
        return opts?.tail ? entries.slice(-opts.tail) : entries;
    }

    async checkout(entryId: EntryId): Promise<void> {
        await this.runtime.activity(
            "sessions.checkout",
            { id: this.id, entryId },
            async () => {
                await this.sessions.setActiveLeaf(this.id, entryId);
                return null;
            },
        );
        this.cursor = entryId;
    }

    async append(message: {
        role: "user" | "assistant";
        message?: string;
        input?: JsonValue;
    }): Promise<EntryId> {
        const parent = this.cursor;
        const id = await this.runtime.activity(
            "sessions.append",
            {
                id: this.id,
                parent,
                role: message.role,
                message: message.message ?? null,
                input: message.input ?? null,
            },
            async () => await this.sessions.append(this.id, parent, {
                role: message.role,
                message: message.message,
                input: message.input,
                origin: "workflow",
            }),
        );
        this.cursor = id;
        return id;
    }

    async invoke(options: InvokeOptions): Promise<InvokeResult> {
        const parent = this.cursor;
        const outcome = await this.runtime.activity(
            "agents.invoke",
            {
                id: this.id,
                parent,
                mode: options.mode ?? "prompt",
                message: options.message ?? null,
                ...(options.input === undefined
                    ? {}
                    : {input: options.input}),
            },
            async () => await this.agents.invoke(
                this.id,
                parent,
                {
                    mode: options.mode ?? "prompt",
                    message: options.message ?? null,
                    ...(options.input === undefined
                        ? {}
                        : {input: options.input}),
                    signal: this.runtime.signal,
                },
            ) as unknown as JsonValue,
        ) as unknown as AgentInvokeOutcome;
        this.cursor = outcome.newLeaf;
        return {
            status: outcome.status,
            result: {
                message: outcome.message,
                data: outcome.data,
            },
        };
    }

    async excursion<T>(
        at: EntryId | "leaf",
        fn: (branch: SessionHandle) => Promise<T>,
    ): Promise<T> {
        const origin = this.cursor;
        if (at !== "leaf") {
            await this.checkout(at);
        }
        try {
            return await fn(this);
        } finally {
            if (origin !== null) {
                await this.checkout(origin);
            }
        }
    }
}

type AgentExtension = Pick<
    Wf,
    "agents" | "sessions" | "workspace" | "caller"
>;

export function createAgentExtension(runtime: Runtime): AgentExtension {
    const openHandle = createHandleOpener(runtime);
    return {
        agents: createAgentApi(runtime, openHandle),
        sessions: {
            open: openHandle,
        },
        workspace: {
            read: (path) => runtime.activity(
                "workspace.read",
                { path },
                async () => {
                    const workspace = runtime.run.workspace
                        ?? runtime.env.workspace;
                    if (!workspace) {
                        throw new Error(
                            "本环境未提供 workspace 端口",
                        );
                    }
                    return await workspace.read(path);
                },
            ),
        },
        caller: async () => {
            if (runtime.run.callerSessionId === null) {
                throw new Error("本 run 无 caller（面 A 触发）");
            }
            return await openHandle(runtime.run.callerSessionId);
        },
    };
}

type HandleOpener = (
    sessionId: SessionId,
) => Promise<SessionHandle>;

function createHandleOpener(runtime: Runtime): HandleOpener {
    return async (
        sessionId: SessionId,
    ): Promise<SessionHandle> => {
        const { sessions, agents } = requireAgentPorts(runtime);
        const output = await runtime.activity(
            "sessions.open",
            { id: sessionId },
            async () => ({
                leafId: await sessions.activeLeaf(sessionId),
            }),
        ) as { leafId: EntryId | null };
        await runtime.lock(sessionId);
        return new Handle(
            runtime,
            sessions,
            agents,
            sessionId,
            output.leafId,
        );
    };
}

function createAgentApi(
    runtime: Runtime,
    openHandle: HandleOpener,
): Wf["agents"] {
    return {
        profile: (profileKey) => {
            const { agents } = requireAgentPorts(runtime);
            return runtime.activity(
                "agents.profile",
                { profileKey },
                async () => agents.profileInfo(profileKey),
            );
        },
        create: async (profileKey, options = {}) =>
            await createAgentSession(runtime, profileKey, options),
        acquire: async (options) =>
            await acquireAgentSession(runtime, options),
        invoke: async (sessionId, options) => (
            await openHandle(sessionId)
        ).invoke(options),
    };
}

type AgentCreateOptions = NonNullable<
    Parameters<Wf["agents"]["create"]>[1]
>;

async function createAgentSession(
    runtime: Runtime,
    profileKey: string,
    options: AgentCreateOptions,
): Promise<SessionHandle> {
    const { sessions, agents } = requireAgentPorts(runtime);
    const model = options.model
        ?? runtime.run.defaultModel
        ?? null;
    const output = await runtime.activity(
        "agents.create",
        {
            profileKey,
            initial: options.initial ?? null,
            tags: options.tags ?? [],
            parent: options.parent?.id ?? null,
            ephemeral: options.ephemeral ?? false,
            model,
        },
        async () => {
            const metadata = await sessions.createSession({
                profileKey,
                kind: "chat",
                tags: options.tags ?? [],
                parentSessionId: options.parent?.id,
                initial: options.initial,
                model: model ?? undefined,
            });
            return { sessionId: metadata.sessionId };
        },
    ) as { sessionId: SessionId };
    if (options.ephemeral) {
        runtime.run.ephemeralSessions.add(output.sessionId);
    }
    await runtime.lock(output.sessionId);
    return new Handle(
        runtime,
        sessions,
        agents,
        output.sessionId,
        null,
    );
}

type AgentAcquireOptions =
    Parameters<Wf["agents"]["acquire"]>[0];

async function acquireAgentSession(
    runtime: Runtime,
    options: AgentAcquireOptions,
): Promise<SessionHandle> {
    const { profileKey, tag, parent } = options;
    const { sessions, agents } = requireAgentPorts(runtime);
    const output = await runtime.activity(
        "agents.acquire",
        {
            profileKey,
            tag,
            parent: parent?.id ?? null,
        },
        async () => {
            return await sessions.acquireByTag({
                profileKey,
                tag,
                parentSessionId: parent?.id,
            });
        },
    ) as {
        sessionId: SessionId;
        leafId: EntryId | null;
        created: boolean;
    };
    await runtime.lock(output.sessionId);
    return new Handle(
        runtime,
        sessions,
        agents,
        output.sessionId,
        output.leafId,
    );
}

export function requireAgentPorts(runtime: Runtime): {
    sessions: SessionPort;
    agents: AgentPort;
} {
    const { sessions, agents } = runtime.ports;
    if (!sessions || !agents) {
        throw new Error(
            "Agent/Session extension is not configured for this "
            + "WorkflowRunner.",
        );
    }
    return { sessions, agents };
}
