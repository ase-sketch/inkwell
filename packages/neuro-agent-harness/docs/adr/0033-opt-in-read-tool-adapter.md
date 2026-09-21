# ADR-0033: Opt-in Read Tool Adapter

- Status: Accepted
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

ADR-0006 deliberately accepted only a host-neutral `ReadCapability` shape and rejected a default filesystem-backed `read` Tool. That boundary remains correct, but consumers currently repeat the same adapter code:

- define a `reference`/optional `offset`/optional `limit` argument schema;
- require an explicitly supplied `CapabilityToken`;
- call `ReadCapability.read()`;
- map `ReadResult.content` to Tool content and `provenance`/`truncated`/`nextOffset` to Tool details.

The repetition makes the common read path harder to discover without proving that the Core owns paths, workspace roots or authorization.

## Decision

- Add an explicit `createReadTool({capability, name?, description?})` factory.
- The caller supplies the `CapabilityToken`; the factory never creates a global token, registers a Tool, opens a Provider or reads a filesystem.
- The factory exposes a minimal provider-neutral argument shape: required string `reference`, optional numeric `offset` and `limit`. It does not impose offset origin, integer/range, path, URI, workspace or permission semantics.
- The factory maps `ReadResult.content` to `ToolResult.content` and preserves defined `provenance`, `truncated` and `nextOffset` in `ToolResult.details`.
- Capability/provider failures continue through the existing Tool error path. Approval, custom argument constraints and alternative result presentation remain available through a hand-written Tool.

This is an opt-in Tool Adapter, not the default `read` Tool rejected by ADR-0006 A1.

## Alternatives

- **Keep every consumer's hand-written adapter**: rejected; it repeats a stable, host-neutral mapping and increases drift between consumers.
- **Register a global read token or default Tool**: rejected; it would make authorization and Tool visibility a Core policy.
- **Put path/range validation in Core**: rejected; offset units, path/URI meaning and permission policy belong to the host Provider/Tool schema.
- **Make ReadCapability return AgentMessage**: rejected; Capability returns host resource facts and stays independent of model transcript representation.

## Acceptance gate

- Factory requires an explicit capability token and yields a valid ToolDefinition;
- provider reference/offset/limit are forwarded without Core path semantics;
- content/details mapping preserves all optional ReadResult facts;
- provider failure becomes ordinary Tool error;
- root/package Bun and Node ESM consumers compile/use the factory;
- focused/full/package gate and production/API-domain/test-sensitivity review pass.

## Evidence and acceptance

- `tests/read-tool-factory.test.ts` has 3 public regressions covering full details mapping/custom metadata, basic schema rejection and EOF empty-details mapping, and ordinary provider failure.
- Focused Read suite is `5 pass / 0 fail / 30 assertions` including the existing ReadCapability consumer tests.
- Final `bun run verify` is `341 pass / 0 fail / 1469 assertions` across 52 test files with typecheck/build passing.
- Final `bun run pack:smoke` prepack is also `341/0/1469`; the 113-file tarball is 122.1 kB / 578.4 kB unpacked, and Bun plus Node ESM consumers compile/use the factory and its public types.
- Production/API and post-fix test-sensitivity reviews return `No P0/P1/P2 findings.`; the initial test review P2s were addressed with description, empty-details and schema-invalid regressions.

The decision is accepted only for the explicit Capability-bound Tool Adapter. ADR-0006 A1 remains intact: no global token, automatic Tool registration, filesystem or path policy.

## Out of scope

- filesystem, workspace root, symlink, image/binary, bash, edit or path authorization;
- global capability tokens, automatic Profile Tool registration or approval policy;
- changing `ReadRequest` offset units/ranges or `ReadResult` durable redaction rules;
- NeuroBook/Cosmos migration, HTTP/SSE Transport or product read UI.
