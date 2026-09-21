import { createHash } from "node:crypto";

import { canonicalJson } from "./fingerprint";
import type { ValueStore } from "./ports";
import type {
    JsonValue,
    ValueRef,
    WorkflowValue,
} from "./types";

export class WorkflowValueTooLargeError extends Error {
    constructor(
        readonly byteSize: number,
        readonly inlineLimitBytes: number,
    ) {
        super(
            `Workflow value is ${byteSize} bytes, above the inline limit `
            + `of ${inlineLimitBytes}, but no ValueStore is configured.`,
        );
        this.name = "WorkflowValueTooLargeError";
    }
}

export class WorkflowValueNotFoundError extends Error {
    constructor(readonly reference: ValueRef) {
        super(`Workflow value not found: ${reference.key}`);
        this.name = "WorkflowValueNotFoundError";
    }
}

export class WorkflowValueIntegrityError extends Error {
    constructor(readonly reference: ValueRef) {
        super(`Workflow value integrity check failed: ${reference.key}`);
        this.name = "WorkflowValueIntegrityError";
    }
}

export class WorkflowValueCodec {
    readonly supportsReferences: boolean;

    constructor(
        private readonly store: ValueStore | undefined,
        readonly inlineLimitBytes = 64 * 1024,
    ) {
        if (
            !Number.isSafeInteger(inlineLimitBytes)
            || inlineLimitBytes < 0
        ) {
            throw new Error(
                "inlineValueLimitBytes must be a non-negative integer.",
            );
        }
        this.supportsReferences = store !== undefined;
    }

    async encode(value: JsonValue): Promise<WorkflowValue> {
        const byteSize = Buffer.byteLength(canonicalJson(value), "utf8");
        if (byteSize <= this.inlineLimitBytes) {
            return {
                kind: "inline",
                value: structuredClone(value),
            };
        }
        if (!this.store) {
            throw new WorkflowValueTooLargeError(
                byteSize,
                this.inlineLimitBytes,
            );
        }
        return {
            kind: "ref",
            ref: await this.store.put(value),
        };
    }

    async decode(stored: WorkflowValue): Promise<JsonValue> {
        if (stored.kind === "inline") {
            return structuredClone(stored.value);
        }
        if (!this.store) {
            throw new WorkflowValueNotFoundError(stored.ref);
        }
        return await this.store.get(stored.ref);
    }
}

/** 当前进程内的内容寻址 ValueStore；用于测试和 Memory Backend 组合。 */
export class MemoryValueStore implements ValueStore {
    private readonly values = new Map<string, string>();

    async put(value: JsonValue): Promise<ValueRef> {
        const canonical = canonicalJson(value);
        const hex = createHash("sha256").update(canonical).digest("hex");
        const hash = `sha256:${hex}`;
        const key = `values/${hex}`;
        this.values.set(key, canonical);
        return {
            key,
            hash,
            byteSize: Buffer.byteLength(canonical, "utf8"),
            mediaType: "application/json",
        };
    }

    async get(reference: ValueRef): Promise<JsonValue> {
        const canonical = this.values.get(reference.key);
        if (canonical === undefined) {
            throw new WorkflowValueNotFoundError(reference);
        }
        const hex = createHash("sha256").update(canonical).digest("hex");
        if (
            reference.hash !== `sha256:${hex}`
            || reference.byteSize !== Buffer.byteLength(canonical, "utf8")
            || reference.mediaType !== "application/json"
        ) {
            throw new WorkflowValueIntegrityError(reference);
        }
        return JSON.parse(canonical) as JsonValue;
    }
}
