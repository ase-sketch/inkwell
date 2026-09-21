/**
 * 小说记忆模型 v4 · 数据结构 spike
 *
 * 这是 `memory-model-v4.md` 第 3、5、6 节的机器可读形态。定位与该文档一致：
 * 全新模型，不复用 `packages/nb-memory/` 的类型，不受其既有决策约束。
 * 本文件不是业务源码，不导出给任何产品模块使用。
 *
 * v2 版本（`Individual` / `Fact` / `Episode` / `storyAfter`）已整份替换。
 * 换掉的理由见 v4 第 10 节那张对照表，最要紧的一条是：v2 的 `Fact` 把「槽」和
 * 「值」压成了一个东西，于是只能二选一——要么可导航但会被改写，要么只增不改
 * 但导航不过去。v4 拆开，两边都要。
 *
 * 术语提醒：
 *   Beat    叙述的最小单位，不是戏剧动作的最小单位，也不是产品里的 StoryPromiseBeat
 *   Fact    槽（主体 + 谓词），不是「一件事」，也不是 nb-memory 里同名的东西
 *   披露    一次「说出」。命题（槽 + 值）加上来源与叙述位置
 *   时刻    故事时间上的身份锚。有 id，没有坐标
 */

/* ═══ 基础 ═══════════════════════════════════════════════ */

export type ID = string;

/**
 * 叙述位置。本 spike 是单章数据，所以它就是段号（正文归一化后第 N 行即第 N 段）。
 * 三条时间轴里唯一永远可得的一条，也是默认排序键。
 */
export type Para = number;

/** 来源。通道 + 持有者 + 保留度，三个字段缺一不可（规则 5、6）。 */
export type Channel =
  | 'narrator'          // 叙述者
  | 'speech'            // 角色说出口
  | 'thought'           // 角色心里想
  | 'reader_inference'  // 读者推断。唯一一个不出自文本的通道
  | 'system'            // 系统通知。网文的面板提示，说话人从未出现
  | 'author';           // 作者。故事外的声音，与叙述者是两个人

export type Hedge = 'plain' | 'hedged' | 'suspended';

export interface Source {
  channel: Channel;
  /** 通道是 narrator / system / author / reader_inference 时必须为空。 */
  holder: ID | null;
  hedge: Hedge;
}

export const CHANNELS: Channel[] =
  ['narrator', 'speech', 'thought', 'reader_inference', 'system', 'author'];
export const HEDGES: Hedge[] = ['plain', 'hedged', 'suspended'];
/** 这四个通道没有持有者：叙述者、作者、系统与读者本身都不是故事里的主体。 */
export const HOLDERLESS: Channel[] = ['narrator', 'system', 'author', 'reader_inference'];

export const CHANNEL_ZH: Record<Channel, string> = {
  narrator: '叙述者', speech: '角色说出口', thought: '角色心里想',
  reader_inference: '读者推断', system: '系统通知', author: '作者',
};
export const HEDGE_ZH: Record<Hedge, string> = {
  plain: '直陈', hedged: '带保留', suspended: '文本明确悬置',
};

/* ═══ 正文的结构（第 3 节）═══════════════════════════════ */

export type BeatType = 'paratext' | 'narrative' | 'description' | 'exposition';
export const BEAT_TYPES: BeatType[] = ['paratext', 'narrative', 'description', 'exposition'];
export const BEAT_TYPE_ZH: Record<BeatType, string> = {
  paratext: '故事外', narrative: '叙事', description: '描写', exposition: '说明',
};

export interface Beat {
  id: ID;
  /** 闭区间 [start, end]，段号。全章无空隙无重叠（规则 7）。 */
  paragraphs: [Para, Para];
  type: BeatType;
  /** 多值，不是切分依据——把来源当切分依据会退化成逐段标注。 */
  sources: Source[];
  /** 这段叙述停在故事时间的哪一刻。故事外与说明的 Beat 必须为空。 */
  moment: ID | null;
  /** 一句话说明。给人看的概括，不是披露，不能当证据。 */
  gist: string;
  note?: string;
}

/** 场是 Beat 序列上的一个区间标记，不是章的孩子，也不存时刻——时刻由区间算出来。 */
export interface Scene {
  id: ID;
  /** [首 Beat, 末 Beat]，闭区间。 */
  beats: [ID, ID];
  moment: ID;
  location: string;
  pov: ID;
  /** 叙述漂到别人身上的那几个 Beat。人工标注，见 W8。 */
  povDrift?: ID[];
  gist: string;
}

/* ═══ 时刻（第 5.7 节）═══════════════════════════════════ */

export type Grain = 'point' | 'interval';

/** 有 id，没有坐标。「三年前」不是坐标是称呼，两个「三年前」同不同一走候选同指流程。 */
export interface Moment {
  id: ID;
  grain: Grain;
  /** 只许放绝对时间词（「天元三年春」）。相对词当名字等于存了一条没锚点没来源的时间指示。 */
  label: string | null;
  note?: string;
}

