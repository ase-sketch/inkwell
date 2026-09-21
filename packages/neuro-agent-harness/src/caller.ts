import type {SessionId} from "./session.js";
import type {JsonValue} from "./json.js";
import {defineCapability, type CapabilityToken} from "./capability.js";

/** Describes who initiated an Invocation without exposing the full Harness. */
export type AgentCaller<TSessionId extends SessionId = number> =
    | {
        kind: "user";
    }
    | {
        kind: "agent";
        sessionId: TSessionId;
        profileKey: string;
        toolCallId?: string;
    }
    | {
        kind: "system";
        name: string;
    };

/** Describes the durable identity of an input independently from its caller. */
export type MessageIdentity = "user" | "system";

/** Optional caller and durable-message metadata shared by invocation entry points. */
export interface InvocationInputOptions<TSessionId extends SessionId = number> {
    readonly caller?: AgentCaller<TSessionId>;
    readonly messageIdentity?: MessageIdentity;
}

/** Restricted nested-agent call request exposed through a Capability. */
export interface AgentCallRequest<TSessionId extends SessionId = number> {
    readonly sessionId: TSessionId;
    readonly payload: JsonValue;
    readonly caller: AgentCaller<TSessionId>;
    readonly messageIdentity?: MessageIdentity;
}

/** Result visible to a Tool or Workflow that calls another Agent Invocation. */
export interface AgentCallResult<TSessionId extends SessionId = number> {
    readonly sessionId: TSessionId;
    readonly invocationId: string;
    readonly status: "completed" | "waiting" | "failed" | "aborted";
    readonly output?: JsonValue;
}

/** Restricted Agent caller capability; it deliberately omits Store and Harness access. */
export interface AgentInvoker<TSessionId extends SessionId = number> {
    invoke(request: AgentCallRequest<TSessionId>): Promise<AgentCallResult<TSessionId>>;
}

/** Creates the shared typed token used by a host composition root and its Profiles. */
export function defineAgentInvokerCapability<TSessionId extends SessionId = number>(): CapabilityToken<"agentInvoker", AgentInvoker<TSessionId>> {
    return defineCapability("agentInvoker");
}
