import type {JsonValue} from "./json.js";
import type {ValueSchema} from "./schema.js";
import {parseSchemaValue, validateParsedSchemaValue} from "./schema.js";
import type {SessionEntry, SessionEntryDraft} from "./session.js";

/** Typed host entry kind without teaching Core its product meaning. */
export interface SessionEntryCodec<TKind extends string, TPayload extends JsonValue> {
    readonly kind: TKind;
    draft(payload: TPayload, options?: Pick<SessionEntryDraft, "invocationId" | "parentId">): SessionEntryDraft;
    parse(entry: SessionEntry): TPayload | undefined;
}

/** Defines runtime validation and draft construction for one custom Session entry kind. */
export function defineSessionEntryCodec<TKind extends string, TPayload extends JsonValue>(
    kind: TKind,
    schema: ValueSchema<TPayload>,
): SessionEntryCodec<TKind, TPayload> {
    if (!kind.trim()) throw new Error("Session entry kind 不能为空");
    return {
        kind,
        draft(payload, options = {}) {
            return {kind, payload: parseSchemaValue(schema, payload), ...options};
        },
        parse(entry) {
            return entry.kind === kind ? validateParsedSchemaValue(schema, entry.payload) : undefined;
        },
    };
}
