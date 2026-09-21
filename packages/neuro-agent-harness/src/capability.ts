import type {AgentCaller} from "./caller.js";
import type {JsonObject} from "./json.js";
import type {SessionId, SessionSnapshot} from "./session.js";

/** A typed token used by Profiles and Tools to request one host capability. */
export interface CapabilityToken<TName extends string, TValue extends object> {
    readonly name: TName;
    readonly identity: symbol;
}

/** Opaque host resource reference accepted by a ReadCapability Provider. */
export interface ReadRequest {
    /** Non-secret identifier; a Tool Adapter may persist it in the Session transcript. */
    readonly reference: string;
    /** Provider-defined pagination hint; the host defines its unit, origin, and valid range. */
    readonly offset?: number;
    /** Provider-defined page-size hint validated by the host. */
    readonly limit?: number;
}

/** Text returned by a ReadCapability Provider; truncation must be explicit. */
export interface ReadResult {
    readonly content: string;
    /** Non-secret source label; a Tool Adapter may persist it in ToolResult details. */
    readonly provenance?: string;
    /** True when the Provider omitted resource content from this result. */
    readonly truncated?: boolean;
    /** Provider-defined numeric continuation hint, when one is available. */
    readonly nextOffset?: number;
}

/** Invocation-scoped, host-authorized read seam with no filesystem assumptions. */
export interface ReadCapability {
    read(request: ReadRequest): ReadResult | Promise<ReadResult>;
}

/** Creates a capability token whose identity cannot collide with another token. */
export function defineCapability<TName extends string, TValue extends object>(name: TName): CapabilityToken<TName, TValue> {
    if (!name.trim()) {
        throw new Error("Capability name 不能为空");
    }
    return {
        name,
        identity: Symbol(name),
    };
}

/** Context used when opening an Invocation-scoped capability. */
export interface CapabilityOpenContext<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly profileKey: string;
    readonly caller: AgentCaller<TSessionId>;
    readonly hostContext: THostContext;
    readonly snapshot: SessionSnapshot<TSessionId, THostContext>;
    readonly signal: AbortSignal;
}

/** Host Adapter that materializes one typed capability for an Invocation. */
export interface CapabilityProvider<
    TName extends string,
    TValue extends object,
    TSessionId extends SessionId,
    THostContext extends JsonObject,
> {
    readonly capability: CapabilityToken<TName, TValue>;
    open(context: CapabilityOpenContext<TSessionId, THostContext>): TValue | Promise<TValue>;
    close?(value: TValue): void | Promise<void>;
}

/** Creates a provider-definition helper bound to one host's Session and Context types. */
export function createCapabilityProviderFactory<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
>(): <TName extends string, TValue extends object>(
    provider: CapabilityProvider<TName, TValue, TSessionId, THostContext>,
) => CapabilityProvider<TName, TValue, TSessionId, THostContext> {
    return (provider) => provider;
}

/** Type-safe access to capabilities already opened for the current Invocation. */
export interface CapabilityScope {
    require<TName extends string, TValue extends object>(capability: CapabilityToken<TName, TValue>): TValue;
    optional<TName extends string, TValue extends object>(capability: CapabilityToken<TName, TValue>): TValue | undefined;
}

type OpenedCapability = {
    readonly identity: symbol;
    readonly value: object;
    readonly close?: () => void | Promise<void>;
};

/** Internal capability scope shared by Profile and Tool contexts. */
export class InvocationCapabilityScope implements CapabilityScope {
    private readonly opened = new Map<symbol, OpenedCapability>();

    add<TValue extends object>(token: CapabilityToken<string, TValue>, value: TValue, close?: () => void | Promise<void>): void {
        this.opened.set(token.identity, {
            identity: token.identity,
            value,
            ...(close ? {close} : {}),
        });
    }

    require<TName extends string, TValue extends object>(capability: CapabilityToken<TName, TValue>): TValue {
        const opened = this.opened.get(capability.identity);
        if (!opened) {
            throw new Error(`缺少必需 Capability：${capability.name}`);
        }
        return opened.value as TValue;
    }

    optional<TName extends string, TValue extends object>(capability: CapabilityToken<TName, TValue>): TValue | undefined {
        return this.opened.get(capability.identity)?.value as TValue | undefined;
    }

    async close(): Promise<void> {
        const values = [...this.opened.values()].reverse();
        this.opened.clear();
        const errors: unknown[] = [];
        for (const opened of values) {
            try {
                await opened.close?.();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length === 1) {
            throw errors[0];
        }
        if (errors.length > 1) {
            throw new AggregateError(errors, "多个 Capability 关闭失败");
        }
    }
}
