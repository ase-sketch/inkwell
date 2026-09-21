import {mkdtemp, mkdir, readdir, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";

const packageRoot = resolve(import.meta.dir, "..");

/** 执行消费者 smoke 所需的外部命令，并保留原始输出。 */
async function run(command: string, argumentsValue: readonly string[], cwd: string): Promise<void> {
    const process = Bun.spawn({
        cmd: [command, ...argumentsValue],
        cwd,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
    });
    const exitCode = await process.exited;
    if (exitCode !== 0) {
        throw new Error(`${command} ${argumentsValue.join(" ")} 失败，exitCode=${exitCode}`);
    }
}

/** 从 npm tarball 验证 Bun 和 Node ESM 消费者均不依赖源码 sibling。 */
async function main(): Promise<void> {
    const workspace = await mkdtemp(join(tmpdir(), "neuro-agent-harness-pack-"));
    try {
        const packDirectory = join(workspace, "pack");
        const bunConsumer = join(workspace, "bun-consumer");
        const nodeConsumer = join(workspace, "node-consumer");
        await Promise.all([mkdir(packDirectory), mkdir(bunConsumer), mkdir(nodeConsumer)]);

        const npm = Bun.which("npm");
        const node = Bun.which("node");
        if (!npm || !node) throw new Error("pack smoke 需要 npm 和 Node.js");
        await run(npm, ["pack", "--pack-destination", packDirectory], packageRoot);
        const tarballName = (await readdir(packDirectory)).find((name) => name.endsWith(".tgz"));
        if (!tarballName) throw new Error("npm pack 未生成 tarball");
        const tarball = join(packDirectory, tarballName);

        await writeFile(join(bunConsumer, "package.json"), JSON.stringify({private: true, type: "module"}, null, 4));
        await writeFile(join(bunConsumer, "index.ts"), [
            "import {AbortBoundaryError, CommitWorkflowScheduler, FollowUpDrainTimeoutError, HarnessAdmissionError, InvocationWaitTimeoutError, InvocationWriteFenceError, ModelTurnError, NeuroAgentHarness, SchemaCanonicalValueError, SessionEventHub, createAgentMessageEntryDraft, createReadTool, defineCapability, defineSchema, invocationPartial, invocationResultFromSnapshot, invocationUsage, isModelTurnError, parseSchemaValue, userMessageText, validateParsedSchemaValue} from '@notnotype/neuro-agent-harness';",
            "import {composeContextMessages, mergeContextMessageSections} from '@notnotype/neuro-agent-harness';",
            "import {MemorySessionStore} from '@notnotype/neuro-agent-harness/storage/memory';",
            "import {JsonlLockBusyError, JsonlLockCorruptError, JsonlLockError, JsonlLockIoError, JsonlLockLostError, JsonlSessionStore} from '@notnotype/neuro-agent-harness/storage/jsonl';",
            "import {ScriptedModelRuntime} from '@notnotype/neuro-agent-harness/testing';",
            "import type {AgentAttachmentRef, AgentUserContentBlock, CommitWorkflowSchedulerOptions, CompactSessionOptions, EventSubscriptionCloseReason, ReadCapability, ReadRequest, ReadToolArguments, ReadToolOptions, RetryOptions, SessionEventHubMetrics, SessionEventHubOptions, WaitForFollowUpQueueDrainOptions} from '@notnotype/neuro-agent-harness';",
            "const messageDraft = createAgentMessageEntryDraft({role: 'user', content: 'pack-smoke', timestamp: 0}, {turn: 0});",
            "const turnError = new ModelTurnError('pack-smoke', {usage: {input: 1, output: 1, total: 2}, partial: {content: [{type: 'text', text: 'partial'}]}});",
            "const missingPartial = invocationPartial({entries: []} as never, 'missing');",
            "const projectedResult = invocationResultFromSnapshot({metadata: {sessionId: 1, profileKey: 'p', initial: null, hostContext: {}}, version: 0, status: 'idle', activeLeafId: null, activeInvocationId: null, entries: [], invocations: [{id: 'i1', sessionId: 1, profileKey: 'p', caller: {kind: 'user'}, input: {}, status: 'completed', turnCount: 1, createdAt: 1, finishedAt: 1, terminationReason: 'natural_stop'}]} as never, 'i1');",
            "const readRequest: ReadRequest = {reference: 'opaque://pack-smoke', offset: 0, limit: 1};",
            "const readToolArguments: ReadToolArguments = {reference: 'opaque://pack-smoke', offset: 0, limit: 1};",
            "const readCapability: ReadCapability = {read: async () => ({content: 'ok'})};",
            "const readToken = defineCapability('pack-read');",
            "const readToolOptions: ReadToolOptions<'pack-read'> = {capability: readToken};",
            "const readTool = createReadTool({capability: readToken});",
            "const eventOptions: SessionEventHubOptions = {replayByteLimit: 1024, subscriberQueueLimit: 2, subscriberQueueByteLimit: 1024};",
            "const eventHub = new SessionEventHub(eventOptions);",
            "const eventMetrics: SessionEventHubMetrics = eventHub.metrics(1);",
            "const closeReason: EventSubscriptionCloseReason = 'consumer_closed';",
            "const schedulerOptions: CommitWorkflowSchedulerOptions = {abortGraceMs: 0};",
            "const scheduler = new CommitWorkflowScheduler({name: 'pack-smoke', select: () => null, async run() {}}, schedulerOptions);",
            "const canonicalSchema = defineSchema<{value: number; parsed: true}>({parse(value) { if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.value !== 'number') throw new Error('invalid raw'); return {value: value.value + 1, parsed: true}; }, validateParsed(value) { if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.value !== 'number' || value.parsed !== true) throw new Error('invalid parsed'); return value as {value: number; parsed: true}; }, jsonSchema: {type: 'object'}});",
            "const canonicalValue = parseSchemaValue(canonicalSchema, {value: 1});",
            "const revalidatedCanonicalValue = validateParsedSchemaValue(canonicalSchema, canonicalValue);",
            "if (![CommitWorkflowScheduler, ModelTurnError, NeuroAgentHarness, SchemaCanonicalValueError, SessionEventHub, createAgentMessageEntryDraft, createReadTool, defineCapability, defineSchema, invocationPartial, invocationResultFromSnapshot, invocationUsage, composeContextMessages, mergeContextMessageSections, MemorySessionStore, JsonlSessionStore, JsonlLockError, JsonlLockBusyError, JsonlLockCorruptError, JsonlLockLostError, JsonlLockIoError, ScriptedModelRuntime, messageDraft, turnError, eventHub, eventMetrics, closeReason, scheduler, canonicalValue, revalidatedCanonicalValue, readToken, readTool, readToolArguments, readToolOptions, projectedResult].every(Boolean)) throw new Error('Bun exports 不完整');",
            "if (canonicalValue.value !== 2 || revalidatedCanonicalValue !== canonicalValue) throw new Error('Bun Parsed Value schema 合同不完整');",
            "if (!isModelTurnError(turnError) || turnError.usage?.total !== 2) throw new Error('Bun ModelTurnError usage 合同不完整');",
            "if (turnError.partial?.content[0]?.type !== 'text' || turnError.partial.content[0].text !== 'partial' || missingPartial !== undefined) throw new Error('Bun ModelTurnError partial 合同不完整');",
            "if (projectedResult?.status !== 'completed' || projectedResult?.persistence !== 'confirmed') throw new Error('Bun invocationResultFromSnapshot 合同不完整');",
            "if (![readRequest, readCapability].every(Boolean)) throw new Error('Bun ReadCapability 类型合同不完整');",
            "if (typeof NeuroAgentHarness.prototype.invokeAt !== 'function') throw new Error('Bun invokeAt export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.forkSession !== 'function') throw new Error('Bun forkSession export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.waitForInvocation !== 'function' || typeof InvocationWaitTimeoutError !== 'function') throw new Error('Bun waitForInvocation export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.waitForFollowUpQueueDrain !== 'function' || typeof FollowUpDrainTimeoutError !== 'function') throw new Error('Bun waitForFollowUpQueueDrain export 不完整');",
            "const compactSessionOptions: CompactSessionOptions = {keepRecentTokens: 1};",
            "if (typeof NeuroAgentHarness.prototype.compactSession !== 'function' || !compactSessionOptions) throw new Error('Bun compactSession export 不完整');",
            "const attachmentRef: AgentAttachmentRef = {id: 'a1', mimeType: 'image/png', bytes: 1};",
            "const attachmentBlock: AgentUserContentBlock = {type: 'attachment', attachment: attachmentRef};",
            "const marker = userMessageText({role: 'user', content: [attachmentBlock], timestamp: 0});",
            "const admissionError = new HarnessAdmissionError('pack');",
            "const retryOptions: RetryOptions<number> = {caller: {kind: 'user'}, signal: new AbortController().signal};",
            "const drainOptions: WaitForFollowUpQueueDrainOptions = {timeoutMs: 1};",
            "if (!marker.includes('attachment omitted') || !(admissionError instanceof Error) || admissionError.name !== 'HarnessAdmissionError' || !retryOptions || !drainOptions) throw new Error('Bun ADR-0039/0040/C3 exports 不完整');",
            "if (typeof AbortBoundaryError !== 'function' || typeof InvocationWriteFenceError !== 'function') throw new Error('Bun error class exports 不完整');",
            "await scheduler.dispose();",
            "eventHub.close();",
        ].join("\n"));
        await run(process.execPath, ["add", tarball], bunConsumer);
        await run(process.execPath, ["run", "index.ts"], bunConsumer);

        await writeFile(join(nodeConsumer, "package.json"), JSON.stringify({private: true, type: "module"}, null, 4));
        await writeFile(join(nodeConsumer, "tsconfig.json"), JSON.stringify({
            compilerOptions: {
                target: "ES2022",
                module: "NodeNext",
                moduleResolution: "NodeNext",
                strict: true,
                skipLibCheck: false,
                outDir: "dist",
            },
            include: ["index.mts"],
        }, null, 4));
        await writeFile(join(nodeConsumer, "index.mts"), [
            "import {AbortBoundaryError, CommitWorkflowScheduler, FollowUpDrainTimeoutError, HarnessAdmissionError, InvocationWaitTimeoutError, InvocationWriteFenceError, ModelTurnError, NeuroAgentHarness, SchemaCanonicalValueError, SessionEventHub, createAgentMessageEntryDraft, createReadTool, defineCapability, defineSchema, invocationPartial, invocationResultFromSnapshot, invocationUsage, isModelTurnError, parseSchemaValue, userMessageText, validateParsedSchemaValue} from '@notnotype/neuro-agent-harness';",
            "import {composeContextMessages, mergeContextMessageSections} from '@notnotype/neuro-agent-harness';",
            "import {MemorySessionStore} from '@notnotype/neuro-agent-harness/storage/memory';",
            "import {JsonlLockBusyError, JsonlLockCorruptError, JsonlLockError, JsonlLockIoError, JsonlLockLostError, JsonlSessionStore} from '@notnotype/neuro-agent-harness/storage/jsonl';",
            "import {ScriptedModelRuntime} from '@notnotype/neuro-agent-harness/testing';",
            "import type {AgentAttachmentRef, AgentMessageEntryDraftOptions, AgentUserContentBlock, CommitWorkflowSchedulerOptions, CompactSessionOptions, ContextMessageSections, EventSubscriptionCloseReason, InvocationAnchor, InvocationPartial, InvocationResult, InvokeAtRequest, JsonObject, ModelTurnErrorOptions, ReadCapability, ReadRequest, ReadToolArguments, ReadToolOptions, ResolvedProfile, RetryOptions, SessionEventHubMetrics, SessionEventHubOptions, SessionWritePlan, WaitForFollowUpQueueDrainOptions} from '@notnotype/neuro-agent-harness';",
            "const messageOptions: AgentMessageEntryDraftOptions = {turn: 0};",
            "const messageDraft = createAgentMessageEntryDraft({role: 'user', content: 'pack-smoke', timestamp: 0}, messageOptions);",
            "const turnErrorOptions: ModelTurnErrorOptions = {usage: {input: 1, output: 1, total: 2}, partial: {content: [{type: 'text', text: 'partial'}]}};",
            "const turnError = new ModelTurnError('pack-smoke', turnErrorOptions);",
            "const partial: InvocationPartial = {turn: 1, content: [{type: 'text', text: 'partial'}]};",
            "const missingPartial = invocationPartial({entries: []} as never, 'missing');",
            "const projectedResult = invocationResultFromSnapshot({metadata: {sessionId: 1, profileKey: 'p', initial: null, hostContext: {}}, version: 0, status: 'idle', activeLeafId: null, activeInvocationId: null, entries: [], invocations: [{id: 'i1', sessionId: 1, profileKey: 'p', caller: {kind: 'user'}, input: {}, status: 'completed', turnCount: 1, createdAt: 1, finishedAt: 1, terminationReason: 'natural_stop'}]} as never, 'i1');",
            "const sections: ContextMessageSections = {history: []};",
            "const anchor: InvocationAnchor = {version: 0, activeLeafId: null};",
            "const request: InvokeAtRequest<number> = {sessionId: 1, payload: null, anchor, signal: new AbortController().signal};",
            "const readRequest: ReadRequest = {reference: 'opaque://pack-smoke', offset: 0, limit: 1};",
            "const readToolArguments: ReadToolArguments = {reference: 'opaque://pack-smoke', offset: 0, limit: 1};",
            "const readCapability: ReadCapability = {read: async () => ({content: 'ok'})};",
            "const readToken = defineCapability('pack-read');",
            "const readToolOptions: ReadToolOptions<'pack-read'> = {capability: readToken};",
            "const readTool = createReadTool({capability: readToken});",
            "const plan: SessionWritePlan<number> = {target: 1, expectedActiveLeafId: null, cause: 'pack-smoke', operations: []};",
            "const result: InvocationResult<number> = {sessionId: 1, invocationId: 'pack-smoke', status: 'failed', persistence: 'unknown', usage: {input: 0, output: 0, total: 0}, partial};",
            "const eventOptions: SessionEventHubOptions = {replayByteLimit: 1024, subscriberQueueLimit: 2, subscriberQueueByteLimit: 1024};",
            "const eventHub = new SessionEventHub(eventOptions);",
            "const eventMetrics: SessionEventHubMetrics = eventHub.metrics(1);",
            "const closeReason: EventSubscriptionCloseReason = 'consumer_closed';",
            "const schedulerOptions: CommitWorkflowSchedulerOptions = {abortGraceMs: 0};",
            "const scheduler = new CommitWorkflowScheduler({name: 'pack-smoke', select: () => null, async run() {}}, schedulerOptions);",
            "const legacyResolvedProfile: ResolvedProfile<number, JsonObject, JsonObject> = {key: 'legacy', version: 1, facets: [], requiredCapabilities: [], hooks: [], parseInitial: (value) => value, parsePayload: (value) => value, parseOutput: (value) => value, prepare: async () => ({systemPrompt: 'legacy', modelConfig: {}})};",
            "const canonicalSchema = defineSchema<{value: number; parsed: true}>({parse(value) { if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.value !== 'number') throw new Error('invalid raw'); return {value: value.value + 1, parsed: true}; }, validateParsed(value) { if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.value !== 'number' || value.parsed !== true) throw new Error('invalid parsed'); return value as {value: number; parsed: true}; }, jsonSchema: {type: 'object'}});",
            "const canonicalValue = parseSchemaValue(canonicalSchema, {value: 1});",
            "const revalidatedCanonicalValue = validateParsedSchemaValue(canonicalSchema, canonicalValue);",
            "if (![CommitWorkflowScheduler, ModelTurnError, NeuroAgentHarness, SchemaCanonicalValueError, SessionEventHub, createAgentMessageEntryDraft, createReadTool, defineCapability, defineSchema, invocationPartial, invocationResultFromSnapshot, invocationUsage, composeContextMessages, mergeContextMessageSections, MemorySessionStore, JsonlSessionStore, JsonlLockError, JsonlLockBusyError, JsonlLockCorruptError, JsonlLockLostError, JsonlLockIoError, ScriptedModelRuntime, messageDraft, turnError, sections, request, readRequest, readCapability, readToken, readTool, readToolArguments, readToolOptions, plan, result, eventHub, eventMetrics, closeReason, scheduler, legacyResolvedProfile, canonicalValue, revalidatedCanonicalValue, projectedResult].every(Boolean)) throw new Error('Node exports 不完整');",
            "if (canonicalValue.value !== 2 || revalidatedCanonicalValue !== canonicalValue) throw new Error('Node Parsed Value schema 合同不完整');",
            "if (!isModelTurnError(turnError) || turnError.usage?.total !== 2) throw new Error('Node ModelTurnError usage 合同不完整');",
            "if (turnError.partial?.content[0]?.type !== 'text' || turnError.partial.content[0].text !== 'partial' || result.partial?.turn !== 1 || missingPartial !== undefined) throw new Error('Node ModelTurnError partial 合同不完整');",
            "if (projectedResult?.status !== 'completed' || projectedResult?.persistence !== 'confirmed') throw new Error('Node invocationResultFromSnapshot 合同不完整');",
            "if (typeof NeuroAgentHarness.prototype.invokeAt !== 'function') throw new Error('Node invokeAt export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.forkSession !== 'function') throw new Error('Node forkSession export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.waitForInvocation !== 'function' || typeof InvocationWaitTimeoutError !== 'function') throw new Error('Node waitForInvocation export 不完整');",
            "if (typeof NeuroAgentHarness.prototype.waitForFollowUpQueueDrain !== 'function' || typeof FollowUpDrainTimeoutError !== 'function') throw new Error('Node waitForFollowUpQueueDrain export 不完整');",
            "const compactSessionOptions: CompactSessionOptions = {keepRecentTokens: 1};",
            "if (typeof NeuroAgentHarness.prototype.compactSession !== 'function' || !compactSessionOptions) throw new Error('Node compactSession export 不完整');",
            "const attachmentRef: AgentAttachmentRef = {id: 'a1', mimeType: 'image/png', bytes: 1};",
            "const attachmentBlock: AgentUserContentBlock = {type: 'attachment', attachment: attachmentRef};",
            "const marker = userMessageText({role: 'user', content: [attachmentBlock], timestamp: 0});",
            "const admissionError = new HarnessAdmissionError('pack');",
            "const retryOptions: RetryOptions<number> = {caller: {kind: 'user'}, signal: new AbortController().signal};",
            "const drainOptions: WaitForFollowUpQueueDrainOptions = {timeoutMs: 1};",
            "if (!marker.includes('attachment omitted') || !(admissionError instanceof Error) || admissionError.name !== 'HarnessAdmissionError' || !retryOptions || !drainOptions) throw new Error('Node ADR-0039/0040/C3 exports 不完整');",
            "if (typeof AbortBoundaryError !== 'function' || typeof InvocationWriteFenceError !== 'function') throw new Error('Node error class exports 不完整');",
            "await scheduler.dispose();",
            "eventHub.close();",
        ].join("\n"));
        await run(npm, ["install", "--save-exact", tarball], nodeConsumer);
        await run(node, [join(packageRoot, "node_modules", "typescript", "bin", "tsc"), "--project", "tsconfig.json"], nodeConsumer);
        await run(node, [join(nodeConsumer, "dist", "index.mjs")], nodeConsumer);
    } finally {
        await rm(workspace, {recursive: true, force: true});
    }
}

await main();
