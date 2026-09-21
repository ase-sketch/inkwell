import type {HarnessEvent, SessionEventHub} from "./events.js";
import type {JsonObject} from "./json.js";
import type {SessionCommitResult, SessionId, SessionStore} from "./session.js";

type DurablePublicationBaseline = {
    readonly storeIdentity: object;
    readonly generationIdentity: object;
    readonly createdAt: number;
    version: number;
};

export type DurablePublicationAttempt<TSessionId extends SessionId> = {
    readonly sessionId: TSessionId;
    readonly storeIdentity: object;
    readonly generationIdentity: object;
    readonly state: StorePublicationState;
    readonly capturedDuringCreation: boolean;
};

type PendingSessionCreation = {
    readonly identity: object;
    readonly sessionId: SessionId | undefined;
};

type StorePublicationState = {
    readonly identity: object;
    readonly generations: Map<SessionId, object>;
    readonly pendingCreations: Set<PendingSessionCreation>;
};

export type DurableSessionCreationAttempt = {
    readonly state: StorePublicationState;
    readonly pending: PendingSessionCreation;
};

type EventDraft<TSessionId extends SessionId> = Omit<HarnessEvent<TSessionId>, "eventEpoch" | "seq">;

/** Internal symbol used to stage an Event Hub batch before publishing any event. */
export const publishEventBatch = Symbol("neuro-agent-harness.publishEventBatch");

const storePublicationStates = new WeakMap<object, StorePublicationState>();
const durablePublicationVersions = new WeakMap<object, Map<SessionId, DurablePublicationBaseline>>();

function storePublicationState(store: object): StorePublicationState {
    let state = storePublicationStates.get(store);
    if (!state) {
        state = {identity: {}, generations: new Map(), pendingCreations: new Set()};
        storePublicationStates.set(store, state);
    }
    return state;
}

function sessionGeneration(state: StorePublicationState, sessionId: SessionId): object {
    let identity = state.generations.get(sessionId);
    if (!identity) {
        identity = {};
        state.generations.set(sessionId, identity);
    }
    return identity;
}

function explicitPendingCreations(
    state: StorePublicationState,
    sessionId: SessionId,
): readonly PendingSessionCreation[] {
    return [...state.pendingCreations].filter((pending) => pending.sessionId === sessionId);
}

function publicationGenerationIsCurrent<TSessionId extends SessionId>(
    attempt: DurablePublicationAttempt<TSessionId>,
): boolean {
    if (attempt.capturedDuringCreation) {
        return false;
    }
    if ([...attempt.state.pendingCreations].some((pending) => pending.sessionId === undefined)) {
        return false;
    }
    const pending = explicitPendingCreations(attempt.state, attempt.sessionId);
    if (pending.length > 0) {
        return false;
    }
    return attempt.state.generations.get(attempt.sessionId) === attempt.generationIdentity;
}

/** Fences older publications while a Session create is pending. */
export function beginDurableSessionCreation(
    store: object,
    sessionId: SessionId | undefined,
): DurableSessionCreationAttempt {
    const state = storePublicationState(store);
    const pending = {identity: {}, sessionId};
    state.pendingCreations.add(pending);
    return {state, pending};
}

/** Makes the pending creation token the Store-local generation after create succeeds. */
export function completeDurableSessionCreation(
    attempt: DurableSessionCreationAttempt,
    sessionId: SessionId,
): void {
    attempt.state.pendingCreations.delete(attempt.pending);
    attempt.state.generations.set(sessionId, attempt.pending.identity);
}

/** Removes a failed create fence without changing the existing Session generation. */
export function cancelDurableSessionCreation(
    attempt: DurableSessionCreationAttempt,
): void {
    attempt.state.pendingCreations.delete(attempt.pending);
}

/** Captures Store and Session generation identity before an asynchronous commit can be overtaken. */
export function captureDurablePublication<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    store: SessionStore<TSessionId, THostContext>,
    sessionId: TSessionId,
): DurablePublicationAttempt<TSessionId> {
    const state = storePublicationState(store);
    const pending = explicitPendingCreations(state, sessionId);
    const unknownCreationPending = [...state.pendingCreations].some((creation) => creation.sessionId === undefined);
    return {
        sessionId,
        storeIdentity: state.identity,
        generationIdentity: pending.length === 1
            ? pending[0]!.identity
            : sessionGeneration(state, sessionId),
        state,
        capturedDuringCreation: unknownCreationPending || pending.length > 0,
    };
}

/** Clears process-local publication state when the owning Event Hub closes. */
export function clearDurablePublicationState(events: object): void {
    durablePublicationVersions.delete(events);
}

/** Publishes one Store commit batch or replaces a causality violation with Snapshot recovery. */
export function publishDurableCommit<
    TSessionId extends SessionId,
    THostContext extends JsonObject,
>(
    events: SessionEventHub<TSessionId>,
    attempt: DurablePublicationAttempt<TSessionId>,
    invocationId: string | undefined,
    result: SessionCommitResult<TSessionId, THostContext>,
): void {
    const version = result.snapshot.version;
    const createdAt = result.snapshot.metadata.createdAt;
    events.cursor(attempt.sessionId);
    let versions = durablePublicationVersions.get(events);
    if (!versions) {
        versions = new Map();
        durablePublicationVersions.set(events, versions);
    }
    const baseline = versions.get(attempt.sessionId);
    const envelopeOwner = invocationId ? {invocationId} : {};
    if (!publicationGenerationIsCurrent(attempt)) {
        events.publish({
            sessionId: attempt.sessionId,
            ...envelopeOwner,
            kind: "session",
            event: {type: "snapshot_required", reason: "commit_order"},
        });
        return;
    }
    if (baseline !== undefined && (
        baseline.storeIdentity !== attempt.storeIdentity
        || baseline.generationIdentity !== attempt.generationIdentity
        || baseline.createdAt !== createdAt
        || version !== baseline.version + 1
    )) {
        if (
            baseline.storeIdentity === attempt.storeIdentity
            && baseline.generationIdentity === attempt.generationIdentity
            && baseline.createdAt === createdAt
            && version > baseline.version
        ) {
            baseline.version = version;
        }
        events.publish({
            sessionId: attempt.sessionId,
            ...envelopeOwner,
            kind: "session",
            event: {type: "snapshot_required", reason: "commit_order"},
        });
        return;
    }
    versions.set(attempt.sessionId, {
        storeIdentity: attempt.storeIdentity,
        generationIdentity: attempt.generationIdentity,
        createdAt,
        version,
    });
    const drafts: EventDraft<TSessionId>[] = [];
    for (const entry of result.entries) {
        drafts.push({
            sessionId: attempt.sessionId,
            ...envelopeOwner,
            kind: "session",
            event: {type: "session_entry", entry},
        });
    }
    drafts.push({
        sessionId: attempt.sessionId,
        ...envelopeOwner,
        kind: "session",
        event: {
            type: "session_status",
            status: result.snapshot.status,
            activeInvocationId: result.snapshot.activeInvocationId,
            version,
        },
    });
    try {
        events[publishEventBatch](drafts);
    } catch (error) {
        try {
            events.publish({
                sessionId: attempt.sessionId,
                ...envelopeOwner,
                kind: "session",
                event: {type: "snapshot_required", reason: "commit_order"},
            });
        } catch {
            // A closed/unusable Hub has no continuing incremental stream to recover.
        }
        throw error;
    }
}
