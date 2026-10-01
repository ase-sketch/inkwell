import type {ChapterSnapshotDto} from "nbook/shared/dto/chapter-snapshot.dto";
import type {ChapterSnapshotDiffDto} from "nbook/shared/dto/chapter-snapshot.dto";

/**
 * 章节快照（时光机）的界面投影（M7）。
 *
 * 这里只做「一条历史事实 → 作者能看懂的一行字」的纯映射，不碰 Vue：
 * 这条快照叫什么、什么时候打的、内容还能不能取、能不能看差异 / 能不能还原、
 * 确认框怎么说、差异区怎么讲——全部收敛在本模块，组件只负责渲染，测试直接测这些口径。
 *
 * 三条已定口径（改这里等于改契约，务必同步测试）：
 * - 标题：作者起了名就显示名字（备注），没起名才用拍摄时间兜底（如「9月29日 14:30」）。
 * - 时间：与 M5 演进同一口径（刚刚／今天 HH:mm／昨天 HH:mm／M月D日 HH:mm／跨年带年份）。
 * - 降级：restorable = false 时「看差异」「还原」一律置灰，并如实说「这一版的内容已经找不回来了」，
 *   不让作者点进去看一片空白；diff 的安全分支（敏感路径 / 超限 / 不可取）各有各的人话说法。
 *
 * 界面上绝不出现版本编号、时间线、哈希、会话编号这类工程词——entryId 只在本模块内部当作请求参数使用。
 */

/** 组件侧把 vue-i18n 的 t 适配成本模块要求的形状。 */
export type SnapshotTranslate = (key: string, params?: {[key: string]: string | number}) => string;

/** 快照列表里的一行（作者看到的那一整块）。 */
export type ChapterSnapshotRow = Readonly<{
    /** 稳定渲染 key。 */
    key: string;
    /** 快照编号：看差异 / 还原时用它向服务端要内容，界面不直接展示。 */
    snapshotId: number;
    /** 列表主标题：作者备注优先，否则按拍摄时间兜底。 */
    title: string;
    /** 副标题：人话时间（如「今天 14:30」）。 */
    time: string;
    /** 这一版的内容现在还能不能取到。false 时看差异 / 还原都置灰。 */
    restorable: boolean;
    /** 内容取不到时的一行说明（restorable = true 时为 null）。 */
    unavailableHint: string | null;
    /** 能不能看它和当前正文（或另一快照）的差异。 */
    viewable: boolean;
    /** 能不能一键还原到这一版。 */
    restorableAction: boolean;
}>;

/** 字符串字段的防御式取值：非字符串或全空白一律当没有。 */
const readText = (value: unknown): string => typeof value === "string" ? value.trim() : "";

/** 两位补零。 */
const pad = (value: number): string => String(value).padStart(2, "0");

/** 是不是同一天（本地时区）。 */
function sameDay(left: Date, right: Date): boolean {
    return left.getFullYear() === right.getFullYear()
        && left.getMonth() === right.getMonth()
        && left.getDate() === right.getDate();
}

/**
 * 人话时间。
 *
 * 口径：一分钟内「刚刚」；同一天「今天 HH:mm」；前一天「昨天 HH:mm」；
 * 同年「M月D日 HH:mm」；跨年「YYYY年M月D日 HH:mm」。
 * 时间戳读不出来时退回原样字符串，不让整行消失。
 */
export function snapshotTime(createdAt: string, now: Date, t: SnapshotTranslate): string {
    const at = new Date(createdAt);
    if (Number.isNaN(at.getTime())) {
        return readText(createdAt);
    }
    const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    if (now.getTime() - at.getTime() < 60_000 && at.getTime() <= now.getTime()) {
        return t("ide.chapterSnapshot.timeJustNow");
    }
    if (sameDay(at, now)) {
        return t("ide.chapterSnapshot.timeToday", {time: clock});
    }
    const yesterday = new Date(now.getTime());
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameDay(at, yesterday)) {
        return t("ide.chapterSnapshot.timeYesterday", {time: clock});
    }
    const monthDay = t("ide.chapterSnapshot.timeMonthDay", {
        month: at.getMonth() + 1,
        day: at.getDate(),
        time: clock,
    });
    return at.getFullYear() === now.getFullYear()
        ? monthDay
        : t("ide.chapterSnapshot.timeFullDate", {year: at.getFullYear(), monthDay});
}

/**
 * 列表主标题：作者起了名就用名字，没起名才按拍摄时间兜底。
 *
 * 兜底口径与拍板稿一致（如「9月29日 14:30」），跨年才带年份。
 */
export function snapshotTitle(snapshot: ChapterSnapshotDto, t: SnapshotTranslate, now: Date): string {
    const note = readText(snapshot.note);
    if (note) {
        return note;
    }
    const at = new Date(snapshot.createdAt);
    if (Number.isNaN(at.getTime())) {
        return t("ide.chapterSnapshot.titleUnnamed");
    }
    const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
    const monthDay = t("ide.chapterSnapshot.timeMonthDay", {
        month: at.getMonth() + 1,
        day: at.getDate(),
        time: clock,
    });
    return at.getFullYear() === now.getFullYear()
        ? monthDay
        : t("ide.chapterSnapshot.timeFullDate", {year: at.getFullYear(), monthDay});
}

