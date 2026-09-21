/** JSON primitive accepted by persisted Harness contracts. */
export type JsonPrimitive = null | boolean | number | string;

/** JSON array accepted by persisted Harness contracts. */
export type JsonArray = JsonValue[];

/** JSON object accepted by persisted Harness contracts. */
export type JsonObject = {
    [key: string]: JsonValue;
};

/** Persistable value shared by Session, Profile and event contracts. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** Returns true when a value is a non-array JSON object. */
export function isJsonObject(value: JsonValue): value is JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
