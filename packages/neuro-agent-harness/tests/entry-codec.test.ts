import {describe, expect, test} from "bun:test";
import {defineSchema, defineSessionEntryCodec, type JsonObject, type SessionEntry} from "../src/index.js";

interface RelationPayload extends JsonObject {
    targetSessionId: number;
    profileKey: string;
}

describe("SessionEntryCodec", () => {
    test("NeuroBook host entry 保持强类型并在投影时重新验证", () => {
        const relation = defineSessionEntryCodec("neuro.relation.link", defineSchema<RelationPayload>((value) => {
            if (value === null || typeof value !== "object" || Array.isArray(value)
                || typeof value.targetSessionId !== "number" || typeof value.profileKey !== "string") {
                throw new Error("relation payload 无效");
            }
            return value as RelationPayload;
        }));
        const draft = relation.draft({targetSessionId: 2, profileKey: "writer"}, {invocationId: "inv"});
        const entry: SessionEntry = {...draft, id: "entry", parentId: null, timestamp: 1};
        expect(relation.parse(entry)).toEqual({targetSessionId: 2, profileKey: "writer"});
        expect(relation.parse({...entry, kind: "other"})).toBeUndefined();
        expect(() => relation.parse({...entry, payload: {targetSessionId: "bad"}})).toThrow("relation payload 无效");
    });
});
