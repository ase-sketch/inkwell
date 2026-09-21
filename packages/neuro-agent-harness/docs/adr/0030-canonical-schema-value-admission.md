# ADR-0030: Canonical Schema Value Admission

- Status: Accepted
- Date: 2026-08-11
- Task: [`01-harness-decoupling`](../tasks/01-harness-decoupling/README.md)

## Context

`ValueSchema.parse()` returns a typed JSON value and is allowed to normalize its input. Harness currently also calls the same parser when reusing values that are already parsed and durable:

- Session initial data is parsed at creation and again before every `Profile.prepare()`;
- direct Invocation payload is parsed before `startInvocation` and again before prepare;
- durable follow-up payload is parsed before queue commit, again before `startInvocation`, and again before prepare;
- retry passes a prior durable `InvocationRecord.input` through the parser again;
- approval resume passes durable input through prepare's parser again;
- `SessionEntryCodec.parse()` reparses the value previously normalized by `draft()`.

Validate-and-return schemas hide this behavior. A non-idempotent parser can silently produce `parse(parse(raw))`, mix two Profile revisions across a queued follow-up, or reject its own durable output after queue admission. NeuroBook's current TypeBox path returns the validated input unchanged, so its behavior does not prove that standalone `ValueSchema` transformations are safe.

## Decision

- `ValueSchema.parse(raw)` is the external ingress decoder. Its result is a **Parsed Value**.
- Schema callbacks are pure and deterministic. Provider Tool arguments remain raw in the transcript and `ApprovalRequest`; approval prompt and resumed execution may independently decode that same raw value across process recovery.
- Session metadata `initial`, `InvocationRecord.input`, `QueuedInvocationInput.payload` and codec-produced entry payloads store Parsed Values. They remain authoritative and are not raw caller input.
- A Parsed Value may be checked again, but validation must return a JSON-equal value. Harness never replaces a durable Parsed Value with the validator's return value.
- `ValueSchema` gains an optional `validateParsed(value)` callback for schemas whose `parse()` is not idempotent. It validates the parsed representation and returns the same JSON value.
- `defineSchema({parse, validateParsed, jsonSchema})` is the explicit transformation-schema form. The existing `defineSchema(parse, jsonSchema)` form remains for validate-and-return and idempotent schemas.
- Without `validateParsed`, Harness falls back to `parse(value)` and requires a JSON-equal result. Existing validate-and-return and idempotent-normalizer schemas therefore remain compatible; an unstable parser fails closed instead of silently applying another transformation.
- Profile initial/payload parsing, Tool argument parsing, output parsing and codec draft creation verify that the produced value satisfies the parsed-value contract before admitting side effects.
- Direct invoke parses raw payload once. Follow-up consume and retry validate their durable Parsed Value instead of parsing it again. The current Profile may accept a parsed value produced by an older compatible implementation; rejection happens before queue consume or Invocation start.
- Approval resume validates durable initial/input before its owner claim, Capability, prepare, Tool and Provider work.
- `ResolvedProfile.prepare()` validates already-parsed initial/payload and passes those exact values to the typed Profile.

This changes no durable JSON shape. It adds a backward-compatible optional schema method and makes the existing normalized durable values explicit. The newly exposed `ResolvedProfile.validateInitial/validatePayload` hooks remain optional so externally constructed pre-ADR-0030 `ResolvedProfile` values continue to compile; Harness applies the same parse-plus-equality fallback when they are absent.

## Alternatives

- **Require all parsers to be idempotent**: rejected because transformation-capable validation libraries commonly decode one representation into another; forcing a decoder to also accept its output conflates two schemas.
- **Persist raw caller input and parse at each future admission**: rejected because it changes durable/public queue semantics and can retain fields or secrets that normalization deliberately removed.
- **Trust every persisted value without validation**: rejected because Profile replacement, legacy data and third-party Store corruption would reach prepare/Tool side effects without a schema check.
- **Split every schema into required `decode` and `validate` methods**: deferred because it would break every existing consumer. Optional `validateParsed` gives transformation schemas an explicit path while retaining validate-and-return compatibility.

## Acceptance gate

- A public direct-invoke tracer proves Session initial, durable Invocation input, Profile prepare payload and provider-visible user input contain one normalization only.
- A durable follow-up tracer proves caller-visible queue payload, queue projection, new Invocation input, prepare payload and provider input remain the same Parsed Value.
- JSONL restart preserves and consumes that value without another transformation.
- retry reuses the prior durable input without another transformation.
- approval resume keeps the same initial/input and rejects invalid durable parsed values before durable claim and Tool/Provider side effects.
- `SessionEntryCodec` validates a durable parsed payload without transforming it again.
- A schema without `validateParsed` that changes its own parsed value fails before durable admission; validate-and-return schemas remain compatible.
- Packed Bun and Node ESM consumers compile and execute the object-form schema and parsed-value helpers from the package root.
- Focused tests, `bun run verify`, `bun run pack:smoke`, protected-file audit and independent production/API/test-sensitivity review pass before acceptance.

## Out of scope

- storing raw caller payloads, schema migrations or automatic canonical-value migration;
- untrusted plugin sandboxing or generic Store record validation;
- Profile implementation serialization or closure fingerprints;
- NeuroBook/Cosmos product migration, HTTP/SSE Transport, Job/Lease/Outbox or external exactly-once.

## Evidence and acceptance

- The public suite covers direct invoke, durable follow-up consume, JSONL restart, retry, approval resume, codec projection, object-form `defineSchema`, unstable fallback fail-closed, current Profile initial incompatibility, Tool dispatch/approval admission, receiver preservation, compatible/incompatible Profile replacement, transformed output persistence, approval raw-arguments re-decode and pre-ADR-0030 `ResolvedProfile` runtime compatibility.
- The six-file focused suite is `43 pass / 0 fail / 138 assertions`; final `bun run verify` is `305 pass / 0 fail / 1395 assertions` across 45 test files with typecheck and build passing.
- Final `bun run pack:smoke` prepack is also `305/0/1395`; the 109-file tarball is 118.8 kB / 564.5 kB unpacked, and Bun plus Node ESM consumers execute the object-form schema and parsed-value helpers from the package root while strict Node TypeScript compiles a pre-ADR-0030 `ResolvedProfile` shape.
- The first full-gate failure was a pre-existing JSONL anchor test assertion that rejected a legal `version 0→1 / leaf null→null` diagnostic. The assertion was corrected to require a leaf change only for versions newer than `anchor.version + 1`; production Harness/Store code was not modified. A 200-run diagnostic loop observed five identical legal conflicts before the fix and the corrected loop then passed 50/50.
- Final production-correctness, API/domain-contract and test-sensitivity reviews of the post-fix frozen bundle each returned `No P0/P1/P2 findings.`; the API review's Bun pack tracer generic P2 and the test-sensitivity review's four sensitivity P2s were fixed and re-reviewed clean.

The decision is therefore accepted only for standalone Core canonical-value admission. Schema migration, host integration and third-party Store/Transport behavior remain separate work.
