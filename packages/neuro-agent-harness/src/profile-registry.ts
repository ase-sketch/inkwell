import type {JsonObject, JsonValue} from "./json.js";
import type {
    AgentProfile,
    PreparedRun,
    ProfileFacet,
    RuntimeHook,
} from "./profile.js";
import {defineProfile} from "./profile.js";
import type {CapabilityToken} from "./capability.js";
import type {SessionId} from "./session.js";
import type {ProfilePrepareContext} from "./profile.js";
import {parseSchemaValue, validateParsedSchemaValue} from "./schema.js";

/** Profile lookup failure raised before an Invocation is started. */
export class ProfileNotFoundError extends Error {
    constructor(readonly profileKey: string) {
        super(`Profile ${profileKey} 不存在`);
        this.name = "ProfileNotFoundError";
    }
}

/** Duplicate Profile registration indicates an invalid composition root. */
export class ProfileConflictError extends Error {
    constructor(readonly profileKey: string) {
        super(`Profile ${profileKey} 已注册`);
        this.name = "ProfileConflictError";
    }
}

/** A waiting Invocation cannot execute a differently versioned current Profile. */
export class ProfileVersionConflictError extends Error {
    constructor(
        readonly profileKey: string,
        readonly invocationId: string,
        readonly expectedVersion: number,
        readonly actualVersion: number,
    ) {
        super(`Profile ${profileKey} version 冲突：invocation=${invocationId}, expected=${expectedVersion}, actual=${actualVersion}`);
        this.name = "ProfileVersionConflictError";
    }
}

/** Internal existential Profile shape used after typed registration. */
export interface ResolvedProfile<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
    TModelConfig extends JsonValue,
> {
    readonly key: string;
    readonly version: number;
    readonly facets: readonly ProfileFacet[];
    readonly requiredCapabilities: readonly CapabilityToken<string, object>[];
    readonly hooks: readonly RuntimeHook<TSessionId, THostContext>[];
    parseInitial(value: JsonValue): JsonValue;
    /** Optional only for compatibility with externally constructed pre-ADR-0030 shapes. */
    validateInitial?(value: JsonValue): JsonValue;
    parsePayload(value: JsonValue): JsonValue;
    /** Optional only for compatibility with externally constructed pre-ADR-0030 shapes. */
    validatePayload?(value: JsonValue): JsonValue;
    parseOutput(value: JsonValue): JsonValue;
    prepare(context: ProfilePrepareContext<JsonValue, JsonValue, TSessionId, THostContext>): Promise<PreparedRun<TSessionId, THostContext, TModelConfig>>;
}

/** Typed Profile registry. Generic Profile details are captured at registration. */
export class ProfileRegistry<
    TSessionId extends SessionId = number,
    THostContext extends JsonObject = JsonObject,
    TModelConfig extends JsonValue = JsonValue,
> {
    private readonly profiles = new Map<string, ResolvedProfile<TSessionId, THostContext, TModelConfig>>();

    /** Defines and registers a Profile with this Registry's host environment types. */
    define<TInitial extends JsonValue, TPayload extends JsonValue, TOutput extends JsonValue>(
        profile: AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig>,
    ): AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig> {
        const defined = defineProfile(profile);
        this.add(defined);
        return defined;
    }

    /** Registers one Profile while retaining its typed parser and prepare function. */
    add<TInitial extends JsonValue, TPayload extends JsonValue, TOutput extends JsonValue>(
        profile: AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig>,
    ): this {
        defineProfile(profile);
        const key = profile.manifest.key;
        if (this.profiles.has(key)) {
            throw new ProfileConflictError(key);
        }
        this.profiles.set(key, {
            key,
            version: profile.manifest.version ?? 1,
            facets: profile.facets ?? [],
            requiredCapabilities: profile.requiredCapabilities ?? [],
            hooks: profile.hooks ?? [],
            parseInitial: (value) => parseSchemaValue(profile.initial, value),
            validateInitial: (value) => validateParsedSchemaValue(profile.initial, value),
            parsePayload: (value) => parseSchemaValue(profile.payload, value),
            validatePayload: (value) => validateParsedSchemaValue(profile.payload, value),
            parseOutput: (value) => profile.output ? parseSchemaValue(profile.output, value) : value,
            prepare: async (context) => profile.prepare({
                ...context,
                initial: validateParsedSchemaValue(profile.initial, context.initial),
                payload: validateParsedSchemaValue(profile.payload, context.payload),
            }),
        });
        return this;
    }

    /** Replaces one loaded Profile while preserving the Registry seam for file watchers. */
    replace<TInitial extends JsonValue, TPayload extends JsonValue, TOutput extends JsonValue>(
        profile: AgentProfile<TInitial, TPayload, TOutput, TSessionId, THostContext, TModelConfig>,
    ): this {
        defineProfile(profile);
        if (!this.profiles.has(profile.manifest.key)) {
            throw new ProfileNotFoundError(profile.manifest.key);
        }
        this.profiles.delete(profile.manifest.key);
        return this.add(profile);
    }

    /** Resolves a Profile or fails before any durable Invocation mutation. */
    resolve(profileKey: string): ResolvedProfile<TSessionId, THostContext, TModelConfig> {
        const profile = this.profiles.get(profileKey);
        if (!profile) {
            throw new ProfileNotFoundError(profileKey);
        }
        return profile;
    }

    /** Returns host-displayable Profile metadata without exposing implementations. */
    facets(profileKey: string): readonly ProfileFacet[] {
        return this.resolve(profileKey).facets;
    }
}
