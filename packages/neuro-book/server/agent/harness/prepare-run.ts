import type {AppendManySessionEntryDraft, SessionWritePlan} from "nbook/server/agent/session/write-plan";
import type {CustomMessageSessionEntry, NeuroSessionContext, SessionEntryDraft, SessionSnapshot} from "nbook/server/agent/session/types";
import type {StoredAgentMessage} from "nbook/server/agent/messages/stored-types";
import type {PiTraceSegmentKind} from "nbook/server/agent/observability/pi-request-recorder";
import type {PromptPrefixAttribution} from "nbook/server/agent/observability/trace-segments";
import type {RetrievalSummaryDto} from "nbook/shared/dto/agent-retrieval.dto";
import type {ProfileTurnPlan} from "nbook/server/agent/profiles/types";
import {profileStateKey} from "nbook/server/agent/profiles/profile-dsl";
import type {MaterializedProfileTurnContext} from "nbook/server/agent/profiles/profile-turn-context";

export type PrepareRunWritePlanInput = {
    sessionId: number;
    profileKey: string;
    context: NeuroSessionContext;
    prepared: ProfileTurnPlan;
    sessionContextEnabled: boolean;
    /**
     * 本轮 Profile turn context 的物化产物（M2.7a）。
     *
     * 检索明细与 turnContext 标签都只存在于物化结果里（消息体不带任何归因字段），
     * 所以必须显式传进来，不能从 `prepared.appendingMessages` 反查。
     */
    turnContextInsertions?: readonly MaterializedProfileTurnContext["insertions"][number][];
};

/**
 * 把 ProfileTurnPlan 中需要落盘的 prepare 产物编译成 SessionWritePlan。
 *
 * 这个函数不执行写入；真正 append/publish 由 invoke prepareRun 阶段交给 SessionWriteExecutor。
 */
export function compilePrepareRunWritePlan(input: PrepareRunWritePlanInput): SessionWritePlan | undefined {
    const prepareEntries: AppendManySessionEntryDraft[] = [];
    const labels = input.prepared.promptSourceLabels;
    if (input.sessionContextEnabled && input.prepared.historyInitMessages?.length && input.context.messages.length === 0) {
        prepareEntries.push(...input.prepared.historyInitMessages.map((message, index) => customMessageEntry(message, "historySet", labels?.historyInit?.[index])));
    }
    if (input.sessionContextEnabled) {
        const modelContextAppending = input.prepared.modelContextAppendingMessages ?? [];
        const appending = input.prepared.appendingMessages ?? [];
        // 归因一律按**消息对象引用**绑定，绝不按下标在两个数组之间对齐。
        //
        // 曾经的写法是用同一个 index 同时索引 `appending`（harness 已 merge 注入，长度 = merged）
        // 和 `labels.appending`（DSL 编译产物，长度 = 静态消息数）。两个数组长度不同，注入越多错得越远：
        // 注入会拿走到静态消息的标签，静态消息则整体后移。同理，多条注入共用同一个 appendingIndex，
        // 用 Map<index, insertion> 还会互相覆盖，只剩最后一条。
        //
        // `mergeProfileTurnContextMessages` 是按引用把 `insertion.message` 放进 merged 数组的，
        // 所以引用查找既准确又不受下标语义影响。`buildPromptPrefixAttribution` 早就用同样的引用口径，
        // 这里只是与它对齐。
        const injections = new Map<StoredAgentMessage, MaterializedProfileTurnContext["insertions"][number]>();
        for (const insertion of input.turnContextInsertions ?? []) {
            injections.set(insertion.message, insertion);
        }

        const entries: AppendManySessionEntryDraft[] = [];
        let injectionCount = 0;
        const pushAppending = (message: StoredAgentMessage, dslLabels: readonly string[] | null | undefined): void => {
            const injection = injections.get(message);
            if (injection) {
                injectionCount += 1;
                entries.push(customMessageEntry(message, "appending", injection.labels, injection.retrieval));
                return;
            }
            entries.push(customMessageEntry(message, "appending", dslLabels));
        };

        // DSL 静态消息按**消费顺序**取标签：下标只在 DSL 自己的数组内递增，不跨数组复用。
        let modelContextIndex = 0;
        for (const message of modelContextAppending) {
            pushAppending(message, labels?.modelContextAppending?.[modelContextIndex] ?? null);
            modelContextIndex += 1;
        }
        let appendingIndex = 0;
        for (const message of appending) {
            pushAppending(message, labels?.appending?.[appendingIndex] ?? null);
            // 注入消息不属于 DSL 数组，不消耗 DSL 下标——这正是原来错位的来源。
            if (!injections.has(message)) {
                appendingIndex += 1;
            }
        }
        // 注入没能在 merged 数组里按引用命中，说明 prepare 与 merge 用了不同的消息对象；
        // 此时静默继续会把归因挂错，宁可当场炸。
        if (injectionCount !== injections.size) {
            throw new Error(`Profile turn context 注入未能按引用命中 appendingMessages：expected=${String(injections.size)}, matched=${String(injectionCount)}。`);
        }
        prepareEntries.push(...entries);
    }
    for (const write of input.prepared.stateWrites ?? []) {
        assertValidProfileStateWrite(input.profileKey, write);
        prepareEntries.push(write as AppendManySessionEntryDraft);
    }
    if (prepareEntries.length === 0) {
        return undefined;
    }
    return {
        target: {sessionId: input.sessionId},
        cause: "profile.prepare",
        ops: [{
            kind: "appendMany",
            entries: prepareEntries,
        }],
    };
}

