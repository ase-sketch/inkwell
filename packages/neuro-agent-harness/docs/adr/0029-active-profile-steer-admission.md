# ADR-0029: Active Profile Steer Admission

- Status: Accepted (standalone Active Profile steer-admission scope)
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

One running Invocation captures a `ResolvedProfile` before durable start and uses that object for Capability admission, `prepare()`, hooks, Tools, run limits and output parsing. `ProfileRegistry.replace()` can update the same Profile key while the Invocation remains active.

Public `steer()` currently reads the Session and resolves the Profile key from the mutable Registry again before parsing the queued payload. A version 1 attempt can therefore retain version 1 prompts, Tools and hooks while receiving a steer payload normalized or admitted by version 2. The queued value is then injected directly as a model-visible user message and is not revalidated by the active Profile.

## Decision

- A running attempt's exact resolved Profile is the admission authority for its in-memory steer payloads.
- Active Invocation state retains that Profile's `parsePayload()` function, or an equivalent exact reference, until the attempt completes.
- `steer()` preserves its existing Store read, shutdown gate and active-identity rechecks, but parses with the captured active Profile instead of resolving the current Registry entry.
- Registry replacement affects later Profile resolutions. It does not retarget an already-running attempt, even when the replacement declares the same Profile Version.
- An approval `resume()` attempt binds the compatible Profile resolved by that resume admission; steers accepted after resume use that same Profile.
- Parser failure still rejects steer before queue mutation or event publication.

This changes no public type, durable Session shape or package dependency. Profile Version remains the durable approval-resume compatibility declaration from ADR-0028; active Profile binding is an in-memory attempt lifetime.

## Alternatives

- **Parse with the current Registry Profile**: rejected because it mixes two Profile implementations inside one attempt.
- **Compare versions and reject after replacement**: rejected because the exact active parser is already available and can safely admit input without interrupting the run.
- **Use the current Profile when versions match**: rejected because a running attempt has already frozen the old Profile's other behavior; exact binding is deterministic and does not depend on unverifiable closure compatibility.
- **Defer parsing until steer drain**: rejected because invalid input would be reported after successful queue admission and could terminate the active run.
- **Persist or serialize the Profile implementation**: rejected because steer is process-local and arbitrary closures are not a durable Core format.

## Acceptance gate

- A public Memory tracer starts a version 1 Invocation, holds its first Model turn, replaces the Registry entry with version 2, then calls `steer()`.
- The old implementation demonstrably returns a version 2-normalized queued payload while the provider still receives the version 1 system prompt.
- After the fix, both caller-visible queued payload and provider-visible steer message use the version 1 parser; version 2 `prepare()` remains unused.
- A replacement parser that would reject the raw payload cannot reject steer for the already-active compatible version 1 attempt.
- An approval resume attempt keeps the Profile parser captured by resume admission when the Registry changes during its next Model turn.
- Existing steer coordination, message identity, shutdown/reentrant validation, approval resume and Profile Version tests remain green.
- Focused tests, `bun run verify`, applicable `bun run pack:smoke`, protected-file audit and independent review pass before acceptance.

## Out of scope

- durable follow-up payload re-admission across Profile replacement;
- hot migration or restart of an active Invocation onto a new Profile;
- NeuroBook catalog generation, watcher, UI or compiled artifact policy;
- durable steer, cross-process queueing, external exactly-once or Outbox behavior.

## Evidence and acceptance

- Public transformation red was `0 pass / 1 fail / 1 assertion`: the running request retained `system-v1`, while caller-visible and provider-visible steer payloads were normalized by v2.
- The final public suite covers cross-version replacement, same-version replacement rejection, approval resume binding and active-parser rejection before queue/event/durable-message side effects. The single file is `4/0/4`; the affected seven-file suite is `47/0/199`.
- Mutation checks restored the old Registry lookup (`0/3/3`), changed only the resume registration path (`2 pass / 1 fail`) and swallowed the active parser error (`3 pass / 1 fail`). All mutations were reverted.
- Final `bun run verify` is `288 pass / 0 fail / 1360 assertions` across 44 test files with typecheck and build passing.
- Final `bun run pack:smoke` prepack is also `288/0/1360`; the 109-file tarball is 115.9 kB / 553.1 kB unpacked, and Bun plus Node ESM consumers pass.
- During final status verification, two complete runs each produced a different one-off JSONL/Windows timing failure. The exact failing tests passed focused reruns, a six-file JSONL predecessor chain passed `47/0/287`, and stress loops passed restart-follow-up `500/0/4500`, heartbeat sharing `20/0/60` and crash phases `2/0/50`. No stable red loop or production-code causal link was found, so no unrelated code or timeout change was admitted; the subsequent complete test, verify and package-prepack runs all passed `288/0/1360`.
- Final production-correctness, test-sensitivity and API/domain-contract reviews of the post-fix frozen bundle each returned `No P0/P1/P2 findings.`

The decision is therefore accepted only for process-local steer admission on a running standalone Harness attempt. Durable follow-up re-admission and host integrations remain separate work.
