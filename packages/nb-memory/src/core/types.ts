/**
 * 领域核心类型。
 *
 * 双时间轴（ADR 0005，对齐 graphiti 的 bi-temporal）：
 * - `tick`：**摄入序 / 叙事推进序**（transaction time）。宿主发放的全序整数，
 *   **永远单调**，是知识边界（as-of）的权威。任何记录都必须有。
 * - `instant`：**故事时间**（event / valid time）。自世界零点起的秒数，
 *   由宿主经 CalendarPort 从人读串解析而来。**可回退**——倒叙、插叙、回忆
 *   章节的 tick 递增而 instant 后退，这正是必须双轴的原因。可为空。
 * - `time`：故事时间的**人读原文标记**（如「第三天下午」）。抽取期原样保留，
 *   仅供展示与回流，**不可比较**，不参与任何过滤与排序。
 *
 * 两种 as-of 查询语义不同且都成立：
 * - `asOfTick`   =「叙事推进到这里时（该视角）知道多少」→ 知识边界
 * - `asOfInstant`=「故事时间的这一刻，世界是什么样」→ 世界状态
 *
 * happening / state 二分（工作假设 C）：
 * - happening（Fact）：发生过就永远发生过，append-only 永不失效；
 * - state（StateEntry）：可变认知，带失效语义，由状态层承载。
 */

/**
 * as-of 坐标：查询要回到的时点。两轴独立、同为 AND。
 * - 只给 `tick`    → 知识边界口径（叙事推进到这里时知道多少）
 * - 只给 `instant` → 世界状态口径（故事时间的这一刻世界什么样）
 * - 两者都给       → 两轴同时约束
 * - 两者都空       → 当前（全知）
 *
 * **给了某轴而记录缺该轴坐标时一律判为不可见**：无法安放的记录宁可漏召回，
 * 也不能泄漏进它可能并不属于的时间窗口。
 */
export interface AsOf {
    tick?: number;
    instant?: bigint;
}

/** 扩展字段值：刻意只允许扁平标量（ADR 0005 D3） */
export type FactMetaValue = string | number | boolean;

/**
 * 事实扩展字段：群聊 speaker/channel、角色视角下的可信度标记等。
 * 只允许扁平标量——过滤谓词要能用等值/集合表达，且要能直接映射成
 * SQLite 生成列；开放嵌套结构会退化成无人负责的垃圾场。
 * 宿主**声明过**的 key 可参与检索过滤，未声明的 key 只存不滤（ADR 0005 D4）。
 */
export type FactMeta = Record<string, FactMetaValue>;

/** 一条 episode：摄入的原始叙事单元（append-only；语义层可由其重放重建） */
export interface Episode {
    id: string;
    tick: number;
    /** 故事时间（秒）；为空表示来源未提供或宿主未配 Calendar */
    instant?: bigint;
    /** 故事时间的人读原文标记；为空表示来源未提供 */
    time?: string;
    /** 来源标注（如 "chapter:03" / "report"） */
    source: string;
    text: string;
}

/** 一条 happening 事实 */
export interface Fact {
    id: string;
    tick: number;
    /** 故事时间（秒）；为空表示来源未提供 */
    instant?: bigint;
    /** 故事时间的人读原文标记；为空表示来源未提供 */
    time?: string;
    text: string;
    /**
     * 归一后的关键主体 id（工作假设 D/F）：≥2 个 id 的事实本身就是一条「边」。
     * 次要主体不归一，字面留在 text 靠检索召回。
     * 空数组 = 未涉及关键主体，或尚未消解（消解异步化时新事实先落空）。
     */
    subjectIds: string[];
    /** 来源 episode id；为空表示事实由宿主直接上报（facts 模式） */
    episodeId?: string;
    /** 扩展字段；为空表示宿主未提供 */
    meta?: FactMeta;
}

/**
 * 关键主体别名（工作假设 B）：sinceTick 起才知道该别名指向此主体；
 * as-of 在此之前视作两实体。
 *
 * 「何时得知同一性」是认知事件，因此**双轴**：上帝视角关心 sinceTick
 * （读者何时知道），角色视角关心 sinceInstant（角色在故事时间的何时知道）。
 */
export interface SubjectAlias {
    alias: string;
    sinceTick: number;
    /** 故事时间轴上得知同一性的时点；为空表示来源未提供 */
    sinceInstant?: bigint;
}

/** 关键主体注册表条目 */
export interface Subject {
    id: string;
    /** 类型词汇与 World Engine schema 同源（开放字符串，推荐 character/faction/item 等） */
    type: string;
    /** 当前主名称 */
    name: string;
    aliases: SubjectAlias[];
    /** 一行本体描述（这是什么）；显式更新，不做滚动 summary */
    ontology: string;
    /** ontology 最后更新时点 */
    ontologyTick: number;
    /** ontology 最后更新的故事时间；为空表示来源未提供 */
    ontologyInstant?: bigint;
    /** 登记时点：as-of 查询在此之前该主体不可见 */
    registeredTick: number;
    /** 登记时点的故事时间；为空表示来源未提供 */
    registeredInstant?: bigint;
}

/** 状态层条目 */
export interface StateEntry {
    id: string;
    subjectId: string;
    /** 状态主题（如 "住处"、"与小雪的关系"） */
    topic: string;
    /** 当前认知内容 */
    view: string;
    sinceTick: number;
    /** 生效的故事时间；为空表示来源未提供 */
    sinceInstant?: bigint;
    /** 失效时点；为空表示仍然有效 */
    invalidatedAtTick?: number;
    /** 失效的故事时间；为空表示仍然有效或来源未提供 */
    invalidatedAtInstant?: bigint;
}