/**
 * 计算本次请求 messages 前缀的分区归因（Task 126）。
 *
 * 只描述 prepareRun 当时的数组；同一 invocation 后续 turn 追加的 assistant / toolResult
 * 由消费方按缺省值落入 conversation。
 *
 * 归因用**对象标识**从 snapshot entries 反查，而不是给消息体加字段——消息体会原样发给
 * provider，塞归因等于污染 prompt。`applyCompaction` 按引用保留 `entry.message`，
 * 因此压缩后标识依然成立；它合成的 summary 消息不在表里，自然落入 conversation。
 */
export function buildPromptPrefixAttribution(input: {
    snapshot: SessionSnapshot;
    /** assemblePersistedProfilePromptMessages 的同一份输入。 */
    persistedMessages: readonly StoredAgentMessage[];
    modelContextCount: number;
    appendingCount: number;
    currentUserInputCount: number;
}): PromptPrefixAttribution {
    const sources = new Map<StoredAgentMessage, NonNullable<CustomMessageSessionEntry["promptSource"]>>();
    for (const entry of input.snapshot.entries) {
        if (entry.type === "custom_message" && entry.promptSource) {
            sources.set(entry.message, entry.promptSource);
        }
    }
    // 一条都没有 = 该 session 建于归因功能之前，退化到位置推断（见 legacyPromptSources 的局限说明）。
    const mode: PromptPrefixAttribution["mode"] = sources.size > 0 ? "full" : "legacy";
    if (mode === "legacy") {
        for (const [message, source] of legacyPromptSources(input.snapshot)) {
            sources.set(message, source);
        }
    }

    const kinds: PiTraceSegmentKind[] = [];
    const labels: (readonly string[] | null)[] = [];
    const push = (kind: PiTraceSegmentKind, label: readonly string[] | null): void => {
        kinds.push(kind);
        labels.push(label);
    };

    const historyEnd = input.persistedMessages.length - (input.appendingCount + input.currentUserInputCount);
    for (let index = 0; index < historyEnd; index += 1) {
        const source = sources.get(input.persistedMessages[index]!);
        push(source?.zone === "historySet" ? "historySet" : source ? "appending" : "conversation", source?.labels ?? null);
    }
    for (let index = 0; index < input.modelContextCount; index += 1) {
        push("modelContext", null);
    }
    for (let index = historyEnd; index < historyEnd + input.appendingCount; index += 1) {
        push("appending", sources.get(input.persistedMessages[index]!)?.labels ?? null);
    }
    for (let index = 0; index < input.currentUserInputCount; index += 1) {
        push("currentInput", null);
    }
    return {kinds, labels, mode};
}

/**
 * 旧 session 的位置推断归因。
 *
 * 依据：`compilePrepareRunWritePlan` 只在 `context.messages.length === 0` 时写 HistorySet，
 * 因此首条真实 `message` 之前的那段连续 `custom_message` 必定是首轮 prepare 的产物，
 * 之后出现的 `custom_message` 必定是后续轮次的 AppendingSet。
 *
 * **已知局限**：首轮的 AppendingSet 提醒和 HistorySet 写在同一批、同样排在首条用户消息之前，
 * 没有标签就分不开，会被一并计入 historySet。调用方据此把 mode 标成 legacy，由 UI 披露。
 */
function legacyPromptSources(snapshot: SessionSnapshot): Map<StoredAgentMessage, NonNullable<CustomMessageSessionEntry["promptSource"]>> {
    const inferred = new Map<StoredAgentMessage, NonNullable<CustomMessageSessionEntry["promptSource"]>>();
    let seenRealMessage = false;
    for (const entry of snapshot.entries) {
        if (entry.type === "message") {
            seenRealMessage = true;
            continue;
        }
        if (entry.type === "custom_message" && entry.visibleToModel) {
            inferred.set(entry.message, {zone: seenRealMessage ? "appending" : "historySet"});
        }
    }
    return inferred;
}

/**
 * 构造一条 prepare 写入的 custom_message entry。
 *
 * zone 恒写入——即使没有具名 labels，「这条是 AppendingSet 产物」本身就是归因信息，
 * 否则匿名提醒在面板里会和普通对话混在一起。labels 为空时省略。
 */
function customMessageEntry(
    message: StoredAgentMessage,
    zone: "historySet" | "appending",
    labels: readonly string[] | null | undefined,
    retrieval?: RetrievalSummaryDto,
): AppendManySessionEntryDraft {
    return {
        type: "custom_message" as const,
        message,
        visibleToModel: true,
        promptSource: {zone, ...(labels?.length ? {labels} : {})},
        // 检索明细走独立字段而不并进 promptSource：它有自己的一等结构（条目标题/类目/命中词），
        // 混进扁平标签串就又要靠解析字符串取回。
        ...(retrieval ? {retrieval} : {}),
    };
}

/**
 * profile prepare 只能写自己的 profile state，不能成为任意 session mutation 入口。
 */
export function assertValidProfileStateWrite(profileKey: string, write: SessionEntryDraft): void {
    if (write.type !== "custom" || write.key !== profileStateKey(profileKey)) {
        throw new Error(`profile ${profileKey} stateWrites 只允许写 ${profileStateKey(profileKey)} custom entry。`);
    }
}
