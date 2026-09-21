/**
 * nb-history 核心契约类型。
 *
 * 设计原则:用判别联合让非法状态不可表示——actor 的 id 字段、file 操作的
 * hash 字段存在性都由变体锁死;repo 层在「行 → 类型」映射时对非法行抛错。
 */

/** 操作主体:谁做了这次操作。非法组合(如 user 却带 sessionId)不可表示。 */
export type OperationActor =
    | {kind: "user"; userId: string}          // 人类用户(编辑器保存、收件箱操作)
    | {kind: "agent"; sessionId: string}      // AI 会话(以会话为主体粒度)
    | {kind: "system"; source: string}        // 宿主平台自动写入(模板同步、初始化脚本等);source 标识子系统
    | {kind: "external"};                     // 对账发现的未登记变更(外部编辑器、脚本),无法归因

/**
 * 文件操作(v1 全部操作类型)。各变体 hash 字段的存在性由类型锁死:
 * - create 无 before(此前文件不存在);delete 无 after(此后不存在);edit 前后都有。
 * - rename 只表示改名,内容不变(改名 + 改内容 = rename 与 edit 两条日志)。
 * - revert:用户在收件箱把文件还原到「已接受基线」。
 * - restore:恢复任意历史版本(含删除找回)。
 */
export type FileOperation =
    | {type: "file.create"; path: string; afterHash: string}
    | {type: "file.edit"; path: string; beforeHash: string; afterHash: string}
    | {type: "file.delete"; path: string; beforeHash: string}
    | {type: "file.rename"; fromPath: string; toPath: string; contentHash: string}
    | {
          type: "file.revert"; path: string;
          /** 还原动作发生前的当前内容;null = 当时文件不存在(收件箱段以 delete 结尾) */
          beforeHash: string | null;
          /** 还原到的基线内容;null = 基线是「文件不存在」(收件箱段以 create 开头),还原即删除 */
          afterHash: string | null;
          /** 被撤销的日志条目 id(该文件收件箱段的全部条目) */
          revertedEntryIds: number[];
      }
    | {
          type: "file.restore"; path: string;
          /** null = 恢复时文件不存在(删除找回);非 null = 覆盖现有内容 */
          beforeHash: string | null;
          afterHash: string;
          /** 内容来源条目 */
          sourceEntryId: number;
      };

/** 日志条目信封。v1 只有 FileOperation;信封形态为将来 settings.* / ui.* 操作预留扩展位。 */
export type OperationLogEntry = {
    /** SQLite 自增主键,全局单调递增——所有游标 / 接受位点比较的基准 */
    id: number;
    /** ISO-8601 UTC */
    occurredAt: string;
    actor: OperationActor;
    operation: FileOperation;
};

/** 保留策略与快照上限配置。全部参数可注入,宿主集成时接自己的配置系统。 */
export type HistoryConfig = {
    /** 超过此字节数的文件只记事件不存快照 body(该版本不可 diff / 恢复) */
    maxSnapshotBytes: number;
    /** 窗口天数:窗口内条目全量保留 */
    retentionFullDays: number;
    /** true = 窗口外每文件每自然日(UTC)保留末条;false = 窗口外全删(仍受保护规则约束) */
    keepDailyLastAfterWindow: boolean;
};

export const DEFAULT_HISTORY_CONFIG: HistoryConfig = {
    maxSnapshotBytes: 2 * 1024 * 1024,
    retentionFullDays: 90,
    keepDailyLastAfterWindow: true,
};

/** WorkspaceHistory.open 的选项。 */
export type OpenOptions = {
    /** 历史库文件路径(不存在则建库建表);独立于宿主其他数据库 */
    databasePath: string;
    /**
     * 逻辑路径 → 磁盘路径的映射,模块所有落盘 / 读盘操作经它解析。
     * 缺省 = 原样返回(path 即磁盘路径,如绝对路径)。
     * 宿主有自己的路径语义(如相对某根)时注入自己的解析函数;
     * 日志里记录的始终是**调用方传入的 path 字符串**,模块不改写。
     */
    resolvePath?: (path: string) => string;
    config?: Partial<HistoryConfig>;
    /** 时钟注入(保留策略与测试依赖);默认系统时钟 */
    clock?: () => Date;
};

