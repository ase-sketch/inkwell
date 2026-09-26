import {createError} from "h3";
import {
    afterStateHash,
    beforeStateHash,
    type TimelineEntry,
    type WorkspaceHistory,
} from "@notnotype/nb-history";
import {JsonlSessionRepository} from "nbook/server/agent/session/session-repo";
import {runtimePathsFromEnv} from "nbook/server/runtime/paths/runtime-paths";
import {
    readWorkspaceHistoryDiff,
    type WorkspaceHistoryDiffMode,
} from "nbook/server/workspace-history/history-diff";
import type {WorkspaceHistoryAgentAttributionDto} from "nbook/shared/dto/workspace-history.dto";
import type {
    WorkspaceHistoryDiffDto,
    WorkspaceHistoryTimelineDto,
    WorkspaceHistoryTimelineEntryDto,
} from "nbook/shared/dto/workspace-history.dto";

/**
 * 条目「演进」时间线的读取、归因解析与安全 diff 组装（M5）。
 *
 * 三条纪律：
 * - 版本事实一律来自 nb-history 既有 API（timeline / beforeStateHash / afterStateHash / textDiff），
 *   宿主不另起一套版本推断；authorization 由调用方的 Project handles 守卫负责。
 * - agent 归因里历史库只记 sessionId（模块侧恒为 string）。会话标题在服务端解析一次；
 *   会话已删除或读不出来时降级为「查不到」，绝不因此让整条时间线打不开。
 * - diff 的安全分支（敏感路径 / 超限 / 正文不可取）仍由 readWorkspaceHistoryDiff 一处承担，
 *   与收件箱 diff 共用同一条边界，安全分支不携带正文。
 */

/** 默认取多少条：作者打开一个条目详情，看到的是一段有界的历史，不是全量账本。 */
export const WORKSPACE_HISTORY_TIMELINE_DEFAULT_LIMIT = 50;

/** 单次请求的条数上限：长期高频编辑的文件不该把响应撑爆。 */
export const WORKSPACE_HISTORY_TIMELINE_MAX_LIMIT = 200;

/** 时间线读取所需的 history 最小面。 */
type TimelineHistory = Pick<WorkspaceHistory, "timeline">;

/**
 * 读取单个条目的演进时间线（**降序：最近一次在最前**）。
 *
 * 降序理由：作者打开详情第一眼要回答「这条设定最近一次被谁改成了什么样」，
 * 最新一条必须落在首屏；展开某次修改的前后差异也是从最近往回看更自然。
 * nb-history 的 timeline 是升序，反转只在这里做一次，消费者不再各转各的。
 * followRenames：条目目录被改名后，历史仍跟着「当前叫这个路径的文件」走。
 */
export async function readWorkspaceHistoryTimeline(input: {
    history: TimelineHistory;
    path: string;
    limit?: number;
}): Promise<{path: string; timeline: TimelineEntry[]}> {
    const timeline = await input.history.timeline(input.path, {
        followRenames: true,
        limit: normalizeTimelineLimit(input.limit),
    });
    return {path: input.path, timeline: timeline.slice().reverse()};
}

/** 归一化条数上限：非法入参（NaN / 负数 / 小数）回落默认值，超过上限钳到上限。 */
function normalizeTimelineLimit(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return WORKSPACE_HISTORY_TIMELINE_DEFAULT_LIMIT;
    }
    return Math.min(Math.floor(value), WORKSPACE_HISTORY_TIMELINE_MAX_LIMIT);
}

/**
 * 解析时间线上全部 agent 条目的会话归因（会话标题 + Profile 键）。
 *
 * 会话真相是 workspace/.nbook/agent/sessions/<id>.jsonl；标题会被 session_update 覆盖，
 * 因此必须走 repo.summary(snapshot)，只读 header 会拿到改名前的旧标题。
 * 同一 sessionId 一次请求内只查一次（一场访谈常改同一个条目好几处）。
 * 仓库构造只保存 Workspace Root，不建立会话写入面的 Store capability——
 * 读历史不该依赖会话 Store 是否就绪。
 */
export async function resolveTimelineAgentAttributions(
    timeline: readonly TimelineEntry[],
    options?: {repo?: JsonlSessionRepository},
): Promise<Map<string, WorkspaceHistoryAgentAttributionDto>> {
    const sessionIds = collectAgentSessionIds(timeline);
    const attributions = new Map<string, WorkspaceHistoryAgentAttributionDto>();
    if (sessionIds.size === 0) {
        return attributions;
    }
    const repo = options?.repo ?? new JsonlSessionRepository(runtimePathsFromEnv().workspaceRoot);
    for (const raw of sessionIds) {
        attributions.set(raw, await resolveOneAttribution(repo, raw));
    }
    return attributions;
}

/** 时间线里出现过的 agent 会话 id（保持原字符串形态，它就是历史库里的键）。 */
function collectAgentSessionIds(timeline: readonly TimelineEntry[]): Set<string> {
    const sessionIds = new Set<string>();
    for (const item of timeline) {
        const actor = item.entry.actor;
        if (actor.kind === "agent") {
            sessionIds.add(actor.sessionId);
        }
    }
    return sessionIds;
}

