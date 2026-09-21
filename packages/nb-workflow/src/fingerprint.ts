import { createHash } from "node:crypto";

import type { JsonValue } from "./types";

export class NonJsonValueError extends Error {
    constructor(readonly path: string, readonly reason: string) {
        const escaped = JSON.stringify(path).slice(1, -1);
        const truncated = escaped.length > 300
            ? `${escaped.slice(0, 297)}...`
            : escaped;
        super(
            `Workflow value at ${truncated} is not valid JSON: `
            + `${reason}.`,
        );
        this.name = "NonJsonValueError";
    }
}

/** 验证并返回键排序后的 JSON；错误不回显原始值，避免泄露 payload。 */
export function canonicalJson(value: unknown): string {
    const canonical = canonicalize(value, "$", new WeakSet(), 0);
    return JSON.stringify(canonical);
}

/** Activity fingerprint 只保存 SHA-256，不把输入正文放进 fingerprint。 */
export function fingerprint(value: unknown): string {
    return fingerprintFromCanonicalJson(canonicalJson(value));
}

/** 仅供内核复用已完成的 canonical JSON，避免同一输入重复遍历。 */
export function fingerprintFromCanonicalJson(canonical: string): string {
    return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/** 可供观测层读取的 Activity 参数来源；摘要 fingerprint 不可逆。 */
export type ActivityParamsSource = {
    fingerprint: string;
    params?: string;
};

/**
 * 读取内核生成的 canonical JSON 参数。
 * 旧记录没有 params 时仅兼容 T02 之前的 inline JSON fingerprint。
 */
export function parseActivityParams(
    source: ActivityParamsSource,
): JsonValue | undefined {
    return source.params === undefined
        ? parseLegacyFingerprint(source.fingerprint)
        : parseCanonicalJson(source.params);
}

export function parseActivityParamsObject(
    source: ActivityParamsSource,
): Record<string, JsonValue> | undefined {
    const parsed = parseActivityParams(source);
    return parsed !== null
        && typeof parsed === "object"
        && !Array.isArray(parsed)
        ? parsed
        : undefined;
}

function parseCanonicalJson(value: string): JsonValue | undefined {
    try {
        const parsed: unknown = JSON.parse(value);
        assertJsonValue(parsed);
        return canonicalJson(parsed) === value ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function parseLegacyFingerprint(value: string): JsonValue | undefined {
    if (value.startsWith("sha256:")) return undefined;
    return parseCanonicalJson(value);
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
    canonicalJson(value);
}

function canonicalize(
    value: unknown,
    path: string,
    ancestors: WeakSet<object>,
    depth: number,
): JsonValue {
    if (depth > 100) {
        throw new NonJsonValueError(path, "maximum depth exceeded");
    }
    if (
        value === null
        || typeof value === "string"
        || typeof value === "boolean"
    ) {
        return value;
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value)) {
            throw new NonJsonValueError(path, "number must be finite");
        }
        return value;
    }
    if (typeof value !== "object") {
        throw new NonJsonValueError(path, `unsupported ${typeof value}`);
    }
    if (ancestors.has(value)) {
        throw new NonJsonValueError(path, "cyclic reference");
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            const symbols = Object.getOwnPropertySymbols(value);
            if (symbols.length > 0) {
                throw new NonJsonValueError(
                    path,
                    "symbol keys are unsupported",
                );
            }
            const output: JsonValue[] = [];
            for (let index = 0; index < value.length; index += 1) {
                const descriptor = Object.getOwnPropertyDescriptor(
                    value,
                    index,
                );
                if (
                    !descriptor
                    || !descriptor.enumerable
                    || !("value" in descriptor)
                ) {
                    throw new NonJsonValueError(
                        `${path}[${index}]`,
                        "index must be an enumerable data property",
                    );
                }
                output.push(canonicalize(
                    descriptor.value,
                    `${path}[${index}]`,
                    ancestors,
                    depth + 1,
                ));
            }
            return output;
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new NonJsonValueError(
                path,
                "object must have a plain prototype",
            );
        }
        const symbols = Object.getOwnPropertySymbols(value);
        if (symbols.length > 0) {
            throw new NonJsonValueError(path, "symbol keys are unsupported");
        }
        const output: Record<string, JsonValue> = Object.create(null);
        for (const key of Object.getOwnPropertyNames(value).sort()) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            if (!descriptor) {
                throw new NonJsonValueError(
                    `${path}.${key}`,
                    "property descriptor is unavailable",
                );
            }
            if (!descriptor.enumerable) {
                if (!("value" in descriptor)) {
                    throw new NonJsonValueError(
                        `${path}.${key}`,
                        "properties must be data properties",
                    );
                }
                continue;
            }
            if (!("value" in descriptor)) {
                throw new NonJsonValueError(
                    `${path}.${key}`,
                    "properties must be data properties",
                );
            }
            output[key] = canonicalize(
                descriptor.value,
                `${path}.${key}`,
                ancestors,
                depth + 1,
            );
        }
        return output;
    } finally {
        ancestors.delete(value);
    }
}