export type MomentPredicate = 'before' | 'after' | 'same' | 'contains' | 'overlaps';
export const MOMENT_PREDICATES: MomentPredicate[] =
  ['before', 'after', 'same', 'contains', 'overlaps'];
export const MOMENT_PREDICATE_ZH: Record<MomentPredicate, string> = {
  before: '早于', after: '晚于', same: '同一', contains: '包含', overlaps: '重叠',
};

/** 锚点为空表示叙述当下，由 `at` 定位。写死成某个时刻只在文本明确这么挂时才允许。 */
export type MomentAnchor = { type: 'moment'; ref: ID } | null;

export interface MomentRelation {
  subject: ID;
  predicate: MomentPredicate;
  anchor: MomentAnchor;
  /** 可空。「后来」有先后没有距离，就不编数字。精度由单位承担，不另设 approx。 */
  offset: { value: number; unit: string } | null;
  at: Para;
  source: Source;
  note?: string;
}

/** 换算成分钟。认不出来的单位返回 null，调用方退回只用先后不用距离。 */
export const UNIT_MINUTES: Record<string, number> = {
  '分钟': 1, '小时': 60, '天': 1440, '周': 10080, '月': 43200, '年': 525600,
};

/* ═══ 记忆的结构（第 5 节）═══════════════════════════════ */

/**
 * 分类标签。来源有二：预制词表 + 梦境追加（具体机制 10 章后定）。
 * 职责：没有父子、不给主体发字段、不能当推理前提（第 5.2 节）。
 * v4.1 新增：可作为 Slot 主语，直接挂谓词（解决 W10 双节点问题）。
 */
export type Category = 'character' | 'item' | 'body' | 'concept' | 'location' | 'organization';
export const CATEGORIES: Category[] = ['character', 'item', 'body', 'concept', 'location', 'organization'];
export const CATEGORY_ZH: Record<Category, string> = {
  character: '人物', item: '物品', body: '身体', concept: '概念', location: '地点', organization: '组织',
};

export interface Kind {
  id: ID;
  name: string;
  /** 粗分类，用于管线内部路由；主体不再直接持有该字段。 */
  category: Category;
  note?: string;
}

/** 主体的引用：Entity 或 Kind。用于 Slot.subject、Scene.pov 等处。 */
export type SubjectRef =
  | { type: 'entity'; id: ID }
  | { type: 'kind'; id: ID };

/**
 * 主体。人物、组织、概念、地点、物品、身体都是主体。
 *
 * `label` 是库内标签，**不是读者知道的名字**——读者知道的名字要用 `displayName()`
 * 在某个叙述位置上求值得到。
 *
 * v4.1：粗分类提升到 Kind.category，Entity 通过披露挂 Kind 继承分类。
 */
export interface Entity {
  id: ID;
  label: string;
  /** 派生、可重建的一段自然语言介绍。必须带阅读位置，否则第一章的检索会泄漏后文。 */
  intro?: Array<{ at: Para; text: string }>;
  note?: string;
}

export type Cardinality = 'single' | 'multi';
export type Volatility = 'low' | 'medium' | 'high';

/** 两个字段都在决定「要不要建槽」和「新值该取代还是并存」。 */
export interface Predicate {
  id: ID;
  name: string;
  cardinality: Cardinality;
  /** 太高就不建槽，留在 Beat 的一句话里（第 5.3 节）。 */
  volatility: Volatility;
  note?: string;
}

/**
 * Fact / 槽。主体 + 谓词，一个可以被填的位置。id 永不变，读到第几章都是同一个节点。
 *
 * v4.1：subject 可以是 Entity 或 Kind（Kind 能直接挂属性，解决 W10 双节点问题）。
 */
export interface Slot {
  id: ID;
  subject: SubjectRef;
  predicate: ID;
  note?: string;
}

export type Value =
  | { t: 'literal'; v: string }
  | { t: 'number'; v: number; unit?: string }
  | { t: 'ref'; id: ID }
  | { t: 'kind'; id: ID }
  /** UNKNOWN = 文本明确留白，与「库里没有这条披露」是两回事。 */
  | { t: 'special'; v: 'UNKNOWN' | 'NONE' };

/**
 * 一次「说出」。只增不改，没有任何原地回写（规则 2）。
 *
 * `slot` 与 `refutes` 二选一：填 `slot` 是往槽里填值；填 `refutes` 是一条反驳，
 * 它的主语是另一条披露。反驳不去改被推翻的那条，「第 k 段确实写了这句」永远为真。
 */
export interface Disclosure {
  id: ID;
  slot?: ID;
  refutes?: ID;
  value: Value;
  source: Source;
  at: Para;
  /** 这条披露说的那件事在哪一刻为真。与它所在 Beat 的时刻是两回事（第 5.7.3 节）。 */
  timeRef: ID | null;
  /** 只有 reader_inference 才有，指向槽而不是指向披露——为了做梦阶段能重跑。 */
  inferredFrom?: ID[];
  note?: string;
}

