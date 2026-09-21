# ADR-0032: Event Cursor Epoch Admission

- Status: Accepted
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`EventCursor` combines a process/event-hub epoch with a Session-local `after` sequence. NeuroBook's `AgentJobEventHub` rejects a cursor that carries a positive `after` without an `eventEpoch`: the consumer cannot prove which stream the sequence belongs to, so recovery must use a Snapshot.

standalone `SessionEventHub.subscribe()` currently treats an omitted epoch as compatible with the current hub:

```ts
hub.subscribe(sessionId, {after: 1})
```

If the caller lost the epoch, mixed a cursor from another Hub, or supplied a partially malformed cursor, standalone may replay current events after sequence 1 instead of requiring Snapshot recovery.

## Decision

- When `cursor.after` is a positive integer and `cursor.eventEpoch` is omitted, `SessionEventHub.subscribe()` reports `connected.snapshotRequired: true` and does not replay events.
- `after: 0` without an epoch remains valid: sequence zero is the beginning boundary and does not claim continuity from another stream.
- An omitted cursor (`{}`) remains valid for subscribing from the current tail.
- Existing epoch mismatch, cursor-ahead and replay-expired rules remain unchanged.
- This is an admission/recovery tightening only; no event envelope, durable Session shape or Transport API is added.

## Alternatives

- **Accept missing epoch whenever the sequence is in the replay window**: rejected; replay-window membership cannot prove stream identity.
- **Invent a default epoch or infer it from sequence**: rejected; epochs are intentionally process/hub identities and sequence values are not globally unique.
- **Make `eventEpoch` required in the TypeScript type**: deferred; host adapters may construct an initial `after: 0` cursor before the first connected frame, and runtime fail-closed validation protects JavaScript/HTTP callers too.

## Acceptance gate

- `{after: 1}` requires Snapshot and yields no replay;
- `{after: 0}` remains valid without epoch;
- `{}` remains valid and subscribes from the current tail;
- valid `{eventEpoch, after}` replay is unchanged;
- epoch mismatch, cursor ahead and replay expiry remain Snapshot-required;
- focused/full/package gate and production/API-domain/test-sensitivity review pass.

## Evidence and acceptance

- `tests/event-cursor-epoch-admission.test.ts` adds 2 public regressions: explicit missing-epoch positive cursor requires Snapshot, while `after: 0` and empty cursor remain valid.
- Existing `tests/events.test.ts` continues to cover valid epoch replay, epoch mismatch, cursor ahead and replay expiry.
- Focused EventHub suite is `23 pass / 0 fail / 74 assertions`; `bun run typecheck` passes.
- Final `bun run verify` is `338 pass / 0 fail / 1457 assertions` across 51 test files with typecheck/build passing.
- Final `bun run pack:smoke` prepack is also `338/0/1457`; the 109-file tarball is 120.7 kB / 571.9 kB unpacked, and Bun plus Node ESM consumers pass.
- Production, API/domain and post-fix test-sensitivity reviews return `No P0/P1/P2 findings.`; the initial test review concern was adjudicated as a misread because the test explicitly constructs `{after: 1}` without `eventEpoch`.

The decision is accepted only for standalone in-process EventHub cursor admission. HTTP/SSE parsing, reconnect generation and browser recovery remain host responsibilities.

## Out of scope

- HTTP/SSE query parsing, reconnect backoff, automatic recovery throttling or connection generation;
- cross-process EventHub or durable event bus semantics;
- changing the EventCursor TypeScript optionality;
- browser/Product/NeuroBook integration.
