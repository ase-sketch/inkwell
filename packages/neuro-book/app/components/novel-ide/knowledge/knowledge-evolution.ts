import type {
    WorkspaceHistoryTimelineEntryDto,
} from "nbook/shared/dto/workspace-history.dto";

/**
 * 条目「演进」区块的界面投影（M5）。
 *
 * 这里只做「历史事实 → 作者能看懂的一行字」的纯映射，不碰 Vue：
 * 所有说人话的口径（时间怎么说、谁改的怎么说、改了什么怎么说、能不能点开看差异、点了跳到哪）
 * 都收敛在本模块，组件只负责渲染，测试直接测这些口径。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - 归因：agent 带会话档案键（interview. 前缀）时是「访谈」，否则是「对话」；会话已删除则
 *   退回「某场访谈／某次对话」且不可点。用户的编辑器保存、收件箱操作都算「你手动编辑」。
 * - 时间：人话是「刚刚／今天 HH:mm／昨天 HH:mm／M月D日 HH:mm／YYYY年M月D日」，跨年才带年份。
 * - 可展开：diffAvailable 为 false（快照超限 / 二进制 / 已被保留策略清理）时不给展开入口，
 *   而不是让作者点开看一片空白。
 *
 * 界面上绝不出现会话编号、快照 hash、操作类型名这类工程词。
 */

/** 组件侧把 vue-i18n 的 t 适配成本模块要求的形状。 */
export type EvolutionTranslate = (key: string, params?: {[key: string]: string | number}) => string;

/** 一行变更的归因：显示成什么、能不能点、点了跳哪。 */
export type EvolutionActor = Readonly<{
    /** 归因文案，如「访谈《新书设定》」。 */
    label: string;
    /** 能否跳到对应会话；会话已删除或不是 AI 改动时为 false。 */
    clickable: boolean;
    /** 跳转用的会话编号；不可点时一定是 null。 */
    sessionId: number | null;
}>;

/** 演进时间线上的一行。 */
export type EvolutionRow = Readonly<{
    /** 稳定渲染 key：历史条目编号在文件内唯一。 */
    key: string;
    /** 历史条目编号，展开差异时用它向服务端要这一条的前后对比。 */
    entryId: number;
    /** 人话时间，如「9月25日 22:41」。 */
    time: string;
    /** 归因。 */
    actor: EvolutionActor;
    /** 人话操作，如「修改」「改名」。 */
    operation: string;
    /** 能不能展开看前后差异。 */
    expandable: boolean;
}>;

/** 跳转参数：界面拿它去打开某场对话；不可点时 caller 不该发起跳转。 */
export type EvolutionSessionJump = Readonly<{
    sessionId: number;
}>;

/** 会话档案键的访谈前缀；与 AgentChatSurface 的 interview.* 档案族同一口径。 */
const INTERVIEW_PROFILE_PREFIX = "interview.";

/** 六型文件操作 → 作者能看懂的说法。 */
const OPERATION_LABEL_KEYS: Record<string, string> = {
    "file.create": "ide.knowledge.evolution.operationCreate",
    "file.edit": "ide.knowledge.evolution.operationEdit",
    "file.delete": "ide.knowledge.evolution.operationDelete",
    "file.rename": "ide.knowledge.evolution.operationRename",
    "file.revert": "ide.knowledge.evolution.operationRevert",
    "file.restore": "ide.knowledge.evolution.operationRestore",
};

/** 未知操作类型的兜底说法：宁可说「有改动」，也不把 file.xxx 甩给作者。 */
const UNKNOWN_OPERATION_KEY = "ide.knowledge.evolution.operationUnknown";

/** 字符串字段的防御式取值：非字符串或全空白一律当没有。 */
const readText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/**
 * 把一个历史条目投影成演进列表的一行。
 *
 * now 用于算「今天／昨天」，测试注入固定值避免依赖真实时钟。
 */
export function evolutionRow(
    entry: WorkspaceHistoryTimelineEntryDto,
    t: EvolutionTranslate,
    now: Date,
): EvolutionRow {
    return {
        key: String(entry.id),
        entryId: entry.id,
        time: evolutionTime(entry.occurredAt, now, t),
        actor: evolutionActor(entry, t),
        operation: evolutionOperation(entry.operationType, t),
        expandable: entry.diffAvailable === true,
    };
}