/* ═══ 库 ═════════════════════════════════════════════════ */

/** 正文结构那一半。`evidences/chapter-01-beats.json` 就是这个形状。 */
export interface BeatsDoc {
  schema: 'nbook.novel-beats/v4-spike';
  chapter: number;
  chapterTitle: string;
  moments: Moment[];
  momentRelations: MomentRelation[];
  beats: Beat[];
  scenes: Scene[];
  findings?: string[];
  [k: string]: unknown;
}

/** 记忆结构那一半。`chapter-01.json` 就是这个形状。 */
export interface MemoryDoc {
  schema: 'nbook.novel-memory/v4-spike';
  chapter: number;
  chapterTitle: string;
  paragraphCount: number;
  kinds: Kind[];
  entities: Entity[];
  predicates: Predicate[];
  slots: Slot[];
  disclosures: Disclosure[];
  findings?: string[];
  [k: string]: unknown;
}

/** 两半合起来的一章。时刻的真源在 BeatsDoc 里，MemoryDoc 只按 id 引用。 */
export interface Chapter {
  chapter: number;
  chapterTitle: string;
  paragraphCount: number;
  kinds: Kind[];
  entities: Entity[];
  predicates: Predicate[];
  slots: Slot[];
  disclosures: Disclosure[];
  moments: Moment[];
  momentRelations: MomentRelation[];
  beats: Beat[];
  scenes: Scene[];
  findings: string[];
}

export function merge(mem: MemoryDoc, beats: BeatsDoc | null): Chapter {
  return {
    chapter: mem.chapter,
    chapterTitle: mem.chapterTitle,
    paragraphCount: mem.paragraphCount,
    kinds: mem.kinds, entities: mem.entities, predicates: mem.predicates,
    slots: mem.slots, disclosures: mem.disclosures,
    moments: beats?.moments ?? [],
    momentRelations: beats?.momentRelations ?? [],
    beats: beats?.beats ?? [],
    scenes: beats?.scenes ?? [],
    findings: [...(mem.findings ?? []), ...(beats?.findings ?? [])],
  };
}

/* ═══ 正文侧的派生（第 6 节：段号落在哪个 Beat 是算出来的）═══ */

export const beatOf = (c: Chapter, p: Para): Beat | undefined =>
  c.beats.find(b => b.paragraphs[0] <= p && p <= b.paragraphs[1]);

export function sceneOf(c: Chapter, p: Para): Scene | undefined {
  const b = beatOf(c, p);
  if (!b) return undefined;
  const idx = c.beats.findIndex(x => x.id === b.id);
  return c.scenes.find(s => {
    const a = c.beats.findIndex(x => x.id === s.beats[0]);
    const z = c.beats.findIndex(x => x.id === s.beats[1]);
    return a >= 0 && z >= 0 && a <= idx && idx <= z;
  });
}

/**
 * 场的参与者是算出来的，不存字段（第 3.5 节第五点）：
 * 区间内 Beat 来源持有者的并集，再并上区间内被披露提到的主体。
 * 第二项不能省——在场但从不说话也不思考的角色只能靠它进来。
 *
 * v4.1：Kind 不是场的参与者，只统计 Entity。
 */
export function participantsOf(c: Chapter, s: Scene): ID[] {
  const a = c.beats.findIndex(x => x.id === s.beats[0]);
  const z = c.beats.findIndex(x => x.id === s.beats[1]);
  if (a < 0 || z < 0) return [];
  const span = c.beats.slice(a, z + 1);
  const lo = span[0].paragraphs[0], hi = span[span.length - 1].paragraphs[1];
  const out = new Set<ID>();
  for (const b of span) for (const src of b.sources) if (src.holder) out.add(src.holder);
  const slots = new Map(c.slots.map(s2 => [s2.id, s2]));
  for (const d of c.disclosures) {
    if (d.at < lo || d.at > hi) continue;
    if (d.source.holder) out.add(d.source.holder);
    const sl = d.slot ? slots.get(d.slot) : undefined;
    if (sl && sl.subject.type === 'entity') out.add(sl.subject.id);
    if (d.value.t === 'ref') out.add(d.value.id);
  }
  return [...out];
}

/* ═══ 时刻求值（第 5.7.4 节：存观测点，算区间）═══════════
   两套推理，分开跑，因为它们的可信度不一样：
     定性  只用断言过的先后关系做传递闭包，一分钱不多算
     定量  把带偏移的关系当成差分约束一起解，得出「至少差多少」
   叙述当下不是时刻，是叙述轴上的一个点。同一章内按段号排序——
   这是本模块唯一一处超出文本明说的假设，`NOW_ASSUMPTION` 把它显式标出来。 */

export const NOW_ASSUMPTION =
  '同一章内，叙述当下按段号单调不减。跨章不作任何假设（见 W9）。';

const nowVar = (at: Para) => `@${at}`;

