import type {CapabilityToken, ReadCapability} from "./capability.js";
import {isJsonObject} from "./json.js";
import type {JsonObject} from "./json.js";
import {defineSchema} from "./schema.js";
import {defineTool, type ToolDefinition} from "./tool.js";
import type {SessionId} from "./session.js";

/** Model-visible arguments accepted by the opt-in Read Tool Adapter. */
export type ReadToolArguments = JsonObject & {
    readonly reference: string;
    readonly offset?: number;
    readonly limit?: number;
}

/** Configuration for an explicit Capability-bound Read Tool Adapter. */
export interface ReadToolOptions<
    TName extends string,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
> {
    readonly capability: CapabilityToken<TName, ReadCapability>;
    readonly name?: string;
    readonly description?: string;
}

const readToolArgumentsSchema = defineSchema<ReadToolArguments>((value) => {
    if (!isJsonObject(value) || typeof value.reference !== "string") {
        throw new Error("read reference 无效");
    }
    if (value.offset !== undefined && (typeof value.offset !== "number" || !Number.isFinite(value.offset))) {
        throw new Error("read offset 必须是 finite number");
    }
    if (value.limit !== undefined && (typeof value.limit !== "number" || !Number.isFinite(value.limit))) {
        throw new Error("read limit 必须是 finite number");
    }
    return value as ReadToolArguments;
}, {
    type: "object",
    properties: {
        reference: {type: "string"},
        offset: {type: "number"},
        limit: {type: "number"},
    },
    required: ["reference"],
});

/**
 * Creates an opt-in Read Tool Adapter bound to a caller-supplied capability.
 * It does not create authorization, inspect paths or access a filesystem.
 */
export function createReadTool<
    TName extends string,
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
>(
    options: ReadToolOptions<TName, TSessionId, THostContext>,
): ToolDefinition<ReadToolArguments, TSessionId, THostContext> {
    const name = options.name ?? "read";
    const description = options.description ?? "读取宿主授权的文本资源";
    return defineTool<ReadToolArguments, TSessionId, THostContext>({
        name,
        description,
        parameters: readToolArgumentsSchema,
        execute: async (argumentsValue, context) => {
            const result = await context.capabilities.require(options.capability).read(argumentsValue);
            const details: JsonObject = {};
            if (result.provenance !== undefined) details.provenance = result.provenance;
            if (result.truncated !== undefined) details.truncated = result.truncated;
            if (result.nextOffset !== undefined) details.nextOffset = result.nextOffset;
            return {
                content: result.content,
                ...(Object.keys(details).length > 0 ? {details} : {}),
            };
        },
    });
}
