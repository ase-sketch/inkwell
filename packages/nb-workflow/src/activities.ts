import type {
    ActivityExecutionContext,
    ActivityExecutionRequest,
    ActivityExecutor,
} from "./ports";
import type {
    ActivityCallOptions,
    JsonValue,
} from "./types";
import { fingerprint } from "./fingerprint";

export class ActivityExecutorNotConfiguredError extends Error {
    constructor(readonly operation: "action" | "query") {
        super(`No ActivityExecutor is configured for ${operation}.`);
        this.name = "ActivityExecutorNotConfiguredError";
    }
}

export class ActivityDefinitionNotFoundError extends Error {
    constructor(
        readonly operation: "action" | "query",
        readonly reference: string,
    ) {
        super(`Unknown ${operation} definition: ${reference}`);
        this.name = "ActivityDefinitionNotFoundError";
    }
}

export class ActivityExecutionConflictError extends Error {
    constructor(readonly idempotencyKey: string) {
        super(`Activity execution conflict: ${idempotencyKey}`);
        this.name = "ActivityExecutionConflictError";
    }
}

export class UnsupportedActivityExecutor implements ActivityExecutor {
    async callAction(): Promise<JsonValue> {
        throw new ActivityExecutorNotConfiguredError("action");
    }

    async query(): Promise<JsonValue> {
        throw new ActivityExecutorNotConfiguredError("query");
    }
}

/** 兼容 zod/TypeBox 等 schema 库的最小接口（duck typing，不硬依赖）。 */
export type ActivityInputSchema = {
    parse(input: unknown): unknown;
};

export type MemoryActivityHandler<
    TInput extends JsonValue = JsonValue,
    TOutput extends JsonValue = JsonValue,
> = (
    input: TInput,
    context: ActivityExecutionContext,
    options: ActivityCallOptions,
) => Promise<TOutput> | TOutput;

/**
 * 注册表内部存储：handler 的泛型在注册时被擦除，执行时输入已经是
 * fingerprint 验证过的 JsonValue（可选 schema 再做领域校验）。这是
 * 内部类型边界，公共 API 不暴露 any。
 */
type StoredActivity = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (
        input: any,
        context: ActivityExecutionContext,
        options: ActivityCallOptions,
    ) => Promise<JsonValue> | JsonValue;
    schema: ActivityInputSchema | undefined;
};

/** 测试/demo Executor；不提供进程重启、重试、lease 或外部副作用保证。 */
export class MemoryActivityExecutor implements ActivityExecutor {
    private readonly actions = new Map<string, StoredActivity>();
    private readonly queries = new Map<string, StoredActivity>();
    private readonly outcomes = new Map<
        string,
        { requestFingerprint: string; value: JsonValue }
    >();

    registerAction<
        TInput extends JsonValue,
        TOutput extends JsonValue,
    >(
        reference: string,
        handler: MemoryActivityHandler<TInput, TOutput>,
        options?: { input?: ActivityInputSchema },
    ): void {
        assertVersionedReference(reference);
        register(
            this.actions,
            "action",
            reference,
            handler,
            options?.input,
        );
    }

    registerQuery<
        TInput extends JsonValue,
        TOutput extends JsonValue,
    >(
        reference: string,
        handler: MemoryActivityHandler<TInput, TOutput>,
        options?: { input?: ActivityInputSchema },
    ): void {
        assertVersionedReference(reference);
        register(
            this.queries,
            "query",
            reference,
            handler,
            options?.input,
        );
    }

    async callAction(request: ActivityExecutionRequest): Promise<JsonValue> {
        return await this.execute(this.actions, "action", request);
    }

    async query(request: ActivityExecutionRequest): Promise<JsonValue> {
        return await this.execute(this.queries, "query", request);
    }

    private async execute(
        registry: ReadonlyMap<string, StoredActivity>,
        operation: "action" | "query",
        request: ActivityExecutionRequest,
    ): Promise<JsonValue> {
        const cacheKey =
            `${operation}:${request.context.idempotencyKey}`;
        const requestFingerprint = fingerprint({
            reference: request.reference,
            input: request.input,
            options: {
                key: request.options.key ?? null,
                timeoutMs: request.options.timeoutMs ?? null,
                metadata: request.options.metadata ?? null,
            },
        });
        const cached = this.outcomes.get(cacheKey);
        if (cached) {
            if (cached.requestFingerprint !== requestFingerprint) {
                throw new ActivityExecutionConflictError(cacheKey);
            }
            return structuredClone(cached.value);
        }
        const value = await execute(registry, operation, request);
        this.outcomes.set(cacheKey, {
            requestFingerprint,
            value: structuredClone(value),
        });
        return structuredClone(value);
    }
}

export function assertVersionedReference(reference: string): void {
    const separator = reference.lastIndexOf("@");
    if (
        separator <= 0
        || separator === reference.length - 1
        || reference.trim() !== reference
    ) {
        throw new Error(
            `Activity reference must include an explicit version: ${reference}`,
        );
    }
}

function register<
    TInput extends JsonValue,
    TOutput extends JsonValue,
>(
    registry: Map<string, StoredActivity>,
    operation: "action" | "query",
    reference: string,
    handler: MemoryActivityHandler<TInput, TOutput>,
    schema: ActivityInputSchema | undefined,
): void {
    if (registry.has(reference)) {
        throw new Error(`Duplicate ${operation} definition: ${reference}`);
    }
    registry.set(reference, { handler: handler as StoredActivity["handler"], schema });
}

async function execute(
    registry: ReadonlyMap<string, StoredActivity>,
    operation: "action" | "query",
    request: ActivityExecutionRequest,
): Promise<JsonValue> {
    const entry = registry.get(request.reference);
    if (!entry) {
        throw new ActivityDefinitionNotFoundError(
            operation,
            request.reference,
        );
    }
    const input = entry.schema
        ? entry.schema.parse(structuredClone(request.input))
        : request.input;
    return await entry.handler(
        input,
        request.context,
        structuredClone(request.options),
    );
}