/** 定性：断言过的 before / after / same 的传递闭包。 */
export function qualitativeOrder(c: Chapter): {
  before: Set<string>;   // "a>b" 表示 a 早于 b
  same: Map<ID, ID>;     // 并查集的代表元
} {
  const nodes = new Set<string>([...c.moments.map(m => m.id)]);
  const edges: Array<[string, string]> = [];
  const same = new Map<ID, ID>();
  const find = (x: ID): ID => (same.get(x) === undefined || same.get(x) === x)
    ? x : (same.set(x, find(same.get(x)!)), same.get(x)!);

  const nows: Para[] = [];
  for (const r of c.momentRelations) {
    const anchor = r.anchor ? r.anchor.ref : nowVar(r.at);
    if (!r.anchor) { nodes.add(anchor); nows.push(r.at); }
    nodes.add(r.subject);
    if (r.predicate === 'before') edges.push([r.subject, anchor]);
    else if (r.predicate === 'after') edges.push([anchor, r.subject]);
    else if (r.predicate === 'same') { same.set(find(r.subject), find(anchor)); }
  }
  // 叙述当下之间按段号排序
  nows.sort((a, b) => a - b);
  for (let i = 1; i < nows.length; i++) edges.push([nowVar(nows[i - 1]), nowVar(nows[i])]);

  const before = new Set<string>();
  const adj = new Map<string, string[]>();
  for (const [a, b] of edges) (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  for (const s of nodes) {
    const seen = new Set<string>([s]);
    const stack = [s];
    while (stack.length) {
      const x = stack.pop()!;
      for (const y of adj.get(x) ?? []) if (!seen.has(y)) { seen.add(y); stack.push(y); before.add(`${s}>${y}`); }
    }
  }
  return { before, same };
}

/**
 * 定量：差分约束。`bound(a, b)` 返回 `x_b − x_a` 已知的下界（分钟），推不出就是 null。
 * 第一章上这套算出来的正是第 5.7.6 节那句「开场白至少比面摊晚 3 分钟」。
 */
export function quantitativeBounds(c: Chapter): Map<string, number> {
  const nodes = new Set<string>(c.moments.map(m => m.id));
  /** cons: x_b − x_a ≥ w */
  const cons: Array<{ a: string; b: string; w: number }> = [];
  const nows: Para[] = [];

  for (const r of c.momentRelations) {
    const anchor = r.anchor ? r.anchor.ref : nowVar(r.at);
    if (!r.anchor) { nodes.add(anchor); nows.push(r.at); }
    nodes.add(r.subject);
    const mins = r.offset ? (UNIT_MINUTES[r.offset.unit] ?? null) : null;
    const d = mins !== null && r.offset ? r.offset.value * mins : null;
    if (r.predicate === 'before') {
      // 主语早于锚点：x_anchor − x_subject ≥ d（有偏移时取等，无偏移只取 ≥ 0）
      cons.push({ a: r.subject, b: anchor, w: d ?? 0 });
      if (d !== null) cons.push({ a: anchor, b: r.subject, w: -d });
    } else if (r.predicate === 'after') {
      cons.push({ a: anchor, b: r.subject, w: d ?? 0 });
      if (d !== null) cons.push({ a: r.subject, b: anchor, w: -d });
    } else if (r.predicate === 'same') {
      cons.push({ a: r.subject, b: anchor, w: 0 });
      cons.push({ a: anchor, b: r.subject, w: 0 });
    }
  }
  nows.sort((a, b) => a - b);
  for (let i = 1; i < nows.length; i++)
    cons.push({ a: nowVar(nows[i - 1]), b: nowVar(nows[i]), w: 0 });

  // 最长路松弛，得到每一对的最紧下界
  const ns = [...nodes];
  const key = (a: string, b: string) => `${a}->${b}`;
  const lo = new Map<string, number>();
  for (const n of ns) lo.set(key(n, n), 0);
  for (const cn of cons) {
    const k = key(cn.a, cn.b);
    lo.set(k, Math.max(lo.get(k) ?? -Infinity, cn.w));
  }
  for (const k of ns) for (const i of ns) for (const j of ns) {
    const ik = lo.get(key(i, k)), kj = lo.get(key(k, j));
    if (ik === undefined || kj === undefined) continue;
    const cur = lo.get(key(i, j)) ?? -Infinity;
    if (ik + kj > cur) lo.set(key(i, j), ik + kj);
  }
  return lo;
}

export type MomentVerdict = 'same' | 'disjoint' | 'undecidable';

/** 闭包算一次就够，不然 relationOf 的两两循环会把它重算上千遍。 */
const orderCache = new WeakMap<Chapter, ReturnType<typeof qualitativeOrder>>();
const cachedOrder = (c: Chapter) => {
  let v = orderCache.get(c);
  if (!v) { v = qualitativeOrder(c); orderCache.set(c, v); }
  return v;
};

/** 第 5.6 节那张表里「时刻可判定相同 / 可判定不相交 / 判不出」这一步。 */
export function compareMoments(c: Chapter, a: ID | null, b: ID | null): MomentVerdict {
  if (a === null && b === null) return 'same';          // 都不系于某一刻
  if (a === null || b === null) return 'undecidable';
  if (a === b) return 'same';
  const { before, same } = cachedOrder(c);
  const rep = (x: ID) => same.get(x) ?? x;
  if (rep(a) === rep(b)) return 'same';
  if (before.has(`${a}>${b}`) || before.has(`${b}>${a}`)) return 'disjoint';
  return 'undecidable';
}

/* ═══ 读者认知（第 5.6 节）═══════════════════════════════ */

export type Relation = 'compete' | 'coexist' | 'succeed' | 'corroborate' | 'candidate' | 'accrue';
export const RELATION_ZH: Record<Relation, string> = {
  compete: '竞争', coexist: '认识论并存', succeed: '接续',
  corroborate: '印证', candidate: '候选同指', accrue: '并列累加',
};

export const valueKey = (v: Value): string =>
  v.t === 'literal' ? `L:${v.v}`
  : v.t === 'number' ? `N:${v.v}${v.unit ?? ''}`
  : v.t === 'ref' ? `R:${v.id}`
  : v.t === 'kind' ? `K:${v.id}`
  : `S:${v.v}`;

/**
 * 表里那五行，加一行。判据在时刻、值、来源通道这三样上。
 *
 * 加的那一行是「并列累加」，第 5.6 节没写：**那张表默认两个值互斥，而互不互斥
 * 由基数决定。** 多值谓词上两个不同的值根本不构成一对关系——「取之不尽的财富」
 * 和「变成萝莉」是她列的两个愿望，不是两个打架的答案。不看基数就照表判，
 * 第一章会凭空判出三处「竞争」。这不是新裁决，是把第 5.3 节已有的基数接进第 5.6 节。
 */
export function relationOf(c: Chapter, x: Disclosure, y: Disclosure): Relation {
  const sameVal = valueKey(x.value) === valueKey(y.value);
  const pred = x.slot ? c.predicates.find(p =>
    p.id === c.slots.find(s => s.id === x.slot)?.predicate) : undefined;
  if (pred?.cardinality === 'multi' && !sameVal) return 'accrue';

  const m = compareMoments(c, x.timeRef, y.timeRef);
  const sameCh = x.source.channel === y.source.channel && x.source.holder === y.source.holder;
  // 读者推断不能当别人的支持（第 5.5 节），所以它永远参与不了印证
  const inf = x.source.channel === 'reader_inference' || y.source.channel === 'reader_inference';
  if (m === 'same' && sameVal && !sameCh) return inf ? 'candidate' : 'corroborate';
  if (m === 'same' && !sameVal && sameCh) return 'compete';
  if (m === 'same' && !sameVal && !sameCh) return 'coexist';
  if (m === 'disjoint' && !sameVal) return 'succeed';
  if (m === 'disjoint' && sameVal) return inf ? 'candidate' : 'corroborate';
  return 'candidate';
}

export interface SlotState {
  slot: Slot;
  /** 当前认为为真的 */
  held: Disclosure[];
  /** 悬而未决的 */
  pending: Disclosure[];
  /** 已被推翻的 */
  refuted: Disclosure[];
  /** 出现过的两两关系，去重。空表示这个槽只有一条披露。 */
  relations: Relation[];
}

/**
 * 读到第 k 段为止，把一个槽求值一遍。五步照第 5.6 节：
 *   1 取 at ≤ k 的全部披露        2 应用反驳
 *   3 按槽分组                    4 用已知的时刻先后排序，推不出的保持并列
 *   5 产出三堆
 */
export function evaluateSlot(c: Chapter, slot: Slot, k: Para): SlotState {
  const pred = c.predicates.find(p => p.id === slot.predicate);
  const all = c.disclosures.filter(d => d.slot === slot.id && d.at <= k);
  const killed = new Set<ID>(
    c.disclosures.filter(d => d.refutes && d.at <= k).map(d => d.refutes!));

  const live = all.filter(d => !killed.has(d.id));
  const refuted = all.filter(d => killed.has(d.id));
  live.sort((a, b) => a.at - b.at);

  const rels = new Set<Relation>();
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++)
      rels.add(relationOf(c, live[i], live[j]));

  const held: Disclosure[] = [];
  const pending: Disclosure[] = [];
  const multi = pred?.cardinality === 'multi';
  for (const d of live) {
    // 带保留的披露不进「为真」那一堆，除非另有一条直陈的印证它
    const propped = d.source.hedge === 'plain' ||
      live.some(o => o !== d && o.source.hedge === 'plain' &&
        valueKey(o.value) === valueKey(d.value));
    // 多值谓词的值互相不排斥；单值谓词才要看关系
    const contested = !multi && live.some(o =>
      o !== d && valueKey(o.value) !== valueKey(d.value) &&
      (relationOf(c, d, o) === 'compete' || relationOf(c, d, o) === 'candidate'));
    if (propped && !contested) held.push(d); else pending.push(d);
  }
  return { slot, held, pending, refuted, relations: [...rels] };
}

