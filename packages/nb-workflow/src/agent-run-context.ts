import { assertJsonValue } from "./fingerprint";
import type {
    JsonValue,
    SessionId,
} from "./types";

const agentExtensionKey = "nb-workflow.agent@1";

export function createAgentExtensionContext(
    callerSessionId: SessionId | null,
    defaultModel: string | null,
): JsonValue {
    if (callerSessionId === null && defaultModel === null) {
        return {};
    }
    const context = {
        [agentExtensionKey]: {
            callerSessionId,
            defaultModel,
        },
    };
    assertJsonValue(context);
    return context;
}

export function readAgentExtensionContext(
    context: JsonValue,
): {
    callerSessionId: SessionId | null;
    defaultModel: string | null;
} {
    if (
        context === null
        || Array.isArray(context)
        || typeof context !== "object"
    ) {
        throw new Error(
            "Workflow extensionContext must be a JSON object.",
        );
    }
    const agent = context[agentExtensionKey];
    if (agent === undefined) {
        return {
            callerSessionId: null,
            defaultModel: null,
        };
    }
    if (
        agent === null
        || Array.isArray(agent)
        || typeof agent !== "object"
    ) {
        throw new Error(
            `Workflow extensionContext is missing ${agentExtensionKey}.`,
        );
    }
    const callerSessionId = agent.callerSessionId;
    const defaultModel = agent.defaultModel;
    if (
        callerSessionId !== null
        && (
            typeof callerSessionId !== "number"
            || !Number.isSafeInteger(callerSessionId)
        )
    ) {
        throw new Error(
            "Agent extension callerSessionId must be an integer or null.",
        );
    }
    if (
        defaultModel !== null
        && typeof defaultModel !== "string"
    ) {
        throw new Error(
            "Agent extension defaultModel must be a string or null.",
        );
    }
    return {
        callerSessionId,
        defaultModel,
    };
}