/**
 * 单个会话的归因。
 *
 * 会话编号不合法（历史库被外部改坏 / 未来换形态）或会话文件不存在、损坏，
 * 一律降级成「查不到这次对话」——界面显示纯文本，而不是让整块演进打不开。
 */
async function resolveOneAttribution(
    repo: JsonlSessionRepository,
    raw: string,
): Promise<WorkspaceHistoryAgentAttributionDto> {
    const sessionId = Number(raw);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
        return {sessionId: null, title: null, profileKey: null, sessionExists: false};
    }
    try {
        const summary = repo.summary(await repo.readSession(sessionId));
        return {
            sessionId,
            title: readText(summary.title),
            profileKey: readText(summary.profileKey),
            sessionExists: true,
        };
    } catch {
        return {sessionId, title: null, profileKey: null, sessionExists: false};
    }
}

/** 文本归一化：非字符串或全空白一律当没有。 */
function readText(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const trimmed = value.trim();
    return trimmed || null;
}

/**
 * 把时间线投影成跨端 DTO，并把 agent 归因接上去。
 *
 * bodyAvailable 如实透传：某一侧快照不可取（超限 / 二进制 / 已被保留策略清理）时，
 * 界面据此不给「展开差异」入口，而不是让作者点进去看一个空白。
 */
export function toWorkspaceHistoryTimelineDto(input: {
    path: string;
    timeline: readonly TimelineEntry[];
    attributions: ReadonlyMap<string, WorkspaceHistoryAgentAttributionDto>;
}): WorkspaceHistoryTimelineDto {
    return {
        path: input.path,
        entries: input.timeline.map((item) => toTimelineEntryDto(item, input.attributions)),
    };
}

function toTimelineEntryDto(
    item: TimelineEntry,
    attributions: ReadonlyMap<string, WorkspaceHistoryAgentAttributionDto>,
): WorkspaceHistoryTimelineEntryDto {
    const actor = item.entry.actor;
    return {
        id: item.entry.id,
        occurredAt: item.entry.occurredAt,
        actorKind: actor.kind,
        actorDetail: actorDetail(actor),
        operationType: item.entry.operation.type,
        bodyAvailable: {
            before: item.bodyAvailable.before,
            after: item.bodyAvailable.after,
        },
        diffAvailable: isDiffAvailable(item),
        agent: actor.kind === "agent"
            ? attributions.get(actor.sessionId) ?? {sessionId: null, title: null, profileKey: null, sessionExists: false}
            : null,
    };
}

/**
 * 这次修改能否展开前后差异。
 *
 * 一侧 hash 为 null = 那一侧文件不存在（新建前 / 删除后），diff 侧按空文本处理，照样有差异可看；
 * 因此只有「该侧内容存在过、快照却不可取」才是不可展开——那正是 bodyAvailable = false
 * 且该侧 hash 非 null 的组合。哈希由 nb-history 的既有投影给出，这里不自己读库。
 */
function isDiffAvailable(item: TimelineEntry): boolean {
    const op = item.entry.operation;
    return sideAvailable(beforeStateHash(op), item.bodyAvailable.before)
        && sideAvailable(afterStateHash(op), item.bodyAvailable.after);
}

/** 该侧可参与 diff：文件本就不存在（hash 为 null），或快照仍可取。 */
function sideAvailable(hash: string | null, bodyAvailable: boolean): boolean {
    return hash === null || bodyAvailable;
}

/** 归因细节：agent = sessionId、system = source、user = userId；external 无细节。 */
function actorDetail(actor: TimelineEntry["entry"]["actor"]): string | null {
    switch (actor.kind) {
        case "user":
            return actor.userId;
        case "agent":
            return actor.sessionId;
        case "system":
            return actor.source;
        case "external":
            return null;
    }
}

/**
 * 读取时间线上某一条变更的「修改前 → 修改后」安全 diff。
 *
 * 授权口径：entryId 必须出现在该 path 的时间线里才可读取——不接受裸 snapshot hash，
 * 外部无法用任何 hash 换取正文。敏感路径与 inline 大小策略由 readWorkspaceHistoryDiff 一处承担。
 * 该次修改的两侧 hash 由 nb-history 的 beforeStateHash / afterStateHash 给出：
 * 一侧为 null 表示「那一侧文件不存在」，diff 侧按空文本处理。
 */
export async function readWorkspaceHistoryEntryDiff(input: {
    history: TimelineHistory & Pick<WorkspaceHistory, "textDiff">;
    path: string;
    entryId: number;
    mode: WorkspaceHistoryDiffMode;
}): Promise<WorkspaceHistoryDiffDto> {
    const timeline = await input.history.timeline(input.path, {followRenames: true});
    const target = timeline.find((item) => item.entry.id === input.entryId);
    if (!target) {
        throw createError({statusCode: 404, message: "这条变更不属于当前条目"});
    }
    return readWorkspaceHistoryDiff({
        history: input.history,
        group: {
            path: input.path,
            baseHash: beforeStateHash(target.entry.operation),
            endHash: afterStateHash(target.entry.operation),
        },
        mode: input.mode,
    });
}