/** 读到第 k 段为止，全部槽的求值结果。只保留那时已经有披露的槽。 */
export const readerState = (c: Chapter, k: Para): SlotState[] =>
  c.slots.map(s => evaluateSlot(c, s, k))
    .filter(s => s.held.length || s.pending.length || s.refuted.length);

/** 读到第 k 段为止，某条披露有几处支持（印证它的其它披露）。第 5.6 节「支持数加一」。 */
export const supportOf = (c: Chapter, d: Disclosure, k: Para): Disclosure[] =>
  c.disclosures.filter(o =>
    o.id !== d.id && o.slot === d.slot && o.at <= k &&
    o.source.channel !== 'reader_inference' &&
    relationOf(c, d, o) === 'corroborate');

/**
 * 读到第 k 段为止，读者管这个主体叫什么。
 *
 * 规则：**专名优先，其次叙述者最近一次给的称呼，再其次任何人最早给的称呼。**
 * 中间那一档要限定叙述者，否则第 50 段之后古书会显示成「小破书」——角色随口起的
 * 外号不是读者的默认把手。这一条是查看器的显示口径，不是模型规则。
 */
export function displayName(c: Chapter, e: Entity, k: Para): string {
  const dsOf = (predName: string) => {
    const ids = new Set(c.slots
      .filter(s => s.subject.type === 'entity' && s.subject.id === e.id &&
        c.predicates.find(p => p.id === s.predicate)?.name === predName)
      .map(s => s.id));
    return c.disclosures
      .filter(d => d.slot && ids.has(d.slot) && d.at <= k && d.value.t === 'literal')
      .sort((a, b) => a.at - b.at);
  };
  const lit = (d?: Disclosure) => (d && d.value.t === 'literal' ? d.value.v : null);
  const names = dsOf('专名');
  const appels = dsOf('称呼');
  return lit(names[names.length - 1])
    ?? lit([...appels].reverse().find(d => d.source.channel === 'narrator'))
    ?? lit(appels[0])
    ?? e.label;
}

