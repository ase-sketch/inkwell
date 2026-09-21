# ADR-0028: Durable Profile Version Approval Admission

- Status: Accepted (standalone Profile Version approval-admission scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

A durable waiting Invocation records its `profileKey` and approval request, but current `resume()` resolves the currently loaded Profile and prepares its current Tool definitions. If a host replaces Profile version 1 with version 2 while an approval is waiting, the user can approve the version 1 prompt while Harness executes the version 2 handler, argument interpretation, Capability set or hook behavior.

The existing durable owner/version claim prevents two contenders from executing one resolution, but it does not bind the approved action to the Profile semantics that created it. Pinning an in-memory Profile does not survive restart, and Core cannot derive a trustworthy fingerprint from arbitrary JavaScript closures.

## Decision

- `ProfileManifest.version ?? 1` is the effective Profile Version. It remains a positive integer.
- Profile Version is an execution-compatibility declaration, not only display metadata. A host must increment it when Tool arguments, approval prompt/data, execute behavior, Capability requirements, hooks or other semantics relevant to a pending approval become incompatible.
- Each new Invocation persists the effective Profile Version in an additive optional `InvocationRecord.profileVersion` field. The field is optional only so legacy snapshots and Store Adapters remain readable; new Harness starts always provide it.
- Legacy Invocation records without the field have effective Profile Version `1`. Only `undefined` means missing; explicit `null` and every other invalid durable value fail closed.
- Approval `resume()` compares the Invocation version with the currently resolved Profile before durable claim, Capability open, Profile prepare, Tool or Provider work. A mismatch raises a typed Profile version conflict and leaves the Invocation waiting.
- Once one resume attempt resolves a compatible Profile and passes the comparison, it keeps that Profile object across the asynchronous durable claim. A later Registry replacement does not retarget that already-started attempt; a new resume caller resolves the replacement independently.
- Replacing a Profile with the same version declares approval-resume compatibility and remains allowed. Core does not hash or serialize handler closures.
- `retry()` creates a new Invocation and therefore binds the currently loaded Profile Version; it does not inherit the prior Invocation version.

This is an additive Session Store contract revision. Memory and JSONL must persist and recover the field. A strict third-party Store that rejects unknown fields must update its `startInvocation` decoder; this ADR does not claim binary compatibility with such an Adapter.

## Alternatives

- **Tool definition or handler fingerprint**: rejected as a Core default because function closures, injected capabilities and hidden host configuration cannot be hashed reliably. A future host-supplied opaque revision would require separate consumer evidence.
- **Compare approval prompt and arguments**: rejected because identical text does not prove identical side effects.
- **Pin the Profile object in memory**: rejected because waiting approval is durable across restart and independent Harness instances.
- **Always use the current Profile**: rejected because it silently detaches approval intent from the executed action.
- **Reject every legacy waiting Invocation**: rejected as unnecessarily incompatible. Missing durable version and missing manifest version both have the documented effective value `1`; a current version greater than 1 still fails closed.

## Acceptance gate

- A Memory public tracer proves the old implementation executes a version 2 Tool from a version 1 approval, then turns green with zero version 2 prepare/Tool/Provider side effects and an unchanged waiting Snapshot.
- JSONL restart preserves the durable version and rejects a different current version before claim.
- Legacy Memory/JSONL records without `profileVersion` recover as version 1; current version 1 can resume and current version 2 cannot.
- Same-version replacement can resume, while retry creates a new Invocation with the current effective version.
- Invalid manifest and durable Profile versions fail closed.
- A deterministic Store gate proves replacement after version comparison but before claim completion executes only the already-validated old Profile, never the replacement.
- Existing approval claim, duplicate resolution, Context, Capability, Tool identity, retry and recovery contracts remain green.
- Focused tests, `bun run verify`, `bun run pack:smoke`, protected-file audit and independent implementation/test/contract review pass before acceptance.

## Out of scope

- External Tool exactly-once, idempotency keys, Outbox or compensation;
- automatic migration of a pending approval between incompatible Profile versions;
- serializing Profile/Tool implementations or importing NeuroBook catalog artifacts;
- Job/Run/Step/Lease/delivery, HTTP/SSE or Cosmos product DTOs.
