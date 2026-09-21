import type {JsonObject, JsonValue} from "./json.js";

/** Runtime parser paired with optional Parsed Value validation and a provider-visible JSON schema. */
export interface ValueSchema<TValue extends JsonValue> {
    readonly jsonSchema?: JsonObject;
    /**
     * Decodes one external JSON value. The returned Parsed Value must be stable under
     * validateParsed, or under parse itself when no explicit validator is provided.
     * Schema callbacks are pure and deterministic because raw provider values can be
     * decoded again across approval recovery and process restart.
     */
    parse(value: JsonValue): TValue;
    /** Purely validates an already parsed/durable value and must return a JSON-equal value. */
    validateParsed?(value: JsonValue): TValue;
}

/** A schema attempted to transform a value that was already parsed. */
export class SchemaCanonicalValueError extends Error {
    constructor() {
        super("ValueSchema 对 Parsed Value 的验证不得继续转换该值");
        this.name = "SchemaCanonicalValueError";
    }
}

/** Defines a transformation-capable schema with an explicit Parsed Value validator. */
export function defineSchema<TValue extends JsonValue>(
    definition: ValueSchema<TValue>,
): ValueSchema<TValue>;
/** Defines a lightweight validate-and-return or idempotent schema. */
export function defineSchema<TValue extends JsonValue>(
    parse: (value: JsonValue) => TValue,
    jsonSchema?: JsonObject,
): ValueSchema<TValue>;
export function defineSchema<TValue extends JsonValue>(
    parseOrDefinition: ValueSchema<TValue> | ((value: JsonValue) => TValue),
    jsonSchema?: JsonObject,
): ValueSchema<TValue> {
    if (typeof parseOrDefinition !== "function") {
        if (typeof parseOrDefinition.parse !== "function") {
            throw new Error("ValueSchema.parse 必须是 function");
        }
        return parseOrDefinition;
    }
    return {
        ...(jsonSchema ? {jsonSchema} : {}),
        parse: parseOrDefinition,
    };
}

/** Identity schema for callers that deliberately accept any JSON value. */
export const jsonValueSchema: ValueSchema<JsonValue> = defineSchema((value) => value);

/** Decodes external input once and verifies that its Parsed Value is stable. */
export function parseSchemaValue<TValue extends JsonValue>(
    schema: ValueSchema<TValue>,
    value: JsonValue,
): TValue {
    const parsed = schema.parse(value);
    validateParsedSchemaValue(schema, parsed);
    return parsed;
}

/** Validates a Parsed Value without replacing it with another representation. */
export function validateParsedSchemaValue<TValue extends JsonValue>(
    schema: ValueSchema<TValue>,
    value: JsonValue,
): TValue {
    const validated = schema.validateParsed
        ? schema.validateParsed(value)
        : schema.parse(value);
    if (!jsonValuesEqual(value, validated)) {
        throw new SchemaCanonicalValueError();
    }
    return value as TValue;
}

function jsonValuesEqual(left: JsonValue, right: JsonValue): boolean {
    if (left === right) return true;
    if (left === null || right === null || typeof left !== "object" || typeof right !== "object") {
        return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left)
            && Array.isArray(right)
            && left.length === right.length
            && left.every((value, index) => jsonValuesEqual(value, right[index]!));
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && jsonValuesEqual(left[key]!, right[key]!));
}