/**
 * 把一条快照投影成列表的一行。
 *
 * now 用于算「今天／昨天」，测试注入固定值避免依赖真实时钟。
 * restorable = false 时，看差异与还原一并置灰并给出人话说明。
 */
export function snapshotRow(snapshot: ChapterSnapshotDto, t: SnapshotTranslate, now: Date): ChapterSnapshotRow {
    const restorable = snapshot.restorable === true;
    return {
        key: String(snapshot.id),
        snapshotId: snapshot.id,
        title: snapshotTitle(snapshot, t, now),
        time: snapshotTime(snapshot.createdAt, now, t),
        restorable,
        unavailableHint: restorable ? null : t("ide.chapterSnapshot.contentGone"),
        viewable: restorable,
        restorableAction: restorable,
    };
}

/** 整个列表 → 若干行；顺序沿用服务端给的顺序（最近打的在最前）。 */
export function snapshotRows(
    snapshots: readonly ChapterSnapshotDto[] | null | undefined,
    t: SnapshotTranslate,
    now: Date,
): ChapterSnapshotRow[] {
    return (snapshots ?? []).map((snapshot) => snapshotRow(snapshot, t, now));
}

/**
 * 差异区该显示什么。
 *
 * 判别联合四个分支必须穷举：available 出内容，blocked / too_large / unavailable 各自说人话，
 * 任何一个都不假设「一定有正文」。
 */
export type SnapshotDiffView = Readonly<{
    /** 能不能渲染 SharedDiffEditor。 */
    comparable: boolean;
    /** comparable = true 时的两侧正文。 */
    original: string;
    modified: string;
    /** 不能比对时的一行说明（warning / muted 两档由 tone 表达）。 */
    message: string | null;
    /** 说明的语气：null 表示没有说明。 */
    tone: "warning" | "muted" | null;
}>;

const EMPTY_DIFF: SnapshotDiffView = Object.freeze({
    comparable: false,
    original: "",
    modified: "",
    message: null,
    tone: null,
});

/** 还没取差异时的空状态：调用方不必自己判 null。 */
export function emptySnapshotDiffView(): SnapshotDiffView {
    return EMPTY_DIFF;
}

/**
 * 安全 diff 契约 → 界面能渲染的差异视图。
 *
 * - available：出正文，可比对。
 * - blocked（敏感路径）：警示语气，如实说为什么不显示内容。
 * - too_large：警示语气，说这一版太大，这里放不下完整对比。
 * - unavailable：弱语气，如实说正文已不可得。
 * 未来契约新增分支时（TypeScript 会在这里报错），宁可少说也不把机器词甩给作者。
 */
export function snapshotDiffView(
    diff: ChapterSnapshotDiffDto | null | undefined,
    t: SnapshotTranslate,
): SnapshotDiffView {
    if (!diff) {
        return EMPTY_DIFF;
    }
    switch (diff.status) {
        case "available":
            return {comparable: true, original: diff.original, modified: diff.modified, message: null, tone: null};
        case "blocked":
            return {comparable: false, original: "", modified: "", message: t("ide.chapterSnapshot.diffBlocked"), tone: "warning"};
        case "too_large":
            return {comparable: false, original: "", modified: "", message: t("ide.chapterSnapshot.diffTooLarge"), tone: "warning"};
        case "unavailable":
            return {comparable: false, original: "", modified: "", message: t("ide.chapterSnapshot.diffUnavailable"), tone: "muted"};
        default:
            return {
                comparable: false,
                original: "",
                modified: "",
                message: t("ide.chapterSnapshot.diffUnavailable"),
                tone: "muted",
            };
    }
}

/**
 * 还原确认框的话。
 *
 * 说人话三件事：还原到哪一章的哪一版、还原后会怎样、后悔了怎么回去。
 * hasUnsavedChanges 为真时追加一句提醒——还原会丢弃当前未保存的修改（作者确认过再点）。
 */
export function snapshotRestoreConfirm(
    chapterTitle: string,
    row: ChapterSnapshotRow,
    hasUnsavedChanges: boolean,
    t: SnapshotTranslate,
): string {
    const base = t("ide.chapterSnapshot.restoreConfirm", {chapter: chapterTitle, snapshot: row.title});
    return hasUnsavedChanges ? `${base} ${t("ide.chapterSnapshot.restoreConfirmDirty")}` : base;
}

/** 还原完成的通知文案：说清还原到哪一版、以及可以反悔回去。 */
export function snapshotRestoreSuccess(chapterTitle: string, row: ChapterSnapshotRow, t: SnapshotTranslate): string {
    return t("ide.chapterSnapshot.restoreSuccess", {chapter: chapterTitle, snapshot: row.title});
}