/** 整个时间线 → 演进列表；顺序沿用服务端给的顺序（最近一次在最前）。 */
export function evolutionRows(
    entries: readonly WorkspaceHistoryTimelineEntryDto[] | null | undefined,
    t: EvolutionTranslate,
    now: Date,
): EvolutionRow[] {
    return (entries ?? []).map((entry) => evolutionRow(entry, t, now));
}

/**
 * 归因人话化。
 *
 * - agent：有会话标题时带上书名号标题；访谈与对话按档案键前缀分开说。会话已删除时
 *   只剩「某场访谈／某次对话」，并不可点。
 * - user：一律「你手动编辑」——编辑器保存与收件箱接受/还原在作者眼里都是自己做的。
 * - system：宿主自动写入，说「系统」，并带上子系统名（如模板同步）。
 * - external：对账发现的外部改动，无法归因到具体来源，如实说「外部改动」。
 */
export function evolutionActor(entry: WorkspaceHistoryTimelineEntryDto, t: EvolutionTranslate): EvolutionActor {
    switch (entry.actorKind) {
        case "agent": {
            const agent = entry.agent;
            const isInterview = readText(agent?.profileKey).startsWith(INTERVIEW_PROFILE_PREFIX);
            const title = readText(agent?.title);
            const sessionId = agent?.sessionExists === true ? agent.sessionId ?? null : null;
            const key = isInterview
                ? (title ? "ide.knowledge.evolution.actorInterview" : "ide.knowledge.evolution.actorInterviewUnknown")
                : (title ? "ide.knowledge.evolution.actorDialogue" : "ide.knowledge.evolution.actorDialogueUnknown");
            return {
                label: title ? t(key, {title}) : t(key),
                clickable: sessionId !== null,
                sessionId,
            };
        }
        case "user":
            return {label: t("ide.knowledge.evolution.actorUser"), clickable: false, sessionId: null};
        case "system": {
            const source = readText(entry.actorDetail);
            return {
                label: source
                    ? t("ide.knowledge.evolution.actorSystemWithSource", {source})
                    : t("ide.knowledge.evolution.actorSystem"),
                clickable: false,
                sessionId: null,
            };
        }
        case "external":
            return {label: t("ide.knowledge.evolution.actorExternal"), clickable: false, sessionId: null};
        default:
            // 历史库将来新增归因类型：宁可少说，也不把机器词甩给作者。
            return {label: t("ide.knowledge.evolution.actorUnknown"), clickable: false, sessionId: null};
    }
}

/** 操作人话化：未登记的取值走兜底说法，不显示 file.xxx。 */
export function evolutionOperation(operationType: string, t: EvolutionTranslate): string {
    return t(OPERATION_LABEL_KEYS[readText(operationType)] ?? UNKNOWN_OPERATION_KEY);
}

/**
 * 点归因时的跳转参数；不可点（会话已删除 / 不是 AI 改动）时返回 null。
 * 界面据此决定渲染成按钮还是纯文本。
 */
export function evolutionSessionJump(actor: EvolutionActor): EvolutionSessionJump | null {
    return actor.clickable && actor.sessionId !== null
        ? {sessionId: actor.sessionId}
        : null;
}

/**
 * 人话时间。
 *
 * 口径：一分钟内「刚刚」；同一天「今天 HH:mm」；前一天「昨天 HH:mm」；
 * 同年「M月D日 HH:mm」；跨年「YYYY年M月D日 HH:mm」。
 * 时间戳读不出来（历史库被改坏 / 字段缺失）时退回原样字符串，不让整行消失。
 */
export function evolutionTime(occurredAt: string, now: Date, t: EvolutionTranslate): string {
    const at = new Date(occurredAt);
    if (Number.isNaN(at.getTime())) {
        return readText(occurredAt);
    }
    const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    if (now.getTime() - at.getTime() < 60_000 && at.getTime() <= now.getTime()) {
        return t("ide.knowledge.evolution.timeJustNow");
    }
    if (sameDay(at, now)) {
        return t("ide.knowledge.evolution.timeToday", {time: clock});
    }
    const yesterday = new Date(now.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(at, yesterday)) {
        return t("ide.knowledge.evolution.timeYesterday", {time: clock});
    }
    const monthDay = t("ide.knowledge.evolution.timeMonthDay", {month: at.getMonth() + 1, day: at.getDate(), time: clock});
    return at.getFullYear() === now.getFullYear()
        ? monthDay
        : t("ide.knowledge.evolution.timeFullDate", {year: at.getFullYear(), monthDay});
}

/** 是不是同一天（本地时区）。 */
function sameDay(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

/** 两位补零。 */
function pad(value: number): string {
    return String(value).padStart(2, "0");
}