/** 读到第 k 段为止，这个主体在不在图上。第一条披露就是它的出生位置。 */
export function entityKnownAt(c: Chapter, e: Entity, k: Para): boolean {
  const slotIds = new Set(c.slots.filter(s => s.subject.type === 'entity' && s.subject.id === e.id).map(s => s.id));
  return c.disclosures.some(d =>
    d.at <= k && ((d.slot && slotIds.has(d.slot)) || (d.value.t === 'ref' && d.value.id === e.id)));
}

/** 读到第 k 段为止那一份介绍。没有它，第一章的检索会泄漏后文的专名。 */
export const introAt = (e: Entity, k: Para): string | null =>
  [...(e.intro ?? [])].filter(i => i.at <= k).sort((a, b) => b.at - a.at)[0]?.text ?? null;

/* ═══ 校验 ═══════════════════════════════════════════════ */

export interface Issue {
  level: 'error' | 'warn';
  at: string;
  message: string;
}

export function validate(c: Chapter): Issue[] {
  const out: Issue[] = [];
  const err = (at: string, m: string) => out.push({ level: 'error', at, message: m });
  const warn = (at: string, m: string) => out.push({ level: 'warn', at, message: m });

  const uniq = (name: string, rows: Array<{ id: ID }>) => {
    const seen = new Set<ID>();
    for (const r of rows) {
      if (seen.has(r.id)) err(r.id, `${name} id 重复 -> ${r.id}`);
      seen.add(r.id);
    }
  };
  uniq('kind', c.kinds); uniq('entity', c.entities); uniq('predicate', c.predicates);
  uniq('slot', c.slots); uniq('disclosure', c.disclosures);
  uniq('beat', c.beats); uniq('scene', c.scenes); uniq('moment', c.moments);

  const kinds = new Set(c.kinds.map(k => k.id));
  const ents = new Map(c.entities.map(e => [e.id, e]));
  const preds = new Map(c.predicates.map(p => [p.id, p]));
  const slots = new Map(c.slots.map(s => [s.id, s]));
  const discs = new Map(c.disclosures.map(d => [d.id, d]));
  const moments = new Set(c.moments.map(m => m.id));
  const N = c.paragraphCount;

  const checkSource = (at: string, s: Source | undefined) => {
    if (!s || !s.channel) { err(at, '缺来源。规则 5、6：来源必须一路传到最终回答'); return; }
    if (!CHANNELS.includes(s.channel)) err(at, `未知来源通道 -> ${s.channel}`);
    if (!HEDGES.includes(s.hedge)) err(at, `未知保留度 -> ${s.hedge}`);
    if (HOLDERLESS.includes(s.channel) && s.holder)
      err(at, `通道 ${CHANNEL_ZH[s.channel]} 不该有持有者，却填了 ${s.holder}`);
    if (!HOLDERLESS.includes(s.channel) && !s.holder)
      err(at, `通道 ${CHANNEL_ZH[s.channel]} 必须有持有者`);
    if (s.holder && !ents.has(s.holder)) err(at, `持有者不是已知主体 -> ${s.holder}`);
  };

  /* ── 谓词与槽 ── */
  for (const p of c.predicates) {
    if (!['single', 'multi'].includes(p.cardinality)) err(p.id, `未知基数 -> ${p.cardinality}`);
    if (!['low', 'medium', 'high'].includes(p.volatility)) err(p.id, `未知易变度 -> ${p.volatility}`);
    if (p.volatility === 'high')
      warn(p.id, '易变度是高。第 5.3 节说这种不该建槽，该留在 Beat 的一句话里');
  }
  const pairs = new Set<string>();
  for (const s of c.slots) {
    const subj = s.subject.type === 'entity' ? ents.get(s.subject.id) :
                 s.subject.type === 'kind' ? kinds.has(s.subject.id) : false;
    if (!subj) err(s.id, `主体不存在 -> ${s.subject.type}:${s.subject.id}`);
    if (!preds.has(s.predicate)) err(s.id, `谓词不存在 -> ${s.predicate}`);
    const key = `${s.subject.type}:${s.subject.id}|${s.predicate}`;
    if (pairs.has(key)) err(s.id, `同一对（主体, 谓词）建了两个槽 -> ${key}`);
    pairs.add(key);
    if (!c.disclosures.some(d => d.slot === s.id)) warn(s.id, '槽上一条披露都没有');
  }

  /* ── 披露 ── */
  for (const d of c.disclosures) {
    if (!d.slot === !d.refutes)
      err(d.id, 'slot 与 refutes 必须二选一：填 slot 是往槽里填值，填 refutes 是一条反驳');
    if (d.slot && !slots.has(d.slot)) err(d.id, `槽不存在 -> ${d.slot}`);
    if (d.refutes && !discs.has(d.refutes)) err(d.id, `反驳指向的披露不存在 -> ${d.refutes}`);
    if (d.refutes && discs.get(d.refutes)!.at > d.at)
      err(d.id, '反驳的叙述位置早于被它推翻的那条披露');
    checkSource(d.id, d.source);
    if (!Number.isInteger(d.at) || d.at < 1 || d.at > N)
      err(d.id, `叙述位置越界 -> ${d.at}（本章共 ${N} 段）`);
    if (d.timeRef !== null && !moments.has(d.timeRef))
      err(d.id, `时间指示不是已知时刻 -> ${d.timeRef}`);

    const v = d.value;
    if (v.t === 'ref' && !ents.has(v.id)) err(d.id, `值指向不存在的主体 -> ${v.id}`);
    if (v.t === 'kind' && !kinds.has(v.id)) err(d.id, `值指向不存在的类 -> ${v.id}`);

    const isInf = d.source.channel === 'reader_inference';
    const from = d.inferredFrom ?? [];
    if (isInf && !from.length) err(d.id, '读者推断没有「推断自」');
    if (!isInf && from.length) err(d.id, '不是读者推断，却带了「推断自」');
    for (const s of from) {
      if (!slots.has(s)) { err(d.id, `推断自不是槽 -> ${s}`); continue; }
      // 规则 3：推断不能成为另一条推断的证据
      const backing = c.disclosures.filter(o =>
        o.slot === s && o.source.channel !== 'reader_inference');
      if (!backing.length)
        err(d.id, `推断自的槽 ${s} 上只有推断，没有文本直接给的披露。推断不能成为另一条推断的证据`);
      const first = backing.length ? Math.min(...backing.map(o => o.at)) : Infinity;
      if (first > d.at)
        err(d.id, `推断在第 ${d.at} 段，可它依据的槽 ${s} 要到第 ${first} 段才有披露——读者还没看到前提就知道了结论`);
    }
  }

  /* ── Beat 与场 ── */
  if (c.beats.length) {
    const bs = [...c.beats].sort((a, b) => a.paragraphs[0] - b.paragraphs[0]);
    if (bs[0].paragraphs[0] !== 1) err(bs[0].id, `第一个 Beat 不从第 1 段开始 -> ${bs[0].paragraphs[0]}`);
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.paragraphs[0] > b.paragraphs[1]) err(b.id, '段号区间反了');
      if (!BEAT_TYPES.includes(b.type)) err(b.id, `未知类型 -> ${b.type}`);
      for (const s of b.sources) checkSource(b.id, s);
      if (b.sources.some(s => s.channel === 'reader_inference'))
        err(b.id, '读者推断不该出现在 Beat 上，它只出现在披露上');
      if (b.moment !== null && !moments.has(b.moment)) err(b.id, `时刻引用不存在 -> ${b.moment}`);
      if ((b.type === 'paratext' || b.type === 'exposition') && b.moment !== null)
        err(b.id, `${BEAT_TYPE_ZH[b.type]} 的 Beat 不该有时刻`);
      if (i > 0) {
        const prev = bs[i - 1].paragraphs[1];
        if (b.paragraphs[0] === prev + 1) continue;
        if (b.paragraphs[0] <= prev) err(b.id, `与 ${bs[i - 1].id} 有重叠`);
        else err(b.id, `与 ${bs[i - 1].id} 之间有空隙：第 ${prev + 1}–${b.paragraphs[0] - 1} 段没人管`);
      }
    }
    const last = bs[bs.length - 1].paragraphs[1];
    if (last !== N) err('beats', `Beat 覆盖到第 ${last} 段，正文共 ${N} 段（规则 7：每段必属一个 Beat）`);
  }

  const idx = new Map(c.beats.map((b, i) => [b.id, i]));
  for (const s of c.scenes) {
    const a = idx.get(s.beats[0]), z = idx.get(s.beats[1]);
    if (a === undefined || z === undefined) { err(s.id, `场的端点不是已知 Beat -> ${s.beats}`); continue; }
    if (a > z) err(s.id, '场的区间反了');
    if (!moments.has(s.moment)) err(s.id, `时刻引用不存在 -> ${s.moment}`);
    if (!ents.has(s.pov)) err(s.id, `视角不是已知主体 -> ${s.pov}`);
    for (const b of c.beats.slice(a, z + 1))
      if (b.moment !== null && b.moment !== s.moment)
        err(s.id, `场内混入了别的时刻：${b.id} 是 ${b.moment}，场是 ${s.moment}`);
    for (const b of s.povDrift ?? []) if (!idx.has(b)) err(s.id, `povDrift 指向不存在的 Beat -> ${b}`);
  }

  /* ── 时刻与时刻关系 ── */
  for (const m of c.moments) {
    if (!['point', 'interval'].includes(m.grain)) err(m.id, `未知粒度 -> ${m.grain}`);
    if (m.label && /前|后|之后|以前|当时|那时/.test(m.label))
      err(m.id, `label 里出现了相对时间词 -> ${m.label}。只许放绝对时间词，否则等于存了一条没锚点没来源的时间指示（规则 6）`);
  }
  for (const [i, r] of c.momentRelations.entries()) {
    const at = `momentRelations[${i}]`;
    if (!moments.has(r.subject)) err(at, `主语 ${r.subject} 不是已知时刻`);
    if (r.anchor && !moments.has(r.anchor.ref)) err(at, `锚点 ${r.anchor.ref} 不是已知时刻`);
    if (!MOMENT_PREDICATES.includes(r.predicate)) err(at, `未知谓词 ${r.predicate}`);
    if (!Number.isInteger(r.at) || r.at < 1 || r.at > N) err(at, `叙述位置 ${r.at} 越界`);
    checkSource(at, r.source);
    if (r.offset && !UNIT_MINUTES[r.offset.unit])
      warn(at, `单位「${r.offset.unit}」换算不了，这条关系只贡献先后，不贡献距离`);
    if (r.offset && !['before', 'after'].includes(r.predicate))
      err(at, `偏移只对早于、晚于有意义，这条是「${MOMENT_PREDICATE_ZH[r.predicate]}」`);
  }

  /* ── 跨半核对 ── */
  if (c.beats.length) {
    for (const b of c.beats)
      for (const s of b.sources)
        if (s.holder && !ents.has(s.holder))
          err(b.id, `Beat 上的持有者 ${s.holder} 在 chapter-01.json 的主体表里找不到`);
    for (const m of c.moments)
      if (!c.beats.some(b => b.moment === m.id) &&
          !c.disclosures.some(d => d.timeRef === m.id) &&
          !c.momentRelations.some(r => r.subject === m.id || r.anchor?.ref === m.id))
        warn(m.id, '这个时刻既没有 Beat 停在上面、也没有披露指向它、也不在任何关系里，是个孤儿');
  }

  /* ── 只提醒不报错 ── */
  for (const e of c.entities)
    if (!c.slots.some(s => s.subject.type === 'entity' && s.subject.id === e.id))
      warn(e.id, '主体身上一个槽都没有');
  for (const p of c.predicates)
    if (!c.slots.some(s => s.predicate === p.id)) warn(p.id, '谓词没有被任何槽用到');
  for (const k of c.kinds)
    if (!c.disclosures.some(d => d.value.t === 'kind' && d.value.id === k.id))
      warn(k.id, '类没有被任何披露挂到主体上');

  return out;
}

/** 度量口径：单个槽上的披露数。v2 的 D7 数的是事实数，v4 要数的是这个（见 W7）。 */
export function disclosureLoad(c: Chapter): Array<{ slot: ID; subject: string; n: number }> {
  const acc = new Map<ID, number>();
  for (const d of c.disclosures) if (d.slot) acc.set(d.slot, (acc.get(d.slot) ?? 0) + 1);
  const slots = new Map(c.slots.map(s => [s.id, s]));
  return [...acc.entries()]
    .map(([slot, n]) => {
      const s = slots.get(slot);
      const subj = s ? `${s.subject.type}:${s.subject.id}` : '?';
      return { slot, subject: subj, n };
    })
    .sort((a, b) => b.n - a.n);
}