/** 单文件时间线条目。 */
export type TimelineEntry = {
    entry: OperationLogEntry;
    /** followRenames 时该条目发生时的路径 */
    pathAtThatTime: string;
    /**
     * 两侧快照 body 是否仍可取。该侧 hash 本身为 null(内容不存在,如 create 的
     * before 侧)时为 false——「无内容可取」;是否是「文件不存在」由 entry 自身判别。
     */
    bodyAvailable: {before: boolean; after: boolean};
};

/** 收件箱分组(用户审查视图)。 */
export type InboxGroup = {
    /** 现名(rename 已跟随) */
    path: string;
    /** diff 基准 = 接受位点后第一条条目的 before 态;null = 基准是「文件不存在」 */
    baseHash: string | null;
    /** 账面末态(组内最后一条的 after 态);null = 现已删除 */
    endHash: string | null;
    /** 位点以来全部条目(含 user / external 条目,如实归因展示) */
    entries: OperationLogEntry[];
};

/** 条件式收件箱 mutation 的稳定错误码；宿主据此映射 404 / 412 等传输语义。 */
export type HistoryInboxMutationErrorCode = "missing" | "stale";

/** 会话未见变更分组。 */
export type UnseenGroup = {
    path: string;
    /** 该会话最后见过的状态;null = 上次见时文件不存在 */
    baseHash: string | null;
    /** 组内最后一条未见条目之后的状态;null = 该条是删除 */
    endHash: string | null;
    /** 未见条目(已排除本会话自己产生的) */
    entries: OperationLogEntry[];
    /** 宿主注入提醒成功后 advanceCursor 用 */
    maxEntryId: number;
};

/** 已删除且可找回的文件信息。 */
export type DeletedFileInfo = {
    path: string;
    deletedAt: string;
    lastEntryId: number;
    /** 末版内容快照 body 是否仍可取(可取才能 restore) */
    recoverable: boolean;
};

/** prune() 执行报告。 */
export type PruneReport = {
    entriesDeleted: number;
    snapshotsDeleted: number;
    /** 近似值:被删快照 body 的字节数合计 */
    bytesFreed: number;
};

/** 显式路径清理报告。用于宿主收紧记账范围后移除不再受管的错误历史。 */
export type PathPurgeReport = {
    entriesDeleted: number;
    acceptancesDeleted: number;
    snapshotsDeleted: number;
    /** 近似值:被删快照 body 的字节数合计 */
    bytesFreed: number;
};

/** 文本 diff 结果。任一侧 body 不可用时返回明确标记而非抛错(R13)。 */
export type TextDiffResult =
    | {
          available: true;
          /** diff 包 diffLines 的输出 */
          changes: Array<{value: string; added?: boolean; removed?: boolean; count?: number}>;
          beforeText: string;
          afterText: string;
      }
    | {
          available: false;
          /** before-missing / after-missing = 该侧快照 body 未保留;binary = 任一侧是二进制 */
          reason: "before-missing" | "after-missing" | "binary";
      };

/** 模块统一错误类型,message 面向宿主开发者(中文)。 */
export class HistoryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "HistoryError";
    }
}

/** 收件箱目标不存在或客户端 revision 已过期。 */
export class HistoryInboxMutationError extends HistoryError {
    constructor(readonly code: HistoryInboxMutationErrorCode, message: string) {
        super(message);
        this.name = "HistoryInboxMutationError";
    }
}

/**
 * 操作的 before 态内容 hash(该操作发生前文件内容)。
 * null = 操作前文件不存在。rename 内容不变,before 态即 contentHash。
 */
export function beforeStateHash(op: FileOperation): string | null {
    switch (op.type) {
        case "file.create": return null;
        case "file.edit": return op.beforeHash;
        case "file.delete": return op.beforeHash;
        case "file.rename": return op.contentHash;
        case "file.revert": return op.beforeHash;
        case "file.restore": return op.beforeHash;
    }
}

/**
 * 操作的 after 态内容 hash(该操作发生后文件内容)。
 * null = 操作后文件不存在(delete,或 revert 还原到「不存在」基线)。
 */
export function afterStateHash(op: FileOperation): string | null {
    switch (op.type) {
        case "file.create": return op.afterHash;
        case "file.edit": return op.afterHash;
        case "file.delete": return null;
        case "file.rename": return op.contentHash;
        case "file.revert": return op.afterHash;
        case "file.restore": return op.afterHash;
    }
}

/** 操作发生时文件所在的路径(rename 取 toPath,即操作后的名字)。 */
export function operationPath(op: FileOperation): string {
    return op.type === "file.rename" ? op.toPath : op.path;
}
